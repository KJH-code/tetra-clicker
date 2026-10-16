import type { Condition, Effect } from '../sim/effects';

// Prestige: CROWNs from risk-weighted Lines, spent between runs.
//
// Total crowns ever = ∛(lifetime risk / riskPerCrown). An ascension pays the
// growth of that total since the last one, times (1 + this run's tech
// score), rounded down. The cube root makes each next crown dearer, so many
// short runs earn less than one long one.
export const PRESTIGE = {
  // See the calibration note below.
  riskPerCrown: 1, // placeholder until calibrated
  // Ten checks at 0.15 overshoot the 1.0 cap, so seven are enough until
  // TECH CAP +0.5 lets all ten count.
  techPerCheck: 0.15,
  techCapBase: 1.0,
  // Settling at or above this danger ticks the "hot settle" check.
  hotSettleDanger: 2,
};

// Tech checklist: each met in a run adds techPerCheck to that run's score.
// Every check is a run statistic reaching a count, so a new check is data.
export interface TechCheck {
  id: string;
  label: string;
  when: Condition;
}

export const TECH_CHECKS: TechCheck[] = [
  { id: 'tss', label: 'T-SPIN SINGLE', when: { type: 'stat', stat: 'tss', gte: 1 } },
  { id: 'tsd', label: 'T-SPIN DOUBLE', when: { type: 'stat', stat: 'tsd', gte: 1 } },
  { id: 'tst', label: 'T-SPIN TRIPLE', when: { type: 'stat', stat: 'tst', gte: 1 } },
  { id: 'pc', label: 'PERFECT CLEAR', when: { type: 'stat', stat: 'pcs', gte: 1 } },
  { id: 'combo5', label: '5 COMBO', when: { type: 'stat', stat: 'combo5', gte: 1 } },
  { id: 'combo10', label: '10 COMBO', when: { type: 'stat', stat: 'combo10', gte: 1 } },
  { id: 'b2b5', label: 'B2B ×5', when: { type: 'stat', stat: 'b2b5', gte: 1 } },
  { id: 'tetris10', label: '10 TETRISES', when: { type: 'stat', stat: 'tetrises', gte: 10 } },
  { id: 'hot', label: 'SETTLE AT DANGER 2+', when: { type: 'stat', stat: 'hotSettles', gte: 1 } },
  { id: 'golden3', label: '3 GOLDEN PIECES', when: { type: 'stat', stat: 'goldens', gte: 3 } },
];

// Prestige upgrades: three chains, bought only on the ascension screen.
export type Branch = 'production' | 'survival' | 'proportion';

export interface PrestigeDef {
  id: string;
  branch: Branch;
  name: string;
  price: number;
  effects: Effect[];
}

const PRICES = [1, 3, 9, 27];

function branch(id: Branch, steps: { name: string; effects: Effect[] }[]): PrestigeDef[] {
  return steps.map((s, i) => ({ id: `${id}_${i + 1}`, branch: id, price: PRICES[i]!, ...s }));
}

export const PRESTIGE_UPGRADES: PrestigeDef[] = [
  ...branch('production', [
    { name: 'ALL INCOME ×2', effects: [{ target: 'income', op: 'mul', value: 2 }] },
    { name: 'START WITH 1K LINES', effects: [{ target: 'start_lines', op: 'add', value: 1_000 }] },
    { name: 'MANUAL ×3', effects: [{ target: 'income', filter: ['board:manual'], op: 'mul', value: 3 }] },
    { name: 'ALL INCOME ×2', effects: [{ target: 'income', op: 'mul', value: 2 }] },
  ]),
  ...branch('survival', [
    { name: 'DANGER RISES ×0.8', effects: [{ target: 'danger_rate', op: 'mul', value: 0.8 }] },
    { name: 'TOP-OUT LOSS 40% → 30%', effects: [{ target: 'forfeit', op: 'add', value: -0.1 }] },
    { name: 'GARBAGE GAPS ×1.25', effects: [{ target: 'garbage_interval', op: 'mul', value: 1.25 }] },
    { name: 'TOP-OUT LOSS 30% → 20%', effects: [{ target: 'forfeit', op: 'add', value: -0.1 }] },
  ]),
  ...branch('proportion', [
    { name: 'RISK WEIGHT ×1.5', effects: [{ target: 'risk_weight', op: 'mul', value: 1.5 }] },
    { name: 'TECH CAP +0.5', effects: [{ target: 'tech_cap', op: 'add', value: 0.5 }] },
    { name: 'RISK WEIGHT ×2', effects: [{ target: 'risk_weight', op: 'mul', value: 2 }] },
    { name: 'START DANGER +0.25', effects: [{ target: 'danger_floor', op: 'add', value: 0.25 }] },
  ]),
];

export const prestigeById = (id: string): PrestigeDef | undefined => PRESTIGE_UPGRADES.find((u) => u.id === id);

// The previous step of the same chain, which must be bought first.
export function prestigeRequires(id: string): string | null {
  const def = prestigeById(id);
  if (!def) return null;
  const i = PRESTIGE_UPGRADES.filter((u) => u.branch === def.branch).indexOf(def);
  return i > 0 ? `${def.branch}_${i}` : null;
}

// Every crown ever earned adds 1% to all income, spent or not.
export const CROWN_EFFECT: Effect = { target: 'income', op: 'mul_pct', value: 1, stack: { type: 'stat', stat: 'crownsEarned' } };
