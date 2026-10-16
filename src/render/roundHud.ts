import type { Round } from '../sim/round';
import type { BoardRenderer } from './boardRenderer';
import { format } from '../sim/num';
import { TOP_VISIBLE_ROW, WIDTH } from '../sim/board';
import { GOLD } from './theme';

// Life readout drawn on the manual board, in the hold column under the hold
// slots: vault, level with a bar to the next one, rows to the next
// checkpoint. A centred banner covers the states where the board is not
// live (waiting, paused).
export function drawRoundHud(ctx: CanvasRenderingContext2D, r: BoardRenderer, round: Round, wrath: number,
  buffs: { label: string; msLeft: number }[] = []): void {
  const c = r.layout.cell;
  const colW = r.layout.leftCells * c;
  const x0 = 6;
  let y = r.cellY(TOP_VISIBLE_ROW + 8);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const label = (text: string): void => {
    ctx.fillStyle = '#7a7aa0';
    ctx.font = `${Math.round(c * 0.38)}px system-ui, sans-serif`;
    ctx.fillText(text, x0, y);
    y += c * 0.55;
  };
  label('VAULT');
  ctx.fillStyle = '#e8e8ff';
  ctx.font = `700 ${Math.round(c * 0.7)}px system-ui, sans-serif`;
  ctx.fillText(format(round.vault), x0, y);
  y += c * 1.0;
  label(round.active ? `CHECKPOINT IN ${round.rowsToCheckpoint}` : 'CHECKPOINT EVERY 40');
  y += c * 0.15;
  label(wrath > 0 ? `LEVEL · WRATH ${'I'.repeat(wrath)}` : 'LEVEL');
  // Level and the bar to the next one; the colour warms as levels climb.
  const level = round.active ? round.level : round.startLevel;
  const color = level < 5 ? '#00f0ff' : level < 10 ? '#ff2ed2' : '#ff3b3b';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.font = `700 ${Math.round(c * 0.7)}px system-ui, sans-serif`;
  ctx.fillText(`${level}  ×${level}`, x0, y);
  ctx.shadowBlur = 0;
  y += c * 0.85;
  const w = colW - x0 * 2;
  const h = c * 0.3;
  const k = round.active ? (round.rows % round.rowsPerLevel) / round.rowsPerLevel : 0;
  ctx.fillStyle = '#15152a';
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y, w * k, h);
  y += h + c * 0.4;
  // Running buffs, under the multiplier they stack with.
  y += c * 1.0;
  for (const b of buffs) {
    ctx.fillStyle = GOLD;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 8;
    ctx.font = `700 ${Math.round(c * 0.36)}px system-ui, sans-serif`;
    ctx.fillText(b.label, x0, y);
    ctx.shadowBlur = 0;
    y += c * 0.5;
    ctx.fillStyle = '#e8e8ff';
    ctx.font = `${Math.round(c * 0.36)}px system-ui, sans-serif`;
    ctx.fillText(`${Math.ceil(b.msLeft / 1000)}s`, x0, y);
    y += c * 0.65;
  }

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
  return null;
}
