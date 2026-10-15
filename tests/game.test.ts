import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { WIDTH, HEIGHT, deserializeGrid, serializeGrid, cellAt } from '../src/sim/board';
import type { Piece } from '../src/sim/pieces';
import { detectSpin } from '../src/sim/spin';

// Builds a grid from ASCII rows (bottom rows only; '.' empty, anything else filled).
function gridFrom(rows: string[]): string {
  return rows.map((r) => r.split('').map((c) => (c === '.' ? '0' : '1')).join('')).join('/');
}

function gameWith(rows: string[], piece: Piece, queue: Piece[] = ['I', 'O', 'S', 'Z', 'J', 'L']): Game {
  return new Game(0, {
    grid: gridFrom(rows), hold: null, holdUsed: false, queue: [piece, ...queue], rng: 1,
    combo: -1, b2b: -1, active: null,
  });
}

describe('Game basics', () => {
  it('spawns on the top visible row and hard drops to the floor', () => {
    const g = gameWith([], 'T');
    const r = g.hardDrop();
    expect(r.lines).toBe(0);
    expect(r.topped).toBe(false);
    // T's three bottom cells sit on the floor row.
    expect(cellAt(g.grid, 4, HEIGHT - 1)).not.toBe(0);
    expect(cellAt(g.grid, 4, HEIGHT - 2)).not.toBe(0);
  });

  it('clears a single line with an I laid flat', () => {
    const g = gameWith(['XXXXXX....'], 'I');
    while (g.moveRight()) { /* slide to the wall */ }
    const r = g.hardDrop();
    expect(r.lines).toBe(1);
    expect(r.comboIndex).toBe(0);
    expect(r.perfectClear).toBe(true);
  });

  it('counts combo index from the first clear', () => {
    const g = gameWith(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'], 'I');
    g.rotateCW();
    while (g.moveRight()) { /* to the wall */ }
    const r = g.hardDrop();
    expect(r.lines).toBe(4);
    expect(r.comboIndex).toBe(0);
    expect(r.b2bExtended).toBe(false);
  });

  it('hold swaps once per piece', () => {
    const g = gameWith([], 'T', ['I', 'O', 'S', 'Z', 'J', 'L']);
    expect(g.swapHold()).toBe(true);
    expect(g.hold).toBe('T');
    expect(g.active?.piece).toBe('I');
    expect(g.swapHold()).toBe(false);
  });

  it('resets the board, combo, b2b and hold when the spawn is blocked', () => {
    const full: string[] = [];
    for (let i = 0; i < 19; i++) full.push('XXXXXXXXX.');
    const g = gameWith(full, 'O', ['T', 'I', 'S', 'Z', 'J', 'L']);
    g.swapHold();
    expect(g.hold).toBe('O');
    const r = g.hardDrop();
    expect(r.topped).toBe(true);
    expect(serializeGrid(g.grid)).toBe('');
    expect(g.combo).toBe(-1);
    expect(g.b2b).toBe(-1);
    expect(g.hold).toBeNull();
    expect(g.holdUsed).toBe(false);
  });

  it('snapshot round-trips', () => {
    const g = new Game(123);
    g.moveLeft();
    g.rotateCW();
    g.hardDrop();
    const snap = g.snapshot();
    const h = new Game(0, snap);
    expect(h.snapshot()).toEqual(snap);
    expect(h.next()).toEqual(g.next());
  });

  it('grid serialisation round-trips', () => {
    const s = gridFrom(['..X.......', 'XXXXX.XXXX']);
    expect(serializeGrid(deserializeGrid(s))).toBe(s);
    expect(deserializeGrid(s).length).toBe(WIDTH * HEIGHT);
  });
});

describe('Spin detection', () => {
  // Classic TSD slot. The overhang at (2, H-3) stops a T from dropping in
  // flat, so it has to come down vertical and turn into the slot.
  //   H-3: X X X . . . . . . .
  //   H-2: X X . . . X X X X X
  //   H-1: X X X . X X X X X X
  const tsd = ['XXX.......', 'XX...XXXXX', 'XXX.XXXXXX'];

  it('T turned into the slot without moving is a full T-spin double', () => {
    const g = gameWith(tsd, 'T');
    expect(g.rotateCW()).toBe(true); // vertical, nub right (left would snag the overhang)
    expect(g.moveLeft()).toBe(true); // box x=2 -> column x=3
    while (g.softDrop()) { /* down */ }
    expect(g.rotateCW()).toBe(true); // flat into the slot, no kick needed
    const r = g.hardDrop();
    expect(r.lines).toBe(2);
    expect(r.spin).toBe('full');
  });

  it('a T that dropped after rotating is not a spin', () => {
    const g = gameWith(tsd, 'T');
    g.rotateCW();
    g.moveLeft();
    const r = g.hardDrop();
    expect(r.spin).toBe('none');
  });

  it('a move that actually travels disarms the spin; a blocked one does not', () => {
    const g = gameWith(tsd, 'T');
    g.rotateCW();
    g.moveLeft();
    while (g.softDrop()) { /* down */ }
    g.rotateCW();
    expect(g.spinArmed).toBe(true);
    expect(g.moveRight()).toBe(false); // slot wall: nothing moved
    expect(g.spinArmed).toBe(true);
    const h = gameWith([], 'T');
    h.rotateCW();
    expect(h.spinArmed).toBe(true);
    expect(h.moveLeft()).toBe(true);
    expect(h.spinArmed).toBe(false);
  });
});

describe('detectSpin', () => {
  const H = HEIGHT;
  const grid = (rows: string[]) => deserializeGrid(gridFrom(rows));

  it('T with both front corners filled is full', () => {
    // T pointing down (rot 2), centre (3, H-2): fronts are sw/se at row H-1.
    const g = grid(['XXX.......', 'XX...XXXXX', 'XXX.XXXXXX']);
    const p = { piece: 'T' as const, rot: 2 as const, x: 2, y: H - 3 };
    expect(detectSpin(g, p, { lastActionWasRotation: true, lastKickIndex: 0 })).toBe('full');
  });

  it('T with one front corner is mini, unless it came from the fifth kick', () => {
    // Same slot but the floor cell at (4, H-1) is open: only sw is filled.
    const g = grid(['XXX.X.....', 'XX...XXXXX', 'XXX..XXXXX']);
    const p = { piece: 'T' as const, rot: 2 as const, x: 2, y: H - 3 };
    expect(detectSpin(g, p, { lastActionWasRotation: true, lastKickIndex: 0 })).toBe('mini');
    expect(detectSpin(g, p, { lastActionWasRotation: true, lastKickIndex: 4 })).toBe('full');
  });

  it('T with fewer than three corners is nothing', () => {
    const g = grid(['..........', 'XX...XXXXX', 'XXX.XXXXXX']);
    const p = { piece: 'T' as const, rot: 2 as const, x: 2, y: H - 3 };
    expect(detectSpin(g, p, { lastActionWasRotation: true, lastKickIndex: 0 })).toBe('none');
  });

  it('non-T piece is a spin only when immobile', () => {
    // Vertical S (rot 1): cells (1,0),(1,1),(2,1),(2,2) of its box.
    //   H-3: X X X . X X X X X X    box (2,H-3): (3,H-3)
    //   H-2: X X X . . X X X X X                 (3,H-2),(4,H-2)
    //   H-1: X X X X . X X X X X                 (4,H-1)
    const g = grid(['XXX.XXXXXX', 'XXX..XXXXX', 'XXXX.XXXXX']);
    const p = { piece: 'S' as const, rot: 1 as const, x: 2, y: H - 3 };
    expect(detectSpin(g, p, { lastActionWasRotation: true, lastKickIndex: 1 })).toBe('full');
    // Open the ceiling above and it can move up: no longer a spin.
    const open = grid(['XXX.XXXXXX', 'XXX..XXXXX', 'XXXX.XXXXX']);
    open[(H - 4) * WIDTH + 3] = 0; open[(H - 4) * WIDTH + 4] = 0;
    // Immobility checks one cell up: (3,H-4) and (4,H-3) must be free. (4,H-3) is filled, so still immobile.
    expect(detectSpin(open, p, { lastActionWasRotation: true, lastKickIndex: 1 })).toBe('full');
    const open2 = grid(['XXX..XXXXX', 'XXX..XXXXX', 'XXXX.XXXXX']);
    expect(detectSpin(open2, p, { lastActionWasRotation: true, lastKickIndex: 1 })).toBe('none');
  });

  it('O is never a spin', () => {
    const g = grid(['XXXX..XXXX', 'XXXX..XXXX']);
    const p = { piece: 'O' as const, rot: 0 as const, x: 4, y: H - 2 };
    expect(detectSpin(g, p, { lastActionWasRotation: true, lastKickIndex: 0 })).toBe('none');
  });
});
