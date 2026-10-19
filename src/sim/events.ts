import { Game } from './game';
import { createRng, restoreRng, type Rng } from './rng';
import type { EventKind } from '../data/events';
import { EVENTS, ATTACK_ROWS_PER_LINE } from '../data/events';
import { attackFor } from './attack';
import type { LockResult } from './game';
import { WIDTH } from './board';

// The life event in progress (src/data/events.ts). It belongs to the life:
// a top-out or an ascension ends it, and a save does not keep it (a reload
// starts the life paused, and an event is not worth fighting cold).
export type LifeEvent = RivalEvent | InvaderEvent | HelperEvent;

export interface RivalEvent {
  kind: 'rival';
  game: Game;
  level: number;
  // Pieces per second, fixed for the fight at the level it began.
  pps: number;
  timerMs: number;
  // Garbage rows waiting for each side, and the part of a row not sent yet.
  toMe: number;
  toRival: number;
  myCarry: number;
  rivalCarry: number;
  holes: Rng;
}

export interface InvaderEvent {
  kind: 'invader';
  msLeft: number;
  // Lines made by hand while it lasts, and rows of attack banked to block
  // the next garbage rows.
  earned: number;
  shield: number;
  carry: number;
}

export interface HelperEvent {
  kind: 'helper';
  msLeft: number;
  rows: number;
}

export function startEvent(kind: EventKind, level: number, seed: number, rivalPace = 1): LifeEvent {
  switch (kind) {
    case 'rival': {
      const pps = EVENTS.rival.pps(level, rivalPace);
      return { kind, game: new Game(seed), level, pps, timerMs: 1000 / pps, toMe: 0, toRival: 0, myCarry: 0, rivalCarry: 0, holes: createRng(seed ^ 0x2545f491) };
    }
    case 'invader':
      return { kind, msLeft: EVENTS.invader.seconds * 1000, earned: 0, shield: 0, carry: 0 };
    case 'helper':
      return { kind, msLeft: EVENTS.helper.seconds * 1000, rows: 0 };
  }
}

// Whole garbage rows a placement sends, with the fraction carried over.
export function attackRows(r: LockResult, carry: number): { rows: number; carry: number } {
  const total = attackFor(r).total * ATTACK_ROWS_PER_LINE + carry;
  const rows = Math.floor(total + 1e-9);
  return { rows, carry: total - rows };
}

// Sent rows cancel the sender's own incoming first; the rest go over.
export function cancel(incoming: number, sent: number): { incoming: number; over: number } {
  const blocked = Math.min(incoming, sent);
  return { incoming: incoming - blocked, over: sent - blocked };
}

export const randomHole = (rng: Rng): number => rng.nextInt(WIDTH);

export { restoreRng };
