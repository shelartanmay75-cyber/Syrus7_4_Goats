// Shared number formatting. Every money or percent value in the UI goes through these helpers.
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** ₹10,00,000 (Indian digit grouping). Returns "—" for missing or non-finite values. */
export const formatINR = (x: number | null | undefined) => (isNum(x) ? inr0.format(x) : '—');

/** ₹10 lakh / ₹1.2 crore, for headline amounts and presets. */
export function formatINRCompact(x: number | null | undefined): string {
  if (!isNum(x)) return '—';
  if (Math.abs(x) >= 1e7) return `₹${+(x / 1e7).toFixed(2)} crore`;
  if (Math.abs(x) >= 1e5) return `₹${+(x / 1e5).toFixed(2)} lakh`;
  return inr0.format(x);
}

/** 0.142 -> "14.2%". Pass sign: true to get "+14.2%" or "−14.2%" (true minus sign). */
export function formatPct(x: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (!isNum(x)) return '—';
  const { digits = 1, sign = false } = opts;
  const v = Math.abs(x * 100).toFixed(digits);
  if (!sign) return `${x < 0 ? '−' : ''}${v}%`;
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${v}%`;
}

export const formatInt = (x: number | null | undefined) => (isNum(x) ? int.format(x) : '—');

/** Gain/loss helper: tone + arrow, so colour is never the only signal. */
export const trend = (x: number | null | undefined) =>
  !isNum(x) || x === 0 ? { tone: 'text-text', arrow: '' } : x > 0 ? { tone: 'text-gain', arrow: '▲' } : { tone: 'text-loss', arrow: '▼' };
