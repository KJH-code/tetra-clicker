# Tetra Clicker

DevVault: Projects/테트리스 방치형

Tetris × idle clicker. Line clears earn Lines; Lines buy buildings; each
building type is a bot that clears lines on its own board.

## Stack

- TypeScript, Vite, Vitest. No render libraries: boards are Canvas 2D, shop and
  settings are plain DOM.
- Static site, no server. Saves go through `SaveStore` (localStorage today).

## Layout

- `src/sim/` pure game logic. Must run in Node with no DOM or Canvas.
- `src/data/` numbers and definitions: attack table, buildings, handling defaults.
- `src/save/` SaveStore interface, localStorage implementation, schema + migrations, autosave.
- `src/render/` Canvas drawing and effects.
- `src/ui/` DOM shop, settings, keyboard input (DAS/ARR/SDF).
- `tests/` Vitest.

## Commands

```
npm run dev        # vite dev server
npm test           # vitest run, everything (bot runs take ~15 min)
npm run test:fast  # all but tests/slow (seconds); what the deploy runs
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build (base /tetra-clicker/)
```

## Rules

- Sim and render stay separate. Nothing in `src/sim` imports from render/ui/DOM.
- New buildings and upgrades are data: add an entry in `src/data/`, do not edit the engine.
- Every earned amount carries tags (`board:manual`, `building:single`, `clear:single`, …);
  effects are `{ target, filter, op, value }` and are applied base + add → add_pct sum → mul (and mul_pct) product.
- Sim is a fixed time step with a seeded RNG. Same seed and inputs give the same result.
- Attack table (`src/data/attackTable.ts`) is the project's own, not TETR.IO's. Do not change its
  ratios (1 : 2.5 : 4.5 : 7, T-spins 2/4/6, all-spins ×1.5, PC 10); the unit is ×2 so every Line amount is whole.
- Comments explain why, not what. No AI model identifiers anywhere in the repository.
- Do not commit until all tests pass. Long bot runs live in tests/slow and
  run as a separate CI job; run them locally before merging bot changes.
- Branch work on a feature branch, push, fast-forward merge into main, push. No pull requests unless asked.
