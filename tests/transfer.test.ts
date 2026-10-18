import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { exportSave, importSave } from '../src/save/transfer';
import { SAVE_VERSION, type SaveData } from '../src/save/schema';
import { DEFAULT_HANDLING } from '../src/data/handling';

function save(): SaveData {
  const w = new World(5);
  w.economy.balance = num(12_345);
  w.buy('single');
  return { version: SAVE_VERSION, savedAt: 1, world: w.snapshot(), settings: structuredClone(DEFAULT_HANDLING) };
}

describe('save export / import', () => {
  it('round-trips a save exactly', () => {
    const s = save();
    const text = exportSave(s);
    expect(text.startsWith('TETRA1:')).toBe(true);
    expect(importSave(text)).toEqual(JSON.parse(JSON.stringify(s)));
    // Line breaks and spaces from a chat paste are ignored.
    expect(importSave(text.slice(0, 20) + '\n  ' + text.slice(20))).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('an older save is brought up to date on the way in', () => {
    const s = save() as unknown as Record<string, unknown>;
    s['version'] = 9;
    const m = importSave(exportSave(s as unknown as SaveData))!;
    expect(m.version).toBe(SAVE_VERSION);
  });

  it('rejects anything else', () => {
    const text = exportSave(save());
    for (const bad of ['', 'hello', 'TETRA1:', 'TETRA1:!!!!', text.slice(0, -10), 'TETRA1:' + btoa('{"version":999}'), 'TETRA1:' + btoa('{"version":10}')]) {
      expect(importSave(bad), bad.slice(0, 20)).toBeNull();
    }
  });
});
