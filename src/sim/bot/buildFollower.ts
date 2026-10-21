import { Game, spawnPlacementFor } from '../game';
import { occupiedCells, WIDTH } from '../board';
import type { BotChoice } from './policy';
import { findMoves, replay } from './cc/movegen';
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

// Playing a build to the end of a stage, not a piece at a time. A stage
// starts only on a board that is exactly its leftovers (its X cells; an
// empty board for a first bag), and only when the visible queue, with the
// hold, can lay every one of its pieces: the moves are worked out on a copy
// of the game, clears and all, so a stage whose spins clear rows halfway
// through is followed past them. Null: no stage of this build can be
// finished from here, and the bot should not start one.
const PLAN_PIECES = 14;

export function planBuild(game: Game, stages: readonly BuildStage[]): BotChoice[] | null {
  if (!game.active) return null;
  for (const stage of stages) {
    if (!startsFrom(game, stage)) continue;
    const plan = layStage(new Game(1, game.snapshot()), [...stage], 0);
    if (plan && plan.length > 0) return plan;
  }
  return null;
}

function startsFrom(game: Game, stage: BuildStage): boolean {
  for (let i = 0; i < stage.length; i++) {
    if ((game.grid[i] !== 0) !== (stage[i] === 'X')) return false;
  }
  return true;
}

function layStage(game: Game, target: BuildStage, depth: number): BotChoice[] | null {
  if (!target.some((c, i) => c !== null && c !== 'X' && game.grid[i] === 0)) return [];
  if (depth >= PLAN_PIECES || !game.active) return null;
  const active = game.active;
  const options: { useHold: boolean; piece: typeof active.piece }[] = [{ useHold: false, piece: active.piece }];
  const held = game.hold ?? game.next(1)[0] ?? null;
  if (held && held !== active.piece && !game.holdUsed) options.push({ useHold: true, piece: held });
  for (const o of options) {
    const from = o.useHold ? spawnPlacementFor(o.piece) : active;
    for (const m of findMoves(game.grid, from)) {
      const cells = occupiedCells(m.placement);
      if (!cells.every(([x, y]) => target[y * WIDTH + x] === o.piece && game.grid[y * WIDTH + x] === 0)) continue;
      const copy = new Game(1, game.snapshot());
      if (o.useHold && !copy.swapHold()) continue;
      if (!replay(copy, m.inputs)) continue;
      const result = copy.hardDrop();
      if (result.topped) continue;
      const rest = layStage(copy, clearRows(target, result.clearedRows), depth + 1);
      if (rest) return [{ placement: m.placement, useHold: o.useHold, inputs: m.inputs, path: m.path }, ...rest];
    }
  }
  return null;
}

// The picture with the rows a clear took out, the rows above dropped into place.
function clearRows(target: BuildStage, rows: readonly number[]): BuildStage {
  if (rows.length === 0) return target;
  const gone = new Set(rows);
  const kept: StageCellRow[] = [];
  for (let y = 0; y < target.length / WIDTH; y++) if (!gone.has(y)) kept.push(target.slice(y * WIDTH, (y + 1) * WIDTH));
  const empty: StageCellRow[] = Array.from({ length: rows.length }, () => new Array(WIDTH).fill(null));
  return [...empty, ...kept].flat();
}
type StageCellRow = BuildStage;
