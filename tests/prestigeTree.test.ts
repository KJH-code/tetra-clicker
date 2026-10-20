import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, treeLayout } from '../src/ui/prestigeTree';

describe('prestige tree layout', () => {
  it('the long branch points down; no two steps overlap and none sits on the root', () => {
    const branches = [
      { id: 'production', count: 5 }, { id: 'survival', count: 5 }, { id: 'proportion', count: 5 },
      { id: 'mission', count: 5 }, { id: 'event', count: 5 }, { id: 'elder', count: 5 }, { id: 'synergy', count: 14 },
    ];
    const nodes = treeLayout(branches);
    expect(nodes).toHaveLength(44);
    const syn = nodes.filter((n) => n.branch === 'synergy');
    expect(syn.every((n) => Math.abs(n.x) < 1e-6 && n.y > 0)).toBe(true);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      expect(Math.abs(a.x) > CARD_W / 2 + 20 || Math.abs(a.y) > CARD_H / 2 + 20).toBe(true);
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!;
        expect(Math.abs(a.x - b.x) >= CARD_W || Math.abs(a.y - b.y) >= CARD_H).toBe(true);
      }
    }
  });
});
