import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { LEVELS, gravityAt, garbageSecondsAt } from '../src/data/levels';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import { HEIGHT, WIDTH } from '../src/sim/board';
import { num } from '../src/sim/num';
import type { GameSnapshot } from '../src/sim/game';

const STEP = 1000 / 60;

// A world whose manual board is one vertical I away from a tetris.
function readyWorld(seed = 1): World {
  const w = new World(seed);
  const manual: GameSnapshot = {
    grid: '1111111110/1111111110/1111111110/1111111110', holds: [], holdUsed: false,
    queue: ['I', 'I', 'O', 'S', 'Z', 'J', 'L'], rng: 3, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false,
  };
  const snap = w.snapshot();
  snap.manual = manual;
  const out = new World(seed, snap);
  out.advance(0);
  return out;
}

function tetris(w: World) {
  w.manual.rotateCW();
  while (w.manual.moveRight()) { /* wall */ }
  return w.manualHardDrop();
}

function run(w: World, ms: number, from = 0): number {
  let t = from;
  for (; t <= from + ms; t += STEP) w.advance(t);
  return t;
}

function topOut(w: World): void {
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH - 1; x++) w.manual.grid[y * WIDTH + x] = 1;
  w.manualHardDrop();
}

describe('a life', () => {
  it('manual Lines go to the vault, times the level', () => {
    const w = readyWorld();
    expect(w.startRound()).toBe(true);
    expect(w.round.level).toBe(1);
    tetris(w);
    expect(w.round.vault).toBe(20); // perfect clear, level 1
    expect(Number(w.economy.balance)).toBe(0);
    const v = readyWorld();
    v.startRound();
    v.round.rows = 20; // level 3
    tetris(v);
    expect(v.round.vault).toBe(20 * 3);
  });

  it('every 40 rows a checkpoint banks the vault', () => {
    const w = readyWorld();
    w.startRound();
    w.round.vault = 100;
    w.round.rows = LEVELS.checkpointRows - 4;
    w.drainEvents();
    tetris(w); // level 4 tetris: 80 more, then the checkpoint
    expect(Number(w.economy.balance)).toBe(180);
    expect(w.round.vault).toBe(0);
    expect(w.round.rowsToCheckpoint).toBe(LEVELS.checkpointRows);
    expect(w.economy.stats.checkpoints).toBe(1);
    expect(w.drainEvents().some((e) => e.type === 'checkpoint')).toBe(true);
  });

  it('there is no way out but a top-out, which takes the whole vault', () => {
    const w = readyWorld();
    w.startRound();
    tetris(w);
    expect('tapSettle' in w).toBe(false);
    topOut(w);
    expect(w.round.active).toBe(false);
    expect(Number(w.economy.balance)).toBe(0);
    expect(w.economy.stats.deaths).toBe(1);
    expect(w.manual.grid.every((c) => c === 0)).toBe(true);
  });

  it('the level resets with each life', () => {
    const w = readyWorld();
    w.startRound();
    w.round.rows = 55;
    expect(w.round.level).toBe(6);
    topOut(w);
    w.startRound();
    expect(w.round.level).toBe(1);
  });

  it('the shop stays open during a life', () => {
    const w = readyWorld();
    w.economy.balance = num(1e9);
    w.startRound();
    expect(w.buy('single')).toBe(true);
    w.economy.stats.manualLines = 2000;
    expect(w.buyUpgrade('manual_200')).toBe(true);
    expect(w.round.active).toBe(true);
  });
});

describe('levels', () => {
  it('ten rows a level, marathon style', () => {
    const w = readyWorld();
    w.startRound();
    w.round.rows = 9;
    expect(w.round.level).toBe(1);
    w.round.rows = 10;
    expect(w.round.level).toBe(2);
    w.round.rows = 95;
    expect(w.round.level).toBe(10);
  });

  it('wrath: I starts at 4, II levels every 8 rows, III starts at 8 and levels every 6', () => {
    const at = (stages: number, rows: number): number => {
      const w = readyWorld();
      for (let i = 1; i <= stages; i++) w.economy.upgrades.add(`wrath_${i}`);
      w.startRound();
      w.round.rows = rows;
      return w.round.level;
    };
    expect(at(1, 0)).toBe(4);
    expect(at(1, 10)).toBe(5);
    expect(at(2, 0)).toBe(4);
    expect(at(2, 8)).toBe(5);
    expect(at(3, 0)).toBe(8);
    expect(at(3, 6)).toBe(9);
    expect(at(3, 5)).toBe(8);
  });

  it('a level-up is announced and the highest level recorded', () => {
    const w = readyWorld();
    w.startRound();
    w.round.rows = 8;
    w.drainEvents();
    tetris(w);
    expect(w.drainEvents().some((e) => e.type === 'levelUp' && e.level === 2)).toBe(true);
    expect(w.economy.stats.maxLevel).toBe(2);
  });
});

describe('gravity and garbage', () => {
  it('gravity follows the level table and is on from the first life', () => {
    expect(gravityAt(1)).toBe(0.5);
    expect(gravityAt(5)).toBe(1.5);
    expect(gravityAt(10)).toBe(4);
    expect(gravityAt(15)).toBe(10);
    expect(gravityAt(20)).toBe(Infinity);
    const w = readyWorld();
    w.startRound(); // level 1: a cell every 2 s
    const y = w.manual.active!.y;
    run(w, 4100, 1);
    expect(w.manual.active!.y).toBe(y + 2);
  });

  it('at 20G a piece lands at once (level 39 in a normal run)', () => {
    const w = readyWorld();
    w.startRound();
    w.round.rows = 380; // level 39
    const ghost = w.manual.ghostY();
    run(w, 50, 1);
    expect(w.manual.active!.y).toBe(ghost);
  });

  it('garbage starts at level 3, every 24 ÷ level seconds, never under 1.5 s', () => {
    expect(garbageSecondsAt(1)).toBeNull();
    expect(garbageSecondsAt(2)).toBeNull();
    expect(garbageSecondsAt(3)).toBe(8);
    expect(garbageSecondsAt(6)).toBe(4);
    expect(garbageSecondsAt(30)).toBe(1.5);
    const w = readyWorld();
    w.startRound();
    run(w, 20_000, 1);
    expect(Array.from(w.manual.grid).filter((c) => c === 8)).toHaveLength(0);
  });

  it('timed cheese: none in a normal life; in hardcore on schedule (a third as often) with the same holes for the same seed', () => {
    const normal = new World(5);
    normal.advance(0);
    normal.startRound();
    normal.round.rows = 20;
    for (let t = 1; t < 60_000; t += STEP) {
      normal.advance(t);
      if (normal.manual.active) normal.manual.active = { ...normal.manual.active, y: 20 };
    }
    expect(normal.drainEvents().filter((e) => e.type === 'garbage')).toHaveLength(0);
    const holes = (seed: number) => {
      const w = new World(seed);
      w.economy.meta.hardcore = true;
      w.advance(0);
      w.startRound();
      // Two rows' worth of time at this level, three times the old gap.
      const until = 2.1 * garbageSecondsAt(w.round.level, 1)! * 3 * 1000;
      let rows = 0;
      for (let t = 1; t < until; t += STEP) {
        w.advance(t);
        // Keep the piece from locking so only garbage changes the stack.
        if (w.manual.active) w.manual.active = { ...w.manual.active, y: 20 };
        rows += w.drainEvents().filter((e) => e.type === 'garbage').length;
      }
      return { rows, grid: Array.from(w.manual.grid) };
    };
    const a = holes(5);
    const b = holes(5);
    expect(a.rows).toBe(2);
    expect(a.grid).toEqual(b.grid);
    for (let y = HEIGHT - a.rows; y < HEIGHT; y++) {
      expect(a.grid.slice(y * WIDTH, (y + 1) * WIDTH).filter((c) => c === 0)).toHaveLength(1);
    }
  });

  it('nothing moves while paused', () => {
    const w = readyWorld();
    w.startRound();
    w.pauseRound();
    const y = w.manual.active!.y;
    run(w, 10_000, 1);
    expect(w.manual.active!.y).toBe(y);
    expect(w.round.elapsedMs).toBe(0);
  });

  it('a long gap pauses the life while bots keep earning', () => {
    const w = readyWorld();
    w.economy.balance = num(1000);
    w.buy('single');
    w.startRound();
    run(w, 1000, 1);
    const balance = Number(w.economy.balance);
    w.advance(1000 + 60_000);
    expect(w.round.paused).toBe(true);
    expect(Number(w.economy.balance)).toBeGreaterThan(balance);
  });
});

describe('saves', () => {
  it('a life in progress comes back paused', () => {
    const w = readyWorld();
    w.startRound();
    w.round.rows = 12;
    tetris(w);
    const w2 = new World(1, JSON.parse(JSON.stringify(w.snapshot())));
    expect(w2.round.phase).toBe('running');
    expect(w2.round.paused).toBe(true);
    expect(w2.round.vault).toBe(w.round.vault);
    expect(w2.round.level).toBe(2);
  });

  it('a version 2 save migrates with no life in progress', () => {
    const v2 = {
      version: 2, savedAt: 1, settings: {},
      world: {
        seed: 3, accumulatorMs: 0,
        manual: { grid: '', holds: [], holdUsed: false, queue: ['I', 'O', 'S', 'Z', 'J', 'L', 'T'], rng: 5, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false },
        economy: { balance: '7', owned: {}, upgrades: [], stats: { manualLines: 0, manualPieces: 0, spins: 0, combo5: 0, b2bs: 0, pcs: 0 } },
        autoBoards: [],
      },
    };
    const data = migrate(v2);
    expect(data?.version).toBe(SAVE_VERSION);
    const w = new World(3, data!.world);
    expect(w.round.phase).toBe('idle');
    expect(Number(w.economy.balance)).toBe(14); // old Lines, doubled into the whole-number unit
  });

  it('a version 5 round in progress is banked in full and the settle key dropped', () => {
    const snap = new World(1).snapshot() as unknown as Record<string, unknown>;
    (snap['economy'] as Record<string, unknown>)['balance'] = '100';
    (snap['economy'] as Record<string, Record<string, number>>)['stats']!['roundsSettled'] = 3;
    snap['round'] = { phase: 'running', paused: true, vault: 55, danger: 0.7, elapsedMs: 1, garbageMs: 0, settleMs: 0, rng: 1, goldenMs: 1, goldenRng: 1 };
    const keys = { left: ['ArrowLeft'], settle: ['Enter'] };
    const m = migrate({ version: 5, savedAt: 0, settings: { das: 1, arr: 1, sdf: 1, keys }, world: snap })!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.world.round).toBeNull();
    expect(m.world.economy.balance).toBe('155');
    expect('roundsSettled' in m.world.economy.stats).toBe(false);
    expect('settle' in m.settings.keys).toBe(false);
  });
});
