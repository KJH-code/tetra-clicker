import { BUILDINGS, buildingById } from '../data/buildings';
import { allEffects } from '../data/index';
import { evaluate, type Effect, type EffectContext } from './effects';
import { tag } from './tags';
import { add, gte, mul, num, pow, sub, toNumber, ZERO, type Num } from './num';

export class Economy implements EffectContext {
  balance: Num = ZERO;
  private ownedCount = new Map<string, number>();
  readonly effects: Effect[];

  constructor(effects: Effect[] = allEffects()) {
    this.effects = effects;
  }

  owned(id: string): number {
    return this.ownedCount.get(id) ?? 0;
  }

  setOwned(id: string, n: number): void {
    this.ownedCount.set(id, n);
  }

  price(id: string): Num {
    const def = buildingById(id);
    if (!def) return num(Infinity);
    const base = mul(num(def.basePrice), pow(num(def.priceGrowth), this.owned(id)));
    return num(evaluate(this.effects, 'price', [tag.building(id)], this, toNumber(base)));
  }

  canBuy(id: string): boolean {
    return gte(this.balance, this.price(id));
  }

  buy(id: string): boolean {
    if (!this.canBuy(id)) return false;
    this.balance = sub(this.balance, this.price(id));
    this.ownedCount.set(id, this.owned(id) + 1);
    return true;
  }

  earn(amount: Num, tags: readonly string[]): Num {
    const final = num(evaluate(this.effects, 'income', tags, this, toNumber(amount)));
    this.balance = add(this.balance, final);
    return final;
  }

  // Income multiplier for a given tag set, used for the catch-up formula and
  // the per-second display.
  incomeMultiplier(tags: readonly string[]): number {
    return evaluate(this.effects, 'income', tags, this, 1);
  }

  snapshot(): { balance: Num; owned: Record<string, number> } {
    return { balance: this.balance, owned: Object.fromEntries(this.ownedCount) };
  }

  static buildingIds(): string[] {
    return BUILDINGS.map((b) => b.id);
  }
}
