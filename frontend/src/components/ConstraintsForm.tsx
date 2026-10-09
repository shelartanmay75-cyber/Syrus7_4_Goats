import React, { useState } from 'react';
import { GlossaryTermTooltip } from './Glossary';

interface ConstraintsFormProps {
  k: number;
  setK: (val: number) => void;
  riskAversion: number;
  setRiskAversion: (val: number) => void;
  sectorCap: number | null;
  setSectorCap: (val: number | null) => void;
  targetReturn: number | null;
  setTargetReturn: (val: number | null) => void;
  capital: number;
  setCapital: (val: number) => void;
  holdingsText: string;
  setHoldingsText: (val: string) => void;
  maxKLimit?: number;
}

export const ConstraintsForm: React.FC<ConstraintsFormProps> = ({
  k,
  setK,
  riskAversion,
  setRiskAversion,
  sectorCap,
  setSectorCap,
  targetReturn,
  setTargetReturn,
  capital,
  setCapital,
  holdingsText,
  setHoldingsText,
  maxKLimit = 15
}) => {
  const [showAdditional, setShowAdditional] = useState<boolean>(false);

  // Active constraints count for badge
  const activeAdditionalCount = (sectorCap !== null ? 1 : 0) + (targetReturn !== null ? 1 : 0) + (holdingsText.trim() ? 1 : 0);

  return (
    <div className="bg-surface border border-line p-5 space-y-5">
      {/* Section Header */}
      <div data-research className="pb-3 border-b border-line flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text uppercase tracking-wide">
            Portfolio &amp; Risk Parameters
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Configure cardinality K, Markowitz risk penalty q, and inequality slack terms.
          </p>
        </div>
        <span className="text-[13px] font-mono text-muted px-2 py-0.5 bg-bg border border-line">
          QUBO &amp; SLACK
        </span>
      </div>

      {/* Primary Prominent Controls: K (Cardinality) & q (Risk Aversion) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-bg p-4 border border-line">
        {/* Exact Stock Picks (k) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label htmlFor="k" className="text-xs font-medium text-text flex items-center gap-1.5">
              <span>Exact Stock Picks (K)</span>
              <GlossaryTermTooltip termKey="qubo">
                <span className="text-muted hover:text-text cursor-help text-[14px]">[?]</span>
              </GlossaryTermTooltip>
            </label>
            <span className="text-xs font-mono font-medium text-text bg-surface-elevated px-2.5 py-0.5 border border-line-strong">
              K = {k} stocks
            </span>
          </div>

          <input
            id="k"
            type="range"
            min={2}
            max={maxKLimit}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            className="w-full accent-white bg-surface h-2 cursor-pointer"
          />

          <div className="flex justify-between text-[13px] font-mono text-muted">
            <span>2 (Concentrated)</span>
            <span>{maxKLimit} (Broad Market)</span>
          </div>
          <p className="text-[14px] text-faint">
            Strict equality constraint: exactly {k} stocks must be selected.
          </p>
        </div>

        {/* Risk Aversion Parameter (q) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label htmlFor="risk-aversion" className="text-xs font-medium text-text flex items-center gap-1.5">
              <span>Risk Aversion Parameter (q)</span>
            </label>
            <span className="text-xs font-mono font-medium text-text bg-surface-elevated px-2.5 py-0.5 border border-line-strong">
              q = {riskAversion.toFixed(2)} ({riskAversion < 0.35 ? 'Growth' : riskAversion > 0.65 ? 'Defensive' : 'Balanced'})
            </span>
          </div>

          <input
            id="risk-aversion"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={riskAversion}
            onChange={(e) => setRiskAversion(Number(e.target.value))}
            className="w-full accent-white bg-surface h-2 cursor-pointer"
          />

          <div className="flex justify-between text-[13px] font-mono text-muted">
            <span>0.0 (Max Return)</span>
            <span>0.5 (Balanced)</span>
            <span>1.0 (Min Variance)</span>
          </div>
          <p className="text-[14px] text-faint">
            Objective trade-off: higher q prioritizes low covariance risk over expected return.
          </p>
        </div>
      </div>

      {/* Collapsible Additional Constraints Section */}
      <div data-research className="border border-line bg-surface-card">
        <button
          type="button"
          onClick={() => setShowAdditional(!showAdditional)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface-elevated transition-colors"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-medium text-text uppercase tracking-wider">
              Additional Constraints &amp; Capital
            </span>
            {activeAdditionalCount > 0 ? (
              <span className="text-[13px] font-mono px-2 py-0.5 bg-accent-blue/15 text-accent-blue-hover border border-accent-blue/40">
                {activeAdditionalCount} ACTIVE
              </span>
            ) : (
              <span className="text-[13px] font-mono text-faint">
                OPTIONAL
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-muted">
            {showAdditional ? '▲ HIDE' : '▼ CONFIGURE'}
          </span>
        </button>

        {showAdditional && (
          <div className="p-4 border-t border-line space-y-5 bg-bg/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Sector Cap Constraint */}
              <div className="p-3.5 bg-surface border border-line space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="sector-cap" className="text-xs font-medium text-text">
                    Sector Diversification Cap
                  </label>
                  <button
                    type="button"
                    onClick={() => setSectorCap(sectorCap === null ? 2 : null)}
                    className={`text-xs px-2.5 py-1 font-mono transition-colors border ${
                      sectorCap === null
                        ? 'bg-bg text-muted border-line'
                        : 'bg-surface-elevated text-white border-accent-blue/60 font-medium'
                    }`}
                  >
                    {sectorCap === null ? 'DISABLED' : `ENABLED (≤${sectorCap})`}
                  </button>
                </div>

                {sectorCap !== null ? (
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      id="sector-cap"
                      type="number"
                      min={1}
                      max={5}
                      value={sectorCap}
                      onChange={(e) => setSectorCap(Math.max(1, Math.min(5, Number(e.target.value))))}
                      className="w-20 min-h-[36px] bg-bg border border-line px-2.5 py-1 text-xs text-text font-mono focus:border-text"
                    />
                    <span className="text-[14px] text-muted">Max stocks allowed from any single industry</span>
                  </div>
                ) : (
                  <p className="text-[14px] text-faint">
                    No sector concentration ceiling applied.
                  </p>
                )}
              </div>

              {/* Target Net Return Constraint */}
              <div className="p-3.5 bg-surface border border-line space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="target-return" className="text-xs font-medium text-text">
                    Target Annual Return Floor
                  </label>
                  <button
                    type="button"
                    onClick={() => setTargetReturn(targetReturn === null ? 0.08 : null)}
                    className={`text-xs px-2.5 py-1 font-mono transition-colors border ${
                      targetReturn === null
                        ? 'bg-bg text-muted border-line'
                        : 'bg-surface-elevated text-white border-accent-blue/60 font-medium'
                    }`}
                  >
                    {targetReturn === null ? 'DISABLED' : `ENABLED (${(targetReturn * 100).toFixed(1)}%)`}
                  </button>
                </div>

                {targetReturn !== null ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-3">
                      <input
                        id="target-return"
                        type="number"
                        min={1}
                        max={30}
                        step={0.5}
                        value={Math.round(targetReturn * 10000) / 100}
                        onChange={(e) => setTargetReturn(Number(e.target.value) / 100)}
                        className="w-20 min-h-[36px] bg-bg border border-line px-2.5 py-1 text-xs text-text font-mono focus:border-text"
                      />
                      <span className="text-[11px] text-muted">Min required net annual return after costs (%)</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={25}
                      step={0.5}
                      value={Math.round(targetReturn * 10000) / 100}
                      onChange={(e) => setTargetReturn(Number(e.target.value) / 100)}
                      className="w-full accent-accent-blue cursor-pointer"
                    />
                  </div>
                ) : (
                  <p className="text-[14px] text-faint">
                    No minimum annual return floor applied.
                  </p>
                )}
              </div>
            </div>

            {/* Total Capital Allocation Chips */}
            <div className="p-3.5 bg-surface border border-line space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-text">
                  Investment Capital (INR ₹)
                </label>
                <span className="text-xs font-mono font-medium text-text">
                  ₹{capital.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[100000, 500000, 1000000, 5000000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCapital(val)}
                    className={`py-2 px-3 text-xs font-medium border transition-all flex items-center justify-center ${
                      capital === val
                        ? 'bg-surface-elevated border-accent-blue/70 text-white'
                        : 'bg-bg border-line text-muted hover:text-text'
                    }`}
                  >
                    ₹{val / 100000} Lakh{val > 100000 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Current Holdings Input */}
            <div className="p-3.5 bg-surface border border-line space-y-2">
              <label htmlFor="holdings" className="text-xs font-medium text-text flex items-center justify-between">
                <span>Current Holdings Portfolio <span className="font-medium text-muted">(Optional)</span></span>
                <span className="text-[13px] text-faint">Rebalancing Friction Baseline</span>
              </label>
              <textarea
                id="holdings"
                rows={2}
                value={holdingsText}
                onChange={(e) => setHoldingsText(e.target.value)}
                placeholder={'One per line: symbol and shares, e.g.\nTCS 52\nINFY 120'}
                className="w-full bg-bg border border-line px-3 py-2 text-xs text-text font-mono placeholder-muted focus:border-text"
              />
              <p className="text-[14px] text-muted">
                Transaction costs are charged relative to these shares (liquidating an unselected holding costs 0.1037%). Leave blank to start from 100% cash.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
