import React from 'react';
import { Study } from '../api/types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ErrorBar } from 'recharts';
import { getSeriesStyle } from '../lib/chartColors';
import { MarkerGlyph, SolverMarker } from './SolverMarker';

interface StudyChartProps {
  study: Study;
}

export const StudyChart: React.FC<StudyChartProps> = ({ study }) => {
  // Transform multi-series into Recharts flattened rows
  // Map points by x coordinate
  const xValues = Array.from(
    new Set(study.series.flatMap(s => s.points.map(p => p.x)))
  ).sort((a, b) => a - b);

  // Series are keyed s0, s1, ... so a label with a dot or bracket can never break the data lookup
  const chartData = xValues.map(x => {
    const row: Record<string, any> = { x };
    study.series.forEach((s, i) => {
      const pt = s.points.find(p => p.x === x);
      if (pt) {
        row[`s${i}`] = pt.y;
        if (pt.yerr !== null && pt.yerr !== undefined) {
          row[`s${i}_err`] = pt.yerr;
        }
      }
    });
    return row;
  });
  const fmt = (v: any) => (typeof v === 'number' ? v.toFixed(4) : String(v));

  return (
    <div className="bg-surface border border-line p-4 sm:p-6 space-y-5">
      {/* Study Header */}
      <div className="border-b border-line pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-text flex items-center gap-2">
            {study.title}
          </h2>
          <p className="text-xs text-muted mt-1 leading-relaxed max-w-2xl">
            {study.description}
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className="label block">Generated</span>
          <span className="text-xs font-medium text-text">{study.generated_at}</span>
          <span className="text-[13px] text-muted block mt-0.5">Wall time: {Number(study.wall_time_s).toFixed(1)} s</span>
        </div>
      </div>

      {/* Legend in words, outside the SVG so it wraps on a phone */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-text">
        {study.series.map((s, idx) => (
          <span key={idx} className="flex items-center gap-1.5">
            <SolverMarker style={getSeriesStyle(idx)} />
            {s.label}
          </span>
        ))}
      </div>
      <p className="text-[14px] text-muted -mt-2">Vertical axis: {study.y_label}. Error bars show the spread over instances.</p>

      {/* Multi-Series Recharts LineChart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 20, left: 15, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
            <XAxis dataKey="x" stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={12} tickLine={false} />
            <YAxis stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={12} width={52} tickLine={false} />
            <Tooltip
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-surface-elevated/95 border border-line-strong backdrop-blur-md px-3.5 py-2.5 text-xs text-text shadow-xl space-y-1">
                    <div className="font-mono text-[10px] text-muted border-b border-line pb-1">
                      {study.x_label} = {label}
                    </div>
                    {payload.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between items-center gap-4 font-mono text-[11px]">
                        <span className="text-muted">{p.name}:</span>
                        <span className="text-text font-medium">{fmt(p.value)}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />

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
        </ResponsiveContainer>
      </div>
      <p className="text-[14px] text-muted text-center -mt-3">Horizontal axis: {study.x_label}</p>

      {/* Plain table of the plotted values, so single-point series are readable too */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-text">
          <thead>
            <tr className="border-b border-line/60 label">
              <th className="py-2 px-3">Series</th>
              <th className="py-2 px-3 text-right">x</th>
              <th className="py-2 px-3 text-right">Mean ± spread</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {study.series.flatMap((s, i) =>
              s.points.map((p, j) => (
                <tr key={`${i}-${j}`}>
                  <td className="py-2 px-3 font-medium">
                    <span className="inline-block mr-2 align-middle"><SolverMarker style={getSeriesStyle(i)} /></span>
                    {s.label}
                  </td>
                  <td className="py-2 px-3 text-right">{p.x}</td>
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
