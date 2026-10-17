import type { World } from '../sim/world';
import { BUILDINGS } from '../data/buildings';
import { format, toNumber } from '../sim/num';
import { tag } from '../sim/tags';

// The STATS tab: this run beside every run, techniques, records, and two
// charts (PER SECOND through the run, and each building's share of it now).
export function statsView(world: World): HTMLElement {
  const eco = world.economy;
  const s = eco.stats;
  const career = (k: string) => eco.career(k);
  const wrap = document.createElement('div');
  wrap.className = 'stats';
  const time = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const sections: [string, [string, string, string][]][] = [
    ['RUN · ALL RUNS', [
      ['Lines earned', format(s.linesEarned), format(career('linesEarned'))],
      ['Lives', String(s.rounds), String(career('rounds'))],
      ['Top-outs', String(s.deaths), String(career('deaths'))],
      ['Checkpoints', String(s.checkpoints), String(career('checkpoints'))],
      ['Play time', time(s.playSeconds), time(career('playSeconds'))],
      ['Ascensions', '', String(eco.meta.ascensions)],
    ]],
    ['TECHNIQUES BY HAND', [
      ['T-spin single / double / triple', `${s.tss} / ${s.tsd} / ${s.tst}`, `${career('tss')} / ${career('tsd')} / ${career('tst')}`],
      ['Tetrises', String(s.tetrises), String(career('tetrises'))],
      ['Perfect clears', String(s.pcs), String(career('pcs'))],
      ['Back-to-back clears', String(s.b2bs), String(career('b2bs'))],
      ['5 / 10 combos', `${s.combo5} / ${s.combo10}`, `${career('combo5')} / ${career('combo10')}`],
      ['Golden / wrath pieces', `${s.goldens} / ${s.wraths}`, `${career('goldens')} / ${career('wraths')}`],
      ['Rivals beaten', String(s.rivalWins), String(career('rivalWins'))],
    ]],
    ['RECORDS', [
      ['Highest level', String(s.maxLevel), String(career('maxLevel'))],
      ['Longest life', `${s.maxLifeRows} rows · ${time(s.maxLifeSeconds)}`, `${career('maxLifeRows')} rows · ${time(career('maxLifeSeconds'))}`],
      ['Hardcore best', '', eco.meta.hardcoreBest.level ? `level ${eco.meta.hardcoreBest.level} · ${eco.meta.hardcoreBest.rows} rows` : '—'],
      ['Challenge best', '', eco.meta.challengeBest ? `${eco.meta.challengeBest} points` : '—'],
    ]],
  ];
  for (const [title, rows] of sections) {
    const t = document.createElement('table');
    t.className = 'stat-table';
    const head = t.createTHead().insertRow();
    for (const h of [title, 'RUN', 'ALL']) { const th = document.createElement('th'); th.textContent = h; head.append(th); }
    const body = t.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      for (const v of r) tr.insertCell().textContent = v;
    }
    wrap.append(t);
  }
  wrap.append(incomeChart(world), shareChart(world));
  return wrap;
}

const INK = { text: '#e8e8ff', dim: '#7a7aa0', grid: '#1a1a30', line: '#00f0ff', surface: '#0d0d1a' };

function chartBox(title: string): { box: HTMLElement; canvas: HTMLCanvasElement; tip: HTMLElement } {
  const box = document.createElement('div');
  box.className = 'chart';
  const h = document.createElement('div');
  h.className = 'chart-title';
  h.textContent = title;
  const canvas = document.createElement('canvas');
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  box.append(h, canvas, tip);
  return { box, canvas, tip };
}

function setup(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

// One series, so no legend: the title names it. A crosshair and tooltip
// follow the pointer.
function incomeChart(world: World): HTMLElement {
  const { box, canvas, tip } = chartBox('PER SECOND THROUGH THIS RUN (without buffs)');
  const data = [...world.samples, toNumber(world.incomePerSecond())];
  const every = world.sampleEvery;
  const W = 640, H = 180, L = 48, R = 12, T = 10, B = 24;
  const ctx = setup(canvas, W, H);
  const max = Math.max(1, ...data);
  const x = (i: number) => L + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - L - R));
  const y = (v: number) => H - B - (v / max) * (H - T - B);
  const draw = (hover: number | null) => {
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = INK.dim;
    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    for (let k = 0; k <= 3; k++) {
      const v = (max * k) / 3;
      ctx.beginPath(); ctx.moveTo(L, y(v) + 0.5); ctx.lineTo(W - R, y(v) + 0.5); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(format(v), L - 6, y(v) + 3);
    }
    ctx.textAlign = 'left';
    ctx.fillText('0', L, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(((data.length - 1) * every) / 60)} min`, W - R, H - 8);
    if (data.length < 2) {
      ctx.textAlign = 'center';
      ctx.fillText(`a point every ${every} s of play`, W / 2, H / 2);
    }
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke();
    if (hover !== null) {
      ctx.strokeStyle = INK.dim;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x(hover) + 0.5, T); ctx.lineTo(x(hover) + 0.5, H - B); ctx.stroke();
      ctx.fillStyle = INK.line;
      ctx.strokeStyle = INK.surface;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x(hover), y(data[hover]!), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  };
  draw(null);
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - L) / (W - L - R)) * (data.length - 1))));
    draw(i);
    tip.hidden = false;
    tip.textContent = `${Math.round((i * every) / 60)} min · ${format(data[i]!)}/s`;
    tip.style.left = `${(x(i) / W) * r.width}px`;
  });
  canvas.addEventListener('pointerleave', () => { draw(null); tip.hidden = true; });
  return box;
}

// Each owned building's share of PER SECOND now, one hue, largest first,
// each bar labelled with its value.
function shareChart(world: World): HTMLElement {
  const { box, canvas, tip } = chartBox("EACH BUILDING'S PER SECOND NOW");
  const rows = BUILDINGS.filter((b) => world.economy.owned(b.id) > 0).map((b) => ({
    name: b.name,
    v: b.pps * b.linesPerPiece * world.economy.incomeMultiplier([tag.board('auto'), tag.building(b.id), tag.clear(b.clearSize)]),
  })).sort((a, b) => b.v - a.v);
  const W = 640, row = 20, L = 96, R = 70;
  const H = Math.max(40, rows.length * row + 8);
  const ctx = setup(canvas, W, H);
  const max = Math.max(1e-9, ...rows.map((r) => r.v));
  const total = rows.reduce((n, r) => n + r.v, 0);
  ctx.font = '11px system-ui, sans-serif';
  if (!rows.length) {
    ctx.fillStyle = INK.dim;
    ctx.textAlign = 'center';
    ctx.fillText('no buildings yet', W / 2, H / 2 + 4);
  }
  rows.forEach((r, i) => {
    const yy = 4 + i * row;
    const w = Math.max(2, ((W - L - R) * r.v) / max);
    ctx.fillStyle = INK.text;
    ctx.textAlign = 'right';
    ctx.fillText(r.name, L - 8, yy + 13);
    ctx.fillStyle = INK.line;
    ctx.beginPath();
    // Rounded at the data end only, square on the baseline.
    ctx.roundRect(L, yy + 3, w, row - 8, [0, 4, 4, 0]);
    ctx.fill();
    ctx.fillStyle = INK.dim;
    ctx.textAlign = 'left';
    ctx.fillText(`${format(r.v)}/s`, L + w + 6, yy + 13);
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const i = Math.floor((((e.clientY - rect.top) / rect.height) * H - 4) / row);
    const r = rows[i];
    if (!r) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = `${r.name} · ${format(r.v)}/s · ${Math.round((r.v / total) * 100)}%`;
    tip.style.left = `${(L / W) * rect.width}px`;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  return box;
}
