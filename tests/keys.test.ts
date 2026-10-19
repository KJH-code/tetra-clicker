import { describe, expect, test } from 'vitest';
import { addKey, keyName, removeKey } from '../src/ui/keys';
import { DEFAULT_HANDLING, type KeyBindings } from '../src/data/handling';

const fresh = (): KeyBindings => structuredClone(DEFAULT_HANDLING.keys);

describe('key bindings', () => {
  test('several keys on one action', () => {
    const k = fresh();
    addKey(k, 'hardDrop', 'KeyV');
    expect(k.hardDrop).toEqual(['Space', 'KeyV']);
  });

  test('a key added to one action leaves the action that had it', () => {
    const k = fresh();
    addKey(k, 'hardDrop', 'KeyZ');
    expect(k.hardDrop).toContain('KeyZ');
    expect(k.rotateCCW).not.toContain('KeyZ');
    expect(k.rotateCCW).toEqual(['ControlLeft']);
  });

  test('adding a key an action already has keeps one copy', () => {
    const k = fresh();
    addKey(k, 'rotateCW', 'KeyX');
    expect(k.rotateCW.filter((c) => c === 'KeyX')).toHaveLength(1);
  });

  test('removing takes off that key only, down to none', () => {
    const k = fresh();
    removeKey(k, 'hold', 'KeyC');
    expect(k.hold).toEqual(['ShiftLeft']);
    removeKey(k, 'hold', 'ShiftLeft');
    expect(k.hold).toEqual([]);
    expect(k.left).toEqual(['ArrowLeft']);
  });
});

describe('key names', () => {
  test('modifiers and arrows read as players say them', () => {
    expect(keyName('ControlLeft')).toBe('L-CTRL');
    expect(keyName('ShiftRight')).toBe('R-SHIFT');
    expect(keyName('ArrowLeft')).toBe('←');
    expect(keyName('Space')).toBe('SPACE');
    expect(keyName('KeyZ')).toBe('Z');
    expect(keyName('Digit4')).toBe('4');
    expect(keyName('Numpad7')).toBe('NUM 7');
  });

  test('every default key has a short readable name', () => {
    for (const codes of Object.values(DEFAULT_HANDLING.keys)) {
      for (const c of codes) {
        const n = keyName(c);
        expect(n.length, c).toBeLessThanOrEqual(8);
        expect(n, c).not.toMatch(/LEFT|RIGHT|CONTROL/);
      }
    }
  });
});
