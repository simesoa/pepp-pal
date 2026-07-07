/**
 * Supabase Edge Function: send-notification
 *
 * Processes pending notification_events and delivers them through the Expo
 * push service. Notifications are ENQUEUED by database functions (message
 * send, match creation, reveal, moderation) — this function only delivers.
 *
 * POST /functions/v1/send-notification
 * Authorization: Bearer <admin-user-jwt>   (admin manual trigger)
 *             or Bearer <service-role-key> (cron / server-side trigger)
 *
 * Recommended setup: a Supabase Cron job every minute:
 *   select cron.schedule('deliver-push', '* * * * *', $$
 *     select net.http_post(
 *       url    := '<project-url>/functions/v1/send-notification',
 *       headers:= jsonb_build_object('Authorization', 'Bearer <service-role-key>',
 *                                    'Content-Type', 'application/json'),
 *       body   := '{}'::jsonb
 *     );
 *   $$);
 *
 * Delivery rules:
 *   - Respects quiet hours (events stay pending until the window ends)
 *   - Skips users with no active tokens (marked 'skipped')
 *   - Deactivates tokens Expo reports as DeviceNotRegistered
 *   - Payloads contain titles/bodies written by the DB layer — never private
 *     message text
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface PendingEvent {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

function inQuietHours(prefs: { quiet_hours_enabled: boolean; quiet_hours_start: string | null; quiet_hours_end: string | null } | null): boolean {
  if (!prefs?.quiet_hours_enabled || !prefs.quiet_hours_start || !prefs.quiet_hours_end) {
    return false;
  }
  // Times are interpreted in UTC (client stores them as such).
  const now = new Date();
  const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const start = prefs.quiet_hours_start.slice(0, 5);
  const end = prefs.quiet_hours_end.slice(0, 5);
  // Window may wrap midnight (e.g. 22:00 → 07:00)
  return start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey,
      { auth: { persistSession: false } },
    );

    // Authorize: service-role key (cron) OR an admin user's JWT
    let authorized = token === serviceKey && serviceKey.length > 0;
    if (!authorized && token) {
      const supabaseUser = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (user) {
        const { data: profile } = await supabaseAdmin
          .from('users')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();
        authorized = profile?.is_admin === true;
      }
    }
    if (!authorized) return json({ error: 'Unauthorized' }, 401);

    // 1. Claim a batch of pending events
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('notification_events')
      .select('id, user_id, type, title, body, data')
      .eq('delivery_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (eventsError) return json({ error: eventsError.message }, 500);
    if (!events || events.length === 0) return json({ ok: true, processed: 0 });

    const userIds = [...new Set(events.map((e: PendingEvent) => e.user_id))];

    // 2. Load tokens + preferences for the affected users
    const { data: tokens } = await supabaseAdmin
      .from('push_tokens')
      .select('user_id, token')
      .eq('is_active', true)
      .in('user_id', userIds);
    const { data: prefsRows } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds);

    const tokensByUser = new Map<string, string[]>();
    for (const t of tokens ?? []) {
      tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t.token]);
    }
    const prefsByUser = new Map(
      (prefsRows ?? []).map((p) => [p.user_id, p]),
    );

    // 3. Build Expo push messages
    const toSend: { eventId: string; messages: { to: string; title: string; body: string; data: Record<string, unknown> }[] }[] = [];
    const skipped: string[] = [];
    const deferred: string[] = [];

    for (const event of events as PendingEvent[]) {
      if (inQuietHours(prefsByUser.get(event.user_id) ?? null)) {
        deferred.push(event.id); // stays pending; retried after the window
        continue;
      }
      const userTokens = tokensByUser.get(event.user_id) ?? [];
      if (userTokens.length === 0) {
        skipped.push(event.id); // web-only user — no push targets
        continue;
      }
      toSend.push({
        eventId: event.id,
        messages: userTokens.map((to) => ({
          to,
          title: event.title,
          body: event.body,
          data: { ...event.data, type: event.type },
        })),
      });
    }

    if (skipped.length > 0) {
      await supabaseAdmin
        .from('notification_events')
        .update({ delivery_status: 'skipped', provider_response: { reason: 'no_active_tokens' } })
        .in('id', skipped);
    }

    // 4. Deliver through Expo (batches of up to 100 messages)
    let sent = 0;
    let failed = 0;
    const allMessages = toSend.flatMap((x) => x.messages.map((m) => ({ ...m, _eventId: x.eventId })));
    const deadTokens: string[] = [];

    for (let i = 0; i < allMessages.length; i += 100) {
      const batch = allMessages.slice(i, i + 100);
      try {
        const resp = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(batch.map(({ _eventId: _, ...m }) => m)),
        });
        const result = await resp.json();
        const tickets: { status: string; message?: string; details?: { error?: string } }[] =
          result.data ?? [];

        for (let j = 0; j < batch.length; j++) {
          const ticket = tickets[j];
          const eventId = batch[j]._eventId;
          const ok = ticket?.status === 'ok';
          if (ok) sent++;
          else {
            failed++;
            if (ticket?.details?.error === 'DeviceNotRegistered') {
              deadTokens.push(batch[j].to);
            }
          }
          await supabaseAdmin
            .from('notification_events')
            .update({
              delivery_status: ok ? 'sent' : 'failed',
              delivered_at: ok ? new Date().toISOString() : null,
              provider_response: ticket ?? { error: 'no ticket returned' },
            })
            .eq('id', eventId);
        }
      } catch (err) {
        // Expo unreachable: mark the batch failed; enqueuing side is unaffected
        failed += batch.length;
        const ids = [...new Set(batch.map((b) => b._eventId))];
        await supabaseAdmin
          .from('notification_events')
          .update({
            delivery_status: 'failed',
            provider_response: { error: String(err) },
          })
          .in('id', ids);
      }
    }

    if (deadTokens.length > 0) {
      await supabaseAdmin
        .from('push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('token', deadTokens);
    }

    return json({ ok: true, processed: events.length, sent, failed, skipped: skipped.length, deferred: deferred.length });
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
