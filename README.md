# Sri Shankara Dental Clinic — website

Astro static site. Hosted free on Cloudflare Pages. No server is ever switched
on: GitHub Actions does the scheduled work, Cloudflare builds and serves.

```
src/data/clinic.ts        ← name, address, phone, hours, dentists. EDIT THIS FIRST.
src/content/services/     ← treatment pages (markdown)
src/content/news/         ← dental news articles (written by the scheduled job)
src/pages/                ← routes
scripts/                  ← article generation, newsletter, compliance check
.github/workflows/        ← the daily and weekly cron jobs
```

## First-time setup on Windows

Open **PowerShell** and run:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

Close and reopen PowerShell so the new PATH takes effect, then:

```powershell
cd $HOME\PycharmProjects\sri-shankara
npm install
npm run dev
```

Open http://localhost:4321. Edits appear immediately.

Windows line endings can produce noisy diffs — set this once:

```powershell
git config --global core.autocrlf true
```

## Publishing it

```powershell
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin https://github.com/<account>/sri-shankara.git
git push -u origin main
```

Then in Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, pick
the repo, and set

- Build command: `npm run build`
- Output directory: `dist`

Add the custom domain under the project's **Custom domains** tab. HTTPS is
automatic.

## Before it goes live

1. Replace every `PLACEHOLDER` in `src/data/clinic.ts`.
2. Set the real domain in `astro.config.mjs` (`site`) and `public/robots.txt`.
3. Get a free access key at [web3forms.com](https://web3forms.com) → `web3formsKey`.
4. Fill in the `PLACEHOLDER`s in `src/pages/privacy.astro` and `about.astro`.
5. Create the Google Business Profile. The address there must match
   `clinic.ts` character for character — inconsistent NAP is the most common
   self-inflicted local-SEO wound.
6. Delete `src/content/news/2026-08-25-example-generated-article.md`.

## The scheduled jobs

Both live in `.github/workflows/` and run on GitHub's infrastructure.

| Job | When | What it does |
|---|---|---|
| `daily-news.yml` | 01:30 UTC = 07:00 IST | Generates one article, runs the compliance check, verifies the build, commits. The push makes Cloudflare rebuild. |
| `weekly-newsletter.yml` | 04:30 UTC Fri = 10:00 IST Fri | Reads the live RSS feed, builds a digest of the week, sends it via Brevo. |

Cron in GitHub Actions is **always UTC** — there is no timezone setting.

### Repository secrets

Settings → Secrets and variables → Actions:

| Secret | For |
|---|---|
| `ANTHROPIC_API_KEY` | article generation |
| `BREVO_API_KEY` | newsletter sending |

And under *Variables*:

| Variable | Example |
|---|---|
| `ANTHROPIC_MODEL` | current model id — check before first run |
| `REVIEWED_BY` | `Dr A Sharma, BDS MDS` |
| `BREVO_LIST_ID` | `2` |
| `SITE_URL` | `https://srishankaradental.com` |

Use **workflow_dispatch** in the Actions tab to test either job by hand before
trusting the schedule.

## Compliance

`npm run check:compliance` scans the site for language that would fall foul of
the Dentists (Code of Ethics) Regulations 2014 — superiority claims, outcome
guarantees, urgency-based inducements, testimonials, star ratings — and for news
articles missing a citation. It runs in CI before anything publishes.

Two rules worth holding on to:

- **Clause 8.2.9 permits a factual website**, including treatment details and
  fees. Being informative is not the risk.
- **Clause 8.1.7 restricts lay-audience commentary on procedures** unless it is
  supported by evidence-based studies. That is why every news article is
  required by the content schema to carry at least one real source — an article
  without one fails the build rather than publishing.

The privacy notice and the consent checkbox on the contact form exist to meet
the Digital Personal Data Protection Act 2023 and the DPDP Rules 2025. Name a
real grievance officer in `clinic.ts` before launch.
