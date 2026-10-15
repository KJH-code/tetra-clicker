import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { DANGER } from '../src/data/danger';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import { HEIGHT, WIDTH } from '../src/sim/board';
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

describe('round flow', () => {
  it('manual Lines go to the vault, and settling banks all of them', () => {
    const w = readyWorld();
    expect(w.startRound()).toBe(true);
    const r = tetris(w);
    expect(r.lines).toBe(4);
    expect(w.round.vault).toBeCloseTo(10, 10); // perfect clear replaces the base with 10
    expect(Number(w.economy.balance)).toBe(0);
    expect(w.tapSettle()).toBe(false); // first tap
    expect(w.tapSettle()).toBe(true); // second tap inside the window
    expect(w.round.phase).toBe('settling');
    run(w, DANGER.settleCountdownMs + 50, 1);
    expect(w.round.phase).toBe('idle');
    expect(Number(w.economy.balance)).toBeCloseTo(10, 10);
    expect(w.economy.stats.roundsSettled).toBe(1);
  });

  it('a second tap outside the window does not settle', () => {
    const w = readyWorld();
    w.startRound();
    w.tapSettle();
    run(w, DANGER.settleDoubleTapMs + 100, 1);
    expect(w.tapSettle()).toBe(false);
    expect(w.round.phase).toBe('running');
  });

  it('a top-out banks only what the forfeit leaves and resets the board', () => {
    const w = readyWorld();
    w.startRound();
    tetris(w);
    const vault = w.round.vault;
    // Fill the board to force a top-out on the next lock.
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH - 1; x++) w.manual.grid[y * WIDTH + x] = 1;
    const r = w.manualHardDrop();
    expect(r.topped).toBe(true);
    expect(w.round.phase).toBe('idle');
    expect(Number(w.economy.balance)).toBeCloseTo(vault * (1 - DANGER.forfeit), 10);
    expect(w.manual.grid.every((c) => c === 0)).toBe(true);
  });

  it('a top-out during the settle countdown still forfeits', () => {
    const w = readyWorld();
    w.startRound();
    tetris(w);
    w.tapSettle(); w.tapSettle();
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH - 1; x++) w.manual.grid[y * WIDTH + x] = 1;
    w.manualHardDrop();
    expect(Number(w.economy.balance)).toBeCloseTo(10 * (1 - DANGER.forfeit), 10);
  });

  it('the shop is closed during a round', () => {
    const w = readyWorld();
    w.economy.balance = 1e9;
    w.startRound();
    expect(w.buy('single')).toBe(false);
    w.economy.stats.manualLines = 1000;
    expect(w.buyUpgrade('manual_100')).toBe(false);
    w.tapSettle(); w.tapSettle();
    run(w, DANGER.settleCountdownMs + 50, 1);
    expect(w.buy('single')).toBe(true);
    expect(w.buyUpgrade('manual_100')).toBe(true);
  });
});

describe('danger', () => {
  it('starts at the wrath floor and climbs one point per five minutes', () => {
    for (const [stage, floor] of [[0, 0], [1, 0.25], [2, 0.5], [3, 1.0]] as const) {
      const w = readyWorld();
      for (let i = 1; i <= stage; i++) w.economy.upgrades.add(`wrath_${i}`);
      w.startRound();
      expect(w.round.danger).toBeCloseTo(floor, 10);
      if (stage === 3) {
        // Short enough that garbage and gravity cannot end the round.
        run(w, 6_000, 1);
        expect(w.round.active).toBe(true);
        expect(w.round.danger - floor).toBeCloseTo((6 / 300) * 2, 3);
      }
    }
    const w = readyWorld();
    w.startRound();
    run(w, 60_000, 1);
    expect(w.round.danger).toBeCloseTo(60 / 300, 2);
  });

  it('manual income is multiplied by 1 + danger and recorded as risk-weighted Lines', () => {
    const w = readyWorld();
    w.economy.upgrades.add('wrath_1');
    w.economy.upgrades.add('wrath_2');
    w.economy.upgrades.add('wrath_3');
    w.startRound(); // danger 1.0
    tetris(w);
    expect(w.round.vault).toBeCloseTo(10 * 2, 10);
    expect(w.economy.stats.riskLines).toBeCloseTo(20 * 1, 10);
  });

  it('stops while paused', () => {
    const w = readyWorld();
    w.startRound();
    let t = run(w, 30_000, 1);
    const d = w.round.danger;
    w.pauseRound();
    t = run(w, 30_000, t);
    expect(w.round.danger).toBe(d);
    w.resumeRound();
    run(w, 30_000, t);
    expect(w.round.danger).toBeGreaterThan(d);
  });

  it('a long gap pauses the round while bots keep earning', () => {
    const w = readyWorld();
    w.economy.balance = 1000;
    w.buy('single');
    w.startRound();
    run(w, 1000, 1);
    const balance = Number(w.economy.balance);
    w.advance(1000 + 60_000);
    expect(w.round.paused).toBe(true);
    expect(Number(w.economy.balance)).toBeGreaterThan(balance);
  });
});

describe('garbage and gravity in a round', () => {
  it('no garbage at wrath 0', () => {
    const w = readyWorld();
    w.startRound();
    run(w, 120_000, 1);
    const bottom = Array.from(w.manual.grid.subarray((HEIGHT - 1) * WIDTH));
    expect(bottom.filter((c) => c === 8)).toHaveLength(0);
  });

  it('wrath I sends cheese garbage on schedule, same holes for the same seed', () => {
    const holes = (seed: number) => {
      const w = readyWorld(seed);
      w.economy.upgrades.add('wrath_1');
      w.startRound(); // danger 0.25 → one row every 32 s at first
      let rows = 0;
      let t = 1;
      for (; t < 70_000; t += STEP) {
        w.advance(t);
        rows += w.drainEvents().filter((e) => e.type === 'garbage').length;
      }
      const grid = Array.from(w.manual.grid);
      return { rows, grid };
    };
    const a = holes(5);
    const b = holes(5);
    // Danger climbs from 0.25, so the gaps shrink: rows land near 25 s, 45 s, 62 s.
    expect(a.rows).toBe(3);
    expect(a.grid).toEqual(b.grid);
    // Every garbage row has exactly one hole.
    for (let y = HEIGHT - a.rows; y < HEIGHT; y++) {
      const row = a.grid.slice(y * WIDTH, (y + 1) * WIDTH);
      expect(row.filter((c) => c === 0)).toHaveLength(1);
    }
  });

  it('gravity only from wrath II', () => {
    const w1 = readyWorld();
    w1.economy.upgrades.add('wrath_1');
    w1.startRound();
    const y1 = w1.manual.active!.y;
    run(w1, 3000, 1);
    expect(w1.manual.active!.y).toBe(y1);
    const w2 = readyWorld();
    w2.economy.upgrades.add('wrath_1');
    w2.economy.upgrades.add('wrath_2');
    w2.startRound(); // danger 0.5 → a cell every 2 s
    const y2 = w2.manual.active!.y;
    run(w2, 4100, 1);
    expect(w2.manual.active!.y).toBe(y2 + 2);
  });
});

describe('round saves', () => {
  it('a round in progress comes back paused', () => {
    const w = readyWorld();
    w.startRound();
    tetris(w);
    const w2 = new World(1, JSON.parse(JSON.stringify(w.snapshot())));
    expect(w2.round.phase).toBe('running');
    expect(w2.round.paused).toBe(true);
    expect(w2.round.vault).toBeCloseTo(10, 10);
  });

  it('a version 2 save migrates to 3 with no round', () => {
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
    expect(w.economy.stats.rounds).toBe(0);
    expect(Number(w.economy.balance)).toBe(7);
  });
});
