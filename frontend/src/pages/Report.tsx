// Portfolio Report: a plain-language write-up of the recommended portfolio. All maths lives in lib/report.ts.
// Estimates come from the estimation window only; the backtest uses the held-out test window. Nothing here is advice.
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RunResult } from '../api/types';
import { Heatmap, pctFormat } from '../components/Heatmap';
import { InfoTip, Section, Stat } from '../components/ui';
import { Tour } from '../components/tour/Tour';
import { REPORT_TOUR_STEPS } from '../components/tour/tourSteps';
import { formatINR, formatPct, isNum, trend } from '../lib/format';
import * as R from '../lib/report';

const AXIS = { stroke: 'var(--c-muted2)', fontSize: 13 };
const TIP = { background: 'var(--color-surface)', border: '1px solid var(--color-line-strong)', fontSize: 13 };
const axisINR = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)}L` : v >= 1e4 ? `₹${(v / 1e3).toFixed(1)}k` : formatINR(v));
const DASHES = ['', '8 4', '2 3', '12 4 2 4', '4 4'];
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${formatINR(Math.abs(x))}`;
const fix2 = (x: number | null | undefined) => (isNum(x) ? x.toFixed(2).replace('-', '−') : '—');
const corrFormat = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
const tableCls = 'w-full text-sm min-w-[520px]';

const Delta = ({ x, digits = 1 }: { x: number | null | undefined; digits?: number }) => {
  const t = trend(x);
  return <span className={t.tone}>{t.arrow} {formatPct(x, { digits, sign: true })}</span>;
};
const Money = ({ x }: { x: number }) => {
  const t = trend(x);
  return <span className={t.tone}>{t.arrow} {signed(x)}</span>;
};
const Calc = ({ children }: { children: ReactNode }) => (
  <details className="mt-3 text-sm text-muted">
    <summary className="cursor-pointer text-text">How is this calculated?</summary>
    <div className="mt-2 space-y-2">{children}</div>
  </details>
);
/** A report part; `research` parts are hidden in Simple mode. */
function Part({ id, letter, title, lead, research, children }: { id: string; letter: string; title: string; lead: ReactNode; research?: boolean; children: ReactNode }) {
  const body = <Section id={id} eyebrow={letter} title={title} lead={lead}>{children}</Section>;
  return research ? <div data-research>{body}</div> : body;
}
const Meter = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-2 text-sm">
    <span className="w-44 truncate" title={label}>{label}</span>
    <div className="flex-1 h-3 bg-bg border border-line"><div className="h-full bg-accent-blue" style={{ width: `${Math.min(100, value * 100)}%` }} /></div>
    <span className="w-14 text-right tabular-nums">{formatPct(value)}</span>
  </div>
);
/** One heatmap with its "what this answers" line and a "How is this calculated?" block. */
function HeatBlock({ title, answers, research, children, calc }: { title: string; answers: string; research?: boolean; children: ReactNode; calc: ReactNode }) {
  const body = (
    <div className="space-y-2">
      <h4 className="text-text">{title}</h4>
      <p className="text-sm text-muted"><span className="text-text">What this answers:</span> {answers}</p>
      {children}
      <Calc>{calc}</Calc>
    </div>
  );
  return research ? <div data-research>{body}</div> : body;
}
const Unavailable = () => <p className="text-sm text-muted">This run did not include the data for this view (it was made by an older backend). Run the optimiser again.</p>;

export function Report({ runResult, onNavigateToOptimise }: { runResult: RunResult | null; onNavigateToOptimise?: () => void }) {
  if (!runResult) {
    return (
      <div className="bg-surface border border-line p-6 space-y-3">
        <h2>Portfolio Report</h2>
        <p className="text-sm text-muted">No run yet. Run the optimiser first and this page turns the result into a plain-language report.</p>
        {onNavigateToOptimise && <button type="button" onClick={onNavigateToOptimise} className="px-4 py-2 text-xs font-mono uppercase bg-accent-blue text-white">Go to Optimise</button>}
      </div>
    );
  }
  return <ReportBody key={runResult.run_id} result={runResult} onNavigateToOptimise={onNavigateToOptimise} />;
}

const SCENARIO_HELP: Record<string, string> = {
  base: 'The market moves by its own expected yearly return (the average of all offered stocks), and each stock moves by its beta times that.',
  bull: 'A good year: the market rises 15%. A stock with beta 1.5 rises about 22.5%.',
  bear: 'A bad year: the market falls 15%. A stock with beta 1.5 falls about 22.5%.',
  crash: 'A severe fall: the market drops 30%, like a crash year. High-beta stocks fall the most.',
  recovery: 'A 30% crash followed by a 25% rebound: the market still ends about 12.5% down, because a fall needs a bigger rise to recover.',
};

function ReportBody({ result, onNavigateToOptimise }: { result: RunResult; onNavigateToOptimise?: () => void }) {
  const [capitalText, setCapitalText] = useState(String(result.request.capital));
  const [months, setMonths] = useState<number>(12);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [guide, setGuide] = useState(false);
  const s = R.reportSolver(result);
  if (!s) {
    return (
      <div className="bg-surface border border-line p-6 space-y-3">
        <h2>Portfolio Report</h2>
        <p className="text-sm text-muted">This run has no valid portfolio to report on. Change the constraints or run again.</p>
        {onNavigateToOptimise && <button type="button" onClick={onNavigateToOptimise} className="px-4 py-2 text-xs font-mono uppercase bg-accent-blue text-white">Go to Optimise</button>}
      </div>
    );
  }

  const { data, request } = result;
  const parsed = parseFloat(capitalText);
  const capital = Number.isFinite(parsed) && parsed > 0 ? parsed : request.capital;
  const h = R.holdings(result, s);
  const logRet = R.portfolioLogReturn(s, h);
  const vol = s.volatility;
  const annual = logRet === null ? null : R.simpleAnnual(logRet);
  const sharpe = logRet !== null && isNum(vol) ? R.sharpe(logRet, vol) : null;
  const oos = s.oos, nifty = result.benchmarks.nifty50;
  const buyCost = isNum(s.txn_cost) ? s.txn_cost : null;
  const estWin = `${data.est_window[0]} to ${data.est_window[1]}`, testWin = `${data.test_window[0]} to ${data.test_window[1]}`;
  const conc = R.concentration(h);
  const methods = R.methodBacktest(result, capital / request.capital);
  const past = R.pastLogReturn(result, s), shrunk = R.shrunkLogReturn(result, s), capm = R.capmReturn(h), est = result.estimator;
  const beta = h.every((x) => x.beta !== null) ? h.reduce((t, x) => t + x.weight * (x.beta as number), 0) : null;

  // Backtest series, re-based to the capital typed above (the candles are in rupees of request.capital).
  const pCandles = result.candles?.[s.solver], nCandles = result.candles?.nifty50;
  const scale = capital / request.capital;
  const rows = pCandles?.length ? R.backtestRows(pCandles, nCandles, scale, 'start') : [];
  const worst = pCandles ? R.worstWeek(pCandles) : null;
  const pPeriod = pCandles ? R.periodReturn(pCandles) : null, nPeriod = nCandles ? R.periodReturn(nCandles) : null;

  // Scenarios: defaults plus whatever the user typed (percent text -> decimal; invalid text falls back to the default).
  const num = (key: string, fallback: number) => {
    const v = parseFloat(edits[key] ?? '');
    return edits[key] !== undefined && Number.isFinite(v) && v >= -95 && v <= 300 ? v / 100 : fallback;
  };
  const shown = (key: string, fallback: number) => edits[key] ?? (fallback * 100).toFixed(1);
  const defaults = R.defaultScenarios(result);
  const scenarios = defaults.map((d) => ({ ...d, market: num(`${d.id}:market`, d.market), rebound: d.rebound === undefined ? undefined : num(`${d.id}:rebound`, d.rebound) }));
  const scen = R.runScenarios(h, capital, scenarios);

  const evA = R.expectedVsActual(result);
  const alloc = R.allocationMatrix(result.solvers);
  const corr = result.correlation;
  const risk = corr ? R.riskContribution(corr.covariance, corr.tickers.map((t) => h.find((x) => x.ticker === t)?.weight ?? 0)) : null;
  const pairs = corr ? R.pairStats(corr.tickers.map(R.symbol), corr.matrix) : null;
  const monthly = [{ id: 'p', label: s.label, c: pCandles }, { id: 'n', label: 'NIFTY 50', c: nCandles }].map((x) => ({ ...x, m: x.c ? R.monthlyReturns(x.c) : [] }));
  const months12 = monthly[0].m.map((x) => x.month);

  const growthNow = logRet === null ? null : R.growth(logRet, months);
  const range = logRet !== null && isNum(vol) ? R.growthRange(logRet, vol, months) : null;
  const plNow = logRet === null ? null : R.projectedPL(capital, logRet, months);

  const download = () => R.downloadReportCsv(result, capital, scenarios);
  const noise = R.noiseSummary(result);

  return (
    <div className="space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Portfolio report</h2>
          <p className="text-sm text-muted">Run {result.run_id} · {s.label} · data as of {data.as_of}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setGuide(true)} className="px-3 py-2 text-xs font-mono uppercase bg-accent-blue text-[#fff]">Guide</button>
          <button type="button" onClick={download} className="px-3 py-2 text-xs font-mono uppercase border border-accent-blue text-accent-blue-hover">Download CSV</button>
          <button type="button" onClick={() => window.print()} className="px-3 py-2 text-xs font-mono uppercase border border-accent-blue text-accent-blue-hover">Print / Save as PDF</button>
        </div>
      </div>

      {/* A. Executive summary */}
      <Part id="rp-a" letter="A · Summary" title="Executive summary" lead="The recommended portfolio, what it is estimated to do, and what the same stocks actually did in a year the optimiser never saw.">
        <div className="border-l-4 border-accent-blue bg-surface p-3 text-sm mb-4">
          <strong>Estimates, not promises.</strong> The numbers marked "estimated" come from past prices and a simple model. They can be wrong, and the future can differ a lot. Educational tool, not investment advice.
        </div>
        <label className="text-sm flex flex-wrap items-center gap-2 mb-4">
          <span className="text-text">Capital to invest (₹)</span>
          <input type="number" min={1} step={10000} value={capitalText} onChange={(e) => setCapitalText(e.target.value)} className="w-40 px-2 py-1 border text-right" />
          <span className="text-muted">Default is the capital of the run ({formatINR(request.capital)}).</span>
        </label>
        <div className="overflow-x-auto mb-4">
          <table className={tableCls}>
            <thead><tr className="text-left"><th className="py-1 pr-2">Stock</th><th className="py-1 pr-2">Sector</th><th className="py-1 pr-2 text-right">Weight</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody>
              {h.map((x) => (
                <tr key={x.ticker} className="border-t border-line">
                  <td className="py-1 pr-2" title={x.name}>{x.symbol} <span className="text-muted">{x.name}</span></td>
                  <td className="py-1 pr-2 text-muted">{x.sector}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatPct(x.weight)}</td>
                  <td className="py-1 text-right tabular-nums">{formatINR(capital * x.weight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted mb-4">
          Objective: the lowest risk-weighted variance minus return under the constraints ({request.k} stocks{request.sector_cap ? `, at most ${request.sector_cap} per sector` : ''}
          {request.target_return !== null ? `, at least ${formatPct(request.target_return)} net return` : ''}; risk aversion {request.risk_aversion}). Equal weights; whole-share rounding is ignored here.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Expected annual return" help={"The yearly growth the optimiser assumed when it picked these stocks. The line under the number says how it was estimated. It is an estimate, not a promise."} value={annual === null ? '—' : <Delta x={annual} />} hint={est?.method === 'capm' ? `From market sensitivity (CAPM, beta ${beta?.toFixed(2)}), not past returns. On one validation year before the test period it beat past-return estimates and tied a flat 12% for every stock. An estimate, not a promise.` : est?.method === 'bayes_stein' ? `Past returns pulled ${formatPct(est.shrinkage, { digits: 0 })} toward a common average (Bayes-Stein), because raw past averages overstate recent winners. An estimate, not a promise.` : 'What past prices imply the stocks earn in a year if that pattern repeats. An estimate.'} />
          {est?.method === 'capm' && shrunk !== null && <Stat label="Recent-history estimate" help={"The stocks' own past returns, pulled toward the average stock. Shown only for comparison: past returns predicted the next year poorly in our checks."} value={<Delta x={R.simpleAnnual(shrunk)} />} hint={`Past returns pulled ${formatPct(est.shrinkage, { digits: 0 })} toward a common average (Bayes-Stein). Shown for comparison; on the validation year it was far less accurate than the market-based estimate.`} />}
          {past !== null && <Stat label="Past performance (not a forecast)" help={"What these exact stocks earned per year in the data the optimiser learned from. They were picked partly because of this, so it is the most optimistic number on the page."} value={<Delta x={R.simpleAnnual(past)} />} hint={`What these stocks actually did per year in ${estWin}. The optimiser picked them partly because of this, so it overstates the future.`} />}
          {capm !== null && est?.method !== 'capm' && <Stat label="Market-model view (CAPM)" value={<Delta x={capm} />} hint={`5.57% risk-free + beta ${beta?.toFixed(2)} × (${R.LONG_RUN_MARKET * 100}% assumed long-run market − 5.57%). Uses market sensitivity only, not past returns: the most conservative view.`} />}
          <Stat label="Estimated 12-month profit/loss" value={logRet === null ? '—' : <Money x={R.projectedPL(capital, logRet, 12)} />} hint="The expected annual return applied to your capital." />
          <Stat label="Volatility (estimated)" help={"How much the value usually moves in a year. 20% means a typical year lands within about 20% above or below the expected path."} value={formatPct(vol)} hint="How much the value typically swings over a year (one standard deviation)." />
          <Stat label="Sharpe ratio (estimated)" help={"Extra return over a risk-free bank rate (5.57%) for each unit of risk taken. Above 1 is good; below 0 means a deposit would have been better."} value={fix2(sharpe)} hint="Return above the 5.57% risk-free rate for each unit of volatility. Higher is better." />
          <Stat label="Test-year return (actual)" help={"The real result over a year the optimiser never saw. This is the honest check on every estimate above."} value={<Delta x={oos?.ann_return} />} hint={`What these stocks really did, ${testWin}. Not seen by the optimiser.`} />
          <Stat label="NIFTY 50 test-year return" value={<Delta x={nifty?.ann_return} />} hint="The index over the same dates, for comparison." />
          <Stat label="Max drawdown, test year" value={<span className="text-loss">▼ {formatPct(Math.abs(oos?.max_drawdown ?? NaN))}</span>} hint="The biggest fall from a peak to a later low, in the test year." />
          <Stat label="Modelled trading cost" value={buyCost === null ? '—' : formatINR(buyCost * capital)} hint="Brokerage and charges for buying once. It is in the objective, not in the backtest." />
        </div>
        <Calc>
          <p>Expected annual return: the average of each stock's estimated annual <em>log</em> return (the mean of daily log returns × 252 over the estimation window, {estWin}), weighted equally, converted with exp(μ) − 1. Log returns add up over time, which is why they are used to compound. The Optimise page shows μ itself (the log return); this page converts it to a plain percentage, which is larger when the return is positive.</p>
          {est?.method === 'capm' && <p>Expected return (CAPM) = 5.57% risk-free + beta × (12% assumed long-run market return − 5.57%), with beta measured against the equal-weight average of the offered stocks over the estimation window. Past returns are not used. We chose it on a validation year inside the estimation data (2023-10 to 2024-09 estimated, 2024-10 to 2025-09 checked), where it missed each stock by 19.8 points on average against 43.9 for Bayes-Stein and 62.7 for the raw past average. A flat 12% for every stock also scored 19.8, so its gain comes mostly from not chasing past winners, and it rests on one validation year.</p>}
          {est && est.method !== 'raw' && <p>Bayes-Stein shrinkage (Jorion, 1986): μ = (1 − w) × past average + w × target, where the target is the return of the minimum-variance portfolio and the data sets w ({formatPct(est.shrinkage, { digits: 0 })} for this run). A plain past average rewards whatever just ran up, and an optimiser then picks exactly those stocks; shrinking removes most of that bias. It uses the estimation window only.</p>}
          <p>Estimated profit/loss = capital × (exp(μ × months/12) − 1). Volatility = √(wᵀΣw) with Σ the annualised covariance of daily log returns. Sharpe = (exp(μ) − 1 − 5.57%) ÷ volatility.</p>
          <p>Test-year figures come from the real prices in {testWin}: equal-weight buy-and-hold, no trading after the first day. Max drawdown is the largest peak-to-trough fall of the daily value.</p>
        </Calc>
      </Part>

      {/* B. Expected returns */}
      <Part id="rp-b" letter="B · Returns" title="Expected returns" lead="Where the estimated return comes from, stock by stock, and how it would compound over different horizons.">
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr className="text-left"><th className="py-1 pr-2">Stock</th><th className="py-1 pr-2 text-right">Weight</th><th className="py-1 text-right">Estimated annual return</th></tr></thead>
            <tbody>
              {h.map((x) => (
                <tr key={x.ticker} className="border-t border-line">
                  <td className="py-1 pr-2" title={x.name}>{x.symbol}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatPct(x.weight)}</td>
                  <td className="py-1 text-right">{x.mu === null ? '—' : <Delta x={R.simpleAnnual(x.mu)} />}</td>
                </tr>
              ))}
              <tr className="border-t border-line-strong text-text">
                <td className="py-1 pr-2">Portfolio</td><td className="py-1 pr-2 text-right">{formatPct(1)}</td>
                <td className="py-1 text-right">{annual === null ? '—' : <Delta x={annual} />}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted mt-1">{est?.method === 'capm' ? "Each stock's estimate comes from how much it moves with the market (beta), not from its past returns: 5.57% + beta × (12% assumed long-run market − 5.57%). Past returns are left out because they overstate whatever just ran up." : est?.method === 'bayes_stein' ? "Each stock's estimate is its past average pulled toward a common average (Bayes-Stein), because raw past averages overstate recent winners. It is a model, not a forecast." : "Each stock's estimate is just its own past average, so a stock that did well in the estimation window looks good here. That is the model, not a forecast."}</p>

        <div className="mt-5" role="group" aria-label="Horizon">
          <p className="text-sm text-text mb-2">Look ahead by</p>
          <div className="inline-flex border border-accent-blue">
            {R.HORIZONS.map((m) => (
              <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)}
                className={`px-3 py-1 text-sm ${months === m ? 'bg-accent-blue text-bg' : 'text-accent-blue-hover'}`}>{m} {m === 1 ? 'month' : 'months'}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <Stat label={`Growth in ${months} months`} value={growthNow === null ? '—' : <Delta x={growthNow} />} hint="Compounded: each month's growth is earned on the previous total." />
          <Stat label="Estimated profit/loss" value={plNow === null ? '—' : <Money x={plNow} />} hint={`On ${formatINR(capital)}, before the one-time trading cost.`} />
          <Stat label="Typical range (±1 st. dev.)" value={range ? `${formatPct(range[0], { sign: true })} to ${formatPct(range[1], { sign: true })}` : '—'} hint="If the model were right, about two outcomes in three would land inside it. It is wide on purpose." />
        </div>
        <Calc>
          <p>The portfolio's log return is μ<sub>p</sub> = Σ w<sub>i</sub> μ<sub>i</sub> (the weighted average of the stocks' annual log returns). Over h months it grows capital by exp(μ<sub>p</sub> × h/12) − 1, so 24 months is the 12-month growth compounded twice, not doubled.</p>
          <p>The range is exp(μ<sub>p</sub>·t ± σ·√t) − 1 with t = h/12 years and σ the estimated volatility, a normal-distribution approximation. Averaging log returns slightly understates a basket that is not rebalanced; that second-order gap is ignored.</p>
        </Calc>
      </Part>

      {/* C. Risk */}
      <Part id="rp-c" letter="C · Risk" title="Risk" research lead="How much the value can swing, how it is spread across stocks and sectors, and how the picks move together.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Volatility (estimated)" value={formatPct(vol)} hint="Typical yearly swing, from the estimation window." />
          <Stat label="Sharpe ratio (estimated)" value={fix2(sharpe)} hint="Return above the risk-free rate per unit of volatility." />
          <Stat label="Worst week, test year" value={worst ? <Delta x={worst.ret} /> : '—'} hint={worst ? `Week ending ${worst.date}. A weekly close, so intra-week lows are not shown.` : 'No weekly data in this run.'} />
          <Stat label="Effective number of stocks" value={conc.effectiveN.toFixed(1)} hint={`${h.length} picks; equal weights give the maximum.`} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
          <div className="space-y-1">
            <h4 className="text-text">Concentration by stock</h4>
            {h.map((x) => <Meter key={x.ticker} label={x.symbol} value={x.weight} />)}
          </div>
          <div className="space-y-1">
            <h4 className="text-text">Concentration by sector</h4>
            {conc.sectors.map((x) => <Meter key={x.sector} label={x.sector} value={x.weight} />)}
          </div>
        </div>
        <p className="text-sm text-muted mt-4">Volatility is not the whole risk. It does not capture a one-day crash, a company-specific event, or the way stocks tend to fall together in a crisis (correlations rise). The correlation heatmap is in the heatmap section below.</p>
        <Calc>
          <p>Volatility = √(wᵀΣw), Σ being the annualised covariance of daily log returns (× 252) over the estimation window. Worst week = the lowest weekly close ÷ open − 1 in the backtest. Effective number of stocks = 1 ÷ Σ w², which equals the number of picks when all weights are equal. Sector weight = the sum of the weights of the stocks in that sector.</p>
        </Calc>
      </Part>

      {/* D. Scenarios */}
      <Part id="rp-d" letter="D · What if" title="Scenarios" lead="What-ifs, not forecasts. Change a market move and see what the portfolio would do if each stock followed the market by its beta.">
        <p className="text-sm text-muted mb-3"><strong className="text-text">Hypothetical.</strong> None of these is a prediction. Base is the market moving by the equal-weight average estimated return of all the stocks offered, taken from the estimation window; the NIFTY 50 itself is not estimated, so its column simply mirrors the market move. <span className="text-text">Why Base differs from the estimate in A:</span> A uses each picked stock's own estimated return, while every scenario (Base included) moves each stock only by its beta × the market, so the two are different models and need not agree.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-2">Scenario</th><th className="py-1 pr-2">Market move (NIFTY 50)</th><th className="py-1 pr-2 text-right">Portfolio</th><th className="py-1 pr-2 text-right">Profit/loss</th>
                <th className="py-1 pr-2 text-right">vs base</th><th className="py-1 pr-2 text-right">NIFTY 50 profit/loss</th><th className="py-1 text-right">vs NIFTY 50</th>
              </tr>
            </thead>
            <tbody>
              {scen.map((x) => {
                const sc = x.scenario, d = defaults.find((y) => y.id === sc.id)!;
                const inp = (key: 'market' | 'rebound', label: string) => (
                  <label className="inline-flex items-center gap-1">
                    <span className="text-muted">{label}</span>
                    <input type="number" step={0.5} value={shown(`${sc.id}:${key}`, (key === 'market' ? d.market : d.rebound) as number)} aria-label={`${sc.name} ${label}`}
                      onChange={(e) => setEdits({ ...edits, [`${sc.id}:${key}`]: e.target.value })} className="w-20 px-1 py-0.5 border text-right" />%
                  </label>
                );
                return (
                  <tr key={sc.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2 text-text"><span className="inline-flex items-center gap-1">{sc.name}<InfoTip label={sc.name}>{SCENARIO_HELP[sc.id]}</InfoTip></span></td>
                    <td className="py-1.5 pr-2 space-x-3">{inp('market', sc.rebound === undefined ? '' : 'crash')}{sc.rebound !== undefined && <>{inp('rebound', 'then')}<span className="text-muted">net <Delta x={x.market} /></span></>}</td>
                    <td className="py-1.5 pr-2 text-right"><Delta x={x.portfolioReturn} /></td>
                    <td className="py-1.5 pr-2 text-right"><Money x={x.pl} /></td>
                    <td className="py-1.5 pr-2 text-right">{x.vsBase === null ? '—' : <Money x={x.vsBase} />}</td>
                    <td className="py-1.5 pr-2 text-right"><Money x={x.niftyPL} /></td>
                    <td className="py-1.5 text-right"><Money x={x.vsNifty} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h4 className="text-text mt-5 mb-1">Impact on each holding</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left"><th className="py-1 pr-2">Stock</th><th className="py-1 pr-2 text-right">Beta</th>{scen.map((x) => <th key={x.scenario.id} className="py-1 pr-2 text-right">{x.scenario.name}</th>)}</tr></thead>
            <tbody>
              {h.map((hold, i) => (
                <tr key={hold.ticker} className="border-t border-line">
                  <td className="py-1 pr-2">{hold.symbol}</td>
                  <td className="py-1 pr-2 text-right tabular-nums" title={hold.beta === null ? 'Beta not in this run: 1.0 assumed' : undefined}>{scen[0].stocks[i].beta.toFixed(2)}{hold.beta === null ? '*' : ''}</td>
                  {scen.map((x) => (
                    <td key={x.scenario.id} className="py-1 pr-2 text-right">
                      <Money x={x.stocks[i].impact} /><div className="text-muted text-xs">{formatPct(x.stocks[i].move, { sign: true })}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted mt-3">Real crises are usually harsher than this: correlations rise, so stocks that normally move differently fall together, and betas measured in calm times understate the drop.</p>
        <Calc>
          <p>Beta is how much a stock moved with the equal-weight market of the stocks you offered, measured on the estimation window: β = (Σw)<sub>i</sub> ÷ wᵀΣw. In a scenario, a stock moves by β × the market move (plus a company-specific part that is assumed to be 0), never below −100%. The portfolio return is the weighted sum; profit/loss is that times your capital.</p>
          <p>The NIFTY 50 is assumed to move by the market move itself. Recovery is a crash followed by a rebound; each stock's two legs compound, and the net market move is (1 + crash)(1 + rebound) − 1. Base is exp(average μ of all the stocks offered) − 1, the same equal-weight market the betas are measured against. All moves are editable and none is a forecast.</p>
        </Calc>
      </Part>

      {/* E. Backtest */}
      <Part id="rp-e" letter="E · Backtest" title="Backtest on unseen data" lead={`How the same stocks actually did against the NIFTY 50 from ${data.test_window[0]} to ${data.test_window[1]}, a period the optimiser never saw. (This app's data has no 2021 to 2023 period: the windows are the real ones above.)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead><tr className="text-left"><th className="py-1 pr-2">Test year</th><th className="py-1 pr-2 text-right">{s.label}</th><th className="py-1 text-right">NIFTY 50</th></tr></thead>
            <tbody>
              <tr className="border-t border-line"><td className="py-1 pr-2">Return (annualised)</td><td className="py-1 pr-2 text-right"><Delta x={oos?.ann_return} /></td><td className="py-1 text-right"><Delta x={nifty?.ann_return} /></td></tr>
              <tr className="border-t border-line"><td className="py-1 pr-2">Value of your capital at the end</td><td className="py-1 pr-2 text-right">{pPeriod === null ? '—' : formatINR(capital * (1 + pPeriod))}</td><td className="py-1 text-right">{nPeriod === null ? '—' : formatINR(capital * (1 + nPeriod))}</td></tr>
              <tr className="border-t border-line"><td className="py-1 pr-2">Volatility</td><td className="py-1 pr-2 text-right tabular-nums">{formatPct(oos?.ann_vol)}</td><td className="py-1 text-right tabular-nums">{formatPct(nifty?.ann_vol)}</td></tr>
              <tr className="border-t border-line"><td className="py-1 pr-2">Sharpe ratio</td><td className="py-1 pr-2 text-right tabular-nums">{fix2(oos?.sharpe)}</td><td className="py-1 text-right tabular-nums">{fix2(nifty?.sharpe)}</td></tr>
              <tr className="border-t border-line"><td className="py-1 pr-2">Max drawdown</td><td className="py-1 pr-2 text-right text-loss">▼ {formatPct(Math.abs(oos?.max_drawdown ?? NaN))}</td><td className="py-1 text-right text-loss">▼ {formatPct(Math.abs(nifty?.max_drawdown ?? NaN))}</td></tr>
            </tbody>
          </table>
        </div>
        {rows.length > 0 ? (
          <div className="h-64 mt-4" role="img" aria-label="Value of the portfolio and of the NIFTY 50 over the test year">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--c-grid)" />
                <XAxis dataKey="date" tick={AXIS} stroke="var(--c-grid)" minTickGap={40} tickFormatter={(d: string) => (d === 'start' ? 'start' : d.slice(0, 7))} />
                <YAxis tick={AXIS} stroke="var(--c-grid)" width={64} domain={['auto', 'auto']} tickFormatter={axisINR} />
                <Tooltip contentStyle={TIP} formatter={(v: unknown) => formatINR(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Line name={s.label} dataKey="portfolio" stroke="var(--c-fg)" dot={false} isAnimationActive={false} strokeWidth={2} />
                <Line name="NIFTY 50" dataKey="nifty" stroke="var(--color-accent-blue)" strokeDasharray="6 3" dot={false} isAnimationActive={false} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted mt-3">This run has no weekly price data for charts.</p>}
        {rows.length > 0 && (
          <div data-research className="h-48 mt-4" role="img" aria-label="Drawdown from the previous peak over the test year">
            <p className="text-sm text-text">Drawdown: how far below its previous peak the value was (weekly closes)</p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--c-grid)" />
                <XAxis dataKey="date" tick={AXIS} stroke="var(--c-grid)" minTickGap={40} tickFormatter={(d: string) => (d === 'start' ? 'start' : d.slice(0, 7))} />
                <YAxis tick={AXIS} stroke="var(--c-grid)" width={52} tickFormatter={(v: number) => formatPct(v, { digits: 0 })} />
                <ReferenceLine y={0} stroke="var(--c-muted2)" />
                <Tooltip contentStyle={TIP} formatter={(v: unknown) => formatPct(Number(v), { sign: true })} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Line name={s.label} dataKey="ddPortfolio" stroke="var(--c-fg)" dot={false} isAnimationActive={false} strokeWidth={2} />
                <Line name="NIFTY 50" dataKey="ddNifty" stroke="var(--color-accent-blue)" strokeDasharray="6 3" dot={false} isAnimationActive={false} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-sm text-muted mt-3">
          Costs: only a one-time buying cost ({buyCost === null ? '—' : formatINR(buyCost * capital)}) is modelled, in the optimiser's objective; the table above does not deduct it.
          There is no rebalancing, slippage, tax or separately modelled dividend (prices are adjusted closes). One year is one sample: a good or bad result here does not prove the method works.
        </p>
        <Calc>
          <p>The portfolio is the same stocks in equal rupee amounts on the first day of the test window, then held (buy-and-hold). Return is annualised from the compounded total; volatility is the standard deviation of daily returns × √252; Sharpe = (return − 5.57%) ÷ volatility; max drawdown is the largest daily peak-to-trough fall.</p>
          <p>The charts use weekly closes of the rupee value (re-based to your capital), so the chart drawdown can be a little shallower than the daily figure in the table.</p>
        </Calc>
      </Part>

      {/* F. Expected vs actual */}
      <Part id="rp-f" letter="F · Check" title="Expected vs actual" research lead="The return the model estimated from past prices next to what really happened afterwards.">
        <div className="h-64" role="img" aria-label="Estimated and realised annual return for each portfolio and the NIFTY 50">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evA.map((x) => ({ name: x.label, 'Estimated (past prices)': x.estimated, 'Realised (test year)': x.actual }))} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--c-grid)" />
              <XAxis dataKey="name" tick={AXIS} stroke="var(--c-grid)" interval={0} tickFormatter={(n: string) => (n.length > 18 ? `${n.slice(0, 17)}…` : n)} />
              <YAxis tick={AXIS} stroke="var(--c-grid)" width={48} tickFormatter={(v: number) => formatPct(v, { digits: 0 })} />
              <ReferenceLine y={0} stroke="var(--c-muted2)" />
              <Tooltip contentStyle={TIP} formatter={(v: unknown) => (typeof v === 'number' ? formatPct(v, { sign: true }) : '—')} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="Estimated (past prices)" fill="var(--color-accent-blue)" />
              <Bar dataKey="Realised (test year)" fill="var(--c-fg)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[480px]">
            <thead><tr className="text-left"><th className="py-1 pr-2">Portfolio</th><th className="py-1 pr-2 text-right">Estimated</th><th className="py-1 pr-2 text-right">Realised</th><th className="py-1 text-right">Absolute error</th></tr></thead>
            <tbody>
              {evA.map((x) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="py-1 pr-2">{x.label}</td>
                  <td className="py-1 pr-2 text-right">{x.estimated === null ? <span className="text-muted">not estimated</span> : <Delta x={x.estimated} />}</td>
                  <td className="py-1 pr-2 text-right"><Delta x={x.actual} /></td>
                  <td className="py-1 text-right tabular-nums">{x.absError === null ? '—' : `${(x.absError * 100).toFixed(1)} pts`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted mt-3">
          Optimisation quality is not forecasting accuracy. The optimiser finds the best portfolio for the numbers it is given; it does not make those numbers right. Only one absolute error per portfolio is shown,
          because each portfolio has one estimate and one outcome. Averages such as MAE or RMSE, or a hit rate for the direction, would imply precision that a single observation cannot support. The run does not estimate the index, so the NIFTY 50 has an outcome only.
        </p>
        <Calc>
          <p>Estimated = exp(μ<sub>p</sub>) − 1 with μ<sub>p</sub> from the estimation window. Realised = the annualised return of the same equal-weight portfolio over {testWin}. Absolute error = |estimated − realised|, in percentage points.</p>
        </Calc>
      </Part>

      {/* G. Quantum vs classical */}
      <Part id="rp-g" letter="G · Methods" title="Quantum vs classical" lead="Every method solved the same problem. Here is what each one picked and how it did.">
        {methods && (
          <div className="space-y-3 mb-6">
            <h4 className="text-text">The unseen year, method by method</h4>
            <p className="text-sm text-muted">What {formatINR(capital)} in each method's portfolio did from {testWin}, a period none of them saw. Methods that picked the same stocks draw the same line.</p>
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr className="text-left"><th className="py-1 pr-2">Test year</th>{[...methods.lines, ...(methods.nifty ? [methods.nifty] : [])].map((x) => <th key={x.id} className="py-1 pr-2 text-right">{x.label}</th>)}</tr>
                </thead>
                <tbody>
                  {([
                    ['Return (annualised)', (x: R.MethodLine) => <Delta x={x.ret} />],
                    ['Value of your capital at the end', (x: R.MethodLine) => (x.endValue === null ? '—' : formatINR(x.endValue))],
                    ['Volatility', (x: R.MethodLine) => formatPct(x.vol)],
                    ['Sharpe ratio', (x: R.MethodLine) => fix2(x.sharpe)],
                    ['Max drawdown', (x: R.MethodLine) => (isNum(x.maxDrawdown) ? <span className="text-loss">▼ {formatPct(Math.abs(x.maxDrawdown))}</span> : '—')],
                  ] as [string, (x: R.MethodLine) => ReactNode][]).map(([label, cell]) => (
                    <tr key={label} className="border-t border-line">
                      <td className="py-1 pr-2">{label}</td>
                      {[...methods.lines, ...(methods.nifty ? [methods.nifty] : [])].map((x) => <td key={x.id} className="py-1 pr-2 text-right tabular-nums">{cell(x)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-72" role="img" aria-label="Value of each method's portfolio and of the NIFTY 50 over the test year">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={methods.rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--c-grid)" />
                  <XAxis dataKey="date" tick={AXIS} stroke="var(--c-grid)" minTickGap={40} tickFormatter={(d: string) => (d === 'start' ? 'start' : d.slice(0, 7))} />
                  <YAxis tick={AXIS} stroke="var(--c-grid)" width={72} domain={['auto', 'auto']} tickFormatter={axisINR} />
                  <Tooltip contentStyle={TIP} formatter={(v: unknown) => formatINR(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  {methods.lines.map((x, i) => (
                    <Line key={x.id} name={x.label} dataKey={x.id} stroke="var(--c-fg)" strokeDasharray={DASHES[i % DASHES.length]} dot={false} isAnimationActive={false} strokeWidth={x.id.startsWith('qaoa') ? 2.5 : 1.5} />
                  ))}
                  {methods.nifty && <Line name="NIFTY 50" dataKey="nifty50" stroke="var(--color-accent-blue)" strokeDasharray="6 3" dot={false} isAnimationActive={false} strokeWidth={2} connectNulls />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {methods.lines.some((x) => x.sameAs) && (
              <p className="text-sm text-muted">Same stocks: {methods.lines.filter((x) => x.sameAs).map((x) => `${x.label} picked the same portfolio as ${x.sameAs}`).join('; ')}.</p>
            )}
            <p className="text-sm text-muted">One year is one sample. A method that did better here is not shown to be better in general, and every method solved the same problem with the same estimates.</p>
          </div>
        )}
        <div data-research>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-2">Method</th><th className="py-1 pr-2">Stocks</th><th className="py-1 pr-2 text-right">Est. annual return</th><th className="py-1 pr-2 text-right">Realised</th>
                <th className="py-1 pr-2 text-right">Est. volatility</th><th className="py-1 pr-2 text-right">Objective</th><th className="py-1 pr-2 text-right">Runtime</th><th className="py-1 pr-2">Valid</th><th className="py-1 text-right">Approx. ratio</th>
              </tr>
            </thead>
            <tbody>
              {result.solvers.map((x) => (
                <tr key={x.solver} className="border-t border-line align-top">
                  <td className="py-1 pr-2">{x.label} <span className="text-muted">({x.kind})</span></td>
                  <td className="py-1 pr-2">{x.selection ? x.selection.map(R.symbol).join(', ') : <span className="text-muted">no valid portfolio</span>}</td>
                  <td className="py-1 pr-2 text-right">{isNum(x.exp_return) ? <Delta x={R.simpleAnnual(x.exp_return)} /> : '—'}</td>
                  <td className="py-1 pr-2 text-right">{x.oos ? <Delta x={x.oos.ann_return} /> : '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatPct(x.volatility)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{isNum(x.objective) ? x.objective.toFixed(4) : '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{x.runtime_s.toFixed(2)} s</td>
                  <td className="py-1 pr-2">{x.feasible ? 'yes' : 'no'}</td>
                  <td className="py-1 text-right tabular-nums">{isNum(x.approx_ratio) ? x.approx_ratio.toFixed(3) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted mt-3">
          Size of this problem: {result.qubo.n_vars} binary variables ({result.qubo.n_assets} stocks and {result.qubo.n_slack} helper bits) for {request.k} picks. The QAOA method ran on a classical computer simulating {result.qaoa.circuit.qubits} qubits{request.qaoa.noise ? ' with a simulated noise model' : ' without noise'},
          not on quantum hardware. At this size the exact method finishes almost instantly, so this table shows that the methods can be compared on one task; it does not show that any method is faster or better in general.
          Approx. ratio 1.000 means the exact best portfolio was matched. Methods that picked the same stocks have the same return figures.
        </p>
        <Calc>
          <p>Estimated annual return = exp(μ<sub>p</sub>) − 1 (estimation window). Realised = annualised return over the test window. Objective = risk aversion × variance − (1 − risk aversion) × (return − trading cost); lower is better. Valid means every constraint holds, judged by the same function for every method. A method with no valid sample reports no portfolio rather than a repaired one.</p>
        </Calc>
        </div>
      </Part>

      {/* H. Noise analysis */}
      <Part id="rp-noise" letter="H · Noise" title="Noise analysis" lead="Real quantum chips make errors. Here the same QAOA circuit is sampled again on a simulated IBM chip with real-device error rates, to show what noise does to the answer and to its expected return.">
        {noise ? (
          <>
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead><tr className="text-left"><th className="py-1 pr-2">What we measure</th><th className="py-1 pr-2 text-right">Ideal simulator</th><th className="py-1 text-right">Noisy simulator ({noise.backend})</th></tr></thead>
                <tbody>
                  <tr className="border-t border-line"><td className="py-1 pr-2">Chance of sampling the best portfolio</td><td className="py-1 pr-2 text-right tabular-nums">{formatPct(noise.ideal.p_opt, { digits: 2 })}</td><td className="py-1 text-right tabular-nums">{formatPct(noise.noisy.p_opt, { digits: 2 })}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2">A random guess would get</td><td className="py-1 pr-2 text-right tabular-nums">{formatPct(noise.ideal.p_random, { digits: 2 })}</td><td className="py-1 text-right tabular-nums">{formatPct(noise.noisy.p_random, { digits: 2 })}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2">Samples that obey every rule</td><td className="py-1 pr-2 text-right tabular-nums">{formatPct(noise.ideal.feasible_rate)}</td><td className="py-1 text-right tabular-nums">{formatPct(noise.noisy.feasible_rate)}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2">Approximation ratio (1.000 = best)</td><td className="py-1 pr-2 text-right tabular-nums">{fix2(noise.ideal.approx_ratio)}</td><td className="py-1 text-right tabular-nums">{fix2(noise.noisy.approx_ratio)}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2">Portfolio QAOA would report</td><td className="py-1 pr-2 text-right">{noise.idealPick ? noise.idealPick.selection.map(R.symbol).join(', ') : 'none'}</td><td className="py-1 text-right">{noise.noisyPick ? noise.noisyPick.selection.map(R.symbol).join(', ') : 'none'}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2">Its estimated annual return</td><td className="py-1 pr-2 text-right">{noise.idealPick ? <Delta x={R.simpleAnnual(noise.idealPick.exp_return)} /> : '—'}</td><td className="py-1 text-right">{noise.noisyPick ? <Delta x={R.simpleAnnual(noise.noisyPick.exp_return)} /> : '—'}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2">Its estimated volatility</td><td className="py-1 pr-2 text-right tabular-nums">{formatPct(noise.idealPick?.volatility)}</td><td className="py-1 text-right tabular-nums">{formatPct(noise.noisyPick?.volatility)}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2">Shots (samples taken)</td><td className="py-1 pr-2 text-right tabular-nums">{noise.shots.ideal}</td><td className="py-1 text-right tabular-nums">{noise.shots.noisy ?? '—'}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-3">
              {!noise.noisyPick
                ? 'No noisy sample obeyed every rule, so on this noisy chip QAOA would report no portfolio at all. Samples are never repaired.'
                : noise.noisyPick.same_as_ideal
                  ? `Noise changed how often the best portfolio was sampled (${formatPct(noise.ideal.p_opt, { digits: 2 })} → ${formatPct(noise.noisy.p_opt, { digits: 2 })}), but the best valid noisy sample is the same portfolio, so the expected return is unchanged.`
                  : noise.returnShift !== null
                    ? `Under noise QAOA would report a different portfolio. Its estimated annual return differs by ${formatPct(noise.returnShift, { sign: true })} (about ${signed(capital * noise.returnShift)} a year on ${formatINR(capital)}).`
                    : 'Under noise QAOA would report a portfolio while the noise-free run found none valid.'}
            </p>
            <p className="text-sm text-muted mt-2">
              Compiled for the chip, the circuit has depth {noise.transpiled.depth} and {noise.transpiled.two_qubit_gates} two-qubit gates. Each two-qubit gate adds error, which is why deeper circuits suffer more.
            </p>
            <Calc>
              <p>The QAOA angles are optimised on the ideal simulator; the same circuit and angles are then sampled with the {noise.backend} noise model (an IBM 16-qubit device's gate, readout and decoherence errors), using up to 1,024 shots. Every sample is checked by the same rules as every other method. The reported portfolio is the best valid sample; its estimated return is exp(μ'x / K) − 1 and its volatility √(x'Σx) / K, both from the estimation window. This is a simulation of noise, not a run on real hardware.</p>
            </Calc>
          </>
        ) : (
          <p className="text-sm text-muted">Noise analysis was off for this run. In Quantum research mode, open the advanced quantum settings, turn on IBM Guadalupe noise and run again.</p>
        )}
      </Part>

      {/* I. Heatmaps */}
      <Part id="rp-h" letter="I · Heatmaps" title="Heatmap analysis" lead="The same portfolio seen as colour grids: how the stocks move together, how the methods differ, where the risk sits, and how it did month by month.">
        <div className="space-y-3">
          <details open className="border border-line p-3">
            <summary className="cursor-pointer text-text">Diversification</summary>
            <div className="mt-3 space-y-6">
              <HeatBlock title="Correlation of the picked stocks" answers="Do these stocks move together? Values near +1 mean they rise and fall together, near 0 mean unrelated, below 0 mean they offset each other."
                calc={<><p>Pearson correlation from the estimation-window covariance of daily log returns: ρ<sub>ij</sub> = Σ<sub>ij</sub> ÷ √(Σ<sub>ii</sub> Σ<sub>jj</sub>). The diagonal is 1 and every value lies between −1 and +1.</p><p>It describes {estWin} only. Correlations change, and in a market fall they usually rise.</p></>}>
                {corr ? (
                  <>
                    <Heatmap title="Correlation matrix" rows={corr.tickers.map(R.symbol)} cols={corr.tickers.map(R.symbol)} values={corr.matrix} scale="diverging" domain={[-1, 1]} format={corrFormat} period={`estimation window ${estWin}`} />
                    {pairs && <p className="text-sm text-muted">Average pair: {pairs.mean.toFixed(2)}. Most alike: {R.symbol(pairs.highest.a)} and {R.symbol(pairs.highest.b)} ({pairs.highest.v.toFixed(2)}). Least alike: {R.symbol(pairs.lowest.a)} and {R.symbol(pairs.lowest.b)} ({pairs.lowest.v.toFixed(2)}).</p>}
                    <p className="text-sm text-muted">Picking stocks from different sectors is not the same as being diversified: if correlations are high, the stocks still fall together.</p>
                  </>
                ) : <Unavailable />}
              </HeatBlock>
              <HeatBlock research title="Covariance of the picked stocks" answers="How much do two stocks' swings overlap in absolute terms? The diagonal is each stock's own variance."
                calc={<><p>Annualised covariance of daily log returns × 252, estimation window: the Σ the optimiser uses. Covariance = correlation × both volatilities, so it mixes how related two stocks are with how wild each is; correlation removes the second part.</p></>}>
                {corr ? <Heatmap title="Annualised covariance matrix" rows={corr.tickers.map(R.symbol)} cols={corr.tickers.map(R.symbol)} values={corr.covariance} scale="sequential" format={(v) => v.toFixed(3)} period={`annualised covariance of daily log returns ×252, estimation window ${estWin}`} /> : <Unavailable />}
                <p className="text-sm text-muted">Annualised covariance of daily log returns ×252.</p>
              </HeatBlock>
            </div>
          </details>

          <details open className="border border-line p-3">
            <summary className="cursor-pointer text-text">Composition</summary>
            <div className="mt-3 space-y-6">
              <HeatBlock title="Allocation by method" answers="Did the quantum and classical methods choose the same stocks, and where do they differ?"
                calc={<p>Each cell is the stock's weight in that method's portfolio (equal weight, 1 ÷ K when held, 0 when not). Only methods that found a valid portfolio have a row. Sector cells add up the weights of that sector's stocks.</p>}>
                {alloc.solvers.length ? (
                  <>
                    <Heatmap title="Allocation by method and stock" corner="Method" rows={alloc.solvers.map((x) => x.label)} cols={alloc.tickers.map(R.symbol)} values={alloc.stock} scale="sequential" domain={[0, Math.max(...alloc.stock.flat())]}
                      format={(v) => (v === 0 ? '0' : formatPct(v, { digits: 0 }))} period="weight in the portfolio" />
                    <Heatmap title="Allocation by method and sector" corner="Method" rows={alloc.solvers.map((x) => x.label)} cols={alloc.sectors} values={alloc.sector} scale="sequential" domain={[0, Math.max(...alloc.sector.flat())]}
                      format={(v) => (v === 0 ? '0' : formatPct(v, { digits: 0 }))} period="weight in the portfolio" />
                    <p className="text-sm text-muted">
                      {alloc.allSame ? 'Every method with a valid portfolio picked the same stocks, so the rows match.' : 'The rows differ where the methods chose different stocks.'}
                      {result.solvers.filter((x) => !x.feasible || !x.selection).map((x) => ` ${x.label} found no valid portfolio.`).join('')}
                    </p>
                  </>
                ) : <p className="text-sm text-muted">No method found a valid portfolio.</p>}
              </HeatBlock>
            </div>
          </details>

          <details className="border border-line p-3" data-research>
            <summary className="cursor-pointer text-text">Risk</summary>
            <div className="mt-3 space-y-6">
              <HeatBlock title="Risk contribution vs allocation" answers="Which stocks carry more of the portfolio's risk than their share of the money?"
                calc={<><p>RC<sub>i</sub> = w<sub>i</sub> (Σw)<sub>i</sub> ÷ σ<sub>p</sub>, where Σ is the annualised covariance of the picked stocks and σ<sub>p</sub> = √(wᵀΣw). The risk shares RC<sub>i</sub> ÷ σ<sub>p</sub> add up to 100%.</p><p>A stock whose risk share is above its weight adds more risk than money; the difference row shows it in percentage points.</p></>}>
                {corr && risk ? (
                  <>
                    <Heatmap title="Allocation and risk share" corner="Share of" rows={['Money (weight)', 'Risk']} cols={corr.tickers.map(R.symbol)} values={[corr.tickers.map((t) => h.find((x) => x.ticker === t)?.weight ?? 0), risk.share]}
                      scale="sequential" domain={[0, Math.max(...risk.share, ...h.map((x) => x.weight))]} format={(v) => formatPct(v, { digits: 1 })} period={`estimation window ${estWin}`} />
                    <Heatmap title="Risk share minus weight" corner="Difference" rows={['Risk − money']} cols={corr.tickers.map(R.symbol)} values={[risk.share.map((x, i) => x - (h.find((y) => y.ticker === corr.tickers[i])?.weight ?? 0))]}
                      scale="diverging" format={pctFormat} period={`estimation window ${estWin}`} />
                    <p className="text-sm text-muted">
                      {(() => { const over = corr.tickers.filter((t, i) => risk.share[i] > (h.find((y) => y.ticker === t)?.weight ?? 0) + 0.005).map(R.symbol); return over.length ? `Taking more risk than their weight: ${over.join(', ')}.` : 'No stock takes noticeably more risk than its weight.'; })()}
                      {' '}Portfolio volatility from this matrix: {formatPct(risk.sigma)}.
                    </p>
                  </>
                ) : <Unavailable />}
              </HeatBlock>
            </div>
          </details>

          <details className="border border-line p-3" data-research>
            <summary className="cursor-pointer text-text">Stress</summary>
            <div className="mt-3 space-y-6">
              <HeatBlock title="Scenario returns by stock" answers="In each what-if, which holdings gain or lose most?"
                calc={<p>Cell = the stock's move in that scenario: β × the market move (no company-specific part), floored at −100%. The Portfolio column is the weighted sum; NIFTY 50 is the market move itself. These are the same numbers as in the scenario tables above, and they change when you edit a market move there.</p>}>
                <p className="text-sm text-muted"><strong className="text-text">Hypothetical.</strong> Not forecasts.</p>
                <Heatmap title="Scenario return by stock" corner="Scenario" rows={scen.map((x) => x.scenario.name)} cols={[...h.map((x) => x.symbol), 'Portfolio', 'NIFTY 50']}
                  values={scen.map((x) => [...x.stocks.map((y) => y.move), x.portfolioReturn, x.market])} scale="diverging" format={pctFormat} period="hypothetical scenario" />
              </HeatBlock>
            </div>
          </details>

          <details className="border border-line p-3" data-research>
            <summary className="cursor-pointer text-text">Performance</summary>
            <div className="mt-3 space-y-6">
              <HeatBlock title="Monthly returns in the test year" answers="Which months made and lost money? These are actual historical returns."
                calc={<><p>Month-end to month-end change of the portfolio's rupee value, using the last weekly close of each month (so a month-end is the last Friday close, not always the last trading day). The first month starts at the first day of the test window. The difference row is portfolio minus NIFTY 50, in percentage points.</p><p>Only the one test period exists. A grid of periods, or one comparing estimate and outcome across periods, would have a single cell per method, so those heatmaps are not shown.</p></>}>
                {months12.length ? (
                  <Heatmap title="Monthly returns" corner="Actual" rows={[s.label, 'NIFTY 50', 'Portfolio − NIFTY 50']} cols={months12.map(R.monthLabel)}
                    values={[monthly[0].m.map((x) => x.ret), months12.map((mo) => monthly[1].m.find((x) => x.month === mo)?.ret ?? null),
                      monthly[0].m.map((x) => { const n = monthly[1].m.find((y) => y.month === x.month); return n ? x.ret - n.ret : null; })]}
                    scale="diverging" format={pctFormat} period={`actual, ${testWin}`} />
                ) : <Unavailable />}
                <p className="text-sm text-muted">Actual historical returns, not estimates.</p>
              </HeatBlock>
            </div>
          </details>
        </div>
      </Part>

      {/* I. Data and methodology */}
      <Part id="rp-i" letter="J · Sources" title="Data sources and methodology" research lead="Where the numbers come from and what they leave out.">
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted">
          <li>Prices: Yahoo Finance through the yfinance library (adjusted closes), read from this app's saved copy (source: {data.source}, as of {data.as_of}). The live sources were not checked when this report was made.</li>
          <li>Benchmark: the NSE NIFTY 50 index (^NSEI) over the same test dates. Stocks: today's NIFTY 50 list{data.notes.length ? ` (${data.notes.join(' ')})` : ''}.</li>
          <li>Windows: estimation {estWin} (the only data used for returns, risk and the pre-screen); test {testWin} (only for the backtest, never for estimation).</li>
          <li>Annualisation: mean daily log return × 252 and daily covariance × 252. Risk-free rate 5.57%. Weights are equal across the {request.k} picks.</li>
          <li>Limits: past performance does not guarantee future results; estimates carry large uncertainty; one test year is one sample; no rebalancing, slippage, taxes or separately modelled dividends; the scenarios assume stable betas; today's index list is used for past dates (survivorship bias).</li>
        </ul>
        <p className="text-sm text-text mt-3">Educational tool, not investment advice.</p>
      </Part>

      <Tour open={guide} onClose={() => setGuide(false)} steps={REPORT_TOUR_STEPS} />
      <div id="report-export" className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm text-muted">Take the whole report with you: every table above, with the assumptions, in one file.</p>
        <div className="flex gap-2">
          <button type="button" onClick={download} className="px-4 py-2 text-xs font-mono uppercase bg-accent-blue text-[#fff]">Download CSV</button>
          <button type="button" onClick={() => window.print()} className="px-4 py-2 text-xs font-mono uppercase border border-accent-blue text-accent-blue-hover">Print / Save as PDF</button>
        </div>
      </div>
    </div>
  );
}
