import { describe, expect, test, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { covered, resolveLanguage, setLanguage, t, translate } from '../src/ui/i18n';
import { KO } from '../src/ui/ko';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { PRESTIGE_UPGRADES, TECH_CHECKS } from '../src/data/prestige';
import { UPGRADES } from '../src/data/upgrades';
import { CHALLENGE_RULES } from '../src/data/challenges';
import { BUFFS } from '../src/data/golden';
import { ACTION_LABELS } from '../src/data/handling';
import { TUTORIAL } from '../src/ui/tutorial';
import { BRANCHES } from '../src/ui/ascend';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// Every literal handed to t() in the source, both sides of a ternary
// included, and the page's own labels that main.ts passes through it.
function literalKeys(): string[] {
  const keys: string[] = [];
  for (const f of [...files('src/ui'), ...files('src/render'), 'src/main.ts']) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:t|tr)\(/g)) {
      // The first argument: up to the comma or bracket that closes it.
      let depth = 0, i = m.index + m[0].length, quote = '';
      const start = i;
      for (; i < src.length; i++) {
        const c = src[i]!;
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === "'" || c === '"' || c === '`') quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) { if (depth-- === 0) break; }
        else if (c === ',' && depth === 0) break;
      }
      // Literals compared against (palette === 'cvd') are not shown.
      for (const q of src.slice(start, i).replace(/[=!]==\s*(['"])(?:(?!\1).)*\1/g, '').matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) keys.push((q[1] ?? q[2]!).replace(/\\'/g, "'"));
    }
  }
  const html = readFileSync('index.html', 'utf8');
  for (const m of html.matchAll(/data-(?:tab="\w+"|action="hardDrop")[^>]*>([^<]+)</g)) keys.push(m[1]!);
  return keys;
}

// Names and descriptions the screens show from data.
function dataStrings(): string[] {
  return [
    ...ACHIEVEMENTS.flatMap((a) => [a.name, a.desc]),
    ...PRESTIGE_UPGRADES.map((p) => p.name),
    ...TECH_CHECKS.map((c) => c.label),
    ...UPGRADES.flatMap((u) => [u.name, u.label]),
    ...CHALLENGE_RULES.flatMap((r) => [r.name, ...r.steps.map((s) => s.label)]),
    ...Object.values(BUFFS).map((b) => b.label),
    ...Object.values(ACTION_LABELS),
    ...TUTORIAL.map((s) => s.text),
    ...BRANCHES.map((b) => b.title),
  ];
}

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  test('every string t() is given has a Korean form or is technical only', () => {
    const keys = literalKeys();
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((k) => !covered(k))).toEqual([]);
  });

  test('every data name and description has a Korean form or is technical only', () => {
    expect(dataStrings().filter((s) => !covered(s))).toEqual([]);
  });

  test('a Korean entry keeps the placeholders of its English key', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [en, ko] of Object.entries(KO)) expect(vars(ko), en).toEqual(vars(en));
  });

  test('no dictionary entry goes unused', () => {
    const used = new Set([...literalKeys(), ...dataStrings(), ...dataStrings().flatMap((s) => s.split(': '))]);
    expect(Object.keys(KO).filter((k) => !used.has(k))).toEqual([]);
  });

  test('templated names translate through patterns', () => {
    expect(translate('FIRST RIVAL')).toBe('첫 RIVAL');
    expect(translate('50 4-WIDE')).toBe('4-WIDE 50개');
    expect(translate('T-SPIN ×2 (25 owned)')).toBe('T-SPIN ×2 (25개 보유)');
    expect(translate('WRATH II: level up every 8 rows')).toBe('WRATH II: 8줄마다 레벨업');
    expect(translate('SINGLE + DOUBLE: +1% each per copy of the other')).toBe('SINGLE + DOUBLE: 상대 1개당 서로 +1%');
  });

  test('English passes through; Korean fills placeholders', () => {
    expect(t('CHECKPOINT IN {n}', { n: 12 })).toBe('CHECKPOINT IN 12');
    setLanguage('ko');
    expect(t('CHECKPOINT IN {n}', { n: 12 })).toBe('체크포인트까지 12');
    expect(t('T-SPIN DOUBLE')).toBe('T-SPIN DOUBLE');
  });

  test('AUTO follows the browser', () => {
    expect(resolveLanguage('auto', ['ko-KR', 'en'])).toBe('ko');
    expect(resolveLanguage('auto', ['en-US', 'ko'])).toBe('en');
    expect(resolveLanguage('auto', [])).toBe('en');
    expect(resolveLanguage('ko', ['en-US'])).toBe('ko');
  });
});
