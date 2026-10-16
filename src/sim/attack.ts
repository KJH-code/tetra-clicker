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

// Lines earned by one placement. Minis are worth a plain clear; full spins
// by pieces other than T (all-spins) pay their plain clear ×1.5.
// `comboStep` is the per-step combo coefficient; upgrades can raise it.
export function attackFor(r: LockResult, comboStep: number = ATTACK.comboStep): AttackBreakdown {
  if (r.lines <= 0) return { base: 0, comboMultiplier: 1, b2bMultiplier: 1, total: 0 };
  const lines = Math.min(r.lines, 4);
  let base: number;
  if (r.perfectClear) base = ATTACK.perfectClear;
  else if (r.piece === 'T' && r.spin === 'full') base = ATTACK.tspin[lines]!;
  else base = ATTACK.normal[lines]! * (r.spin === 'full' ? ATTACK.allSpinMultiplier : 1);
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

export type BotTech = 'tspin' | 'allspin' | 'combo' | 'b2b' | 'pc';

// What a bot is paid for a placement. Every clear pays its table value; a
// bot earns only its own building's technique bonus (a T-SPIN bot's T-spins,
// a COMBO bot's combos), so mixing techniques is left to synergy upgrades.
export function botAttack(r: LockResult, tech?: BotTech): number {
  const spinPaid = (tech === 'tspin' && r.piece === 'T') || tech === 'allspin';
  return attackFor({
    ...r,
    spin: spinPaid ? r.spin : 'none',
    comboIndex: tech === 'combo' ? r.comboIndex : 0,
    b2bExtended: tech === 'b2b' ? r.b2bExtended : false,
    perfectClear: tech === 'pc' ? r.perfectClear : false,
  }).total;
}
