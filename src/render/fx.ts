import { HEIGHT, WIDTH } from '../sim/board';
import type { BoardRenderer } from './boardRenderer';
import { THEME, VIEW, font } from './theme';
import { hitStopMs } from './hit';

interface RowFlash { row: number; t: number; dur: number; color: string }
interface Floater { text: string; x: number; y: number; t: number; dur: number; color: string; size: number; maxWidth?: number; pop?: boolean }
interface Shard { x: number; y: number; vx: number; vy: number; rot: number; spin: number; size: number; t: number; dur: number; color: string }

const SHARD_GRAVITY = 1400; // px/s²
const MAX_SHARDS = 400;

// Clear-time spectacle: rows flash white and fade, the board shakes in
// proportion to the clear, and the amount earned drifts up and dissolves.
// A big clear also freezes the board for a beat (hit-stop), bursts the
// cleared rows into shards and stamps its name across the well.
export class Fx {
  private flashes: RowFlash[] = [];
  private floaters: Floater[] = [];
  private shards: Shard[] = [];
  private shake = { amp: 0, t: 0, dur: 0 };
  // Rising garbage shoves the stack up; this springs it back down.
  private kick = { px: 0, t: 0, dur: 0 };
  private stopMs = 0;
  private boardFlash = { a: 0, color: THEME.flash };

  // Full spectacle unless the player turned hit effects off; less motion
  // keeps the colour and drops the movement.
  private get hits(): boolean { return VIEW.hitEffects; }
  private get motion(): boolean { return VIEW.hitEffects && !VIEW.reduceMotion; }

  rowClear(rows: number[], color: string = THEME.flash): void {
    // Reduced motion: no flash.
    if (VIEW.reduceMotion) return;
    for (const row of rows) this.flashes.push({ row, t: 0, dur: 260, color });
  }

  shakeBoard(strength: number): void {
    if (VIEW.reduceMotion) return;
    this.shake = { amp: Math.min(10, 2 + strength * 2), t: 0, dur: 180 + strength * 40 };
  }

  // A clear of `strength` 0..8 (see hitStrength).
  hit(strength: number): void {
    if (!this.hits) { this.shakeBoard(Math.max(1, strength)); return; }
    if (strength >= 3) this.boardFlash = { a: Math.min(0.35, 0.05 * strength), color: THEME.flash };
    if (!this.motion) return;
    this.shake = { amp: Math.min(14, 1.5 + strength * 1.6), t: 0, dur: 140 + strength * 45 };
    this.stopMs = Math.max(this.stopMs, hitStopMs(strength));
  }

  // Burst the cleared rows into shards of `color`, more the harder the hit.
  shatter(r: BoardRenderer, rows: number[], color: string, strength: number): void {
    if (!this.motion || strength < 1) return;
    const c = r.layout.cell;
    const per = Math.min(3, 1 + Math.floor(strength / 3));
    const power = 1 + strength / 4;
    for (const row of rows) {
      for (let x = 0; x < WIDTH; x++) {
        for (let k = 0; k < per; k++) {
          if (this.shards.length >= MAX_SHARDS) return;
          const fromCentre = (x - 4.5) / 4.5;
          this.shards.push({
            x: r.cellX(x) + c * Math.random(), y: r.cellY(row) + c * Math.random(),
            vx: (fromCentre * 160 + (Math.random() * 2 - 1) * 120) * power,
            vy: -(120 + Math.random() * 320) * power,
            rot: Math.random() * Math.PI, spin: (Math.random() * 2 - 1) * 14,
            size: c * (0.25 + Math.random() * 0.3), t: 0, dur: 550 + Math.random() * 450,
            color: Math.random() < 0.25 ? THEME.flash : color,
          });
        }
      }
    }
  }

  // Garbage rose by `rows`: the stack jolts up and the floor flashes red.
  rise(r: BoardRenderer, rows: number): void {
    if (!this.hits) { this.shakeBoard(1); return; }
    for (let i = 0; i < Math.min(rows, 4); i++) this.flashes.push({ row: HEIGHT - 1 - i, t: 0, dur: 320, color: '#ff4d5e' });
    if (!this.motion) return;
    this.kick = { px: Math.min(4, rows) * r.layout.cell * 0.35, t: 0, dur: 220 };
    this.shake = { amp: Math.max(this.shake.amp * (1 - this.shake.t / Math.max(1, this.shake.dur)), 2 + rows), t: 0, dur: 160 };
  }

  // `maxWidth` shrinks the text to fit (a bot board is narrow, larger text more so).
  float(text: string, x: number, y: number, opts: { color?: string; size?: number; dur?: number; maxWidth?: number } = {}): void {
    this.floaters.push({ text, x, y, t: 0, dur: opts.dur ?? 900, color: opts.color ?? THEME.text, size: (opts.size ?? 16) * VIEW.textScale, ...(opts.maxWidth ? { maxWidth: opts.maxWidth } : {}) });
  }

  // A technique's name stamped across the well: it lands big and settles,
  // holds, then fades without drifting.
  popup(text: string, x: number, y: number, opts: { color?: string; size?: number; dur?: number; maxWidth?: number } = {}): void {
    if (!this.hits) { this.float(text, x, y, { ...opts, size: Math.min(16, opts.size ?? 16) }); return; }
    this.floaters.push({ text, x, y, t: 0, dur: opts.dur ?? 1200, color: opts.color ?? THEME.text, size: (opts.size ?? 24) * VIEW.textScale, pop: true, ...(opts.maxWidth ? { maxWidth: opts.maxWidth } : {}) });
  }

  update(dt: number): void {
    // Hit-stop: the board holds still, flash at full, then everything resumes.
    if (this.stopMs > 0) {
      this.stopMs -= dt;
      return;
    }
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.dur);
    const s = dt / 1000;
    for (const p of this.shards) {
      p.t += dt;
      p.vy += SHARD_GRAVITY * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.spin * s;
    }
    this.shards = this.shards.filter((p) => p.t < p.dur);
    if (this.shake.t < this.shake.dur) this.shake.t += dt;
    if (this.kick.t < this.kick.dur) this.kick.t += dt;
    this.boardFlash.a = Math.max(0, this.boardFlash.a - dt / 600);
  }

  shakeOffset(): { x: number; y: number } {
    const s = this.shake;
    let x = 0;
    let y = 0;
    if (s.t < s.dur) {
      const k = 1 - s.t / s.dur;
      x = (Math.random() * 2 - 1) * s.amp * k;
      y = (Math.random() * 2 - 1) * s.amp * k;
    }
    const kk = this.kick;
    if (kk.t < kk.dur) y -= kk.px * (1 - kk.t / kk.dur) ** 2;
    return { x, y };
  }

  drawRowFlashes(ctx: CanvasRenderingContext2D, r: BoardRenderer): void {
    for (const f of this.flashes) {
      const k = 1 - f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 20 * k;
      ctx.fillRect(r.cellX(0), r.cellY(f.row), WIDTH * r.layout.cell, r.layout.cell);
      ctx.restore();
    }
    if (this.boardFlash.a > 0) {
      ctx.save();
      ctx.globalAlpha = this.boardFlash.a;
      ctx.fillStyle = this.boardFlash.color;
      ctx.fillRect(r.cellX(0), 0, WIDTH * r.layout.cell, r.height);
      ctx.restore();
    }
    for (const p of this.shards) {
      const k = p.t / p.dur;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  drawFloaters(ctx: CanvasRenderingContext2D): void {
    for (const f of this.floaters) {
      const k = f.t / f.dur;
      ctx.save();
      // A popup lands at 1.6× and settles in 120 ms; a float drifts up.
      const scale = f.pop ? 1 + 0.6 * Math.max(0, 1 - f.t / 120) ** 2 : 1;
      ctx.globalAlpha = f.pop ? (k < 0.7 ? 1 : 1 - ((k - 0.7) / 0.3) ** 2) : 1 - k * k;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = f.pop ? 18 : 12;
      let size = f.size;
      ctx.font = font(800, size);
      if (f.maxWidth) {
        const w = ctx.measureText(f.text).width;
        if (w > f.maxWidth) size = Math.max(6, (f.size * f.maxWidth) / w);
      }
      ctx.font = font(800, size * scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.pop ? f.y : f.y - k * 40);
      ctx.restore();
    }
  }
}
