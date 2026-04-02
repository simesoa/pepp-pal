/**
 * Starter prompts – shown in empty chat and as a gentle silence nudge.
 * Kept calm, thoughtful, and non-prescriptive.
 */

export interface StarterPrompt {
  id: string;
  text: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  { id: 'p1',  text: 'What has been the hardest part of this week?' },
  { id: 'p2',  text: 'What are you carrying right now that people don't see?' },
  { id: 'p3',  text: 'What are you hoping changes this semester?' },
  { id: 'p4',  text: 'What's one thing you've been putting off dealing with?' },
  { id: 'p5',  text: 'What does a good day look like for you right now?' },
  { id: 'p6',  text: 'Is there something you wish someone would ask you about?' },
  { id: 'p7',  text: 'What's been on your mind lately that you haven't said out loud?' },
  { id: 'p8',  text: 'What are you looking forward to, even a little?' },
  { id: 'p9',  text: 'How are you really doing?' },
  { id: 'p10', text: 'What's something you've learned about yourself this semester?' },
];

/** Pick n unique prompts at random, seeded by a stable key so they don't shuffle on re-render */
export function pickPrompts(n: number, seed: string): StarterPrompt[] {
  // Deterministic shuffle using seed string
  const sorted = [...STARTER_PROMPTS].sort((a, b) => {
    const ha = simpleHash(seed + a.id);
    const hb = simpleHash(seed + b.id);
    return ha - hb;
  });
  return sorted.slice(0, n);
}

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

/** How many minutes of silence before showing a nudge prompt */
export const SILENCE_NUDGE_MINUTES = 5;
