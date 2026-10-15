import { ATTACK } from '../data/attackTable';
import type { LockResult } from './game';
import { tag, type Tag } from './tags';
import { num, type Num } from './num';

export interface Earned {
  amount: Num;
  tags: Tag[];
}

export interface AttackBreakdown {
  base: number;
  comboMultiplier: number;
  b2bMultiplier: number;
  total: number;
}

// Lines earned by one placement. Minis are worth a plain clear, and spins by
// pieces other than T are worth a plain clear too; both only add a tag.
// `comboStep` is the per-step combo coefficient; upgrades can raise it.
export function attackFor(r: LockResult, comboStep: number = ATTACK.comboStep): AttackBreakdown {
  if (r.lines <= 0) return { base: 0, comboMultiplier: 1, b2bMultiplier: 1, total: 0 };
  const lines = Math.min(r.lines, 4);
  let base: number;
  if (r.perfectClear) base = ATTACK.perfectClear;
  else if (r.piece === 'T' && r.spin === 'full') base = ATTACK.tspin[lines]!;
  else base = ATTACK.normal[lines]!;
  const comboIdx = Math.min(Math.max(r.comboIndex, 0), ATTACK.combo.length - 1);
  const comboMultiplier = 1 + comboStep * ATTACK.combo[comboIdx]!;
  const b2bMultiplier = r.b2bExtended ? ATTACK.b2bMultiplier : 1;
  return { base, comboMultiplier, b2bMultiplier, total: base * comboMultiplier * b2bMultiplier };
}

export function tagsFor(r: LockResult, origin: Tag[]): Tag[] {
  const tags: Tag[] = [...origin, tag.piece(r.piece)];
  if (r.lines > 0) tags.push(tag.clear(r.lines));
  if (r.spin === 'full') tags.push(tag.tech('spin'));
  if (r.spin === 'mini') tags.push(tag.tech('mini'));
  if (r.comboIndex > 0) tags.push(tag.tech('combo'));
  if (r.b2bExtended) tags.push(tag.tech('b2b'));
  if (r.perfectClear) tags.push(tag.tech('pc'));
  return tags;
}

export function earnedFor(r: LockResult, origin: Tag[], comboStep: number = ATTACK.comboStep): Earned {
  return { amount: num(attackFor(r, comboStep).total), tags: tagsFor(r, origin) };
}
