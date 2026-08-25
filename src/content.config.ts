import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Two collections, two jobs:
 *
 *  services — the local-intent pages that actually convert Dehradun searches
 *             into appointments. Hand-written, slow-changing.
 *
 *  news     — the automated dental-research feed. High volume, keeps the site
 *             fresh, builds topical authority. Written by the scheduled job.
 */

const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
  schema: z.object({
    title: z.string(),
    /** Shown in cards and meta description. Keep under ~155 chars. */
    summary: z.string(),
    /** Controls ordering on the services index. Lower shows first. */
    order: z.number().default(50),
    /** Factual price range only, e.g. "₹1,500 – ₹4,000". Optional. */
    priceRange: z.string().optional(),
    /** e.g. "45–60 minutes" */
    duration: z.string().optional(),
    /** Extra keywords for the services index filter. */
    alsoKnownAs: z.array(z.string()).default([]),
    /** Hidden from the site. Used to retire a page without deleting the file. */
    draft: z.boolean().default(false),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum([
      'Research',
      'Technology',
      'Materials',
      'Public health',
      'Practice',
    ]),
    /**
     * Health content is held to a higher quality bar by search engines, and the
     * DCI code expects lay-audience commentary on procedures to be evidence-
     * based. Both are satisfied by a named reviewer plus real citations.
     */
    reviewedBy: z.string(),
    sources: z
      .array(z.object({ title: z.string(), url: z.string().url() }))
      .min(1, 'Every news article needs at least one citation.'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { services, news };
