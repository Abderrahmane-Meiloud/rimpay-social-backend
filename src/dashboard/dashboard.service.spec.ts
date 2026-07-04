import { computeExecutionRatePercent } from './execution-rate';

describe('computeExecutionRatePercent', () => {
  it('returns 0 when planned amount is 0', () => {
    expect(computeExecutionRatePercent(150_000, 0)).toBe(0);
  });

  it('returns 0 when planned amount is negative or non-finite', () => {
    expect(computeExecutionRatePercent(150_000, -1)).toBe(0);
    expect(computeExecutionRatePercent(150_000, NaN)).toBe(0);
  });

  it('returns 0 when paid amount is 0, even with a positive planned amount', () => {
    expect(computeExecutionRatePercent(0, 5_000_000)).toBe(0);
  });

  it('computes the paid/planned ratio as a percentage, rounded to 2 decimals', () => {
    expect(computeExecutionRatePercent(1_924_000, 5_200_000)).toBeCloseTo(37, 0);
    expect(computeExecutionRatePercent(2_100_000, 2_100_000)).toBe(100);
  });

  it('never returns 0% when a positive paid amount exists against a positive planned amount', () => {
    expect(computeExecutionRatePercent(1_000, 1_000_000)).toBeGreaterThan(0);
  });

  it('clamps the ratio at 100 even if paid exceeds planned', () => {
    expect(computeExecutionRatePercent(6_000_000, 4_500_000)).toBe(100);
  });
});
