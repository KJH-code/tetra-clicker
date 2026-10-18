import type { World } from '../sim/world';
import { ACHIEVEMENTS } from '../data/achievements';
import { statsView } from './stats';
import { t as tr } from './i18n';

// The achievement list: met ones lit, the rest dim, hidden ones unnamed
// until met. Read-only, so it closes on any click outside or Escape.
export class AchievementsPanel {
  constructor(private overlay: HTMLElement, private world: World, private onOpenChange: (open: boolean) => void) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    window.addEventListener('keydown', (e) => {
      if (!this.overlay.hidden && e.code === 'Escape') { e.preventDefault(); this.close(); }
    }, true);
  }

  private tab: 'achievements' | 'stats' = 'achievements';

  open(tab: 'achievements' | 'stats' = this.tab): void {
    this.tab = tab;
    const met = this.world.economy.meta.achievements;
    const box = document.createElement('div');
    box.className = 'settings achievements';
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    for (const t of ['achievements', 'stats'] as const) {
      const b = document.createElement('button');
      b.className = 'btn tab' + (t === tab ? ' on' : '');
      b.dataset['tab'] = t;
      b.textContent = t === 'achievements' ? tr('ACHIEVEMENTS {met}/{all}', { met: met.size, all: ACHIEVEMENTS.length }) : tr('STATS');
      b.addEventListener('click', () => this.open(t));
      tabs.append(b);
    }
    box.append(tabs);
    if (tab === 'stats') {
      box.append(statsView(this.world), this.closeRow());
      this.overlay.replaceChildren(box);
      this.overlay.hidden = false;
      this.onOpenChange(true);
      return;
    }
    const title = document.createElement('h2');
    title.textContent = tr('+{n}% income', { n: met.size });
    const list = document.createElement('ul');
    list.className = 'ach-list';
    for (const a of ACHIEVEMENTS) {
      const done = met.has(a.id);
      const li = document.createElement('li');
      li.className = done ? 'done' : '';
      li.dataset['achievement'] = a.id;
      // Hidden ones, and those of buildings never bought, stay unnamed.
      const unseen = !!a.building && !this.world.economy.meta.buildingsSeen.has(a.building);
      const shown = done || (!a.hidden && !unseen);
      const name = document.createElement('b');
      name.textContent = shown ? tr(a.name) : '???';
      const desc = document.createElement('span');
      desc.textContent = shown ? tr(a.desc) : a.hidden ? tr('Hidden') : tr('A building not yet bought');
      li.append(name, desc);
      list.append(li);
    }
    box.append(title, list, this.closeRow());
    this.overlay.replaceChildren(box);
    this.overlay.hidden = false;
    this.onOpenChange(true);
  }

  private closeRow(): HTMLElement {
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = tr('CLOSE');
    close.addEventListener('click', () => this.close());
    const row = document.createElement('div');
    row.className = 'row';
    row.append(close);
    return row;
  }

  close(): void {
    this.overlay.hidden = true;
    this.onOpenChange(false);
  }
}
