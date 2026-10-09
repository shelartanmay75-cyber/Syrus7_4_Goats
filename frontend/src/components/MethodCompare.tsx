// Visual comparison of the four methods: weekly candlesticks of each portfolio's value over the test year,
// and grouped bars of the headline numbers. Methods that picked the same stocks share one chart.
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Candle, RunResult } from '../api/types';
import { formatINR, formatPct } from '../lib/format';

const AXIS = { stroke: 'var(--c-muted2)', fontSize: 13 };

/** Draws one candle inside the [low, high] range bar Recharts lays out. */
function CandleShape(props: { x?: number; y?: number; width?: number; height?: number; payload?: Candle }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const span = Math.max(high - low, 1);
  const at = (v: number) => y + ((high - v) / span) * height;
  const up = close >= open;
  const color = up ? 'var(--c-gain2)' : 'var(--c-loss2)';
  const top = at(Math.max(open, close));
  const bodyH = Math.max(1, Math.abs(at(open) - at(close)));
  const cx = x + width / 2;
  const w = Math.max(2, width * 0.7);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} />
      {/* Up weeks are hollow, down weeks filled, so colour is not the only signal */}
      <rect x={cx - w / 2} y={top} width={w} height={bodyH} stroke={color} fill={up ? 'var(--color-bg)' : color} />
    </g>
  );
}

function CandleChart({ title, candles, domain, same }: { title: string; candles: Candle[]; domain: [number, number]; same?: string | null }) {
  const last = candles[candles.length - 1];
  const change = last ? last.close / candles[0].open - 1 : 0;
  return (
    <div className="bg-bg border border-line p-3">
      <div className="flex justify-between gap-2 text-sm">
        <span className="text-text">{title}{same && <span className="text-muted"> · same stocks as {same}</span>}</span>
        <span className={change >= 0 ? 'text-gain' : 'text-loss'}>{change >= 0 ? '▲' : '▼'} {formatPct(change, { sign: true })}</span>
      </div>
      <div className="h-48 mt-2" role="img" aria-label={`${title}: weekly value, ${formatPct(change, { sign: true })} over the test year`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={candles} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--c-grid)" />
            <XAxis dataKey="date" tick={AXIS} stroke="var(--c-grid)" minTickGap={40} tickFormatter={(d: string) => d.slice(0, 7)} />
            <YAxis domain={domain} tick={AXIS} stroke="var(--c-grid)" width={56} tickFormatter={(v: number) => `₹${(v / 1e5).toFixed(1)}L`} />
            <Tooltip
              contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line-strong)', fontSize: 13 }}
              formatter={(_v: unknown, _n: unknown, item: { payload?: Candle }) => {
                const c = item.payload as Candle;
                return [`O ${formatINR(c.open)} · H ${formatINR(c.high)} · L ${formatINR(c.low)} · C ${formatINR(c.close)}`, 'Week'];
              }}
            />
            <Bar dataKey={(c: Candle) => [c.low, c.high]} shape={<CandleShape />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MethodCompare({ result }: { result: RunResult }) {
  const candles = result.candles;
  const feasible = result.solvers.filter((s) => s.feasible && s.selection && candles?.[s.solver]?.length);
  if (!candles || !feasible.length) return null;

  // One chart per method; a method that picked the same stocks as an earlier one says so.
  const key = (sel: string[] | null) => [...(sel ?? [])].sort().join(',');
  const series = [
    ...feasible.map((s, i) => ({
      title: s.label,
      candles: candles[s.solver],
      solver: s,
      same: feasible.slice(0, i).find((p) => key(p.selection) === key(s.selection))?.label ?? null,
    })),
    ...(candles.nifty50?.length ? [{ title: 'NIFTY 50 index (benchmark)', candles: candles.nifty50, solver: null, same: null }] : []),
  ];
  const allSame = feasible.every((s) => key(s.selection) === key(feasible[0].selection));
  const all = series.flatMap((s) => s.candles);
  const pad = (Math.max(...all.map((c) => c.high)) - Math.min(...all.map((c) => c.low))) * 0.05;
  const domain: [number, number] = [Math.floor(Math.min(...all.map((c) => c.low)) - pad), Math.ceil(Math.max(...all.map((c) => c.high)) + pad)];

  const bars = series.map((s) => ({
    name: s.solver ? s.solver.label : 'NIFTY 50',
    'Expected return': s.solver?.exp_return ?? null,
    'Test-year return': s.solver ? s.solver.oos?.ann_return ?? null : result.benchmarks.nifty50?.ann_return ?? null,
    'Worst drop': s.solver ? s.solver.oos?.max_drawdown ?? null : result.benchmarks.nifty50?.max_drawdown ?? null,
  }));

  return (
    <section className="bg-surface border border-line p-4 sm:p-5 space-y-4" aria-labelledby="compare-title">
      <div>
        <h3 id="compare-title" className="text-base text-text">Compare the methods</h3>
        <p className="text-sm text-muted mt-1">
          How each method's portfolio of {formatINR(result.request.capital)} actually moved in the test year ({result.data.test_window?.[0]} to {result.data.test_window?.[1]}),
          a period the optimiser never saw. One candle per week: hollow green = the week ended up, filled red = it ended down.
          {allSame && feasible.length > 1 && ' All methods that found a valid portfolio picked the same stocks this time, so their charts match.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {series.map((s) => <CandleChart key={s.title} title={s.title} candles={s.candles} domain={domain} same={s.same} />)}
      </div>

      <div>
        <h4 className="text-sm text-text">The numbers side by side</h4>
        <div className="h-64 mt-2" role="img" aria-label="Expected return, test-year return and worst drop for each method and NIFTY 50">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--c-grid)" />
              <XAxis dataKey="name" tick={AXIS} stroke="var(--c-grid)" interval={0} tickFormatter={(n: string) => (n.length > 22 ? `${n.slice(0, 21)}…` : n)} />
              <YAxis tick={AXIS} stroke="var(--c-grid)" width={48} tickFormatter={(v: number) => formatPct(v, { digits: 0 })} />
              <ReferenceLine y={0} stroke="var(--c-muted2)" />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line-strong)', fontSize: 13 }}
                formatter={(v: unknown) => (typeof v === 'number' ? formatPct(v, { sign: true }) : '—')} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="Expected return" fill="var(--color-accent-blue)" />
              <Bar dataKey="Test-year return" fill="var(--c-fg)" />
              <Bar dataKey="Worst drop" fill="var(--c-mid)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted mt-2">
          Expected return is what the optimiser estimated from past prices. Test-year return and worst drop are what really happened afterwards.
          Past results do not guarantee future returns.
        </p>
      </div>
    </section>
  );
}
