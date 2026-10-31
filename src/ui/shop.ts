import type { World } from '../sim/world';
import { format, toNumber } from '../sim/num';
import { BUILDINGS } from '../data/buildings';
import { UpgradeChips } from './upgradeChips';
import { ACHIEVEMENTS } from '../data/achievements';
import { t } from './i18n';
import { buildingColor } from '../render/theme';
import { drawBuildingIcon } from '../render/icons';
import { Roller } from '../render/roll';
import { fitText } from './fit';
import { durationParts, inThisRun, nextGoal, nearAchievements } from './goal';
import { buildingTier, TIER_STEPS } from '../data/tiers';
import { GARBAGE } from '../data/garbage';

// Right pane: balance and income, upgrade chips, one card per building, the
// next goal, then ascend, achievements and settings along the bottom.
export class Shop {
  private balanceEl: HTMLElement;
  private incomeEl: HTMLElement;
  private buttons = new Map<string, { btn: HTMLButtonElement; icon: HTMLCanvasElement; owned: HTMLElement; price: HTMLElement; hint: HTMLElement; bar: HTMLElement; stars: HTMLElement }>();
  private lastBalance = NaN;
  private roll = new Roller();
  private chips: UpgradeChips;
  private crownEl: HTMLElement;
  private ascendBtn: HTMLButtonElement;
  private achBtn: HTMLButtonElement;
  private goal: { name: HTMLElement; time: HTMLElement; bar: HTMLElement };
  private band: HTMLElement;
  private crownBar: { row: HTMLElement; fill: HTMLElement; text: HTMLElement };
  private near: HTMLElement;

  constructor(private root: HTMLElement, private world: World, onSettings: () => void, onAscend: () => void, onAchievements: () => void) {
    root.innerHTML = '';
    const wallet = el('div', 'wallet', '');
    const balance = stat('LINES', 'balance');
    const income = stat(t('PER SECOND'), 'income', true);
    this.balanceEl = balance.value;
    this.incomeEl = income.value;
    this.crownEl = el('div', 'crowns', '');
    // Whether buying now is cheap (a life running) or sends double garbage.
    this.band = el('div', 'live-band', '');
    wallet.append(balance.el, income.el, this.crownEl, this.band);
    root.append(wallet);
    this.chips = new UpgradeChips(root, world, () => this.refresh(true));

    // Fifteen buildings outgrow a short window; the list scrolls on its own
    // so the balance, chips and buttons stay in view.
    const list = el('div', 'buildings', '');
    root.append(list);
    BUILDINGS.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'building';
      btn.dataset['building'] = b.id;
      btn.style.setProperty('--b', buildingColor(i));
      const name = el('div', 'name', '');
      const label = el('span', 'label', b.name);
      // ★ per tier of copies owned (10, 25, 50, 100): only for show.
      const stars = el('span', 'stars', '');
      name.append(label, stars);
      const owned = el('div', 'owned', '0');
      const price = el('div', 'price', '');
      // One line; the whole of it on hover when a narrow pane cuts it short.
      const text = t('+{pct}% / copy · {pps} PPS', { pct: b.effects[0]?.value ?? 0, pps: b.pps });
      const hint = el('div', 'hint', text);
      hint.title = text;
      // A locked card fills toward its price, so the next step reads as a goal.
      const bar = el('div', 'unlock-bar', '');
      bar.append(document.createElement('i'));
      const icon = document.createElement('canvas');
      icon.className = 'icon';
      btn.append(icon, name, owned, hint, price, bar);
      btn.addEventListener('click', () => {
        if (this.world.buy(b.id)) this.refresh(true);
      });
      btn.dataset['label'] = b.name;
      list.append(btn);
      this.buttons.set(b.id, { btn, icon, owned, price, hint, bar, stars });
    });

    const goal = el('div', 'goal', '');
    const goalName = el('div', 'goal-name', '');
    const goalTime = el('div', 'goal-time', '');
    const bar = el('div', 'goal-bar', '');
    const fill = document.createElement('i');
    bar.append(fill);
    // The next crown and the achievements nearest to done ride under it.
    const crownRow = el('div', 'goal-sub crown-row', '');
    const crownText = el('span', '', '');
    const crownTrack = el('div', 'goal-bar crown', '');
    const crownFill = document.createElement('i');
    crownTrack.append(crownFill);
    crownRow.append(el('span', 't-label', t('NEXT CROWN')), crownText, crownTrack);
    this.crownBar = { row: crownRow, fill: crownFill, text: crownText };
    this.near = el('div', 'near', '');
    goal.append(el('div', 't-label', t('NEXT GOAL')), goalName, goalTime, bar, crownRow, this.near);
    root.append(goal);
    this.goal = { name: goalName, time: goalTime, bar: fill };

    const foot = el('div', 'shop-foot', '');
    this.ascendBtn = document.createElement('button');
    this.ascendBtn.className = 'btn primary ascend-btn';
    this.ascendBtn.addEventListener('click', onAscend);
    const row = el('div', 'btn-row', '');
    this.achBtn = document.createElement('button');
    this.achBtn.className = 'btn ach-btn';
    this.achBtn.addEventListener('click', onAchievements);
    const settings = document.createElement('button');
    settings.className = 'btn settings-btn';
    settings.textContent = t('SETTINGS');
    settings.addEventListener('click', onSettings);
    row.append(this.achBtn, settings);
    foot.append(this.ascendBtn, row);
    root.append(foot);
    this.refresh(true);
  }

  refresh(force = false): void {
    // Icons follow the palette and the style, which only change on a forced refresh;
    // so does the room a name has, so names are fitted then too.
    if (force) fitText(this.balanceEl, 18);
    if (force) for (const [id, ui] of this.buttons) {
      drawBuildingIcon(ui.icon, id);
      fitText(ui.stars.parentElement!, 9);
    }
    const balance = Number(this.world.economy.balance);
    // The figure rolls up to a gain rather than jumping.
    const shown = this.roll.value(balance, performance.now());
    if (force || balance !== this.lastBalance || shown !== balance) {
      this.balanceEl.textContent = format(shown);
      fitText(this.balanceEl, 18);
      if (balance > this.lastBalance) {
        this.balanceEl.classList.remove('bump');
        void this.balanceEl.offsetWidth; // restart the animation
        this.balanceEl.classList.add('bump');
      }
      this.lastBalance = balance;
    }
    const income = `${format(this.world.incomePerSecond(true))}/s`;
    if (this.incomeEl.textContent !== income) {
      this.incomeEl.textContent = income;
      fitText(this.incomeEl, 12);
    }
    const live = this.world.economy.lifeLive > 0;
    this.band.classList.toggle('idle', !live);
    this.band.textContent = live ? t('LIVE · prices −{n}%', { n: GARBAGE.liveDiscountPct }) : t('READY · purchase garbage ×{n}', { n: GARBAGE.idleGarbageMul });
    this.incomeEl.classList.toggle('buffed', this.world.buffs.active.length > 0);
    this.chips.refresh();
    const meta = this.world.economy.meta;
    this.crownEl.hidden = meta.crownsEarned === 0;
    this.crownEl.textContent = t('♛ {crowns} CROWN · +{earned}% income', { crowns: meta.crowns, earned: meta.crownsEarned });
    // The button stays hidden until a run is worth something, then names the price.
    const preview = this.world.crownPreview();
    this.ascendBtn.hidden = preview < 1 && meta.ascensions === 0;
    this.ascendBtn.disabled = !this.world.canAscend();
    this.ascendBtn.textContent = preview >= 1 ? t('ASCEND +{n} CROWN', { n: preview }) : t('ASCEND');
    this.achBtn.textContent = `★ ${meta.achievements.size}/${ACHIEVEMENTS.length}`;
    // Unlocked buildings show in full; only the next locked one is visible,
    // dimmed and unnamed, so the ladder is hinted at one step at a time.
    let lockedShown = false;
    for (const b of BUILDINGS) {
      const ui = this.buttons.get(b.id)!;
      const unlocked = this.world.isUnlocked(b.id);
      const visible = unlocked || !lockedShown;
      if (!unlocked && visible) lockedShown = true;
      ui.btn.hidden = !visible;
      ui.btn.classList.toggle('locked', !unlocked);
      const tier = buildingTier(this.world.economy.owned(b.id));
      ui.stars.textContent = tier > 0 ? ` ${'★'.repeat(tier)}` : '';
      ui.btn.dataset['tier'] = String(tier);
      const next = TIER_STEPS[tier];
      ui.stars.title = next ? t('{n} copies for the next star', { n: next }) : '';
      // A locked card names what it is and what opens it.
      const req = b.unlock?.[0];
      const reqName = req && req.type === 'owned' ? (BUILDINGS.find((x) => x.id === req.id)?.name ?? req.id) : '';
      ui.hint.textContent = unlocked ? ui.hint.title : t('Buy a {name} to unlock', { name: reqName });
      ui.bar.hidden = unlocked;
      const price = this.world.economy.price(b.id);
      const can = this.world.canBuy(b.id);
      ui.owned.textContent = String(this.world.economy.owned(b.id));
      // In a life the card shows the discount against the full price.
      const live = this.world.economy.lifeLive;
      this.world.economy.lifeLive = 0;
      const full = this.world.economy.price(b.id);
      this.world.economy.lifeLive = live;
      ui.price.replaceChildren();
      if (this.world.economy.lifeLive && unlocked) {
        const was = document.createElement('s');
        was.textContent = format(full);
        ui.price.append(was, ' ');
      }
      ui.price.append(format(price));
      ui.price.classList.toggle('cant', !can);
      if (!unlocked) (ui.bar.firstChild as HTMLElement).style.width = `${Math.min(100, Math.round((balance / Number(price)) * 100))}%`;
      ui.btn.disabled = !can;
      // What buying it now would send to the manual board.
      const rows = unlocked ? this.world.garbageFor(Number(price)) : 0;
      ui.btn.title = rows > 0 ? t('Buying sends {n} garbage rows to your board', { n: rows }) : '';
      if (rows > 0) {
        const badge = document.createElement('span');
        badge.className = 'garbage-badge';
        badge.textContent = `▲${rows}`;
        ui.price.prepend(badge, ' ');
      }
    }
    this.refreshGoal(balance);
    this.refreshNear();
  }

  private refreshNear(): void {
    const meta = this.world.economy.meta;
    const frac = this.world.crownFraction();
    this.crownBar.fill.style.width = `${Math.round(frac * 100)}%`;
    this.crownBar.text.textContent = `${Math.floor(frac * 100)}%`;
    this.crownBar.row.hidden = this.world.economy.stats.riskLines <= 0 && meta.ascensions === 0;
    const defs = ACHIEVEMENTS.filter((a) => !a.building || meta.buildingsSeen.has(a.building));
    const near = nearAchievements(defs, meta.achievements, this.world.economy, 2);
    this.near.replaceChildren(...near.map((a) => {
      const row = el('div', 'goal-sub', '');
      const track = el('div', 'goal-bar', '');
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(a.progress * 100)}%`;
      track.append(fill);
      row.append(el('span', 'near-name', `★ ${t(a.name)}`), el('span', 'near-n', `${format(a.value)}/${format(a.goal)}`), track);
      return row;
    }));
  }

  private refreshGoal(balance: number): void {
    const eco = this.world.economy;
    const goal = nextGoal(BUILDINGS.filter((b) => inThisRun(b.unlock, (id) => eco.hasPrestige(id))).map((b) => ({
      id: b.id, name: b.name, price: Number(eco.price(b.id)), owned: eco.owned(b.id), unlocked: this.world.isUnlocked(b.id),
    })), balance, toNumber(this.world.incomePerSecond()));
    const card = this.goal.name.parentElement!;
    card.hidden = !goal;
    if (!goal) return;
    this.goal.name.textContent = goal.name;
    this.goal.time.classList.toggle('ready', goal.seconds === 0);
    if (goal.seconds === 0) this.goal.time.textContent = t('READY');
    else if (goal.seconds === null) this.goal.time.textContent = '—';
    else {
      const d = durationParts(goal.seconds);
      this.goal.time.textContent = t(d.key, d.vars);
    }
    this.goal.bar.style.width = `${Math.round(goal.progress * 100)}%`;
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
