/**
 * Generates one dental-news article and writes it into src/content/news/.
 *
 * Runs inside GitHub Actions — there is no server to keep awake. The workflow
 * commits whatever this writes, and Cloudflare Pages rebuilds on the push.
 *
 * Env:
 *   ANTHROPIC_API_KEY  required
 *   ANTHROPIC_MODEL    optional, defaults below — check the current model id
 *   REVIEWED_BY        e.g. "Dr A Sharma, BDS MDS"
 */

import { writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const REVIEWED_BY = process.env.REVIEWED_BY || 'Dr PLACEHOLDER, BDS';
const NEWS_DIR = 'src/content/news';

if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

/** Titles already published, so the model does not repeat itself. */
async function recentTitles(limit = 40) {
  const files = (await readdir(NEWS_DIR)).filter((f) => f.endsWith('.md')).sort().reverse();
  return files.slice(0, limit).map((f) => f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''));
}

const SYSTEM = `You write short news articles about dentistry for the website of a
dental clinic in Dehradun, India. Your readers are patients, not clinicians.

HOUSE RULES — every one is mandatory:
- 500-800 words.
- Report what research or a development actually found. Never overstate it.
- Plain language. Explain any technical term the first time it appears.
- Cite at least one real, verifiable primary source (journal article, university
  or institutional announcement, regulator). Never invent a citation or a URL.
  If you cannot cite something real, say so instead of fabricating.
- Never imply the clinic offers the technique described.
- Never guarantee or promise an outcome.
- No testimonials, patient stories, or quotes attributed to patients.
- No superlatives about any practitioner, clinic or product ("best", "leading",
  "revolutionary", "painless", "world-class").
- No promotional or time-limited offers.
- Close with a short, general "what this means for patients" section.

These rules exist because clause 8.1.7 of the Dentists (Code of Ethics)
Regulations 2014 restricts lay-audience commentary on dental procedures to
material supported by evidence-based studies.

Output STRICT JSON only, no markdown fence, matching:
{
  "title": string,
  "slug": string (kebab-case, no date),
  "description": string (<=155 chars),
  "category": "Research" | "Technology" | "Materials" | "Public health" | "Practice",
  "body": string (markdown, ## subheadings, no H1),
  "sources": [{ "title": string, "url": string }]
}`;

const seen = await recentTitles();

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `Write today's article. Pick a genuinely recent development in dentistry — ` +
          `materials science, imaging, caries prevention, periodontal research, ` +
          `oral-systemic health links, public health, or practice technology.\n\n` +
          `Do NOT repeat any of these recent topics:\n${seen.join('\n')}`,
      },
    ],
  }),
});

if (!res.ok) {
  console.error(`Anthropic API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const payload = await res.json();
const raw = payload.content.map((b) => b.text ?? '').join('').trim();

let article;
try {
  article = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
} catch {
  console.error('Model did not return valid JSON:\n', raw.slice(0, 800));
  process.exit(1);
}

// Asia/Kolkata date, so the filename matches the day it publishes locally.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const yaml = [
  '---',
  `title: ${JSON.stringify(article.title)}`,
  `description: ${JSON.stringify(article.description)}`,
  `pubDate: ${today}`,
  `category: ${JSON.stringify(article.category)}`,
  `reviewedBy: ${JSON.stringify(REVIEWED_BY)}`,
  'sources:',
  ...article.sources.flatMap((s) => [
    `  - title: ${JSON.stringify(s.title)}`,
    `    url: ${JSON.stringify(s.url)}`,
  ]),
  'draft: false',
  '---',
  '',
  article.body.trim(),
  '',
].join('\n');

const path = join(NEWS_DIR, `${today}-${article.slug}.md`);
await writeFile(path, yaml, 'utf8');
console.log(`Wrote ${path}`);
