import type { Condition, Effect } from '../sim/effects';
import { BUILDINGS } from './buildings';
import { SYNERGIES, synergyUnlock } from './synergies';

// Run upgrades: bought once, kept until prestige. Each is data; the engine
// only knows conditions, effects and rule flags. `label` is the short text on
// the shop chip; `rule` marks upgrades that change how Tetris itself plays.
export interface UpgradeDef {
  id: string;
  label: string;
  name: string;
  group: 'milestone' | 'manual' | 'tech' | 'buff' | 'wrath' | 'golden' | 'synergy';
  price: number;
  unlock: Condition[];
  effects: Effect[];
  rule?: boolean;
}

// A chain of upgrades where each step needs the previous one bought, so the
// shop shows one chip per chain at a time.
function chain(
  base: Omit<UpgradeDef, 'id' | 'price' | 'unlock' | 'effects' | 'name' | 'label'>,
  steps: { id: string; name: string; label: string; price: number; unlock: Condition[]; effects: Effect[] }[],
): UpgradeDef[] {
  return steps.map((s, i) => ({
    ...base,
    ...s,
    unlock: i === 0 ? s.unlock : [...s.unlock, { type: 'upgrade', id: steps[i - 1]!.id }],
  }));
}

// Owning 1, 5, 25, 50, 100 of a building offers a ×2 on that building, priced
// like Cookie Clicker's tiered upgrades. Generated for every building, so a
// new building gets its milestones for free.
const MILESTONE_OWNED = [1, 5, 25, 50, 100];
const MILESTONE_PRICE = [10, 50, 500, 50_000, 5_000_000];

export function milestonesFor(b: { id: string; name: string; basePrice: number }): UpgradeDef[] {
  return chain({ group: 'milestone' }, MILESTONE_OWNED.map((n, i) => ({
    id: `ms_${b.id}_${n}`,
    name: `${b.name} ×2 (${n} owned)`,
    label: '×2',
    price: b.basePrice * MILESTONE_PRICE[i]!,
    unlock: [{ type: 'owned', id: b.id, gte: n }],
    effects: [{ target: 'income', filter: [`building:${b.id}`], op: 'mul', value: 2 }],
  })));
}

// Manual ×2: unlocked by Lines earned by hand, priced at ten times that.
const MANUAL_STEPS = [200, 2_000, 20_000, 200_000, 2_000_000];
export const MANUAL_UPGRADES = chain({ group: 'manual' }, MANUAL_STEPS.map((n) => ({
  id: `manual_${n}`,
  name: `MANUAL ×2 (${n} by hand)`,
  label: 'M×2',
  price: n * 10,
  unlock: [{ type: 'stat', stat: 'manualLines', gte: n }],
  effects: [{ target: 'income', filter: ['board:manual'], op: 'mul', value: 2 }],
})));

// Technique multipliers. Bots earn no technique bonus, so these pay off on
// the manual board only. Three steps each: ×1.5, then ×2, then ×2 again.
function techChain(key: 'spin' | 'b2b' | 'pc', label: string, stat: string, counts: number[], prices: number[]): UpgradeDef[] {
  const values = [1.5, 2, 2];
  return chain({ group: 'tech' }, counts.map((n, i) => ({
    id: `${key}_${i + 1}`,
    name: `${label} ×${values[i]} (${n})`,
    label: `${label}×${values[i]}`,
    price: prices[i]!,
    unlock: [{ type: 'stat', stat, gte: n }],
    effects: [{ target: 'income', filter: [`tech:${key}`], op: 'mul', value: values[i]! }],
  })));
}

// Manual share: every row cleared by hand also pays this share of the bots'
// Lines per second, so the manual board keeps pace once bots dwarf the attack
// table. Cookie Clicker's mouse upgrades (+1% of CpS per click).
const SHARE_STEPS = [2_000, 20_000, 200_000, 2_000_000, 20_000_000];
export const MANUAL_SHARE_UPGRADES = chain({ group: 'manual' }, SHARE_STEPS.map((n) => ({
  id: `share_${n}`,
  name: `+1% OF PER SECOND per row (${n} by hand)`,
  label: '+1%/s',
  price: n * 10,
  unlock: [{ type: 'stat', stat: 'manualLines', gte: n }],
  effects: [{ target: 'manual_pps_share', op: 'add_pct', value: 1 }],
})));

const tech = [
  ...techChain('spin', 'SPIN', 'spins', [10, 50, 200], [1_000, 10_000, 100_000]),
  ...techChain('b2b', 'B2B', 'b2bs', [10, 50, 200], [1_000, 10_000, 100_000]),
  ...techChain('pc', 'PC', 'pcs', [1, 5, 20], [2_000, 20_000, 200_000]),
  // Combo raises the per-step coefficient rather than multiplying the clear:
  // 0.1 → 0.15 → 0.2 → 0.25.
  ...chain({ group: 'tech' }, [5, 25, 100].map((n, i) => ({
    id: `combo_${i + 1}`,
    name: `COMBO +0.05 per step (${n} × 5 combo)`,
    label: 'C+',
    price: [1_000, 10_000, 100_000][i]!,
    unlock: [{ type: 'stat', stat: 'combo5', gte: n }] as Condition[],
    effects: [{ target: 'combo_step', op: 'add_pct', value: 50 }] as Effect[],
  }))),
];

// Player buffs: rule flags the manual game reads.
const buffs: UpgradeDef[] = [
  ...chain({ group: 'buff', rule: true }, [10, 50].map((n, i) => ({
    id: `grace_${i + 1}`,
    name: `COMBO GRACE ${i + 1} piece${i ? 's' : ''}`,
    label: 'GRACE',
    price: [4_000, 40_000][i]!,
    unlock: [{ type: 'stat', stat: 'combo5', gte: n }] as Condition[],
    effects: [{ target: 'rule:combo_grace', op: 'flag', value: 1 }] as Effect[],
  }))),
  { id: 'b2b_shield', name: 'B2B SHIELD', label: 'SHIELD', group: 'buff', rule: true, price: 10_000,
    unlock: [{ type: 'stat', stat: 'b2bs', gte: 25 }], effects: [{ target: 'rule:b2b_shield', op: 'flag', value: 1 }] },
  { id: 'next_plus', name: 'NEXT +1', label: 'NEXT+1', group: 'buff', rule: true, price: 4_000,
    unlock: [{ type: 'stat', stat: 'manualPieces', gte: 500 }], effects: [{ target: 'rule:next_plus', op: 'flag', value: 1 }] },
  { id: 'hold2', name: 'HOLD ×2', label: 'HOLD2', group: 'buff', rule: true, price: 20_000,
    unlock: [{ type: 'stat', stat: 'manualPieces', gte: 2_000 }], effects: [{ target: 'rule:hold2', op: 'flag', value: 1 }] },
];

// Wrath: harder lives for more Lines. I starts every life at level 4, II
// levels up every 8 rows instead of 10, III starts at level 8 and levels up
// every 6. The level multiplies manual income, so a player who can survive
// it earns more. There is no way back before prestige.
const wrath = chain({ group: 'wrath', rule: true }, [
  { n: 'I', what: 'start at level 4', effects: [{ target: 'start_level', op: 'add', value: 3 }] },
  { n: 'II', what: 'level up every 8 rows', effects: [{ target: 'rows_per_level', op: 'add', value: -2 }] },
  { n: 'III', what: 'start at level 8, level up every 6 rows', effects: [
    { target: 'start_level', op: 'add', value: 4 }, { target: 'rows_per_level', op: 'add', value: -2 }] },
].map((w, i) => ({
  id: `wrath_${i + 1}`,
  name: `WRATH ${w.n}: ${w.what}`,
  label: `WRATH ${w.n}`,
  price: [2_000, 20_000, 200_000][i]!,
  unlock: [{ type: 'stat', stat: 'rounds', gte: 1 }] as Condition[],
  effects: [{ target: 'rule:wrath', op: 'flag', value: 1 }, ...w.effects] as Effect[],
})));

// Golden pieces: commoner, and longer buffs. Cookie Clicker's Lucky day
// and Get lucky, unlocked by golden pieces cashed in.
const golden: UpgradeDef[] = [
  { id: 'lucky_day', name: 'LUCKY DAY: golden pieces twice as often', label: 'LUCKY', group: 'golden', price: 15_554,
    unlock: [{ type: 'stat', stat: 'goldens', gte: 7 }], effects: [{ target: 'golden_interval', op: 'mul', value: 0.5 }] },
  { id: 'get_lucky', name: 'GET LUCKY: buffs last twice as long', label: 'BUFF×2', group: 'golden', price: 155_554,
    unlock: [{ type: 'stat', stat: 'goldens', gte: 27 }], effects: [{ target: 'buff_duration', op: 'mul', value: 2 }] },
];

// Synergies, researched with crowns and bought here (src/data/synergies.ts).
const synergy: UpgradeDef[] = SYNERGIES.map((s) => ({
  id: s.id, name: s.name, label: 'SYN', group: 'synergy', price: s.price, unlock: synergyUnlock(s), effects: s.effects,
}));

export const UPGRADES: UpgradeDef[] = [...BUILDINGS.flatMap(milestonesFor), ...MANUAL_UPGRADES, ...MANUAL_SHARE_UPGRADES, ...tech, ...buffs, ...wrath, ...golden, ...synergy];

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
