/**
 * Deterministic execution-rate formula shared by the dashboard aggregate
 * and the per-operation seed value: paid / planned, clamped to [0, 100],
 * rounded to 2 decimals. Returns 0 when planned is 0/absent so the KPI
 * never divides by zero — but does NOT special-case a non-zero paid amount,
 * so a real 0% only occurs when nothing has actually been paid.
 */
export function computeExecutionRatePercent(paidAmount: number, plannedAmount: number): number {
  if (!Number.isFinite(plannedAmount) || plannedAmount <= 0) return 0;
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) return 0;
  const rate = (paidAmount / plannedAmount) * 100;
  return Math.round(Math.min(100, rate) * 100) / 100;
}
