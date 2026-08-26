/**
 * Generates one dental-news article and writes it into src/content/news/.
 *
 * Runs inside GitHub Actions — there is no server to keep awake. The workflow
 * commits whatever this writes, and Cloudflare Pages rebuilds on the push.
 *
 * HOW THE CITATION PROBLEM IS SOLVED
 * ----------------------------------
 * The first article this job produced cited DOI 10.3389/fpubh.2023.1197060.
 * It looked entirely plausible. It does not exist — CrossRef has no record of
 * it. That is not a bug in the model, it is what language models do: they
 * reconstruct the shape of a citation from memory rather than recalling one.
 * No amount of prompting reliably fixes it.
 *
 * So the model is no longer asked for sources at all. This script searches
 * Europe PMC (free, no key, no registration) for real dentistry papers
 * published in the last few weeks, hands the model their titles and abstracts,
 * and asks it to write about ONE of them. The citation in the finished article
 * is built from Europe PMC's own metadata.
 *
 * The model never types a URL. There is nothing left for it to invent.
 *
 * Providers:
 *   AI_PROVIDER=gemini     free tier, no credit card   (default if only GEMINI_API_KEY is set)
 *   AI_PROVIDER=anthropic  paid, a few cents per run
 *
 * Env:
 *   GEMINI_API_KEY  /  ANTHROPIC_API_KEY   one of these, required
 *   AI_MODEL        optional model override
 *   REVIEWED_BY     e.g. "Dr. Advaitha Anand, BDS MDS (Conservative Dentistry & Endodontics)"
 */

import { writeFile, readdir, readFile, appendFile } from 'node:fs/promises';
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
 * Everything interesting goes to the run's Summary page as well as the log.
 * The Summary is the first thing you see when you open a failed run — no
 * expanding steps, no scrolling, and it is readable on a phone.
 * ------------------------------------------------------------------ */

const notes = [];

function note(line) {
  console.log(line);
  notes.push(line);
}

async function writeSummary(heading, extra = []) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const md = ['', `## ${heading}`, '', '```', ...notes, '```', ...extra, ''].join('\n');
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

/* ------------------------------------------------------------------ *
 * What has already been published
 * ------------------------------------------------------------------ */

async function published() {
  const files = (await readdir(NEWS_DIR)).filter((f) => f.endsWith('.md'));
  const titles = [];
  const urls = new Set();
  for (const f of files) {
    const text = await readFile(join(NEWS_DIR, f), 'utf8');
    const t = text.match(/^title:\s*"?(.+?)"?\s*$/m);
    if (t) titles.push(t[1]);
    for (const m of text.matchAll(/^\s*url:\s*"?(\S+?)"?\s*$/gm)) urls.add(m[1].toLowerCase());
  }
  return { titles, urls };
}

/* ------------------------------------------------------------------ *
 * Europe PMC — the source of real papers
 * ------------------------------------------------------------------ */

const TOPICS = [
  'dental', 'dentistry', 'caries', 'periodontal', 'periodontitis',
  'enamel', 'oral health', 'endodontic', 'root canal', 'orthodontic',
  'dental implant', 'toothpaste', 'fluoride', 'gingivitis', 'dentine',
];

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function searchEuropePMC(windowDays) {
  const titleClause = TOPICS.map((t) => `TITLE:"${t}"`).join(' OR ');
  // SRC:MED restricts this to PubMed/MEDLINE — peer-reviewed literature only.
  // Europe PMC also indexes preprints (SRC:PPR), which have not been reviewed
  // by anyone. Fine for a research blog, not for a clinic telling patients what
  // the evidence says.
  const query =
    `(${titleClause}) AND (FIRST_PDATE:[${daysAgo(windowDays)} TO ${daysAgo(0)}]) ` +
    `AND HAS_ABSTRACT:Y AND SRC:MED`;

  const params = new URLSearchParams({
    query,
    format: 'json',
    pageSize: '50',
    resultType: 'core',
    sort: 'P_PDATE_D desc',
  });

  const res = await fetch(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`,
    { signal: AbortSignal.timeout(45_000), headers: { accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Europe PMC ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const payload = await res.json();
  return payload?.resultList?.result ?? [];
}

/** Widen the window until there is something worth writing about. */
async function findCandidates(seenUrls, seenTitles) {
  for (const windowDays of [30, 90, 240, 730]) {
    let results;
    try {
      results = await searchEuropePMC(windowDays);
    } catch (e) {
      note(`Europe PMC search failed (${windowDays}d window): ${e.message}`);
      continue;
    }

    const usable = results.filter((r) => {
      if (!r.abstractText || r.abstractText.length < 400) return false;
      if (!r.title) return false;
      const doiUrl = r.doi ? `https://doi.org/${r.doi}`.toLowerCase() : null;
      if (doiUrl && seenUrls.has(doiUrl)) return false;
      // crude near-duplicate check against titles already on the site
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      return !seenTitles.some((t) => norm(t) === norm(r.title));
    });

    note(`Europe PMC: ${results.length} hits in the last ${windowDays} days, ${usable.length} usable.`);
    if (usable.length >= 3) return usable.slice(0, 12);
  }
  return [];
}

/** Public, permanent link for a paper. DOI when there is one, Europe PMC otherwise. */
function citationUrl(paper) {
  if (paper.doi) return `https://doi.org/${paper.doi}`;
  return `https://europepmc.org/article/${paper.source ?? 'MED'}/${paper.id}`;
}

function citationTitle(paper) {
  const bits = [];
  if (paper.authorString) bits.push(paper.authorString.replace(/\.$/, ''));
  bits.push(paper.title.replace(/\.$/, ''));
  const where = [paper.journalTitle, paper.pubYear].filter(Boolean).join(' ');
  if (where) bits.push(where);
  if (paper.doi) bits.push(`DOI ${paper.doi}`);
  return bits.join('. ');
}

/* ------------------------------------------------------------------ *
 * Prompts
 * ------------------------------------------------------------------ */

const SYSTEM = `You write short news articles about dentistry for the website of a
dental clinic in Dehradun, India. Your readers are patients, not clinicians.

You will be given a numbered list of REAL, recently published papers, each with
its abstract. Choose ONE and write an article about it.

THE RULE THAT MATTERS MOST:
Every factual claim in your article must come from the abstract you were given.
Do not add findings, figures, sample sizes, dates or conclusions that are not in
it. Do not cite anything. Do not write any URL, DOI or reference list — the
citation is attached automatically from the paper's own record, and anything you
invent would be a fabricated source on a healthcare website.

If an abstract is too thin to write 500 words about honestly, pick a different
one from the list. Prefer papers a patient would find useful or interesting over
narrowly technical ones.

HOUSE RULES — every one is mandatory:
- 500-800 words.
- Report what the research actually found. Never overstate it.
- Plain language. Explain any technical term the first time it appears.
- State the genuine limitations: study size, whether it was in people or in a
  laboratory, whether it shows cause or only association.
- Never imply the clinic offers the technique described.
- Never guarantee or promise an outcome.
- No testimonials, patient stories, or quotes attributed to patients.
- No superlatives about any practitioner, clinic or product ("best", "leading",
  "revolutionary", "painless", "world-class").
- No promotional or time-limited offers.
- Close with a short, general "what this means for patients" section.

Output STRICT JSON only, no markdown fence, matching:
{
  "sourceIndex": number (the number of the paper you chose, from the list),
  "title": string (your headline — not the paper's title),
  "slug": string (kebab-case, no date),
  "description": string (<=155 chars),
  "category": "Research" | "Technology" | "Materials" | "Public health" | "Practice",
  "body": string (markdown, ## subheadings, no H1, no reference list)
}`;

const USER = (papers, seenTitles) =>
  `Today's candidate papers:\n\n` +
  papers
    .map((p, i) =>
      [
        `[${i}] ${p.title}`,
        `    ${p.journalTitle ?? 'Preprint'}, ${p.firstPublicationDate ?? p.pubYear ?? ''}`,
        `    Abstract: ${p.abstractText.replace(/\s+/g, ' ').slice(0, 1800)}`,
      ].join('\n')
    )
    .join('\n\n') +
  (seenTitles.length
    ? `\n\nArticles already on the site — do not cover the same ground:\n${seenTitles.join('\n')}`
    : '');

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

const MAX_OUTPUT_TOKENS = 16000;

async function callAnthropic(user) {
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
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const payload = await res.json();
  return payload.content.map((b) => b.text ?? '').join('').trim();
}

/**
 * Newest first, oldest last — deliberately.
 *
 * A just-released model carries the heaviest free-tier load and is the one most
 * likely to answer 503; run 4 saw exactly that on gemini-3.7-flash before
 * 3.6-flash picked it up. Older models are quieter and far more likely to have
 * capacity, at some cost in output quality. All of these are free-tier eligible.
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
const MAX_ATTEMPTS = 2;   // per model; the ladder provides the real resilience
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGeminiOnce(model, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      // These models think by default and thinking tokens come out of this same
      // budget. Run 4 spent 2,356 on thinking and 956 on the article — which
      // would have been a truncated mess under the old 4,000 ceiling.
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    err.retryable = RETRYABLE.has(res.status);
    throw err;
  }

  const payload = await res.json();

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
    const err = new Error(
      `${model} returned no text (finishReason ${finish ?? 'unknown'}).` +
        (finish === 'MAX_TOKENS' ? ' The output budget was exhausted before any article was written.' : '')
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

async function callGemini(user) {
  const preferred = process.env.AI_MODEL;
  const models = preferred
    ? [preferred, ...GEMINI_FALLBACKS.filter((m) => m !== preferred)]
    : [...GEMINI_FALLBACKS];

  let lastError;

  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const text = await callGeminiOnce(model, user);
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

  throw new Error(`All Gemini models failed. Last error: ${lastError?.message ?? 'unknown'}`);
}

/* ------------------------------------------------------------------ *
 * Belt and braces: the citation came from Europe PMC, but check the DOI
 * actually resolves before putting it on the site.
 *
 * Only a definite 404/410 counts as dead. A 403 is a bot wall and a 5xx is the
 * publisher having a bad day — neither means the paper does not exist, and
 * neither should throw away a citation we know is real.
 * ------------------------------------------------------------------ */

async function urlStatus(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SriShankaraDentalBot/1.0)' },
      });
      if (res.ok) return 'ok';
      if (res.status === 404 || res.status === 410) return 'dead';
      return 'unverified';
    } catch {
      /* try the next method */
    }
  }
  return 'unverified';
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

note(`Provider: ${PROVIDER}`);
if (process.env.AI_MODEL) note(`AI_MODEL override: ${process.env.AI_MODEL}`);

const { titles: seenTitles, urls: seenUrls } = await published();
note(`${seenTitles.length} article(s) already published.`);

const papers = await findCandidates(seenUrls, seenTitles);
if (papers.length === 0) {
  await die(
    'No new papers to write about',
    'Europe PMC returned nothing usable that has not already been covered.',
    ['', 'Not a failure of the pipeline — just a quiet week. The next run will look again.']
  );
}
note(`Offering ${papers.length} papers to the model.`);

const user = USER(papers, seenTitles);

let raw;
try {
  raw = PROVIDER === 'gemini' ? await callGemini(user) : await callAnthropic(user);
} catch (e) {
  await die('Could not reach a working model', e.message, [
    '',
    'Usually transient capacity pressure rather than a configuration problem.',
    "Tomorrow's scheduled run will try again on its own.",
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

const missing = ['title', 'slug', 'description', 'body'].filter(
  (f) => typeof article[f] !== 'string' || !article[f].trim()
);
if (missing.length) {
  await die('Article was incomplete', `Missing or empty field(s): ${missing.join(', ')}`);
}

const idx = Number(article.sourceIndex);
if (!Number.isInteger(idx) || idx < 0 || idx >= papers.length) {
  await die(
    'Model did not choose a valid paper',
    `sourceIndex was ${JSON.stringify(article.sourceIndex)}; expected 0–${papers.length - 1}.`
  );
}
const paper = papers[idx];
note(`Chose [${idx}] ${paper.title}`);

if (!CATEGORIES.includes(article.category)) {
  note(`Category "${article.category}" is not one of the five allowed — using "Research".`);
  article.category = 'Research';
}

/* If the model wrote a URL anywhere in the body despite being told not to,
 * strip the article rather than risk an invented link going live. */
const strayUrl = article.body.match(/https?:\/\/\S+|\b10\.\d{4,9}\/\S+/);
if (strayUrl) {
  await die(
    'Model wrote a link into the body',
    `Found "${strayUrl[0]}". The body must contain no URLs or DOIs — the citation is attached automatically.`,
    ['', 'Nothing written. This guard exists because an invented link is worse than no article.']
  );
}

const url = citationUrl(paper);
const status = await urlStatus(url);
note(`Citation ${status.toUpperCase()}: ${url}`);
if (status === 'dead') {
  await die('The paper\'s own link does not resolve', `${url} returned 404/410.`, [
    '',
    'Europe PMC listed this paper but its DOI is not resolving. Nothing written.',
  ]);
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
  `  - title: ${JSON.stringify(citationTitle(paper))}`,
  `    url: ${JSON.stringify(url)}`,
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
  `**Source paper:** ${paper.title}`,
  `**Journal:** ${paper.journalTitle ?? 'Preprint'} (${paper.firstPublicationDate ?? paper.pubYear ?? '—'})`,
  `**Citation:** ${url}`,
  `**Category:** ${article.category}`,
  `**Words:** ~${article.body.trim().split(/\s+/).length}`,
]);
