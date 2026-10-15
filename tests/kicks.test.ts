import { describe, it, expect } from 'vitest';
import { kicksFor } from '../src/sim/kicks';
import type { Piece, Rotation } from '../src/sim/pieces';

// The guideline SRS table, transcribed from the Tetris Guideline (x right, y up).
const GUIDELINE_JLSTZ: Record<string, number[][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const GUIDELINE_I: Record<string, number[][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

describe('SRS kick tables', () => {
  const transitions: [Rotation, Rotation][] = [[0, 1], [1, 0], [1, 2], [2, 1], [2, 3], [3, 2], [3, 0], [0, 3]];
  for (const piece of ['J', 'L', 'S', 'T', 'Z'] as Piece[]) {
    for (const [from, to] of transitions) {
      it(`${piece} ${from}>${to} matches guideline`, () => {
        expect(kicksFor(piece, from, to)).toEqual(GUIDELINE_JLSTZ[`${from}>${to}`]);
      });
    }
  }
  for (const [from, to] of transitions) {
    it(`I ${from}>${to} matches guideline`, () => {
      expect(kicksFor('I', from, to)).toEqual(GUIDELINE_I[`${from}>${to}`]);
    });
  }
  it('O never kicks', () => {
    expect(kicksFor('O', 0, 1)).toEqual([[0, 0]]);
  });
  it('every 90° table starts with the null kick and has five entries', () => {
    for (const piece of ['I', 'J', 'L', 'S', 'T', 'Z'] as Piece[]) {
      for (const [from, to] of transitions) {
        const k = kicksFor(piece, from, to);
        expect(k[0]).toEqual([0, 0]);
        expect(k).toHaveLength(5);
      }
    }
  });
  it('180° tables exist for all four states and start with the null kick', () => {
    for (const piece of ['I', 'J', 'L', 'S', 'T', 'Z'] as Piece[]) {
      for (const [from, to] of [[0, 2], [1, 3], [2, 0], [3, 1]] as [Rotation, Rotation][]) {
        const k = kicksFor(piece, from, to);
        expect(k[0]).toEqual([0, 0]);
        expect(k).toHaveLength(6);
      }
    }
  });
});
