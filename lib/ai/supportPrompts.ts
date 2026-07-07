/**
 * AI-assisted support prompts — optional writing help, never therapy and
 * never auto-sent. The user always edits/approves before sending.
 *
 * Provider abstraction: real AI calls go through the generate-support-prompt
 * Edge Function (which holds the API key server-side). When the function is
 * unavailable, not deployed, or AI is disabled, the static templates below
 * are used — the UI works identically either way.
 */
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

export interface SupportPromptMode {
  key: string;
  label: string;
}

export const SUPPORT_PROMPT_MODES: SupportPromptMode[] = [
  { key: 'encourage', label: 'Encourage them' },
  { key: 'question', label: 'Ask a question' },
  { key: 'gentler', label: 'Be gentler' },
  { key: 'direct', label: 'Be more direct' },
  { key: 'accountability', label: 'Help with accountability' },
  { key: 'here_for_you', label: "Say I'm here for them" },
  { key: 'graduation', label: 'Graduation message' },
  { key: 'custom', label: 'Just help me respond' },
];

export const AI_DISCLAIMER =
  'AI suggestions can help you write a supportive message, but they are not ' +
  'therapy, crisis counseling, or professional advice.';

// Static fallback templates (mirror the Edge Function's copy)
const STATIC_TEMPLATES: Record<string, string[]> = {
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

export interface SuggestionResult {
  suggestions: string[];
  /** true when static templates were used instead of an AI provider */
  fallback: boolean;
  /** true when crisis language was detected — show crisis resources */
  crisis: boolean;
  /** set when the daily limit was hit */
  rateLimited: boolean;
}

/**
 * Get up to 3 suggestions. context is an optional short description of the
 * situation (or a recent partner message the user selected) — it is redacted
 * server-side before any provider call.
 */
export async function getSupportSuggestions(
  mode: string,
  context: string | null,
): Promise<SuggestionResult> {
  track('ai_prompt_opened', { mode });

  try {
    const { data, error } = await supabase.functions.invoke('generate-support-prompt', {
      body: { mode, context: context?.slice(0, 500) ?? null },
    });

    if (!error && data) {
      if (data.crisis) {
        return { suggestions: [], fallback: false, crisis: true, rateLimited: false };
      }
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        track(data.fallback ? 'ai_fallback_used' : 'ai_prompt_generated', { mode });
        return {
          suggestions: data.suggestions.slice(0, 3),
          fallback: Boolean(data.fallback),
          crisis: false,
          rateLimited: false,
        };
      }
    }

    // Rate limit surfaced as a FunctionsHttpError with a 429 body
    const message = error?.message ?? '';
    if (/429|rate.?limit/i.test(message)) {
      return { suggestions: [], fallback: false, crisis: false, rateLimited: true };
    }
  } catch {
    // fall through to static templates
  }

  // Edge Function unreachable / not deployed → static fallback, same UX
  track('ai_fallback_used', { mode });
  const templates = STATIC_TEMPLATES[mode] ?? STATIC_TEMPLATES.custom;
  return { suggestions: [...templates], fallback: true, crisis: false, rateLimited: false };
}
