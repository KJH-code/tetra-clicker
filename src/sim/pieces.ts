// SRS piece definitions. Each piece lives in a square box (I: 4, O: 2, rest:
// 3) and rotates about the box centre, which is what makes the guideline kick
// tables line up. Rotation states are precomputed once at load.
export type Piece = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECES: readonly Piece[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export type Rotation = 0 | 1 | 2 | 3; // spawn, CW (R), 180, CCW (L)
export type Cell = readonly [x: number, y: number]; // y grows downward

const SPAWN: Record<Piece, { size: number; cells: Cell[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

function rotateCW(cells: Cell[], size: number): Cell[] {
  return cells.map(([x, y]) => [size - 1 - y, x] as const);
}

function build(): Record<Piece, readonly (readonly Cell[])[]> {
  const out = {} as Record<Piece, readonly (readonly Cell[])[]>;
  for (const p of PIECES) {
    const { size, cells } = SPAWN[p];
    const states: Cell[][] = [cells];
    for (let r = 1; r < 4; r++) states.push(rotateCW(states[r - 1]!, size));
    out[p] = states;
  }
  return out;
}

const SHAPES = build();

export const boxSize = (p: Piece): number => SPAWN[p].size;
export const cellsOf = (p: Piece, r: Rotation): readonly Cell[] => SHAPES[p][r]!;

// Numeric ids for the board grid: 0 = empty, 1..7 = piece colour.
export const pieceId = (p: Piece): number => PIECES.indexOf(p) + 1;
export const pieceFromId = (id: number): Piece | null => PIECES[id - 1] ?? null;
