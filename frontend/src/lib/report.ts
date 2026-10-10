// Portfolio Report maths, all in one place. Pure functions over a RunResult (no network); only downloadReportCsv touches the DOM.
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

/** Equal-weight average of one per-stock annual log return over the picked stocks; null on runs without that field. */
function selectionAverage(r: RunResult, s: SolverResult, key: 'past_return' | 'shrunk_return'): number | null {
  const stat = new Map((r.assets ?? []).map((a) => [a.ticker, a[key]]));
  const p = (s.selection ?? []).map((t) => stat.get(t));
  return p.length && p.every(isNum) ? sum(p as number[]) / p.length : null;
}
/** Raw past average annual log return of the picked stocks (not a forecast). */
export const pastLogReturn = (r: RunResult, s: SolverResult) => selectionAverage(r, s, 'past_return');
/** Bayes-Stein shrunk past average annual log return of the picked stocks. */
export const shrunkLogReturn = (r: RunResult, s: SolverResult) => selectionAverage(r, s, 'shrunk_return');

/** Long-run nominal market return assumed by the CAPM view of Indian equities. A stated assumption, not an estimate. */
export const LONG_RUN_MARKET = 0.12;
/** CAPM view: risk-free + portfolio beta x (long-run market return - risk-free). Uses only betas, not past returns. */
export function capmReturn(h: Holding[]): number | null {
  if (!h.length || h.some((x) => x.beta === null)) return null;
  return RF + sum(h.map((x) => x.weight * (x.beta as number))) * (LONG_RUN_MARKET - RF);
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

// ---- Backtest, method by method ---------------------------------------------------------------------------------------

export interface MethodLine { id: string; label: string; sameAs: string | null; ret: number | null; vol: number | null; sharpe: number | null; maxDrawdown: number | null; endValue: number | null }
/** Every valid method's portfolio value through the test window (plus NIFTY 50), in rupees of `scale` x the run's capital. */
export function methodBacktest(r: RunResult, scale: number): { rows: Record<string, number | string | null>[]; lines: MethodLine[]; nifty: MethodLine | null } | null {
  const c = r.candles;
  const solvers = r.solvers.filter((s) => s.feasible && s.selection && c?.[s.solver]?.length);
  if (!c || !solvers.length) return null;
  const key = (sel: string[] | null) => [...(sel ?? [])].sort().join(',');
  const end = (k: Candle[]) => (k.length ? k[k.length - 1].close * scale : null);
  const lines: MethodLine[] = solvers.map((s, i) => ({
    id: s.solver, label: s.label,
    sameAs: solvers.slice(0, i).find((p) => key(p.selection) === key(s.selection))?.label ?? null,
    ret: s.oos?.ann_return ?? null, vol: s.oos?.ann_vol ?? null, sharpe: s.oos?.sharpe ?? null, maxDrawdown: s.oos?.max_drawdown ?? null,
    endValue: end(c[s.solver]),
  }));
  const n = c.nifty50 ?? [];
  const b = r.benchmarks.nifty50;
  const nifty: MethodLine | null = n.length
    ? { id: 'nifty50', label: 'NIFTY 50', sameAs: null, ret: b?.ann_return ?? null, vol: b?.ann_vol ?? null, sharpe: b?.sharpe ?? null, maxDrawdown: b?.max_drawdown ?? null, endValue: end(n) }
    : null;
  const base = c[solvers[0].solver];
  const paths = Object.fromEntries(solvers.map((s) => [s.solver, valuePath(c[s.solver], scale)]));
  const nv = valuePath(n, scale);
  const nByDate = new Map(n.map((k, i) => [k.date, i + 1]));
  const rows = ['start', ...base.map((k) => k.date)].map((date, i) => {
    const row: Record<string, number | string | null> = { date };
    for (const s of solvers) row[s.solver] = paths[s.solver][i] ?? null;
    const j = i === 0 ? 0 : nByDate.get(date) ?? -1;
    row.nifty50 = nv.length && j >= 0 ? nv[j] : null;
    return row;
  });
  return { rows, lines, nifty };
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

// ---- Noise analysis -------------------------------------------------------------------------------------------------

/** Ideal vs noisy QAOA: what the simulated hardware noise did to the sampling and to the portfolio QAOA would report. */
export function noiseSummary(r: RunResult) {
  const n = r.qaoa.noise;
  if (!n) return null;
  const q = r.solvers.find((s) => s.kind === 'quantum') ?? null;
  const idealPick = q && q.feasible && q.selection && isNum(q.exp_return)
    ? { selection: q.selection, exp_return: q.exp_return, volatility: q.volatility ?? null } : null;
  const noisyPick = n.best_noisy ?? null;
  return {
    backend: n.backend, ideal: n.ideal, noisy: n.noisy, transpiled: n.transpiled,
    shots: { ideal: r.request.qaoa.shots, noisy: n.shots ?? null },
    idealPick, noisyPick,
    /** Change in the estimated annual return of the reported portfolio caused by noise (simple returns), or null. */
    returnShift: idealPick && noisyPick ? simpleAnnual(noisyPick.exp_return) - simpleAnnual(idealPick.exp_return) : null,
  };
}

// ---- CSV export (one builder for every Download CSV button) --------------------------------------------------------

type Row = (string | number | null | undefined)[];

/** The full report as CSV text, from this run's own numbers. `capital` and `scenarios` default to the run's. */
export function reportCsv(r: RunResult, capital = r.request.capital, scenarios = defaultScenarios(r)): string | null {
  const s = reportSolver(r);
  if (!s) return null;
  const f = (x: number | null | undefined) => (isNum(x) ? +x.toFixed(6) : null);
  const { data } = r;
  const estWin = `${data.est_window[0]} to ${data.est_window[1]}`, testWin = `${data.test_window[0]} to ${data.test_window[1]}`;
  const h = holdings(r, s);
  const logRet = portfolioLogReturn(s, h);
  const vol = s.volatility, oos = s.oos, nifty = r.benchmarks.nifty50;
  const noise = noiseSummary(r);
  const past = pastLogReturn(r, s), shrunk = shrunkLogReturn(r, s);
  const noiseRows: Row[] = noise ? [
    [`Noise analysis (QAOA sampled on the simulated ${noise.backend} chip; angles optimised without noise)`], ['Metric', 'Ideal simulator', 'Noisy simulator'],
    ['Chance of sampling the best portfolio', f(noise.ideal.p_opt), f(noise.noisy.p_opt)], ['Random guess would get', f(noise.ideal.p_random), f(noise.noisy.p_random)],
    ['Valid (feasible) samples', f(noise.ideal.feasible_rate), f(noise.noisy.feasible_rate)], ['Approximation ratio', f(noise.ideal.approx_ratio), f(noise.noisy.approx_ratio)],
    ['Shots', noise.shots.ideal, noise.shots.noisy],
    ['Reported portfolio', noise.idealPick?.selection.join(' ') ?? 'none', noise.noisyPick?.selection.join(' ') ?? 'none (no valid noisy sample)'],
    ['Its estimated annual return', f(noise.idealPick ? simpleAnnual(noise.idealPick.exp_return) : null), f(noise.noisyPick ? simpleAnnual(noise.noisyPick.exp_return) : null)],
    ['Its estimated volatility', f(noise.idealPick?.volatility), f(noise.noisyPick?.volatility)],
    ['Same stocks as ideal', '', noise.noisyPick ? (noise.noisyPick.same_as_ideal ? 'yes' : 'no') : ''],
    ['Circuit on the chip', `depth ${noise.transpiled.depth}`, `${noise.transpiled.two_qubit_gates} two-qubit gates`], [],
  ] : [['Noise analysis'], ['Off for this run'], []];
  const rows: Row[] = [
    ['Portfolio report (estimates, not promises; educational tool, not investment advice)'],
    ['Generated', new Date().toISOString().slice(0, 10)], ['Run', r.run_id], ['Method', s.label], ['Capital (INR)', capital],
    ['Data source', data.source], ['Data as of', data.as_of], ['Estimation window', estWin], ['Test window (out-of-sample)', testWin], [],
    ['Holdings'], ['Ticker', 'Name', 'Sector', 'Weight', 'Amount (INR)', 'Est. annual log return', 'Est. volatility', 'Beta', 'Contribution to log return'],
    ...h.map((x) => [x.ticker, x.name, x.sector, f(x.weight), Math.round(capital * x.weight), f(x.mu), f(x.vol), f(x.beta), f(x.contribution)]), [],
    ['Metrics'], ['Metric', 'Value'],
    ['Expected annual log return', f(logRet)], ['Expected annual return (exp(mu)-1)', f(logRet === null ? null : simpleAnnual(logRet))], ['Estimated volatility', f(vol)],
    ['Return estimator', r.estimator ? `${r.estimator.method}${r.estimator.method === 'bayes_stein' ? ` (shrinkage ${f(r.estimator.shrinkage)})` : ''}` : 'raw'],
    ['Past performance, estimation window (raw average, not a forecast)', f(past === null ? null : simpleAnnual(past))],
    ['Recent-history estimate (Bayes-Stein shrunk past average)', f(shrunk === null ? null : simpleAnnual(shrunk))],
    [`CAPM view (risk-free 5.57%, ${LONG_RUN_MARKET * 100}% long-run market)`, f(capmReturn(h))],
    ['Sharpe (RF 5.57%)', f(logRet !== null && isNum(vol) ? sharpe(logRet, vol) : null)], ['Modelled transaction cost (fraction of capital)', f(s.txn_cost)],
    ['Test-year return', f(oos?.ann_return)], ['Test-year volatility', f(oos?.ann_vol)], ['Test-year Sharpe', f(oos?.sharpe)], ['Test-year max drawdown', f(oos?.max_drawdown)],
    ['NIFTY 50 test-year return', f(nifty?.ann_return)], ['NIFTY 50 test-year volatility', f(nifty?.ann_vol)], ['NIFTY 50 test-year Sharpe', f(nifty?.sharpe)],
    ['NIFTY 50 test-year max drawdown', f(nifty?.max_drawdown)], [],
    ['Projection (compounded)'], ['Months', 'Growth', 'Profit/loss (INR)'],
    ...HORIZONS.map((m) => [m, logRet === null ? null : f(growth(logRet, m)), logRet === null ? null : Math.round(projectedPL(capital, logRet, m))]), [],
    ['Scenarios (hypothetical; stock move = beta x market move)'], ['Scenario', 'Market move', 'Portfolio return', 'Profit/loss (INR)', 'vs base (INR)', 'NIFTY 50 profit/loss (INR)'],
    ...runScenarios(h, capital, scenarios).map((x) => [x.scenario.name + (x.scenario.rebound === undefined ? '' : ` (crash ${f(x.scenario.market)} then rebound ${f(x.scenario.rebound)})`),
      f(x.market), f(x.portfolioReturn), Math.round(x.pl), x.vsBase === null ? null : Math.round(x.vsBase), Math.round(x.niftyPL)]), [],
    ['Expected vs actual'], ['Portfolio', 'Estimated annual return', 'Realised test-year return', 'Absolute error'],
    ...expectedVsActual(r).map((x) => [x.label, f(x.estimated), f(x.actual), f(x.absError)]), [],
    ['Methods'], ['Method', 'Stocks', 'Est. annual return', 'Realised', 'Est. volatility', 'Objective', 'Runtime (s)', 'Valid', 'Approx ratio'],
    ...r.solvers.map((x) => [x.label, (x.selection ?? []).join(' '), isNum(x.exp_return) ? f(simpleAnnual(x.exp_return)) : null, f(x.oos?.ann_return),
      f(x.volatility), f(x.objective), f(x.runtime_s), x.feasible ? 'yes' : 'no', f(x.approx_ratio)]), [],
    ...(() => {
      const mb = methodBacktest(r, capital / r.request.capital);
      if (!mb) return [];
      const all = [...mb.lines, ...(mb.nifty ? [mb.nifty] : [])];
      return [['Test year by method (unseen data)'], ['Portfolio', 'Return (annualised)', 'Value at the end (INR)', 'Volatility', 'Sharpe', 'Max drawdown', 'Same stocks as'],
        ...all.map((x) => [x.label, f(x.ret), x.endValue === null ? null : Math.round(x.endValue), f(x.vol), f(x.sharpe), f(x.maxDrawdown), x.sameAs ?? '']), []] as Row[];
    })(),
    ...noiseRows,
    ['Assumptions'], ['Returns: mean daily log return x252 over the estimation window; weights equal (1/K); stock move = beta x market move (idiosyncratic part 0)'],
    ['Backtest: buy-and-hold over the test window; no rebalancing, slippage, taxes or separately modelled dividends; one-time buying cost is in the objective but not deducted in the backtest'],
  ];
  return toCsv(rows);
}

/** Saves the report CSV in the browser. Returns false when the run has no valid portfolio to report on. */
export function downloadReportCsv(r: RunResult, capital?: number, scenarios?: Scenario[]): boolean {
  const csv = reportCsv(r, capital, scenarios);
  if (!csv) return false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `portfolio-report-${r.run_id}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}
