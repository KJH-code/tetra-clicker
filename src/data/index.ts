import { BUILDINGS } from './buildings';
import type { Effect } from '../sim/effects';

// Every effect in the game, gathered from the data files. Upgrades and
// prestige perks will push into this same list when they exist.
export function allEffects(): Effect[] {
  return BUILDINGS.flatMap((b) => b.effects);
}
