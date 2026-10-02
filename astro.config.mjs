// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// NOTE: the @astrojs/tailwind and @vite-pwa/astro integrations that were in
// this config are not in package.json, so they are removed here to keep the
// static build working. Re-add them (and the dependencies) before shipping
// the full PWA UI.
// https://astro.build/config
export default defineConfig({
  site: 'https://girishlade111.github.io/flashstack/',
  base: '/flashstack/',
  integrations: [
    react(),
  ],
  ],
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
