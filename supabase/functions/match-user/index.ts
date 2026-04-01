/**
 * Supabase Edge Function: match-user
 *
 * Called immediately after a user completes signup.
 * Invokes the match_user() DB function (security definer) to attempt
 * pairing with a waiting user in the same graduation year.
 *
 * POST /functions/v1/match-user
 * Authorization: Bearer <user-jwt>
 * Body: { "grad_year": number, "prompt": string | null }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the SERVICE_ROLE key (bypasses RLS for the
    // match_user function which is security definer anyway)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Also create a client scoped to the calling user to verify identity
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    // Verify the JWT and get the user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const gradYear: number = body.grad_year;
    const prompt: string | null = body.prompt ?? null;

    if (!gradYear || gradYear < 2024 || gradYear > 2040) {
      return new Response(JSON.stringify({ error: 'Invalid grad_year' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert the user's public profile (in case the trigger hasn't fired yet)
    const { error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        grad_year: gradYear,
        prompt,
        status: 'waiting',
      }, { onConflict: 'id', ignoreDuplicates: false });

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Attempt matching via DB function
    const { error: matchError } = await supabaseAdmin
      .rpc('match_user', { requesting_user_id: user.id });

    if (matchError) {
      console.error('Match error:', matchError);
      return new Response(JSON.stringify({ error: matchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return current status
    const { data: statusData } = await supabaseAdmin
      .from('users')
      .select('status, pair_id')
      .eq('id', user.id)
      .single();

    return new Response(JSON.stringify({ ok: true, ...statusData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
