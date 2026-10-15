// mulberry32: tiny, fast, and its whole state is one 32-bit integer, which
// makes saving and restoring the generator trivial. Determinism matters here:
// the same seed must replay the same bags so tests and the hidden-tab catch-up
// formula can be checked against the real simulation.
export interface Rng {
  next(): number; // [0, 1)
  nextInt(n: number): number; // [0, n)
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (n) => Math.floor(next() * n),
    state: () => s,
  };
}

// Restoring from a save continues the sequence exactly where it left off.
export const restoreRng = (state: number): Rng => createRng(state);
