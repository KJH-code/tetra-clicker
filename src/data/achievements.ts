import type { Condition, Effect } from '../sim/effects';
import { BUILDINGS } from './buildings';

// Achievements: met once, kept forever (they survive ascension), each worth
// +1% on all income. Conditions are the effect engine's own; `career` reads
// a statistic over every run so far plus this one.
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  when: Condition[];
  // Shown as ??? until met.
  hidden?: boolean;
}

const OWNED_STEPS = [1, 10, 50, 100];
const LINES_STEPS: [number, string][] = [[1_000, '1K'], [100_000, '100K'], [10_000_000, '10M'], [1_000_000_000, '1B']];

const career = (stat: string, gte: number): Condition => ({ type: 'career', stat, gte });

export const ACHIEVEMENTS: AchievementDef[] = [
  ...BUILDINGS.flatMap((b) => OWNED_STEPS.map((n): AchievementDef => ({
    id: `own_${b.id}_${n}`,
    name: n === 1 ? `FIRST ${b.name}` : `${n} ${b.name}`,
    desc: `Own ${n} ${b.name} in one run`,
    when: [{ type: 'owned', id: b.id, gte: n }],
  }))),
  ...LINES_STEPS.map(([n, label]): AchievementDef => ({
    id: `lines_${label.toLowerCase()}`, name: `${label} LINES`, desc: `Earn ${label} Lines over all runs`, when: [career('linesEarned', n)],
  })),
  { id: 'tsd_10', name: 'T-SPIN DOUBLE ×10', desc: '10 T-spin doubles by hand', when: [career('tsd', 10)] },
  { id: 'tsd_100', name: 'T-SPIN DOUBLE ×100', desc: '100 T-spin doubles by hand', when: [career('tsd', 100)] },
  { id: 'pc_1', name: 'PERFECT', desc: 'A perfect clear by hand', when: [career('pcs', 1)] },
  { id: 'pc_10', name: 'PERFECT ×10', desc: '10 perfect clears by hand', when: [career('pcs', 10)] },
  { id: 'combo_10', name: '10 COMBO', desc: 'A 10 combo by hand', when: [career('combo10', 1)] },
  ...[10, 15, 20].map((n): AchievementDef => ({
    id: `level_${n}`, name: `LEVEL ${n}`, desc: `Reach level ${n} in a life`, when: [career('maxLevel', n)],
  })),
  ...[1, 5, 25].map((n): AchievementDef => ({
    id: `ascend_${n}`, name: n === 1 ? 'ASCENDED' : `ASCENDED ×${n}`, desc: `Ascend ${n === 1 ? 'once' : `${n} times`}`,
    when: [{ type: 'stat', stat: 'ascensions', gte: n }],
  })),
  { id: 'hc_ascend', name: 'ONE LIFE', desc: 'Finish a hardcore run', when: [{ type: 'stat', stat: 'hardcoreAscensions', gte: 1 }] },
  { id: 'hc_level15', name: 'HARDCORE 15', desc: 'Reach level 15 in a hardcore run', when: [{ type: 'hardcore' }, { type: 'stat', stat: 'maxLevel', gte: 15 }] },
  { id: 'golden_lost', name: 'BUTTERFINGERS', desc: 'Place a golden or wrath piece without clearing a line', hidden: true, when: [career('goldensLost', 1)] },
  { id: 'ruined', name: 'RUINED', desc: 'Lose Lines to a wrath piece', hidden: true, when: [career('ruins', 1)] },
  { id: 'clot_tetris', name: 'AGAINST THE CLOT', desc: 'Clear a tetris while a CLOT runs', hidden: true, when: [career('clotTetrises', 1)] },
  { id: 'empty_ascend', name: 'NOTHING LEFT', desc: 'Ascend with 0 Lines in the bank', hidden: true, when: [{ type: 'stat', stat: 'emptyAscensions', gte: 1 }] },
];

export const achievementById = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);

// Every achievement met adds 1% to all income, the same shape as crowns.
export const ACHIEVEMENT_EFFECT: Effect = { target: 'income', op: 'mul_pct', value: 1, stack: { type: 'stat', stat: 'achievementCount' } };
