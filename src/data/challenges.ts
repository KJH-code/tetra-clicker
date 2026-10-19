import type { Effect } from '../sim/effects';

// Challenge runs: a hardcore run with rules picked on the prestige shop,
// each rule in steps worth difficulty points. Opened by the hidden
// HARDCORE 20 achievement; a run needs at least `minPoints` to start and is
// cleared by ascending alive. The best cleared total is kept, and every
// point of it adds 2% to all income for good.
export interface ChallengeStep { label: string; points: number; effects: Effect[] }
export interface ChallengeRule { id: string; name: string; group: 'rule' | 'economy'; steps: ChallengeStep[] }

export const CHALLENGE = { minPoints: 3, incomePctPerPoint: 2 };
// More kinds than the ladder has: no cap.
export const BUILDING_KINDS_ANY = 99;

// Each step's effects apply only at that exact step, so a harder step
// replaces the one below rather than adding to it.
const at = (id: string, step: number, effects: Effect[]): Effect[] =>
  effects.map((e) => ({ ...e, when: [...(e.when ?? []), { type: 'challenge' as const, id, step }] }));

const rule = (id: string, name: string, group: ChallengeRule['group'], steps: { label: string; points: number; effects: Effect[] }[]): ChallengeRule =>
  ({ id, name, group, steps: steps.map((s, i) => ({ ...s, effects: at(id, i + 1, s.effects) })) });

export const CHALLENGE_RULES: ChallengeRule[] = [
  rule('no_hold', 'NO HOLD', 'rule', [
    { label: 'NO HOLD', points: 2, effects: [{ target: 'hold_slots', op: 'mul', value: 0 }] },
  ]),
  // On top of hardcore's three next pieces.
  rule('next', 'FEWER NEXT', 'rule', [
    { label: 'NEXT 2', points: 1, effects: [{ target: 'next_count', op: 'add', value: -1 }] },
    { label: 'NEXT 1', points: 2, effects: [{ target: 'next_count', op: 'add', value: -2 }] },
  ]),
  rule('garbage', 'MORE GARBAGE', 'rule', [
    { label: 'GARBAGE ×1.5', points: 1, effects: [{ target: 'buy_garbage', op: 'mul', value: 1.5 }] },
    { label: 'GARBAGE ×2', points: 2, effects: [{ target: 'buy_garbage', op: 'mul', value: 2 }] },
  ]),
  rule('gravity', 'FASTER GRAVITY', 'rule', [
    { label: 'GRAVITY ×1.5', points: 1, effects: [{ target: 'gravity', op: 'mul', value: 1.5 }] },
    { label: 'GRAVITY ×3', points: 2, effects: [{ target: 'gravity', op: 'mul', value: 3 }] },
    { label: '20G', points: 3, effects: [{ target: 'gravity', op: 'mul', value: Infinity }] },
  ]),
  // Kinds of building a run may own, down from BUILDING_KINDS_ANY.
  rule('kinds', 'FEW BUILDINGS', 'economy', [
    { label: '3 KINDS', points: 1, effects: [{ target: 'building_kinds', op: 'add', value: 3 - BUILDING_KINDS_ANY }] },
    { label: '1 KIND', points: 2, effects: [{ target: 'building_kinds', op: 'add', value: 1 - BUILDING_KINDS_ANY }] },
    { label: 'NO BUILDINGS', points: 3, effects: [{ target: 'building_kinds', op: 'add', value: -BUILDING_KINDS_ANY }] },
  ]),
  rule('no_upgrades', 'NO RUN UPGRADES', 'economy', [
    { label: 'NO RUN UPGRADES', points: 2, effects: [{ target: 'rule:no_upgrades', op: 'flag', value: 1 }] },
  ]),
  rule('no_synergies', 'NO SYNERGIES', 'economy', [
    { label: 'NO SYNERGIES', points: 1, effects: [{ target: 'rule:no_synergies', op: 'flag', value: 1 }] },
  ]),
  rule('price', 'DEARER BUILDINGS', 'economy', [
    { label: 'PRICES ×2', points: 1, effects: [{ target: 'price', op: 'mul', value: 2 }] },
  ]),
];

export const challengeEffects = (): Effect[] => CHALLENGE_RULES.flatMap((r) => r.steps.flatMap((s) => s.effects));

// Points a pick of steps is worth.
export function challengePoints(pick: Record<string, number>): number {
  let n = 0;
  for (const r of CHALLENGE_RULES) {
    const step = pick[r.id] ?? 0;
    if (step > 0) n += r.steps[step - 1]?.points ?? 0;
  }
  return n;
}

export const CHALLENGE_EFFECT: Effect = { target: 'income', op: 'mul_pct', value: CHALLENGE.incomePctPerPoint, stack: { type: 'stat', stat: 'challengeBest' } };
