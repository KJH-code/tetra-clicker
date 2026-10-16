// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from Cold Clear, libtetris/src/moves.rs (MinusKelvin/cold-clear),
// onto this project's board, SRS kicks and spin rules.

import { collides, dropDistance, occupiedCells, TOP_VISIBLE_ROW, type Grid, type Placement } from '../../board';
import { kicksFor } from '../../kicks';
import type { Piece, Rotation } from '../../pieces';
import { detectSpin, type SpinKind } from '../../spin';

// One player input. DROP is a soft drop all the way down (no lock), so a
// piece can still slide or turn into a slot afterwards.
export type Input = 'L' | 'R' | 'CW' | 'CCW' | 'R180' | 'DROP';

export interface Move {
  // Where the piece locks, and the spin the lock counts as.
  placement: Placement;
  spin: SpinKind;
  // Inputs from spawn; a hard drop follows them.
  inputs: Input[];
  // The piece after every input, for replaying the move on screen.
  path: Placement[];
}

interface Node {
  p: Placement;
  // Spin state of the last input: 0 = not a rotation, 1 = rotation, 2 = a
  // rotation that used the fifth kick (upgrades a mini T-spin to full).
  turn: 0 | 1 | 2;
  parent: Node | null;
  input: Input | null;
  depth: number;
}

function stateKey(p: Placement, turn: number): number {
  return (((p.x + 4) * 64 + p.y) * 4 + p.rot) * 3 + turn;
}

// Canonical lock key: the cells covered plus the spin, so mirror-identical
// rotations of S, Z and I count once.
function lockKey(p: Placement, spin: SpinKind): string {
  const cells = occupiedCells(p).map(([x, y]) => y * 16 + x).sort((a, b) => a - b);
  return `${cells.join(',')}|${spin}`;
}

const TURNS: Record<string, number> = { CW: 1, CCW: 3, R180: 2 };

function apply(grid: Grid, n: Node, input: Input): Node | null {
  const p = n.p;
  const next = (q: Placement, turn: 0 | 1 | 2): Node => ({ p: q, turn, parent: n, input, depth: n.depth + 1 });
  if (input === 'L' || input === 'R') {
    const q = { ...p, x: p.x + (input === 'L' ? -1 : 1) };
    return collides(grid, q) ? null : next(q, 0);
  }
  if (input === 'DROP') {
    const d = dropDistance(grid, p);
    return d === 0 ? null : next({ ...p, y: p.y + d }, 0);
  }
  if (p.piece === 'O') return null;
  const to = ((p.rot + TURNS[input]!) % 4) as Rotation;
  const kicks = kicksFor(p.piece, p.rot, to);
  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i]!;
    // Kick tables are y-up; the grid is y-down.
    const q: Placement = { ...p, rot: to, x: p.x + kx, y: p.y - ky };
    if (!collides(grid, q)) return next(q, i === 4 ? 2 : 1);
  }
  return null;
}

// Every distinct place the piece can lock from `spawn`, each by its shortest
// input sequence (fewest inputs; ties keep the first found). Breadth-first
// over left, right, turns and drop-to-floor, as Cold Clear's move search
// does, so tucks and spins under overhangs are found.
export function findMoves(grid: Grid, spawn: Placement, maxInputs = 16): Move[] {
  const locks = new Map<string, Move>();
  const seen = new Set<number>();
  let frontier: Node[] = [{ p: spawn, turn: 0, parent: null, input: null, depth: 0 }];
  seen.add(stateKey(spawn, 0));
  const inputs: Input[] = spawn.piece === 'O' ? ['L', 'R', 'DROP'] : ['L', 'R', 'CW', 'CCW', 'R180', 'DROP'];
  while (frontier.length > 0) {
    const next: Node[] = [];
    for (const n of frontier) {
      lockFrom(grid, n, locks);
      if (n.depth >= maxInputs) continue;
      for (const input of inputs) {
        const m = apply(grid, n, input);
        if (!m) continue;
        const k = stateKey(m.p, m.turn);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(m);
      }
    }
    frontier = next;
  }
  return [...locks.values()];
}

// Hard drop from this node: where it lands and what spin that counts as. A
// drop that moves the piece cancels any spin from the last turn.
function lockFrom(grid: Grid, n: Node, locks: Map<string, Move>): void {
  const d = dropDistance(grid, n.p);
  const p = d > 0 ? { ...n.p, y: n.p.y + d } : n.p;
  // Locking wholly above the visible rows is a lock-out, never a move.
  if (occupiedCells(p).every(([, y]) => y < TOP_VISIBLE_ROW)) return;
  const spin: SpinKind = d > 0 ? 'none' : detectSpin(grid, p, { lastActionWasRotation: n.turn > 0, lastKickIndex: n.turn === 2 ? 4 : 0 });
  const key = lockKey(p, spin);
  if (locks.has(key)) return;
  const inputs: Input[] = [];
  const path: Placement[] = [];
  for (let k: Node | null = n; k; k = k.parent) {
    path.push(k.p);
    if (k.input) inputs.push(k.input);
  }
  inputs.reverse();
  path.reverse();
  if (d > 0) path.push(p);
  locks.set(key, { placement: p, spin, inputs, path });
}

// Play a move's inputs on a real game (the hard drop is left to the caller).
// The game's own rules then decide the spin, so a bot is paid exactly what a
// person making the same inputs would be.
export function replay(game: { moveLeft(): boolean; moveRight(): boolean; rotateCW(): boolean; rotateCCW(): boolean; rotate180(): boolean; softDrop(): boolean }, inputs: readonly Input[]): boolean {
  for (const input of inputs) {
    let ok: boolean;
    switch (input) {
      case 'L': ok = game.moveLeft(); break;
      case 'R': ok = game.moveRight(); break;
      case 'CW': ok = game.rotateCW(); break;
      case 'CCW': ok = game.rotateCCW(); break;
      case 'R180': ok = game.rotate180(); break;
      case 'DROP': ok = game.softDrop(); while (game.softDrop()) { /* to the floor */ } break;
    }
    if (!ok) return false;
  }
  return true;
}
