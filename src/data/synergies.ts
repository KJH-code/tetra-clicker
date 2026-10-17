import type { Condition, Effect } from '../sim/effects';
import { BUILDINGS } from './buildings';

// Synergies: one per pair of neighbouring buildings on the ladder. Each is
// researched once with crowns (the SYNERGY prestige chain, in ladder order)
// and then bought in every run with Lines, once both buildings are owned.
//
// Four kinds, one per pair, chosen to suit it:
//   cross   each building earns +1% per copy of the other
//   reward  the upper bot is paid a share of a technique it does not own:
//           a fixed ×1.25 on its income, the same in play and in the
//           hidden-tab formula
//   play    the upper bot plays another way (data: `variant`), plus ×1.25
//   link    a clear on the manual board starts a 30 s ×2 buff on bots
export type SynergyKind = 'cross' | 'reward' | 'play' | 'link';

export interface SynergyDef {
  id: string;
  research: string;
  pair: [string, string];
  kind: SynergyKind;
  name: string;
  effects: Effect[];
  // A manual clear that starts a buff (link synergies).
  trigger?: { on: 'tetris' | 'pc' | 'garbage'; buff: string };
  // The upper building's bot switches to this skill (play synergies).
  variant?: { building: string; skill: string };
  price: number;
}

const FIXED_REWARD = 1.25;
const PRICE_TIMES_BASE = 10;

const income = (building: string, value: number): Effect => ({ target: 'income', filter: [`building:${building}`], op: 'mul', value });
const cross = (a: string, b: string): Effect[] => [
  { target: 'income', filter: [`building:${a}`], op: 'add_pct', value: 1, stack: { type: 'owned', id: b, offset: 0 } },
  { target: 'income', filter: [`building:${b}`], op: 'add_pct', value: 1, stack: { type: 'owned', id: a, offset: 0 } },
];

type Spec = Omit<SynergyDef, 'id' | 'research' | 'pair' | 'price'>;

// In ladder order; entry i pairs building i with building i + 1.
const SPECS: Spec[] = [
  { kind: 'cross', name: 'SINGLE + DOUBLE: +1% each per copy of the other', effects: cross('single', 'double') },
  { kind: 'cross', name: 'DOUBLE + TRIPLE: +1% each per copy of the other', effects: cross('double', 'triple') },
  { kind: 'link', name: 'TRIPLE + TETRIS: your tetris doubles the TETRIS bot for 30 s', effects: [],
    trigger: { on: 'tetris', buff: 'syn_tetris' } },
  { kind: 'reward', name: 'TETRIS + T-SPIN: the T-SPIN bot shares back-to-back pay (×1.25)', effects: [income('tspin', FIXED_REWARD)] },
  { kind: 'play', name: 'T-SPIN + ALL-SPIN: the T-SPIN bot goes for singles and triples too (×1.25)', effects: [income('tspin', FIXED_REWARD)],
    variant: { building: 'tspin', skill: 'tspin_tst' } },
  { kind: 'reward', name: 'ALL-SPIN + COMBO: the ALL-SPIN bot shares combo pay (×1.25)', effects: [income('allspin', FIXED_REWARD)] },
  { kind: 'play', name: 'COMBO + B2B: the B2B bot keeps combos going (×1.25)', effects: [income('b2b', FIXED_REWARD)],
    variant: { building: 'b2b', skill: 'b2b_combo' } },
  { kind: 'link', name: 'B2B + PERFECT: your perfect clear doubles every bot for 30 s', effects: [],
    trigger: { on: 'pc', buff: 'syn_pc' } },
  { kind: 'reward', name: 'PERFECT + DOWNSTACK: the DOWNSTACK bot shares perfect-clear pay (×1.25)', effects: [income('downstack', FIXED_REWARD)] },
  { kind: 'link', name: 'DOWNSTACK + 4-WIDE: a garbage row you clear doubles the 4-WIDE bot for 30 s', effects: [],
    trigger: { on: 'garbage', buff: 'syn_fourwide' } },
  { kind: 'play', name: '4-WIDE + OPENER: the OPENER bot runs a combo after each PC instead of a TSD (×1.25)', effects: [income('opener', FIXED_REWARD)],
    variant: { building: 'opener', skill: 'opener_combo' } },
];

export const SYNERGIES: SynergyDef[] = SPECS.map((s, i) => {
  const a = BUILDINGS[i]!;
  const b = BUILDINGS[i + 1]!;
  return {
    ...s,
    id: `syn_${a.id}_${b.id}`,
    research: `synergy_${i + 1}`,
    pair: [a.id, b.id],
    price: Math.max(a.basePrice, b.basePrice) * PRICE_TIMES_BASE,
  };
});

// What makes a synergy's chip show up in a run: researched, both owned.
export const synergyUnlock = (s: SynergyDef): Condition[] => [
  { type: 'prestige', id: s.research },
  { type: 'owned', id: s.pair[0], gte: 1 },
  { type: 'owned', id: s.pair[1], gte: 1 },
];

export const synergyById = (id: string): SynergyDef | undefined => SYNERGIES.find((s) => s.id === id);
