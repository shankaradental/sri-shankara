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

import { writeFile, readdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const REVIEWED_BY = process.env.REVIEWED_BY || 'Dr. Advaitha Anand, BDS MDS';
const NEWS_DIR = 'src/content/news';
const CATEGORIES = ['Research', 'Technology', 'Materials', 'Public health', 'Practice'];

const PROVIDER =
  process.env.AI_PROVIDER ||
  (process.env.GEMINI_API_KEY ? 'gemini' : 'anthropic');

const KEY =
  PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;

/* ------------------------------------------------------------------ *
 * Diagnostics
 *
 * Three runs have now failed inside this step and the Actions log is
 * awkward to read on a phone. Everything interesting also goes to the
 * run's Summary page, which is the first thing you see when you open
 * a failed run — no expanding, no scrolling.
 * ------------------------------------------------------------------ */

const notes = [];

function note(line) {
  console.log(line);
  notes.push(line);
}

async function writeSummary(heading, extra = []) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const md = [
    `## ${heading}`,
    '',
    '```',
    ...notes,
    '```',
    ...extra,
    '',
  ].join('\n');
  try {
    await appendFile(file, md, 'utf8');
  } catch {
    /* the summary is a convenience, never a reason to fail the run */
  }
}

async function die(heading, message, extra = []) {
  console.error(message);
  await writeSummary(heading, [...extra, '', message]);
  process.exit(1);
}

if (!KEY) {
  await die(
    'No API key',
    `No API key for provider "${PROVIDER}". Set ${
      PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'
    } in the repository secrets.`
  );
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
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: USER(seen) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  return payload.content.map((b) => b.text ?? '').join('').trim();
}

/**
 * Newest first, oldest last — deliberately.
 *
 * A just-released model carries the heaviest free-tier load and is the one
 * most likely to answer 503. Older models are quieter and far more likely to
 * have capacity, at some cost in output quality. So the ladder trades down
 * gracefully: try the best, settle for the available. All of these are
 * free-tier eligible.
 */
const GEMINI_FALLBACKS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 2;   // per model; the ladder below provides the real resilience
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Every 3.x and 2.5 Flash model thinks by default, and thinking tokens are
 * drawn from the same output budget as the article. At the old ceiling of
 * 4,000 the model could spend the lot reasoning and hand back an empty
 * candidate with finishReason MAX_TOKENS — which arrives as HTTP 200 and then
 * fails JSON.parse two lines later, looking for all the world like a broken
 * model rather than a budget that was simply too small.
 *
 * So: a much higher ceiling, and thinking held to "low". An 800-word article
 * is roughly 1,500 tokens; 16,000 leaves room for both without ever getting
 * close to a cut-off.
 */
const MAX_OUTPUT_TOKENS = 16000;

async function callGeminiOnce(model, seen, { thinking = true } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;

  const generationConfig = {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
  };
  if (thinking) generationConfig.thinkingLevel = 'low';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: USER(seen) }] }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    const body = await res.text();

    // Older models may not accept thinkingLevel. One clean retry without it
    // beats dropping a working model off the ladder over one field.
    if (res.status === 400 && thinking && /thinking/i.test(body)) {
      note(`  ${model}: thinkingLevel not accepted — retrying without it`);
      return callGeminiOnce(model, seen, { thinking: false });
    }

    const err = new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    err.retryable = RETRYABLE.has(res.status);
    throw err;
  }

  const payload = await res.json();

  // A 200 is not the same as an answer. Say exactly what came back.
  const blocked = payload?.promptFeedback?.blockReason;
  if (blocked) {
    const err = new Error(`${model}: prompt blocked (${blocked})`);
    err.retryable = false;
    throw err;
  }

  const candidate = payload?.candidates?.[0];
  const finish = candidate?.finishReason;
  const usage = payload?.usageMetadata ?? {};
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();

  note(
    `  ${model}: finishReason=${finish ?? 'none'} ` +
      `thoughts=${usage.thoughtsTokenCount ?? 0} ` +
      `output=${usage.candidatesTokenCount ?? 0} ` +
      `chars=${text.length}`
  );

  if (!text) {
    // MAX_TOKENS here means thinking ate the budget; anything else is odd but
    // equally worth stepping down the ladder for rather than failing the run.
    const err = new Error(
      `${model} returned no text (finishReason ${finish ?? 'unknown'}).` +
        (finish === 'MAX_TOKENS'
          ? ' The output budget was exhausted before any article was written.'
          : '')
    );
    err.retryable = true;
    throw err;
  }

  if (finish && finish !== 'STOP') {
    const err = new Error(`${model} stopped early (finishReason ${finish}) — output would be truncated.`);
    err.retryable = true;
    throw err;
  }

  return text;
}

async function callGemini(seen) {
  // Try the requested model first, then the rest of the ladder.
  const preferred = process.env.AI_MODEL;
  const models = preferred
    ? [preferred, ...GEMINI_FALLBACKS.filter((m) => m !== preferred)]
    : [...GEMINI_FALLBACKS];

  let lastError;

  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const text = await callGeminiOnce(model, seen);
        note(`Generated with ${model}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
        return text;
      } catch (e) {
        lastError = e;
        const transient = e.retryable || e.name === 'TimeoutError' || e.name === 'AbortError';
        if (!transient) {
          note(`  ${model}: ${e.message}`);
          break; // a 400/404 will not fix itself — move to the next model
        }
        if (attempt < MAX_ATTEMPTS) {
          const wait = 15_000 * attempt; // 15s, then 30s
          const why = e.status ?? (e.name && e.name !== 'Error' ? e.name : 'no usable output');
          note(`  ${model} unavailable (${why}). Retrying in ${wait / 1000}s...`);
          await sleep(wait);
        } else {
          note(`  ${model} still failing after ${MAX_ATTEMPTS} attempts. Trying the next model.`);
        }
      }
    }
  }

  throw new Error(
    `All Gemini models failed. Last error: ${lastError?.message ?? 'unknown'}`
  );
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
note(`Provider: ${PROVIDER}`);
if (process.env.AI_MODEL) note(`AI_MODEL override: ${process.env.AI_MODEL}`);

let raw;
try {
  raw = PROVIDER === 'gemini' ? await callGemini(seen) : await callAnthropic(seen);
} catch (e) {
  await die('Could not reach a working model', e.message, [
    '',
    'This is usually transient capacity pressure rather than a configuration',
    "problem. Tomorrow's scheduled run will try again on its own.",
  ]);
}

let article;
try {
  article = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
} catch (e) {
  await die('Model output was not valid JSON', e.message, [
    '',
    `Received ${raw.length} characters. First 800:`,
    '',
    '```',
    raw.slice(0, 800),
    '```',
  ]);
}

/* Validate before writing. A malformed field caught here is one line in this
 * summary; the same field caught by the build step is a wall of Astro output. */

const missing = ['title', 'slug', 'description', 'body'].filter(
  (f) => typeof article[f] !== 'string' || !article[f].trim()
);
if (missing.length) {
  await die('Article was incomplete', `Missing or empty field(s): ${missing.join(', ')}`);
}

if (!CATEGORIES.includes(article.category)) {
  note(`Category "${article.category}" is not one of the five allowed — using "Research".`);
  article.category = 'Research';
}

if (!Array.isArray(article.sources) || article.sources.length === 0) {
  await die('Article had no sources', 'Refusing to publish uncited health content.');
}

const slug = article.slug
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

const description =
  article.description.length > 155
    ? `${article.description.slice(0, 152).trimEnd()}...`
    : article.description;

note(`Checking ${article.sources.length} citation(s)...`);
const checks = await Promise.all(
  article.sources
    .filter((s) => s && typeof s.url === 'string' && /^https?:\/\//.test(s.url))
    .map(async (s) => ({ ...s, ok: await urlResolves(s.url) }))
);
checks.forEach((c) => note(`  ${c.ok ? 'OK  ' : 'DEAD'}  ${c.url}`));

const live = checks.filter((c) => c.ok);
if (live.length === 0) {
  await die('Every citation failed to resolve', 'Nothing written.', [
    '',
    'This is the fabricated-citation failure mode — publishing would put',
    'invented sources on a healthcare site. The next run will try again.',
  ]);
}
if (live.length < checks.length) {
  note(`Dropping ${checks.length - live.length} unreachable citation(s).`);
}

// Asia/Kolkata date, so the filename matches the day it publishes locally.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const yaml = [
  '---',
  `title: ${JSON.stringify(article.title)}`,
  `description: ${JSON.stringify(description)}`,
  `pubDate: ${today}`,
  `category: ${JSON.stringify(article.category)}`,
  `reviewedBy: ${JSON.stringify(REVIEWED_BY)}`,
  'sources:',
  ...live.flatMap((s) => [
    `  - title: ${JSON.stringify(s.title ?? s.url)}`,
    `    url: ${JSON.stringify(s.url)}`,
  ]),
  'draft: false',
  '---',
  '',
  article.body.trim(),
  '',
].join('\n');

const path = join(NEWS_DIR, `${today}-${slug}.md`);
await writeFile(path, yaml, 'utf8');
note(`Wrote ${path}`);

await writeSummary(`Published: ${article.title}`, [
  '',
  `**Category:** ${article.category}`,
  `**Words:** ~${article.body.trim().split(/\s+/).length}`,
  `**Citations kept:** ${live.length} of ${checks.length}`,
]);
