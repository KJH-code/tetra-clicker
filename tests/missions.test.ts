import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { MISSIONS, MISSIONS_PER_LIFE, missionById } from '../src/data/missions';
import type { LockResult } from '../src/sim/game';
import { missionMinutesPerLife } from '../src/sim/luck';

const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });

function life(seed = 1): World {
  const w = new World(seed);
  w.awardAchievements = false;
  w.advance(0);
  w.startRound();
  return w;
}

describe('life missions', () => {
  it('three different missions a life, the same for the same seed', () => {
    const a = life(7).missions.map((m) => m.id);
    expect(a).toHaveLength(MISSIONS_PER_LIFE);
    expect(new Set(a).size).toBe(MISSIONS_PER_LIFE);
    expect(life(7).missions.map((m) => m.id)).toEqual(a);
    expect(a.every((id) => missionById(id))).toBe(true);
  });

  it('a met mission pays its minutes into the vault once', () => {
    const w = life();
    (w as unknown as { manualRate: number }).manualRate = 10;
    w.missions = [{ id: 'tetris3', base: w.economy.stats.tetrises, done: false }];
    w.drainEvents();
    for (let i = 0; i < 2; i++) w.manualLock(lock({ lines: 4 }));
    expect(w.drainEvents().some((e) => e.type === 'missionDone')).toBe(false);
    expect(w.missionProgress(w.missions[0]!)).toBe(2);
    const before = w.round.vault;
    w.manualLock(lock({ lines: 4 }));
    const done = w.drainEvents().filter((e) => e.type === 'missionDone');
    expect(done).toHaveLength(1);
    const paid = done[0]!.type === 'missionDone' ? Number(done[0]!.amount) : 0;
    // 2 minutes of the hand's 10/s (the hand's rate grew with the tetrises' Lines).
    expect(paid).toBeGreaterThanOrEqual(1_200);
    expect(w.round.vault - before).toBeGreaterThanOrEqual(paid);
    w.manualLock(lock({ lines: 4 }));
    expect(w.drainEvents().some((e) => e.type === 'missionDone')).toBe(false);
    expect(w.economy.stats.missionsDone).toBe(1);
  });

  it('a top-out ends them; a save keeps them', () => {
    const w = life(3);
    const ids = w.missions.map((m) => m.id);
    const back = new World(3, JSON.parse(JSON.stringify(w.snapshot())));
    expect(back.missions.map((m) => m.id)).toEqual(ids);
    (w as unknown as { endRound(): void }).endRound();
    expect(w.missions).toEqual([]);
  });

  it('every mission names a counter or a kind it can read', () => {
    for (const m of MISSIONS) expect(m.kind !== 'stat' || m.stat).toBeTruthy();
  });
});

describe('the simulator prices missions', () => {
  it('a singles player meets only the time, level, piece and checkpoint missions', () => {
    // 3 of 10 drawn; survive (1) + level (2) + pieces (1) + checkpoint (2) in a 5-minute life.
    expect(missionMinutesPerLife(0.5, 0.25, 300)).toBeCloseTo(1.8, 9);
    expect(missionMinutesPerLife(0.5, 0.25, 170)).toBeCloseTo(0.6, 9);
  });
});
