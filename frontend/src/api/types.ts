export interface Asset {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  excluded_reason: string | null;
}

export interface Universe {
  as_of: string;
  source: string;
  assets: Asset[];
}

export interface QaoaSettings {
  variant: 'standard' | 'xy';
  reps: number;
  optimizer: 'COBYLA' | 'SPSA' | 'NELDER_MEAD';
  init: 'random' | 'ramp' | 'interp';
  shots: number;
  maxiter: number;
  noise: boolean;
  seed: number;
}

export interface RunRequest {
  tickers: string[] | null;
  k: number;
  risk_aversion: number;
  sector_cap: number | null;
  target_return: number | null;
  capital: number;
  holdings: Record<string, number>;
  qubit_cap: number;
  qaoa: QaoaSettings;
  /** Expected-return estimator: Bayes-Stein shrinkage (default) or the raw past average. */
  mu_estimator?: 'capm' | 'bayes_stein' | 'raw';
}

export interface ScreenQubits {
  assets: number;
  slack: number;
  total: number;
}

export interface ScreenInfo {
  applied: boolean;
  rule: string;
  kept: string[];
  dropped: string[];
  qubits: ScreenQubits;
}

export interface ConvergencePoint {
  iter: number;
  energy: number;
}

export interface Sample {
  bitstring: string;
  prob: number;
  objective: number | null;
  feasible: boolean;
  optimal: boolean;
}

export interface PortfolioRow {
  ticker: string;
  symbol?: string;
  name: string;
  sector: string;
  weight: number;
  shares: number;
  price: number;
  value: number;
}

export interface PortfolioOut {
  rows: PortfolioRow[];
  invested: number;
  cash_left: number;
}

export interface OOSMetrics {
  ann_return: number;
  ann_vol: number;
  sharpe: number;
  max_drawdown: number;
}

export interface BenchmarkMetrics {
  ann_return: number;
  ann_vol: number;
  sharpe: number;
  max_drawdown: number;
}

export interface SolverResult {
  solver: 'brute_force' | 'relaxation' | 'annealing' | 'qaoa_standard' | 'qaoa_xy';
  label: string;
  kind: 'classical' | 'quantum';
  selection: string[] | null;
  bitstring: string | null;
  objective: number | null;
  exp_return: number | null;
  volatility: number | null;
  variance: number | null;
  txn_cost: number | null;
  feasible: boolean;
  violations: string[];
  runtime_s: number;
  approx_ratio: number | null;
  p_opt: number | null;
  feasible_rate: number | null;
  portfolio: PortfolioOut | null;
  oos: OOSMetrics | null;
  details: Record<string, any>;
}

export interface QaoaMetrics {
  approx_ratio: number;
  p_opt: number;
  p_random: number;
  feasible_rate: number;
}

export interface QaoaCircuit {
  qubits: number;
  reps: number;
  depth: number;
  two_qubit_gates: number;
  optimizer: string;
  init: string;
  seed: number;
}

export interface NoiseMetrics {
  approx_ratio: number;
  p_opt: number;
  p_random?: number;
  feasible_rate: number;
}

export interface NoisyPick {
  selection: string[];
  objective: number;
  exp_return: number; // annualised log return
  volatility: number;
  same_as_ideal: boolean;
}

export interface NoiseReport {
  backend: string;
  ideal: NoiseMetrics;
  noisy: NoiseMetrics;
  shots?: number | null;
  best_noisy?: NoisyPick | null;
  transpiled: {
    depth: number;
    two_qubit_gates: number;
  };
}

export interface QaoaResult {
  solver: string;
  convergence: ConvergencePoint[];
  samples: Sample[];
  metrics: QaoaMetrics;
  circuit: QaoaCircuit;
  noise: NoiseReport | null;
}

export interface FrontierContinuousPoint {
  risk: number;
  ret: number;
}

export interface FrontierDiscretePoint {
  risk: number;
  ret: number;
  selection: string[];
}

export interface Frontier {
  continuous: FrontierContinuousPoint[];
  discrete: FrontierDiscretePoint[];
}

export interface Verdict {
  level: 'matched' | 'near' | 'worse' | 'no-feasible';
  headline: string;
  details: string[];
}

export interface RunDataSummary {
  source: string;
  as_of: string;
  est_window: [string, string];
  test_window: [string, string];
  excluded: Record<string, string>;
  filled: Record<string, number>;
  notes: string[];
}

export interface QuboInfo {
  n_vars: number;
  n_assets: number;
  n_slack: number;
  terms: string[];
  penalties: Record<string, number>;
}

export interface LandscapeSummary {
  n_feasible: number;
  f_min: number;
  f_max: number;
  f_mean: number;
}

export interface RunResult {
  run_id: string;
  request: RunRequest;
  data: RunDataSummary;
  screen: ScreenInfo;
  qubo: QuboInfo;
  landscape: LandscapeSummary;
  solvers: SolverResult[];
  qaoa: QaoaResult;
  frontier: Frontier;
  benchmarks: {
    nifty50: BenchmarkMetrics;
  };
  verdict: Verdict;
  recommended: string;
  /** Beta of each stock to the equal-weight market of the requested universe (estimation window). Used by the stress tests. */
  betas?: Record<string, number> | null;
  /** Weekly OHLC of each feasible portfolio's rupee value over the test window (equal-weight buy-and-hold), plus 'nifty50'. */
  candles?: Record<string, Candle[]> | null;
  /** Portfolio report: every stock of the requested universe with its estimation-window mu (annualised log return) and volatility. */
  assets?: AssetStat[] | null;
  /** Portfolio report: correlation and annualised covariance (daily log returns x252) of the recommended portfolio's stocks (estimation window). */
  correlation?: { tickers: string[]; matrix: number[][]; covariance: number[][] } | null;
  /** How expected returns were estimated: shrinkage weight (0..1) toward a target annual log return. */
  estimator?: { method: 'capm' | 'bayes_stein' | 'raw'; shrinkage: number; target: number | null; market_return?: number; risk_free?: number } | null;
}

export interface AssetStat {
  ticker: string;
  name: string;
  sector: string;
  exp_return: number;
  /** The raw past average before shrinkage (estimation window); absent on older runs. */
  past_return?: number;
  /** The Bayes-Stein shrunk past average (estimation window); absent on older runs. */
  shrunk_return?: number;
  volatility: number;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface JobStatus {
  job_id: string;
  state: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  stage: string;
  convergence: ConvergencePoint[] | null;
  elapsed_s: number;
  result: RunResult | null;
  error: string | null;
}

export interface StudyPoint {
  x: number;
  y: number;
  yerr: number | null;
}

export interface StudySeries {
  label: string;
  points: StudyPoint[];
}

export interface StudyInstance {
  n_assets: number;
  k: number;
  q: number;
  seeds: number[];
  shots: number;
}

export interface Study {
  id: string;
  title: string;
  description: string;
  x_label: string;
  y_label: string;
  series: StudySeries[];
  instance: StudyInstance;
  notes: string[];
  generated_at: string;
  wall_time_s: number;
}

export interface StudySummary {
  id: string;
  title: string;
  summary: string;
}

// ============================================================================
// Stress Testing & Robustness Types (Market Crash Stress Testing USP)
// ============================================================================
export interface Scenario {
  id: string;
  name: string;
  description: string;
  scenario_type: 'predefined' | 'custom' | 'historical';
  market_shock: number; // e.g. -0.20
  target_sector: string | null;
  sector_shock: number; // e.g. -0.15
  volatility_multiplier: number; // e.g. 1.5
  start_date?: string | null;
  end_date?: string | null;
  is_historical?: boolean;
  stock_shocks?: Record<string, number>;
}

export interface StockStressImpact {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  weight: number;
  initial_value: number;
  stressed_return: number;
  stressed_value: number;
  loss_amount: number;
  loss_contribution_pct: number;
}

export interface SectorStressImpact {
  sector: string;
  weight: number;
  initial_value: number;
  stressed_value: number;
  loss_amount: number;
  stressed_return: number;
}

export interface StressResult {
  scenario: Scenario;
  initial_value: number;
  stressed_value: number;
  loss_amount: number;
  portfolio_return: number;
  baseline_volatility: number;
  stressed_volatility: number;
  resilience_score: number;
  stocks: StockStressImpact[];
  sectors: SectorStressImpact[];
  summary: string;
  reconciled: boolean;
}

export interface ScenariosResponse {
  predefined: Scenario[];
  historical: Scenario[];
}

export interface PortfolioStockInput {
  ticker: string;
  weight?: number;
}

export interface StressEvaluateRequest {
  portfolio: Array<PortfolioStockInput | string>;
  capital: number;
  scenario: Scenario;
}

export interface CandidatePortfolioInput {
  id: string;
  label: string;
  kind: string;
  feasible: boolean;
  objective?: number | null;
  capital: number;
  items: Array<PortfolioStockInput | string>;
}

export interface StressCompareRequest {
  candidates: CandidatePortfolioInput[];
  scenario: Scenario;
}

export interface PortfolioComparisonItem {
  id: string;
  label: string;
  kind: string;
  feasible: boolean;
  objective?: number | null;
  initial_value: number;
  stressed_value: number;
  loss_amount: number;
  portfolio_return: number;
  baseline_volatility: number;
  stressed_volatility: number;
  top_sector: string;
  top_sector_pct: number;
  resilience_score: number;
}

