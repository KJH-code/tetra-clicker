import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { MemoryStore } from '../src/save/memoryStore';
import { migrate, SAVE_VERSION, type SaveData } from '../src/save/schema';
import { DEFAULT_HANDLING } from '../src/data/handling';

describe('save round trip', () => {
  it('world snapshot survives store → load → World', () => {
    const w = new World(42);
    w.advance(0);
    w.manual.moveLeft();
    w.manual.rotateCW();
    w.manualHardDrop();
    w.manual.swapHold();
    w.economy.balance = 500;
    w.buy('single');
    w.buy('single');
    for (let t = 16; t <= 5000; t += 16) w.advance(t);

    const store = new MemoryStore();
    const data: SaveData = { version: SAVE_VERSION, savedAt: 123, world: w.snapshot(), settings: DEFAULT_HANDLING };
    store.save(data);
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    const w2 = new World(42, loaded!.world);
    expect(w2.snapshot()).toEqual(w.snapshot());
    expect(w2.manual.next()).toEqual(w.manual.next());
    expect(w2.economy.owned('single')).toBe(2);
    expect(w2.autoBoards).toHaveLength(1);

    // Time the tab was closed is not paid out: a load followed by a tick
    // hours later earns nothing.
    const w3 = new World(42, loaded!.world);
    w3.advance(99_999_999);
    expect(Number(w3.economy.balance)).toBe(Number(w.economy.balance));

    // Both continue identically from here. The loaded world's first tick only
    // sets its clock, so it needs the base time before the shared steps.
    w2.advance(4992); // the last tick the original world saw
    for (let t = 5016; t <= 10_000; t += 16) { w.advance(t); w2.advance(t); }
    expect(w2.snapshot()).toEqual(w.snapshot());
  });

  it('migrate rejects unknown versions and passes current ones through', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate({ version: 0 })).toBeNull();
    expect(migrate({ version: SAVE_VERSION + 1 })).toBeNull();
    const data = { version: SAVE_VERSION, savedAt: 1, world: {}, settings: {} };
    expect(migrate(data)).toEqual(data);
  });
});
