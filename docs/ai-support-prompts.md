# AI-Assisted Support Prompts

Optional writing help in chat ("Help me respond"). **Not therapy** — every
surface repeats the disclaimer, crisis language routes to 988 resources, and
suggestions are never auto-sent (the user edits before sending).

## Architecture

```
Chat ✎ button → AiSuggestModal (pick a tone)
  └─ lib/ai/supportPrompts.ts → generate-support-prompt Edge Function
       ├─ JWT verify + record_ai_usage() rate limit (30/day/user)
       ├─ crisis regex on context → {crisis: true} → client opens 988 modal
       ├─ redaction (emails/phones/@handles/URLs/names → [redacted])
       ├─ app_config.ai_prompts_enabled + AI_API_KEY present?
       │    ├─ yes → Anthropic Messages API (structured output, ≤3 suggestions)
       │    └─ no  → static templates (fallback: true)
       └─ usage COUNT logged to analytics — never prompt content
```

If the Edge Function itself is unreachable (not deployed, offline), the
client falls back to the same static templates locally — the feature always
works.

## Configuration

| Where | Key | Effect |
|---|---|---|
| Admin → System | `ai_prompts_enabled` | Global switch (default **off** → static templates) |
| Edge Function secret | `AI_API_KEY` | Anthropic API key. Missing → static templates |
| Edge Function secret | `AI_MODEL` | Default `claude-opus-4-8` |
| Client env (optional) | `EXPO_PUBLIC_AI_FEATURES_ENABLED` | UI copy flag only — the server decides real availability |

```bash
supabase functions deploy generate-support-prompt --project-ref <ref>
supabase secrets set AI_API_KEY=sk-ant-... --project-ref <ref>
# then Admin → System → toggle "AI support prompts" ON
```

To disable AI entirely: toggle off in Admin → System (or never set
`AI_API_KEY`). Static templates keep serving.

## Privacy & safety guarantees

- Only the selected tone + an optional ≤500-char situation (or the partner's
  latest message) is sent — never full chat history.
- Identifying info is redacted server-side before any provider call.
- Crisis/medical/legal content is refused: crisis language returns the 988
  resources instead of suggestions; the model system prompt forbids advice.
- Analytics record counts (`ai_prompt_opened/generated`,
  `ai_suggestion_inserted`, `ai_fallback_used`) — never text.
- Server-side rate limit: 30 generations per user per day (`abuse_events`).

## Modes / templates

Encourage · Ask a question · Be gentler · Be more direct · Accountability ·
"I'm here for you" · Graduation message · Custom. Static template copy lives
in `lib/ai/supportPrompts.ts` (client) and the Edge Function (server) — keep
them in sync when editing.

Note: faith-based encouragement is deliberately not offered as a mode until
a both-users-opted-in preference exists.
