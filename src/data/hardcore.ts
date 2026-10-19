import type { Condition, Effect } from '../sim/effects';

// Hardcore: picked on the ascension screen for the next run. The run is one
// life (a top-out ascends it on the spot), harder from the first piece, and
// pays for it in risk weight and manual income.
const HC: Condition = { type: 'hardcore' };

export const HARDCORE_EFFECTS: Effect[] = [
  // Risk weight feeds crowns through a cube root: ×3 is about ×1.44 crowns,
  // before the manual ×2 adds Lines to weigh.
  { target: 'risk_weight', op: 'mul', value: 3, when: [HC] },
  { target: 'income', filter: ['board:manual'], op: 'mul', value: 2, when: [HC] },
  { target: 'start_level', op: 'add', value: 3, when: [HC] },
  // Timed cheese, gone from normal runs (garbage there comes from
  // purchases), stays here as a slow trickle from level 1: a third as
  // often as it once came.
  { target: 'timed_garbage', op: 'flag', value: 1, when: [HC] },
  { target: 'garbage_from_level', op: 'add', value: -2, when: [HC] },
  { target: 'garbage_interval', op: 'mul', value: 3, when: [HC] },
  // Only techniques earn in full; a plain clear pays half.
  { target: 'income', filter: ['board:manual', 'tech:none'], op: 'mul', value: 0.5, when: [HC] },
  // Three next pieces instead of five.
  { target: 'next_count', op: 'add', value: -2, when: [HC] },
  // Room for the four hardcore checks.
  { target: 'tech_cap', op: 'add', value: 0.5, when: [HC] },
];
