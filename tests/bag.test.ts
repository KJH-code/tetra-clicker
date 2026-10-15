import { describe, it, expect } from 'vitest';
import { createBag } from '../src/sim/bag';
import { createRng } from '../src/sim/rng';
import { PIECES } from '../src/sim/pieces';

describe('7-bag', () => {
  it('each run of seven contains every piece exactly once', () => {
    const bag = createBag(createRng(42));
    for (let round = 0; round < 200; round++) {
      const seven = Array.from({ length: 7 }, () => bag.take());
      expect([...seven].sort()).toEqual([...PIECES].sort());
    }
  });
  it('same seed gives the same sequence', () => {
    const a = createBag(createRng(7));
    const b = createBag(createRng(7));
    const sa = Array.from({ length: 100 }, () => a.take());
    const sb = Array.from({ length: 100 }, () => b.take());
    expect(sa).toEqual(sb);
  });
  it('different seeds differ', () => {
    const a = createBag(createRng(1));
    const b = createBag(createRng(2));
    const sa = Array.from({ length: 50 }, () => a.take());
    const sb = Array.from({ length: 50 }, () => b.take());
    expect(sa).not.toEqual(sb);
  });
  it('snapshot restores the exact continuation', () => {
    const a = createBag(createRng(99));
    for (let i = 0; i < 10; i++) a.take();
    const snap = a.snapshot();
    const b = createBag(createRng(snap.rng), 5, snap.queue);
    const sa = Array.from({ length: 30 }, () => a.take());
    const sb = Array.from({ length: 30 }, () => b.take());
    expect(sa).toEqual(sb);
  });
  it('always shows five previews', () => {
    const bag = createBag(createRng(3));
    for (let i = 0; i < 50; i++) {
      expect(bag.peek(5)).toHaveLength(5);
      bag.take();
    }
  });
});
