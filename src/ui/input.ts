import type { Game } from '../sim/game';
import { SDF_INSTANT, SOFT_DROP_CELLS_PER_SECOND_PER_SDF, type HandlingSettings, type KeyBindings } from '../data/handling';

export type Action = keyof KeyBindings;

const TOUCH = 'Touch:';

// What a key press means right now: play, start a round, or resume one.
export type InputGate = 'play' | 'start' | 'resume';

export interface InputHost {
  game: Game;
  onHardDrop(): void;
  gate?(): InputGate;
  start?(): void;
  resume?(): void;
  onHint?(): void;
}

// Keyboard → game actions with guideline handling. Horizontal movement
// repeats after DAS at ARR intervals (ARR 0 = teleport to the wall); soft
// drop moves at a rate set by SDF. Timing is driven from the main loop so it
// stays consistent with the render frame rather than keyboard repeat events.
export class InputHandler {
  private down = new Set<string>();
  private horizontal: { dir: -1 | 1; heldMs: number; repeatMs: number } | null = null;
  private softMs = 0;
  private active = false;

  constructor(private host: InputHost, public settings: HandlingSettings) {}

  attach(target: Window): void {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', () => this.releaseAll());
  }

  // Settings UI sets this false while capturing a rebind so play keys stay quiet.
  setActive(on: boolean): void {
    this.active = on;
    if (!on) this.releaseAll();
  }

  // On-screen buttons press the same actions as keys, under a code of their
  // own, so DAS, ARR and soft drop behave exactly as on a keyboard.
  press(action: Action): void {
    this.keyDown(`${TOUCH}${action}`);
  }

  release(action: Action): void {
    this.keyUp(`${TOUCH}${action}`);
  }

  private held(action: Action): boolean {
    return this.down.has(`${TOUCH}${action}`) || this.settings.keys[action].some((k) => this.down.has(k));
  }

  private actionFor(code: string): Action | null {
    if (code.startsWith(TOUCH)) return code.slice(TOUCH.length) as Action;
    const keys = this.settings.keys;
    for (const action of Object.keys(keys) as Action[]) {
      if (keys[action].includes(code)) return action;
    }
    return null;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active || !this.actionFor(e.code)) return;
    e.preventDefault();
    this.keyDown(e.code);
  };

  private keyDown(code: string): void {
    if (!this.active) return;
    const action = this.actionFor(code);
    if (!action) return;
    if (this.down.has(code)) return; // OS key repeat; DAS handles repeats
    this.down.add(code);
    // Between rounds or while paused, the first key only starts or resumes:
    // it should not also move a piece the player has not looked at yet.
    const gate = this.host.gate?.() ?? 'play';
    if (gate === 'start') { this.host.start?.(); return; }
    if (gate === 'resume') { this.host.resume?.(); return; }
    const game = this.host.game;
    switch (action) {
      case 'left':
      case 'right': {
        const dir = action === 'left' ? -1 : 1;
        // A fresh press in the other direction takes over at once, which is
        // what lets players tap-tap across the board.
        this.horizontal = { dir, heldMs: 0, repeatMs: 0 };
        this.move(dir);
        break;
      }
      case 'softDrop':
        this.softMs = 0;
        this.softStep(true);
        break;
      case 'hardDrop':
        this.host.onHardDrop();
        break;
      case 'rotateCW': game.rotateCW(); break;
      case 'rotateCCW': game.rotateCCW(); break;
      case 'rotate180': game.rotate180(); break;
      case 'hold': game.swapHold(); break;
      case 'hint': this.host.onHint?.(); break;
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keyUp(e.code);
  };

  private keyUp(code: string): void {
    if (!this.down.delete(code)) return;
    const action = this.actionFor(code);
    if (action === 'left' || action === 'right') {
      const dir = action === 'left' ? -1 : 1;
      if (this.horizontal && this.horizontal.dir === dir) {
        // If the other direction is still held, DAS restarts for it.
        const stillHeld = this.held(dir === -1 ? 'right' : 'left');
        this.horizontal = stillHeld ? { dir: -dir as -1 | 1, heldMs: 0, repeatMs: 0 } : null;
        if (stillHeld) this.move(-dir as -1 | 1);
      }
    }
  }

  private releaseAll(): void {
    this.down.clear();
    this.horizontal = null;
  }

  private move(dir: -1 | 1): boolean {
    return dir === -1 ? this.host.game.moveLeft() : this.host.game.moveRight();
  }

  private softStep(first: boolean): void {
    const game = this.host.game;
    if (this.settings.sdf >= SDF_INSTANT) {
      while (game.softDrop()) { /* to the floor */ }
      return;
    }
    if (first) game.softDrop();
  }

  // Called every frame with the elapsed time.
  update(dtMs: number): void {
    if (!this.active) return;
    if ((this.host.gate?.() ?? 'play') !== 'play') { this.horizontal = null; this.softMs = 0; return; }
    const h = this.horizontal;
    if (h) {
      h.heldMs += dtMs;
      if (h.heldMs >= this.settings.das) {
        if (this.settings.arr <= 0) {
          while (this.move(h.dir)) { /* ARR 0: straight to the wall */ }
        } else {
          h.repeatMs += dtMs;
          while (h.repeatMs >= this.settings.arr) {
            h.repeatMs -= this.settings.arr;
            if (!this.move(h.dir)) { h.repeatMs = 0; break; }
          }
        }
      }
    }
    const softHeld = this.held('softDrop');
    if (softHeld) {
      if (this.settings.sdf >= SDF_INSTANT) {
        while (this.host.game.softDrop()) { /* instant */ }
      } else {
        const interval = 1000 / (this.settings.sdf * SOFT_DROP_CELLS_PER_SECOND_PER_SDF);
        this.softMs += dtMs;
        while (this.softMs >= interval) {
          this.softMs -= interval;
          if (!this.host.game.softDrop()) { this.softMs = 0; break; }
        }
      }
    } else {
      this.softMs = 0;
    }
  }
}
