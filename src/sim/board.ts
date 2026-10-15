import { cellsOf, type Cell, type Piece, type Rotation } from './pieces';

// 10 wide, 40 tall: the bottom 20 rows are the visible playfield, the 20
// above are buffer so kicks and tall stacks have somewhere to go.
export const WIDTH = 10;
export const HEIGHT = 40;
export const VISIBLE = 20;
export const TOP_VISIBLE_ROW = HEIGHT - VISIBLE; // row index of the first visible row

export type Grid = Uint8Array; // WIDTH * HEIGHT, row-major, 0 = empty

export const createGrid = (): Grid => new Uint8Array(WIDTH * HEIGHT);
export const cloneGrid = (g: Grid): Grid => new Uint8Array(g);

export const cellAt = (g: Grid, x: number, y: number): number => {
  // Anything outside the matrix counts as filled, which is what spin
  // detection and collision both want: a wall behaves like a block.
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return 1;
  return g[y * WIDTH + x]!;
};

export interface Placement {
  piece: Piece;
  rot: Rotation;
  x: number; // box top-left
  y: number;
}

export function occupiedCells(p: Placement): Cell[] {
  return cellsOf(p.piece, p.rot).map(([cx, cy]) => [p.x + cx, p.y + cy] as const);
}

export function collides(g: Grid, p: Placement): boolean {
  // Hot path for the bot's search: no allocations.
  const cells = cellsOf(p.piece, p.rot);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (cellAt(g, p.x + c[0], p.y + c[1]) !== 0) return true;
  }
  return false;
}

// Drop distance to the resting position; 0 when already resting.
export function dropDistance(g: Grid, p: Placement): number {
  let d = 0;
  while (!collides(g, { ...p, y: p.y + d + 1 })) d++;
  return d;
}

export function lockPiece(g: Grid, p: Placement, id: number): void {
  for (const [x, y] of occupiedCells(p)) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) g[y * WIDTH + x] = id;
  }
}

// Removes full rows and returns how many were removed. Rows above shift down.
// `top` is an optional bound: the first row that might hold anything.
export function clearFullRows(g: Grid, top = 0): number {
  let write = HEIGHT - 1;
  let cleared = 0;
  for (let read = HEIGHT - 1; read >= top; read--) {
    let full = true;
    for (let x = 0; x < WIDTH; x++) {
      if (g[read * WIDTH + x] === 0) { full = false; break; }
    }
    if (full) { cleared++; continue; }
    if (write !== read) g.copyWithin(write * WIDTH, read * WIDTH, read * WIDTH + WIDTH);
    write--;
  }
  if (cleared > 0) for (let y = write; y >= Math.max(0, top - cleared); y--) g.fill(0, y * WIDTH, y * WIDTH + WIDTH);
  return cleared;
}

export function fullRowsIfLocked(g: Grid, p: Placement): number {
  // Counts rows the placement would complete. The piece is written in and
  // taken back out rather than allocating, because the bot calls this for
  // every candidate of every ply. The placement must not collide.
  const cells = cellsOf(p.piece, p.rot);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    g[(p.y + c[1]) * WIDTH + p.x + c[0]] = 255;
  }
  let n = 0;
  // A piece spans at most four rows; check each distinct one once. Cells are
  // not row-sorted, so a bitmask over the box rows does the dedupe.
  let seen = 0;
  for (let i = 0; i < cells.length; i++) {
    const row = cells[i]![1];
    if (seen & (1 << row)) continue;
    seen |= 1 << row;
    const y = p.y + row;
    let full = true;
    for (let x = 0; x < WIDTH; x++) {
      if (g[y * WIDTH + x] === 0) { full = false; break; }
    }
    if (full) n++;
  }
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    g[(p.y + c[1]) * WIDTH + p.x + c[0]] = 0;
  }
  return n;
}

export const isEmpty = (g: Grid): boolean => g.every((c) => c === 0);

// Height of a column measured from the floor: 0 for an empty column.
export function columnHeight(g: Grid, x: number): number {
  for (let y = 0; y < HEIGHT; y++) {
    if (g[y * WIDTH + x] !== 0) return HEIGHT - y;
  }
  return 0;
}

export function serializeGrid(g: Grid): string {
  // Rows are stored top to bottom as digit strings; leading empty rows are
  // dropped so a near-empty board stays small in the save file.
  let first = 0;
  while (first < HEIGHT && g.subarray(first * WIDTH, first * WIDTH + WIDTH).every((c) => c === 0)) first++;
  const rows: string[] = [];
  for (let y = first; y < HEIGHT; y++) rows.push(Array.from(g.subarray(y * WIDTH, y * WIDTH + WIDTH)).join(''));
  return rows.join('/');
}

export function deserializeGrid(s: string): Grid {
  const g = createGrid();
  if (!s) return g;
  const rows = s.split('/');
  const first = HEIGHT - rows.length;
  rows.forEach((row, i) => {
    const y = first + i;
    if (y < 0 || y >= HEIGHT) return;
    for (let x = 0; x < WIDTH && x < row.length; x++) g[y * WIDTH + x] = Number(row[x]) || 0;
  });
  return g;
}
