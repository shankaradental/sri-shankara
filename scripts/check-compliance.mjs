/**
 * Blocks a build when site copy drifts outside what the DCI code allows.
 *
 * This runs in CI before anything is published. It is deliberately blunt —
 * a false positive costs you thirty seconds, a false negative costs a
 * regulatory problem.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOTS = ['src'];

/** Phrases that should never appear in published copy. */
const BANNED = [
  // "painless" is fine describing a symptom ("gum disease is often painless").
  // It is a claim when attached to what the clinic does.
  { re: /\b(completely|totally|100%)\s+painless\b/i, why: 'outcome claim' },
  { re: /\bpainless\s+(treatment|dentistry|procedure|extraction|root canal|implant|surgery)\b/i,
    why: 'outcome claim' },
  { re: /\bguarantee(d|s)?\b/i,             why: 'outcome guarantee' },
  { re: /\bbest (dentist|clinic|dental)\b/i, why: 'superiority claim' },
  { re: /\b(no\.?\s*1|number one)\b/i,      why: 'superiority claim' },
  { re: /\b(leading|foremost|top-rated|world[- ]class)\b/i, why: 'superiority claim' },
  { re: /\bmost experienced\b/i,            why: 'superiority claim' },
  { re: /\bpermanent(ly)? (cure|solution)\b/i, why: 'outcome claim' },
  { re: /\b100% (safe|success|painless)\b/i, why: 'outcome claim' },
  { re: /\b(limited (time|period|slots)|offer ends|book now and save|this week only)\b/i,
    why: 'inducement / urgency' },
  { re: /\b(discount|free) (consultation|check[- ]?up|cleaning)\b/i, why: 'inducement' },
  { re: /\b(testimonial|what our patients say|patient review)\b/i, why: 'testimonial' },
  { re: /\baggregateRating\b/,              why: 'review markup on own site' },
  { re: /★|⭐/,                              why: 'star rating' },
];

/** Files exempt because they exist to describe the rules themselves. */
const EXEMPT = [/check-compliance\.mjs$/, /generate-article\.mjs$/, /example-generated-article\.md$/];

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (['.astro', '.md', '.mdx', '.ts', '.js', '.mjs'].includes(extname(p))) yield p;
  }
}

const problems = [];

for (const root of ROOTS) {
  for await (const file of walk(root)) {
    if (EXEMPT.some((re) => re.test(file))) continue;
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (const { re, why } of BANNED) {
      lines.forEach((line, i) => {
        // Comments describe the rules; they are never published copy.
        if (/^\s*(\/\/|\/\*|\*|<!--|#)/.test(line)) return;
        if (re.test(line)) {
          problems.push(`${file}:${i + 1}  [${why}]  ${line.trim().slice(0, 110)}`);
        }
      });
    }
  }
}

// Every news article must carry at least one source.
for await (const file of walk('src/content/news')) {
  const text = await readFile(file, 'utf8');
  const fm = text.split('---')[1] ?? '';
  if (!/^sources:/m.test(fm) || !/url:/.test(fm)) {
    problems.push(`${file}:1  [missing citation]  news articles require a sources: entry`);
  }
}

if (problems.length) {
  console.error('\nCompliance check failed:\n');
  problems.forEach((p) => console.error('  ' + p));
  console.error(`\n${problems.length} issue(s). Fix them or, if a match is a false positive, adjust scripts/check-compliance.mjs.\n`);
  process.exit(1);
}

console.log('Compliance check passed.');
