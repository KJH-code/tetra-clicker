import type { World } from '../sim/world';
import { PRESTIGE_UPGRADES, prestigeRequires, type Branch } from '../data/prestige';
import { CHALLENGE, CHALLENGE_RULES, challengePoints } from '../data/challenges';
import { t } from './i18n';

export const BRANCHES: { id: Branch; title: string }[] = [
  { id: 'production', title: 'PRODUCTION' },
  { id: 'survival', title: 'SURVIVAL' },
  { id: 'proportion', title: 'PROPORTION' },
  { id: 'synergy', title: 'SYNERGY' },
  { id: 'elder', title: 'WRATH' },
  { id: 'opener', title: 'OPENER' },
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
    // A hardcore life can ascend mid-life; it waits while the player decides.
    w.pauseRound();
    const box = panel(t('ASCEND'));
    box.append(
      line('big', `+${w.crownPreview()} CROWN`),
      line('dim', t("TECH ×{x} on this run's crowns", { x: (1 + w.techScore()).toFixed(2) })),
    );
    const list = document.createElement('ul');
    list.className = 'checks';
    for (const c of w.techChecks()) {
      const li = document.createElement('li');
      li.className = c.done ? 'done' : '';
      li.textContent = `${c.done ? '✓' : '·'} ${t(c.label)}`;
      list.append(li);
    }
    if (w.round.active) box.append(line('dim', t('This hardcore life ends here; its vault ({v}) is banked first.', { v: w.round.vault })));
    box.append(list, line('dim', t('Lines, buildings, run upgrades and wrath reset. Crowns, prestige upgrades and settings stay.')));
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      button(t('CANCEL'), 'btn', () => this.close()),
      button(t('ASCEND'), 'btn primary', () => {
        if (this.world.ascend() > 0) {
          this.onChanged();
          this.showShop();
        }
      }),
    );
    box.append(row);
    this.show(box);
  }

  // A hardcore top-out lands the player straight on the prestige shop.
  hardcoreOver(crowns: number): void {
    this.showShop(t('HARDCORE OVER · +{n} CROWN', { n: crowns }));
  }

  private showShop(note?: string): void {
    const meta = this.world.economy.meta;
    const box = panel(t('PRESTIGE'));
    box.classList.add('wide');
    if (note) box.append(line('over', note));
    box.append(line('big crown', `${meta.crowns} CROWN`), line('dim', t('{n} earned · +{n}% income', { n: meta.crownsEarned })));
    const cols = document.createElement('div');
    cols.className = 'branches';
    // A chain with no steps yet (OPENER before its builds are in) shows no column.
    for (const b of BRANCHES.filter((x) => PRESTIGE_UPGRADES.some((u) => u.branch === x.id))) {
      const col = document.createElement('div');
      col.className = 'branch';
      col.append(line('title', t(b.title)));
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
        card.append(line('name', t(u.name)), line('price', owned ? t('OWNED') : `${u.price} CROWN`));
        col.append(card);
      }
      cols.append(col);
    }
    const row = document.createElement('div');
    row.className = 'row';
    // The next run's mode: a pick here, kept from the last run otherwise.
    const mode = document.createElement('div');
    mode.className = 'mode';
    const challenge = challengePoints(meta.nextChallenge) > 0;
    for (const hc of [false, true]) {
      const b = button(t(hc ? 'HARDCORE' : 'NORMAL'), `btn mode-btn${hc ? ' hc' : ''}`, () => {
        this.world.setNextHardcore(hc);
        this.world.setNextChallenge({});
        this.showShop(note);
      });
      b.classList.toggle('on', !challenge && meta.nextHardcore === hc);
      b.dataset['mode'] = hc ? 'hardcore' : 'normal';
      mode.append(b);
    }
    // Challenge runs: opened by the hidden HARDCORE 20 achievement.
    if (this.world.challengeUnlocked()) {
      const b = button(t('CHALLENGE'), 'btn mode-btn ch', () => {
        if (!challenge) this.world.setNextChallenge({ no_hold: 1, next: 1 });
        this.showShop(note);
        // The rules sit under fourteen synergies: bring them into view.
        if (!challenge) this.overlay.querySelector('.challenge')?.scrollIntoView({ block: 'nearest' });
      });
      b.classList.toggle('on', challenge);
      b.dataset['mode'] = 'challenge';
      mode.append(b);
    }
    const best = meta.hardcoreBest;
    const record = line('dim', challenge
      ? t('CHALLENGE: a hardcore run with the rules above · clear it by ascending alive')
      : best.level > 0
      ? t('HARDCORE BEST · LEVEL {level} · {rows} ROWS', { level: best.level, rows: best.rows })
      : t('HARDCORE: one life, a top-out ascends · garbage from level 1, start +3 levels, 3 next · manual ×2, risk ×3'));
    const start = button(t('NEW RUN'), 'btn primary', () => {
      if (this.world.newRun()) {
        this.onChanged();
        this.close();
      }
    });
    start.disabled = !this.world.canStartRun();
    row.append(mode, record, start);
    box.append(cols);
    if (challenge) box.append(this.challengePicker(note));
    box.append(row);
    this.show(box);
  }

  // Each rule a row of steps (OFF, then each step with its points); the
  // total must reach the minimum before NEW RUN starts it.
  private challengePicker(note?: string): HTMLElement {
    const pick = { ...this.world.economy.meta.nextChallenge };
    const wrap = document.createElement('div');
    wrap.className = 'challenge';
    const pts = challengePoints(pick);
    const best = this.world.economy.meta.challengeBest;
    const needs = pts < CHALLENGE.minPoints ? t(' (needs {n})', { n: CHALLENGE.minPoints }) : '';
    wrap.append(line('title', t('CHALLENGE · {pts} POINTS{needs} · hardcore + these rules · cleared by ascending alive · best {best} (+{pct}% income)',
      { pts, needs, best, pct: best * CHALLENGE.incomePctPerPoint })));
    const grid = document.createElement('div');
    grid.className = 'rules';
    for (const r of CHALLENGE_RULES) {
      const rowEl = document.createElement('div');
      rowEl.className = `rule ${r.group}`;
      rowEl.append(line('name', t(r.name)));
      const steps = [{ label: 'OFF', points: 0 }, ...r.steps];
      steps.forEach((s, i) => {
        const b = button(i === 0 ? t('OFF') : `${t(s.label)} · ${s.points}`, 'btn step', () => {
          const next = { ...pick };
          if (i === 0) delete next[r.id]; else next[r.id] = i;
          this.world.setNextChallenge(next);
          this.showShop(note);
        });
        b.dataset['rule'] = r.id;
        b.dataset['step'] = String(i);
        b.classList.toggle('on', (pick[r.id] ?? 0) === i);
        rowEl.append(b);
      });
      grid.append(rowEl);
    }
    wrap.append(grid);
    return wrap;
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
