// @ts-check
import { defineConfig } from 'astro/config';

import solidJs from '@astrojs/solid-js';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [solidJs(), clerk()],

  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ['**/.wrangler/**'],
      },
    },
  },

  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),

  output: 'static',
});
