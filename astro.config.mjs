// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: change `site` to your real domain once you have one.
export default defineConfig({
  site: 'https://enable-ws.pages.dev',
  integrations: [sitemap()],
});
