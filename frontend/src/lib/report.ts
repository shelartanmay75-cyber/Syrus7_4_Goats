// Portfolio Report maths, all in one place. Pure functions over a RunResult: no DOM, no network.
// Returns and volatility are annualised decimals (0.12 = 12%). "Log return" means the annualised mean of daily log returns (x252)
// from the estimation window, the same mu the optimiser uses. Nothing here looks at test-window prices except the backtest helpers.
import type { Candle, RunResult, SolverResult } from '../api/types';
import { isNum } from './format';

export const RF = 0.0557;
export const C_BUY = 0.001187;
export const HORIZONS = [1, 3, 6, 12, 24] as const;
/** Documented assumption of the scenario engine: a stock moves by beta x market move, plus this company-specific part. */
export const IDIOSYNCRATIC = 0;

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const symbol = (t: string) => t.replace(/\.NS$/, '');

// ---- Holdings ---------------------------------------------------------------------------------------------------------

export interface Holding {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  /** Equal weight 1/K: what the optimiser and the backtest use. */
  weight: number;
  mu: number | null; // estimated annual log return of the stock
  vol: number | null; // estimated annual volatility of the stock
  beta: number | null; // to the equal-weight market of the requested universe
  contribution: number | null; // weight x mu
}

/** The portfolio the report is about: the recommended method's, when it is a valid one with an allocation. */
export const reportSolver = (r: RunResult): SolverResult | null =>
  r.solvers.find((s) => s.solver === r.recommended && s.feasible && s.selection && s.portfolio) ?? null;

export function holdings(r: RunResult, s: SolverResult): Holding[] {
  const stat = new Map((r.assets ?? []).map((a) => [a.ticker, a]));
  const rows = s.portfolio?.rows ?? [];
  return rows.map((row) => {
    const a = stat.get(row.ticker);
    const weight = 1 / rows.length;
    return {
      ticker: row.ticker, symbol: row.symbol ?? symbol(row.ticker), name: row.name, sector: row.sector, weight,
      mu: a?.exp_return ?? null, vol: a?.volatility ?? null, beta: r.betas?.[row.ticker] ?? null,
      contribution: a ? weight * a.exp_return : null,
    };
  });
}

/** Expected annual log return of the portfolio = sum of weight x mu. The solver reports the same number (Problem.evaluate). */
export const portfolioLogReturn = (s: SolverResult, h: Holding[]): number | null =>
  isNum(s.exp_return) ? s.exp_return : h.every((x) => x.contribution !== null) ? sum(h.map((x) => x.contribution as number)) : null;

// ---- Expected return, projection, Sharpe -------------------------------------------------------------------------------

/** A log return of m per year compounds to exp(m x months/12) - 1 over `months`. */
export const growth = (logRet: number, months: number) => Math.exp((logRet * months) / 12) - 1;
/** Estimated annual return as a plain percentage: exp(mu) - 1. */
export const simpleAnnual = (logRet: number) => growth(logRet, 12);
export const projectedPL = (capital: number, logRet: number, months: number) => capital * growth(logRet, months);
/** Sharpe = (simple expected return - risk-free rate) / volatility. */
export const sharpe = (logRet: number, vol: number): number | null => (vol > 0 ? (simpleAnnual(logRet) - RF) / vol : null);
/** One-standard-deviation range of the growth over `months`: log return x t +/- vol x sqrt(t), with t in years. */
export function growthRange(logRet: number, vol: number, months: number): [number, number] {
  const t = months / 12, sd = vol * Math.sqrt(t);
  return [Math.exp(logRet * t - sd) - 1, Math.exp(logRet * t + sd) - 1];
}

// ---- Concentration and risk contribution -------------------------------------------------------------------------------

export function concentration(h: Holding[]) {
  const bySector = new Map<string, number>();
  h.forEach((x) => bySector.set(x.sector, (bySector.get(x.sector) ?? 0) + x.weight));
  return {
    sectors: [...bySector].map(([sector, weight]) => ({ sector, weight })).sort((a, b) => b.weight - a.weight),
    /** Effective number of stocks = 1 / sum(w^2): K for equal weights. */
    effectiveN: 1 / sum(h.map((x) => x.weight ** 2)),
  };
}

/** Risk contribution of each holding: RC_i = w_i (Sigma w)_i / sigma_p; share_i = RC_i / sigma_p (the shares add to 1). */
export function riskContribution(cov: number[][], w: number[]) {
  const sw = cov.map((row) => sum(row.map((c, j) => c * w[j])));
  const variance = sum(w.map((x, i) => x * sw[i]));
  const sigma = Math.sqrt(variance);
  return { sigma, rc: w.map((x, i) => (sigma > 0 ? (x * sw[i]) / sigma : 0)), share: w.map((x, i) => (variance > 0 ? (x * sw[i]) / variance : 0)) };
}

/** Average, highest and lowest pairwise correlation (off-diagonal) among the picked stocks. */
export function pairStats(tickers: string[], m: number[][]) {
  const pairs = tickers.flatMap((a, i) => tickers.slice(i + 1).map((b, k) => ({ a, b, v: m[i][i + 1 + k] })));
  if (!pairs.length) return null;
  const by = [...pairs].sort((x, y) => y.v - x.v);
  return { mean: sum(pairs.map((p) => p.v)) / pairs.length, highest: by[0], lowest: by[by.length - 1] };
}

// ---- Scenarios (hypothetical) ------------------------------------------------------------------------------------------

export type ScenarioId = 'base' | 'bull' | 'bear' | 'crash' | 'recovery';
export interface Scenario {
  id: ScenarioId;
  name: string;
  /** Market move (decimal). For 'recovery' this is the first leg, the crash. */
  market: number;
  /** Recovery only: the rebound after the first leg. */
  rebound?: number;
}

/** Base = the equal-weight universe's own estimated return, exp(mean mu) - 1; the others are round-number what-ifs. */
export function defaultScenarios(r: RunResult): Scenario[] {
  const mus = (r.assets ?? []).map((a) => a.exp_return);
  return [
    { id: 'base', name: 'Base', market: mus.length ? simpleAnnual(sum(mus) / mus.length) : 0 },
    { id: 'bull', name: 'Bull', market: 0.15 },
    { id: 'bear', name: 'Bear', market: -0.15 },
    { id: 'crash', name: 'Crash', market: -0.3 },
    { id: 'recovery', name: 'Recovery', market: -0.3, rebound: 0.25 },
  ];
}

/** Net market move of a scenario: the crash and the rebound compound. */
export const netMarket = (s: Scenario) => (s.rebound === undefined ? s.market : (1 + s.market) * (1 + s.rebound) - 1);

/** Stock move = beta x market move + IDIOSYNCRATIC (0), floored at -100%. Recovery compounds the two legs stock by stock. */
export function stockMove(beta: number, s: Scenario): number {
  const leg = (m: number) => Math.max(-1, beta * m + IDIOSYNCRATIC);
  return s.rebound === undefined ? leg(s.market) : (1 + leg(s.market)) * (1 + leg(s.rebound)) - 1;
}

export interface ScenarioResult {
  scenario: Scenario;
  market: number; // net market move = the NIFTY 50 move in this what-if
  portfolioReturn: number;
  pl: number;
  niftyPL: number;
  vsBase: number | null;
  vsNifty: number; // rupees
  stocks: { ticker: string; symbol: string; beta: number; betaAssumed: boolean; move: number; impact: number }[];
}

export function runScenarios(h: Holding[], capital: number, list: Scenario[]): ScenarioResult[] {
  const out = list.map((scenario) => {
    const stocks = h.map((x) => {
      const beta = x.beta ?? 1;
      const move = stockMove(beta, scenario);
      return { ticker: x.ticker, symbol: x.symbol, beta, betaAssumed: x.beta === null, move, impact: capital * x.weight * move };
    });
    const pl = sum(stocks.map((s) => s.impact));
    const market = netMarket(scenario);
    return { scenario, market, portfolioReturn: pl / capital, pl, niftyPL: capital * market, vsBase: null as number | null, vsNifty: pl - capital * market, stocks };
  });
  const base = out.find((x) => x.scenario.id === 'base');
  return out.map((x) => ({ ...x, vsBase: base && x !== base ? x.pl - base.pl : null }));
}

// ---- Backtest (test window, out-of-sample) -----------------------------------------------------------------------------

/** Value path of weekly candles: the first open, then every week's close, multiplied by `scale` (to re-base to another capital). */
export const valuePath = (c: Candle[], scale = 1) => (c.length ? [c[0].open * scale, ...c.map((k) => k.close * scale)] : []);
/** Fall from the running peak at each point (<= 0). */
export function drawdowns(v: number[]): number[] {
  let peak = -Infinity;
  return v.map((x) => ((peak = Math.max(peak, x)), x / peak - 1));
}
/** Return over the whole candle series, first open to last close. */
export const periodReturn = (c: Candle[]): number | null => (c.length ? c[c.length - 1].close / c[0].open - 1 : null);
/** Weakest week: close / open - 1 (a candle opens at the previous close). */
export function worstWeek(c: Candle[]): { date: string; ret: number } | null {
  let best: { date: string; ret: number } | null = null;
  c.forEach((k) => { const ret = k.close / k.open - 1; if (!best || ret < best.ret) best = { date: k.date, ret }; });
  return best;
}

/** Month-end to month-end returns from weekly candles (the last weekly close of each month; the first month starts at the first open). */
export function monthlyReturns(c: Candle[]): { month: string; ret: number }[] {
  const out: { month: string; ret: number }[] = [];
  if (!c.length) return out;
  let prev = c[0].open, month = '', last = prev;
  for (const k of c) {
    const m = k.date.slice(0, 7);
    if (month && m !== month) { out.push({ month, ret: last / prev - 1 }); prev = last; }
    month = m; last = k.close;
  }
  out.push({ month, ret: last / prev - 1 });
  return out;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

export interface BacktestRow { date: string; portfolio: number; nifty: number | null; ddPortfolio: number; ddNifty: number | null }
/** Portfolio and NIFTY 50 value (and drawdown) week by week. Dates come from the portfolio; NIFTY is matched by date. */
export function backtestRows(p: Candle[], n: Candle[] | undefined, scale: number, startLabel: string): BacktestRow[] {
  const pv = valuePath(p, scale), pd = drawdowns(pv);
  const nv = n ? valuePath(n, scale) : [], nd = drawdowns(nv);
  const nByDate = new Map((n ?? []).map((k, i) => [k.date, i + 1]));
  return pv.map((v, i) => {
    const j = i === 0 ? (nv.length ? 0 : -1) : nByDate.get(p[i - 1].date) ?? -1;
    return { date: i === 0 ? startLabel : p[i - 1].date, portfolio: v, nifty: j >= 0 ? nv[j] : null, ddPortfolio: pd[i], ddNifty: j >= 0 ? nd[j] : null };
  });
}

// ---- Expected vs actual ------------------------------------------------------------------------------------------------

export interface ExpVsActual { id: string; label: string; estimated: number | null; actual: number | null; absError: number | null }
/** Estimated annual return (exp(mu) - 1, estimation window) vs the realised test-year return, one absolute error per portfolio. */
export function expectedVsActual(r: RunResult): ExpVsActual[] {
  const rows: ExpVsActual[] = r.solvers.filter((s) => s.feasible && isNum(s.exp_return) && s.oos).map((s) => {
    const estimated = simpleAnnual(s.exp_return as number), actual = s.oos?.ann_return ?? null;
    return { id: s.solver, label: s.label, estimated, actual, absError: isNum(actual) ? Math.abs(estimated - actual) : null };
  });
  // The run does not estimate the index, so NIFTY 50 has an outcome but no estimate to compare it with.
  rows.push({ id: 'nifty50', label: 'NIFTY 50', estimated: null, actual: r.benchmarks.nifty50?.ann_return ?? null, absError: null });
  return rows;
}

// ---- Allocation comparison ---------------------------------------------------------------------------------------------

/** Weights (from each valid method's portfolio rows, 0 where not held) by stock and by sector. */
export function allocationMatrix(solvers: SolverResult[]) {
  const rows = solvers.filter((s) => s.feasible && s.portfolio?.rows.length);
  const total = (key: (r: { ticker: string; sector: string }) => string) => {
    const m = new Map<string, number>();
    rows.forEach((s) => s.portfolio!.rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + r.weight)));
    return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const tickers = total((r) => r.ticker), sectors = total((r) => r.sector);
  const cell = (s: SolverResult, key: (r: { ticker: string; sector: string }) => string, k: string) =>
    sum(s.portfolio!.rows.filter((r) => key(r) === k).map((r) => r.weight));
  const stock = rows.map((s) => tickers.map((t) => cell(s, (r) => r.ticker, t)));
  const sector = rows.map((s) => sectors.map((x) => cell(s, (r) => r.sector, x)));
  const same = new Set(rows.map((s) => [...(s.selection ?? [])].sort().join(','))).size <= 1;
  return { solvers: rows, tickers, sectors, stock, sector, allSame: same };
}

// ---- CSV ---------------------------------------------------------------------------------------------------------------

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Rows to CSV text, with a byte-order mark so Excel reads the rupee sign and the arrows correctly. */
export const toCsv = (rows: (string | number | null | undefined)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
