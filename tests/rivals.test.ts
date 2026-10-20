import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { helperEvery } from '../src/data/buildings';
import type { LockResult } from '../src/sim/game';
import { HEIGHT, WIDTH } from '../src/sim/board';
import { GARBAGE_ID } from '../src/data/levels';

const STEP = 1000 / 60;
const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });

// A life at level 10 with `owned` copies of a building (bought through the ladder).
function world(id: string, owned = 1): World {
  const w = new World(1);
  w.awardAchievements = false;
  w.economy.balance = num(1e15);
  w.buy('single');
  w.economy.setOwned(id, owned);
  w.advance(0);
  w.startRound();
  w.round.startLevel = 10;
  return w;
}

const fx = (w: World, t: string) => (w as unknown as { fx(t: string, b: number): number }).fx(t, 1);

describe('buildings that reach into the manual board', () => {
  it('INVADER: purchase garbage 5% more a copy, hand income 10% more a copy', () => {
    const none = world('single');
    const three = world('invader', 3);
    expect(fx(none, 'buy_garbage')).toBe(1);
    expect(fx(three, 'buy_garbage')).toBeCloseTo(1.15, 9);
    expect(three.economy.incomeMultiplier(['board:manual']) / none.economy.incomeMultiplier(['board:manual'])).toBeCloseTo(1.3, 9);
  });

  it('HELPER: every N combo or back-to-back clears lifts a garbage row, N by copies', () => {
    expect([1, 2, 3, 9, 10, 30].map(helperEvery)).toEqual([4, 3, 2, 2, 1, 1]);
    const w = world('helper', 2);
    for (let i = 0; i < 4; i++) w.manual.addGarbage(0);
    const rows = () => Array.from({ length: HEIGHT }, (_, y) => w.manual.grid.subarray(y * WIDTH, y * WIDTH + WIDTH).includes(GARBAGE_ID)).filter(Boolean).length;
    w.manualLock(lock({ lines: 1, comboIndex: 1 }));
    w.manualLock(lock({ lines: 1, comboIndex: 2 }));
    w.manualLock(lock({ lines: 1, comboIndex: -1 })); // not a combo: does not count
    expect(rows()).toBe(4);
    w.manualLock(lock({ lines: 1, b2bExtended: true }));
    expect(rows()).toBe(3);
    expect(w.economy.stats.helperRows).toBe(1);
    expect(w.drainEvents().some((e) => e.type === 'helperRow')).toBe(true);
  });

  it('RIVAL: fights for as long as a life runs; attack cancels, the rest goes across', () => {
    const w = world('rival');
    w.economy.setOwned('invader', 1); // unlocks it
    expect(w.buy('rival')).toBe(true); // its board
    w.step(STEP);
    const d = w.duel!;
    expect(d).not.toBeNull();
    d.toMe = 3;
    w.manualLock(lock({ lines: 4 }));
    expect(d.toMe).toBe(0);
    expect(d.toRival).toBe(4);
    d.toMe = 2;
    w.manualLock(lock({}));
    expect(Array.from(w.manual.grid.subarray((HEIGHT - 1) * WIDTH)).filter((c) => c === GARBAGE_ID)).toHaveLength(WIDTH - 1);
  });

  it('RIVAL: buried, it starts over stronger and pays more each win in a row; my top-out ends the streak', () => {
    const w = world('rival');
    w.economy.setOwned('invader', 1);
    expect(w.buy('rival')).toBe(true);
    w.step(STEP);
    const pays: number[] = [];
    for (let k = 0; k < 2; k++) {
      w.duel!.toRival = 200;
      for (let t = 0; t < 90_000 && w.economy.meta.rivalStreak === k; t += STEP) {
        w.round.garbageMs = -1e12;
        w.step(STEP);
        if (!w.round.active) break;
      }
      const win = w.drainEvents().filter((e) => e.type === 'rivalWin').pop();
      if (!w.round.active) break;
      expect(win && win.type === 'rivalWin' && win.streak).toBe(k + 1);
      pays.push(win && win.type === 'rivalWin' ? Number(win.amount) : 0);
    }
    expect(w.economy.meta.rivalBest).toBeGreaterThanOrEqual(1);
    if (pays.length === 2) expect(pays[1]).toBeGreaterThan(pays[0]!);
    // Bury the manual board: the life ends and so does the streak.
    // (Gravity may have ended it already.)
    if (w.duel) w.duel.toMe = 300;
    for (let i = 0; i < 30 && w.round.active; i++) w.manualLock(lock({}));
    expect(w.round.active).toBe(false);
    expect(w.economy.meta.rivalStreak).toBe(0);
    expect(w.duel).toBeNull();
  });

  it('a kind bought as a building no longer turns up as an event', () => {
    const w = world('rival');
    for (let seed = 0; seed < 50; seed++) {
      w.round.eventMs = 1;
      const k = w.round.tickEvent(2, false, new Set(['rival', 'invader']));
      expect(k !== 'rival' && k !== 'invader').toBe(true);
    }
    w.round.eventMs = 1;
    expect(w.round.tickEvent(2, false, new Set(['rival', 'invader', 'helper', 'bonus', 'boss', 'tech', 'mystery']))).toBeNull();
  });
});
