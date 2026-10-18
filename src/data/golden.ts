import type { Effect } from '../sim/effects';

// Timed buffs. Their effects run through the same evaluator as upgrades, so
// a new buff is a new entry here.
export interface BuffDef {
  id: string;
  label: string;
  durationMs: number;
  effects: Effect[];
}

export const BUFFS: Record<string, BuffDef> = {
  frenzy: { id: 'frenzy', label: 'FRENZY ×7', durationMs: 77_000,
    effects: [{ target: 'income', op: 'mul', value: 7 }] },
  // Synergy links: a manual clear lending the bots a hand.
  syn_tetris: { id: 'syn_tetris', label: 'TETRIS BOT ×2', durationMs: 30_000,
    effects: [{ target: 'income', filter: ['building:tetris'], op: 'mul', value: 2 }] },
  syn_pc: { id: 'syn_pc', label: 'BOTS ×2', durationMs: 30_000,
    effects: [{ target: 'income', filter: ['board:auto'], op: 'mul', value: 2 }] },
  syn_fourwide: { id: 'syn_fourwide', label: '4-WIDE BOT ×2', durationMs: 30_000,
    effects: [{ target: 'income', filter: ['building:fourwide'], op: 'mul', value: 2 }] },
  syn_helper: { id: 'syn_helper', label: 'HELPER BOT ×2', durationMs: 30_000,
    effects: [{ target: 'income', filter: ['building:helper'], op: 'mul', value: 2 }] },
  clear_frenzy: { id: 'clear_frenzy', label: 'CLEAR FRENZY ×777', durationMs: 13_000,
    effects: [{ target: 'income', filter: ['board:manual'], op: 'mul', value: 777 }] },
  // Wrath pieces: one huge bot burst, or a slump.
  elder_frenzy: { id: 'elder_frenzy', label: 'ELDER FRENZY ×666', durationMs: 6_000,
    effects: [{ target: 'income', filter: ['board:auto'], op: 'mul', value: 666 }] },
  clot: { id: 'clot', label: 'CLOT ×0.5', durationMs: 66_000,
    effects: [{ target: 'income', op: 'mul', value: 0.5 }] },
};

// What a golden piece does when it clears a line, drawn by weight at that
// moment. Lucky pays seconds of PER SECOND (without buffs) into the vault.
export type GoldenOutcome =
  | { id: string; weight: number; kind: 'buff'; buff: string }
  | { id: string; weight: number; kind: 'lucky'; seconds: number }
  // Ruin takes a share of the unbanked vault; banked Lines are never touched.
  | { id: string; weight: number; kind: 'ruin'; share: number };

export const GOLDEN = {
  // Round time between golden pieces, drawn uniformly.
  minSeconds: 60,
  maxSeconds: 300,
  outcomes: [
    { id: 'frenzy', weight: 45, kind: 'buff', buff: 'frenzy' },
    { id: 'lucky', weight: 45, kind: 'lucky', seconds: 900 },
    { id: 'clear_frenzy', weight: 10, kind: 'buff', buff: 'clear_frenzy' },
  ] as GoldenOutcome[],
};

// Wrath pieces stand in for golden ones once the WRATH prestige chain opens
// them: the more wrath upgrades this run, the likelier. They pay about 1.2×
// a golden piece on average once bots carry the income (the simulator from
// the first ascension on; tests/wrath.test.ts holds it there), all of it from
// the one ELDER FRENZY in five; the other four slow or rob the vault, so a
// wrath life gambles. Weights and shares run through
// effects (`wrath_weight` tagged `wrath:<id>`, `ruin_share`), which is how
// the prestige steps soften them.
export const WRATH = {
  // Chance a due golden piece comes as a wrath piece, by WRATH stage 0..III.
  chance: [0, 0.33, 0.66, 1],
  outcomes: [
    { id: 'elder_frenzy', weight: 20, kind: 'buff', buff: 'elder_frenzy' },
    { id: 'clot', weight: 40, kind: 'buff', buff: 'clot' },
    { id: 'ruin', weight: 40, kind: 'ruin', share: 0.2 },
  ] as GoldenOutcome[],
};
