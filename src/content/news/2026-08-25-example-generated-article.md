---
title: "Example: how a generated news article is structured"
description: A template post showing the frontmatter and shape the scheduled job produces. Delete once real articles begin publishing.
pubDate: 2026-08-25
category: Research
reviewedBy: Dr PLACEHOLDER, BDS MDS
sources:
  - title: "Replace with the actual primary source"
    url: "https://example.org/study"
draft: true
---

This file exists to show the shape of an automated article, and to give the
build something to render before the scheduled job has run. It is marked
`draft: true`, so it will not appear on the live site.

## What the job produces

Each run writes one markdown file into `src/content/news/` named
`YYYY-MM-DD-slug.md`, with the frontmatter above filled in. The content
collection schema rejects any article missing a citation, so a post that cannot
be sourced fails the build rather than going live unsourced.

## Why the citation is mandatory

Clause 8.1.7 of the DCI code restricts publishing opinion on procedures or
equipment for a lay audience unless it is supported by evidence-based studies.
Requiring at least one real source in the schema turns that obligation into
something the build enforces automatically, rather than something anyone has to
remember.

## House style

- 500–800 words, plain language, no jargon left unexplained
- Report what the research found, not what it promises
- No claim that the clinic offers the technique being described
- No superlatives about any practitioner or practice
- Close with what it means for patients, in general terms

## What it must never do

It must not present the clinic as the provider of an emerging treatment, imply
a guaranteed outcome, or carry a testimonial. Those constraints live in the
generation prompt and are checked again by the compliance script before commit.
