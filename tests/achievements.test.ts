import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num, toNumber } from '../src/sim/num';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { BUILDINGS } from '../src/data/buildings';
import { migrate, SAVE_VERSION } from '../src/save/schema';

function rich(seed = 1): World {
  const w = new World(seed);
  w.economy.balance = num(1e15);
  w.advance(0);
  return w;
}

const has = (w: World, id: string) => w.economy.meta.achievements.has(id);

describe('achievements', () => {
  it('57 of them, unique ids, four per building', () => {
    expect(ACHIEVEMENTS).toHaveLength(57);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(57);
    for (const b of BUILDINGS) expect(ACHIEVEMENTS.filter((a) => a.id.startsWith(`own_${b.id}_`))).toHaveLength(4);
    expect(ACHIEVEMENTS.filter((a) => a.hidden)).toHaveLength(4);
  });

  it('buying a building meets the owned ones, with an event each', () => {
    const w = rich();
    w.buy('single');
    expect(has(w, 'own_single_1')).toBe(true);
    expect(w.drainEvents().filter((e) => e.type === 'achievement')).toEqual([{ type: 'achievement', id: 'own_single_1' }]);
    for (let i = 1; i < 10; i++) w.buy('single');
    expect(has(w, 'own_single_10')).toBe(true);
    expect(has(w, 'own_single_50')).toBe(false);
  });

  it('each one adds 1% to all income', () => {
    const w = rich();
    w.awardAchievements = false;
    w.buy('single');
    const base = toNumber(w.incomePerSecond());
    w.awardAchievements = true;
    w.checkAchievements();
    expect(w.economy.meta.achievements.size).toBe(1);
    expect(toNumber(w.incomePerSecond())).toBeCloseTo(base * 1.01, 10);
    w.economy.meta.achievements.add('pc_1').add('level_10');
    expect(toNumber(w.incomePerSecond())).toBeCloseTo(base * 1.03, 10);
  });

  it('survive ascension, and count Lines over every run', () => {
    const w = rich();
    w.buy('single');
    w.economy.stats.riskLines = 1e9;
    w.economy.stats.linesEarned = 60_000;
    w.ascend();
    expect(has(w, 'own_single_1')).toBe(true);
    expect(has(w, 'ascend_1')).toBe(true);
    expect(has(w, 'lines_1k')).toBe(true);
    expect(has(w, 'lines_100k')).toBe(false);
    w.newRun();
    // The new run's Lines add to the old ones.
    w.economy.stats.linesEarned = 40_000;
    w.checkAchievements();
    expect(has(w, 'lines_100k')).toBe(true);
    const back = new World(1, JSON.parse(JSON.stringify(w.snapshot())));
    expect(back.economy.meta.achievements).toEqual(w.economy.meta.achievements);
  });

  it('bot Lines count toward lifetime Lines, swept once a second', () => {
    const w = rich();
    w.buy('single');
    w.economy.balance = num(0);
    for (let t = 16; t <= 20_000; t += 16) w.advance(t);
    expect(w.economy.stats.linesEarned).toBe(toNumber(w.economy.balance));
  });

  it('hidden: a golden piece placed flat, and an empty-bank ascension', () => {
    const w = rich();
    w.startRound();
    w.manual.golden.active = true;
    w.manualHardDrop(); // an empty board: nothing clears
    expect(has(w, 'golden_lost')).toBe(true);
    const v = new World(2);
    v.economy.stats.riskLines = 1e9;
    v.ascend();
    expect(has(v, 'empty_ascend')).toBe(true);
    expect(has(v, 'hc_ascend')).toBe(false);
  });

  it('a hardcore run that ends counts as one life finished', () => {
    const w = new World(3);
    w.economy.stats.riskLines = 1e9;
    w.ascend();
    w.setNextHardcore(true);
    w.newRun();
    w.economy.stats.riskLines = 8e9;
    w.startRound();
    w.ascend();
    expect(w.economy.meta.hardcoreAscensions).toBe(1);
    expect(has(w, 'hc_ascend')).toBe(true);
  });

  it('a v7 save loads with none met and no wrath piece', () => {
    const w = new World(1);
    const snap = JSON.parse(JSON.stringify(w.snapshot()));
    delete snap.meta.achievements; delete snap.meta.hardcoreAscensions; delete snap.meta.emptyAscensions;
    delete snap.manual.golden.wrath;
    const m = migrate({ version: 7, savedAt: 0, settings: {}, world: snap })!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(8);
    const back = new World(1, m.world);
    expect(back.economy.meta.achievements.size).toBe(0);
    expect(back.economy.meta.hardcoreAscensions).toBe(0);
    expect(back.manual.golden.wrath).toBe(false);
  });
});
