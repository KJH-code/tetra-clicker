import type { Piece, Rotation } from './pieces';

// Kick offsets are stored in guideline convention (x right, y UP) so they can
// be read against the published tables verbatim; board.ts flips y when
// applying them. Index 4 of a 90° table is "the fifth kick", which upgrades a
// mini T-spin to a full one.
export type Kick = readonly [dx: number, dy: number];
type Table = Record<string, readonly Kick[]>;

const JLSTZ: Table = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  // SRS has no 180; this is the SRS+ table TETR.IO uses.
  '0>2': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '1>3': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '2>0': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '3>1': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};

const I: Table = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '0>2': [[0, 0], [-1, 0], [-2, 0], [1, 0], [2, 0], [0, 1]],
  '1>3': [[0, 0], [0, 1], [0, 2], [0, -1], [0, -2], [-1, 0]],
  '2>0': [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, -1]],
  '3>1': [[0, 0], [0, 1], [0, 2], [0, -1], [0, -2], [1, 0]],
};

// O never rotates in SRS, so it never kicks either.
const O: Table = {};

export function kicksFor(piece: Piece, from: Rotation, to: Rotation): readonly Kick[] {
  const key = `${from}>${to}`;
  const table = piece === 'I' ? I : piece === 'O' ? O : JLSTZ;
  return table[key] ?? [[0, 0]];
}
