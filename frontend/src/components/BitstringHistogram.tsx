import React from 'react';
import { Sample } from '../api/types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { CHART_COLORS, formatPercent } from '../lib/chartColors';

interface BitstringHistogramProps {
  samples: Sample[];
}

export const BitstringHistogram: React.FC<BitstringHistogramProps> = ({ samples }) => {
  if (!samples || samples.length === 0) return null;

  // Take top 20 samples sorted by probability
  const topSamples = [...samples]
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 20)
    .map(s => ({
      ...s,
      stateType: s.optimal ? 'Optimal' : s.feasible ? 'Feasible' : 'Infeasible',
      color: s.optimal ? CHART_COLORS.optimal : s.feasible ? CHART_COLORS.feasible : CHART_COLORS.infeasible
    }));

  // "★ optimal" above the optimal bar, so the state is named and not only coloured
  const renderOptimalLabel = (props: any) => {
    const { x, y, width, index } = props;
    if (!topSamples[index]?.optimal) return <g />;
    return (
      <text
        x={index > topSamples.length / 2 ? Number(x) + Number(width) : Number(x)}
        y={Number(y) - 6}
        fill={CHART_COLORS.optimal}
        fontSize={13}
        textAnchor={index > topSamples.length / 2 ? 'end' : 'start'}
      >
        ★ optimal
      </text>
    );
  };

  return (
    <div className="bg-surface border border-line p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line mb-4">
        <div>
          <h2 className="text-sm font-medium text-text flex items-center gap-2 uppercase tracking-wide">
            <span>QAOA Bitstring Sample Probability Distribution</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Top sampled portfolio bitstrings (x0 asset first). Optimal, feasible, and infeasible states marked.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5 text-text">
            <span className="w-3 h-3 bg-text"></span> ★ Optimal
          </span>
          <span className="flex items-center gap-1.5 text-gain">
            <span className="w-3 h-3" style={{ backgroundColor: CHART_COLORS.feasible }}></span> Feasible
          </span>
          <span className="flex items-center gap-1.5 text-loss">
            <span className="w-3 h-3 border" style={{ backgroundColor: CHART_COLORS.infeasible, borderColor: CHART_COLORS.infeasibleStroke }}></span> Infeasible
          </span>
        </div>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topSamples} margin={{ top: 25, right: 15, left: 10, bottom: 65 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
            <XAxis
              dataKey="bitstring"
              stroke="var(--c-muted2)"
              tick={{ fill: 'var(--c-muted2)' }}
              fontSize={11}
              fontFamily="monospace"
              angle={-45}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              stroke="var(--c-muted2)"
              tick={{ fill: 'var(--c-muted2)' }}
              fontSize={12}
              width={52}
              tickFormatter={(v: any) => formatPercent(v, 2)}
            />
            <Tooltip
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.[0]) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-surface-elevated/95 border border-line-strong backdrop-blur-md px-3 py-2 text-xs text-text shadow-xl">
                    <div className="font-mono text-[10px] text-muted mb-1">Bitstring: {label}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                      <span className="text-muted">Probability:</span>
                      <span className="text-right text-text font-medium">{formatPercent(item.prob, 2)}</span>
                      <span className="text-muted">Status:</span>
                      <span className={`text-right font-medium ${item.optimal ? 'text-text' : item.feasible ? 'text-gain' : 'text-loss'}`}>
                        {item.stateType}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="prob" isAnimationActive={false} label={renderOptimalLabel}>
              {topSamples.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke={entry.optimal || entry.feasible ? entry.color : CHART_COLORS.infeasibleStroke}
                  strokeWidth={1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {!topSamples.some(s => s.optimal) && (
        <p className="mt-2 text-[14px] text-muted">
          The exact optimum is not among these {topSamples.length} most probable bitstrings, so no bar is marked Optimal.
        </p>
      )}
    </div>
  );
};
