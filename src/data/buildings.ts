import type { Effect } from '../sim/effects';
import type { BotTech } from '../sim/attack';

// A building is a bot skill tier. Owning the first copy unlocks its board;
// every further copy is a flat percentage on that building's income.
// `clearSize` is the largest clear the bot may make (it prefers that size and
// takes smaller ones when they help); `linesPerPiece` is the bot's measured
// long-run income per piece, which the hidden-tab formula and the shop's
// per-second figure use, and which the bot tests hold to within 1%.
// `skill` names the placement policy (sim/bot/index.ts). Prices come from
// the economy simulator's ladder.
export interface BuildingDef {
  id: string;
  name: string;
  basePrice: number;
  priceGrowth: number;
  pps: number;
  skill: string;
  clearSize: 1 | 2 | 3 | 4;
  // The technique the bot is paid for; every other clear pays its plain
  // table value. None for the clear-size buildings.
  tech?: BotTech;
  linesPerPiece: number;
  effects: Effect[];
  unlock?: Effect['when'];
}

function tier(id: string, name: string, basePrice: number, clearSize: 1 | 2 | 3 | 4, linesPerPiece: number, requires?: string,
  extra: { tech?: BotTech; pps?: number } = {}): BuildingDef {
  const def: BuildingDef = {
    id, name, basePrice, priceGrowth: 1.15, pps: extra.pps ?? 1, skill: id, clearSize, linesPerPiece,
    ...(extra.tech ? { tech: extra.tech } : {}),
    effects: [
      { target: 'income', filter: [`building:${id}`], op: 'add_pct', value: 10, stack: { type: 'owned', id, offset: -1 } },
    ],
  };
  if (requires) def.unlock = [{ type: 'owned', id: requires, gte: 1 }];
  return def;
}

export const BUILDINGS: BuildingDef[] = [
  tier('single', 'SINGLE', 30, 1, 0.8),
  // Measured over 5 seeds × 10,000 pieces of each bot (see bots.test.ts).
  tier('double', 'DOUBLE', 120, 2, 0.89, 'single'),
  tier('triple', 'TRIPLE', 300, 3, 0.95, 'double'),
  tier('tetris', 'TETRIS', 1_000, 4, 1.24, 'triple'),
  // Technique bots, paid only for their own technique. Their Lines per
  // piece come out close to each other (a single is worth too little for
  // combos to beat tetrises), so a higher tier plays faster instead: PPS is
  // set so PPS × Lines per piece hits the ladder's design step.
  tier('tspin', 'T-SPIN', 4_000, 4, 1.27, 'tetris', { tech: 'tspin', pps: 1.26 }),
  tier('allspin', 'ALL-SPIN', 16_000, 4, 1.33, 'tspin', { tech: 'allspin', pps: 1.35 }),
  tier('combo', 'COMBO', 66_000, 4, 1.17, 'allspin', { tech: 'combo', pps: 1.71 }),
  tier('b2b', 'B2B', 180_000, 4, 1.36, 'combo', { tech: 'b2b', pps: 1.62 }),
  tier('pc', 'PERFECT', 420_000, 4, 2.45, 'b2b', { tech: 'pc', pps: 1 }),
];

export const buildingById = (id: string): BuildingDef | undefined => BUILDINGS.find((b) => b.id === id);
