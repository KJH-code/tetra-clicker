import type { Game } from '../game';
import type { BotChoice, BotPolicy } from './policy';
import { solvePc, moveFor, type PcStep } from './cc/pcf';
import { ccWasmBot, CC_DEFAULT, type CcWeights } from './ccWasm';

// PC loop: from an empty board, find a four-line perfect clear for the next
// ten pieces (plus hold) and play it, then do it again. When no PC can be
// found the bot plays a low, flat stack with Cold Clear and keeps
// looking for a PC from whatever board it has (up to six rows).
const PC_PREVIEW = 11;

// Low and flat, so a PC stays in reach after a miss.
export const PC_RECOVER: CcWeights = { ...CC_DEFAULT, perfect_clear: 3000, height: -80, top_half: -400, clear1: 0, clear2: 0, clear3: 0, clear4: 0 };

export function pcBot(): BotPolicy {
  const plans = new WeakMap<Game, PcStep[]>();
  const recover = ccWasmBot({ weights: PC_RECOVER, nodes: 3_000 });
  return {
    choose(game: Game): BotChoice | null {
      const active = game.active;
      if (!active) return null;
      let plan = plans.get(game);
      if (!plan || plan.length === 0) {
        const hold = game.hold;
        const seq = hold ? [hold, active.piece, ...game.preview(PC_PREVIEW - 2)] : [active.piece, ...game.preview(PC_PREVIEW - 1)];
        const empty = game.grid.every((c) => c === 0);
        plan = solvePc(game.grid, seq, empty ? 4 : 6, empty ? 400_000 : 60_000) ?? [];
        plans.set(game, plan);
      }
      const step = plan[0];
      if (step) {
        const useHold = active.piece !== step.piece;
        // Which piece comes into play if we hold: the held one, or the next.
        const piece = useHold ? (game.hold ?? game.next(1)[0]) : active.piece;
        const move = piece ? moveFor(game.grid, piece, step) : null;
        if (move) {
          plan.shift();
          return { placement: move.placement, useHold, inputs: move.inputs, path: move.path };
        }
        plans.set(game, []);
      }
      return recover.choose(game);
    },
  };
}
