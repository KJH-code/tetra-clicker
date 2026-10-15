import type { World } from '../sim/world';
import { format } from '../sim/num';
import { UPGRADES, type UpgradeDef } from '../data/upgrades';

// A row of small chips above the buildings: one per upgrade that is unlocked
// and not yet bought. Text stays short on the chip; the tooltip carries the
// name, the price and whether it changes the rules of Tetris.
export class UpgradeChips {
  private row: HTMLElement;
  private tip: HTMLElement;
  private shownKey = '';
  private chips = new Map<string, HTMLButtonElement>();

  constructor(parent: HTMLElement, private world: World, private onBuy: () => void) {
    this.row = document.createElement('div');
    this.row.className = 'chips';
    this.tip = document.createElement('div');
    this.tip.className = 'chip-tip';
    this.tip.hidden = true;
    parent.append(this.row, this.tip);
  }

  refresh(): void {
    const eco = this.world.economy;
    const open = UPGRADES.filter((u) => eco.isUpgradeUnlocked(u.id));
    const key = open.map((u) => u.id).join(',');
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.row.replaceChildren(...open.map((u) => this.chip(u)));
      this.tip.hidden = true;
    }
    for (const [id, btn] of this.chips) btn.classList.toggle('cant', !eco.canBuyUpgrade(id));
  }

  private chip(u: UpgradeDef): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `chip ${u.group}`;
    btn.dataset['upgrade'] = u.id;
    btn.textContent = u.label;
    btn.addEventListener('click', () => {
      if (this.world.buyUpgrade(u.id)) this.onBuy();
    });
    btn.addEventListener('mouseenter', () => this.show(u, btn));
    btn.addEventListener('mouseleave', () => { this.tip.hidden = true; });
    this.chips.set(u.id, btn);
    return btn;
  }

  private show(u: UpgradeDef, anchor: HTMLElement): void {
    const rule = u.rule ? '<span class="rule">RULE</span>' : '';
    this.tip.innerHTML = `<div class="tip-name">${u.name}${rule}</div><div class="tip-price">${format(u.price)}</div>`;
    this.tip.hidden = false;
    const parent = this.tip.offsetParent as HTMLElement | null;
    const a = anchor.getBoundingClientRect();
    const p = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    this.tip.style.left = `${Math.max(8, a.left - p.left - 40)}px`;
    this.tip.style.top = `${a.bottom - p.top + 6}px`;
  }
}
