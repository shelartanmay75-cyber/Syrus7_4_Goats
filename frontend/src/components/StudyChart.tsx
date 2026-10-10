import React from 'react';
import { Study } from '../api/types';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ErrorBar } from 'recharts';
import { getSeriesStyle } from '../lib/chartColors';
import { MarkerGlyph, SolverMarker } from './SolverMarker';

interface StudyChartProps {
  study: Study;
}

// Bars need distinct fills (the line palette tells series apart by marker shape instead).
const BAR_FILLS = ['var(--c-fg)', 'var(--color-accent-blue)', 'var(--c-mid)', 'var(--c-muted2)'];

interface BarSeries { label: string; values: (number | null)[]; errs: (number | null)[] }

/**
 * Studies whose horizontal axis is a choice ("Mixer (0 = Standard mixer, 1 = XY mixer + Dicke)") are drawn as grouped bars:
 * a line between two unrelated options means nothing. Series are regrouped so each option's bars sit together.
 * Returns null for a numeric axis (circuit depth), which stays a line chart.
 */
function categorical(study: Study): { cats: string[]; series: BarSeries[] } | null {
  const names = new Map([...study.x_label.matchAll(/(\d+)\s*=\s*([^,)]+)/g)].map(([, x, n]) => [Number(x), n.trim()]));
  if (names.size < 2) return null;
  const xs = [...names.keys()].sort((a, b) => a - b);
  const cats = xs.map((x) => names.get(x) as string);
  const at = (pts: Study['series'][number]['points'], x: number) => pts.find((p) => p.x === x);
  // "Option: metric" labels, each on its own option -> one series per metric across the options (mixer study).
  const parts = study.series.map((s) => {
    const i = s.label.indexOf(': ');
    return i > 0 ? [s.label.slice(0, i), s.label.slice(i + 2)] : null;
  });
  if (parts.every((p, k) => p && study.series[k].points.every((pt) => names.get(pt.x) === p[0]))) {
    const metrics = [...new Set(parts.map((p) => (p as string[])[1]))];
    return {
      cats,
      series: metrics.map((m) => {
        const pts = xs.map((x) => {
          const k = parts.findIndex((p) => p && p[1] === m && p[0] === names.get(x));
          return k >= 0 ? at(study.series[k].points, x) : undefined;
        });
        return { label: m, values: pts.map((p) => p?.y ?? null), errs: pts.map((p) => p?.yerr ?? null) };
      }),
    };
  }
  // One point per series, named after its option -> a single series (optimiser and initialisation studies).
  if (study.series.every((s) => s.points.length === 1 && names.get(s.points[0].x) === s.label)) {
    const pts = xs.map((x) => study.series.find((s) => s.points[0].x === x)?.points[0]);
    return { cats, series: [{ label: study.y_label, values: pts.map((p) => p?.y ?? null), errs: pts.map((p) => p?.yerr ?? null) }] };
  }
  // Series are metrics measured at every option (noise study).
  return {
    cats,
    series: study.series.map((s) => {
      const pts = xs.map((x) => at(s.points, x));
      return { label: s.label, values: pts.map((p) => p?.y ?? null), errs: pts.map((p) => p?.yerr ?? null) };
    }),
  };
}

export const StudyChart: React.FC<StudyChartProps> = ({ study }) => {
  const cat = categorical(study);
  const xName = (x: number) => (cat ? study.x_label.match(new RegExp(`${x}\\s*=\\s*([^,)]+)`))?.[1]?.trim() ?? String(x) : String(x));

  // Line mode: series are keyed s0, s1, ... so a label with a dot or bracket can never break the data lookup
  const xValues = Array.from(new Set(study.series.flatMap(s => s.points.map(p => p.x)))).sort((a, b) => a - b);
  const lineData = xValues.map(x => {
    const row: Record<string, any> = { x };
    study.series.forEach((s, i) => {
      const pt = s.points.find(p => p.x === x);
      if (pt) {
        row[`s${i}`] = pt.y;
        if (pt.yerr !== null && pt.yerr !== undefined) row[`s${i}_err`] = pt.yerr;
      }
    });
    return row;
  });
  const barData = cat
    ? cat.cats.map((name, j) => Object.fromEntries([['name', name], ...cat.series.flatMap((s, i) => [[`s${i}`, s.values[j]], [`s${i}_err`, s.errs[j]]])]))
    : [];
  const fmt = (v: any) => (typeof v === 'number' ? v.toFixed(4) : String(v));
  const tooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface-elevated/95 border border-line-strong backdrop-blur-md px-3.5 py-2.5 text-xs text-text shadow-xl space-y-1">
        <div className="font-mono text-[12px] text-muted border-b border-line pb-1">{cat ? label : `${study.x_label} = ${label}`}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex justify-between items-center gap-4 font-mono text-[13px]">
            <span className="text-muted">{p.name}:</span>
            <span className="text-text font-medium">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-surface border border-line p-4 sm:p-6 space-y-5">
      {/* Study Header */}
      <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-text flex items-center gap-2">{study.title}</h2>
          <p className="text-xs text-muted mt-1 leading-relaxed max-w-2xl">{study.description}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="label block">Generated</span>
          <span className="text-xs font-medium text-text">{study.generated_at}</span>
          <span className="text-[13px] text-muted block mt-0.5">Wall time: {Number(study.wall_time_s).toFixed(1)} s</span>
        </div>
      </div>

      {/* Legend in words, outside the SVG so it wraps on a phone */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-text">
        {(cat ? cat.series.map(s => s.label) : study.series.map(s => s.label)).map((label, idx) => (
          <span key={idx} className="flex items-center gap-1.5">
            {cat
              ? <span className="inline-block w-3 h-3" style={{ background: BAR_FILLS[idx % BAR_FILLS.length] }} aria-hidden="true" />
              : <SolverMarker style={getSeriesStyle(idx)} />}
            {label}
          </span>
        ))}
      </div>
      <p className="text-[14px] text-muted -mt-2">Vertical axis: {study.y_label}. Error bars show the spread over instances.</p>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {cat ? (
            <BarChart data={barData} margin={{ top: 12, right: 20, left: 15, bottom: 8 }} barGap={4} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={13} tickLine={false} interval={0} />
              <YAxis stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={12} width={52} tickLine={false} />
              <Tooltip content={tooltip} cursor={{ fill: 'var(--color-accent-blue-subtle)' }} />
              {cat.series.map((s, idx) => (
                <Bar key={idx} name={s.label} dataKey={`s${idx}`} fill={BAR_FILLS[idx % BAR_FILLS.length]} isAnimationActive={false}>
                  <ErrorBar dataKey={`s${idx}_err`} stroke="var(--c-muted2)" width={6} />
                </Bar>
              ))}
            </BarChart>
          ) : (
            <LineChart data={lineData} margin={{ top: 12, right: 20, left: 15, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
              <XAxis dataKey="x" stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={12} tickLine={false} />
              <YAxis stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={12} width={52} tickLine={false} />
              <Tooltip content={tooltip} />
              {study.series.map((s, idx) => {
                const st = getSeriesStyle(idx);
                return (
                  <Line
                    key={idx}
                    type="monotone"
                    name={s.label}
                    dataKey={`s${idx}`}
                    stroke={st.color}
                    strokeWidth={2}
                    strokeDasharray={st.dashed ? '6 4' : undefined}
                    dot={(p: any) => <MarkerGlyph key={`d-${idx}-${p.index}`} style={st} cx={p.cx} cy={p.cy} />}
                    activeDot={(p: any) => <MarkerGlyph key={`a-${idx}-${p.index}`} style={st} cx={p.cx} cy={p.cy} scale={1.4} />}
                    isAnimationActive={false}
                  >
                    <ErrorBar dataKey={`s${idx}_err`} stroke={st.color} width={4} />
                  </Line>
                );
              })}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="text-[14px] text-muted text-center -mt-3">Horizontal axis: {cat ? study.x_label.replace(/\s*\(.*\)\s*$/, '') : study.x_label}</p>

      {/* Plain table of the plotted values */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-text">
          <thead>
            <tr className="border-b border-line/60 label">
              <th className="py-2 px-3">Series</th>
              <th className="py-2 px-3 text-right">{cat ? 'Option' : 'x'}</th>
              <th className="py-2 px-3 text-right">Mean ± spread</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {study.series.flatMap((s, i) =>
              s.points.map((p, j) => (
                <tr key={`${i}-${j}`}>
                  <td className="py-2 px-3 font-medium">
                    {!cat && <span className="inline-block mr-2 align-middle"><SolverMarker style={getSeriesStyle(i)} /></span>}
                    {s.label}
                  </td>
                  <td className="py-2 px-3 text-right">{xName(p.x)}</td>
                  <td className="py-2 px-3 text-right">
                    {fmt(p.y)}{p.yerr !== null && p.yerr !== undefined ? ` ± ${fmt(p.yerr)}` : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Instance Metadata Footer & Notes */}
      <div className="pt-4 border-t border-line grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-bg p-3.5 border border-line/60">
          <span className="label block mb-1">Instance Configuration</span>
          <div className="grid grid-cols-2 gap-2 text-text text-[14px]">
            <div>Assets: <strong>{study.instance.n_assets}</strong></div>
            <div>Cardinality K: <strong>{study.instance.k}</strong></div>
            <div>Risk q: <strong>{study.instance.q}</strong></div>
            <div>Shots: <strong>{study.instance.shots}</strong></div>
          </div>
          <div className="text-[13px] text-muted mt-2">
            Seeds: [{(study.instance.seeds ?? []).join(', ')}]
          </div>
        </div>

        <div className="bg-bg p-3.5 border border-line/60">
          <span className="label block mb-1">Notes &amp; Execution Environment</span>
          <ul className="list-disc list-inside text-muted text-[14px] space-y-1">
            {(study.notes ?? []).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
