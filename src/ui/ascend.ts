import type { World } from '../sim/world';
import { PRESTIGE_UPGRADES, prestigeRequires, type Branch } from '../data/prestige';

const BRANCHES: { id: Branch; title: string }[] = [
  { id: 'production', title: 'PRODUCTION' },
  { id: 'survival', title: 'SURVIVAL' },
  { id: 'proportion', title: 'PROPORTION' },
  { id: 'synergy', title: 'SYNERGY' },
];

// The ascension screen: a confirmation that shows what the run is worth,
// then the prestige shop that stays up until NEW RUN. While the world is
// ascending this overlay is the whole game.
export class AscendPanel {
  constructor(
    private overlay: HTMLElement,
    private world: World,
    private onOpenChange: (open: boolean) => void,
    private onChanged: () => void,
  ) {
    window.addEventListener('keydown', (e) => {
      if (this.overlay.hidden || e.code !== 'Escape') return;
      // Escape backs out of the confirmation only; the shop has to end in NEW RUN.
      if (!this.world.ascending) this.close();
    }, true);
    if (world.ascending) this.showShop();
  }

  confirm(): void {
    if (!this.world.canAscend()) return;
    const w = this.world;
    const box = panel('ASCEND');
    box.append(
      line('big', `+${w.crownPreview()} CROWN`),
      line('dim', `TECH ×${(1 + w.techScore()).toFixed(2)} on this run's crowns`),
    );
    const list = document.createElement('ul');
    list.className = 'checks';
    for (const c of w.techChecks()) {
      const li = document.createElement('li');
      li.className = c.done ? 'done' : '';
      li.textContent = `${c.done ? '✓' : '·'} ${c.label}`;
      list.append(li);
    }
    box.append(list, line('dim', 'Lines, buildings, run upgrades and wrath reset. Crowns, prestige upgrades and settings stay.'));
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      button('CANCEL', 'btn', () => this.close()),
      button('ASCEND', 'btn primary', () => {
        if (this.world.ascend() > 0) {
          this.onChanged();
          this.showShop();
        }
      }),
    );
    box.append(row);
    this.show(box);
  }

  private showShop(): void {
    const meta = this.world.economy.meta;
    const box = panel('PRESTIGE');
    box.classList.add('wide');
    box.append(line('big crown', `${meta.crowns} CROWN`), line('dim', `${meta.crownsEarned} earned · +${meta.crownsEarned}% income`));
    const cols = document.createElement('div');
    cols.className = 'branches';
    for (const b of BRANCHES) {
      const col = document.createElement('div');
      col.className = 'branch';
      col.append(line('title', b.title));
      for (const u of PRESTIGE_UPGRADES.filter((x) => x.branch === b.id)) {
        const owned = meta.prestige.has(u.id);
        const req = prestigeRequires(u.id);
        const reachable = !req || meta.prestige.has(req);
        const card = button('', 'pcard', () => {
          if (this.world.buyPrestige(u.id)) this.showShop();
        });
        card.dataset['prestige'] = u.id;
        card.classList.toggle('owned', owned);
        card.classList.toggle('locked', !owned && !reachable);
        card.disabled = owned || !this.world.canBuyPrestige(u.id);
        card.append(line('name', u.name), line('price', owned ? 'OWNED' : `${u.price} CROWN`));
        col.append(card);
      }
      cols.append(col);
    }
    const row = document.createElement('div');
    row.className = 'row';
    row.append(button('NEW RUN', 'btn primary', () => {
      if (this.world.newRun()) {
        this.onChanged();
        this.close();
      }
    }));
    box.append(cols, row);
    this.show(box);
  }

  private show(box: HTMLElement): void {
    this.overlay.replaceChildren(box);
    if (this.overlay.hidden) {
      this.overlay.hidden = false;
      this.onOpenChange(true);
    }
  }

  private close(): void {
    this.overlay.hidden = true;
    this.overlay.replaceChildren();
    this.onOpenChange(false);
  }
}

function panel(title: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'settings ascend';
  const h = document.createElement('h2');
  h.textContent = title;
  box.append(h);
  return box;
}

function line(cls: string, text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
