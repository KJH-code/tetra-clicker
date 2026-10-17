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
  // Garbage from level 1 instead of 3.
  { target: 'garbage_from_level', op: 'add', value: -2, when: [HC] },
  // Three next pieces instead of five.
  { target: 'next_count', op: 'add', value: -2, when: [HC] },
  // Room for the four hardcore checks.
  { target: 'tech_cap', op: 'add', value: 0.5, when: [HC] },
];
