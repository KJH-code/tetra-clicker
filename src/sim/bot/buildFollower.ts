import type { Game } from '../game';
import { spawnPlacementFor } from '../game';
import { occupiedCells, WIDTH } from '../board';
import type { BotChoice } from './policy';
import { findMoves } from './cc/movegen';
import type { BuildStage } from '../fumen';

// Playing a named build: the first stage the board still fits (every filled
// cell is one the stage fills too) and is not yet done names the cells each
// piece type goes to. A piece in play or in hold that can land exactly on
// four empty cells of its own type in that stage goes there. Anything else
// (a queue the build cannot take, a board that left it) returns null and
// the caller plays on by search.
export function stageFor(game: Game, stages: readonly BuildStage[]): BuildStage | null {
  for (const stage of stages) {
    let fits = true, missing = false;
    for (let i = 0; i < stage.length; i++) {
      const filled = game.grid[i] !== 0;
      if (filled && stage[i] === null) { fits = false; break; }
      if (!filled && stage[i] !== null && stage[i] !== 'X') missing = true;
    }
    if (fits && missing) return stage;
  }
  return null;
}

export function followBuild(game: Game, stages: readonly BuildStage[]): BotChoice | null {
  const active = game.active;
  if (!active) return null;
  const stage = stageFor(game, stages);
  if (!stage) return null;
  const options: { useHold: boolean; piece: typeof active.piece }[] = [{ useHold: false, piece: active.piece }];
  const held = game.hold ?? (game.holdUsed ? null : game.next(1)[0] ?? null);
  if (held && held !== active.piece && !game.holdUsed) options.push({ useHold: true, piece: held });
  for (const o of options) {
    const from = o.useHold ? spawnPlacementFor(o.piece) : active;
    for (const m of findMoves(game.grid, from)) {
      const cells = occupiedCells(m.placement);
      if (cells.every(([x, y]) => stage[y * WIDTH + x] === o.piece && game.grid[y * WIDTH + x] === 0)) {
        return { placement: m.placement, useHold: o.useHold, inputs: m.inputs, path: m.path };
      }
    }
  }
  return null;
}
