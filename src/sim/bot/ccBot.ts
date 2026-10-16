import type { Game } from '../game';
import type { BotPolicy, BotChoice } from './policy';
import { STANDARD, maxHeight, type Weights } from './cc/eval';
import { search, type SearchOptions } from './cc/search';
import { findMoves } from './cc/movegen';

// A bot driven by the ported Cold Clear evaluation and search. Each building
// gives it its own weights (what it is paid for) and may veto moves; above
// `panicHeight` rows it falls back to Cold Clear's stock weights, which are
// built to survive, so a bot never tops out chasing its technique.
export interface CcBotConfig {
  weights: Weights;
  width: number;
  depth: number;
  allow?: SearchOptions['allow'];
  bonus?: SearchOptions['bonus'];
  panicHeight?: number;
}

export function ccBot(cfg: CcBotConfig): BotPolicy {
  return {
    choose(game: Game): BotChoice | null {
      const active = game.active;
      if (!active) return null;
      const panic = maxHeight(game.grid) >= (cfg.panicHeight ?? 12);
      const opts: SearchOptions = panic
        ? { weights: STANDARD, width: cfg.width, depth: cfg.depth, ...(cfg.allow ? { allow: cfg.allow } : {}) }
        : { weights: cfg.weights, width: cfg.width, depth: cfg.depth, ...(cfg.allow ? { allow: cfg.allow } : {}), ...(cfg.bonus ? { bonus: cfg.bonus } : {}) };
      const d = search({
        grid: game.grid, current: active.piece, hold: game.hold, queue: game.next(cfg.depth),
        combo: game.combo, b2b: game.b2b >= 0,
      }, opts);
      if (d) return { placement: d.move.placement, useHold: d.useHold, inputs: d.move.inputs, path: d.move.path };
      // Every move vetoed: take any legal one rather than stall.
      const any = findMoves(game.grid, active)[0];
      return any ? { placement: any.placement, useHold: false, inputs: any.inputs, path: any.path } : null;
    },
  };
}
