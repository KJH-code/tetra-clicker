import type { Game } from '../game';
import { spawnPlacementFor } from '../game';
import { HEIGHT, WIDTH, occupiedCells, type Grid } from '../board';
import { PIECES, type Piece } from '../pieces';
import type { BotChoice, BotPolicy } from './policy';
import { findMoves, type Move } from './cc/movegen';

// Bots driven by Cold Clear itself (engine/, built to src/engine/cold-clear.wasm).
// The module is handed in once at startup: the page compiles it
// asynchronously, tests and workers read it from disk.

interface EngineExports {
  memory: WebAssembly.Memory;
  io(): number;
  suggest(nodes: number, seed: number): number;
}

let engine: EngineExports | null = null;

export function installEngine(instance: WebAssembly.Instance): void {
  engine = instance.exports as unknown as EngineExports;
}

export const engineInstalled = (): boolean => engine !== null;

// Cold Clear's Standard evaluator, field for field (engine/bot/src/evaluation/standard.rs).
export interface CcWeights {
  back_to_back: number; bumpiness: number; bumpiness_sq: number; row_transitions: number;
  height: number; top_half: number; top_quarter: number; jeopardy: number;
  cavity_cells: number; cavity_cells_sq: number; overhang_cells: number; overhang_cells_sq: number;
  covered_cells: number; covered_cells_sq: number;
  tslot: [number, number, number, number];
  well_depth: number; max_well_depth: number;
  well_column: number[];
  b2b_clear: number; clear1: number; clear2: number; clear3: number; clear4: number;
  tspin1: number; tspin2: number; tspin3: number; mini_tspin1: number; mini_tspin2: number;
  perfect_clear: number; combo_garbage: number; move_time: number; wasted_t: number;
  // Added to the engine for this project: full spins by pieces other than T,
  // clearing 1..4 rows (only counted when a mode turns all-spins on).
  allspin: [number, number, number, number];
}

// Cold Clear's tuned defaults.
export const CC_DEFAULT: CcWeights = {
  back_to_back: 52, bumpiness: -24, bumpiness_sq: -7, row_transitions: -5,
  height: -39, top_half: -150, top_quarter: -511, jeopardy: -11,
  cavity_cells: -173, cavity_cells_sq: -3, overhang_cells: -34, overhang_cells_sq: -1,
  covered_cells: -17, covered_cells_sq: -1,
  tslot: [8, 148, 192, 407],
  well_depth: 57, max_well_depth: 17,
  well_column: [20, 23, 20, 50, 59, 21, 59, 10, -10, 24],
  b2b_clear: 104, clear1: -143, clear2: -100, clear3: -58, clear4: 390,
  tspin1: 121, tspin2: 410, tspin3: 602, mini_tspin1: -158, mini_tspin2: -93,
  perfect_clear: 999, combo_garbage: 150, move_time: -3, wasted_t: -152,
  allspin: [0, 0, 0, 0],
};

function flatten(w: CcWeights): number[] {
  return [
    w.back_to_back, w.bumpiness, w.bumpiness_sq, w.row_transitions,
    w.height, w.top_half, w.top_quarter, w.jeopardy,
    w.cavity_cells, w.cavity_cells_sq, w.overhang_cells, w.overhang_cells_sq,
    w.covered_cells, w.covered_cells_sq,
    ...w.tslot, w.well_depth, w.max_well_depth, ...w.well_column,
    w.b2b_clear, w.clear1, w.clear2, w.clear3, w.clear4,
    w.tspin1, w.tspin2, w.tspin3, w.mini_tspin1, w.mini_tspin2,
    w.perfect_clear, w.combo_garbage, w.move_time, w.wasted_t,
    ...w.allspin,
  ];
}

// Cold Clear's PlacementKind, in the order glue/src/lib.rs numbers them.
export type CcKind = 'none' | 'clear1' | 'clear2' | 'clear3' | 'clear4'
  | 'mini' | 'mini1' | 'mini2' | 'tspin' | 'tspin1' | 'tspin2' | 'tspin3'
  | 'allspin' | 'allspin1' | 'allspin2' | 'allspin3' | 'allspin4';
const KINDS: CcKind[] = ['none', 'clear1', 'clear2', 'clear3', 'clear4', 'mini', 'mini1', 'mini2', 'tspin', 'tspin1', 'tspin2', 'tspin3',
  'allspin', 'allspin1', 'allspin2', 'allspin3', 'allspin4'];

export interface CcMode {
  weights: CcWeights;
  // Placements the bot never makes while another is available.
  forbid?: CcKind[];
  // Let the engine see spins by pieces other than T (this game's rule).
  allSpins?: boolean;
}

export interface CcBotConfig extends CcMode {
  // Search size per piece: more nodes, stronger play, slower.
  nodes: number;
  // Next pieces the engine sees (the bag is seeded, so a bot may look
  // further ahead than the player's preview).
  preview?: number;
  // Switch weights with the board (a combo bot builds, then cuts).
  mode?: (game: Game) => CcMode | null;
}

// Rows from the floor to the highest filled cell.
export function stackHeight(grid: Grid): number {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) if (grid[y * WIDTH + x]) return HEIGHT - y;
  }
  return 0;
}

// Buffer offsets, mirrored from engine/glue/src/lib.rs.
const IN_HOLD = 40, IN_B2B = 41, IN_COMBO = 42, IN_QLEN = 43, IN_QUEUE = 44, IN_FORBID = 64, IN_ALLSPIN = 65, IN_WEIGHTS = 100;
const OUT_FOUND = 300, OUT_HOLD = 301, OUT_CELLS = 302, OUT_SPIN = 310, OUT_NODES = 400;
const PREVIEW = 5;

// Same position, same seed: the search is a Monte-Carlo one, so the seed
// comes from the position itself and a reloaded save replays identically.
function positionSeed(grid: Grid, queue: readonly Piece[], hold: Piece | null): number {
  let h = 2166136261;
  for (let i = 0; i < grid.length; i++) h = Math.imul(h ^ (grid[i] ? 1 : 0), 16777619);
  for (const p of queue) h = Math.imul(h ^ PIECES.indexOf(p), 16777619);
  h = Math.imul(h ^ (hold ? PIECES.indexOf(hold) + 1 : 0), 16777619);
  return h >>> 0;
}

export interface EngineDecision {
  useHold: boolean;
  // Landing cells in this project's coordinates (y down).
  cells: [number, number][];
  spin: 'none' | 'mini' | 'full';
  nodes: number;
}

// One Cold Clear search from the game's position.
export function engineSuggest(game: Game, mode: CcMode, nodes: number, preview = PREVIEW): EngineDecision | null {
  if (!engine) throw new Error('Cold Clear engine not installed');
  const active = game.active;
  if (!active) return null;
  const io = new Int32Array(engine.memory.buffer, engine.io(), 512);
  for (let y = 0; y < HEIGHT; y++) {
    let row = 0;
    const gy = HEIGHT - 1 - y;
    for (let x = 0; x < WIDTH; x++) if (game.grid[gy * WIDTH + x]) row |= 1 << x;
    io[y] = row;
  }
  const hold = game.hold;
  const queue = [active.piece, ...game.preview(preview)];
  io[IN_HOLD] = hold ? PIECES.indexOf(hold) : -1;
  io[IN_B2B] = game.b2b >= 0 ? 1 : 0;
  io[IN_COMBO] = game.combo + 1;
  io[IN_QLEN] = queue.length;
  queue.forEach((p, i) => { io[IN_QUEUE + i] = PIECES.indexOf(p); });
  io[IN_FORBID] = (mode.forbid ?? []).reduce((m, k) => m | (1 << KINDS.indexOf(k)), 0);
  io[IN_ALLSPIN] = mode.allSpins ? 1 : 0;
  flatten(mode.weights).forEach((v, i) => { io[IN_WEIGHTS + i] = v; });
  if (!engine.suggest(nodes, positionSeed(game.grid, queue, hold))) return null;
  // The buffer may have moved if the search grew memory.
  const out = new Int32Array(engine.memory.buffer, engine.io(), 512);
  const cells: [number, number][] = [];
  for (let i = 0; i < 4; i++) cells.push([out[OUT_CELLS + 2 * i]!, HEIGHT - 1 - out[OUT_CELLS + 2 * i + 1]!]);
  return {
    useHold: out[OUT_HOLD] === 1,
    cells,
    spin: (['none', 'mini', 'full'] as const)[out[OUT_SPIN]!]!,
    nodes: out[OUT_NODES]!,
  };
}

const cellKey = (cells: readonly (readonly [number, number])[]): string =>
  cells.map(([x, y]) => y * WIDTH + x).sort((a, b) => a - b).join(',');

// Turn the engine's landing spot into this game's inputs. Our own move
// generator walks every reachable spot with its input path, so the piece is
// steered by this project's kicks and the spin is judged by its rules;
// among paths to the same cells, the one with the engine's spin wins.
export function moveFor(game: Game, d: EngineDecision): { move: Move; useHold: boolean } | null {
  const active = game.active!;
  const piece = d.useHold ? game.hold ?? game.next(1)[0]! : active.piece;
  const moves = findMoves(game.grid, d.useHold ? spawnPlacementFor(piece) : active);
  const want = cellKey(d.cells);
  const same = moves.filter((m) => cellKey(occupiedCells(m.placement)) === want);
  const move = same.find((m) => m.spin === d.spin) ?? same[0];
  return move ? { move, useHold: d.useHold } : null;
}

export function ccWasmBot(cfg: CcBotConfig): BotPolicy {
  return {
    choose(game: Game): BotChoice | null {
      const active = game.active;
      if (!active) return null;
      const mode = cfg.mode?.(game) ?? cfg;
      const d = engineSuggest(game, mode, cfg.nodes, cfg.preview);
      const m = d ? moveFor(game, d) : null;
      if (m) return { placement: m.move.placement, useHold: m.useHold, inputs: m.move.inputs, path: m.move.path };
      // The engine sees no way to live, or found a spot our rules cannot
      // reach: any legal move rather than stall.
      const any = findMoves(game.grid, active)[0];
      return any ? { placement: any.placement, useHold: false, inputs: any.inputs, path: any.path } : null;
    },
  };
}
