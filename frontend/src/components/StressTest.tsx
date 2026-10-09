// Market crash stress tests: three what-if scenarios on the chosen portfolio, computed from this run's own numbers.
// Betas and volatility come from the estimation window only. These are estimates, not predictions.
import { useMemo, useState, type ReactNode } from 'react';
import type { SolverResult } from '../api/types';
import { formatINR, formatPct } from '../lib/format';

// One-month normal model at 95%: VaR = 1.645·σ·√(1/12); Expected Shortfall = σ·√(1/12)·φ(1.645)/0.05 = 2.063·σ·√(1/12).
const Z95 = 1.645;
const ES95 = 2.063;

function Slider({ label, value, min, max, step, onChange, show }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: string;
}) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between"><span className="text-muted">{label}</span><span className="font-medium">{show}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-1" />
    </label>
  );
}

function Loss({ pct, amount }: { pct: number; amount: number }) {
  return (
    <p className="mt-3 text-2xl font-medium text-loss">
      ▼ {formatPct(-pct, { sign: true })} <span className="text-base">(−{formatINR(amount)})</span>
    </p>
  );
}

function How({ children }: { children: ReactNode }) {
  return (
    <details className="text-xs text-muted mt-2">
      <summary className="cursor-pointer">How is this calculated?</summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

export function StressTest({ solver, betas }: { solver: SolverResult; betas?: Record<string, number> | null }) {
  const rows = solver.portfolio?.rows ?? [];
  const invested = solver.portfolio?.invested ?? 0;
  const [drop, setDrop] = useState(20);
  const [volX, setVolX] = useState(2);
  const sectors = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.sector, (m.get(r.sector) ?? 0) + r.value / invested));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, invested]);
  const [sector, setSector] = useState<string | null>(null);
  const [sectorDrop, setSectorDrop] = useState(25);

  if (!rows.length || invested <= 0) return null;

  // 1. Market-wide crash: each stock falls beta x the market fall; the portfolio loss is the weighted sum.
  const stocks = rows
    .map((r) => {
      const w = r.value / invested;
      const b = betas?.[r.ticker] ?? 1;
      const ret = -Math.min(1, b * drop / 100);
      return { ...r, w, b, ret, contrib: w * ret, rupees: r.value * ret, missing: betas?.[r.ticker] === undefined };
    })
    .sort((a, b) => a.contrib - b.contrib);
  const crash = -stocks.reduce((s, x) => s + x.contrib, 0);
  const beta = stocks.reduce((s, x) => s + x.w * x.b, 0);

  // 2. Volatility spike: tail-loss thresholds for one month, at normal and stressed volatility.
  const vol = solver.volatility ?? 0;
  const m = (k: number) => (vol * k) / Math.sqrt(12);
  const varAt = (k: number) => Math.min(1, Z95 * m(k));
  const esAt = (k: number) => Math.min(1, ES95 * m(k));

  // 3. Sector shock: one sector falls, the rest is unchanged.
  const [topName, topW] = sectors[0];
  const chosen = sector ?? topName;
  const chosenW = sectors.find(([s]) => s === chosen)?.[1] ?? 0;
  const sectorLoss = chosenW * sectorDrop / 100;

  return (
    <section className="bg-surface border border-line p-4 sm:p-5 space-y-4" aria-labelledby="stress-title">
      <div>
        <h3 id="stress-title" className="text-base text-text">Market crash stress test</h3>
        <p className="text-sm text-muted mt-1">
          How this portfolio of {formatINR(invested)} ({solver.label}) might hold up in a bad market, before you invest real money.
          What-if estimates from historical data, not predictions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-bg border border-line p-4">
          <h4 className="text-sm">1. Market-wide crash</h4>
          <Slider label="The market falls by" value={drop} min={5} max={40} step={5} onChange={setDrop} show={`${drop}%`} />
          <Loss pct={crash} amount={invested * crash} />
          <p className="text-sm text-muted mt-2">
            Value after the fall: {formatINR(invested * (1 - crash))}. Your portfolio moves about {beta.toFixed(2)}× the market
            {beta > 1.05 ? ', so it would fall more than the market' : beta < 0.95 ? ', so it would fall less than the market' : ', about the same as the market'}.
            See which stocks drive it below.
          </p>
          <How>
            Each stock falls by its beta × the market fall; the portfolio loss is the sum of weight × that fall. Beta is each stock's
            sensitivity to the equal-weight average of your stock list, from the estimation window only
            {stocks.some((x) => x.missing) ? '; stocks without a beta count as 1.0' : ''}. In real crashes stocks tend to fall together, so actual losses can be larger.
          </How>
        </div>

        <div className="bg-bg border border-line p-4">
          <h4 className="text-sm">2. Volatility spike</h4>
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="How much more prices swing">
            {[1, 1.5, 2, 3].map((k) => (
              <button key={k} type="button" onClick={() => setVolX(k)} aria-pressed={volX === k}
                className={`px-3 py-1 border text-sm ${volX === k ? 'border-accent-blue text-accent-blue-hover' : 'border-line-strong text-muted'}`}>
                {k === 1 ? 'Normal' : `${k}× swings`}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted mt-3">
            Bigger swings do not mean prices must fall; they widen the range of outcomes both ways. Over one month at {volX === 1 ? 'normal' : `${volX}×`} swings:
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="border border-line p-2">
              <dt className="text-muted">1-in-20 bad month (VaR 95%)</dt>
              <dd className="text-loss font-medium">▼ {formatPct(varAt(volX))} · {formatINR(invested * varAt(volX))}</dd>
            </div>
            <div className="border border-line p-2">
              <dt className="text-muted">Average of those bad months (ES 95%)</dt>
              <dd className="text-loss font-medium">▼ {formatPct(esAt(volX))} · {formatINR(invested * esAt(volX))}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted mt-2">Yearly volatility: {formatPct(vol)} normally, {formatPct(vol * volX)} in this scenario.</p>
          <How>
            Normal-returns model, one-month horizon, zero mean. VaR 95% = 1.645 × yearly volatility × multiplier ÷ √12: the loss exceeded in 1 month out of 20.
            Expected Shortfall 95% = 2.063 × yearly volatility × multiplier ÷ √12: the average loss in those worst months. Real markets have fatter tails than this model.
          </How>
        </div>

        <div className="bg-bg border border-line p-4">
          <h4 className="text-sm">3. Sector-specific shock</h4>
          <label className="block text-sm mt-1">
            <span className="text-muted">Sector that falls</span>
            <select value={chosen} onChange={(e) => setSector(e.target.value)} className="w-full mt-1 border px-2 py-1">
              {sectors.map(([s, w]) => <option key={s} value={s}>{s} ({formatPct(w, { digits: 0 })} of portfolio)</option>)}
            </select>
          </label>
          <Slider label="It falls by" value={sectorDrop} min={5} max={50} step={5} onChange={setSectorDrop} show={`${sectorDrop}%`} />
          <Loss pct={sectorLoss} amount={invested * sectorLoss} />
          <p className="text-sm text-muted mt-2">
            {formatPct(chosenW, { digits: 0 })} of your money is in {chosen}; the other sectors are assumed unchanged.
            {topW > 0.4 ? ` Warning: ${formatPct(topW, { digits: 0 })} sits in one sector (${topName}), a large concentration.` : ` Your largest sector is ${formatPct(topW, { digits: 0 })} (${topName}).`}
          </p>
          <table className="w-full text-xs mt-2">
            <caption className="text-left text-muted mb-1">The same {sectorDrop}% fall in each of your sectors</caption>
            <tbody>
              {sectors.map(([s, w]) => (
                <tr key={s} className={s === chosen ? 'text-text' : 'text-muted'}>
                  <td className="py-0.5">{s}</td>
                  <td className="py-0.5 text-right text-loss">▼ {formatPct(w * sectorDrop / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <How>Portfolio loss = sector weight × sector fall. Other sectors are held flat, so this isolates concentration risk.</How>
        </div>
      </div>

      <div>
        <h4 className="text-sm text-text">What is driving the loss? (market falls {drop}%)</h4>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="py-1 pr-2 font-normal">Stock</th>
                <th className="py-1 pr-2 font-normal">Sector</th>
                <th className="py-1 pr-2 font-normal text-right">Weight</th>
                <th className="py-1 pr-2 font-normal text-right">Beta</th>
                <th className="py-1 pr-2 font-normal text-right">Stock falls</th>
                <th className="py-1 pr-2 font-normal text-right">Share of portfolio loss</th>
                <th className="py-1 font-normal text-right">₹ loss</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((x) => (
                <tr key={x.ticker} className="border-b border-line">
                  <td className="py-1 pr-2">{x.symbol ?? x.ticker}</td>
                  <td className="py-1 pr-2 text-muted">{x.sector}</td>
                  <td className="py-1 pr-2 text-right">{formatPct(x.w)}</td>
                  <td className="py-1 pr-2 text-right">{x.missing ? '1.00*' : x.b.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right text-loss">▼ {formatPct(-x.ret)}</td>
                  <td className="py-1 pr-2 text-right">{formatPct(crash > 0 ? x.contrib / -crash : 0, { digits: 0 })}</td>
                  <td className="py-1 text-right text-loss">−{formatINR(-x.rupees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-1">
          Stocks with beta above 1 add more than their weight to the loss; below 1 they soften it. Contribution = weight × the stock's fall; fixed starting weights, no cash flows.
        </p>
      </div>
    </section>
  );
}
