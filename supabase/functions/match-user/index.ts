/**
 * Supabase Edge Function: match-user (v2 — native registration path)
 *
 * Shares the exact registration/matching contract with the web RPC path:
 * both call the register_user_and_match() SQL function (migration 006), so
 * RPC and Edge Function produce identical user/match state.
 *
 * POST /functions/v1/match-user
 * Authorization: Bearer <user-jwt>
 * Body: { "grad_year": number, "prompt": string | null }
 *
 * Response: {
 *   result: "registered" | "waiting" | "matched" | "banned" |
 *           "unsupported_school" | "needs_profile",
 *   status: "waiting" | "matched" | null,
 *   pair_id: string | null,
 *   school_name: string | null
 * }
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the calling user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const gradYear: number = body.grad_year;
    const prompt: string | null = typeof body.prompt === 'string' ? body.prompt : null;

    if (!gradYear || gradYear < 2024 || gradYear > 2040) {
      return json({ result: 'needs_profile', error: 'Invalid grad_year' }, 400);
    }

    // Shared contract: same SQL function the web register_and_match RPC wraps
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabaseAdmin.rpc('register_user_and_match', {
      p_user_id: user.id,
      p_grad_year: gradYear,
      p_prompt: prompt,
    });

    if (error) {
      console.error('register_user_and_match error:', error.message);
      return json({ error: 'Registration failed. Please try again.' }, 500);
    }

    return json(data);
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
