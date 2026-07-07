/**
 * Identity filter unit tests. Run with:  npm run test:filter
 * No test framework needed — transpiles lib/identityFilter.ts with the
 * project's TypeScript and asserts a block/allow matrix.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'lib/identityFilter.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;

const tmp = mkdtempSync(join(tmpdir(), 'pennpal-filter-'));
const modPath = join(tmp, 'identityFilter.mjs');
writeFileSync(modPath, js);
const { filterMessage, detectCrisis } = await import(pathToFileURL(modPath).href);

// ── Test matrix ─────────────────────────────────────────────────────────────

const MUST_BLOCK = [
  // Phones
  'call me at 555-867-5309',
  'my number is (555) 867 5309',
  '5 5 5 8 6 7 5 3 0 9',
  '+1 555.867.5309',
  // Emails
  'reach me: someone@gmail.com',
  'someone [at] gmail [dot] com',
  // Social platforms / handles
  'add me on instagram',
  'my insta is cooluser',
  'snap me',
  'sc: whatever — my snapchat',
  'find me on tik tok',
  'i g : myhandle',
  'my discord tag',
  'whats app me',
  'follow @myhandle',
  'my ig is private but ill accept',
  // URLs
  'check https://example.com',
  'go to www.mysite.io',
  'its on linktr.ee wait no linktree.com',
  // Contact intent
  'text me later',
  'dm me on the other app',
  'hmu after class',
  'add me on the app',
  'hit me up sometime',
  // Meetups / location
  'come to my dorm tonight',
  'my room number is 314',
  'meet me at the quad',
  'i live in warwick hall',
  // Names
  'my dorm is warwick hall 3rd floor',
  'add my snap: coolstudent22',
  'call me tonight ok?',
  'my name is John Smith',
  "i'm called Jane Doe by everyone",
  'you can call me Mary Jones',
];

const MUST_ALLOW = [
  // The overblocking cases the old substring matcher failed on:
  'i instantly felt better after we talked',
  'i snapped at my roommate and feel awful',
  'that was an offbeat thing to say lol',
  'i want to reconnect with my family',
  'finals have me so stressed out',
  'my professor gave us 3 chapters, like 100 pages',
  'i scored 92 on the midterm!',
  'honestly today was rough but tomorrow might be better',
  'thank you for listening, it means a lot',
  'do you ever feel like everyone else has it figured out?',
  'i failed calc and i am scared to tell my parents',
  'my roommate never cleans and it is driving me crazy',
  'we should both get some sleep haha',
  'campus dining is terrible today',
  'i got into the nursing program!!',
  'been going to the gym at 6 am, proud of myself',
  'call me crazy but i think you handled that well',
  'call me old fashioned but i love the library',
];

const CRISIS_POSITIVE = [
  'i want to die',
  'i have been thinking about suicide',
  "i don't want to be alive anymore",
  'sometimes i think about hurting myself',
  'i feel like everyone would be better off dead without me wait i mean',
  'i keep self-harming',
];

const CRISIS_NEGATIVE = [
  'this exam is killing me lol',
  'i am dying of laughter',
  'my phone died',
  'so tired i could sleep forever',
];

// ── Run ─────────────────────────────────────────────────────────────────────

let failures = 0;

for (const msg of MUST_BLOCK) {
  const r = filterMessage(msg);
  if (!r.blocked) {
    console.error(`  FAIL (should block): "${msg}"`);
    failures++;
  }
}
for (const msg of MUST_ALLOW) {
  const r = filterMessage(msg);
  if (r.blocked) {
    console.error(`  FAIL (should allow): "${msg}" — ${r.reason}`);
    failures++;
  }
}
for (const msg of CRISIS_POSITIVE) {
  if (!detectCrisis(msg)) {
    console.error(`  FAIL (should detect crisis): "${msg}"`);
    failures++;
  }
}
for (const msg of CRISIS_NEGATIVE) {
  if (detectCrisis(msg)) {
    console.error(`  FAIL (false crisis positive): "${msg}"`);
    failures++;
  }
}

const total = MUST_BLOCK.length + MUST_ALLOW.length + CRISIS_POSITIVE.length + CRISIS_NEGATIVE.length;
if (failures === 0) {
  console.log(`identity filter: ${total}/${total} cases pass`);
} else {
  console.error(`identity filter: ${failures}/${total} cases FAILED`);
  process.exit(1);
}
