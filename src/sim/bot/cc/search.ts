// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Search over the known queue, after Cold Clear (bot/src/dag.rs). Cold Clear
// grows a tree across threads for as long as it is given; a bot here gets
// one main-thread decision a second, so this keeps the same scoring (rewards
// accumulated along the line plus the evaluation of the board at its end)
// but searches a fixed-width beam a few pieces deep.

import { cloneGrid, clearFullRows, isEmpty, lockPiece, type Grid } from '../../board';
import { pieceId, type Piece } from '../../pieces';
import { spawnPlacementFor } from '../../game';
import { evaluateBoard, reward, type LockInfo, type Weights } from './eval';
import { findMoves, type Move } from './movegen';

export interface SearchInput {
  grid: Grid;
  current: Piece;
  hold: Piece | null;
  queue: Piece[]; // pieces after the current one
  combo: number; // -1 = none running
  b2b: boolean; // a back-to-back chain is running
}

export interface SearchOptions {
  weights: Weights;
  width: number;
  depth: number;
  // Veto a move outright (a T-SPIN bot that may only spin doubles, say).
  allow?: (move: Move, lock: LockInfo) => boolean;
  // Extra score for a resulting board, on top of the evaluation.
  bonus?: (grid: Grid, lock: LockInfo) => number;
}

export interface Decision {
  move: Move;
  useHold: boolean;
  lock: LockInfo;
}

interface Node {
  grid: Grid;
  hold: Piece | null;
  queue: Piece[]; // [0] is the piece in play
  combo: number;
  b2b: boolean;
  acc: number;
  score: number;
  first: Decision | null;
}

// Lock a piece on a copy of the board the way the game would and report
// what it did.
export function simulateLock(grid: Grid, move: Move, combo: number, b2b: boolean): { grid: Grid; lock: LockInfo; combo: number; b2b: boolean } {
  const g = cloneGrid(grid);
  const p = move.placement;
  lockPiece(g, p, pieceId(p.piece));
  const lines = clearFullRows(g);
  const perfectClear = lines > 0 && isEmpty(g);
  const qualifies = lines === 4 || (p.piece === 'T' && move.spin !== 'none');
  const b2bExtended = lines > 0 && qualifies && b2b;
  const nextB2b = lines > 0 ? qualifies : b2b;
  const nextCombo = lines > 0 ? combo + 1 : -1;
  return {
    grid: g,
    lock: { piece: p.piece, lines, spin: move.spin, perfectClear, b2bExtended, comboIndex: lines > 0 ? nextCombo : -1, inputs: move.inputs.length },
    combo: nextCombo,
    b2b: nextB2b,
  };
}

function children(n: Node, opt: SearchOptions): Node[] {
  const out: Node[] = [];
  const options: { piece: Piece; hold: Piece | null; rest: Piece[]; useHold: boolean }[] = [];
  const [cur, ...rest] = n.queue;
  if (!cur) return out;
  options.push({ piece: cur, hold: n.hold, rest, useHold: false });
  if (n.hold === null) {
    if (rest[0]) options.push({ piece: rest[0], hold: cur, rest: rest.slice(1), useHold: true });
  } else if (n.hold !== cur) {
    options.push({ piece: n.hold, hold: cur, rest, useHold: true });
  }
  for (const o of options) {
    const spawn = spawnPlacementFor(o.piece);
    for (const move of findMoves(n.grid, spawn)) {
      const sim = simulateLock(n.grid, move, n.combo, n.b2b);
      if (opt.allow && !opt.allow(move, sim.lock)) continue;
      const acc = n.acc + reward(opt.weights, sim.lock) + (opt.bonus?.(sim.grid, sim.lock) ?? 0);
      const ts = Number(o.hold === 'T') + Number(o.rest.slice(0, 6).includes('T'));
      const score = acc + evaluateBoard(opt.weights, sim.grid, sim.b2b, Math.max(1, ts));
      out.push({
        grid: sim.grid, hold: o.hold, queue: o.rest, combo: sim.combo, b2b: sim.b2b, acc, score,
        first: n.first ?? { move, useHold: o.useHold, lock: sim.lock },
      });
    }
  }
  return out;
}

export function search(input: SearchInput, opt: SearchOptions): Decision | null {
  let beam: Node[] = [{
    grid: input.grid, hold: input.hold, queue: [input.current, ...input.queue],
    combo: input.combo, b2b: input.b2b, acc: 0, score: 0, first: null,
  }];
  let best: Node | null = null;
  for (let d = 0; d < opt.depth; d++) {
    const next: Node[] = [];
    for (const n of beam) next.push(...children(n, opt));
    if (next.length === 0) break;
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, opt.width);
    best = beam[0]!;
  }
  return best?.first ?? null;
}

