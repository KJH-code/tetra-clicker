import { ATTACK } from '../data/attackTable';
import type { LockResult } from './game';
import { tag, type Tag } from './tags';
import { num, type Num } from './num';
import { GARBAGE } from '../data/garbage';

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
  if (r.lines > 0 && !isTechClear(r)) tags.push(tag.tech('none'));
  return tags;
}

// A clear that counts as a technique: a full spin, a tetris, back-to-back,
// a perfect clear, or a combo from its fourth step. Hardcore pays the rest
// half, and garbage rows cleared by one pay a bonus.
export function isTechClear(r: LockResult): boolean {
  return r.lines > 0 && (r.spin === 'full' || r.lines === 4 || r.b2bExtended || r.perfectClear || r.comboIndex >= GARBAGE.techComboMin);
}

export function earnedFor(r: LockResult, origin: Tag[], comboStep: number = ATTACK.comboStep): Earned {
  return { amount: num(attackFor(r, comboStep).total), tags: tagsFor(r, origin) };
}

export type BotTech = 'tspin' | 'allspin' | 'combo' | 'b2b' | 'pc' | 'downstack' | 'fourwide' | 'opener';

// Which bonuses each technique is paid. OPENER plays PC, TSD, PC with the
// chain alive, so it is paid all three; 4-WIDE is a combo bot.
const PAID: Record<BotTech, { spin?: 'T' | 'all'; combo?: boolean; b2b?: boolean; pc?: boolean }> = {
  tspin: { spin: 'T' },
  allspin: { spin: 'all' },
  combo: { combo: true },
  b2b: { b2b: true },
  pc: { pc: true },
  downstack: {},
  fourwide: { combo: true },
  opener: { spin: 'T', b2b: true, pc: true },
};

// Lines each cleared garbage row adds for a DOWNSTACK-style bot.
export interface GarbageBonus { clean: number; cheese: number }

// What a bot is paid for a placement. Every clear pays its table value; a
// bot earns only its own building's technique bonus (a T-SPIN bot's T-spins,
// a COMBO bot's combos), so mixing techniques is left to synergy upgrades.
// Garbage rows cleared pay their bonus on top, outside the table.
export function botAttack(r: LockResult, tech?: BotTech, garbage?: GarbageBonus): number {
  const paid = tech ? PAID[tech] : {};
  const spinPaid = paid.spin === 'all' || (paid.spin === 'T' && r.piece === 'T');
  const table = attackFor({
    ...r,
    spin: spinPaid ? r.spin : 'none',
    comboIndex: paid.combo ? r.comboIndex : 0,
    b2bExtended: paid.b2b ? r.b2bExtended : false,
    perfectClear: paid.pc ? r.perfectClear : false,
  }).total;
  const g = garbage && r.garbageCleared ? r.garbageCleared.clean * garbage.clean + r.garbageCleared.cheese * garbage.cheese : 0;
  return table + g;
}
