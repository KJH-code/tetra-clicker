import type { World } from '../sim/world';
import { ACHIEVEMENTS } from '../data/achievements';

// The achievement list: met ones lit, the rest dim, hidden ones unnamed
// until met. Read-only, so it closes on any click outside or Escape.
export class AchievementsPanel {
  constructor(private overlay: HTMLElement, private world: World, private onOpenChange: (open: boolean) => void) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    window.addEventListener('keydown', (e) => {
      if (!this.overlay.hidden && e.code === 'Escape') { e.preventDefault(); this.close(); }
    }, true);
  }

  open(): void {
    const met = this.world.economy.meta.achievements;
    const box = document.createElement('div');
    box.className = 'settings achievements';
    const title = document.createElement('h2');
    title.textContent = `ACHIEVEMENTS ${met.size}/${ACHIEVEMENTS.length} · +${met.size}% income`;
    const list = document.createElement('ul');
    list.className = 'ach-list';
    for (const a of ACHIEVEMENTS) {
      const done = met.has(a.id);
      const li = document.createElement('li');
      li.className = done ? 'done' : '';
      li.dataset['achievement'] = a.id;
      const name = document.createElement('b');
      name.textContent = done || !a.hidden ? a.name : '???';
      const desc = document.createElement('span');
      desc.textContent = done || !a.hidden ? a.desc : 'Hidden';
      li.append(name, desc);
      list.append(li);
    }
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = 'CLOSE';
    close.addEventListener('click', () => this.close());
    const row = document.createElement('div');
    row.className = 'row';
    row.append(close);
    box.append(title, list, row);
    this.overlay.replaceChildren(box);
    this.overlay.hidden = false;
    this.onOpenChange(true);
  }

  close(): void {
    this.overlay.hidden = true;
    this.onOpenChange(false);
  }
}
