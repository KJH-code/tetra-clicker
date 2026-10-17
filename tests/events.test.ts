import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { EVENTS } from '../src/data/events';
import type { LockResult } from '../src/sim/game';
import { HEIGHT, WIDTH } from '../src/sim/board';
import { GARBAGE_ID } from '../src/data/levels';

const STEP = 1000 / 60;
const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });

// A life at `level` with a bot running (so PER SECOND is not zero).
function world(level: number, seed = 1): World {
  const w = new World(seed);
  w.awardAchievements = false;
  w.economy.balance = num(1e6);
  w.buy('single');
  w.advance(0);
  w.startRound();
  w.round.startLevel = level;
  return w;
}

function runFor(w: World, ms: number): void {
  for (let t = 0; t < ms; t += STEP) w.step(STEP);
}

describe('life events', () => {
  it('none below level 5; from level 5 one turns up within 3–8 minutes, the same for the same seed', () => {
    // The round's timer alone: a played-out life would top out under gravity first.
    const low = world(4);
    expect(low.round.tickEvent(9 * 60_000, false)).toBeNull();
    const kinds = (seed: number) => {
      const w = world(5, seed);
      const due = w.round.eventMs;
      expect(due).toBeGreaterThanOrEqual(EVENTS.minSeconds * 1000);
      expect(due).toBeLessThanOrEqual(EVENTS.maxSeconds * 1000);
      expect(w.round.tickEvent(due - 1, false)).toBeNull();
      // Not while another is on.
      expect(w.round.tickEvent(2, true)).toBeNull();
      return w.round.tickEvent(2, false);
    };
    expect(kinds(3)).not.toBeNull();
    expect(kinds(3)).toBe(kinds(3));
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(kinds));
    expect([...seen].sort()).toEqual(['helper', 'invader', 'rival']);
  });

  it('rival: my attack cancels incoming first, the rest goes across; a flat piece takes what is left', () => {
    const w = world(10);
    w.beginEvent('rival');
    const ev = w.lifeEvent!;
    if (ev.kind !== 'rival') throw new Error('rival expected');
    ev.toMe = 3;
    // A tetris sends 7 rows: 3 cancel, 4 go across.
    w.manualLock(lock({ lines: 4, clearedRows: [] }));
    expect(ev.toMe).toBe(0);
    expect(ev.toRival).toBe(4);
    ev.toMe = 2;
    w.manualLock(lock({}));
    expect(ev.toMe).toBe(0);
    const bottom = Array.from(w.manual.grid.subarray((HEIGHT - 1) * WIDTH, HEIGHT * WIDTH));
    expect(bottom.filter((c) => c === GARBAGE_ID)).toHaveLength(WIDTH - 1);
  });

  it('rival: buried, it loses and the vault gets PER SECOND × 120 s × level', () => {
    const w = world(10);
    w.beginEvent('rival');
    const ev = w.lifeEvent!;
    if (ev.kind !== 'rival') throw new Error('rival expected');
    ev.toRival = 40;
    runFor(w, 20_000);
    const won = w.drainEvents().find((e) => e.type === 'lifeEvent' && e.phase === 'won');
    expect(won && won.type === 'lifeEvent' && Number(won.amount)).toBe(0.8 * 120 * 10);
    expect(w.lifeEvent).toBeNull();
    expect(w.economy.stats.rivalWins).toBe(1);
  });

  it('a top-out during an event ends it with nothing paid', () => {
    const w = world(10);
    w.beginEvent('rival');
    const ev = w.lifeEvent!;
    if (ev.kind !== 'rival') throw new Error('rival expected');
    ev.toMe = 200;
    for (let i = 0; i < 20 && w.round.active; i++) w.manualLock(lock({}));
    expect(w.round.active).toBe(false);
    expect(w.drainEvents().some((e) => e.type === 'lifeEvent' && e.phase === 'lost')).toBe(true);
  });

  it('invader: garbage three times as fast, attack blocks rows, surviving pays three times the hand Lines', () => {
    const w = world(10);
    w.beginEvent('invader');
    const ev = w.lifeEvent!;
    if (ev.kind !== 'invader') throw new Error('invader expected');
    w.manualLock(lock({ lines: 4 }));
    expect(ev.shield).toBe(7);
    const earned = ev.earned;
    expect(earned).toBeGreaterThan(0);
    // Garbage comes three times as fast while it lasts.
    const before = w.round.garbageMs;
    w.step(STEP);
    expect(w.round.garbageMs - before).toBeCloseTo(STEP, 6);
    // Skip to its last moment (playing it out would top the life out under gravity).
    ev.msLeft = 1;
    const vault = w.round.vault;
    w.step(STEP);
    const won = w.drainEvents().find((e) => e.type === 'lifeEvent' && e.phase === 'won');
    expect(won && won.type === 'lifeEvent' && Number(won.amount)).toBe(Math.floor(earned * 3));
    expect(w.round.vault - vault).toBe(Math.floor(earned * 3));
    expect(w.economy.stats.invadersSurvived).toBe(1);
  });

  it('helper: a combo or back-to-back clear lifts one garbage row and pays it like a single', () => {
    const w = world(10);
    w.manual.addGarbage(0);
    w.manual.addGarbage(1);
    w.beginEvent('helper');
    const vault = w.round.vault;
    w.manualLock(lock({ lines: 1, comboIndex: 0 }));
    expect(w.economy.stats.helperRows).toBe(0);
    w.manualLock(lock({ lines: 1, comboIndex: 1 }));
    expect(w.economy.stats.helperRows).toBe(1);
    expect(w.round.vault).toBeGreaterThan(vault);
    runFor(w, EVENTS.helper.seconds * 1000 + 100);
    expect(w.lifeEvent).toBeNull();
  });
});
