// Mock mode replays contracts/api-examples/*.json, so any drift between types.ts and CONTRACTS.md shows up here first.
// QAOA seed 13 replays job_error.json; seed 14 turns the QAOA solver into the "no feasible sample" case.
import type {
  Universe,
  RunRequest,
  ScreenInfo,
  JobStatus,
  RunResult,
  Study,
  StudySummary,
  Scenario,
  StressResult,
  ScenariosResponse,
  StressEvaluateRequest,
  StressCompareRequest,
  PortfolioComparisonItem
} from './types';
import universe from '../../../contracts/api-examples/universe.json';
import screen from '../../../contracts/api-examples/screen.json';
import running from '../../../contracts/api-examples/job_running.json';
import done from '../../../contracts/api-examples/job_done.json';
import failed from '../../../contracts/api-examples/job_error.json';
import studiesIndex from '../../../contracts/api-examples/studies_index.json';
import depthStudy from '../../../contracts/api-examples/study_depth.json';

const RUN_SECONDS = 5;
const SLACK = 4; // slack bits in the example payloads
const jobs = new Map<string, { start: number; req: RunRequest; cancelled: boolean }>();

const ok = <T>(value: unknown) => Promise.resolve(value as T);

export function mockGetUniverse(): Promise<Universe> {
  return ok(universe);
}

export function mockPostScreen(req: RunRequest): Promise<ScreenInfo> {
  const n = req.tickers?.length ?? universe.assets.filter(a => !a.excluded_reason).length;
  if (n + SLACK > req.qubit_cap) return ok(screen);
  return ok({ applied: false, rule: '', kept: [], dropped: [], qubits: { assets: n, slack: SLACK, total: n + SLACK } });
}

export function mockStartRun(req: RunRequest): Promise<{ job_id: string }> {
  const job_id = Math.random().toString(36).slice(2, 8);
  jobs.set(job_id, { start: Date.now(), req, cancelled: false });
  return ok({ job_id });
}

function noFeasibleResult(): RunResult {
  const r = structuredClone(done.result) as unknown as RunResult;
  r.solvers = r.solvers.map(s => s.kind !== 'quantum' ? s : {
    ...s, selection: null, bitstring: null, objective: null, exp_return: null, volatility: null, variance: null,
    txn_cost: null, feasible: false, approx_ratio: null, p_opt: null, feasible_rate: 0, portfolio: null, oos: null
  });
  r.qaoa.samples = r.qaoa.samples.map(s => ({ ...s, objective: null, feasible: false, optimal: false }));
  r.qaoa.metrics = { ...r.qaoa.metrics, approx_ratio: 0, p_opt: 0, feasible_rate: 0 };
  r.verdict = {
    level: 'no-feasible',
    headline: 'QAOA sampled no feasible portfolio.',
    details: ['None of the 4096 samples met every constraint, so QAOA reports no selection.']
  };
  return r;
}

export function mockGetRun(jobId: string): Promise<JobStatus> {
  const job = jobs.get(jobId);
  if (!job) return Promise.reject(new Error(`Unknown job ${jobId}.`));
  const elapsed_s = (Date.now() - job.start) / 1000;
  if (job.cancelled) return ok({ ...running, job_id: jobId, state: 'cancelled', stage: 'Cancelled', elapsed_s });
  if (job.req.qaoa.seed === 13) return ok({ ...failed, job_id: jobId });

  const progress = elapsed_s / RUN_SECONDS;
  if (progress >= 1) {
    const result = job.req.qaoa.seed === 14 ? noFeasibleResult() : done.result;
    return ok({ ...done, job_id: jobId, elapsed_s, result });
  }
  const total = done.convergence.length;
  const convergence = done.convergence.slice(0, Math.max(1, Math.round(progress * total)));
  return ok({
    ...running, job_id: jobId, progress, elapsed_s, convergence,
    stage: `Optimising QAOA parameters (iteration ${convergence.length} of ${total})`
  });
}

export function mockCancelRun(jobId: string): Promise<JobStatus> {
  const job = jobs.get(jobId);
  if (job) job.cancelled = true;
  return mockGetRun(jobId);
}

export function mockListStudies(): Promise<StudySummary[]> {
  return ok(studiesIndex);
}

export function mockGetStudy(id: string): Promise<Study> {
  const summary = studiesIndex.find(s => s.id === id);
  if (!summary) return Promise.reject(new Error(`Unknown study ${id}.`));
  if (id === 'depth') return ok(depthStudy);
  // Only study_depth.json exists; other ids reuse its numbers, labelled as such.
  return ok({ ...depthStudy, id, title: summary.title, notes: [...depthStudy.notes, 'Mock: reuses the depth study numbers.'] });
}

// Predefined stress scenarios for mock mode
const mockPredefinedScenarios: Scenario[] = [
  {
    id: 'broad_market_crash',
    name: 'Broad Market Crash (-20%)',
    description: 'Hypothetical uniform 20% decline across all equities with a 25% volatility elevation.',
    scenario_type: 'predefined',
    market_shock: -0.20,
    target_sector: null,
    sector_shock: 0.0,
    volatility_multiplier: 1.25,
    is_historical: false
  },
  {
    id: 'severe_market_crash',
    name: 'Severe Market Crash (-35%)',
    description: 'Severe liquidity contraction causing an indiscriminate 35% decline across all equities and 75% volatility surge.',
    scenario_type: 'predefined',
    market_shock: -0.35,
    target_sector: null,
    sector_shock: 0.0,
    volatility_multiplier: 1.75,
    is_historical: false
  },
  {
    id: 'volatility_spike',
    name: 'Volatility Spike (2x VIX)',
    description: 'Sudden doubling of asset return dispersion. Asset prices remain unchanged initially, but portfolio uncertainty and risk double.',
    scenario_type: 'predefined',
    market_shock: 0.0,
    target_sector: null,
    sector_shock: 0.0,
    volatility_multiplier: 2.0,
    is_historical: false
  },
  {
    id: 'sector_financials_shock',
    name: 'Financials Credit Shock (-25%)',
    description: 'Credit event or rate shock inducing -25% decline in Financial Services stocks while unaffected sectors face 0% direct price shock.',
    scenario_type: 'predefined',
    market_shock: 0.0,
    target_sector: 'Financial Services',
    sector_shock: -0.25,
    volatility_multiplier: 1.30,
    is_historical: false
  },
  {
    id: 'sector_it_shock',
    name: 'Tech / IT Valuation Shock (-25%)',
    description: 'Global tech valuation reset causing -25% drop in Information Technology stocks while other sectors face zero direct price shock.',
    scenario_type: 'predefined',
    market_shock: 0.0,
    target_sector: 'Information Technology',
    sector_shock: -0.25,
    volatility_multiplier: 1.30,
    is_historical: false
  },
  {
    id: 'combined_crisis',
    name: 'Combined Crisis (Market -15% + Financials -20%)',
    description: 'Broad market drawdown (-15%) combined with industry-specific distress in Financial Services (-20% additional, -35% total) and 2.0x volatility spike.',
    scenario_type: 'predefined',
    market_shock: -0.15,
    target_sector: 'Financial Services',
    sector_shock: -0.20,
    volatility_multiplier: 2.0,
    is_historical: false
  }
];

const mockHistoricalScenarios: Scenario[] = [
  {
    id: 'hist_election_2024',
    name: '2024 Election Shock (June 4, 2024)',
    description: 'Single-day market plunge following surprise general election results (NIFTY -5.93%, infrastructure and PSU equities down 15–21%).',
    scenario_type: 'historical',
    market_shock: -0.0593,
    target_sector: null,
    sector_shock: 0.0,
    volatility_multiplier: 1.6,
    start_date: '2024-06-03',
    end_date: '2024-06-04',
    is_historical: true
  },
  {
    id: 'hist_yen_carry_2024',
    name: 'Global Carry-Trade Unwind (Aug 5, 2024)',
    description: 'Worldwide equity deleveraging triggered by Bank of Japan rate rise and US recession fears (NIFTY -2.68%).',
    scenario_type: 'historical',
    market_shock: -0.0268,
    target_sector: null,
    sector_shock: 0.0,
    volatility_multiplier: 1.4,
    start_date: '2024-08-02',
    end_date: '2024-08-05',
    is_historical: true
  },
  {
    id: 'hist_fii_oct_2024',
    name: 'Geopolitical & FII Selloff (Oct 1–7, 2024)',
    description: '5-day sustained correction driven by Middle East tension escalation and massive foreign institutional outflows (NIFTY -5.28%).',
    scenario_type: 'historical',
    market_shock: -0.0528,
    target_sector: null,
    sector_shock: 0.0,
    volatility_multiplier: 1.45,
    start_date: '2024-10-01',
    end_date: '2024-10-07',
    is_historical: true
  },
  {
    id: 'hist_correction_apr_2025',
    name: 'Global Tariff & Bond Volatility (Apr 1–7, 2025)',
    description: '5-day market selloff driven by trade tariff announcements and sovereign yield surges (NIFTY -5.77%).',
    scenario_type: 'historical',
    market_shock: -0.0577,
    target_sector: null,
    sector_shock: 0.0,
    volatility_multiplier: 1.5,
    start_date: '2025-04-01',
    end_date: '2025-04-07',
    is_historical: true
  }
];

export function mockGetStressScenarios(): Promise<ScenariosResponse> {
  return ok({
    predefined: mockPredefinedScenarios,
    historical: mockHistoricalScenarios
  });
}

export function mockEvaluateStress(req: StressEvaluateRequest): Promise<StressResult> {
  const assetsMap = new Map(universe.assets.map(a => [a.ticker, a]));
  const parsed = req.portfolio.map(p => {
    const ticker = typeof p === 'string' ? p : p.ticker;
    const rawWeight = typeof p === 'string' ? null : p.weight;
    const a = assetsMap.get(ticker);
    return {
      ticker,
      symbol: a?.symbol || ticker.replace('.NS', ''),
      name: a?.name || ticker,
      sector: a?.sector || 'Other',
      rawWeight
    };
  });

  const k = parsed.length || 1;
  const weights = parsed.map(p => (p.rawWeight != null && p.rawWeight > 0 ? p.rawWeight : 1 / k));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const normW = weights.map(w => w / sumW);

  let portReturn = 0;
  const stockImpacts = parsed.map((item, i) => {
    const w = normW[i];
    const initV = req.capital * w;
    let r = req.scenario.market_shock;
    if (req.scenario.target_sector && item.sector.toLowerCase() === req.scenario.target_sector.toLowerCase()) {
      r += req.scenario.sector_shock;
    }
    r = Math.max(-1.0, r);
    const stressedV = initV * (1 + r);
    const loss = initV - stressedV;
    portReturn += w * r;

    return {
      ticker: item.ticker,
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      weight: w,
      initial_value: Math.round(initV * 100) / 100,
      stressed_return: Math.round(r * 10000) / 10000,
      stressed_value: Math.round(stressedV * 100) / 100,
      loss_amount: Math.round(loss * 100) / 100,
      loss_contribution_pct: 0
    };
  });

  const stressedVal = req.capital * (1 + portReturn);
  const totalLoss = req.capital - stressedVal;

  stockImpacts.forEach(s => {
    s.loss_contribution_pct = Math.abs(totalLoss) > 0.01 ? Math.round((s.loss_amount / totalLoss) * 10000) / 100 : 0;
  });
  stockImpacts.sort((a, b) => b.loss_amount - a.loss_amount);

  // Group by sector
  const secMap = new Map<string, { weight: number; init: number; stressed: number; loss: number }>();
  stockImpacts.forEach(s => {
    const cur = secMap.get(s.sector) || { weight: 0, init: 0, stressed: 0, loss: 0 };
    cur.weight += s.weight;
    cur.init += s.initial_value;
    cur.stressed += s.stressed_value;
    cur.loss += s.loss_amount;
    secMap.set(s.sector, cur);
  });

  const sectors = Array.from(secMap.entries()).map(([sector, val]) => ({
    sector,
    weight: Math.round(val.weight * 10000) / 10000,
    initial_value: Math.round(val.init * 100) / 100,
    stressed_value: Math.round(val.stressed * 100) / 100,
    loss_amount: Math.round(val.loss * 100) / 100,
    stressed_return: val.init > 0 ? Math.round((val.stressed / val.init - 1) * 10000) / 10000 : 0
  })).sort((a, b) => b.loss_amount - a.loss_amount);

  // Resilience score heuristic
  const downside = Math.max(0, Math.min(1, 1 + portReturn / 0.5));
  const hhi = sectors.reduce((acc, s) => acc + s.weight ** 2, 0);
  const divFactor = Math.max(0.2, Math.min(1, 1 - 0.45 * Math.max(0, hhi - 0.1) / 0.9));
  const volDampener = 1.0 / Math.sqrt(Math.max(1, req.scenario.volatility_multiplier));
  const rawScore = 100 * (0.6 * downside + 0.25 * divFactor + 0.15 * volDampener);
  const resilienceScore = Math.round(Math.max(0, Math.min(100, rawScore)) * 10) / 10;

  const baseVol = 0.18;
  const stressedVol = baseVol * Math.max(0.5, req.scenario.volatility_multiplier);

  const pctStr = portReturn < 0 ? `${(Math.abs(portReturn) * 100).toFixed(1)}%` : `+${(portReturn * 100).toFixed(1)}%`;
  const summary = `Under '${req.scenario.name}', the estimated portfolio return is ${(portReturn * 100).toFixed(2)}%. Total value shifts from ₹${req.capital.toLocaleString('en-IN')} to ₹${Math.round(stressedVal).toLocaleString('en-IN')} (loss of ₹${Math.round(totalLoss).toLocaleString('en-IN')}, ${pctStr}). Largest contributor is ${stockImpacts[0]?.name || 'N/A'} with ₹${Math.round(stockImpacts[0]?.loss_amount || 0).toLocaleString('en-IN')} loss.`;

  return ok({
    scenario: req.scenario,
    initial_value: Math.round(req.capital * 100) / 100,
    stressed_value: Math.round(stressedVal * 100) / 100,
    loss_amount: Math.round(totalLoss * 100) / 100,
    portfolio_return: Math.round(portReturn * 10000) / 10000,
    baseline_volatility: Math.round(baseVol * 10000) / 10000,
    stressed_volatility: Math.round(stressedVol * 10000) / 10000,
    resilience_score: resilienceScore,
    stocks: stockImpacts,
    sectors,
    summary,
    reconciled: true
  });
}

export function mockCompareStress(req: StressCompareRequest): Promise<PortfolioComparisonItem[]> {
  const promises = req.candidates.map(async cand => {
    const res = await mockEvaluateStress({
      portfolio: cand.items,
      capital: cand.capital,
      scenario: req.scenario
    });
    return {
      id: cand.id,
      label: cand.label,
      kind: cand.kind,
      feasible: cand.feasible,
      objective: cand.objective ?? null,
      initial_value: res.initial_value,
      stressed_value: res.stressed_value,
      loss_amount: res.loss_amount,
      portfolio_return: res.portfolio_return,
      baseline_volatility: res.baseline_volatility,
      stressed_volatility: res.stressed_volatility,
      top_sector: res.sectors[0]?.sector || 'None',
      top_sector_pct: res.sectors[0] ? Math.round(res.sectors[0].weight * 1000) / 10 : 0,
      resilience_score: res.resilience_score
    };
  });
  return Promise.all(promises);
}

