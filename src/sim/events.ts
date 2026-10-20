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
export type LifeEvent = RivalEvent | InvaderEvent | HelperEvent | BonusEvent | BossEvent | TechEvent | MysteryEvent;

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

export interface BonusEvent {
  kind: 'bonus';
  msLeft: number;
  // Lines made by hand while it lasts, for the closing total.
  earned: number;
}

export interface MysteryEvent {
  kind: 'mystery';
  msLeft: number;
}

export interface BossEvent {
  kind: 'boss';
  msLeft: number;
  level: number;
  hp: number;
  maxHp: number;
  attackMs: number;
  toMe: number;
  carry: number;
  holes: Rng;
}

export type TechGoal = (typeof EVENTS.tech.goals)[number];

export interface TechEvent {
  kind: 'tech';
  msLeft: number;
  goal: TechGoal['id'];
  label: string;
  need: number;
  done: number;
}

// Whether a placement counts toward a tech challenge's goal.
export function techGoalMet(goal: TechGoal['id'], r: LockResult): boolean {
  switch (goal) {
    case 'tetris': return r.lines === 4;
    case 'tspin': return r.piece === 'T' && r.spin === 'full' && r.lines > 0;
    case 'b2b': return r.b2bExtended;
    case 'combo5': return r.comboIndex === 5;
  }
}

// `bossHp` is the boss_hp effect's multiplier.
export function startEvent(kind: EventKind, level: number, seed: number, rivalPace = 1, bossHp = 1): LifeEvent {
  switch (kind) {
    case 'rival': {
      const pps = EVENTS.rival.pps(level, rivalPace);
      return { kind, game: new Game(seed), level, pps, timerMs: 1000 / pps, toMe: 0, toRival: 0, myCarry: 0, rivalCarry: 0, holes: createRng(seed ^ 0x2545f491) };
    }
    case 'invader':
      return { kind, msLeft: EVENTS.invader.seconds * 1000, earned: 0, shield: 0, carry: 0 };
    case 'helper':
      return { kind, msLeft: EVENTS.helper.seconds * 1000, rows: 0 };
    case 'bonus':
      return { kind, msLeft: EVENTS.bonus.seconds * 1000, earned: 0 };
    case 'mystery':
      return { kind, msLeft: EVENTS.mystery.seconds * 1000 };
    case 'boss': {
      const hp = Math.max(1, Math.round(level * EVENTS.boss.hpPerLevel * bossHp));
      return { kind, msLeft: EVENTS.boss.seconds * 1000, level, hp, maxHp: hp, attackMs: EVENTS.boss.attackSeconds * 1000, toMe: 0, carry: 0, holes: createRng(seed ^ 0x51ed270b) };
    }
    case 'tech': {
      const goals = EVENTS.tech.goals;
      const g = goals[createRng(seed).nextInt(goals.length)]!;
      return { kind, msLeft: EVENTS.tech.seconds * 1000, goal: g.id, label: g.label, need: g.count, done: 0 };
    }
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
