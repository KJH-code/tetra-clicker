import { BUILDINGS } from './buildings';
import { UPGRADES, type UpgradeDef } from './upgrades';
import { CROWN_EFFECT, PRESTIGE_UPGRADES } from './prestige';
import type { Effect } from '../sim/effects';
import { HARDCORE_EFFECTS } from './hardcore';
import { ACHIEVEMENT_EFFECT } from './achievements';
import { CHALLENGE_EFFECT, challengeEffects } from './challenges';
import { GARBAGE_EFFECTS } from './garbage';
import { BOT_LINK_EFFECTS } from './botlinks';

// Every effect in the game, gathered from the data files. An upgrade's
// effects only apply once it is bought, so the loader adds that condition
// here and the data entries stay free of it.
export function upgradeEffects(upgrades: readonly UpgradeDef[]): Effect[] {
  return upgrades.flatMap((u) => u.effects.map((e) => ({ ...e, when: [...(e.when ?? []), { type: 'upgrade' as const, id: u.id }] })));
}

// Prestige upgrades the same way, on the prestige condition.
export function prestigeEffects(): Effect[] {
  return PRESTIGE_UPGRADES.flatMap((u) => u.effects.map((e) => ({ ...e, when: [...(e.when ?? []), { type: 'prestige' as const, id: u.id }] })));
}

export function allEffects(): Effect[] {
  return [...BUILDINGS.flatMap((b) => b.effects), ...upgradeEffects(UPGRADES), ...prestigeEffects(), CROWN_EFFECT, ACHIEVEMENT_EFFECT, CHALLENGE_EFFECT, ...HARDCORE_EFFECTS, ...GARBAGE_EFFECTS, ...BOT_LINK_EFFECTS, ...challengeEffects()];
}
