import type { Game } from '../game';
import type { BotPolicy, BotChoice } from './policy';
import { STANDARD, maxHeight, type Weights } from './cc/eval';
import { search, type SearchOptions } from './cc/search';
import { findMoves } from './cc/movegen';

// A bot driven by the ported Cold Clear evaluation and search. Each building
// gives it its own weights (what it is paid for) and may veto moves, and may
// switch weights with the state of its board (a combo bot builds, then
// cuts). Above `panicHeight` rows it falls back to Cold Clear's stock
// weights, which are built to survive, so a bot never tops out chasing its
// technique; vetoes marked `strict` still hold then.
export interface Mode {
  weights: Weights;
  allow?: SearchOptions['allow'];
  bonus?: SearchOptions['bonus'];
}

export interface CcBotConfig extends Mode {
  width: number;
  depth: number;
  strict?: SearchOptions['allow'];
  panicHeight?: number;
  mode?: (game: Game, height: number) => Mode | null;
}

export function ccBot(cfg: CcBotConfig): BotPolicy {
  return {
    choose(game: Game): BotChoice | null {
      const active = game.active;
      if (!active) return null;
      const height = maxHeight(game.grid);
      const panic = height >= (cfg.panicHeight ?? 12);
      const mode: Mode = panic ? { weights: STANDARD } : cfg.mode?.(game, height) ?? cfg;
      const allow = mode.allow ?? (panic ? undefined : cfg.allow);
      const veto = (allow || cfg.strict)
        ? (m: Parameters<NonNullable<SearchOptions['allow']>>[0], l: Parameters<NonNullable<SearchOptions['allow']>>[1]) =>
          (!allow || allow(m, l)) && (!cfg.strict || cfg.strict(m, l))
        : undefined;
      const opts: SearchOptions = {
        weights: mode.weights, width: cfg.width, depth: cfg.depth,
        ...(veto ? { allow: veto } : {}),
        ...(mode.bonus ? { bonus: mode.bonus } : {}),
      };
      const d = search({
        grid: game.grid, current: active.piece, hold: game.hold, queue: game.next(cfg.depth + 1),
        combo: game.combo, b2b: game.b2b >= 0,
      }, opts);
      if (d) return { placement: d.move.placement, useHold: d.useHold, inputs: d.move.inputs, path: d.move.path };
      // Every move vetoed: take any legal one rather than stall.
      const any = findMoves(game.grid, active)[0];
      return any ? { placement: any.placement, useHold: false, inputs: any.inputs, path: any.path } : null;
    },
  };
}
