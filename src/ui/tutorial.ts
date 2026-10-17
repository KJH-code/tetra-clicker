import type { World, WorldEvent } from '../sim/world';
import { TUTORIAL_OFF } from '../data/handling';

// Five steps for a new player, each a one-line bubble that moves on when the
// game sees it done. The step logic is plain functions over the world so it
// is tested without a page; the bubble is a thin DOM layer on top.
export interface TutorialStep {
  id: string;
  text: string;
  // The event that completes the step.
  doneBy: (e: WorldEvent) => boolean;
  // Already done in this save, so a returning player skips it.
  seen: (w: World) => boolean;
}

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'start', text: 'Press any key (or tap the board) to start a life.',
    doneBy: (e) => e.type === 'roundStart',
    seen: (w) => w.economy.career('rounds') > 0 || w.economy.meta.ascensions > 0,
  },
  {
    id: 'clear', text: 'Clear a line. Lines you earn go into the VAULT, times your level.',
    doneBy: (e) => e.type === 'manualLock' && e.result.lines > 0,
    seen: (w) => w.economy.career('manualLines') > 0,
  },
  {
    id: 'building', text: 'Buy a SINGLE in the shop: every building is a bot that clears lines for you.',
    doneBy: (e) => e.type === 'bought',
    seen: (w) => w.autoBoards.length > 0 || w.economy.meta.ascensions > 0,
  },
  {
    id: 'checkpoint', text: 'Every 40 rows the vault is banked. Top out first and the vault is lost.',
    doneBy: (e) => e.type === 'checkpoint',
    seen: (w) => w.economy.career('checkpoints') > 0,
  },
  {
    id: 'ascend', text: 'Once a run is worth a CROWN, ASCEND: start over with permanent bonuses.',
    doneBy: (e) => e.type === 'ascended',
    seen: (w) => w.economy.meta.ascensions > 0,
  },
];

// The step to show: the first at or after `step` that this save has not
// already done. TUTORIAL_OFF stays off; past the last step is off too.
export function currentStep(step: number, w: World): number {
  if (step === TUTORIAL_OFF) return TUTORIAL_OFF;
  let i = Math.max(0, step);
  while (i < TUTORIAL.length && TUTORIAL[i]!.seen(w)) i++;
  return i < TUTORIAL.length ? i : TUTORIAL_OFF;
}

// After an event: the next step if it completed the current one.
export function advance(step: number, e: WorldEvent, w: World): number {
  if (step === TUTORIAL_OFF) return step;
  const now = currentStep(step, w);
  if (now === TUTORIAL_OFF) return now;
  return TUTORIAL[now]!.doneBy(e) ? currentStep(now + 1, w) : now;
}

export class TutorialBubble {
  private el: HTMLElement;
  private text: HTMLElement;
  // OK hides the bubble until the step changes.
  private hiddenFor = -2;

  constructor(parent: HTMLElement, private get: () => number, private set: (step: number) => void) {
    this.el = document.createElement('div');
    this.el.className = 'tutorial';
    this.text = document.createElement('div');
    this.text.className = 'text';
    const ok = document.createElement('button');
    ok.className = 'btn';
    ok.textContent = 'OK';
    ok.addEventListener('click', () => { this.hiddenFor = this.get(); this.refresh(); });
    const off = document.createElement('button');
    off.className = 'btn';
    off.textContent = 'TUTORIAL OFF';
    off.addEventListener('click', () => { this.set(TUTORIAL_OFF); this.refresh(); });
    const row = document.createElement('div');
    row.className = 'row';
    row.append(ok, off);
    this.el.append(this.text, row);
    parent.append(this.el);
  }

  refresh(): void {
    const step = this.get();
    const def = step === TUTORIAL_OFF ? null : TUTORIAL[step];
    this.el.hidden = !def || this.hiddenFor === step;
    if (def) this.text.textContent = `${step + 1}/${TUTORIAL.length} · ${def.text}`;
  }
}
