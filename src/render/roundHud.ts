import type { Round } from '../sim/round';
import type { BoardRenderer } from './boardRenderer';
import { format } from '../sim/num';
import { TOP_VISIBLE_ROW, WIDTH } from '../sim/board';

// Round readout drawn on the manual board: vault and a danger gauge in the
// hold column under the hold slots, and a centred banner for the states
// where the board is not live (waiting, paused, settling).
const DANGER_FULL = 3; // the gauge reads full at this much danger

export function drawRoundHud(ctx: CanvasRenderingContext2D, r: BoardRenderer, round: Round, wrath: number): void {
  const c = r.layout.cell;
  const colW = r.layout.leftCells * c;
  const x0 = 6;
  let y = r.cellY(TOP_VISIBLE_ROW + 8);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#7a7aa0';
  ctx.font = `${Math.round(c * 0.38)}px system-ui, sans-serif`;
  ctx.fillText('VAULT', x0, y);
  y += c * 0.55;
  ctx.fillStyle = '#e8e8ff';
  ctx.font = `700 ${Math.round(c * 0.7)}px system-ui, sans-serif`;
  ctx.fillText(format(round.vault), x0, y);
  y += c * 1.3;
  ctx.fillStyle = '#7a7aa0';
  ctx.font = `${Math.round(c * 0.38)}px system-ui, sans-serif`;
  ctx.fillText(`DANGER ${'I'.repeat(wrath) || '0'}`, x0, y);
  y += c * 0.55;
  // Gauge: fills with danger, shifting from cyan to magenta to red.
  const w = colW - x0 * 2;
  const h = c * 0.45;
  const k = Math.min(1, round.danger / DANGER_FULL);
  ctx.fillStyle = '#15152a';
  ctx.fillRect(x0, y, w, h);
  const color = k < 0.34 ? '#00f0ff' : k < 0.67 ? '#ff2ed2' : '#ff3b3b';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillRect(x0, y, w * k, h);
  ctx.shadowBlur = 0;
  y += h + 4;
  ctx.fillStyle = '#e8e8ff';
  ctx.font = `700 ${Math.round(c * 0.5)}px system-ui, sans-serif`;
  ctx.fillText(`×${(1 + round.danger).toFixed(2)}`, x0, y);

  const banner = bannerText(round);
  if (banner) {
    const cx = r.cellX(0) + (WIDTH * c) / 2;
    const cy = r.cellY(TOP_VISIBLE_ROW + 9);
    ctx.fillStyle = '#06060dcc';
    ctx.fillRect(r.cellX(0), cy - c * 1.4, WIDTH * c, c * 2.8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = banner.color;
    ctx.shadowColor = banner.color;
    ctx.shadowBlur = 14;
    ctx.font = `700 ${Math.round(c * 0.9)}px system-ui, sans-serif`;
    ctx.fillText(banner.big, cx, cy - c * 0.25);
    ctx.shadowBlur = 0;
    if (banner.small) {
      ctx.fillStyle = '#7a7aa0';
      ctx.font = `${Math.round(c * 0.4)}px system-ui, sans-serif`;
      ctx.fillText(banner.small, cx, cy + c * 0.7);
    }
  }
  ctx.restore();
}

function bannerText(round: Round): { big: string; small?: string; color: string } | null {
  if (!round.active) return { big: 'READY', small: 'ANY KEY', color: '#00f0ff' };
  if (round.paused) return { big: 'PAUSED', small: 'ANY KEY', color: '#ffe600' };
  if (round.phase === 'settling') return { big: `SETTLE ${Math.max(0, round.settleMs / 1000).toFixed(1)}`, color: '#39ff14' };
  return null;
}
