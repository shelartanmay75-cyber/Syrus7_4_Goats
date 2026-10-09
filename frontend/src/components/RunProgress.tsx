import React from 'react';
import { JobStatus } from '../api/types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { negativeClass } from '../lib/chartColors';

interface RunProgressProps {
  jobStatus: JobStatus;
  onCancel: () => void;
}

export const RunProgress: React.FC<RunProgressProps> = ({ jobStatus, onCancel }) => {
  const percent = Math.round((jobStatus.progress || 0) * 100);
  const convergence = jobStatus.convergence || [];
  const latestEnergy = convergence.length > 0 ? convergence[convergence.length - 1].energy : null;

  return (
    <div className="bg-surface border border-accent-blue/40 p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line mb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 bg-accent-blue animate-pulse"></span>
            <h2 className="text-sm font-medium text-text uppercase tracking-wide">
              Executing QAOA &amp; Classical Solvers
            </h2>
          </div>
          <p className="text-xs text-muted mt-1">
            Job ID: <code className="text-text font-mono text-[14px]">{jobStatus.job_id}</code> | Elapsed: <strong className="text-text font-mono">{jobStatus.elapsed_s.toFixed(1)} s</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 min-h-[44px] bg-surface text-text border border-line-strong hover:bg-line hover:text-text text-xs font-medium transition-all self-start sm:self-auto flex items-center justify-center"
        >
          Cancel Optimization
        </button>
      </div>

      {/* Progress Bar & Stage Info */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-xs mb-1.5 font-medium">
          <span className="text-text">{jobStatus.stage}</span>
          <span className="text-text font-medium">{percent}%</span>
        </div>
        <div className="w-full bg-bg h-3 p-0.5 border border-line overflow-hidden">
          <div
            className="bg-text h-full transition-all ease-out"
            style={{ width: `${percent}%` }}
          ></div>
        </div>
      </div>

      {/* Live Convergence Curve */}
      {convergence.length > 0 && (
        <div className="bg-bg border border-line p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-text flex items-center gap-1.5">
              Live Energy Convergence
            </h3>
            <span className="text-[13px] text-muted">
              Latest Energy: <strong className={negativeClass(latestEnergy)}>{latestEnergy?.toFixed(4)}</strong>
            </span>
          </div>

          {/* Recharts container with explicit height wrapper */}
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={convergence} margin={{ top: 8, right: 15, left: 10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
                <XAxis dataKey="iter" stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={12} tickLine={false} />
                <YAxis stroke="var(--c-muted2)" tick={{ fill: 'var(--c-muted2)' }} fontSize={12} tickLine={false} width={50} domain={['auto', 'auto']} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const val = payload[0].value;
                    return (
                      <div className="bg-surface-elevated/95 border border-line-strong backdrop-blur-md px-3 py-2 text-xs text-text shadow-xl">
                        <div className="text-muted font-mono text-[10px] mb-1">Iteration #{label}</div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-muted">Energy F(x):</span>
                          <span className={`font-medium ${negativeClass(val)}`}>{Number(val).toFixed(5)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="energy"
                  stroke="var(--c-fg)"
                  strokeWidth={2}
                  dot={{ r: 2, fill: 'var(--c-fg)' }}
                  activeDot={{ r: 5, fill: 'var(--c-fg)', stroke: 'var(--c-bg2)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
