// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Update `site` once the real domain is registered.
export default defineConfig({
  site: 'https://srishankaradental.com',
  integrations: [sitemap()],
  build: { format: 'directory' },
});
