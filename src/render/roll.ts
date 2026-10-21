// A number that counts up to its target instead of jumping: a gain rolls
// in over about a fifth of a second; a drop (a purchase, a lost vault) is
// shown at once, since counting down would read as still owning it.
export class Roller {
  private shown = 0;
  private last = -1;

  value(target: number, now: number): number {
    const dt = this.last < 0 ? Infinity : now - this.last;
    this.last = now;
    if (!(target > this.shown) || !Number.isFinite(dt)) {
      this.shown = target;
      return target;
    }
    this.shown += (target - this.shown) * Math.min(1, dt / 70);
    // Whole Lines: stop short of the last fraction rather than crawl.
    if (target - this.shown < Math.max(1, target * 1e-4)) this.shown = target;
    return Math.floor(this.shown);
  }
}
