import { hasAll, type Tag } from './tags';

// One effect: when an amount carrying every tag in `filter` is computed for
// `target`, apply `op` with `value`. `stack` scales the value by how many of
// a building are owned (plus an offset, so the first copy can be "unlock only").
export type EffectTarget = 'income' | 'price' | (string & {});
export type EffectOp = 'add_pct' | 'mul' | 'flag';

// Conditions are data too: owning enough of a building, a play statistic
// reaching a threshold, or having bought an upgrade.
export type Condition =
  | { type: 'owned'; id: string; gte: number }
  | { type: 'stat'; stat: string; gte: number }
  | { type: 'upgrade'; id: string };

export interface Effect {
  target: EffectTarget;
  filter?: Tag[];
  op: EffectOp;
  value: number;
  stack?: { type: 'owned'; id: string; offset: number };
  when?: Condition[];
}

export interface EffectContext {
  owned(id: string): number;
  stat?(name: string): number;
  hasUpgrade?(id: string): boolean;
}

export function conditionMet(c: Condition, ctx: EffectContext): boolean {
  switch (c.type) {
    case 'owned': return ctx.owned(c.id) >= c.gte;
    case 'stat': return (ctx.stat?.(c.stat) ?? 0) >= c.gte;
    case 'upgrade': return ctx.hasUpgrade?.(c.id) ?? false;
  }
}

function effectiveValue(e: Effect, ctx: EffectContext): number {
  if (!e.stack) return e.value;
  const n = Math.max(0, ctx.owned(e.stack.id) + e.stack.offset);
  return e.value * n;
}

function applicable(e: Effect, target: EffectTarget, tags: readonly Tag[], ctx: EffectContext): boolean {
  if (e.target !== target) return false;
  if (e.filter && !hasAll(tags, e.filter)) return false;
  if (e.when && !e.when.every((c) => conditionMet(c, ctx))) return false;
  return true;
}

// Fixed order: base, then all add_pct summed into one factor, then every mul
// multiplied. Summing the percentages first is what keeps repeat purchases
// from compounding into a second exponential on top of the price curve.
export function multiplier(effects: readonly Effect[], target: EffectTarget, tags: readonly Tag[], ctx: EffectContext): number {
  let pct = 0;
  let mul = 1;
  for (const e of effects) {
    if (!applicable(e, target, tags, ctx)) continue;
    if (e.op === 'add_pct') pct += effectiveValue(e, ctx);
    else if (e.op === 'mul') mul *= effectiveValue(e, ctx);
  }
  return (1 + pct / 100) * mul;
}

export function evaluate(effects: readonly Effect[], target: EffectTarget, tags: readonly Tag[], ctx: EffectContext, base: number): number {
  return base * multiplier(effects, target, tags, ctx);
}

export function flag(effects: readonly Effect[], target: EffectTarget, tags: readonly Tag[], ctx: EffectContext): boolean {
  return effects.some((e) => e.op === 'flag' && e.value !== 0 && applicable(e, target, tags, ctx));
}

// How many active flags a target has. Rules that come in steps (two grace
// pieces instead of one) are expressed as several flags rather than a new op.
export function flagCount(effects: readonly Effect[], target: EffectTarget, ctx: EffectContext): number {
  let n = 0;
  for (const e of effects) if (e.op === 'flag' && e.value !== 0 && applicable(e, target, [], ctx)) n++;
  return n;
}
