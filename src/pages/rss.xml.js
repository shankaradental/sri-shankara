import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { clinic } from '../data/clinic';

/**
 * The news feed. Also the hand-off point for the newsletter: the scheduled
 * job reads this to build the weekly digest, so the feed is the single
 * source of truth for what has been published.
 */
export async function GET(context) {
  const posts = (await getCollection('news', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  return rss({
    title: `${clinic.name} — Dental News`,
    description:
      'Short, sourced summaries of new research and developments in dentistry, reviewed by a registered dentist.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/news/${post.id}/`,
      categories: [post.data.category],
    })),
    customData: '<language>en-in</language>',
  });
}
