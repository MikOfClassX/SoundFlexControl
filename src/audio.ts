export const MIN_DB = -60;
export const MAX_DB = 0;

export function linearToDb(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_DB;
  return Math.max(MIN_DB, Math.min(MAX_DB, 20 * Math.log10(value)));
}

export function dbToLinear(value: number): number {
  if (!Number.isFinite(value) || value <= MIN_DB) return 0;
  return Math.min(1, 10 ** (value / 20));
}

export function meterPercent(value: number): number {
  return ((linearToDb(value) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

export function formatDb(value: number): string {
  const db = linearToDb(value);
  return db <= MIN_DB ? "−∞ dB" : `${db.toFixed(1)} dB`;
}
