import { describe, it, expect } from 'vitest';
import { World, type WorldEvent } from '../src/sim/world';
import { num } from '../src/sim/num';
import { TUTORIAL, advance, currentStep } from '../src/ui/tutorial';
import { TUTORIAL_OFF } from '../src/data/handling';

const ids = (step: number) => (step === TUTORIAL_OFF ? 'off' : TUTORIAL[step]!.id);

describe('tutorial', () => {
  it('walks start → clear → building → checkpoint → ascend on the game\'s own events', () => {
    const w = new World(1);
    w.economy.balance = num(1e6);
    let step = currentStep(0, w);
    expect(ids(step)).toBe('start');
    const feed = (): void => { for (const e of w.drainEvents()) step = advance(step, e, w); };
    w.startRound(); feed();
    expect(ids(step)).toBe('clear');
    // Not the right event: stays.
    step = advance(step, { type: 'paused' } as WorldEvent, w);
    expect(ids(step)).toBe('clear');
    w.manualLock({ piece: 'I', lines: 1, spin: 'none', perfectClear: false, comboIndex: 0, b2bExtended: false, topped: false, clearedRows: [39] });
    feed();
    expect(ids(step)).toBe('building');
    w.buy('single'); feed();
    expect(ids(step)).toBe('checkpoint');
    w.manualLock({ piece: 'I', lines: 40, spin: 'none', perfectClear: false, comboIndex: 0, b2bExtended: false, topped: false, clearedRows: [] });
    feed();
    expect(ids(step)).toBe('ascend');
    w.economy.stats.riskLines = 1e9;
    w.round.end();
    w.ascend(); feed();
    expect(step).toBe(TUTORIAL_OFF);
  });

  it('a save that already did the early steps starts later', () => {
    const w = new World(1);
    w.economy.stats.rounds = 3;
    w.economy.stats.manualLines = 50;
    expect(ids(currentStep(0, w))).toBe('building');
  });

  it('off stays off', () => {
    const w = new World(1);
    expect(currentStep(TUTORIAL_OFF, w)).toBe(TUTORIAL_OFF);
    expect(advance(TUTORIAL_OFF, { type: 'roundStart', level: 1 }, w)).toBe(TUTORIAL_OFF);
  });
});
