// Text that must stay inside its box whatever the language: Korean runs
// wider than the English it replaces. Shrinks the element's font a step at
// a time until it fits its width (and its height, for a box that wraps;
// a single line is not height-checked, as the bitmap font's glyphs stand a
// pixel above their line box), never below `min` px. A later call starts
// again from the stylesheet's size.
export function fitText(el: HTMLElement, min = 9, wraps = false): void {
  el.style.fontSize = '';
  // Not laid out (a hidden tab, behind the title): nothing to fit to yet.
  if (el.clientWidth === 0) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  const over = (): boolean => el.scrollWidth > el.clientWidth + 1 || (wraps && el.scrollHeight > el.clientHeight + 1);
  while (size > min && over()) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}
