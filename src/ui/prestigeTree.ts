// The prestige shop as a tree: a CROWN root in the middle, each branch a ray
// out of it, its steps one after another along the ray. The synergy chain
// is the long one and points straight down, so the short branches fan out
// above and to the sides and the view opens on them.
//
// Layout is plain numbers (tested); the DOM part draws the rays in SVG and
// the steps as buttons, inside a "world" layer the player drags and zooms.

export const CARD_W = 150;
// Room for a name of three short lines over its price.
export const CARD_H = 76;
const FIRST_RADIUS = 210;
const STEP = 112;

export interface TreeBranch { id: string; count: number }
export interface TreeNode { branch: string; index: number; x: number; y: number }

// Rays evenly round the circle; the longest branch gets straight down (90°)
// and the others follow it round, in order.
export function treeLayout(branches: readonly TreeBranch[]): TreeNode[] {
  if (branches.length === 0) return [];
  const longest = branches.reduce((a, b) => (b.count > a.count ? b : a));
  const others = branches.filter((b) => b !== longest);
  const angles = new Map<string, number>([[longest.id, Math.PI / 2]]);
  const gap = (Math.PI * 2) / branches.length;
  others.forEach((b, i) => angles.set(b.id, Math.PI / 2 + (i + 1) * gap));
  const nodes: TreeNode[] = [];
  for (const b of branches) {
    const a = angles.get(b.id)!;
    // A ray near the horizontal needs longer steps for wide cards to clear
    // one another; near the vertical, short ones do.
    const c = Math.abs(Math.cos(a));
    const sn = Math.abs(Math.sin(a));
    const step = Math.max(STEP, Math.min(c > 1e-6 ? (CARD_W + 12) / c : Infinity, sn > 1e-6 ? (CARD_H + 14) / sn : Infinity));
    for (let i = 0; i < b.count; i++) {
      const r = FIRST_RADIUS + i * step;
      nodes.push({ branch: b.id, index: i, x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
  }
  return nodes;
}

export interface TreeCard {
  branch: string;
  index: number;
  el: HTMLElement;
  owned: boolean;
  next: boolean;
}

// Pan and zoom kept across redraws (a purchase redraws the shop).
export interface TreeView { x: number; y: number; scale: number; fitted: boolean }

export function buildTree(
  branches: readonly { id: string; title: string; color: string; cards: TreeCard[] }[],
  view: TreeView,
): HTMLElement {
  const nodes = treeLayout(branches.map((b) => ({ id: b.id, count: b.cards.length })));
  const pad = CARD_W;
  const minX = Math.min(0, ...nodes.map((n) => n.x)) - pad;
  const minY = Math.min(0, ...nodes.map((n) => n.y)) - pad;
  const maxX = Math.max(0, ...nodes.map((n) => n.x)) + pad;
  const maxY = Math.max(0, ...nodes.map((n) => n.y)) + pad;
  const W = maxX - minX;
  const H = maxY - minY;
  const at = (x: number, y: number): [number, number] => [x - minX, y - minY];

  const box = document.createElement('div');
  box.className = 'ptree';
  const world = document.createElement('div');
  world.className = 'ptree-world';
  world.style.width = `${W}px`;
  world.style.height = `${H}px`;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.classList.add('ptree-lines');
  world.append(svg);

  const [rx, ry] = at(0, 0);
  for (const b of branches) {
    let px = rx;
    let py = ry;
    const bn = nodes.filter((n) => n.branch === b.id);
    b.cards.forEach((c, i) => {
      const n = bn[i]!;
      const [x, y] = at(n.x, n.y);
      const ln = document.createElementNS(svgNS, 'line');
      ln.setAttribute('x1', String(px));
      ln.setAttribute('y1', String(py));
      ln.setAttribute('x2', String(x));
      ln.setAttribute('y2', String(y));
      ln.setAttribute('stroke', b.color);
      ln.classList.add(c.owned ? 'owned' : c.next ? 'next' : 'far');
      svg.append(ln);
      c.el.style.left = `${x - CARD_W / 2}px`;
      c.el.style.top = `${y - CARD_H / 2}px`;
      c.el.style.setProperty('--branch', b.color);
      c.el.classList.toggle('next', c.next);
      world.append(c.el);
      px = x;
      py = y;
    });
    // The branch's name just past the root, along its ray.
    const first = bn[0];
    if (first) {
      const [lx, ly] = at(first.x * 0.55, first.y * 0.55);
      const label = document.createElement('div');
      label.className = 'ptree-branch';
      label.textContent = b.title;
      label.style.left = `${lx}px`;
      label.style.top = `${ly}px`;
      label.style.color = b.color;
      world.append(label);
    }
  }
  const root = document.createElement('div');
  root.className = 'ptree-root';
  root.textContent = '♛';
  root.style.left = `${rx}px`;
  root.style.top = `${ry}px`;
  world.append(root);
  box.append(world);

  const apply = (): void => { world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`; };
  // The first look fits the short branches (everything but the long ray's
  // far end) and centres the root.
  const fit = (): void => {
    const bw = box.clientWidth || 900;
    const bh = box.clientHeight || 480;
    // Readable first: the first three steps of every branch in view, the
    // rest a drag or a zoom away.
    const reach = FIRST_RADIUS + 2 * STEP + CARD_W / 2;
    view.scale = Math.max(0.55, Math.min(1, bw / (2 * reach + 40), bh / (2 * reach + 40)));
    view.x = bw / 2 - rx * view.scale;
    view.y = bh / 2 - ry * view.scale;
    view.fitted = true;
    apply();
  };
  apply();
  if (!view.fitted) requestAnimationFrame(fit);

  // Drag to pan, wheel or pinch to zoom. A drag that moved does not click.
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;
  box.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  box.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 1) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) {
        box.setPointerCapture(e.pointerId);
        view.x += dx;
        view.y += dy;
        apply();
      }
    } else if (pointers.size === 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const rect = box.getBoundingClientRect();
      zoomAt((a!.x + b!.x) / 2 - rect.left, (a!.y + b!.y) / 2 - rect.top, d / (pinch || d));
      pinch = d;
      moved = 99;
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
  });
  const up = (e: PointerEvent): void => { pointers.delete(e.pointerId); };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  box.addEventListener('click', (e) => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); } }, true);
  const zoomAt = (cx: number, cy: number, k: number): void => {
    const s = Math.max(0.3, Math.min(1.6, view.scale * k));
    const f = s / view.scale;
    view.x = cx - (cx - view.x) * f;
    view.y = cy - (cy - view.y) * f;
    view.scale = s;
    apply();
  };
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  return box;
}
