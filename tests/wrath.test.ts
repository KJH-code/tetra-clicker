import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { WRATH, GOLDEN } from '../src/data/golden';
import { simulate, DEFAULT_PLAYER, DEFAULT_TARGET, DEFAULT_HORIZON_SECONDS } from '../src/sim/simulate';
import { LADDER } from '../src/data/ladder';
import { averageVault, goldenValue, wrathValue } from '../src/sim/luck';
import type { GameSnapshot } from '../src/sim/game';

const STEP = 1000 / 60;

// A round going with bots, wrath stage `stages`, wrath pieces researched
// (or not), the manual board one I away from a tetris.
function world(stages: number, research: string[] = ['elder_1'], seed = 1): World {
  const w = new World(seed);
  for (const id of research) w.economy.meta.prestige.add(id);
  for (let i = 1; i <= stages; i++) w.economy.upgrades.add(`wrath_${i}`);
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

// Make the piece in play a wrath piece.
function wrathActive(w: World): void {
  w.manual.golden.active = true;
  w.manual.golden.wrath = true;
}

// Share of due golden pieces that came as wrath, over many draws.
function wrathShare(stages: number, research?: string[]): number {
  const w = world(stages, research);
  let wrath = 0;
  let n = 0;
  for (let i = 0; i < 1000; i++) {
    // Garbage at the higher stages tops the life out now and then.
    if (!w.round.active) w.startRound();
    w.manual.clearGolden();
    w.round.goldenMs = 0;
    w.step(STEP);
    if (!w.manual.hasGolden) continue;
    n++;
    if (w.manual.golden.wrath) wrath++;
  }
  return wrath / n;
}

describe('wrath pieces', () => {
  it('replace golden ones by wrath stage: 0 / 33 / 66 / 100%', () => {
    expect(wrathShare(0)).toBe(0);
    expect(wrathShare(1)).toBeCloseTo(0.33, 1);
    expect(Math.abs(wrathShare(2) - 0.66)).toBeLessThan(0.05);
    expect(wrathShare(3)).toBe(1);
  });

  it('never appear without the WRATH research', () => {
    expect(wrathShare(3, [])).toBe(0);
  });

  it('the spawn event says which kind it is', () => {
    const w = world(3);
    w.round.goldenMs = 0;
    w.step(STEP);
    expect(w.drainEvents().find((e) => e.type === 'goldenSpawn')).toEqual({ type: 'goldenSpawn', wrath: true });
  });

  it('clearing a line draws ELDER FRENZY, CLOT or RUIN; placed flat it is lost', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = world(3, ['elder_1'], seed);
      wrathActive(w);
      tetris(w);
      const e = w.drainEvents().find((x) => x.type === 'golden');
      expect(e && e.type === 'golden' && e.wrath).toBe(true);
      if (e?.type === 'golden') seen.add(e.outcome.id);
      expect(w.economy.stats.wraths).toBe(1);
      expect(w.economy.stats.goldens).toBe(0);
    }
    expect([...seen].sort()).toEqual(['clot', 'elder_frenzy', 'ruin']);
    const flat = world(3);
    wrathActive(flat);
    flat.manualHardDrop();
    expect(flat.drainEvents().some((e) => e.type === 'goldenLost' && e.wrath)).toBe(true);
    expect(flat.economy.stats.goldensLost).toBe(1);
  });

  it('ELDER FRENZY: bots ×666 for 6 s, 12 s with the second step', () => {
    const w = world(3);
    w.grantBuff('elder_frenzy');
    expect(w.buffs.active).toEqual([{ id: 'elder_frenzy', msLeft: 6_000 }]);
    expect(w.buffs.multiplier(['board:auto', 'building:single'], w.economy)).toBe(666);
    expect(w.buffs.multiplier(['board:manual'], w.economy)).toBe(1);
    const long = world(3, ['elder_1', 'elder_2']);
    long.grantBuff('elder_frenzy');
    expect(long.buffs.active[0]!.msLeft).toBe(12_000);
    // The step lengthens ELDER FRENZY only.
    long.grantBuff('frenzy');
    expect(long.buffs.active[1]!.msLeft).toBe(77_000);
  });

  it('CLOT halves all income for 66 s, and comes half as often with the fourth step', () => {
    const w = world(3);
    w.grantBuff('clot');
    expect(w.buffs.active).toEqual([{ id: 'clot', msLeft: 66_000 }]);
    expect(w.buffs.multiplier(['board:manual'], w.economy)).toBe(0.5);
    expect(w.buffs.multiplier(['board:auto'], w.economy)).toBe(0.5);
    const count = (research: string[]) => {
      let clots = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const x = world(3, research, seed);
        x.round.drawWrath(1);
        const o = x.round.drawOutcome(WRATH.outcomes, (o) => o.weight * (research.includes('elder_4') && o.id === 'clot' ? 0.5 : 1));
        if (o.id === 'clot') clots++;
      }
      return clots / 400;
    };
    expect(count(['elder_1'])).toBeCloseTo(0.4, 1);
    expect(count(['elder_1', 'elder_4'])).toBeCloseTo(0.25, 1);
  });

  it('the fourth step reweighs the world\'s own draw', () => {
    let plain = 0, softened = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const [research, inc] of [[['elder_1'], () => plain++], [['elder_1', 'elder_2', 'elder_3', 'elder_4'], () => softened++]] as const) {
        const w = world(3, [...research], seed);
        wrathActive(w);
        tetris(w);
        if (w.buffs.active.some((b) => b.id === 'clot')) inc();
      }
    }
    expect(softened).toBeLessThan(plain * 0.75);
  });

  it('RUIN takes 20% of the vault (10% with the third step), never the bank', () => {
    for (const [research, share] of [[['elder_1'], 0.2], [['elder_1', 'elder_3'], 0.1]] as const) {
      const w = world(3, [...research]);
      w.round.vault = 1000;
      w.round.vaultRisk = 4000;
      w.economy.balance = num(5000);
      // Force the ruin row.
      const ruin = WRATH.outcomes.find((o) => o.id === 'ruin')!;
      w.round.drawOutcome = () => ruin;
      wrathActive(w);
      tetris(w);
      // The tetris itself paid into the vault first; ruin took its share of the total.
      const e = w.drainEvents().find((x) => x.type === 'golden')!;
      expect(e.type === 'golden' && e.outcome.id).toBe('ruin');
      const lost = e.type === 'golden' ? Number(e.amount) : 0;
      const total = w.round.vault + lost;
      expect(lost).toBe(Math.floor(total * share));
      expect(Number(w.economy.balance)).toBe(5000);
      expect(w.round.vaultRisk / w.round.vault).toBeCloseTo((4000 + (total - 1000) * w.round.level) / total, 6);
      expect(w.economy.stats.ruins).toBe(1);
    }
  });

  it('a tetris under CLOT is counted', () => {
    const w = world(0);
    w.grantBuff('clot');
    tetris(w);
    expect(w.economy.stats.clotTetrises).toBe(1);
  });

  it('a seed without wrath plays exactly as before wrath existed', () => {
    const a = world(3, []);
    const b = world(0, []);
    for (let i = 0; i < 3; i++) {
      a.round.goldenMs = 0; b.round.goldenMs = 0;
      a.manual.clearGolden(); b.manual.clearGolden();
      a.step(STEP); b.step(STEP);
    }
    expect(a.round.snapshot().goldenRng).toBe(b.round.snapshot().goldenRng);
  });
});

describe('wrath value', () => {
  // The state of the simulator's default player at `hours` (one run, shared).
  let run: ReturnType<typeof simulate> | null = null;
  function at(hours: number) {
    const r = (run ??= simulate({ buildings: LADDER, player: DEFAULT_PLAYER, horizonSeconds: DEFAULT_HORIZON_SECONDS, target: DEFAULT_TARGET }));
    const s = r.series.find((x) => x.t >= hours * 3600)!;
    const rowsPerSecond = (DEFAULT_PLAYER.pps * DEFAULT_PLAYER.linesPerPiece) / 2;
    return { bots: s.bots, manual: s.manualActive, vault: averageVault(s.manualActive, rowsPerSecond) };
  }

  it('averages about 1.2× a golden piece from the first ascension on', () => {
    // Wrath pieces open with prestige, so the first crown (~2.5 h) is where it starts to matter.
    for (const h of [2.5, 5, 24, 168]) {
      const s = at(h);
      const ratio = wrathValue(s) / goldenValue(s);
      expect(ratio).toBeGreaterThan(1.1);
      expect(ratio).toBeLessThan(1.3);
    }
  });

  it('swings wider than a golden piece', () => {
    const s = at(24);
    // One outcome's value: weigh it alone.
    const only = (id: string) => ({ weight: (x: string) => (x === id ? 1 : 0) });
    const g = GOLDEN.outcomes.map((o) => goldenValue(s, only(o.id)));
    const w = WRATH.outcomes.map((o) => wrathValue(s, only(o.id)));
    expect(Math.max(...w) - Math.min(...w)).toBeGreaterThan(Math.max(...g) - Math.min(...g));
    expect(Math.min(...w)).toBeLessThan(0);
  });
});
