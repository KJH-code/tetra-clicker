import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the site under /<repo>/, so the asset base must match
// in production builds while dev stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tetra-clicker/' : '/',
  // The settings window names the release (package.json is the one place it is set).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2022',
    // The economy simulator is a second page beside the game.
    rollupOptions: { input: { main: 'index.html', sim: 'sim.html' } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Simulator runs over the twelve-building ladder take a few seconds each;
    // on a loaded runner the default 5 s is too tight.
    testTimeout: 30_000,
  },
}));
