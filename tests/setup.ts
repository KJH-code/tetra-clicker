import { readFileSync } from 'node:fs';
import { installEngine } from '../src/sim/bot/ccWasm';

// The page compiles the engine asynchronously at startup; tests load it
// from disk once, synchronously, before any bot plays.
installEngine(new WebAssembly.Instance(new WebAssembly.Module(readFileSync(new URL('../src/engine/cold-clear.wasm', import.meta.url))), {}));
