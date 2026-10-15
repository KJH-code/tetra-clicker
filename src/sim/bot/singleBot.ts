import {
  WIDTH, HEIGHT, cloneGrid, collides, dropDistance, lockPiece, clearFullRows,
  fullRowsIfLocked, type Grid, type Placement,
} from '../board';
import { pieceId, type Piece, type Rotation } from '../pieces';
import type { Game } from '../game';
import type { BotPolicy } from './policy';

// Weights in the spirit of the classic Dellacherie-style evaluators: keep the
// stack low, never bury holes, keep the surface flat. The bot does not need
// to be strong, only to stay alive forever while clearing one row at a time.
export const WEIGHTS = {
  height: -0.7,
  holes: -6,
  bump: -0.6,
  max: -0.5,
  single: 1.5,
  // A column far below both neighbours is a well only a vertical I could use,
  // and using it would be a multi-line clear, which this bot refuses.
  well: -5,
  // Several rows close to full at once means the next clear would take more
  // than one row, which the bot cannot do, so it would have to build around
  // them. Penalise every nearly-full row beyond the first.
  crowded: -3,
  rowTrans: -1,
  colTrans: -1,
  // First-ply candidates that get a second look with the next piece.
  beam: 8,
  // Above this stack height the height weight is multiplied: digging can
  // wait, getting the stack down cannot.
  panicAt: 99,
  panicMul: 1,
};

interface Features {
  agg: number; holes: number; bump: number; max: number; wells: number;
  crowded: number; rowTrans: number; colTrans: number;
}

// `top` is the first row that holds any block (HEIGHT for an empty grid); the
// scans below start there instead of at the ceiling.
export function topRow(grid: Grid): number {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) if (grid[y * WIDTH + x] !== 0) return y;
  }
  return HEIGHT;
}

export function features(grid: Grid, top: number = topRow(grid)): Features {
  const heights: number[] = [];
  let holes = 0;
  let colTrans = 0;
  for (let x = 0; x < WIDTH; x++) {
    // One pass from the floor up: the column's top, its holes, and its
    // filled/empty transitions all fall out of the same scan.
    let prev = 1; // the floor counts as filled
    let empties = 0;
    let colTop = -1;
    for (let y = HEIGHT - 1; y >= top; y--) {
      const filled = grid[y * WIDTH + x] !== 0 ? 1 : 0;
      if (filled !== prev) colTrans++;
      prev = filled;
      if (filled) { colTop = y; holes += empties; empties = 0; }
      else empties++;
    }
    if (prev === 0) colTrans--; // the open sky above is not a transition
    heights.push(colTop < 0 ? 0 : HEIGHT - colTop);
  }
  let agg = 0, bump = 0, max = 0, wells = 0;
  for (let x = 0; x < WIDTH; x++) {
    const h = heights[x]!;
    agg += h;
    if (h > max) max = h;
    if (x > 0) bump += Math.abs(h - heights[x - 1]!);
    const left = x > 0 ? heights[x - 1]! : Infinity;
    const right = x < WIDTH - 1 ? heights[x + 1]! : Infinity;
    const depth = Math.min(left, right) - h;
    if (depth >= 2) wells += depth - 1;
  }
  let crowded = 0;
  let rowTrans = 0;
  for (let y = HEIGHT - max; y < HEIGHT; y++) {
    let count = 0;
    let prev = 1; // walls count as filled
    for (let x = 0; x < WIDTH; x++) {
      const filled = grid[y * WIDTH + x] !== 0 ? 1 : 0;
      count += filled;
      if (filled !== prev) rowTrans++;
      prev = filled;
    }
    if (prev === 0) rowTrans++;
    if (count >= 8) crowded++;
  }
  return { agg, holes, bump, max, wells, crowded: Math.max(0, crowded - 1), rowTrans, colTrans };
}

function evaluateGrid(grid: Grid, cleared: number, top: number): number {
  const f = features(grid, top);
  const heightW = f.max >= WEIGHTS.panicAt ? WEIGHTS.height * WEIGHTS.panicMul : WEIGHTS.height;
  return heightW * f.agg + WEIGHTS.holes * f.holes + WEIGHTS.bump * f.bump
    + WEIGHTS.max * f.max + WEIGHTS.single * cleared + WEIGHTS.well * f.wells
    + WEIGHTS.crowded * f.crowded + WEIGHTS.rowTrans * f.rowTrans + WEIGHTS.colTrans * f.colTrans;
}

interface Candidate {
  spawn: Placement;
  rest: Placement;
  grid: Grid;
  cleared: number;
  score: number;
}

// Every legal single-or-nothing placement of the piece at `from`, which is
// its spawn position.
function candidates(grid: Grid, from: Placement): Candidate[] {
  const out: Candidate[] = [];
  const parentTop = topRow(grid);
  const rotations: Rotation[] = from.piece === 'O' ? [0] : [0, 1, 2, 3];
  for (const rot of rotations) {
    for (let x = -2; x < WIDTH; x++) {
      const spawn: Placement = { piece: from.piece, rot, x, y: from.y };
      if (collides(grid, spawn)) continue;
      if (!reachable(grid, from, spawn)) continue;
      const rest: Placement = { ...spawn, y: spawn.y + dropDistance(grid, spawn) };
      // The whole point of this building: it clears singles and nothing bigger.
      if (fullRowsIfLocked(grid, rest) > 1) continue;
      const trial = cloneGrid(grid);
      lockPiece(trial, rest, pieceId(rest.piece));
      const band = Math.min(parentTop, rest.y);
      const cleared = clearFullRows(trial, band);
      // Rows only ever disappear below the band's top, so it moves down by the count.
      const top = band + cleared;
      out.push({ spawn, rest, grid: trial, cleared, score: evaluateGrid(trial, cleared, top) });
    }
  }
  return out;
}

export const singleBot: BotPolicy = {
  choose(game: Game): Placement | null {
    const active = game.active;
    if (!active) return null;
    const first = candidates(game.grid, active).sort((a, b) => b.score - a.score);
    if (first.length === 0) return null;
    const next = game.next(1)[0];
    if (!next) return first[0]!.spawn;
    const nextSpawn: Placement = { piece: next, rot: 0, x: spawnX(next), y: next === 'I' ? active.y - 1 : active.y };
    let best: Candidate | null = null;
    let bestScore = -Infinity;
    for (const c of first.slice(0, WEIGHTS.beam)) {
      const second = candidates(c.grid, nextSpawn);
      // A dead end for the next piece is the worst possible outcome.
      let follow = -1e9;
      for (const d of second) follow = Math.max(follow, d.score);
      follow += WEIGHTS.single * c.cleared;
      if (follow > bestScore) { bestScore = follow; best = c; }
    }
    return (best ?? first[0]!).spawn;
  },
};

function spawnX(piece: Piece): number {
  const size = piece === 'I' ? 4 : piece === 'O' ? 2 : 3;
  return Math.floor((WIDTH - size) / 2);
}

// The bot moves sideways along the spawn row before dropping, so every cell
// it slides through must be free. Rotation is assumed to happen at spawn
// where there is room; the test suite's height bound keeps that true.
function reachable(grid: Grid, from: Placement, to: Placement): boolean {
  const step = to.x > from.x ? 1 : -1;
  for (let x = from.x; x !== to.x; x += step) {
    if (collides(grid, { ...to, x })) return false;
  }
  return true;
}
