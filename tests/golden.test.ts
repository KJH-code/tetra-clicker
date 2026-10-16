import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { Game } from '../src/sim/game';
import { num, toNumber } from '../src/sim/num';
import { GOLDEN, BUFFS } from '../src/data/golden';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import { DANGER } from '../src/data/danger';
import type { GameSnapshot } from '../src/sim/game';

const STEP = 1000 / 60;

function run(w: World, ms: number, from = 0): number {
  let t = from;
  for (; t <= from + ms; t += STEP) w.advance(t);
  return t;
}

// Bots running, a round going, the manual board one I away from a tetris.
function world(seed = 1): World {
  const w = new World(seed);
  w.economy.balance = num(1e6);
  w.buy('single');
  w.economy.balance = num(0);
  const snap = w.snapshot();
  snap.manual = {
    grid: '1111111110/1111111110/1111111110/1111111110', holds: [], holdUsed: false,
    queue: ['I', 'O', 'S', 'Z', 'J', 'L', 'T'], rng: 3, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false,
  } as GameSnapshot;
  const out = new World(seed, snap);
  out.advance(0);
  out.startRound();
  return out;
}

function tetris(w: World) {
  w.manual.rotateCW();
  while (w.manual.moveRight()) { /* wall */ }
  return w.manualHardDrop();
}

// Make the piece in play golden, as if it had scrolled out of the queue.
function gildActive(w: World): void {
  w.manual.golden.active = true;
}

describe('golden piece timing', () => {
  it('appears within 1–5 minutes of round time, on the last NEXT slot', () => {
    const w = world();
    const due = w.round.goldenMs;
    expect(due).toBeGreaterThanOrEqual(GOLDEN.minSeconds * 1000);
    expect(due).toBeLessThanOrEqual(GOLDEN.maxSeconds * 1000);
    run(w, due - 1000, 1);
    expect(w.manual.hasGolden).toBe(false);
    run(w, 2000, due);
    expect(w.manual.golden.queue).toBe(w.manual.rules.nextCount - 1);
    expect(w.drainEvents().some((e) => e.type === 'goldenSpawn')).toBe(true);
  });

  it('the timer stops while paused and between rounds', () => {
    const w = world();
    const due = w.round.goldenMs;
    w.pauseRound();
    run(w, 10_000, 1);
    expect(w.round.goldenMs).toBe(due);
    const idle = new World(1);
    idle.advance(0);
    run(idle, GOLDEN.maxSeconds * 1000 + 1000, 1);
    expect(idle.manual.hasGolden).toBe(false);
  });

  it('only one golden piece at a time', () => {
    const w = world();
    expect(w.manual.markGolden(2)).toBe(true);
    const due = w.round.goldenMs;
    run(w, 5_000, 1);
    expect(w.round.goldenMs).toBe(due); // waits while one is out
    expect(w.manual.markGolden(4)).toBe(false);
  });

  it('same seed gives the same timing and the same outcomes', () => {
    const a = world(7);
    const b = world(7);
    expect(a.round.goldenMs).toBe(b.round.goldenMs);
    const oa = [0, 1, 2, 3, 4].map(() => a.round.drawOutcome().id);
    const ob = [0, 1, 2, 3, 4].map(() => b.round.drawOutcome().id);
    expect(oa).toEqual(ob);
  });

  it('outcome weights are 45 / 45 / 10', () => {
    const w = world(3);
    const n: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) { const id = w.round.drawOutcome().id; n[id] = (n[id] ?? 0) + 1; }
    expect(n['frenzy']! / 20_000).toBeCloseTo(0.45, 1);
    expect(n['lucky']! / 20_000).toBeCloseTo(0.45, 1);
    expect(n['clear_frenzy']! / 20_000).toBeCloseTo(0.10, 1);
  });

  it('LUCKY DAY halves the wait', () => {
    const a = world(5);
    const b = world(5);
    b.round.end();
    b.economy.upgrades.add('lucky_day');
    b.manual.clearGolden();
    a.round.end();
    a.startRound();
    b.startRound();
    expect(b.round.goldenMs).toBeCloseTo(a.round.goldenMs / 2, 6);
  });
});

describe('golden piece in play', () => {
  it('follows the queue into play', () => {
    const g = new Game(1);
    g.markGolden(1);
    g.hardDrop();
    expect(g.golden).toMatchObject({ queue: 0, active: false });
    g.hardDrop();
    expect(g.golden).toMatchObject({ queue: -1, active: true });
    expect(g.hardDrop().golden).toBe(true);
    expect(g.hasGolden).toBe(false);
  });

  it('stays golden in hold and comes back golden', () => {
    const g = new Game(1);
    g.golden.active = true;
    g.swapHold();
    expect(g.golden.active).toBe(false);
    expect(g.golden.holds).toEqual([true]);
    g.hardDrop();
    g.swapHold();
    expect(g.golden.active).toBe(true);
    expect(g.golden.holds).toEqual([false]);
  });

  it('clearing a line triggers it and counts it', () => {
    const w = world();
    gildActive(w);
    w.drainEvents();
    tetris(w);
    const ev = w.drainEvents().find((e) => e.type === 'golden');
    expect(ev).toBeDefined();
    expect(w.economy.stats.goldens).toBe(1);
    expect(w.manual.hasGolden).toBe(false);
  });

  it('placing it without a clear loses it', () => {
    const w = world();
    gildActive(w);
    w.drainEvents();
    const r = w.manualHardDrop();
    expect(r.lines).toBe(0);
    expect(w.drainEvents().some((e) => e.type === 'goldenLost')).toBe(true);
    expect(w.economy.stats.goldens).toBe(0);
    expect(w.manual.hasGolden).toBe(false);
  });

  it('a round end takes it away', () => {
    const w = world();
    w.manual.markGolden(3);
    w.tapSettle(); w.tapSettle();
    run(w, DANGER.settleCountdownMs + 100, 1);
    expect(w.round.active).toBe(false);
    expect(w.manual.hasGolden).toBe(false);
  });

  it('lucky pays 15 minutes of PER SECOND (no buffs) into the vault', () => {
    const w = world();
    // Draw until the next outcome is lucky, using a twin with the same stream.
    const twin = world();
    let skips = 0;
    while (twin.round.drawOutcome().id !== 'lucky') skips++;
    for (let i = 0; i < skips; i++) w.round.drawOutcome();
    w.grantBuff('frenzy');
    const pps = toNumber(w.incomePerSecond());
    gildActive(w);
    tetris(w);
    // Each payout is whole; the fractions carry from one to the next.
    expect(w.round.vault).toBe(Math.floor(20 * 7 + pps * 900));
  });

  it('GET LUCKY doubles buff duration', () => {
    const w = world();
    w.economy.upgrades.add('get_lucky');
    w.grantBuff('frenzy');
    w.grantBuff('clear_frenzy');
    expect(w.buffs.active.map((b) => b.msLeft)).toEqual([BUFFS.frenzy!.durationMs * 2, BUFFS.clear_frenzy!.durationMs * 2]);
  });
});

describe('save v4', () => {
  it('golden marks and the golden timer survive a save', () => {
    const w = world();
    w.manual.markGolden(4);
    run(w, 3_000, 1);
    const back = new World(1, JSON.parse(JSON.stringify(w.snapshot())));
    expect(back.manual.golden).toEqual(w.manual.golden);
    expect(back.round.goldenMs).toBe(w.round.goldenMs);
  });

  it('migrates a v3 save', () => {
    const v3 = { version: 3, savedAt: 0, settings: {}, world: { seed: 1, accumulatorMs: 0, round: null, autoBoards: [],
      manual: new Game(1).snapshot(), economy: { balance: '0', owned: {}, upgrades: [], stats: {} } } };
    delete (v3.world.manual as Partial<GameSnapshot>).golden;
    const m = migrate(v3)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.world.buffs).toEqual([]);
    const w = new World(1, m.world);
    expect(w.manual.hasGolden).toBe(false);
    expect(w.economy.stats.goldens).toBe(0);
  });
});
