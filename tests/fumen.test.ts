import { describe, it, expect } from 'vitest';
import { encoder, Field } from 'tetris-fumen';
import { decodeBuild } from '../src/sim/fumen';
import { followBuild, stageFor } from '../src/sim/bot/buildFollower';
import { Game } from '../src/sim/game';
import { HEIGHT, WIDTH, occupiedCells } from '../src/sim/board';

// Two stages made with the fumen encoder: first an I flat on the left of
// the floor, then an O beside it.
const fumen = encoder.encode([
  { field: Field.create('', 'XXXXXXXXXX'.replace(/X/g, '_')), operation: { type: 'I', rotation: 'spawn', x: 1, y: 0 } },
  { operation: { type: 'O', rotation: 'spawn', x: 4, y: 0 } },
]);

describe('fumen builds', () => {
  it('decodes stages into this grid, floor at the bottom row', () => {
    const stages = decodeBuild(fumen);
    expect(stages).toHaveLength(2);
    const floor = (s: (string | null)[]) => s.slice((HEIGHT - 1) * WIDTH, HEIGHT * WIDTH);
    expect(floor(stages[0]!)).toEqual(['I', 'I', 'I', 'I', null, null, null, null, null, null]);
    // The second page's field already holds the I; its O sits beside it on two rows.
    expect(floor(stages[1]!)).toEqual(['I', 'I', 'I', 'I', 'O', 'O', null, null, null, null]);
    expect(stages[1]![(HEIGHT - 2) * WIDTH + 4]).toBe('O');
  });

  it('follows a build: the piece that fits goes to its cells, then the next stage', () => {
    const stages = decodeBuild(fumen);
    // Find a seed whose first two pieces are I then O.
    let seed = 1;
    for (; seed < 5000; seed++) {
      const g = new Game(seed);
      if (g.active!.piece === 'I' && g.next(1)[0] === 'O') break;
    }
    const g = new Game(seed);
    const c1 = followBuild(g, stages)!;
    expect(c1).not.toBeNull();
    expect(occupiedCells({ ...c1.placement }).map(([x, y]) => [x, y]).sort()).toEqual([[0, HEIGHT - 1], [1, HEIGHT - 1], [2, HEIGHT - 1], [3, HEIGHT - 1]]);
    g.setActive(c1.placement);
    g.hardDrop();
    expect(stageFor(g, stages)).toBe(stages[1]);
    const c2 = followBuild(g, stages)!;
    expect(c2.placement.piece).toBe('O');
    expect(occupiedCells(c2.placement).every(([x]) => x === 4 || x === 5)).toBe(true);
  });

  it('a piece the build has no room for is left to the search', () => {
    const stages = decodeBuild(fumen);
    let seed = 1;
    for (; seed < 5000; seed++) {
      const g = new Game(seed);
      if (g.active!.piece === 'T' && g.next(1)[0] === 'S') break;
    }
    expect(followBuild(new Game(seed), stages)).toBeNull();
  });
});
