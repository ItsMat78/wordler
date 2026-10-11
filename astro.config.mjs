// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Every page is rendered on request: the board, the submit form and the puzzle
// pages all read D1. `platformProxy` gives `astro dev` the same bindings
// (D1, secrets from .dev.vars) that Cloudflare Pages gives in production.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'passthrough',
  }),
});
