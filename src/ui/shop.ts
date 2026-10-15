import type { World } from '../sim/world';
import { format } from '../sim/num';
import { BUILDINGS } from '../data/buildings';

// Right pane: balance, income, one button per building, settings.
export class Shop {
  private balanceEl: HTMLElement;
  private incomeEl: HTMLElement;
  private buttons = new Map<string, { btn: HTMLButtonElement; owned: HTMLElement; price: HTMLElement }>();
  private lastBalance = NaN;

  constructor(root: HTMLElement, private world: World, onSettings: () => void) {
    root.innerHTML = '';
    const balance = stat('LINES', 'balance');
    const income = stat('PER SECOND', 'income', true);
    this.balanceEl = balance.value;
    this.incomeEl = income.value;
    root.append(balance.el, income.el);

    for (const b of BUILDINGS) {
      const btn = document.createElement('button');
      btn.className = 'building';
      btn.dataset['building'] = b.id;
      const name = el('div', 'name', b.name);
      const owned = el('div', 'owned', '0');
      const price = el('div', 'price', '');
      const hint = el('div', 'hint', `+${b.effects[0]?.value ?? 0}% / copy · ${b.pps} PPS`);
      btn.append(name, owned, price, hint);
      btn.addEventListener('click', () => {
        if (this.world.buy(b.id)) this.refresh(true);
      });
      root.append(btn);
      this.buttons.set(b.id, { btn, owned, price });
    }

    root.append(el('div', 'spacer', ''));
    const settings = document.createElement('button');
    settings.className = 'btn';
    settings.textContent = 'SETTINGS';
    settings.addEventListener('click', onSettings);
    root.append(settings);
    this.refresh(true);
  }

  refresh(force = false): void {
    const balance = Number(this.world.economy.balance);
    if (force || balance !== this.lastBalance) {
      this.balanceEl.textContent = format(balance);
      if (balance > this.lastBalance) {
        this.balanceEl.classList.remove('bump');
        void this.balanceEl.offsetWidth; // restart the animation
        this.balanceEl.classList.add('bump');
      }
      this.lastBalance = balance;
    }
    this.incomeEl.textContent = `${format(this.world.incomePerSecond())}/s`;
    for (const b of BUILDINGS) {
      const ui = this.buttons.get(b.id)!;
      const price = this.world.economy.price(b.id);
      const can = this.world.economy.canBuy(b.id);
      ui.owned.textContent = String(this.world.economy.owned(b.id));
      ui.price.textContent = format(price);
      ui.price.classList.toggle('cant', !can);
      ui.btn.disabled = !can;
    }
  }
}

function el(tagName: string, className: string, text: string): HTMLElement {
  const e = document.createElement(tagName);
  e.className = className;
  e.textContent = text;
  return e;
}

function stat(label: string, id: string, sub = false): { el: HTMLElement; value: HTMLElement } {
  const wrap = el('div', sub ? 'stat sub' : 'stat', '');
  const l = el('div', 'label', label);
  const v = el('div', 'value', '');
  v.id = id;
  wrap.append(l, v);
  return { el: wrap, value: v };
}
