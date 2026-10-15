import {
  WIDTH, HEIGHT, cloneGrid, collides, dropDistance, lockPiece, clearFullRows,
  fullRowsIfLocked, columnHeight, type Grid, type Placement,
} from '../board';
import { cellsOf, pieceId, type Piece, type Rotation } from '../pieces';
import type { Game } from '../game';
import type { BotChoice, BotPolicy } from './policy';
import { features, topRow, spawnX, reachable } from './singleBot';
import { ATTACK } from '../../data/attackTable';

// A bot whose largest clear is k rows. It is paid for every clear, so it
// prefers the big one but takes smaller ones when the stack needs it; what
// it never does is clear more than k at once. With a well (k = 3, 4) it
// stacks beside the right edge and banks the I in hold until enough rows
// are ready; without one it plays like the single bot with a bigger ceiling.
export interface SizeWeights {
  height: number;
  holes: number;
  bump: number;
  max: number;
  // Highest minus lowest column outside the well: a staircase has small
  // bumpiness but a large spread, and a staircase is what buries the well.
  spread: number;
  wellHeight: number; // blocks sitting in the well columns
  wellBump: number; // height difference between the two well columns (k = 2)
  ready: number; // rows complete except for the well, up to k
  over: number; // ready rows beyond `overCap`
  overCap: number;
  // Reward for making the building's own clear, scaled by its table value.
  // Smaller clears get no reward here even though the game pays them: the
  // heuristic's job is to steer toward the big one.
  clear: number;
  // Reward per row for any clear at all; only the flat panic mode uses it,
  // to dig down fast.
  clearAny: number;
  // Penalty for a clear smaller than k. Small clears are paid, but each one
  // spends rows that could have gone into the big clear, so the bot is
  // nudged to bank them; `smallOnlyWhenStuck` lifts the penalty while the
  // stack has holes or is high, when a small clear is the way out.
  small: number;
  smallOnlyWhenStuck: boolean;
  // Stack height (outside the well) at which the bot gives up on the well for
  // the turn and plays flat with no small-clear penalty, digging itself down.
  // 99 disables it.
  panicAt: number;
  // Ending the turn with the well piece (I; also O for the two-wide well) in
  // hold, so it is there when the rows are ready.
  holdGood: number;
  rowTrans: number;
  colTrans: number;
  // Piece kinds (S, Z, T, L, J) that have no hole-free landing anywhere
  // outside the well. A surface that cannot take an S or a Z forces a hole
  // the moment one arrives.
  unfit: number;
  // Without a well the bot plays like the single bot, just with its own clear
  // size; the well features are then ignored.
  useWell: boolean;
  beam: number;
}

export const SIZE_WEIGHTS: Record<2 | 3 | 4, SizeWeights> = {
  2: { height: -0.7, holes: -6, bump: -0.6, max: -0.5, spread: -1, wellHeight: 0, wellBump: 0, ready: 0, over: 0, overCap: 9, clear: 1.5, holdGood: 0, rowTrans: -1, colTrans: -1, unfit: 0, useWell: false, small: -60, smallOnlyWhenStuck: true, clearAny: 0, panicAt: 99, beam: 8 },
  3: { height: -0.5, holes: -40, bump: -1.5, max: -1, spread: -4, wellHeight: -5, wellBump: 0, ready: 1.5, over: -60, overCap: 3, clear: 10, holdGood: 3, rowTrans: -0.5, colTrans: -0.5, unfit: -4, useWell: true, small: -20, smallOnlyWhenStuck: true, clearAny: 0, panicAt: 5, beam: 6 },
  4: { height: -0.5, holes: -40, bump: -1.5, max: -1, spread: -4, wellHeight: -5, wellBump: 0, ready: 1.5, over: -2, overCap: 6, clear: 10, holdGood: 3, rowTrans: -0.5, colTrans: -0.5, unfit: -8, useWell: true, small: -60, smallOnlyWhenStuck: true, clearAny: 0, panicAt: 7, beam: 6 },
};

export function wellPieces(k: number): Piece[] {
  return k === 2 ? ['O', 'I'] : ['I'];
}

export function wellColumns(k: number): number[] {
  return k === 2 ? [WIDTH - 2, WIDTH - 1] : [WIDTH - 1];
}

// Rows the well piece would clear: counted upward from the well floor and
// stopping at the first row that is not full outside the well, because the
// piece lands on the floor and only consecutive full rows come out together.
function readyRows(grid: Grid, well: number[]): number {
  let floor = HEIGHT - 1;
  // The floor is the lowest row where every well column is still empty.
  for (let y = HEIGHT - 1; y >= 0; y--) {
    let empty = true;
    for (const x of well) if (grid[y * WIDTH + x] !== 0) { empty = false; break; }
    if (empty) { floor = y; break; }
    if (y === 0) return 0;
  }
  let ready = 0;
  for (let y = floor; y >= 0; y--) {
    let full = true;
    for (let x = 0; x < WIDTH; x++) {
      if (well.includes(x)) continue;
      if (grid[y * WIDTH + x] === 0) { full = false; break; }
    }
    if (!full) break;
    ready++;
  }
  return ready;
}

// Bottom profile of each rotation: for every column the piece covers, how
// far its lowest cell sits above the piece's lowest row. A landing is
// hole-free when the surface under the piece has exactly that shape.
const PROFILES: Record<string, number[][]> = (() => {
  const out: Record<string, number[][]> = {};
  for (const piece of ['S', 'Z', 'T', 'L', 'J'] as Piece[]) {
    const profiles: number[][] = [];
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      const cells = cellsOf(piece, rot);
      const minX = Math.min(...cells.map(([x]) => x));
      const maxX = Math.max(...cells.map(([x]) => x));
      const maxY = Math.max(...cells.map(([, y]) => y));
      const prof: number[] = [];
      for (let x = minX; x <= maxX; x++) {
        const bottom = Math.max(...cells.filter(([cx]) => cx === x).map(([, y]) => y));
        prof.push(maxY - bottom);
      }
      profiles.push(prof);
    }
    out[piece] = profiles;
  }
  return out;
})();

function unfitPieces(heights: number[]): number {
  let unfit = 0;
  for (const profiles of Object.values(PROFILES)) {
    let fits = false;
    for (const prof of profiles) {
      for (let x = 0; x + prof.length <= heights.length && !fits; x++) {
        const base = heights[x]! - prof[0]!;
        let ok = true;
        for (let i = 1; i < prof.length; i++) if (heights[x + i]! - prof[i]! !== base) { ok = false; break; }
        if (ok) fits = true;
      }
      if (fits) break;
    }
    if (!fits) unfit++;
  }
  return unfit;
}

function evaluate(grid: Grid, cleared: number, top: number, k: number, w: SizeWeights): number {
  const f = features(grid, top);
  if (!w.useWell) {
    const outside: number[] = [];
    for (let x = 0; x < WIDTH; x++) outside.push(columnHeight(grid, x));
    return w.height * f.agg + w.holes * f.holes + w.bump * f.bump + w.max * f.max
      + w.spread * (Math.max(...outside) - Math.min(...outside))
      + (cleared === k ? w.clear * ATTACK.normal[k]! : 0) + w.clearAny * cleared
      + w.rowTrans * f.rowTrans + w.colTrans * f.colTrans
      + w.unfit * unfitPieces(outside);
  }
  const well = wellColumns(k);
  const heights = well.map((x) => columnHeight(grid, x));
  const wellBump = heights.length > 1 ? Math.abs(heights[0]! - heights[1]!) : 0;
  const ready = readyRows(grid, well);
  // Bumpiness and aggregate height are measured outside the well so the
  // well itself is not read as a flaw.
  let agg = 0, bump = 0, max = 0, min = Infinity, prev = -1;
  const outside: number[] = [];
  for (let x = 0; x < WIDTH; x++) {
    if (well.includes(x)) continue;
    const h = columnHeight(grid, x);
    outside.push(h);
    agg += h;
    if (h > max) max = h;
    if (h < min) min = h;
    if (prev >= 0) bump += Math.abs(h - prev);
    prev = h;
  }
  // Anything in the well above the lowest stack column is garbage, except the
  // one cell a triple leaves behind from its I.
  const wellHeight = Math.max(0, Math.max(...heights) - min - (k === 3 ? 1 : 0));
  return w.height * agg + w.holes * f.holes + w.bump * bump + w.max * max + w.spread * (max - min)
    + w.wellHeight * wellHeight + w.wellBump * wellBump
    + w.ready * Math.min(ready, k) + w.over * Math.max(0, ready - w.overCap)
    + (cleared === k ? w.clear * ATTACK.normal[k]! : 0)
    + w.rowTrans * f.rowTrans + w.colTrans * f.colTrans
    + w.unfit * unfitPieces(outside);
}

interface Candidate {
  spawn: Placement;
  grid: Grid;
  cleared: number;
  score: number;
}

function stuck(grid: Grid, top: number): boolean {
  const f = features(grid, top);
  return f.holes > 0 || f.max >= 10;
}

function candidates(grid: Grid, from: Placement, k: number, w: SizeWeights): Candidate[] {
  const out: Candidate[] = [];
  const parentTop = topRow(grid);
  const smallPenalty = w.small !== 0 && (!w.smallOnlyWhenStuck || !stuck(grid, parentTop)) ? w.small : 0;
  const rotations: Rotation[] = from.piece === 'O' ? [0] : [0, 1, 2, 3];
  for (const rot of rotations) {
    for (let x = -2; x < WIDTH; x++) {
      const spawn: Placement = { piece: from.piece, rot, x, y: from.y };
      if (collides(grid, spawn)) continue;
      if (!reachable(grid, from, spawn)) continue;
      const rest: Placement = { ...spawn, y: spawn.y + dropDistance(grid, spawn) };
      const rows = fullRowsIfLocked(grid, rest);
      // The whole point of the building: never more than k rows at once.
      if (rows > k) continue;
      const trial = cloneGrid(grid);
      lockPiece(trial, rest, pieceId(rest.piece));
      const band = Math.min(parentTop, rest.y);
      const cleared = clearFullRows(trial, band);
      const score = evaluate(trial, cleared, band + cleared, k, w) + (cleared > 0 && cleared < k ? smallPenalty : 0);
      out.push({ spawn, grid: trial, cleared, score });
    }
  }
  return out;
}

function spawnFor(piece: Piece, y: number): Placement {
  return { piece, rot: 0, x: spawnX(piece), y: piece === 'I' ? y - 1 : y };
}

// Flat play used when the stack is too high to keep a well safely.
const PANIC: Partial<SizeWeights> = {
  useWell: false, height: -0.7, holes: -6, bump: -0.6, max: -0.5, spread: -1,
  rowTrans: -1, colTrans: -1, unfit: 0, small: 0, holdGood: 0, clear: 1.5, clearAny: 2,
};

export function sizeBot(k: 2 | 3 | 4, base: SizeWeights = SIZE_WEIGHTS[k]): BotPolicy {
  const panic: SizeWeights = { ...base, ...PANIC };
  return {
    choose(game: Game): BotChoice | null {
      const active = game.active;
      if (!active) return null;
      const weights = features(game.grid).max >= base.panicAt ? panic : base;
      const baseY = active.piece === 'I' ? active.y + 1 : active.y;
      const queue = game.next(2);
      // The alternative piece is the held one, or the next one when holding
      // the active piece for the first time.
      const alt = game.hold ?? queue[0] ?? null;
      const options: { piece: Piece; useHold: boolean; nextPiece: Piece | undefined }[] = [
        { piece: active.piece, useHold: false, nextPiece: queue[0] },
      ];
      if (alt && !game.holdUsed) {
        options.push({ piece: alt, useHold: true, nextPiece: game.hold ? queue[0] : queue[1] });
      }
      let best: { choice: BotChoice; score: number } | null = null;
      for (const opt of options) {
        const from = opt.useHold ? spawnFor(opt.piece, baseY) : active;
        // What hold will contain after this turn.
        const holdAfter = opt.useHold ? active.piece : game.hold;
        const holdBonus = holdAfter && wellPieces(k).includes(holdAfter) ? weights.holdGood : 0;
        const first = candidates(game.grid, from, k, weights).sort((a, b) => b.score - a.score);
        // Second ply: the next piece, or the held one swapped in for it.
        const secondPieces: Piece[] = [];
        if (opt.nextPiece) secondPieces.push(opt.nextPiece);
        if (holdAfter && holdAfter !== opt.nextPiece) secondPieces.push(holdAfter);
        for (const c of first.slice(0, weights.beam)) {
          let score = c.score;
          if (secondPieces.length > 0) {
            let follow = -1e9;
            for (const piece of secondPieces) {
              const second = candidates(c.grid, spawnFor(piece, baseY), k, weights);
              for (const d of second) follow = Math.max(follow, d.score);
            }
            score = follow + (c.cleared === k ? weights.clear * ATTACK.normal[k]! : 0);
          }
          score += holdBonus;
          if (!best || score > best.score) best = { choice: { placement: c.spawn, useHold: opt.useHold }, score };
        }
      }
      return best ? best.choice : null;
    },
  };
}
