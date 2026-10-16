// Perfect clear finder, ported from pcf (MinusKelvin/pcf), MIT License,
// Copyright (c) 2020 MinusKelvin. See THIRD_PARTY.md.
//
// The method: work in a frame of the bottom H rows as they will look once
// the PC is done (every cell filled). First tile the frame's empty cells
// with piece placements, ignoring order; a placement may skip rows, which
// are rows that will have cleared before that piece goes down. Then look for
// an order the queue (with hold) allows in which every piece, on the board
// as it really is at that moment (full rows gone), is supported and
// reachable from spawn.

import { WIDTH, HEIGHT, createGrid, type Grid, type Placement as BoardPlacement } from '../../board';
import { cellsOf, PIECES, type Piece, type Rotation } from '../../pieces';
import { spawnPlacementFor } from '../../game';
import { findMoves, type Move } from './movegen';

const FULL = (1 << WIDTH) - 1;

export interface PcPlacement {
  piece: Piece;
  // Cells per frame row (bit x), frame row 0 at the bottom.
  rows: number[];
  // Frame rows it skips (they must clear before it goes down).
  hurdles: number[];
  // Cells directly under it, per row, that are not its own.
  below: number[];
  onFloor: boolean;
}

// --- placements -----------------------------------------------------------

// Each rotation's cells as bottom-up row masks, at x = 0.
function shapeRows(piece: Piece, rot: Rotation): number[][] {
  const cells = cellsOf(piece, rot);
  const maxY = Math.max(...cells.map(([, y]) => y));
  const minX = Math.min(...cells.map(([x]) => x));
  const rows: number[][] = [];
  for (const [x, y] of cells) {
    const r = maxY - y;
    (rows[r] ??= []).push(x - minX);
  }
  return rows.filter(Boolean);
}

function choose(n: number, k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]): void => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

const placementCache = new Map<number, PcPlacement[]>();
// Placements by their first cell in pcf's scan order (leftmost column,
// then lowest row): filling the first empty cell can only use a placement
// that starts there, since anything earlier in it would already be filled.
const byFirstCell = new Map<number, PcPlacement[][]>();

function firstCell(p: PcPlacement): number {
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < p.rows.length; y++) if (p.rows[y]! & (1 << x)) return x * 8 + y;
  }
  return -1;
}

function indexed(height: number): PcPlacement[][] {
  let idx = byFirstCell.get(height);
  if (!idx) {
    idx = Array.from({ length: WIDTH * 8 }, () => []);
    for (const p of placementsFor(height)) idx[firstCell(p)]!.push(p);
    byFirstCell.set(height, idx);
  }
  return idx;
}

// Every placement of every piece in an H-row frame, rows possibly skipped.
export function placementsFor(height: number): PcPlacement[] {
  const cached = placementCache.get(height);
  if (cached) return cached;
  const out: PcPlacement[] = [];
  const seen = new Set<string>();
  for (const piece of PIECES) {
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      const shape = shapeRows(piece, rot);
      const width = Math.max(...shape.flat()) + 1;
      for (const frameRows of choose(height, shape.length)) {
        for (let x = 0; x + width <= WIDTH; x++) {
          const rows = new Array(height).fill(0);
          shape.forEach((xs, i) => { for (const cx of xs) rows[frameRows[i]!] |= 1 << (x + cx); });
          const key = `${piece}:${rows.join(',')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const hurdles: number[] = [];
          for (let y = frameRows[0]!; y <= frameRows[frameRows.length - 1]!; y++) if (!rows[y]) hurdles.push(y);
          const below = new Array(height).fill(0);
          for (let y = 1; y < height; y++) below[y - 1] = rows[y]! & ~rows[y - 1]!;
          // A cell resting over a hurdled row rests on the row under it.
          for (const hy of hurdles) if (hy > 0) below[hy - 1] |= rows[hy + 1] ?? 0;
          out.push({ piece, rows, hurdles, below, onFloor: rows[0] !== 0 });
        }
      }
    }
  }
  placementCache.set(height, out);
  return out;
}

// --- combinations ---------------------------------------------------------

type Counts = Record<Piece, number>;

function countsOf(pieces: Piece[]): Counts {
  const c = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 } as Counts;
  for (const p of pieces) c[p]++;
  return c;
}

const EVEN = 0b0101010101;

function popcount(n: number): number {
  let c = 0;
  while (n) { n &= n - 1; c++; }
  return c;
}

// pcf's vertical parity check: only L, J, vertical T and vertical I change
// the balance between even and odd columns, so a board too lopsided for the
// pieces left cannot be finished.
function verticalParityOk(board: number[], c: Counts): boolean {
  let even = 0, odd = 0, empty = 0;
  for (const r of board) { even += popcount(r & EVEN); odd += popcount(r & ~EVEN & FULL); empty += WIDTH - popcount(r); }
  const remaining = empty / 4;
  const parity = Math.abs(even - odd) / 2;
  const canChange = c.L + c.J + c.T + 2 * c.I;
  if (parity > canChange) return false;
  const nonLJ = c.S + c.Z + c.T + c.I + c.O;
  const mustChange = remaining - Math.min(nonLJ, remaining);
  return !(canChange === mustChange && ((parity ^ mustChange) & 1) !== 0);
}

function supportedWithoutClears(p: PcPlacement, on: number[]): boolean {
  for (const hy of p.hurdles) if (on[hy] !== FULL) return false;
  if (p.onFloor) return true;
  for (let y = 0; y < on.length; y++) if (p.below[y]! & on[y]!) return true;
  return false;
}

// pcf: if some placements can only go down after each other has cleared a
// line for them, no order exists. Grow the support from everything that is
// not one of the placements, adding any placement that rests on it.
function hasCyclicDependency(initial: number[], placed: PcPlacement[], frameFull: number[]): boolean {
  const supports = frameFull.map((f, y) => {
    let r = f;
    for (const p of placed) r &= ~p.rows[y]!;
    return r | initial[y]!;
  });
  const done = new Set<PcPlacement>();
  for (;;) {
    let progressed = false;
    for (const p of placed) {
      if (done.has(p)) continue;
      if (supportedWithoutClears(p, supports)) {
        for (let y = 0; y < supports.length; y++) supports[y]! |= p.rows[y]!;
        done.add(p);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return done.size !== placed.length;
}

function findCombinations(board: number[], available: Counts, budget: { nodes: number }, visit: (combo: PcPlacement[]) => boolean): void {
  const h = board.length;
  const idx = indexed(h);
  const frameFull = new Array(h).fill(FULL);
  const combo: PcPlacement[] = [];
  const rec = (b: number[]): boolean => {
    if (--budget.nodes < 0) return true;
    let tx = -1, ty = -1;
    for (let x = 0; x < WIDTH && tx < 0; x++) {
      for (let y = 0; y < h; y++) if (!(b[y]! & (1 << x))) { tx = x; ty = y; break; }
    }
    if (tx < 0) return visit(combo);
    for (const p of idx[tx * 8 + ty]!) {
      if (available[p.piece] === 0) continue;
      let ok = true;
      for (let y = 0; y < h; y++) if (p.rows[y]! & b[y]!) { ok = false; break; }
      if (!ok) continue;
      const nb = b.map((r, y) => r | p.rows[y]!);
      available[p.piece]--;
      combo.push(p);
      let stop = false;
      if (!hasCyclicDependency(board, combo, frameFull) && verticalParityOk(nb, available)) stop = rec(nb);
      combo.pop();
      available[p.piece]++;
      if (stop) return true;
    }
    return false;
  };
  rec(board);
}

// --- ordering -------------------------------------------------------------

// The board as the game really holds it: frame rows that are full have
// cleared, everything above drops. Returns a game grid and, for mapping a
// placement into it, which compressed row each frame row became.
function realGrid(frame: number[]): { grid: Grid; rowOf: number[] } {
  const grid = createGrid();
  const rowOf: number[] = [];
  let r = 0;
  for (let y = 0; y < frame.length; y++) {
    if (frame[y] === FULL) { rowOf.push(-1); continue; }
    rowOf.push(r);
    const gy = HEIGHT - 1 - r;
    for (let x = 0; x < WIDTH; x++) if (frame[y]! & (1 << x)) grid[gy * WIDTH + x] = 8;
    r++;
  }
  return { grid, rowOf };
}

// Where a placement's cells sit on the real board, or null if it spans a
// row that has not cleared yet (it would have to float through it).
function realCells(p: PcPlacement, frame: number[], rowOf: number[]): string | null {
  const used: number[] = [];
  for (let y = 0; y < frame.length; y++) if (p.rows[y]) used.push(y);
  for (let y = used[0]!; y <= used[used.length - 1]!; y++) {
    if (!p.rows[y] && frame[y] !== FULL) return null;
    if (p.rows[y] && frame[y] === FULL) return null;
  }
  const cells: number[] = [];
  for (const y of used) {
    const gy = HEIGHT - 1 - rowOf[y]!;
    for (let x = 0; x < WIDTH; x++) if (p.rows[y]! & (1 << x)) cells.push(gy * 16 + x);
  }
  return cells.sort((a, b) => a - b).join(',');
}

function cellKey(p: BoardPlacement): string {
  return cellsOf(p.piece, p.rot).map(([cx, cy]) => (p.y + cy) * 16 + p.x + cx).sort((a, b) => a - b).join(',');
}

export interface PcStep {
  piece: Piece;
  cells: string; // real-board cell key the piece must cover
}

// pcf's PieceSequence: the first two pieces are reachable (hold); placing
// the second keeps the first.
function nextOptions(seq: Piece[]): number[] {
  return seq.length >= 2 && seq[0] !== seq[1] ? [0, 1] : seq.length >= 1 ? [0] : [];
}

// A placement resting on the floor or the stack whose columns are open all
// the way up can simply be dropped in; only the rest need a move search.
function droppable(grid: Grid, cells: string): { supported: boolean; open: boolean } {
  const cs = cells.split(',').map(Number).map((c) => [c % 16, Math.floor(c / 16)] as const);
  const mine = new Set(cs.map(([x, y]) => y * 16 + x));
  let supported = false;
  let open = true;
  for (const [x, y] of cs) {
    if (y === HEIGHT - 1 || (grid[(y + 1) * WIDTH + x] !== 0 && !mine.has((y + 1) * 16 + x))) supported = true;
    for (let yy = y - 1; yy >= 0 && open; yy--) {
      if (mine.has(yy * 16 + x)) break;
      if (grid[yy * WIDTH + x] !== 0) open = false;
    }
  }
  return { supported, open };
}

function orderCombo(frame: number[], combo: PcPlacement[], seq: Piece[], budget: { nodes: number }, moveCache: Map<string, Set<string>>): PcStep[] | null {
  const reachable = (grid: Grid, gridKey: string, piece: Piece): Set<string> => {
    const k = `${gridKey}|${piece}`;
    let s = moveCache.get(k);
    if (!s) {
      s = new Set(findMoves(grid, spawnPlacementFor(piece)).map((m) => cellKey(m.placement)));
      moveCache.set(k, s);
    }
    return s;
  };
  const steps: PcStep[] = [];
  const rec = (b: number[], remaining: PcPlacement[], q: Piece[]): boolean => {
    if (remaining.length === 0) return true;
    if (--budget.nodes < 0) return false;
    const { grid, rowOf } = realGrid(b);
    const gridKey = b.join(',');
    for (const qi of nextOptions(q)) {
      const piece = q[qi]!;
      const tried = new Set<string>();
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i]!;
        if (p.piece !== piece) continue;
        const cells = realCells(p, b, rowOf);
        if (!cells || tried.has(cells)) continue;
        tried.add(cells);
        const d = droppable(grid, cells);
        if (!d.supported) continue;
        if (!d.open && !reachable(grid, gridKey, piece).has(cells)) continue;
        const nb = b.map((r, y) => r | p.rows[y]!);
        const nq = [...q];
        nq.splice(qi, 1);
        steps.push({ piece, cells });
        if (rec(nb, remaining.filter((_, j) => j !== i), nq)) return true;
        steps.pop();
      }
    }
    return false;
  };
  return rec(frame, combo, seq) ? [...steps] : null;
}

// Find a perfect clear of the bottom rows of `grid` (empty above them) with
// `seq` = [hold or current, current or next, …]. Tries the lowest frame that
// can work first, up to `maxHeight` rows. `nodes` bounds the work.
export function solvePc(grid: Grid, seq: Piece[], maxHeight = 4, nodes = 200_000): PcStep[] | null {
  const rows: number[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    let r = 0;
    const base = (HEIGHT - 1 - y) * WIDTH;
    for (let x = 0; x < WIDTH; x++) if (grid[base + x] !== 0) r |= 1 << x;
    rows.push(r);
  }
  let top = 0;
  for (let y = 0; y < HEIGHT; y++) if (rows[y]) top = y + 1;
  if (top > maxHeight) return null;
  const filled = rows.slice(0, maxHeight).reduce((n, r) => n + popcount(r), 0);
  const budget = { nodes };
  const moveCache = new Map<string, Set<string>>();
  for (let h = Math.max(top, 1); h <= maxHeight; h++) {
    const empty = h * WIDTH - filled;
    if (empty <= 0 || empty % 4 !== 0) continue;
    const pieces = empty / 4;
    if (seq.length < pieces) break;
    const usable = seq.slice(0, pieces + 1);
    const frame = rows.slice(0, h);
    let found: PcStep[] | null = null;
    findCombinations(frame, countsOf(usable), budget, (combo) => {
      found = orderCombo(frame, combo, usable, budget, moveCache);
      return found !== null || budget.nodes < 0;
    });
    if (found) return found;
    if (budget.nodes < 0) return null;
  }
  return null;
}


// The move on the real board that covers a step's cells.
export function moveFor(grid: Grid, piece: Piece, step: PcStep): Move | null {
  if (step.piece !== piece) return null;
  return findMoves(grid, spawnPlacementFor(piece)).find((m) => cellKey(m.placement) === step.cells) ?? null;
}
