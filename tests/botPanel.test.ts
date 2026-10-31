import { describe, expect, it } from 'vitest';
import { chooseShown } from '../src/ui/botPanel';

describe('bot panel', () => {
  it('shows every board while they fit', () => {
    expect(chooseShown([], [1, 5, 3], 8)).toEqual([0, 1, 2]);
  });

  it('shows the top earners once there are too many, best first', () => {
    expect(chooseShown([], [1, 9, 3, 7, 5], 3)).toEqual([1, 3, 4]);
  });

  it('keeps its places until an outsider clearly earns more', () => {
    const shown = [1, 3, 4];
    // Board 2 now edges past board 4 (5 → 5.5): not enough to swap.
    expect(chooseShown(shown, [1, 9, 5.5, 7, 5], 3)).toEqual([1, 3, 4]);
    // At 7 it is 40% ahead: it takes board 4's place, the others stay put.
    expect(chooseShown(shown, [1, 9, 7, 7, 5], 3)).toEqual([1, 3, 2]);
  });
});
