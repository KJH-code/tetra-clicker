import { WIDTH } from '../sim/board';
import type { BoardRenderer } from './boardRenderer';
import { THEME, VIEW, font } from './theme';

interface RowFlash { row: number; t: number; dur: number }
interface Floater { text: string; x: number; y: number; t: number; dur: number; color: string; size: number }

// Clear-time spectacle: rows flash white and fade, the board shakes in
// proportion to the clear, and the amount earned drifts up and dissolves.
export class Fx {
  private flashes: RowFlash[] = [];
  private floaters: Floater[] = [];
  private shake = { amp: 0, t: 0, dur: 0 };

  rowClear(rows: number[]): void {
    // Reduced motion: no flash.
    if (VIEW.reduceMotion) return;
    for (const row of rows) this.flashes.push({ row, t: 0, dur: 260 });
  }

  shakeBoard(strength: number): void {
    if (VIEW.reduceMotion) return;
    this.shake = { amp: Math.min(10, 2 + strength * 2), t: 0, dur: 180 + strength * 40 };
  }

  float(text: string, x: number, y: number, opts: { color?: string; size?: number; dur?: number } = {}): void {
    this.floaters.push({ text, x, y, t: 0, dur: opts.dur ?? 900, color: opts.color ?? THEME.text, size: (opts.size ?? 16) * VIEW.textScale });
  }

  update(dt: number): void {
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.dur);
    if (this.shake.t < this.shake.dur) this.shake.t += dt;
  }

  shakeOffset(): { x: number; y: number } {
    const s = this.shake;
    if (s.t >= s.dur) return { x: 0, y: 0 };
    const k = 1 - s.t / s.dur;
    return { x: (Math.random() * 2 - 1) * s.amp * k, y: (Math.random() * 2 - 1) * s.amp * k };
  }

  drawRowFlashes(ctx: CanvasRenderingContext2D, r: BoardRenderer): void {
    for (const f of this.flashes) {
      const k = 1 - f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = THEME.flash;
      ctx.shadowColor = THEME.flash;
      ctx.shadowBlur = 20 * k;
      ctx.fillRect(r.cellX(0), r.cellY(f.row), WIDTH * r.layout.cell, r.layout.cell);
      ctx.restore();
    }
  }

  drawFloaters(ctx: CanvasRenderingContext2D): void {
    for (const f of this.floaters) {
      const k = f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.font = font(800, f.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y - k * 40);
      ctx.restore();
    }
  }
}
