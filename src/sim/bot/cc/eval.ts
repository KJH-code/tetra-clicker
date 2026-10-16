// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from Cold Clear, bot/src/evaluation/standard.rs (MinusKelvin/cold-clear).
// Board geometry here is y-up from the floor, as in the original. Additions
// for this project: all-spin clear rewards.

import { HEIGHT, WIDTH, type Grid } from '../../board';
import type { Piece } from '../../pieces';
import type { SpinKind } from '../../spin';

export interface Weights {
  back_to_back: number;
  bumpiness: number;
  bumpiness_sq: number;
  row_transitions: number;
  height: number;
  top_half: number;
  top_quarter: number;
  jeopardy: number;
  cavity_cells: number;
  cavity_cells_sq: number;
  overhang_cells: number;
  overhang_cells_sq: number;
  covered_cells: number;
  covered_cells_sq: number;
  tslot: [number, number, number, number];
  well_depth: number;
  max_well_depth: number;
  well_column: number[];
  b2b_clear: number;
  clear1: number;
  clear2: number;
  clear3: number;
  clear4: number;
  tspin1: number;
  tspin2: number;
  tspin3: number;
  mini_tspin1: number;
  mini_tspin2: number;
  perfect_clear: number;
  combo_garbage: number;
  move_time: number;
  wasted_t: number;
  // Not in Cold Clear: full spins by S, Z, L, J and I, by rows cleared.
  allspin: [number, number, number, number];
}

// Cold Clear's default weights.
export const STANDARD: Weights = {
  back_to_back: 52,
  bumpiness: -24,
  bumpiness_sq: -7,
  row_transitions: -5,
  height: -39,
  top_half: -150,
  top_quarter: -511,
  jeopardy: -11,
  cavity_cells: -173,
  cavity_cells_sq: -3,
  overhang_cells: -34,
  overhang_cells_sq: -1,
  covered_cells: -17,
  covered_cells_sq: -1,
  tslot: [8, 148, 192, 407],
  well_depth: 57,
  max_well_depth: 17,
  well_column: [20, 23, 20, 50, 59, 21, 59, 10, -10, 24],
  move_time: -3,
  wasted_t: -152,
  b2b_clear: 104,
  clear1: -143,
  clear2: -100,
  clear3: -58,
  clear4: 390,
  tspin1: 121,
  tspin2: 410,
  tspin3: 602,
  mini_tspin1: -158,
  mini_tspin2: -93,
  perfect_clear: 999,
  combo_garbage: 150,
  allspin: [0, 0, 0, 0],
};

// Garbage a combo of this index sends in guideline versus, which is what
// Cold Clear weighs combos by.
const COMBO_GARBAGE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

export interface LockInfo {
  piece: Piece;
  lines: number;
  spin: SpinKind;
  perfectClear: boolean;
  b2bExtended: boolean;
  comboIndex: number; // -1 when nothing cleared
  inputs: number;
}

// The reward a lock earns on its own (Cold Clear's accumulated evaluation).
export function reward(w: Weights, l: LockInfo): number {
  let acc = 0;
  if (l.perfectClear) acc += w.perfect_clear;
  if (!l.perfectClear) {
    if (l.b2bExtended) acc += w.b2b_clear;
    if (l.comboIndex >= 0) acc += w.combo_garbage * COMBO_GARBAGE[Math.min(l.comboIndex, 11)]!;
    if (l.lines > 0) {
      if (l.piece === 'T' && l.spin === 'full') acc += [0, w.tspin1, w.tspin2, w.tspin3][l.lines] ?? 0;
      else if (l.piece === 'T' && l.spin === 'mini') acc += [0, w.mini_tspin1, w.mini_tspin2][l.lines] ?? 0;
      else {
        acc += [0, w.clear1, w.clear2, w.clear3, w.clear4][l.lines] ?? 0;
        if (l.spin === 'full') acc += w.allspin[l.lines] ?? 0;
      }
    }
  }
  if (l.piece === 'T' && !(l.spin === 'full' && l.lines > 0)) acc += w.wasted_t;
  // Cold Clear's approximation of line clear delay.
  acc += w.move_time * (l.inputs + (l.lines > 0 ? 40 : 0));
  return acc;
}

// --- board view, y-up -----------------------------------------------------

class Board {
  rows: number[]; // bit x set = filled; rows[0] is the floor
  heights: number[];

  constructor(rows: number[]) {
    this.rows = rows;
    this.heights = new Array(WIDTH).fill(0);
    this.recompute();
  }

  static from(grid: Grid): Board {
    const rows: number[] = [];
    for (let y = 0; y < HEIGHT; y++) {
      let r = 0;
      const base = (HEIGHT - 1 - y) * WIDTH;
      for (let x = 0; x < WIDTH; x++) if (grid[base + x] !== 0) r |= 1 << x;
      rows.push(r);
    }
    return new Board(rows);
  }

  recompute(): void {
    for (let x = 0; x < WIDTH; x++) {
      let h = 0;
      for (let y = HEIGHT - 1; y >= 0; y--) if (this.rows[y]! & (1 << x)) { h = y + 1; break; }
      this.heights[x] = h;
    }
  }

  occupied(x: number, y: number): boolean {
    if (x < 0 || x >= WIDTH || y < 0) return true;
    if (y >= HEIGHT) return false;
    return (this.rows[y]! & (1 << x)) !== 0;
  }

  clone(): Board {
    return new Board([...this.rows]);
  }
}

type Facing = 'N' | 'E' | 'S' | 'W';
interface T { x: number; y: number; f: Facing }

const T_CELLS: Record<Facing, [number, number][]> = {
  N: [[0, 0], [-1, 0], [1, 0], [0, 1]],
  E: [[0, 0], [0, 1], [0, -1], [1, 0]],
  S: [[0, 0], [-1, 0], [1, 0], [0, -1]],
  W: [[0, 0], [0, 1], [0, -1], [-1, 0]],
};

function tFits(b: Board, t: T): boolean {
  return T_CELLS[t.f].every(([dx, dy]) => !b.occupied(t.x + dx, t.y + dy));
}

function sonicDrop(b: Board, t: T): T {
  let p = t;
  while (tFits(b, { ...p, y: p.y - 1 })) p = { ...p, y: p.y - 1 };
  return p;
}

const onStack = (b: Board, t: T): boolean => !tFits(b, { ...t, y: t.y - 1 });

// --- T-slot shapes (detect_shape! in the original) ---------------------------

function skyTslotRight(b: Board): T | null {
  const h = b.heights;
  for (let x = 0; x + 2 < WIDTH; x++) {
    const h1 = h[x + 1]!, h2 = h[x + 2]!;
    if (!(h1 <= h2 - 1)) continue;
    if (b.occupied(x, h2 + 1) && !b.occupied(x, h2) && b.occupied(x, h2 - 1)) return { x: x + 1, y: h2, f: 'S' };
  }
  return null;
}

function skyTslotLeft(b: Board): T | null {
  const h = b.heights;
  for (let x = 0; x + 2 < WIDTH; x++) {
    const h1 = h[x]!, h2 = h[x + 1]!;
    if (!(h2 <= h1 - 1)) continue;
    if (b.occupied(x + 2, h1 + 1) && !b.occupied(x + 2, h1) && b.occupied(x + 2, h1 - 1)) return { x: x + 1, y: h1, f: 'S' };
  }
  return null;
}

function tstTwistLeft(b: Board): T | null {
  const h = b.heights;
  for (let x = 0; x + 2 < WIDTH; x++) {
    const h1 = h[x]!, h2 = h[x + 1]!;
    if (!(h1 <= h2 && b.occupied(x - 1, h2) === b.occupied(x - 1, h2 + 1))) continue;
    const y = h2;
    if (b.occupied(x + 2, y + 1) && !b.occupied(x + 2, y) && !b.occupied(x + 2, y - 1)
      && !b.occupied(x + 1, y - 2) && !b.occupied(x + 2, y - 2) && !b.occupied(x + 2, y - 3)) {
      return { x: x + 2, y: h2 - 2, f: 'W' };
    }
  }
  return null;
}

function tstTwistRight(b: Board): T | null {
  const h = b.heights;
  for (let x = 0; x + 2 < WIDTH; x++) {
    const h1 = h[x + 1]!, h2 = h[x + 2]!;
    if (!(h2 <= h1 && b.occupied(x + 3, h1) === b.occupied(x + 3, h1 + 1))) continue;
    const y = h1;
    if (b.occupied(x, y + 1) && !b.occupied(x, y) && !b.occupied(x, y - 1)
      && !b.occupied(x, y - 2) && !b.occupied(x + 1, y - 2) && !b.occupied(x, y - 3)) {
      return { x, y: h1 - 2, f: 'E' };
    }
  }
  return null;
}

function finLeft(b: Board): T | null {
  const h = b.heights;
  for (let x = 0; x + 3 < WIDTH; x++) {
    const h1 = h[x]!, h2 = h[x + 1]!;
    if (!(h1 <= h2 + 1)) continue;
    const y = h2 + 2;
    const ok = b.occupied(x + 2, y) && b.occupied(x + 3, y)
      && !b.occupied(x + 2, y - 1) && !b.occupied(x + 3, y - 1)
      && !b.occupied(x + 2, y - 2) && !b.occupied(x + 3, y - 2) && b.occupied(x + 4, y - 2)
      && !b.occupied(x + 2, y - 3) && !b.occupied(x + 3, y - 3)
      && b.occupied(x + 2, y - 4) && !b.occupied(x + 3, y - 4) && b.occupied(x + 4, y - 4);
    if (ok) return { x: x + 3, y: h2 - 1, f: 'W' };
  }
  return null;
}

function finRight(b: Board): T | null {
  const h = b.heights;
  for (let x = 0; x + 3 < WIDTH; x++) {
    const h1 = h[x + 2]!, h2 = h[x + 3]!;
    if (!(h2 <= h1 + 1 && b.occupied(x - 1, h1) && b.occupied(x - 1, h1 - 2))) continue;
    const y = h1 + 2;
    const ok = b.occupied(x, y) && b.occupied(x + 1, y)
      && !b.occupied(x, y - 1) && !b.occupied(x + 1, y - 1)
      && !b.occupied(x, y - 2) && !b.occupied(x + 1, y - 2)
      && !b.occupied(x, y - 3) && !b.occupied(x + 1, y - 3)
      && !b.occupied(x, y - 4) && b.occupied(x + 1, y - 4);
    if (ok) return { x, y: h1 - 1, f: 'E' };
  }
  return null;
}

function caveTslot(b: Board, start: T): T | null {
  const { x, y, f } = sonicDrop(b, start);
  if (f === 'E') {
    if (!b.occupied(x - 1, y) && b.occupied(x - 1, y - 1) && b.occupied(x + 1, y - 1) && b.occupied(x - 1, y + 1)) {
      return { x, y, f: 'S' };
    }
    if (!b.occupied(x + 1, y - 1) && !b.occupied(x + 2, y - 1) && !b.occupied(x + 1, y - 2)
      && b.occupied(x - 1, y) && b.occupied(x + 2, y) && b.occupied(x, y - 2) && b.occupied(x + 2, y - 2)) {
      return { x: x + 1, y: y - 1, f: 'S' };
    }
    return null;
  }
  if (f === 'W') {
    if (!b.occupied(x + 1, y) && b.occupied(x + 1, y + 1) && b.occupied(x + 1, y - 1) && b.occupied(x - 1, y - 1)) {
      return { x, y, f: 'S' };
    }
    if (!b.occupied(x - 1, y - 1) && !b.occupied(x - 2, y - 1) && !b.occupied(x - 1, y - 2)
      && b.occupied(x + 1, y) && b.occupied(x - 2, y) && b.occupied(x - 2, y - 2) && b.occupied(x, y - 2)) {
      return { x: x - 1, y: y - 1, f: 'S' };
    }
  }
  return null;
}

// Lock the T into the slot and clear: how many rows, and the board after
// when the slot was a double or triple (so a stacked second slot counts).
function cutout(b: Board, t: T): { lines: number; after: Board | null } {
  if (!tFits(b, t)) return { lines: 0, after: null };
  const next = b.clone();
  for (const [dx, dy] of T_CELLS[t.f]) next.rows[t.y + dy]! |= 1 << (t.x + dx);
  const full = (1 << WIDTH) - 1;
  const kept = next.rows.filter((r) => r !== full);
  const lines = next.rows.length - kept.length;
  while (kept.length < HEIGHT) kept.push(0);
  return { lines, after: lines >= 2 ? new Board(kept) : null };
}

function findSlot(b: Board): T | null {
  const sky = skyTslotLeft(b) ?? skyTslotRight(b);
  if (sky) return sky;
  const tst = tstTwistLeft(b) ?? tstTwistRight(b);
  if (tst) {
    const cave = caveTslot(b, tst);
    if (cave) return cave;
    const corners = Number(b.occupied(tst.x - 1, tst.y - 1)) + Number(b.occupied(tst.x + 1, tst.y - 1))
      + Number(b.occupied(tst.x - 1, tst.y + 1)) + Number(b.occupied(tst.x + 1, tst.y + 1));
    if (corners >= 3 && onStack(b, tst)) return tst;
  }
  return finLeft(b) ?? finRight(b);
}

// --- shape of the stack -----------------------------------------------------

function bumpiness(b: Board, well: number): [number, number] {
  let bump = -1;
  let bumpSq = -1;
  let prev = well === 0 ? 1 : 0;
  for (let i = 1; i < WIDTH; i++) {
    if (i === well) continue;
    const dh = Math.abs(b.heights[prev]! - b.heights[i]!);
    bump += dh;
    bumpSq += dh * dh;
    prev = i;
  }
  return [Math.abs(bump), Math.abs(bumpSq)];
}

function cavitiesAndOverhangs(b: Board): [number, number] {
  let cavities = 0;
  let overhangs = 0;
  const h = b.heights;
  const top = Math.max(...h);
  for (let y = 0; y < top; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (b.occupied(x, y) || y >= h[x]!) continue;
      if (x > 1 && h[x - 1]! <= y - 1 && h[x - 2]! <= y) { overhangs++; continue; }
      if (x < 8 && h[x + 1]! <= y - 1 && h[x + 2]! <= y) { overhangs++; continue; }
      cavities++;
    }
  }
  return [cavities, overhangs];
}

function coveredCells(b: Board): [number, number] {
  let covered = 0;
  let coveredSq = 0;
  for (let x = 0; x < WIDTH; x++) {
    for (let y = b.heights[x]! - 3; y >= 0; y--) {
      if (!b.occupied(x, y)) {
        const cells = Math.min(6, b.heights[x]! - y - 1);
        covered += cells;
        coveredSq += cells * cells;
      }
    }
  }
  return [covered, coveredSq];
}

function popcount(n: number): number {
  let c = 0;
  while (n) { n &= n - 1; c++; }
  return c;
}

// How good a resting board is (Cold Clear's transient evaluation).
// `b2bActive`: a back-to-back chain is running. `tsAvailable`: how many T
// pieces may come soon, which is how many stacked T slots are worth counting.
export function evaluateBoard(w: Weights, grid: Grid, b2bActive: boolean, tsAvailable = 1): number {
  let b = Board.from(grid);
  let e = 0;
  if (b2bActive) e += w.back_to_back;
  const highest = Math.max(...b.heights);
  e += w.top_quarter * Math.max(0, highest - 15);
  e += w.top_half * Math.max(0, highest - 10);
  e += (w.jeopardy * Math.max(0, highest - 10) * 10) / 10;

  for (let i = 0; i < tsAvailable; i++) {
    const slot = findSlot(b);
    if (!slot) break;
    const { lines, after } = cutout(b, slot);
    e += w.tslot[lines] ?? 0;
    if (!after) break;
    b = after;
  }

  const h = b.heights;
  e += w.height * Math.max(...h);

  let well = 0;
  for (let x = 1; x < WIDTH; x++) if (h[x]! <= h[well]!) well = x;
  let depth = 0;
  for (let y = h[well]!; y < 20; y++) {
    let full = true;
    for (let x = 0; x < WIDTH; x++) if (x !== well && !b.occupied(x, y)) { full = false; break; }
    if (!full) break;
    depth++;
  }
  depth = Math.min(depth, w.max_well_depth);
  e += w.well_depth * depth;
  if (depth !== 0) e += w.well_column[well]!;

  if (w.row_transitions !== 0) {
    let t = 0;
    for (let y = 0; y < HEIGHT; y++) {
      const r = b.rows[y]!;
      t += popcount((r | (1 << WIDTH)) ^ (1 | (r << 1)));
    }
    e += w.row_transitions * t;
  }

  const [bump, bumpSq] = bumpiness(b, well);
  e += bump * w.bumpiness + bumpSq * w.bumpiness_sq;
  const [cav, over] = cavitiesAndOverhangs(b);
  e += w.cavity_cells * cav + w.cavity_cells_sq * cav * cav + w.overhang_cells * over + w.overhang_cells_sq * over * over;
  const [cov, covSq] = coveredCells(b);
  e += w.covered_cells * cov + w.covered_cells_sq * covSq;
  return e;
}

export function maxHeight(grid: Grid): number {
  return Math.max(...Board.from(grid).heights);
}
