import type { Effect } from '../sim/effects';
import type { BotTech, GarbageBonus } from '../sim/attack';
import type { BoardMode } from '../sim/game';

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
  // A board that plays by other rules (walls, its own garbage).
  mode?: BoardMode;
  garbageBonus?: GarbageBonus;
}

function tier(id: string, name: string, basePrice: number, clearSize: 1 | 2 | 3 | 4, linesPerPiece: number, requires?: string,
  extra: { tech?: BotTech; pps?: number; mode?: BoardMode; garbageBonus?: GarbageBonus } = {}): BuildingDef {
  const def: BuildingDef = {
    id, name, basePrice, priceGrowth: 1.15, pps: extra.pps ?? 1, skill: id, clearSize, linesPerPiece,
    ...(extra.tech ? { tech: extra.tech } : {}),
    ...(extra.mode ? { mode: extra.mode } : {}),
    ...(extra.garbageBonus ? { garbageBonus: extra.garbageBonus } : {}),
    effects: [
      { target: 'income', filter: [`building:${id}`], op: 'add_pct', value: 10, stack: { type: 'owned', id, offset: -1 } },
    ],
  };
  if (requires) def.unlock = [{ type: 'owned', id: requires, gte: 1 }];
  return def;
}

export const BUILDINGS: BuildingDef[] = [
  tier('single', 'SINGLE', 110, 1, 0.8),
  // Measured over 5 seeds × 10,000 pieces of each bot (see bots.test.ts).
  tier('double', 'DOUBLE', 250, 2, 0.89, 'single'),
  tier('triple', 'TRIPLE', 900, 3, 0.95, 'double'),
  tier('tetris', 'TETRIS', 1_350, 4, 1.24, 'triple'),
  // Technique bots, paid only for their own technique. Their Lines per
  // piece come out close to each other (a single is worth too little for
  // combos to beat tetrises), so a higher tier plays faster instead: PPS is
  // set so PPS × Lines per piece hits the ladder's design step (1.6, 1.8,
  // 2.0, 2.2 Lines a second; PERFECT earns 2.45 at 1 PPS). Measured over
  // 3 seeds × 3,000 pieces (see tests/slow/tech-*.test.ts).
  tier('tspin', 'T-SPIN', 3_400, 4, 1.43, 'tetris', { tech: 'tspin', pps: 1.12 }),
  tier('allspin', 'ALL-SPIN', 13_000, 4, 1.45, 'tspin', { tech: 'allspin', pps: 1.24 }),
  tier('combo', 'COMBO', 32_000, 4, 1.18, 'allspin', { tech: 'combo', pps: 1.69 }),
  tier('b2b', 'B2B', 150_000, 4, 1.49, 'combo', { tech: 'b2b', pps: 1.48 }),
  tier('pc', 'PERFECT', 380_000, 4, 2.45, 'b2b', { tech: 'pc', pps: 1 }),
  // Past PERFECT the step grows to 0.3 Lines a second: 2.7, 3.0, 3.3.
  // DOWNSTACK's board throws up a garbage row every fourth piece, half of
  // them cheese; each garbage row cleared pays a single (2) on top, a
  // cheese row twice that. 4-WIDE's board has its walls built in. OPENER
  // loops PC, TSD, PC (src/sim/bot/openerBot.ts).
  tier('downstack', 'DOWNSTACK', 1_400_000, 4, 2.40, 'pc', {
    tech: 'downstack', pps: 1.125, mode: { garbageEvery: 4, cheese: 0.5 }, garbageBonus: { clean: 2, cheese: 4 },
  }),
  tier('fourwide', '4-WIDE', 3_800_000, 4, 2.918, 'downstack', { tech: 'fourwide', pps: 1.03, mode: { walls: 3 } }),
  tier('opener', 'OPENER', 16_000_000, 4, 2.064, 'fourwide', { tech: 'opener', pps: 1.6 }),
  // Three that reach into your board, steps 3.6, 3.9, 4.2. Their bots are
  // ones measured above (COMBO, DOWNSTACK, stock Cold Clear paid for B2B);
  // what they do to the manual board is in their effects and in world.ts.
  // HELPER lifts a garbage row every few combo or back-to-back clears of
  // yours (fewer the more you own: HELPER_EVERY); INVADER speeds your
  // garbage 5% a copy and pays your hands 10% a copy more; RIVAL's board
  // trades garbage with yours for as long as a life runs.
  tier('helper', 'HELPER', 46_000_000, 4, 1.18, 'opener', { tech: 'combo', pps: 3.05 }),
  tier('invader', 'INVADER', 160_000_000, 4, 2.40, 'helper', {
    tech: 'downstack', pps: 1.625, mode: { garbageEvery: 4, cheese: 0.5 }, garbageBonus: { clean: 2, cheese: 4 },
  }),
  tier('rival', 'RIVAL', 390_000_000, 4, 1.488, 'invader', { tech: 'b2b', pps: 2.82 }),
];

// HELPER: your combo or back-to-back clears per garbage row lifted, by copies owned.
export const HELPER_EVERY: [owned: number, every: number][] = [[10, 1], [3, 2], [2, 3], [1, 4]];
export const helperEvery = (owned: number): number => HELPER_EVERY.find(([n]) => owned >= n)?.[1] ?? 0;

// INVADER's reach into the manual board, per copy.
const INVADER_EFFECTS: Effect[] = [
  { target: 'garbage_speed', op: 'mul_pct', value: 5, stack: { type: 'owned', id: 'invader', offset: 0 } },
  { target: 'income', filter: ['board:manual'], op: 'add_pct', value: 10, stack: { type: 'owned', id: 'invader', offset: 0 } },
];
BUILDINGS.find((b) => b.id === 'invader')!.effects.push(...INVADER_EFFECTS);

export const buildingById = (id: string): BuildingDef | undefined => BUILDINGS.find((b) => b.id === id);
