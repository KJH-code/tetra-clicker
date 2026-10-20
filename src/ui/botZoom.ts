import type { World } from '../sim/world';
import { BoardRenderer } from '../render/boardRenderer';
import { Fx } from '../render/fx';
import { buildingById, BUILDINGS } from '../data/buildings';
import { BOT_LINKS, linkBuffId } from '../data/botlinks';
import { buildingColor } from '../render/theme';
import { format } from '../sim/num';
import { t } from './i18n';

// What each building's bot adds beyond its Lines, for the zoomed view.
export const ABILITY: Record<string, string> = {
  tetris: 'Each tetris it makes cancels one queued garbage row on your board.',
  pc: 'Each perfect clear it makes doubles every bot for 5 s.',
  combo: 'Each clear pays 10% more per step of its combo.',
  b2b: 'Each clear pays 2% more per step of its back-to-back chain.',
  downstack: 'Clearing garbage lifts one garbage row off your board, at most every 20 s.',
  opener: 'The first 10 pieces of each life pay double by hand.',
  allspin: 'Each spin it makes takes 2 s off the HINT cooldown.',
  helper: 'Every few combo or back-to-back clears it lifts a garbage row off your board.',
  invader: 'Sends cheese garbage to your board, paid more for it.',
  rival: 'Fights your board for as long as a life runs.',
};

// One bot, large: its board live, what it earns, its level, the hand's
// link to it and its ability. Opened by clicking a bot board.
export class BotZoom {
  private index = -1;
  private renderer: BoardRenderer | null = null;
  private fx = new Fx();
  private facts: HTMLElement | null = null;
  private xp: HTMLElement | null = null;

  constructor(private overlay: HTMLElement, private world: World, private onOpenChange: (open: boolean) => void) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    window.addEventListener('keydown', (e) => { if (!overlay.hidden && e.code === 'Escape') this.close(); }, true);
  }

  get open(): boolean { return this.index >= 0; }

  show(index: number): void {
    const board = this.world.autoBoards[index];
    const def = board && buildingById(board.buildingId);
    if (!board || !def) return;
    this.index = index;
    const box = document.createElement('div');
    box.className = 'settings botzoom';
    box.style.setProperty('--b', buildingColor(BUILDINGS.indexOf(def)));
    const h = document.createElement('h2');
    h.append(document.createElement('i'), def.name);
    const canvas = document.createElement('canvas');
    const cell = Math.max(14, Math.min(26, Math.floor((window.innerHeight * 0.7) / 22)));
    this.renderer = new BoardRenderer(canvas, { cell, leftCells: 4, rightCells: 0 });
    const side = document.createElement('div');
    this.facts = document.createElement('dl');
    this.facts.className = 'facts';
    this.xp = document.createElement('div');
    this.xp.className = 'xp';
    this.xp.append(document.createElement('i'));
    const ability = document.createElement('div');
    ability.className = 'ability';
    const own = ABILITY[def.id];
    ability.textContent = [t('By hand: {tech} doubles this bot for 30 s (90 s at most).', { tech: def.tech ? def.tech.toUpperCase() : def.name }), own ? t(own) : ''].filter(Boolean).join(' ');
    side.append(this.facts, this.xp, ability);
    const row = document.createElement('div');
    row.className = 'row';
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = t('CLOSE');
    close.addEventListener('click', () => this.close());
    row.append(close);
    box.append(h, canvas, side, row);
    this.overlay.replaceChildren(box);
    this.overlay.hidden = false;
    this.onOpenChange(true);
    this.refresh();
  }

  close(): void {
    if (!this.open) return;
    this.index = -1;
    this.renderer = null;
    this.overlay.hidden = true;
    this.overlay.replaceChildren();
    this.onOpenChange(false);
  }

  // Each frame while open: the board and the numbers.
  refresh(): void {
    const board = this.world.autoBoards[this.index];
    const def = board && buildingById(board.buildingId);
    if (!board || !def || !this.renderer || !this.facts || !this.xp) { this.close(); return; }
    const g = board.game;
    this.renderer.render({ grid: g.grid, active: g.active, ghostY: null, holds: g.holds, holdUsed: false, next: [] }, this.fx);
    const level = this.world.botLevel(def.id);
    const xp = this.world.botXp[def.id] ?? 0;
    const need = (n: number) => (BOT_LINKS.xpPerLevel * n * (n + 1)) / 2;
    const link = this.world.links.active.find((b) => b.id === linkBuffId(def.id));
    const rows: [string, string][] = [
      [t('Owned'), String(this.world.economy.owned(def.id))],
      [t('PER SECOND'), `${format(this.world.boardIncome(def.id))}/s`],
      [t('Bot level'), level >= BOT_LINKS.maxLevel ? `${level} · MAX` : `${level} · ${xp}/${need(level + 1)}`],
      [t('Level bonus'), `+${level * BOT_LINKS.levelPct}%`],
      [t('Linked by hand'), link ? `×2 · ${Math.ceil(link.msLeft / 1000)}s` : '—'],
      [t('Low stack bonus'), `+${Math.round(this.world.economy.stackBonus)}%`],
    ];
    this.facts.replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }));
    const lo = need(level);
    const hi = need(level + 1);
    (this.xp.firstChild as HTMLElement).style.width = level >= BOT_LINKS.maxLevel ? '100%' : `${Math.round(((xp - lo) / (hi - lo)) * 100)}%`;
  }
}
