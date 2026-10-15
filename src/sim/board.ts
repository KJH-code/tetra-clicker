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
  for (const [x, y] of occupiedCells(p)) {
    if (cellAt(g, x, y) !== 0) return true;
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
export function clearFullRows(g: Grid): number {
  let write = HEIGHT - 1;
  let cleared = 0;
  for (let read = HEIGHT - 1; read >= 0; read--) {
    let full = true;
    for (let x = 0; x < WIDTH; x++) {
      if (g[read * WIDTH + x] === 0) { full = false; break; }
    }
    if (full) { cleared++; continue; }
    if (write !== read) g.copyWithin(write * WIDTH, read * WIDTH, read * WIDTH + WIDTH);
    write--;
  }
  for (let y = write; y >= 0; y--) g.fill(0, y * WIDTH, y * WIDTH + WIDTH);
  return cleared;
}

export function fullRowsIfLocked(g: Grid, p: Placement): number {
  // Counts rows the placement would complete without mutating the grid; the
  // bot uses this to refuse anything but single clears.
  const rows = new Set<number>();
  for (const [, y] of occupiedCells(p)) rows.add(y);
  let n = 0;
  for (const y of rows) {
    let full = true;
    for (let x = 0; x < WIDTH; x++) {
      if (cellAt(g, x, y) === 0) {
        const own = occupiedCells(p).some(([px, py]) => px === x && py === y);
        if (!own) { full = false; break; }
      }
    }
    if (full) n++;
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
