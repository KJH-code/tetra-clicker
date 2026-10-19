import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num, toNumber } from '../src/sim/num';
import { PRESTIGE, PRESTIGE_UPGRADES, TECH_CHECKS, prestigeRequires } from '../src/data/prestige';
import { crownCurve, crownGain } from '../src/sim/prestige';
import { LEVELS } from '../src/data/levels';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import type { GameSnapshot } from '../src/sim/game';

const K = PRESTIGE.riskPerCrown;
const STEP = 1000 / 60;

function run(w: World, ms: number, from = 0): number {
  let t = from;
  for (; t <= from + ms; t += STEP) w.advance(t);
  return t;
}

// A world with a run behind it: bots, upgrades, stats and risk worth `crowns` crowns.
function ranWorld(crowns = 3): World {
  const w = new World(1);
  w.advance(0);
  w.economy.balance = num(1e9);
  w.buy('single');
  w.buy('single');
  w.economy.stats.manualLines = 5000;
  w.buyUpgrade('manual_200');
  w.economy.stats.riskLines = K * crowns ** 3;
  w.grantBuff('frenzy');
  return w;
}

function ascendTo(w: World, ids: string[]): void {
  w.economy.meta.crowns = 1000;
  w.economy.meta.ascending = true;
  for (const id of ids) expect(w.buyPrestige(id)).toBe(true);
  w.newRun();
}

function readyManual(w: World): World {
  const snap = w.snapshot();
  snap.manual = {
    grid: '1111111110/1111111110/1111111110/1111111110', holds: [], holdUsed: false,
    queue: ['I', 'O', 'S', 'Z', 'J', 'L', 'T'], rng: 3, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false,
  } as GameSnapshot;
  const out = new World(1, snap);
  out.advance(0);
  return out;
}

function tetris(w: World) {
  w.manual.rotateCW();
  while (w.manual.moveRight()) { /* wall */ }
  return w.manualHardDrop();
}

describe('crown formula', () => {
  it('K of risk is one crown, 8K two: a cube root', () => {
    expect(crownCurve(K)).toBeCloseTo(1, 12);
    expect(crownGain(0, K, 0)).toBe(1);
    expect(crownGain(0, 8 * K, 0)).toBe(2);
    expect(crownGain(0, 7.9 * K, 0)).toBe(1); // rounds down
  });

  it('a later ascension pays only the growth since the last one', () => {
    expect(crownGain(8 * K, 19 * K, 0)).toBe(1); // ∛27 − ∛8
  });

  it('tech score multiplies this run’s share', () => {
    expect(crownGain(0, 8 * K, 0.5)).toBe(3);
  });
});

describe('tech checklist', () => {
  it('each check reads a run statistic', () => {
    const w = new World(1);
    expect(w.techScore()).toBe(0);
    const s = w.economy.stats;
    s.tss = 1; s.tsd = 1; s.tst = 1; s.pcs = 1; s.combo5 = 1; s.combo10 = 1; s.b2b5 = 1; s.tetrises = 9; s.maxLevel = 10; s.goldens = 3;
    // Hardcore checks need a hardcore run (tests/hardcore.test.ts).
    expect(w.techChecks().filter((c) => c.done).map((c) => c.id)).toEqual(TECH_CHECKS.map((c) => c.id).filter((id) => id !== 'tetris10' && !id.startsWith('hc_')));
    expect(w.techScore()).toBeCloseTo(1.0, 12); // nine checks, capped
    s.tss = 0; s.tsd = 0; s.tst = 0;
    expect(w.techScore()).toBeCloseTo(6 * 0.15, 12);
  });

  it('the cap is 1.0, raised by TECH CAP +0.5', () => {
    const w = new World(1);
    ascendTo(w, ['proportion_1', 'proportion_2']);
    const s = w.economy.stats;
    s.tss = s.tsd = s.tst = s.pcs = s.combo5 = s.combo10 = s.b2b5 = 1; s.maxLevel = 10; s.tetrises = 10; s.goldens = 3;
    expect(w.techScore()).toBeCloseTo(1.5, 12); // all ten count once the cap is raised
  });

  it('play records the counters: tetrises and the highest level', () => {
    const w = readyManual(new World(1));
    w.startRound();
    w.round.rows = 86; // level 9, four rows short of 10
    tetris(w);
    expect(w.economy.stats.tetrises).toBe(1);
    expect(w.economy.stats.maxLevel).toBe(10);
  });
});

describe('risk weight', () => {
  it('banked Lines × level × weight, counted at the checkpoint; bots add nothing', () => {
    const w = readyManual(new World(1));
    w.startRound();
    w.round.rows = LEVELS.checkpointRows - 8; // level 4, eight rows to the checkpoint
    tetris(w);
    const earned = w.round.vault;
    expect(earned).toBe(20 * 4);
    expect(w.economy.stats.riskLines).toBe(0); // not banked yet
    w.round.vaultRisk = earned * 4;
    w['checkpoint'](1);
    expect(w.economy.stats.riskLines).toBeCloseTo(earned * 4, 9);
    const bots = ranWorld(0);
    bots.economy.stats.riskLines = 0;
    run(bots, 30_000, 1);
    expect(bots.economy.stats.riskLines).toBe(0);
  });

  it('RISK WEIGHT ×1.5 then ×2 scale it; a top-out drops the unbanked part', () => {
    const w = new World(1);
    ascendTo(w, ['proportion_1', 'proportion_2', 'proportion_3']);
    const r = readyManual(w);
    r.startRound();
    r.round.rows = LEVELS.checkpointRows - 4; // level 4; this tetris reaches the checkpoint
    tetris(r);
    expect(r.round.vault).toBe(0);
    expect(r.economy.stats.riskLines).toBeCloseTo(20 * 4 * 4 * 3, 9);
    const before = r.economy.stats.riskLines;
    r.round.vault = 500;
    r.round.vaultRisk = 2000;
    r['endRound']();
    expect(r.economy.stats.riskLines).toBe(before);
  });
});

describe('ascension', () => {
  it('is refused under one crown and during a round', () => {
    const w = new World(1);
    w.economy.stats.riskLines = K * 0.9;
    expect(w.canAscend()).toBe(false);
    w.economy.stats.riskLines = K;
    w.startRound();
    expect(w.canAscend()).toBe(false);
    expect(w.ascend()).toBe(0);
  });

  it('banks crowns, wipes the run and keeps meta', () => {
    const w = ranWorld(3);
    const runStats = { ...w.economy.stats };
    expect(w.crownPreview()).toBe(3);
    expect(w.ascend()).toBe(3);
    const m = w.economy.meta;
    expect([m.crowns, m.crownsEarned, m.ascensions, m.ascending]).toEqual([3, 3, 1, true]);
    expect(m.riskBanked).toBeCloseTo(27 * K, 6);
    expect(m.lifetime.manualLines).toBe(runStats.manualLines);
    expect(Number(w.economy.balance)).toBe(0);
    expect(w.economy.owned('single')).toBe(0);
    expect(w.economy.upgrades.size).toBe(0);
    expect(w.economy.stats.riskLines).toBe(0);
    expect(w.autoBoards).toEqual([]);
    expect(w.buffs.active).toEqual([]);
    expect(w.round.active).toBe(false);
    // Waiting on the prestige shop: no rounds, no buying.
    expect(w.startRound()).toBe(false);
    w.economy.balance = num(1e9);
    expect(w.buy('single')).toBe(false);
    w.economy.balance = num(0);
    expect(w.newRun()).toBe(true);
    expect(w.ascending).toBe(false);
    expect(w.startRound()).toBe(true);
  });

  it('every crown ever earned adds 1% to income, spent or not', () => {
    const w = ranWorld(3);
    w.ascend();
    w.buyPrestige('survival_1'); // spend one
    w.newRun();
    // Achievements met on the way add their own 1% each.
    const ach = w.economy.meta.achievements.size;
    expect(w.economy.incomeMultiplier(['board:auto'])).toBeCloseTo(1.03 * (1 + ach / 100), 12);
  });

  it('a second ascension pays the curve growth only', () => {
    const w = ranWorld(2); // 8K
    w.ascend();
    w.newRun();
    w.economy.stats.riskLines = 19 * K; // lifetime 27K
    expect(w.crownPreview()).toBe(1);
  });
});

describe('prestige shop', () => {
  it('chains of four at 1 / 3 / 9 / 27, only while ascending, in order', () => {
    for (const b of ['production', 'survival', 'proportion']) {
      expect(PRESTIGE_UPGRADES.filter((u) => u.branch === b).map((u) => u.price)).toEqual([1, 3, 9, 27]);
    }
    expect(prestigeRequires('survival_2')).toBe('survival_1');
    const w = new World(1);
    w.economy.meta.crowns = 100;
    expect(w.buyPrestige('production_1')).toBe(false); // not ascending
    w.economy.meta.ascending = true;
    expect(w.buyPrestige('production_2')).toBe(false); // chain order
    expect(w.buyPrestige('production_1')).toBe(true);
    expect(w.buyPrestige('production_1')).toBe(false); // once
    expect(w.economy.meta.crowns).toBe(99);
    w.economy.meta.crowns = 2;
    expect(w.buyPrestige('production_2')).toBe(false); // costs 3
  });

  it('production: all ×2, start with 2K, manual ×3, all ×2', () => {
    const w = new World(1);
    ascendTo(w, ['production_1', 'production_2']);
    expect(Number(w.economy.balance)).toBe(2000);
    expect(w.economy.incomeMultiplier(['board:auto'])).toBeCloseTo(2, 12);
    const v = new World(1);
    ascendTo(v, ['production_1', 'production_2', 'production_3', 'production_4']);
    expect(v.economy.incomeMultiplier(['board:auto'])).toBeCloseTo(4, 12);
    expect(v.economy.incomeMultiplier(['board:manual'])).toBeCloseTo(12, 12);
  });

  it('survival: gravity ×0.8, keep 25% then 50% of the vault, purchase garbage ×0.8', () => {
    const a = new World(1);
    ascendTo(a, ['survival_1', 'survival_2']);
    expect(a['fx']('gravity', 1)).toBeCloseTo(0.8, 12);
    a.startRound();
    a.round.vault = 1000;
    a['endRound']();
    expect(Number(a.economy.balance)).toBe(250);
    const b = new World(1);
    ascendTo(b, ['survival_1', 'survival_2', 'survival_3', 'survival_4']);
    b.startRound();
    b.round.vault = 1000;
    b.round.vaultRisk = 4000;
    b['endRound']();
    expect(Number(b.economy.balance)).toBe(500);
    expect(b.economy.stats.riskLines).toBeCloseTo(2000, 9); // the kept half counts as banked
    // Measured between lives, where purchases send twice the rows.
    expect(b['fx']('buy_garbage', 1)).toBeCloseTo(0.8 * 2, 12);
  });

  it('START LEVEL +2 raises every life’s starting level', () => {
    const w = new World(1);
    ascendTo(w, ['proportion_1', 'proportion_2', 'proportion_3', 'proportion_4']);
    w.startRound();
    expect(w.round.level).toBe(3);
  });
});

describe('save v5', () => {
  it('meta and the prestige shop survive a save', () => {
    const w = ranWorld(3);
    w.ascend();
    w.buyPrestige('production_1');
    const back = new World(1, JSON.parse(JSON.stringify(w.snapshot())));
    expect(back.ascending).toBe(true);
    expect(back.economy.meta.crowns).toBe(2);
    expect(back.economy.hasPrestige('production_1')).toBe(true);
    expect(toNumber(back.economy.balance)).toBe(0);
  });

  it('migrates a v4 save as never ascended', () => {
    const v4 = { version: 4, savedAt: 0, settings: {}, world: { ...new World(1).snapshot() } } as Record<string, unknown>;
    delete (v4['world'] as Record<string, unknown>)['meta'];
    const m = migrate(v4)!;
    expect(m.version).toBe(SAVE_VERSION);
    const w = new World(1, m.world);
    expect(w.economy.meta.crownsEarned).toBe(0);
    expect(w.ascending).toBe(false);
  });
});
