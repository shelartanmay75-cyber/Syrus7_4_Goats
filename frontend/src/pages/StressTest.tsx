import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RunResult,
  Scenario,
  StressResult,
  PortfolioComparisonItem,
  Universe
} from '../api/types';
import {
  getStressScenarios,
  evaluateStress,
  compareStress,
  getUniverse
} from '../api/client';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';
import {
  CHART_COLORS,
  formatPercent,
  formatSignedPercent,
  gainLossClass
} from '../lib/chartColors';

interface StressTestProps {
  runResult?: RunResult | null;
  initialSolverKey?: string;
  onNavigateToOptimise?: () => void;
}

// Fallback preset portfolios when user hasn't run the optimizer yet
const PRESET_PORTFOLIOS = [
  {
    id: 'preset_nifty_bluechips',
    label: 'Top 5 NIFTY 50 Bluechips',
    kind: 'preset',
    stocks: [
      { ticker: 'RELIANCE.NS', weight: 0.20 },
      { ticker: 'TCS.NS', weight: 0.20 },
      { ticker: 'HDFCBANK.NS', weight: 0.20 },
      { ticker: 'INFY.NS', weight: 0.20 },
      { ticker: 'ICICIBANK.NS', weight: 0.20 }
    ]
  },
  {
    id: 'preset_tech_growth',
    label: 'High-Tech & Growth (IT Focus)',
    kind: 'preset',
    stocks: [
      { ticker: 'TCS.NS', weight: 0.30 },
      { ticker: 'INFY.NS', weight: 0.30 },
      { ticker: 'WIPRO.NS', weight: 0.20 },
      { ticker: 'HCLTECH.NS', weight: 0.20 }
    ]
  },
  {
    id: 'preset_defensive',
    label: 'Defensive Value & Staples',
    kind: 'preset',
    stocks: [
      { ticker: 'ITC.NS', weight: 0.35 },
      { ticker: 'HINDUNILVR.NS', weight: 0.35 },
      { ticker: 'SUNPHARMA.NS', weight: 0.30 }
    ]
  }
];

const SECTORS_LIST = [
  'Financial Services',
  'Information Technology',
  'Consumer Goods',
  'Oil Gas & Consumable Fuels',
  'Healthcare',
  'Automobile and Auto Components',
  'Metals & Mining',
  'Construction Materials',
  'Telecommunication'
];

export const StressTest: React.FC<StressTestProps> = ({
  runResult,
  initialSolverKey = 'brute_force',
  onNavigateToOptimise
}) => {
  // Scenarios list from API
  const [predefinedScenarios, setPredefinedScenarios] = useState<Scenario[]>([]);
  const [historicalScenarios, setHistoricalScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('broad_market_crash');
  const [scenarioTab, setScenarioTab] = useState<'predefined' | 'historical' | 'custom'>('predefined');

  // Custom scenario builder state
  const [customName, setCustomName] = useState<string>('Custom Crisis Shock');
  const [customMarketShock, setCustomMarketShock] = useState<number>(-20); // -20%
  const [customTargetSector, setCustomTargetSector] = useState<string>('None');
  const [customSectorShock, setCustomSectorShock] = useState<number>(-15); // -15%
  const [customVolMultiplier, setCustomVolMultiplier] = useState<number>(1.5);
  const [customHorizon, setCustomHorizon] = useState<string>('1-Week Contagion');

  // Portfolio Selection State
  const [portfolioSource, setPortfolioSource] = useState<'solver' | 'preset'>('solver');
  const [selectedSolverKey, setSelectedSolverKey] = useState<string>(initialSolverKey);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('preset_nifty_bluechips');
  const [capital, setCapital] = useState<number>(1_000_000);

  // Evaluation & Comparison Results
  const [stressResult, setStressResult] = useState<StressResult | null>(null);
  const [allScenarioResults, setAllScenarioResults] = useState<{ id: string; name: string; lossPct: number; stressedVal: number }[]>([]);
  const [comparisons, setComparisons] = useState<PortfolioComparisonItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Available solvers from optimiser run
  const availableSolvers = useMemo(() => {
    if (!runResult?.solvers) return [];
    return runResult.solvers.filter(s => s.selection && s.selection.length > 0);
  }, [runResult]);

  // Sync selectedSolverKey if runResult updates
  useEffect(() => {
    if (availableSolvers.length > 0) {
      if (!availableSolvers.some(s => s.solver === selectedSolverKey)) {
        setSelectedSolverKey(runResult?.recommended || availableSolvers[0].solver);
      }
      setPortfolioSource('solver');
    } else {
      setPortfolioSource('preset');
    }
  }, [availableSolvers, runResult, selectedSolverKey]);

  // Load scenarios from API on mount
  useEffect(() => {
    let mounted = true;
    const fetchScenarios = async () => {
      try {
        const data = await getStressScenarios();
        if (mounted) {
          setPredefinedScenarios(data.predefined || []);
          setHistoricalScenarios(data.historical || []);
          if (data.predefined && data.predefined.length > 0) {
            setSelectedScenarioId(data.predefined[0].id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load scenarios:', err);
      }
    };
    fetchScenarios();
    return () => {
      mounted = false;
    };
  }, []);

  // Determine active portfolio items
  const activePortfolioItems = useMemo(() => {
    if (portfolioSource === 'solver') {
      const solver = availableSolvers.find(s => s.solver === selectedSolverKey);
      if (solver?.portfolio?.rows && solver.portfolio.rows.length > 0) {
        return solver.portfolio.rows.map(r => ({
          ticker: r.ticker,
          weight: r.weight
        }));
      }
      if (solver?.selection && solver.selection.length > 0) {
        const k = solver.selection.length;
        return solver.selection.map(t => ({ ticker: t, weight: 1 / k }));
      }
    }
    // Fallback to preset
    const preset = PRESET_PORTFOLIOS.find(p => p.id === selectedPresetId) || PRESET_PORTFOLIOS[0];
    return preset.stocks;
  }, [portfolioSource, selectedSolverKey, availableSolvers, selectedPresetId]);

  // Active scenario config based on selection / custom
  const activeScenarioConfig = useMemo((): Scenario => {
    if (scenarioTab === 'custom') {
      return {
        id: 'custom_shock',
        name: customName || 'Custom Stress Shock',
        description: `Custom shock: Market ${customMarketShock}% ${customTargetSector !== 'None' ? `+ ${customTargetSector} ${customSectorShock}%` : ''}, Vol x${customVolMultiplier} (${customHorizon}).`,
        scenario_type: 'custom',
        market_shock: customMarketShock / 100.0,
        target_sector: customTargetSector === 'None' ? null : customTargetSector,
        sector_shock: customTargetSector === 'None' ? 0.0 : customSectorShock / 100.0,
        volatility_multiplier: Math.max(0.1, customVolMultiplier),
        is_historical: false
      };
    }
    if (scenarioTab === 'historical') {
      const hist = historicalScenarios.find(s => s.id === selectedScenarioId);
      if (hist) return hist;
    }
    const pre = predefinedScenarios.find(s => s.id === selectedScenarioId);
    return pre || predefinedScenarios[0] || {
      id: 'broad_market_crash',
      name: 'Broad Market Crash (-20%)',
      description: 'Default market crash',
      scenario_type: 'predefined',
      market_shock: -0.20,
      target_sector: null,
      sector_shock: 0.0,
      volatility_multiplier: 1.25,
      is_historical: false
    };
  }, [
    scenarioTab,
    selectedScenarioId,
    predefinedScenarios,
    historicalScenarios,
    customName,
    customMarketShock,
    customTargetSector,
    customSectorShock,
    customVolMultiplier,
    customHorizon
  ]);

  // Execute Stress Evaluation
  const runStressTest = useCallback(async () => {
    if (activePortfolioItems.length === 0) {
      setError('Please select or configure a portfolio with at least 1 stock.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 1. Evaluate active portfolio under active scenario
      const res = await evaluateStress({
        portfolio: activePortfolioItems,
        capital,
        scenario: activeScenarioConfig
      });
      setStressResult(res);

      // 2. Compute sensitivity across all predefined scenarios for multi-scenario chart
      if (predefinedScenarios.length > 0) {
        const scenarioPromises = predefinedScenarios.map(sc =>
          evaluateStress({
            portfolio: activePortfolioItems,
            capital,
            scenario: sc
          }).then(r => ({
            id: sc.id,
            name: sc.name.split('(')[0].trim(),
            lossPct: Math.abs(r.portfolio_return * 100),
            stressedVal: r.stressed_value
          })).catch(() => ({
            id: sc.id,
            name: sc.name,
            lossPct: 0,
            stressedVal: capital
          }))
        );
        const allSc = await Promise.all(scenarioPromises);
        setAllScenarioResults(allSc);
      }

      // 3. Compare candidate portfolios if availableSolvers exist
      const candidatesToCompare = availableSolvers.length > 0
        ? availableSolvers.map(s => ({
            id: s.solver,
            label: s.label,
            kind: s.kind,
            feasible: s.feasible,
            objective: s.objective ?? null,
            capital,
            items: (s.portfolio?.rows || []).map(r => ({ ticker: r.ticker, weight: r.weight })) || (s.selection || []).map(t => ({ ticker: t }))
          }))
        : PRESET_PORTFOLIOS.map(p => ({
            id: p.id,
            label: p.label,
            kind: 'preset',
            feasible: true,
            objective: null,
            capital,
            items: p.stocks
          }));

      if (candidatesToCompare.length > 0) {
        const compRes = await compareStress({
          candidates: candidatesToCompare,
          scenario: activeScenarioConfig
        });
        setComparisons(compRes);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute stress test.');
    } finally {
      setLoading(false);
    }
  }, [activePortfolioItems, capital, activeScenarioConfig, predefinedScenarios, availableSolvers]);

  // Automatically run test on initial load or when portfolio / scenario changes
  useEffect(() => {
    if (predefinedScenarios.length > 0 && activePortfolioItems.length > 0) {
      runStressTest();
    }
  }, [selectedScenarioId, scenarioTab, portfolioSource, selectedSolverKey, selectedPresetId]);

  // Chart data: Baseline vs Stressed Value
  const valueComparisonData = useMemo(() => {
    if (!stressResult) return [];
    return [
      { name: 'Initial Capital', value: stressResult.initial_value, fill: '#FFFFFF' },
      { name: 'Stressed Capital', value: stressResult.stressed_value, fill: stressResult.loss_amount > 0 ? '#EF4444' : '#22C55E' }
    ];
  }, [stressResult]);

  // Chart data: Stock-Level Impact Ranking
  const stockLossChartData = useMemo(() => {
    if (!stressResult?.stocks) return [];
    return stressResult.stocks.map(s => ({
      name: s.symbol,
      loss: Math.round(s.loss_amount),
      returnPct: Math.round(s.stressed_return * 1000) / 10,
      contribution: s.loss_contribution_pct
    }));
  }, [stressResult]);

  // Chart data: Sector Exposure and Loss
  const sectorChartData = useMemo(() => {
    if (!stressResult?.sectors) return [];
    return stressResult.sectors.map(sec => ({
      name: sec.sector.length > 15 ? sec.sector.slice(0, 15) + '…' : sec.sector,
      weightPct: Math.round(sec.weight * 1000) / 10,
      loss: Math.round(sec.loss_amount),
      stressedReturnPct: Math.round(sec.stressed_return * 1000) / 10
    }));
  }, [stressResult]);

  // Chart data: Volatility Expansion
  const volatilityChartData = useMemo(() => {
    if (!stressResult) return [];
    return [
      { name: 'Baseline Vol', vol: Math.round(stressResult.baseline_volatility * 1000) / 10 },
      { name: 'Stressed Vol', vol: Math.round(stressResult.stressed_volatility * 1000) / 10 }
    ];
  }, [stressResult]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* =========================================================================
          PAGE HEADER & USP BANNER
          ========================================================================= */}
      <div className="border border-line bg-surface p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-accent-blue/20 text-accent-blue-hover border border-accent-blue/30">
                Robustness Intelligence · PS-03 USP
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-surface-elevated text-muted border border-line">
                Direct-Shock &amp; Covariance Model
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-light tracking-wide text-text uppercase">
              Market Crash Stress Testing
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1 max-w-3xl">
              Simulate hypothetical adverse market shocks, sudden volatility spikes, sector-specific drawdowns,
              and historical crisis replays on your quantum-optimised and classical benchmark portfolios.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {onNavigateToOptimise && (
              <button
                type="button"
                onClick={onNavigateToOptimise}
                className="px-3 py-2 text-xs font-mono uppercase border border-line bg-surface-elevated hover:bg-line text-muted hover:text-text transition-colors"
              >
                ← Back to Solvers
              </button>
            )}
            <button
              type="button"
              onClick={runStressTest}
              disabled={loading}
              className="px-5 py-2 text-xs font-mono uppercase font-medium bg-accent-blue hover:bg-accent-blue-hover text-white transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Calculating...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Run Stress Test
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CONTROLS SECTION: PORTFOLIO & SCENARIO CONFIGURATION
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Portfolio Selection (4 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface border border-line p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-sm font-medium uppercase tracking-wider text-text flex items-center gap-2">
                <span className="w-2 h-2 bg-white inline-block" />
                1. Select Portfolio Target
              </h3>
              <span className="text-[11px] font-mono text-muted">
                {activePortfolioItems.length} Constituents
              </span>
            </div>

            {/* Source Selector Tab */}
            <div className="flex border border-line p-0.5 bg-surface-elevated">
              <button
                type="button"
                onClick={() => setPortfolioSource('solver')}
                disabled={availableSolvers.length === 0}
                className={`flex-1 py-1.5 text-xs font-mono uppercase transition-colors ${
                  portfolioSource === 'solver'
                    ? 'bg-surface text-text border border-line-strong'
                    : 'text-muted hover:text-text disabled:opacity-30'
                }`}
              >
                Optimiser Solvers {availableSolvers.length > 0 && `(${availableSolvers.length})`}
              </button>
              <button
                type="button"
                onClick={() => setPortfolioSource('preset')}
                className={`flex-1 py-1.5 text-xs font-mono uppercase transition-colors ${
                  portfolioSource === 'preset'
                    ? 'bg-surface text-text border border-line-strong'
                    : 'text-muted hover:text-text'
                }`}
              >
                Presets / Custom
              </button>
            </div>

            {/* Solver Selector if from run */}
            {portfolioSource === 'solver' && availableSolvers.length > 0 ? (
              <div className="space-y-2">
                <label className="label block text-[10px]">Select Optimised Candidate</label>
                <select
                  value={selectedSolverKey}
                  onChange={e => setSelectedSolverKey(e.target.value)}
                  className="w-full bg-surface-elevated border border-line px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-blue"
                >
                  {availableSolvers.map(s => (
                    <option key={s.solver} value={s.solver}>
                      {s.label} ({s.kind.toUpperCase()}) {s.solver === runResult?.recommended ? '★ Recommended' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="label block text-[10px]">Predefined Benchmark Portfolio</label>
                <select
                  value={selectedPresetId}
                  onChange={e => setSelectedPresetId(e.target.value)}
                  className="w-full bg-surface-elevated border border-line px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-blue"
                >
                  {PRESET_PORTFOLIOS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {availableSolvers.length === 0 && (
                  <p className="text-[11px] text-muted italic">
                    Tip: Execute a run in the <span className="text-text font-medium">Optimise</span> tab to stress test your live QAOA quantum circuit solutions.
                  </p>
                )}
              </div>
            )}

            {/* Capital Input */}
            <div className="space-y-2">
              <label className="label block text-[10px]">Portfolio Capital (INR ₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-mono text-muted">₹</span>
                <input
                  type="number"
                  min={10000}
                  step={50000}
                  value={capital}
                  onChange={e => setCapital(Math.max(1000, Number(e.target.value) || 0))}
                  className="w-full bg-surface-elevated border border-line pl-7 pr-3 py-2 text-xs font-sans num text-text focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>

            {/* Active Stocks Pills */}
            <div className="space-y-2 pt-2 border-t border-line">
              <span className="label block text-[10px]">Portfolio Allocations ({activePortfolioItems.length} Stocks)</span>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {activePortfolioItems.map((st, i) => (
                  <div
                    key={st.ticker || i}
                    className="px-2 py-1 bg-surface-elevated border border-line text-[11px] font-mono flex items-center gap-1.5"
                  >
                    <span className="text-text">{st.ticker.replace('.NS', '')}</span>
                    <span className="text-accent-blue-hover">{st.weight ? `${(st.weight * 100).toFixed(0)}%` : 'Eq.'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Scenario Selector & Custom Builder (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-surface border border-line p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-sm font-medium uppercase tracking-wider text-text flex items-center gap-2">
                <span className="w-2 h-2 bg-accent-blue inline-block" />
                2. Select or Build Stress Scenario
              </h3>
              <span className="text-[11px] font-mono text-muted uppercase">
                Mode: {scenarioTab}
              </span>
            </div>

            {/* Scenario Mode Tabs */}
            <div className="flex border border-line p-0.5 bg-surface-elevated">
              <button
                type="button"
                onClick={() => setScenarioTab('predefined')}
                className={`flex-1 py-1.5 text-xs font-mono uppercase transition-colors ${
                  scenarioTab === 'predefined'
                    ? 'bg-surface text-text border border-line-strong'
                    : 'text-muted hover:text-text'
                }`}
              >
                Predefined Shocks
              </button>
              <button
                type="button"
                onClick={() => setScenarioTab('historical')}
                className={`flex-1 py-1.5 text-xs font-mono uppercase transition-colors ${
                  scenarioTab === 'historical'
                    ? 'bg-surface text-text border border-line-strong'
                    : 'text-muted hover:text-text'
                }`}
              >
                Historical Replays ({historicalScenarios.length})
              </button>
              <button
                type="button"
                onClick={() => setScenarioTab('custom')}
                className={`flex-1 py-1.5 text-xs font-mono uppercase transition-colors ${
                  scenarioTab === 'custom'
                    ? 'bg-surface text-text border border-line-strong'
                    : 'text-muted hover:text-text'
                }`}
              >
                Custom Builder
              </button>
            </div>

            {/* Mode A: Predefined Scenarios */}
            {scenarioTab === 'predefined' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {predefinedScenarios.map(sc => {
                  const isSelected = selectedScenarioId === sc.id;
                  return (
                    <div
                      key={sc.id}
                      onClick={() => setSelectedScenarioId(sc.id)}
                      className={`p-3 border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-accent-blue bg-accent-blue/10'
                          : 'border-line bg-surface-elevated hover:border-line-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-text">{sc.name}</span>
                        {isSelected && <span className="w-2 h-2 bg-accent-blue rounded-full" />}
                      </div>
                      <p className="text-[11px] text-muted line-clamp-2">{sc.description}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-faint">
                        {sc.market_shock !== 0 && (
                          <span className="text-loss">Market: {formatSignedPercent(sc.market_shock, 0)}</span>
                        )}
                        {sc.target_sector && (
                          <span className="text-text">{sc.target_sector} {formatSignedPercent(sc.sector_shock, 0)}</span>
                        )}
                        {sc.volatility_multiplier > 1.0 && (
                          <span>Vol: {sc.volatility_multiplier}x</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mode B: Historical Crisis Replay */}
            {scenarioTab === 'historical' && (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Replay observed historical daily returns from real NIFTY 50 price data during documented market crisis periods.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {historicalScenarios.map(sc => {
                    const isSelected = selectedScenarioId === sc.id;
                    return (
                      <div
                        key={sc.id}
                        onClick={() => setSelectedScenarioId(sc.id)}
                        className={`p-3 border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-accent-blue bg-accent-blue/10'
                            : 'border-line bg-surface-elevated hover:border-line-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-text">{sc.name}</span>
                          {isSelected && <span className="w-2 h-2 bg-accent-blue rounded-full" />}
                        </div>
                        <p className="text-[11px] text-muted line-clamp-2">{sc.description}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-faint">
                          <span>Dates: {sc.start_date} → {sc.end_date}</span>
                          <span className="text-loss">NIFTY: {formatSignedPercent(sc.market_shock, 2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mode C: Custom Scenario Builder */}
            {scenarioTab === 'custom' && (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label block text-[10px]">Scenario Title</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      className="w-full bg-surface-elevated border border-line px-3 py-1.5 text-xs text-text focus:outline-none focus:border-accent-blue"
                    />
                  </div>
                  <div>
                    <label className="label block text-[10px]">Horizon / Duration</label>
                    <select
                      value={customHorizon}
                      onChange={e => setCustomHorizon(e.target.value)}
                      className="w-full bg-surface-elevated border border-line px-3 py-1.5 text-xs text-text focus:outline-none focus:border-accent-blue"
                    >
                      <option value="1-Day Flash Crash">1-Day Flash Crash</option>
                      <option value="1-Week Contagion">1-Week Contagion</option>
                      <option value="1-Month Bear Correction">1-Month Bear Correction</option>
                      <option value="Multi-Month Recession">Multi-Month Recession</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Market Shock */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="label text-[10px]">Market-Wide Shock</span>
                      <span className="font-mono text-loss">{customMarketShock}%</span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={20}
                      step={5}
                      value={customMarketShock}
                      onChange={e => setCustomMarketShock(Number(e.target.value))}
                      className="w-full accent-accent-blue cursor-pointer"
                    />
                  </div>

                  {/* Volatility Multiplier */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="label text-[10px]">Volatility Multiplier</span>
                      <span className="font-mono text-text">{customVolMultiplier.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={3.0}
                      step={0.1}
                      value={customVolMultiplier}
                      onChange={e => setCustomVolMultiplier(Number(e.target.value))}
                      className="w-full accent-accent-blue cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-line">
                  {/* Target Sector */}
                  <div>
                    <label className="label block text-[10px]">Target Sector for Additive Shock</label>
                    <select
                      value={customTargetSector}
                      onChange={e => setCustomTargetSector(e.target.value)}
                      className="w-full bg-surface-elevated border border-line px-3 py-1.5 text-xs text-text focus:outline-none focus:border-accent-blue"
                    >
                      <option value="None">None (Uniform shock across all sectors)</option>
                      {SECTORS_LIST.map(sec => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sector Additive Shock */}
                  {customTargetSector !== 'None' ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="label text-[10px]">Additional Sector Shock</span>
                        <span className="font-mono text-loss">{customSectorShock}%</span>
                      </div>
                      <input
                        type="range"
                        min={-50}
                        max={0}
                        step={5}
                        value={customSectorShock}
                        onChange={e => setCustomSectorShock(Number(e.target.value))}
                        className="w-full accent-accent-blue cursor-pointer"
                      />
                      <span className="text-[10px] text-faint block">
                        Net shock on {customTargetSector}: {customMarketShock + customSectorShock}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center text-[11px] text-muted italic pt-3">
                      Select a sector to configure targeted industry stress.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          ERROR NOTIFICATION
          ========================================================================= */}
      {error && (
        <div className="p-4 bg-loss/10 border border-loss text-xs text-loss flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={runStressTest}
            className="underline font-mono uppercase text-[11px] ml-4 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* =========================================================================
          RESULTS SECTION (When stressResult exists)
          ========================================================================= */}
      {stressResult && (
        <div className="space-y-6">
          {/* Executive Summary & Reconciliation Banner */}
          <div className="bg-surface border border-line p-5 relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-line pb-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-accent-blue shrink-0" />
                <h2 className="text-base font-medium tracking-wide text-text uppercase">
                  Scenario Impact Assessment: {stressResult.scenario.name}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {stressResult.reconciled ? (
                  <span className="px-2 py-0.5 text-[10px] font-mono text-gain bg-gain/10 border border-gain/30 flex items-center gap-1">
                    ✓ Losses Mathematically Reconciled
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-mono text-loss bg-loss/10 border border-loss">
                    Rounding Discrepancy
                  </span>
                )}
                <span className="px-2 py-0.5 text-[10px] font-mono text-muted bg-surface-elevated border border-line">
                  {stressResult.stocks.length} Assets
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-text leading-relaxed">
              {stressResult.summary}
            </p>
          </div>

          {/* Key KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Stressed Capital & Total Loss */}
            <div className="bg-surface border border-line p-4 space-y-1">
              <span className="label block text-[10px]">Stressed Capital &amp; Net Loss</span>
              <div className="text-xl sm:text-2xl font-light text-text font-sans num">
                ₹{Math.round(stressResult.stressed_value).toLocaleString('en-IN')}
              </div>
              <div className="flex items-baseline justify-between text-xs pt-1">
                <span className="text-muted">Total Loss:</span>
                <span className={`font-mono font-medium ${gainLossClass(-stressResult.loss_amount)}`}>
                  -₹{Math.round(stressResult.loss_amount).toLocaleString('en-IN')} ({formatSignedPercent(stressResult.portfolio_return, 1)})
                </span>
              </div>
            </div>

            {/* Card 2: Stress Resilience Score */}
            <div className="bg-surface border border-line p-4 space-y-1">
              <div className="flex justify-between items-center">
                <span className="label block text-[10px]">Resilience Score (0-100)</span>
                <span className="text-[10px] font-mono text-muted">PS-03 Heuristic</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-light text-text font-sans num">
                  {stressResult.resilience_score}
                </span>
                <span className="text-xs text-muted font-mono">/ 100</span>
                <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 ml-auto border ${
                  stressResult.resilience_score >= 70
                    ? 'text-gain border-gain/30 bg-gain/10'
                    : stressResult.resilience_score >= 45
                    ? 'text-accent-blue-hover border-accent-blue/30 bg-accent-blue/10'
                    : 'text-loss border-loss/30 bg-loss/10'
                }`}>
                  {stressResult.resilience_score >= 70 ? 'Resilient' : stressResult.resilience_score >= 45 ? 'Moderate' : 'Vulnerable'}
                </span>
              </div>
              <p className="text-[10px] text-faint truncate pt-1">
                60% Downside + 25% HHI Diversification + 15% Vol Dampener
              </p>
            </div>

            {/* Card 3: Volatility Expansion */}
            <div className="bg-surface border border-line p-4 space-y-1">
              <span className="label block text-[10px]">Annualized Volatility Surge</span>
              <div className="text-xl sm:text-2xl font-light text-text font-sans num flex items-baseline gap-2">
                <span>{formatPercent(stressResult.stressed_volatility, 1)}</span>
                <span className="text-xs font-mono text-muted">
                  (was {formatPercent(stressResult.baseline_volatility, 1)})
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs pt-1">
                <span className="text-muted">Risk Multiplier:</span>
                <span className="font-mono text-accent-blue-hover">
                  {stressResult.scenario.volatility_multiplier.toFixed(2)}x Elevation
                </span>
              </div>
            </div>

            {/* Card 4: Worst Contributor */}
            <div className="bg-surface border border-line p-4 space-y-1">
              <span className="label block text-[10px]">Top Loss Contributor</span>
              <div className="text-lg sm:text-xl font-light text-text truncate">
                {stressResult.stocks[0]?.symbol || '—'}
              </div>
              <div className="flex items-baseline justify-between text-xs pt-1">
                <span className="text-muted truncate max-w-[120px]">{stressResult.stocks[0]?.name}</span>
                <span className="font-mono text-loss shrink-0">
                  {stressResult.stocks[0]?.loss_contribution_pct.toFixed(1)}% of loss
                </span>
              </div>
            </div>
          </div>

          {/* =========================================================================
              VISUALISATIONS GRID
              ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Chart 1: Multi-Scenario Sensitivity Comparison (7 cols) */}
            <div className="lg:col-span-7 bg-surface border border-line p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-medium uppercase tracking-wider text-text">
                    Multi-Scenario Portfolio Sensitivity
                  </h3>
                  <p className="text-[11px] text-muted">
                    Estimated loss percentage of your current portfolio across all predefined stress shocks
                  </p>
                </div>
                <span className="text-[10px] font-mono text-faint">Recharts 3</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={allScenarioResults}
                    margin={{ top: 15, right: 15, left: 10, bottom: 40 }}
                  >
                    <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="2 2" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={CHART_COLORS.tick}
                      fontSize={10}
                      tickLine={false}
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      width={45}
                      stroke={CHART_COLORS.tick}
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v: any) => `-${v}%`}
                    />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-surface/95 backdrop-blur-sm border border-line p-2.5 text-xs font-mono shadow-xl rounded-none">
                            <div className="font-medium text-text">{d.name}</div>
                            <div className="text-loss mt-1">Loss: -{d.lossPct.toFixed(1)}%</div>
                            <div className="text-muted">Stressed Val: ₹{Math.round(d.stressedVal).toLocaleString('en-IN')}</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="lossPct" fill="#EF4444" radius={[0, 0, 0, 0]}>
                      {allScenarioResults.map(entry => (
                        <Cell
                          key={entry.id}
                          fill={entry.id === stressResult.scenario.id ? '#EF4444' : '#A3A3A3'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Baseline vs Stressed Capital Comparison (5 cols) */}
            <div className="lg:col-span-5 bg-surface border border-line p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-medium uppercase tracking-wider text-text">
                    Capital Preservation Ratio
                  </h3>
                  <p className="text-[11px] text-muted">
                    Baseline Capital vs. Scenario Stressed Capital
                  </p>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={valueComparisonData}
                    margin={{ top: 15, right: 15, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="2 2" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={CHART_COLORS.tick}
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      width={55}
                      stroke={CHART_COLORS.tick}
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v: any) => `₹${(v / 100000).toFixed(1)}L`}
                    />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-surface/95 backdrop-blur-sm border border-line p-2.5 text-xs font-mono shadow-xl rounded-none">
                            <div className="font-medium text-text">{d.name}</div>
                            <div className="text-text mt-1">₹{Math.round(d.value).toLocaleString('en-IN')}</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 0, 0, 0]}>
                      {valueComparisonData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Chart 3 & 4: Stock-Level Impact Attribution & Sector Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Stock Loss Contribution BarChart (7 cols) */}
            <div className="lg:col-span-7 bg-surface border border-line p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-medium uppercase tracking-wider text-text">
                    Stock-Level Loss Contribution (₹)
                  </h3>
                  <p className="text-[11px] text-muted">
                    Ranked by absolute financial damage in ₹ under the scenario
                  </p>
                </div>
                <span className="text-[10px] font-mono text-muted">Ranked Descending</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stockLossChartData}
                    layout="vertical"
                    margin={{ top: 10, right: 25, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="2 2" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke={CHART_COLORS.tick}
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v: any) => `₹${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={65}
                      stroke={CHART_COLORS.tick}
                      fontSize={11}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-surface/95 backdrop-blur-sm border border-line p-2.5 text-xs font-mono shadow-xl rounded-none">
                            <div className="font-medium text-text">{d.name}</div>
                            <div className="text-loss mt-1">Loss: ₹{d.loss.toLocaleString('en-IN')}</div>
                            <div className="text-muted">Return: {d.returnPct}%</div>
                            <div className="text-accent-blue-hover">Contr: {d.contribution}% of portfolio loss</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="loss" fill="#EF4444" radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sector Exposure Breakdown (5 cols) */}
            <div className="lg:col-span-5 bg-surface border border-line p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-medium uppercase tracking-wider text-text">
                    Sector Allocation &amp; Stress Loss
                  </h3>
                  <p className="text-[11px] text-muted">
                    Exposure weight vs. estimated loss by industry sector
                  </p>
                </div>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {stressResult.sectors.map(sec => {
                  const lossPct = stressResult.loss_amount > 0 ? (sec.loss_amount / stressResult.loss_amount) * 100 : 0;
                  return (
                    <div key={sec.sector} className="p-2.5 bg-surface-elevated border border-line space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-text truncate max-w-[180px]">{sec.sector}</span>
                        <span className="font-mono text-loss">
                          -₹{Math.round(sec.loss_amount).toLocaleString('en-IN')} ({formatSignedPercent(sec.stressed_return, 1)})
                        </span>
                      </div>
                      <div className="w-full bg-surface h-1.5 overflow-hidden flex">
                        <div
                          className="bg-accent-blue h-full"
                          style={{ width: `${sec.weight * 100}%` }}
                          title={`Allocation: ${(sec.weight * 100).toFixed(1)}%`}
                        />
                        <div
                          className="bg-loss h-full"
                          style={{ width: `${Math.min(100, lossPct)}%` }}
                          title={`Loss share: ${lossPct.toFixed(1)}%`}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-muted">
                        <span>Weight: {(sec.weight * 100).toFixed(1)}%</span>
                        <span>Stressed Val: ₹{Math.round(sec.stressed_value).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* =========================================================================
              STOCK-LEVEL ATTRIBUTION TABLE
              ========================================================================= */}
          <div className="bg-surface border border-line p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h3 className="text-sm font-medium uppercase tracking-wider text-text">
                  Stock-Level Sensitivity &amp; Loss Attribution Table
                </h3>
                <p className="text-[11px] text-muted">
                  Mathematical decomposition: V_stressed = V_0 * (1 + r_i); Loss_i = V_0 * w_i * (-r_i)
                </p>
              </div>
              <span className="text-[10px] font-mono text-gain">
                ✓ Reconciles to Total: ₹{Math.round(stressResult.loss_amount).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2 px-3 font-mono">Stock / Ticker</th>
                    <th className="py-2 px-3 font-mono">Sector</th>
                    <th className="py-2 px-3 font-mono text-right">Weight</th>
                    <th className="py-2 px-3 font-mono text-right">Initial (₹)</th>
                    <th className="py-2 px-3 font-mono text-right">Shock Return</th>
                    <th className="py-2 px-3 font-mono text-right">Stressed (₹)</th>
                    <th className="py-2 px-3 font-mono text-right">Estimated Loss</th>
                    <th className="py-2 px-3 font-mono text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {stressResult.stocks.map(st => (
                    <tr key={st.ticker} className="hover:bg-surface-elevated/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-text">{st.symbol}</div>
                        <div className="text-[10px] text-muted truncate max-w-[160px]">{st.name}</div>
                      </td>
                      <td className="py-2.5 px-3 text-muted text-[11px]">
                        {st.sector}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans num text-text">
                        {(st.weight * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans num text-text">
                        ₹{Math.round(st.initial_value).toLocaleString('en-IN')}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono ${gainLossClass(st.stressed_return)}`}>
                        {formatSignedPercent(st.stressed_return, 1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans num text-text">
                        ₹{Math.round(st.stressed_value).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans num text-loss font-medium">
                        -₹{Math.round(st.loss_amount).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-text">
                        {st.loss_contribution_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line-strong font-medium bg-surface-elevated">
                    <td className="py-2.5 px-3 text-text" colSpan={2}>
                      Total Reconciled Portfolio
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans num text-text">
                      100.0%
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans num text-text">
                      ₹{Math.round(stressResult.initial_value).toLocaleString('en-IN')}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono ${gainLossClass(stressResult.portfolio_return)}`}>
                      {formatSignedPercent(stressResult.portfolio_return, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans num text-text">
                      ₹{Math.round(stressResult.stressed_value).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans num text-loss font-semibold">
                      -₹{Math.round(stressResult.loss_amount).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-text">
                      100.0%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* =========================================================================
              CROSS-PORTFOLIO ROBUSTNESS COMPARISON (ALTERNATIVE SOLVERS)
              ========================================================================= */}
          {comparisons.length > 0 && (
            <div className="bg-surface border border-line p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-medium uppercase tracking-wider text-text">
                    Alternative Portfolio Robustness Comparison
                  </h3>
                  <p className="text-[11px] text-muted">
                    Testing QAOA and classical benchmark portfolios under the exact same scenario ({stressResult.scenario.name})
                  </p>
                </div>
                <span className="text-[10px] font-mono text-muted">
                  {comparisons.length} Portfolios Evaluated
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 px-3 font-mono">Portfolio / Solver</th>
                      <th className="py-2 px-3 font-mono">Type</th>
                      <th className="py-2 px-3 font-mono">Constraints</th>
                      <th className="py-2 px-3 font-mono text-right">QUBO Objective</th>
                      <th className="py-2 px-3 font-mono text-right">Stressed Value</th>
                      <th className="py-2 px-3 font-mono text-right">Estimated Loss</th>
                      <th className="py-2 px-3 font-mono text-right">Top Sector Concentration</th>
                      <th className="py-2 px-3 font-mono text-right">Stressed Vol</th>
                      <th className="py-2 px-3 font-mono text-right">Resilience</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {comparisons.map(cand => {
                      const isCurrent = (portfolioSource === 'solver' && cand.id === selectedSolverKey) ||
                                       (portfolioSource === 'preset' && cand.id === selectedPresetId);
                      return (
                        <tr
                          key={cand.id}
                          className={`transition-colors ${
                            isCurrent
                              ? 'bg-accent-blue/10 border-l-2 border-accent-blue'
                              : 'hover:bg-surface-elevated/50'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-text flex items-center gap-1.5">
                              {cand.label}
                              {isCurrent && (
                                <span className="text-[9px] font-mono uppercase bg-accent-blue text-white px-1 py-0.2">
                                  Current
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] font-mono uppercase text-muted">
                              {cand.kind}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {cand.feasible ? (
                              <span className="text-gain font-mono text-[10px]">✓ Feasible</span>
                            ) : (
                              <span className="text-loss font-mono text-[10px]">✕ Violated</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans num text-muted">
                            {cand.objective !== null && cand.objective !== undefined ? cand.objective.toFixed(4) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans num text-text">
                            ₹{Math.round(cand.stressed_value).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans num text-loss font-medium">
                            -₹{Math.round(cand.loss_amount).toLocaleString('en-IN')} ({formatSignedPercent(cand.portfolio_return, 1)})
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans num text-text">
                            <span className="text-muted text-[10px] block">{cand.top_sector}</span>
                            {cand.top_sector_pct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans num text-muted">
                            {formatPercent(cand.stressed_volatility, 1)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium">
                            <span className={`px-1.5 py-0.5 text-[10px] border ${
                              cand.resilience_score >= 70
                                ? 'text-gain border-gain/30 bg-gain/10'
                                : cand.resilience_score >= 45
                                ? 'text-accent-blue-hover border-accent-blue/30 bg-accent-blue/10'
                                : 'text-loss border-loss/30 bg-loss/10'
                            }`}>
                              {cand.resilience_score.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-surface-elevated border border-line text-[11px] text-muted space-y-1">
                <span className="font-mono text-text block uppercase">PS-03 Methodology Note:</span>
                <p>
                  A lower stress test loss does not automatically designate a superior overall investment portfolio.
                  The QUBO optimiser formulation trades off risk-weighted return against variance under predefined budget and sector caps.
                  Stress testing reveals tail-risk sensitivity under adverse conditions without altering the core objective function.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StressTest;
