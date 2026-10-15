import { BUILDINGS, buildingById } from '../data/buildings';
import { allEffects } from '../data/index';
import { conditionMet, evaluate, type Effect, type EffectContext } from './effects';
import { UPGRADES, type UpgradeDef } from '../data/upgrades';
import { emptyStats, type Stats } from './stats';
import { tag } from './tags';
import { add, gte, mul, num, pow, sub, toNumber, ZERO, type Num } from './num';

export class Economy implements EffectContext {
  balance: Num = ZERO;
  private ownedCount = new Map<string, number>();
  readonly upgrades = new Set<string>();
  stats: Stats = emptyStats();
  readonly effects: Effect[];
  private readonly upgradeDefs: Map<string, UpgradeDef>;

  // The economy simulator passes its own ladder's effects and upgrades; the
  // game uses the data files.
  constructor(effects: Effect[] = allEffects(), upgrades: readonly UpgradeDef[] = UPGRADES) {
    this.effects = effects;
    this.upgradeDefs = new Map(upgrades.map((u) => [u.id, u]));
  }

  upgradeDef(id: string): UpgradeDef | undefined {
    return this.upgradeDefs.get(id);
  }

  allUpgrades(): UpgradeDef[] {
    return [...this.upgradeDefs.values()];
  }

  owned(id: string): number {
    return this.ownedCount.get(id) ?? 0;
  }

  setOwned(id: string, n: number): void {
    this.ownedCount.set(id, n);
  }

  stat(name: string): number {
    return (this.stats as unknown as Record<string, number>)[name] ?? 0;
  }

  hasUpgrade(id: string): boolean {
    return this.upgrades.has(id);
  }

  // --- upgrades ---------------------------------------------------------------

  isUpgradeUnlocked(id: string): boolean {
    const def = this.upgradeDef(id);
    return !!def && !this.upgrades.has(id) && def.unlock.every((c) => conditionMet(c, this));
  }

  canBuyUpgrade(id: string): boolean {
    const def = this.upgradeDef(id);
    return !!def && this.isUpgradeUnlocked(id) && gte(this.balance, num(def.price));
  }

  buyUpgrade(id: string): boolean {
    if (!this.canBuyUpgrade(id)) return false;
    this.balance = sub(this.balance, num(this.upgradeDef(id)!.price));
    this.upgrades.add(id);
    return true;
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

  snapshot(): { balance: Num; owned: Record<string, number>; upgrades: string[]; stats: Stats } {
    return { balance: this.balance, owned: Object.fromEntries(this.ownedCount), upgrades: [...this.upgrades].sort(), stats: { ...this.stats } };
  }

  static buildingIds(): string[] {
    return BUILDINGS.map((b) => b.id);
  }
}
