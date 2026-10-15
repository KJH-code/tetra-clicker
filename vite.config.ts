import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/, so the asset base must match
// in production builds while dev stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tetra-clicker/' : '/',
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
