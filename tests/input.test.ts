import { describe, it, expect } from 'vitest';
import { InputHandler } from '../src/ui/input';
import { Game } from '../src/sim/game';
import { DEFAULT_HANDLING } from '../src/data/handling';

// A minimal EventTarget stand-in so the handler can be driven without a DOM.
class FakeWindow {
  listeners = new Map<string, ((e: KeyboardEvent) => void)[]>();
  addEventListener(type: string, fn: (e: KeyboardEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  fire(type: string, code: string): void {
    const e = { code, preventDefault() {} } as unknown as KeyboardEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}

function setup(das: number, arr: number) {
  const game = new Game(5);
  let drops = 0;
  const win = new FakeWindow();
  const input = new InputHandler({ game, onHardDrop: () => { drops++; game.hardDrop(); } }, { ...structuredClone(DEFAULT_HANDLING), das, arr });
  input.attach(win as unknown as Window);
  input.setActive(true);
  return { game, win, input, drops: () => drops };
}

describe('DAS / ARR', () => {
  it('a tap moves one cell; holding past DAS repeats at ARR', () => {
    const { game, win, input } = setup(100, 20);
    const x0 = game.active!.x;
    win.fire('keydown', 'ArrowLeft');
    expect(game.active!.x).toBe(x0 - 1);
    input.update(99);
    expect(game.active!.x).toBe(x0 - 1);
    input.update(1); // DAS reached, no ARR interval yet
    expect(game.active!.x).toBe(x0 - 1);
    input.update(20);
    expect(game.active!.x).toBe(x0 - 2);
    input.update(40);
    expect(game.active!.x).toBe(Math.max(0, x0 - 4)); // two more repeats, stopped by the wall
  });
  it('ARR 0 goes to the wall after DAS', () => {
    const { game, win, input } = setup(100, 0);
    win.fire('keydown', 'ArrowRight');
    input.update(100);
    expect(game.active!.x).toBe(10 - 3); // T box at the right wall
  });
  it('releasing stops the repeat', () => {
    const { game, win, input } = setup(50, 10);
    win.fire('keydown', 'ArrowLeft');
    input.update(60);
    const x = game.active!.x;
    win.fire('keyup', 'ArrowLeft');
    input.update(100);
    expect(game.active!.x).toBe(x);
  });
  it('hard drop fires once per press', () => {
    const { win, drops } = setup(100, 20);
    win.fire('keydown', 'Space');
    win.fire('keydown', 'Space'); // OS auto-repeat is ignored
    expect(drops()).toBe(1);
    win.fire('keyup', 'Space');
    win.fire('keydown', 'Space');
    expect(drops()).toBe(2);
  });
});

describe('round gating', () => {
  function gated(gate: 'play' | 'start' | 'resume') {
    const game = new Game(5);
    const calls: string[] = [];
    const win = new FakeWindow();
    const input = new InputHandler({
      game,
      onHardDrop: () => calls.push('drop'),
      gate: () => gate,
      start: () => calls.push('start'),
      resume: () => calls.push('resume'),
    }, structuredClone(DEFAULT_HANDLING));
    input.attach(win as unknown as Window);
    input.setActive(true);
    return { game, win, input, calls };
  }

  it('between rounds the first key starts the round and does nothing else', () => {
    const { game, win, calls } = gated('start');
    const x = game.active!.x;
    win.fire('keydown', 'ArrowLeft');
    expect(calls).toEqual(['start']);
    expect(game.active!.x).toBe(x);
  });

  it('while paused any key resumes', () => {
    const { win, calls } = gated('resume');
    win.fire('keydown', 'Space');
    expect(calls).toEqual(['resume']);
  });

});

describe('touch buttons', () => {
  it('press and release drive the same DAS / ARR as keys', () => {
    const { game, input } = setup(100, 20);
    const x0 = game.active!.x;
    input.press('left');
    expect(game.active!.x).toBe(x0 - 1);
    input.update(99);
    input.update(1);
    input.update(20);
    expect(game.active!.x).toBe(x0 - 2);
    input.release('left');
    input.update(200);
    expect(game.active!.x).toBe(x0 - 2);
  });

  it('hard drop and hold work from buttons; a held button does not repeat', () => {
    const { game, input, drops } = setup(100, 20);
    input.press('hold');
    expect(game.holds).toHaveLength(1);
    input.press('hardDrop');
    input.press('hardDrop');
    expect(drops()).toBe(1);
    input.release('hardDrop');
    input.press('hardDrop');
    expect(drops()).toBe(2);
  });
});
