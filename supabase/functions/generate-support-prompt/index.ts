/**
 * Supabase Edge Function: generate-support-prompt
 *
 * AI-assisted support prompts — optional writing help, NOT therapy.
 *
 * POST /functions/v1/generate-support-prompt
 * Authorization: Bearer <user-jwt>
 * Body: { "mode": "encourage" | "question" | "gentler" | "direct" |
 *                 "accountability" | "here_for_you" | "graduation" | "custom",
 *         "context": string | null }   // optional short situation, <= 500 chars
 *
 * Behavior:
 *   - Requires an authenticated, registered user
 *   - Rate limited server-side (record_ai_usage RPC, 30/day)
 *   - Crisis language in context → returns crisis flag (client shows 988 resources)
 *   - Redacts obvious identifying info before any provider call
 *   - If no AI provider configured (AI_API_KEY unset) or ai_prompts_enabled is
 *     false → returns static template suggestions (fallback: true)
 *   - Never auto-sends; returns at most 3 editable suggestions
 *   - Logs usage counts only — never prompt content
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

// ── Static fallback templates (also used when the provider errors) ─────────
const TEMPLATES: Record<string, string[]> = {
  encourage: [
    "You've been carrying a lot and you're still showing up. That counts for more than you think.",
    "I know this week has been heavy. For what it's worth, I think you're handling it better than you're giving yourself credit for.",
    "One step at a time. You don't have to have it all figured out today.",
  ],
  question: [
    "What would make this week feel even a little bit lighter?",
    "What's the part of this that's weighing on you most?",
    "If it went well, what would that look like for you?",
  ],
  gentler: [
    "No pressure to reply right away — I just wanted you to know I'm thinking about you.",
    "That sounds really hard. I'm here whenever you feel like talking about it.",
    "Take whatever time you need. I'm not going anywhere.",
  ],
  direct: [
    "Honestly? I think you already know what you need to do. What's stopping you?",
    "Let's be real about this — what's the actual next step?",
    "You've been going back and forth on this for a while. What would help you decide?",
  ],
  accountability: [
    "How did the thing you mentioned last time go? No judgment either way.",
    "Want to set a small goal for this week? I'll check in on you.",
    "You said you wanted to get back on track — what's one thing you can do today?",
  ],
  here_for_you: [
    "I'm here for you. You don't have to go through this alone.",
    "Whatever happens, I'm in your corner.",
    "You can tell me the messy version. I'm not going anywhere.",
  ],
  graduation: [
    "We actually made it. Whatever happens next, I'm glad we walked this one together.",
    "Four years of exams, doubts, and small wins — and you were there for all of mine. Thank you.",
    "Before everything changes: talking to you got me through more than you know.",
  ],
  custom: [
    "I've been thinking about what you said, and I want you to know it mattered to me.",
    "I don't have the perfect words, but I'm here and I'm listening.",
    "Thanks for trusting me with that. How are you feeling about it today?",
  ],
};

const CRISIS_PATTERNS = [
  /\bkill(ing)? myself\b/i, /\bsuicid(e|al)\b/i, /\bend (my|it all|my own) life\b/i,
  /\bwant to die\b/i, /\bdon'?t want to (be alive|live|exist)\b/i,
  /\bno reason to live\b/i, /\bbetter off dead\b/i, /\bself[\s-]?harm/i,
  /\bhurt(ing)? myself\b/i, /\bkms\b/i,
];

function redact(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[redacted]')
    .replace(/(\+?1[\s.\-()]*)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g, '[redacted]')
    .replace(/(^|\s)@[a-zA-Z0-9_.]{3,}/g, '$1[redacted]')
    .replace(/https?:\/\/\S+/g, '[redacted]')
    .replace(/\b[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b/g, '[name redacted]');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Rate limit (30/day per user, enforced in SQL)
    const { data: allowed, error: rlError } = await supabaseAdmin.rpc('record_ai_usage', {
      p_user_id: user.id,
    });
    if (rlError) console.error('record_ai_usage error:', rlError.message);
    if (allowed === false) {
      return json({ error: 'rate_limited', message: "You've used all your AI suggestions for today." }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const mode: string = TEMPLATES[body.mode] ? body.mode : 'custom';
    const rawContext: string = typeof body.context === 'string' ? body.context.slice(0, 500) : '';

    // Crisis language → surface resources instead of pretending to counsel
    if (CRISIS_PATTERNS.some((p) => p.test(rawContext))) {
      return json({ crisis: true, suggestions: [], fallback: false });
    }

    // Global switch + provider availability
    const { data: cfg } = await supabaseAdmin
      .from('app_config')
      .select('value')
      .eq('key', 'ai_prompts_enabled')
      .maybeSingle();
    const aiEnabled = cfg?.value === true || cfg?.value === 'true';
    const apiKey = Deno.env.get('AI_API_KEY') ?? '';

    if (!aiEnabled || !apiKey) {
      return json({ suggestions: TEMPLATES[mode].slice(0, 3), fallback: true });
    }

    // ── Anthropic call (redacted context only, never full chat history) ────
    const { default: Anthropic } = await import('https://esm.sh/@anthropic-ai/sdk@0.39.0');
    const anthropic = new Anthropic({ apiKey });
    const model = Deno.env.get('AI_MODEL') ?? 'claude-opus-4-8';

    const MODE_INSTRUCTIONS: Record<string, string> = {
      encourage: 'encouraging and validating',
      question: 'a thoughtful, open question that invites them to share more',
      gentler: 'gentle and low-pressure',
      direct: 'kind but direct and honest',
      accountability: 'supportive accountability — a warm check-in on their goals',
      here_for_you: 'simple presence — letting them know they are not alone',
      graduation: 'a warm graduation farewell between anonymous pals about to reveal identities',
      custom: 'supportive and natural',
    };

    const context = redact(rawContext);
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system:
        'You help a college student write a short, supportive peer message to their anonymous ' +
        'peer-support partner. You are NOT a therapist and never give medical, legal, or crisis ' +
        'advice. Never include names, contact info, social handles, or identifying details. ' +
        'Write like a real student texting a friend: warm, plain, no corporate tone, no emoji spam. ' +
        'Each suggestion must be 1-3 sentences.',
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['suggestions'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: 'user',
          content:
            `Write exactly 3 alternative supportive messages. Tone: ${MODE_INSTRUCTIONS[mode]}.` +
            (context ? `\n\nSituation (redacted): ${context}` : '\n\nNo extra context provided.'),
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return json({ suggestions: TEMPLATES[mode].slice(0, 3), fallback: true });
    }

    let suggestions: string[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        try {
          const parsed = JSON.parse(block.text);
          if (Array.isArray(parsed.suggestions)) {
            suggestions = parsed.suggestions.filter((s: unknown) => typeof s === 'string').slice(0, 3);
          }
        } catch {
          // fall through to fallback below
        }
      }
    }

    if (suggestions.length === 0) {
      return json({ suggestions: TEMPLATES[mode].slice(0, 3), fallback: true });
    }

    // Usage count only — never prompt content
    await supabaseAdmin.from('analytics_events').insert({
      user_id: user.id,
      event: 'ai_prompt_generated',
      properties: { mode },
    });

    return json({ suggestions, fallback: false });
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
