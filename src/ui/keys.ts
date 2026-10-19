import type { KeyBindings } from '../data/handling';
import type { Action } from './input';

// Key bindings: any number of keys per action, each key on one action only
// (two actions on one key would fire both, which no player wants).

// Adds `code` to `action`, taking it off whichever action had it.
export function addKey(keys: KeyBindings, action: Action, code: string): void {
  for (const a of Object.keys(keys) as Action[]) keys[a] = keys[a].filter((k) => k !== code);
  keys[action].push(code);
}

// Removes one key from one action; an action may end with none.
export function removeKey(keys: KeyBindings, action: Action, code: string): void {
  keys[action] = keys[action].filter((k) => k !== code);
}

// KeyboardEvent.code as a player names the key: L-CTRL, not ControlLeft
// (or CONTROLL, which stripping "Left" made of it).
const NAMES: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Tab: 'TAB', Backspace: 'BKSP', Escape: 'ESC',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT', MetaLeft: 'L-META', MetaRight: 'R-META', CapsLock: 'CAPS',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
  Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
};

export function keyName(code: string): string {
  const named = NAMES[code];
  if (named) return named;
  const m = /^(?:Key|Digit)(.)$/.exec(code) ?? /^Numpad(\d)$/.exec(code);
  if (m) return code.startsWith('Numpad') ? `NUM ${m[1]}` : m[1]!;
  return code.toUpperCase();
}
