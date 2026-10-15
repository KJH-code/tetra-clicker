import type { BotPolicy } from './policy';
import { singleBot } from './singleBot';
import { sizeBot } from './sizeBot';
import type { Game, LockResult } from '../game';
import { cloneGrid, type Grid, type Placement } from '../board';

export const POLICIES: Record<string, BotPolicy> = {
  single: singleBot,
  double: sizeBot(2),
  triple: sizeBot(3),
  tetris: sizeBot(4),
};

export interface BotMove {
  from: Placement; // where the piece started (spawn)
  via: Placement; // after sliding/rotating on the spawn row
  to: Placement; // where it locked
  result: LockResult;
  // The grid as it was before the piece landed, so a renderer can replay the move.
  before: Grid;
  usedHold: boolean;
}

// One bot turn: choose, (hold,) slide, drop. Bots never spin, so the
// placement is set directly and the spin flag stays off.
export function playOne(game: Game, policy: BotPolicy): BotMove | null {
  if (!game.active) return null;
  const choice = policy.choose(game);
  if (!choice) return null;
  const before = cloneGrid(game.grid);
  if (choice.useHold && !game.swapHold()) return null;
  const from = { ...game.active! };
  if (from.piece !== choice.placement.piece || !game.setActive(choice.placement)) return null;
  const to = { ...choice.placement, y: game.ghostY() };
  const result = game.hardDrop();
  return { from, via: choice.placement, to, result, before, usedHold: choice.useHold };
}
