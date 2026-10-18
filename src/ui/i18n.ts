import { KO, KO_PATTERNS, isTechnical } from './ko';

// Screen text in English or Korean. The English text is the key, so data
// files and the code stay readable in one language and a string without a
// Korean entry still shows, in English. Templated names (FIRST <building>,
// "<building> ×2 (n owned)") match patterns instead of one entry each.
export type Lang = 'en' | 'ko';
export type LanguageChoice = 'auto' | Lang;

let current: Lang = 'en';

export const language = (): Lang => current;
export function setLanguage(l: Lang): void { current = l; }

// AUTO follows the browser's first preferred language.
export function resolveLanguage(choice: LanguageChoice, preferred: readonly string[]): Lang {
  if (choice !== 'auto') return choice;
  return preferred[0]?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const s = current === 'ko' ? translate(text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export function translate(text: string): string {
  const hit = KO[text];
  if (hit !== undefined) return hit;
  for (const [re, out] of KO_PATTERNS) if (re.test(text)) return text.replace(re, out);
  // "NAME: what it does" names: each half on its own.
  const colon = text.indexOf(': ');
  if (colon > 0) return `${translate(text.slice(0, colon))}: ${translate(text.slice(colon + 2))}`;
  return text;
}

// Has a Korean form, or needs none (technical terms and names only).
export function covered(text: string): boolean {
  if (KO[text] !== undefined || KO_PATTERNS.some(([re]) => re.test(text))) return true;
  const colon = text.indexOf(': ');
  if (colon > 0) return covered(text.slice(0, colon)) && covered(text.slice(colon + 2));
  return isTechnical(text.replace(/\{\w+\}/g, '0'));
}
