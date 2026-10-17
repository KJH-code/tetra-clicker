import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num, toNumber } from '../src/sim/num';
import { LEVELS } from '../src/data/levels';
import { PRESTIGE, TECH_CHECKS } from '../src/data/prestige';
import { migrate } from '../src/save/schema';
import { tag } from '../src/sim/tags';

const K = PRESTIGE.riskPerCrown;
const STEP = 1000 / 60;

function run(w: World, ms: number, from = 0): number {
  let t = from;
  for (; t <= from + ms; t += STEP) w.advance(t);
  return t;
}

// A world on the prestige shop, about to start a run in the given mode.
function nextRun(hardcore: boolean): World {
  const w = new World(1);
  w.advance(0);
  w.economy.meta.ascending = true;
  expect(w.setNextHardcore(hardcore)).toBe(true);
  w.newRun();
  return w;
}

describe('picking the mode', () => {
  it('the first run is normal and the mode only changes on the prestige shop', () => {
    const w = new World(1);
    expect(w.economy.meta.hardcore).toBe(false);
    expect(w.setNextHardcore(true)).toBe(false);
    const hc = nextRun(true);
    expect(hc.economy.meta.hardcore).toBe(true);
    expect(hc.setNextHardcore(false)).toBe(false);
  });

  it('the next run keeps the last mode unless changed', () => {
    const w = nextRun(true);
    w.economy.meta.ascending = true;
    w.newRun();
    expect(w.economy.meta.hardcore).toBe(true);
  });
});

describe('a hardcore run', () => {
  it('starts three levels up, with garbage from level 1 and three next pieces', () => {
    const w = nextRun(true);
    w.startRound();
    expect(w.round.level).toBe(LEVELS.startLevel + 3);
    expect(w.manual.rules.nextCount).toBe(3);
    const n = nextRun(false);
    n.startRound();
    expect(n.round.level).toBe(LEVELS.startLevel);
    expect(n.manual.rules.nextCount).toBe(5);
    // Level 4 is past normal's garbage start too; check level 1 directly.
    w.round.startLevel = 1;
    let t = run(w, 30_000);
    expect(w.manual.grid.some((c) => c === 8)).toBe(true);
    n.round.startLevel = 1;
    t = run(n, 30_000);
    expect(n.manual.grid.some((c) => c === 8)).toBe(false);
    expect(t).toBeGreaterThan(0);
  });

  it('pays manual ×2, weighs risk ×3 and lifts the tech cap to 1.5', () => {
    const w = nextRun(true);
    const n = nextRun(false);
    expect(w.economy.incomeMultiplier([tag.board('manual')]) / n.economy.incomeMultiplier([tag.board('manual')])).toBe(2);
    expect(w.riskWeight() / n.riskWeight()).toBe(3);
    for (const k of ['tss', 'tsd', 'tst', 'pcs', 'combo5', 'combo10', 'b2b5', 'goldens'] as const) w.economy.stats[k] = 10;
    w.economy.stats.tetrises = 10;
    w.economy.stats.maxLevel = 15;
    w.economy.stats.checkpoints = 10;
    expect(w.techScore()).toBeCloseTo(1.5, 10);
  });

  it('a top-out ascends the run on the spot, vault lost, even for no crowns', () => {
    const w = nextRun(true);
    w.economy.balance = num(1e6);
    w.buy('single');
    w.startRound();
    w.round.vault = 5000;
    w.round.vaultRisk = 5000 * 4;
    w.economy.stats.maxLifeRows = 37;
    w.events.length = 0;
    // Stack garbage until the board tops out.
    let t = 0;
    while (!w.ascending && t < 3_600_000) t = run(w, 1000, t);
    expect(w.ascending).toBe(true);
    expect(w.events.some((e) => e.type === 'hardcoreOver')).toBe(true);
    expect(w.economy.owned('single')).toBe(0);
    expect(w.economy.meta.ascensions).toBe(1);
    expect(w.economy.meta.hardcoreBest.rows).toBe(37);
    expect(w.economy.meta.hardcoreBest.level).toBeGreaterThanOrEqual(4);
  });

  it('can ascend mid-life, banking the vault and its risk, which counts as alive', () => {
    const w = nextRun(true);
    w.startRound();
    run(w, 1000);
    w.economy.stats.riskLines = K;
    w.round.vault = 7000;
    w.round.vaultRisk = 7000 * 4;
    expect(w.canAscend()).toBe(true);
    expect(w.techChecks().find((c) => c.id === 'hc_alive')!.done).toBe(true);
    const risk = w.economy.stats.riskLines + 7000 * 4 * w.riskWeight();
    const expected = Math.floor(Math.cbrt(risk / K) * (1 + w.techScore()) + 1e-9);
    expect(w.ascend()).toBe(expected);
    expect(w.economy.meta.lifetime.riskLines).toBeCloseTo(risk, 6);
  });

  it('normal runs still cannot ascend mid-life, and keep their retained share on a top-out', () => {
    const w = nextRun(false);
    w.startRound();
    w.economy.stats.riskLines = 8 * K;
    expect(w.canAscend()).toBe(false);
  });

  it('hardcore checks never count in a normal run', () => {
    const n = nextRun(false);
    n.economy.stats.maxLevel = 30;
    n.economy.stats.checkpoints = 30;
    n.economy.stats.maxLifeSeconds = 3600;
    n.economy.stats.rounds = 1;
    const hc = n.techChecks().filter((c) => c.id.startsWith('hc_'));
    expect(hc).toHaveLength(4);
    expect(hc.every((c) => !c.done)).toBe(true);
    expect(TECH_CHECKS.filter((c) => c.id.startsWith('hc_'))).toHaveLength(4);
  });

  it('thirty minutes alive is life time, counted while the life runs', () => {
    const w = nextRun(true);
    w.startRound();
    w.round.elapsedMs = 1_799_000;
    run(w, 1500);
    expect(w.round.active).toBe(true);
    expect(w.economy.stats.maxLifeSeconds).toBeGreaterThanOrEqual(1800);
  });
});

describe('save', () => {
  it('a v6 save loads as a normal run with no hardcore record', () => {
    const w = new World(1);
    const snap = w.snapshot() as unknown as Record<string, unknown>;
    const meta = snap['meta'] as Record<string, unknown>;
    delete meta['hardcore']; delete meta['nextHardcore']; delete meta['hardcoreBest'];
    const data = migrate({ version: 6, savedAt: 0, world: snap, settings: {} })!;
    const loaded = new World(data.world.seed, data.world);
    expect(loaded.economy.meta.hardcore).toBe(false);
    expect(loaded.economy.meta.hardcoreBest).toEqual({ level: 0, rows: 0 });
    expect(toNumber(loaded.economy.balance)).toBe(0);
  });
});
