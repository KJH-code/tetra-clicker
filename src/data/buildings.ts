import type { Effect } from '../sim/effects';

// A building is a bot skill tier. Owning the first copy unlocks its board;
// every further copy is a flat percentage on that building's income.
// `skill` names the placement policy the bot uses (sim/bot/index.ts).
export interface BuildingDef {
  id: string;
  name: string;
  basePrice: number;
  priceGrowth: number;
  pps: number;
  skill: 'single';
  effects: Effect[];
  unlock?: Effect['when'];
}

// Placeholder numbers until the economy simulator decides real ones.
export const BUILDINGS: BuildingDef[] = [
  {
    id: 'single',
    name: 'SINGLE',
    basePrice: 15,
    priceGrowth: 1.15,
    pps: 1,
    skill: 'single',
    effects: [
      { target: 'income', filter: ['building:single'], op: 'add_pct', value: 10, stack: { type: 'owned', id: 'single', offset: -1 } },
    ],
  },
];

export const buildingById = (id: string): BuildingDef | undefined => BUILDINGS.find((b) => b.id === id);
