import React from 'react';
import { Frontier, SolverResult } from '../api/types';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { CHART_COLORS, getSolverStyle, formatPercent, formatSignedPercent, gainLossClass } from '../lib/chartColors';
import { MarkerGlyph, SolverMarker } from './SolverMarker';

interface FrontierChartProps {
  frontier: Frontier;
  solvers: SolverResult[];
  selectedSolverKey: string;
  onSelectSolver: (key: string) => void;
}

export const FrontierChart: React.FC<FrontierChartProps> = ({
  frontier,
  solvers,
  selectedSolverKey,
  onSelectSolver
}) => {
  // Sort continuous frontier by risk for smooth line rendering
  const continuousData = [...(frontier?.continuous ?? [])]
    .sort((a, b) => a.risk - b.risk)
    .map(p => ({ ...p, name: 'Continuous frontier' }));
  const discreteData = (frontier?.discrete ?? []).map(p => ({
    ...p,
    name: `Discrete frontier: ${(p.selection ?? []).map(t => t.replace('.NS', '')).join(', ')}`
  }));

  // Plottable solver points (filtering null volatility/return)
  const validSolverPoints = solvers
    .filter(s => s.volatility !== null && s.exp_return !== null && s.selection !== null)
    .map(s => ({
      solverKey: s.solver,
      label: s.label,
      risk: s.volatility!,
      ret: s.exp_return!,
      style: getSolverStyle(s.solver),
      isSelected: s.solver === selectedSolverKey
    }));

  const unplottableSolvers = solvers.filter(
    s => s.volatility === null || s.exp_return === null || s.selection === null
  );

  return (
    <div className="bg-surface border border-line p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line mb-4">
        <div>
          <h2 className="text-sm font-medium text-text flex items-center gap-2 uppercase tracking-wide">
            <span>Risk-Return Efficient Frontier</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Long-only Markowitz frontier (line), the discrete frontier of feasible K-stock picks (grey) and each solver's pick.
          </p>
        </div>
      </div>

      {/* Recharts Wrapper */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 15, right: 25, left: 15, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
            <XAxis
              dataKey="risk"
              type="number"
              domain={['auto', 'auto']}
              stroke="var(--c-muted2)"
              tick={{ fill: 'var(--c-muted2)' }}
              fontSize={12}
              tickLine={false}
              tickFormatter={(v: any) => formatPercent(v, 1)}
              label={{ value: 'Annualised Volatility (Risk)', position: 'insideBottom', offset: -12, fill: 'var(--c-muted2)', fontSize: 12 }}
            />
            <YAxis
              dataKey="ret"
              type="number"
              domain={['auto', 'auto']}
              width={52}
              stroke="var(--c-muted2)"
              tick={{ fill: 'var(--c-muted2)' }}
              fontSize={12}
              tickLine={false}
              tickFormatter={(v: any) => formatPercent(v, 1)}
              label={{ value: 'Expected Return', angle: -90, position: 'insideLeft', offset: -5, fill: 'var(--c-muted2)', fontSize: 12 }}
            />
            <Tooltip
              shared={false}
              cursor={false}
              content={({ active, payload }: any) => {
                const p = active ? payload?.[0]?.payload : null;
                if (!p) return null;
                return (
                  <div className="bg-surface-elevated/95 border border-line-strong backdrop-blur-md px-3.5 py-2.5 text-xs text-text shadow-xl">
                    <div className="font-medium text-text border-b border-line pb-1 mb-1.5">
                      {p.name}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                      <span className="text-muted">Volatility:</span>
                      <span className="text-right text-text">{formatPercent(p.risk, 1)}</span>
                      <span className="text-muted">Expected Return:</span>
                      <span className={`text-right font-medium ${gainLossClass(p.ret)}`}>
                        {formatSignedPercent(p.ret, 1)}
                      </span>
                    </div>
                  </div>
                );
              }}
            />

            {/* Continuous Markowitz Frontier Line */}
            <Line
              data={continuousData}
              dataKey="ret"
              stroke={CHART_COLORS.muted}
              strokeWidth={1.5}
              dot={false}
              name="Continuous frontier"
              isAnimationActive={false}
            />

            {/* Discrete frontier of feasible K-stock picks, greyed out */}
            <Scatter
              name="Discrete frontier"
              data={discreteData}
              fill={CHART_COLORS.faint}
              shape="circle"
              isAnimationActive={false}
            />

            {/* Plotted Discrete Solvers */}
            {validSolverPoints.map(point => (
              <Scatter
                key={point.solverKey}
                name={point.label}
                data={[{ risk: point.risk, ret: point.ret, name: point.label }]}
                fill={point.style.color}
                shape={(props: any) => (
                  <MarkerGlyph
                    style={point.style}
                    cx={props.cx ?? props.x}
                    cy={props.cy ?? props.y}
                    scale={point.isSelected ? 1.35 : 1}
                  />
                )}
                isAnimationActive={false}
                onClick={() => onSelectSolver(point.solverKey)}
                className="cursor-pointer"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend in words (colour is never the only signal) */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-muted">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-muted"></span> Continuous frontier</span>
        <span className="flex items-center gap-1.5"><span className="text-faint leading-none">●</span> Discrete frontier</span>
        {validSolverPoints.map(p => (
          <span key={p.solverKey} className="flex items-center gap-1.5">
            <SolverMarker style={p.style} /> {p.label}
          </span>
        ))}
      </div>

      {/* Listed Unplottable Solvers */}
      {unplottableSolvers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line/60 text-xs text-muted flex items-center gap-2">
          <span>⚠ Solvers without valid feasible solutions:</span>
          {unplottableSolvers.map(s => (
            <span key={s.solver} className="px-2 py-0.5 bg-surface border border-line-strong text-text text-[13px]">
              {s.label} (Infeasible)
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
