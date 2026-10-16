# Third-party code

The bots for the T-SPIN, ALL-SPIN, COMBO, B2B and PC buildings are built on
two projects by MinusKelvin. Each copied or ported file says so in its header.

## Cold Clear

https://github.com/MinusKelvin/cold-clear — Mozilla Public License 2.0.

The engine itself, in Rust, built to WebAssembly (`src/engine/cold-clear.wasm`):

- `engine/libtetris/`, `engine/bot/`, `engine/opening-book/` — Cold Clear's
  crates at commit `279edd7`, trimmed and modified; `engine/README.md` lists
  the changes.
- `engine/glue/` — this project's bridge to it, under the same license.

Ported to TypeScript, for the PC bot and for replaying moves on screen:

- `src/sim/bot/cc/movegen.ts` — from `libtetris/src/moves.rs`

These files and the built module remain under the MPL 2.0
(https://mozilla.org/MPL/2.0/; full text in `engine/LICENSE`). The rest of
the repository is not affected by it.

## pcf

https://github.com/MinusKelvin/pcf — MIT License, Copyright (c) 2020
MinusKelvin.

- `src/sim/bot/cc/pcf.ts` — the perfect clear finder (`src/combination.rs`,
  `src/solve.rs`)

```
MIT License

Copyright (c) 2020 MinusKelvin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
