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
  it('none below level 3; from level 3 one turns up within 2–5 minutes, the same for the same seed', () => {
    // The round's timer alone: a played-out life would top out under gravity first.
    const low = world(2);
    expect(low.round.tickEvent(9 * 60_000, false)).toBeNull();
    const kinds = (seed: number) => {
      const w = world(3, seed);
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
    const seen = new Set(Array.from({ length: 80 }, (_, i) => kinds(i + 1)));
    expect([...seen].sort()).toEqual(['bonus', 'boss', 'helper', 'invader', 'mystery', 'rival', 'tech']);
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
    // PER SECOND here includes the bots' 20% for an empty manual stack.
    expect(won && won.type === 'lifeEvent' && Number(won.amount)).toBe(0.8 * 1.2 * 120 * 10);
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

  it('invader: attack blocks rows, surviving pays four times the hand Lines', () => {
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
    expect(won && won.type === 'lifeEvent' && Number(won.amount)).toBe(Math.floor(earned * EVENTS.invader.payout));
    expect(w.round.vault - vault).toBe(Math.floor(earned * EVENTS.invader.payout));
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

describe('new life events', () => {
  it('weights: half kind at level 3, the fights grow to level 15 and stop', () => {
    const at = (l: number) => EVENTS.weights(l);
    const good = (l: number) => at(l).helper + at(l).bonus + at(l).mystery;
    const rest = (l: number) => at(l).rival + at(l).invader + at(l).boss + at(l).tech;
    expect(good(3)).toBeCloseTo(rest(3), 9);
    expect(rest(15)).toBeGreaterThan(rest(3) * 3.5);
    expect(rest(30)).toBe(rest(15));
  });

  it('bonus round: the hand earns ×4.5 for 30 s, then reports the total', () => {
    const plain = world(4);
    const a = Number(plain.manualLock(lock({ lines: 1 })));
    const w = world(4);
    w.beginEvent('bonus');
    const b = Number(w.manualLock(lock({ lines: 1 })));
    expect(b / a).toBeCloseTo(EVENTS.bonus.incomeMul, 1);
    w.drainEvents();
    runFor(w, EVENTS.bonus.seconds * 1000 + 50);
    expect(w.lifeEvent).toBeNull();
  });

  it('mystery: ×3 by hand while it lasts', () => {
    const plain = world(4);
    const a = Number(plain.manualLock(lock({ lines: 2 })));
    const w = world(4);
    w.beginEvent('mystery');
    expect(Number(w.manualLock(lock({ lines: 2 })))).toBeCloseTo(a * EVENTS.mystery.incomeMul, -1);
  });

  it('boss: level × 10 HP, my attack cancels its rows then hurts it; killing it pays', () => {
    const w = world(4);
    w.beginEvent('boss');
    const ev = w.lifeEvent!;
    if (ev.kind !== 'boss') throw new Error('boss expected');
    expect(ev.maxHp).toBe(40);
    ev.toMe = 2;
    w.manualLock(lock({ lines: 4 })); // 7 rows: 2 cancel, 5 damage
    expect(ev.toMe).toBe(0);
    expect(ev.hp).toBe(35);
    // It attacks every 6 s.
    for (let t = 0; t < 6_100; t += STEP) (w as unknown as { stepEvent(dt: number): boolean }).stepEvent(STEP);
    expect(ev.toMe).toBe(EVENTS.boss.attackRows);
    ev.hp = 3;
    const before = w.round.vault;
    w.drainEvents();
    w.manualLock(lock({ lines: 4 }));
    expect(w.lifeEvent).toBeNull();
    const won = w.drainEvents().find((e) => e.type === 'lifeEvent' && e.phase === 'won');
    expect(won).toBeTruthy();
    expect(w.round.vault).toBeGreaterThan(before);
    expect(w.economy.stats.bossesBeaten).toBe(1);
  });

  it('boss: gone after 90 s if alive', () => {
    const w = world(4);
    w.beginEvent('boss');
    for (let t = 0; t < 90_100; t += 100) (w as unknown as { stepEvent(dt: number): boolean }).stepEvent(100);
    expect(w.lifeEvent).toBeNull();
  });

  it('tech challenge: its technique n times in 60 s pays; otherwise it fails', () => {
    const w = world(4);
    w.beginEvent('tech');
    const ev = w.lifeEvent!;
    if (ev.kind !== 'tech') throw new Error('tech expected');
    const hit: Record<string, Partial<LockResult>> = {
      tetris: { lines: 4 }, tspin: { piece: 'T', spin: 'full', lines: 2 }, b2b: { lines: 4, b2bExtended: true }, combo5: { lines: 1, comboIndex: 5 },
    };
    w.drainEvents();
    for (let i = 0; i < ev.need; i++) w.manualLock(lock(hit[ev.goal]!));
    expect(w.lifeEvent).toBeNull();
    expect(w.drainEvents().some((e) => e.type === 'lifeEvent' && e.phase === 'won')).toBe(true);
    const w2 = world(4);
    w2.beginEvent('tech');
    w2.drainEvents();
    for (let t = 0; t < 60_100; t += 100) (w2 as unknown as { stepEvent(dt: number): boolean }).stepEvent(100);
    expect(w2.drainEvents().some((e) => e.type === 'lifeEvent' && e.phase === 'lost')).toBe(true);
  });
});

describe('rival, softened for normal runs', () => {
  it('normal: 200 + 30 × level nodes, 800 at most, a slip one piece in ten; hardcore unchanged', () => {
    expect(EVENTS.rival.nodes(10, 0.5)).toBe(500);
    expect(EVENTS.rival.nodes(40, 0.5)).toBe(800);
    expect(EVENTS.rival.nodes(10, 1)).toBe(1_700);
    expect(EVENTS.rival.slipChance(0.5)).toBe(0.1);
    expect(EVENTS.rival.slipChance(1)).toBe(0);
    const w = world(20);
    w.beginEvent('rival');
    const ev = w.lifeEvent!;
    expect(ev.kind === 'rival' && [ev.nodes, ev.slipChance]).toEqual([800, 0.1]);
  });

  it('90 s at most: the lower stack wins half the reward, else it leaves', () => {
    const fight = (mineHigher: boolean) => {
      const w = world(10);
      w.beginEvent('rival');
      const ev = w.lifeEvent!;
      if (ev.kind !== 'rival') throw new Error('rival expected');
      for (let i = 0; i < 4; i++) (mineHigher ? w.manual : ev.game).addGarbage(i);
      ev.msLeft = 1;
      ev.timerMs = 1e9; // it does not move again
      w.drainEvents();
      (w as unknown as { stepEvent(dt: number): boolean }).stepEvent(5);
      expect(w.lifeEvent).toBeNull();
      return w.drainEvents().find((e) => e.type === 'lifeEvent')!;
    };
    const won = fight(false);
    expect(won.type === 'lifeEvent' && won.phase).toBe('won');
    expect(won.type === 'lifeEvent' && Number(won.amount)).toBeGreaterThan(0);
    const left = fight(true);
    expect(left.type === 'lifeEvent' && left.phase).toBe('over');
  });
});
