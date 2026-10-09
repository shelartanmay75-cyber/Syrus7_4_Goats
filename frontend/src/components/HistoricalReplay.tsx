// Historical replay: the worst NIFTY 50 fall inside the test year (weekly closes), and how every method's portfolio
// did over exactly those dates. Uses the run's real test-window prices, which the optimiser never saw.
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Candle, RunResult } from '../api/types';
import { formatINR, formatPct } from '../lib/format';

const AXIS = { stroke: 'var(--c-muted2)', fontSize: 13 };
const DASH = ['', '6 3', '2 3', '10 4 2 4', '4 4'];

/** Weekly value path: the first open, then each week's close, with dates. */
const path = (c: Candle[]) => [{ date: 'start', v: c[0].open }, ...c.map((x) => ({ date: x.date, v: x.close }))];

/** Peak-to-trough of the largest fall in a value path. */
function worstFall(v: number[]): [number, number] {
  let peak = 0, best: [number, number] = [0, 0], depth = 0;
  v.forEach((x, i) => {
    if (x > v[peak]) peak = i;
    const d = x / v[peak] - 1;
    if (d < depth) { depth = d; best = [peak, i]; }
  });
  return best;
}

export function HistoricalReplay({ result }: { result: RunResult }) {
  const candles = result.candles;
  if (!candles?.nifty50?.length) return null;
  const nifty = path(candles.nifty50);
  const [p, t] = worstFall(nifty.map((x) => x.v));
  if (t <= p) return null;

  const methods = result.solvers.filter((s) => s.feasible && candles[s.solver]?.length);
  const capital = result.request.capital;
  const series = [
    ...methods.map((s) => ({ id: s.solver, name: s.label, v: path(candles[s.solver]).map((x) => x.v) })),
    { id: 'nifty50', name: 'NIFTY 50 (benchmark)', v: nifty.map((x) => x.v) },
  ];
  const rows = series.map((s) => {
    const start = s.v[p], end = s.v[t];
    const win = s.v.slice(p, t + 1).map((x) => x / start);
    let peak = 1, dd = 0;
    win.forEach((x) => { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); });
    const back = s.v.findIndex((x, i) => i > t && x >= start);
    return { ...s, ret: end / start - 1, dd, recovery: back < 0 ? null : back - t, endValue: capital * (end / start) };
  });
  // Value of ₹capital invested at the peak, week by week from the peak to the end of the test year.
  const chart = nifty.slice(p).map((pt, j) => Object.fromEntries([
    ['date', pt.date],
    ...series.map((s) => [s.name, Math.round(capital * (s.v[p + j] / s.v[p]))]),
  ]));
  const from = nifty[p].date === 'start' ? result.data.test_window?.[0] : nifty[p].date;

  return (
    <section className="bg-surface border border-line p-4 sm:p-5 space-y-4" aria-labelledby="replay-title">
      <div>
        <h3 id="replay-title" className="text-base text-text">Historical replay: the worst NIFTY 50 fall in the test year</h3>
        <p className="text-sm text-muted mt-1">
          Historical replay, not a forecast. NIFTY 50 fell {formatPct(rows[rows.length - 1].ret)} from {from} to {nifty[t].date} (weekly closes).
          Here is what {formatINR(capital)} in each method's portfolio did over exactly the same dates, with the same stocks, capital and assumptions.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="py-1 pr-2 font-normal">Portfolio</th>
              <th className="py-1 pr-2 font-normal text-right">Start</th>
              <th className="py-1 pr-2 font-normal text-right">End of fall</th>
              <th className="py-1 pr-2 font-normal text-right">Return</th>
              <th className="py-1 pr-2 font-normal text-right">Worst drop</th>
              <th className="py-1 font-normal text-right">Recovered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line">
                <td className="py-1 pr-2">{r.name}</td>
                <td className="py-1 pr-2 text-right">{formatINR(capital)}</td>
                <td className="py-1 pr-2 text-right">{formatINR(r.endValue)}</td>
                <td className={`py-1 pr-2 text-right ${r.ret >= 0 ? 'text-gain' : 'text-loss'}`}>{r.ret >= 0 ? '▲' : '▼'} {formatPct(r.ret, { sign: true })}</td>
                <td className="py-1 pr-2 text-right text-loss">{r.dd < 0 ? `▼ ${formatPct(r.dd, { sign: true })}` : '—'}</td>
                <td className="py-1 text-right text-muted">{r.ret >= 0 ? 'Ended above its start' : r.recovery === null ? 'Not within the test year' : `${r.recovery} weeks later`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="h-64" role="img" aria-label="Value of each portfolio from the NIFTY 50 peak to the end of the test year">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--c-grid)" />
            <XAxis dataKey="date" tick={AXIS} stroke="var(--c-grid)" minTickGap={40} tickFormatter={(d: string) => (d === 'start' ? 'start' : d.slice(0, 7))} />
            <YAxis tick={AXIS} stroke="var(--c-grid)" width={56} domain={['auto', 'auto']} tickFormatter={(v: number) => `₹${(v / 1e5).toFixed(1)}L`} />
            <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line-strong)', fontSize: 13 }} formatter={(v: unknown) => formatINR(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {series.map((s, i) => (
              <Line key={s.id} type="monotone" dataKey={s.name} dot={false} isAnimationActive={false} strokeWidth={s.id === 'nifty50' ? 2 : 1.5}
                stroke={s.id === 'nifty50' ? 'var(--color-accent-blue)' : 'var(--c-fg)'} strokeDasharray={DASH[i % DASH.length]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">How is this calculated?</summary>
        The fall is NIFTY 50's largest peak-to-trough drop on weekly closes inside the test window. Each portfolio is equal-weight
        buy-and-hold from the start of the test window, rescaled so every portfolio starts the fall at the same amount. Transaction
        costs, dividends and taxes are not included. One period is not proof: a method that did better in this fall is not automatically better.
      </details>
    </section>
  );
}
