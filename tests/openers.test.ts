import { describe, expect, it } from 'vitest';
import { OPENERS } from '../src/data/openers';
import { pictureStages } from '../src/sim/fumen';
import { planBuild } from '../src/sim/bot/buildFollower';
import { Game } from '../src/sim/game';
import { HEIGHT, WIDTH } from '../src/sim/board';
import { PRESTIGE_UPGRADES } from '../src/data/prestige';
import { PC_SETUPS } from '../src/data/pcSetups';

describe('opener builds', () => {
  it('eleven builds, every stage ten wide with piece cells to lay', () => {
    expect(OPENERS).toHaveLength(11);
    expect(new Set(OPENERS.map((o) => o.id)).size).toBe(11);
    for (const o of OPENERS) {
      expect(o.stages.length, o.id).toBeGreaterThan(0);
      for (const s of o.stages) {
        const rows = s.split('/');
        expect(rows.every((r) => /^[_XIOTSZJL]{10}$/.test(r)), `${o.id} ${s}`).toBe(true);
        expect(rows.length).toBeLessThanOrEqual(HEIGHT);
      }
    }
  });

  it('a picture lands on the floor, its letters as pieces and X as leftovers', () => {
    const [stage] = pictureStages(['T_________/XX________']);
    expect(stage![(HEIGHT - 2) * WIDTH]).toBe('T');
    expect(stage![(HEIGHT - 1) * WIDTH + 1]).toBe('X');
    expect(stage![(HEIGHT - 1) * WIDTH + 2]).toBeNull();
  });

  it("plans TEAL's first bag whole and lays it exactly, from a queue that allows it", () => {
    const teal = pictureStages(OPENERS.find((o) => o.id === 'teal')!.stages);
    const first = teal.find((s) => !s.includes('X'))!;
    let laid = false;
    for (let seed = 1; seed < 400 && !laid; seed++) {
      const g = new Game(seed);
      const plan = planBuild(g, teal);
      if (!plan) continue;
      for (const step of plan) {
        if (step.useHold) expect(g.swapHold()).toBe(true);
        // Replay the planned inputs as the bot does.
        const ok = step.inputs!.every((i) => ({ L: () => g.moveLeft(), R: () => g.moveRight(), CW: () => g.rotateCW(), CCW: () => g.rotateCCW(), R180: () => g.rotate180(), DROP: () => { g.softDrop(); while (g.softDrop()) { /* floor */ } return true; } })[i]());
        expect(ok).toBe(true);
        g.hardDrop();
      }
      first.forEach((c, i) => expect(g.grid[i] !== 0, `cell ${i}`).toBe(c !== null));
      laid = true;
    }
    expect(laid).toBe(true);
  });

  it('the OPENER chain sells them in order, two crowns dearer a step, OPENER +25% each', () => {
    const chain = PRESTIGE_UPGRADES.filter((u) => u.branch === 'opener');
    expect(chain.map((u) => u.price)).toEqual(OPENERS.map((_, i) => 2 * (i + 1)));
    for (const u of chain) expect(u.effects).toEqual([{ target: 'income', filter: ['building:opener'], op: 'add_pct', value: 25 }]);
  });
});

describe('PC setups', () => {
  it('79 from round 1, four rows at most, every piece whole', () => {
    expect(PC_SETUPS).toHaveLength(79);
    expect(new Set(PC_SETUPS.map((s) => s.stage)).size).toBe(79);
    for (const s of PC_SETUPS) {
      const rows = s.stage.split('/');
      expect(rows.length).toBeLessThanOrEqual(4);
      expect(rows.every((r) => /^[_IOTSZJL]{10}$/.test(r)), s.stage).toBe(true);
      const counts = new Map<string, number>();
      for (const ch of s.stage.replace(/[_/]/g, '')) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      for (const [p, n] of counts) expect(n % 4, `${p} in ${s.stage}`).toBe(0);
    }
  });
});
