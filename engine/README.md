# engine/

The technique bots' brain: [Cold Clear](https://github.com/MinusKelvin/cold-clear)
by MinusKelvin, at commit `279edd7`, built to WebAssembly. Licensed under the
Mozilla Public License 2.0 (`LICENSE`); the files here stay under it.

- `libtetris/`, `bot/`, `opening-book/`: Cold Clear's crates, trimmed and modified.
- `glue/`: this project's bridge, a flat `i32` buffer in and one decision out
  (no wasm-bindgen, so the module has no imports).

Build with `npm run build:engine` (Rust from `rust-toolchain.toml`). The
output, `src/engine/cold-clear.wasm`, is committed so the site and the tests
need no Rust; CI rebuilds it and runs the tests against the fresh build.

## Changes from upstream

- Removed the browser, desktop, PC-loop and multi-threaded front ends, and the
  `pcf`/`fumen` features (the PC building uses its own port of pcf).
- Seeded the Monte-Carlo search's random choices and gave every hash map fixed
  keys, so a fixed node count gives the same move for the same position.
- `BotState::suggest_filtered`: the best candidate that a caller allows, for
  bots that must never make some clears.
- All-spins: with the switch on, a rotation that leaves an I, J, L, S or Z
  piece unable to move left, right or up is a full spin, scored by a new
  `allspin` weight and new `AllSpin*` placement kinds (they pay and chain like
  plain clears, as in this game).
