import type { BotPolicy } from './policy';
import { singleBot } from './singleBot';
import { sizeBot } from './sizeBot';
import { tspinBot, allspinBot, comboBot, b2bBot, tspinTstBot, b2bComboBot } from './techBots';
import { pcBot } from './pcBot';
import type { Game, LockResult } from '../game';
import { cloneGrid, type Grid, type Placement } from '../board';
import { replay } from './cc/movegen';

export const POLICIES: Record<string, BotPolicy> = {
  single: singleBot,
  double: sizeBot(2),
  triple: sizeBot(3),
  tetris: sizeBot(4),
  tspin: tspinBot(),
  allspin: allspinBot(),
  combo: comboBot(),
  b2b: b2bBot(),
  pc: pcBot(),
  // Switched to by play synergies.
  tspin_tst: tspinTstBot(),
  b2b_combo: b2bComboBot(),
};

export interface BotMove {
  from: Placement; // where the piece started (spawn)
  via: Placement; // after sliding/rotating on the spawn row
  to: Placement; // where it locked
  result: LockResult;
  // The grid as it was before the piece landed, so a renderer can replay the move.
  before: Grid;
  usedHold: boolean;
  // Every position on the way, when the move was played input by input.
  path?: Placement[];
}

// One bot turn: choose, (hold,) then either play the chosen inputs (bots
// that spin) or slide to the spot and drop (bots that never spin, whose
// placement is set directly so the spin flag stays off).
export function playOne(game: Game, policy: BotPolicy): BotMove | null {
  if (!game.active) return null;
  const choice = policy.choose(game);
  if (!choice) return null;
  const before = cloneGrid(game.grid);
  if (choice.useHold && !game.swapHold()) return null;
  const from = { ...game.active! };
  if (choice.inputs) {
    if (from.piece !== choice.placement.piece || !replay(game, choice.inputs)) return null;
    const at = game.active!;
    if (at.x !== choice.placement.x || at.rot !== choice.placement.rot) return null;
    const result = game.hardDrop();
    return { from, via: choice.path?.[Math.max(0, choice.path.length - 2)] ?? at, to: choice.placement, result, before, usedHold: choice.useHold, ...(choice.path ? { path: choice.path } : {}) };
  }
  if (from.piece !== choice.placement.piece || !game.setActive(choice.placement)) return null;
  const to = { ...choice.placement, y: game.ghostY() };
  const result = game.hardDrop();
  return { from, via: choice.placement, to, result, before, usedHold: choice.useHold };
}
