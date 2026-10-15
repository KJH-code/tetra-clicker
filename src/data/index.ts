import { BUILDINGS } from './buildings';
import { UPGRADES, type UpgradeDef } from './upgrades';
import type { Effect } from '../sim/effects';

// Every effect in the game, gathered from the data files. An upgrade's
// effects only apply once it is bought, so the loader adds that condition
// here and the data entries stay free of it.
export function upgradeEffects(upgrades: readonly UpgradeDef[]): Effect[] {
  return upgrades.flatMap((u) => u.effects.map((e) => ({ ...e, when: [...(e.when ?? []), { type: 'upgrade' as const, id: u.id }] })));
}

export function allEffects(): Effect[] {
  return [...BUILDINGS.flatMap((b) => b.effects), ...upgradeEffects(UPGRADES)];
}
