import type { Round } from '../sim/round';
import type { BoardRenderer } from './boardRenderer';
import { format } from '../sim/num';
import { TOP_VISIBLE_ROW, WIDTH } from '../sim/board';
import { FONT, GOLD, THEME, VIEW, font as fontOf } from './theme';
import { LEVELS } from '../data/levels';
import { t } from '../ui/i18n';

// Life readout drawn on the manual board, in the hold column under the hold
// slots: vault, level with a bar to the next one, rows to the next
// checkpoint. A centred banner covers the states where the board is not
// live (waiting, paused).
export function drawRoundHud(ctx: CanvasRenderingContext2D, r: BoardRenderer, round: Round, wrath: number,
  buffs: { label: string; msLeft: number }[] = [], nextStartLevel = 1, hardcore = false, botPenaltyPct = 0): void {
  const c = r.layout.cell;
  const colW = r.layout.leftCells * c;
  const x0 = 6;
  // Larger text takes more room down the column, and shrinks back to fit
  // across it: the column is only five cells wide.
  const s = VIEW.textScale;
  const font = (px: number, text: string, weight = ''): void => {
    let size = Math.round(px * s);
    ctx.font = `${weight} ${size}px ${FONT}`;
    const w = ctx.measureText(text).width;
    if (w > colW - x0 * 2) {
      size = Math.floor((size * (colW - x0 * 2)) / w);
      ctx.font = `${weight} ${size}px ${FONT}`;
    }
  };
  let y = r.cellY(TOP_VISIBLE_ROW + 8);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const label = (text: string): void => {
    ctx.fillStyle = THEME.dim;
    font(c * 0.38, text);
    ctx.fillText(text, x0, y);
    y += c * 0.55 * s;
  };
  if (hardcore) {
    ctx.fillStyle = '#ff3b3b';
    font(c * 0.42, t('HARDCORE'), '800');
    ctx.fillText(t('HARDCORE'), x0, y - c * 0.8 * s);
  }
  label(t('VAULT'));
  ctx.fillStyle = THEME.text;
  font(c * 0.7, format(round.vault), '700');
  ctx.fillText(format(round.vault), x0, y);
  y += c * 1.0 * s;
  label(round.active ? t('CHECKPOINT IN {n}', { n: round.rowsToCheckpoint }) : t('CHECKPOINT EVERY {n}', { n: LEVELS.checkpointRows }));
  y += c * 0.15 * s;
  label(wrath > 0 ? t('LEVEL · WRATH {w}', { w: 'I'.repeat(wrath) }) : t('LEVEL'));
  // Level and the bar to the next one; the colour warms as levels climb.
  const level = round.active ? round.level : nextStartLevel;
  const color = level < 5 ? '#00f0ff' : level < 10 ? '#ff2ed2' : '#ff3b3b';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  font(c * 0.7, `${level}  ×${level}`, '700');
  ctx.fillText(`${level}  ×${level}`, x0, y);
  ctx.shadowBlur = 0;
  y += c * 0.85 * s;
  const w = colW - x0 * 2;
  const h = c * 0.3;
  const k = round.active ? (round.rows % round.rowsPerLevel) / round.rowsPerLevel : 0;
  ctx.fillStyle = THEME.boxHead;
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y, w * k, h);
  y += h + c * 0.4;
  // Garbage left on the board slows the bots.
  if (botPenaltyPct > 0) {
    ctx.fillStyle = '#ff4d5e';
    const text = t('BOTS −{n}%', { n: botPenaltyPct });
    font(c * 0.42, text, '800');
    ctx.fillText(text, x0, y);
  }
  // Running buffs, under the multiplier they stack with.
  y += c * 1.0;
  for (const b of buffs) {
    ctx.fillStyle = GOLD;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 8;
    font(c * 0.36, t(b.label), '700');
    ctx.fillText(t(b.label), x0, y);
    ctx.shadowBlur = 0;
    y += c * 0.5 * s;
    ctx.fillStyle = THEME.text;
    font(c * 0.36, `${Math.ceil(b.msLeft / 1000)}s`);
    ctx.fillText(`${Math.ceil(b.msLeft / 1000)}s`, x0, y);
    y += c * 0.65 * s;
  }

  const banner = bannerText(round);
  if (banner) {
    const cx = r.cellX(0) + (WIDTH * c) / 2;
    const cy = r.cellY(TOP_VISIBLE_ROW + 9);
    ctx.fillStyle = '#090b10e0';
    ctx.fillRect(r.cellX(0), cy - c * 1.4, WIDTH * c, c * 2.8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = banner.color;
    ctx.shadowColor = banner.color;
    ctx.shadowBlur = 14;
    ctx.font = fontOf(800, c * 0.9 * VIEW.textScale);
    ctx.fillText(banner.big, cx, cy - c * 0.25);
    ctx.shadowBlur = 0;
    if (banner.small) {
      ctx.fillStyle = THEME.dim;
      ctx.font = fontOf(700, c * 0.4 * VIEW.textScale);
      ctx.fillText(banner.small, cx, cy + c * 0.7);
    }
  }
  ctx.restore();
}

function bannerText(round: Round): { big: string; small?: string; color: string } | null {
  if (!round.active) return { big: t('READY'), small: t('ANY KEY'), color: '#00f0ff' };
  if (round.paused) return { big: t('PAUSED'), small: t('ANY KEY'), color: '#ffe600' };
  return null;
}
