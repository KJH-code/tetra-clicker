import type { BotPolicy } from './policy';
import { singleBot } from './singleBot';
import type { Game, LockResult } from '../game';
import { cloneGrid, type Grid, type Placement } from '../board';

export const POLICIES: Record<string, BotPolicy> = {
  single: singleBot,
};

export interface BotMove {
  from: Placement; // where the piece started (spawn)
  via: Placement; // after sliding/rotating on the spawn row
  to: Placement; // where it locked
  result: LockResult;
  // The grid as it was before the piece landed, so a renderer can replay the move.
  before: Grid;
}

// One bot turn: choose, slide, drop. Bots never spin, so the placement is set
// directly and the spin flag stays off.
export function playOne(game: Game, policy: BotPolicy): BotMove | null {
  const from = game.active ? { ...game.active } : null;
  const choice = policy.choose(game);
  if (!from || !choice) return null;
  const before = cloneGrid(game.grid);
  game.setActive(choice);
  const to = { ...choice, y: game.ghostY() };
  const result = game.hardDrop();
  return { from, via: choice, to, result, before };
}
