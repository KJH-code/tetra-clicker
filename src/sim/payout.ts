// Lines are paid in whole numbers. Multipliers still produce fractions, so
// each payout is rounded down and the remainder carried into the next one:
// nothing is lost or invented, and over time income matches the exact sum.
export class Payout {
  constructor(public carry = 0) {}

  take(amount: number): number {
    const total = this.carry + amount;
    // A hair of tolerance so 0.7 + 0.3 pays 1 rather than 0.9999…
    const whole = Math.floor(total + 1e-9);
    this.carry = Math.max(0, total - whole);
    return whole;
  }
}
