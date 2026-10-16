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
  clear_frenzy: { id: 'clear_frenzy', label: 'CLEAR FRENZY ×777', durationMs: 13_000,
    effects: [{ target: 'income', filter: ['board:manual'], op: 'mul', value: 777 }] },
};

// What a golden piece does when it clears a line, drawn by weight at that
// moment. Lucky pays seconds of PER SECOND (without buffs) into the vault.
export type GoldenOutcome =
  | { id: string; weight: number; kind: 'buff'; buff: string }
  | { id: string; weight: number; kind: 'lucky'; seconds: number };

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
