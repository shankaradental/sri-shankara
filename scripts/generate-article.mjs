/**
 * Generates one dental-news article and writes it into src/content/news/.
 *
 * Runs inside GitHub Actions — there is no server to keep awake. The workflow
 * commits whatever this writes, and Cloudflare Pages rebuilds on the push.
 *
 * Works with either provider:
 *   AI_PROVIDER=gemini     free tier, no credit card   (default if only GEMINI_API_KEY is set)
 *   AI_PROVIDER=anthropic  paid, a few cents per run
 *
 * Env:
 *   GEMINI_API_KEY  /  ANTHROPIC_API_KEY   one of these, required
 *   AI_MODEL        optional model override
 *   REVIEWED_BY     e.g. "Dr. Advaitha Anand, BDS MDS (Conservative Dentistry & Endodontics)"
 */

import { writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const REVIEWED_BY = process.env.REVIEWED_BY || 'Dr. Advaitha Anand, BDS MDS';
const NEWS_DIR = 'src/content/news';

const PROVIDER =
  process.env.AI_PROVIDER ||
  (process.env.GEMINI_API_KEY ? 'gemini' : 'anthropic');

const KEY =
  PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;

if (!KEY) {
  console.error(
    `No API key for provider "${PROVIDER}". Set ${
      PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'
    }.`
  );
  process.exit(1);
}

/** Titles already published, so the model does not repeat itself. */
async function recentTitles(limit = 40) {
  const files = (await readdir(NEWS_DIR)).filter((f) => f.endsWith('.md')).sort().reverse();
  return files.slice(0, limit).map((f) => f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''));
}

const SYSTEM = `You write short news articles about dentistry for the website of a
dental clinic in Dehradun, India. Your readers are patients, not clinicians.

CITATIONS — the rule that matters most:
Every article must cite at least one REAL, VERIFIABLE source: a journal article,
a university or institutional announcement, or a regulator. The URL must be one
you are confident actually exists and actually says what you claim.

NEVER invent a citation, a DOI, a journal volume, or a URL. A fabricated source
on a healthcare website is worse than no article at all — it is exactly what
clause 8.1.7 of the Dentists (Code of Ethics) Regulations 2014 exists to
prevent. Every URL you output is fetched and checked before publication, and
the run fails if one 404s.

If you are not confident a source is real, write about something else you can
cite properly. Prefer well-established landing pages (a journal's DOI link, a
university news page) over deep links you are less sure of.

HOUSE RULES — every one is mandatory:
- 500-800 words.
- Report what research actually found. Never overstate it.
- Plain language. Explain any technical term the first time it appears.
- Include the genuine limitations and trade-offs, not just the positive finding.
- Never imply the clinic offers the technique described.
- Never guarantee or promise an outcome.
- No testimonials, patient stories, or quotes attributed to patients.
- No superlatives about any practitioner, clinic or product ("best", "leading",
  "revolutionary", "painless", "world-class").
- No promotional or time-limited offers.
- Close with a short, general "what this means for patients" section.

Output STRICT JSON only, no markdown fence, matching:
{
  "title": string,
  "slug": string (kebab-case, no date),
  "description": string (<=155 chars),
  "category": "Research" | "Technology" | "Materials" | "Public health" | "Practice",
  "body": string (markdown, ## subheadings, no H1),
  "sources": [{ "title": string, "url": string }]
}`;

const USER = (seen) =>
  `Write today's article. Pick a genuinely recent development in dentistry — ` +
  `materials science, imaging, caries prevention, periodontal research, ` +
  `oral-systemic health links, public health, or practice technology.\n\n` +
  `Do NOT repeat any of these recent topics:\n${seen.join('\n')}`;

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

async function callAnthropic(seen) {
  const model = process.env.AI_MODEL || 'claude-sonnet-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: USER(seen) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  return payload.content.map((b) => b.text ?? '').join('').trim();
}

async function callGemini(seen) {
  const model = process.env.AI_MODEL || 'gemini-3.7-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: USER(seen) }] }],
      generationConfig: { maxOutputTokens: 4000, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('').trim();
}

/* ------------------------------------------------------------------ *
 * Citation verification — the step that makes automation safe enough
 * ------------------------------------------------------------------ */

async function urlResolves(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SriShankaraDentalBot/1.0)' },
      });
      // 403/405 usually means a bot wall, not a dead link — the page exists.
      if (res.ok || res.status === 403 || res.status === 405) return true;
      if (res.status === 404 || res.status === 410) return false;
    } catch {
      /* try the next method */
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const seen = await recentTitles();
console.log(`Provider: ${PROVIDER}`);

let raw;
try {
  raw = PROVIDER === 'gemini' ? await callGemini(seen) : await callAnthropic(seen);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let article;
try {
  article = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
} catch {
  console.error('Model did not return valid JSON:\n', raw.slice(0, 800));
  process.exit(1);
}

if (!Array.isArray(article.sources) || article.sources.length === 0) {
  console.error('Article has no sources. Refusing to publish.');
  process.exit(1);
}

console.log(`Checking ${article.sources.length} citation(s)...`);
const checks = await Promise.all(
  article.sources.map(async (s) => ({ ...s, ok: await urlResolves(s.url) }))
);
checks.forEach((c) => console.log(`  ${c.ok ? 'OK  ' : 'DEAD'}  ${c.url}`));

const live = checks.filter((c) => c.ok);
if (live.length === 0) {
  console.error(
    '\nEvery cited URL failed to resolve. This is the fabricated-citation failure\n' +
      'mode — publishing would put invented sources on a healthcare site.\n' +
      'Nothing written. The next scheduled run will try again.'
  );
  process.exit(1);
}
if (live.length < checks.length) {
  console.log(`Dropping ${checks.length - live.length} unreachable citation(s).`);
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
  ...live.flatMap((s) => [
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
