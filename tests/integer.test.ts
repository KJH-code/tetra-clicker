import { describe, it, expect } from 'vitest';
import { Payout } from '../src/sim/payout';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { migrate } from '../src/save/schema';

const STEP = 1000 / 60;
const whole = (n: number) => Number.isInteger(n);

describe('whole Lines', () => {
  it('pays whole Lines and carries the fraction', () => {
    const p = new Payout();
    expect(p.take(1.7)).toBe(1);
    expect(p.take(1.7)).toBe(2);
    expect(p.carry).toBeCloseTo(0.4, 10);
    expect(new Payout().take(0.7 + 0.3)).toBe(1);
  });

  it('bots, the formula and prices stay whole; long-run income matches the exact sum', () => {
    const w = new World(1);
    w.economy.balance = num(1e6);
    for (let i = 0; i < 7; i++) w.buy('single'); // +60%: fractional per clear
    w.economy.balance = num(0);
    w.advance(0);
    let exact = 0;
    let t = 0;
    for (; t <= 120_000; t += STEP) {
      w.advance(t);
      for (const e of w.drainEvents()) {
        if (e.type === 'botMove') {
          expect(whole(Number(e.earned))).toBe(true);
          exact += e.move.result.lines * 2 * w.economy.incomeMultiplier(['board:auto', 'building:single', 'clear:single']);
        }
      }
      expect(whole(Number(w.economy.balance))).toBe(true);
    }
    expect(Number(w.economy.balance)).toBeGreaterThanOrEqual(Math.floor(exact) - 1);
    expect(Number(w.economy.balance)).toBeLessThanOrEqual(Math.ceil(exact));
    w.advance(t + 30_000); // formula gap
    expect(whole(Number(w.economy.balance))).toBe(true);
    for (let i = 0; i < 20; i++) {
      expect(whole(Number(w.economy.price('single')))).toBe(true);
      w.economy.setOwned('single', w.economy.owned('single') + 1);
    }
  });

  it('a top-out keeps the retained share rounded down', () => {
    const w = new World(1);
    w.advance(0);
    w.economy.meta.prestige.add('survival_1');
    w.economy.meta.prestige.add('survival_2'); // keep 25%
    w.startRound();
    w.round.vault = 1001;
    w['endRound']();
    expect(Number(w.economy.balance)).toBe(250);
  });

  it('manual payouts at a level are whole', () => {
    const w = new World(1);
    w.advance(0);
    w.economy.upgrades.add('wrath_1');
    w.economy.upgrades.add('combo_1'); // combo step 0.15: fractional clears
    w.startRound();
    for (let i = 0; i < 200; i++) {
      w.manualHardDrop();
      if (!w.round.active) w.startRound();
      expect(whole(w.round.vault)).toBe(true);
    }
  });

  it('a v4 save moves to the new unit', () => {
    const w = new World(1).snapshot() as unknown as Record<string, unknown>;
    const eco = w['economy'] as Record<string, unknown>;
    eco['balance'] = '123.7';
    eco['upgrades'] = ['manual_100', 'share_1000', 'wrath_1'];
    (eco['stats'] as Record<string, number>)['manualLines'] = 150;
    w['round'] = { phase: 'running', paused: false, vault: 10.4, danger: 0.3, elapsedMs: 0, garbageMs: 0, settleMs: 0, rng: 1 };
    delete w['meta'];
    const m = migrate({ version: 4, savedAt: 0, settings: {}, world: w })!;
    // 123.7 doubles to 247; the round's vault (10.4 → 20) is then banked when
    // version 6 ends rounds in progress.
    expect(m.world.economy.balance).toBe('267');
    expect(m.world.economy.upgrades).toEqual(['manual_200', 'share_2000', 'wrath_1']);
    expect(m.world.economy.stats.manualLines).toBe(300);
    expect(m.world.round).toBeNull();
  });
});
