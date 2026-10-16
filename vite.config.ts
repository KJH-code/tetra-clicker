import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/, so the asset base must match
// in production builds while dev stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tetra-clicker/' : '/',
  build: {
    target: 'es2022',
    // The economy simulator is a second page beside the game.
    rollupOptions: { input: { main: 'index.html', sim: 'sim.html' } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
}));
