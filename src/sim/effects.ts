import { hasAll, type Tag } from './tags';

// One effect: when an amount carrying every tag in `filter` is computed for
// `target`, apply `op` with `value`. `stack` scales the value by how many of
// a building are owned (plus an offset, so the first copy can be "unlock only").
export type EffectTarget = 'income' | 'price' | (string & {});
export type EffectOp = 'add' | 'add_pct' | 'mul' | 'mul_pct' | 'flag';

// Conditions are data too: owning enough of a building, a play statistic
// reaching a threshold (or staying under one, or over a whole career), having bought an upgrade, a
// prestige upgrade, or playing a hardcore run.
export type Condition =
  | { type: 'owned'; id: string; gte: number }
  | { type: 'stat'; stat: string; gte: number }
  | { type: 'stat'; stat: string; lte: number }
  // A statistic over every run so far plus this one.
  | { type: 'career'; stat: string; gte: number }
  | { type: 'upgrade'; id: string }
  | { type: 'prestige'; id: string }
  | { type: 'hardcore' };

export interface Effect {
  target: EffectTarget;
  filter?: Tag[];
  op: EffectOp;
  value: number;
  // Scale the value by a count: copies of a building owned, or a statistic.
  stack?: { type: 'owned'; id: string; offset: number } | { type: 'stat'; stat: string };
  when?: Condition[];
}

export interface EffectContext {
  owned(id: string): number;
  stat?(name: string): number;
  career?(name: string): number;
  hasUpgrade?(id: string): boolean;
  hasPrestige?(id: string): boolean;
  isHardcore?(): boolean;
}

export function conditionMet(c: Condition, ctx: EffectContext): boolean {
  switch (c.type) {
    case 'owned': return ctx.owned(c.id) >= c.gte;
    case 'stat': {
      const v = ctx.stat?.(c.stat) ?? 0;
      return 'gte' in c ? v >= c.gte : v <= c.lte;
    }
    case 'career': return (ctx.career?.(c.stat) ?? 0) >= c.gte;
    case 'upgrade': return ctx.hasUpgrade?.(c.id) ?? false;
    case 'prestige': return ctx.hasPrestige?.(c.id) ?? false;
    case 'hardcore': return ctx.isHardcore?.() ?? false;
  }
}

function effectiveValue(e: Effect, ctx: EffectContext): number {
  if (!e.stack) return e.value;
  const n = e.stack.type === 'owned'
    ? Math.max(0, ctx.owned(e.stack.id) + e.stack.offset)
    : Math.max(0, ctx.stat?.(e.stack.stat) ?? 0);
  return e.value * n;
}

function applicable(e: Effect, target: EffectTarget, tags: readonly Tag[], ctx: EffectContext): boolean {
  if (e.target !== target) return false;
  if (e.filter && !hasAll(tags, e.filter)) return false;
  if (e.when && !e.when.every((c) => conditionMet(c, ctx))) return false;
  return true;
}

// Fixed order: base, plus every flat add, then all add_pct summed into one
// factor, then every mul (and mul_pct, a mul written as a percentage)
// multiplied. Summing the percentages first is what keeps repeat purchases
// from compounding into a second exponential on top of the price curve.
function fold(effects: readonly Effect[], target: EffectTarget, tags: readonly Tag[], ctx: EffectContext): { add: number; factor: number } {
  let add = 0;
  let pct = 0;
  let mul = 1;
  for (const e of effects) {
    if (!applicable(e, target, tags, ctx)) continue;
    const v = effectiveValue(e, ctx);
    if (e.op === 'add') add += v;
    else if (e.op === 'add_pct') pct += v;
    else if (e.op === 'mul') mul *= v;
    else if (e.op === 'mul_pct') mul *= 1 + v / 100;
  }
  return { add, factor: (1 + pct / 100) * mul };
}

// The factor alone, for callers that apply it to a base they hold
// themselves. Flat adds are ignored here; they need `evaluate`.
export function multiplier(effects: readonly Effect[], target: EffectTarget, tags: readonly Tag[], ctx: EffectContext): number {
  return fold(effects, target, tags, ctx).factor;
}

export function evaluate(effects: readonly Effect[], target: EffectTarget, tags: readonly Tag[], ctx: EffectContext, base: number): number {
  const { add, factor } = fold(effects, target, tags, ctx);
  return (base + add) * factor;
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
