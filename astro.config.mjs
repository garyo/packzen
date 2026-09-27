// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';

import solidJs from '@astrojs/solid-js';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';

// https://astro.build/config
export default defineConfig({
  site: 'https://packzen.org',
  integrations: [solidJs(), clerk()],

  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ['**/.wrangler/**'],
      },
    },
  },

  // No astro:assets images or Astro sessions, so skip the Cloudflare Images
  // and KV bindings the adapter would otherwise provision.
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: { driver: sessionDrivers.lruCache() },

  output: 'static',
});
