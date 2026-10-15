// Every quantity of Lines flows through this module. The game currently runs
// on plain JS numbers; when balances outgrow double precision the swap to a
// big-number library happens here and nowhere else.
export type Num = number;

export const ZERO: Num = 0;

export const num = (n: number): Num => n;
export const add = (a: Num, b: Num): Num => a + b;
export const sub = (a: Num, b: Num): Num => a - b;
export const mul = (a: Num, b: Num): Num => a * b;
export const div = (a: Num, b: Num): Num => a / b;
export const pow = (a: Num, e: number): Num => Math.pow(a, e);
export const gte = (a: Num, b: Num): boolean => a >= b;
export const lt = (a: Num, b: Num): boolean => a < b;
export const toNumber = (a: Num): number => a;

// Serialisation goes through strings so a future big-number type can keep its
// full precision in the save file.
export const serialize = (a: Num): string => String(a);
export const deserialize = (s: string): Num => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// Below a thousand the attack table's halves (2.5, 4.5) are visible, so one
// decimal is kept; above it the idle-game convention of three significant
// digits with a suffix takes over, and past the suffix list exponent notation.
export function format(a: Num): string {
  const n = toNumber(a);
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) {
    const fixed = abs.toFixed(1);
    return sign + (fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed);
  }
  const tier = Math.floor(Math.log10(abs) / 3);
  const suffix = SUFFIXES[tier];
  if (suffix === undefined) {
    return sign + abs.toExponential(2).replace('e+', 'e');
  }
  const scaled = abs / Math.pow(1000, tier);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return sign + scaled.toFixed(digits) + suffix;
}
