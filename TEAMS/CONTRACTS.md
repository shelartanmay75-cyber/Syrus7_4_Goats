# Frozen Contracts (owner: TEAM-1)

These interfaces let four teams build at the same time. **Only TEAM-1 changes this file.** If you need a change, ask TEAM-1 in the team chat and keep building against the current version.

- **Python models:** `backend/qportfolio/contracts.py`, pydantic models that mirror this file one-to-one.
- **Example payloads:** `contracts/api-examples/*.json`. These are realistic, internally consistent, and used as frontend mocks and API test fixtures.
- **Conventions:**
  - JSON keys are `snake_case`.
  - Tickers are yfinance tickers (`TCS.NS`).
  - Money is INR.
  - Returns and volatility are **annualised decimals** (0.12 = 12%).
  - Dates are ISO strings `YYYY-MM-DD`.
- **Bitstring convention:** strings in JSON are **asset order, x0 first (leftmost)**. Qiskit counts are little-endian (qubit 0 is the rightmost character), so the QAOA engine reverses them before anything leaves `quantum/`.

---

## 1. Python interfaces between teams

These are the only cross-team calls. Everything else inside a team's folder is private.

### 1.1 Shared types: `qportfolio/problem.py` (TEAM-1, ready at T0)

```python
@dataclass
class Problem:
    tickers: list[str]            # solved universe (after screen), length n
    sectors: list[str]            # same order as tickers
    mu: np.ndarray                # (n,) annualised expected log return
    sigma: np.ndarray             # (n, n) annualised covariance, symmetric PSD
    k: int                        # cardinality
    q: float                      # risk aversion in [0, 1]
    cost_lin: np.ndarray          # (n,) transaction-cost linear term, fraction of capital
    cost_const: float             # constant part of tc(x)
    sector_cap: int | None        # max picks per sector, None = off
    target_return: float | None   # min net annualised return of equal-weight pick, None = off

    def evaluate(self, x: np.ndarray) -> Evaluation: ...   # x: (n,) 0/1 array, asset order

@dataclass
class Evaluation:
    objective: float     # F(x) = q*x'Σx/K² − (1−q)*(μ'x/K − tc(x))   (no penalties)
    exp_return: float    # μ'x/K
    variance: float      # x'Σx/K²
    txn_cost: float      # tc(x) = cost_lin·x + cost_const
    feasible: bool
    violations: list[str]   # e.g. ["cardinality: 6 != 5", "sector_cap: Financial Services 3 > 2", "target_return: 0.081 < 0.10"]
```

`Problem.evaluate` is the **single exact judge** used by every solver and by metrics. Never re-implement feasibility.

### 1.2 Data: `qportfolio/data/*` (TEAM-2)

```python
load_universe() -> list[Asset]                     # Asset(ticker, symbol, name, sector), 50 items, from backend/data/nifty50.csv
load_prices(tickers, start, end, refresh=False) -> PriceData   # PriceData(close: pd.DataFrame[date x ticker], source: "cache"|"snapshot"|"live", as_of: str)
build_market(tickers, windows=DEFAULT_WINDOWS) -> Market
#   Market(tickers, sectors, mu, sigma, est_end_prices: np.ndarray, test_returns: pd.DataFrame (simple daily),
#          benchmark_test_returns: pd.Series (^NSEI), excluded: dict[str,str], filled: dict[str,int],
#          windows: Windows(est_start, est_end, test_start, test_end), source, as_of)
#   Market.subset(tickers) -> Market
prescreen(market, k, qubit_budget, sector_cap, rf=0.0557) -> ScreenInfo   # see JSON §2.4; also returns slack-bit estimate
linear_costs(tickers, k, holdings_weights: dict[str, float]) -> tuple[np.ndarray, float]   # tc(x) = lin·x + const
to_shares(tickers, prices, capital, selection) -> PortfolioOut              # JSON §2.6 "portfolio"
out_of_sample(market, selection, rf=0.0557) -> OOS                          # JSON §2.6 "oos"
benchmark_oos(market, rf=0.0557) -> OOS                                     # ^NSEI over the test window -> "benchmarks.nifty50"
```

`prescreen` accounts for sector-cap slack bits itself; the pipeline passes `qubit_budget = qubit_cap - 3` when `target_return` is set (3-bit return slack). The pipeline converts `RunRequest.holdings` (shares) to weights before `linear_costs`.

`DEFAULT_WINDOWS`: est 2023-10-01 → 2025-09-30, test 2025-10-01 → 2026-09-30. Constants: `RF = 0.0557`, `C_BUY = 0.001187`, `C_SELL = 0.001037`.

### 1.3 QUBO and quantum: `qportfolio/qubo/*`, `qportfolio/quantum/*` (TEAM-1)

```python
build_qubo(problem, penalties: dict[str, float] | None = None) -> Qubo
#   Qubo(Q: np.ndarray (m,m) symmetric, c: np.ndarray (m,), const: float, n_assets: int, n_slack: int,
#        labels: list[str], penalties: dict[str, float])          # m = n_assets + n_slack <= 16
#   Qubo.energy(bits: np.ndarray) -> float                         # bits over all m vars
#   Qubo.energies_all() -> np.ndarray                              # all 2^m energies (vectorised), for tuning / SA checks
tune_penalties(problem) -> dict[str, float]
qaoa_solve(problem, qubo, settings: QaoaSettings, on_progress=None, cancel: threading.Event | None = None,
           landscape: Landscape | None = None) -> SolverResult
noisy_solve(problem, qubo, settings, params=None, ...) -> NoiseReport
```

### 1.4 Classical and metrics: `qportfolio/classical/*`, `metrics.py`, `frontier.py`, `verdict.py` (TEAM-3)

```python
brute_force(problem) -> tuple[SolverResult, Landscape]
#   Landscape(selections: np.ndarray (F, n) 0/1, objectives, returns, variances: np.ndarray (F,),
#             f_min, f_max, f_mean: float, optimum: np.ndarray (n,))   # feasible selections only
relaxation(problem) -> SolverResult
annealing(problem, qubo, seed=7, sweeps=2000) -> SolverResult
qaoa_metrics(samples: list[Sample], landscape) -> QaoaMetrics       # approx_ratio, p_opt, p_random, feasible_rate, top_samples
frontier(market_subset, landscape) -> Frontier                       # JSON §2.6 "frontier"
verdict(solvers: list[SolverResult], landscape, qaoa: QaoaMetrics | None) -> Verdict
```

`Sample(bitstring: str, prob: float, objective: float | None, feasible: bool, optimal: bool)`. The bitstring covers asset bits only, x0 first.

### 1.5 Pipeline: `qportfolio/pipeline.py` (TEAM-1; a stub returns the example until U10)

```python
run(request: RunRequest, on_progress: Callable[[float, str, dict | None], None] | None = None,
    cancel: threading.Event | None = None) -> RunResult
# on_progress(fraction 0..1, stage text, convergence_point {"iter": int, "energy": float} | None)
# raises Cancelled if cancel is set
```

---

## 2. HTTP API (TEAM-2 serves, TEAM-4 consumes)

Base path is `/api`. Every response is JSON. An error body looks like `{"detail": "plain-language message"}`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | `{"ok": true, "version": "0.1.0"}` |
| GET | `/api/universe` | — | Universe (§2.1) |
| POST | `/api/screen` | RunRequest | ScreenInfo (§2.4) |
| POST | `/api/runs` | RunRequest | `{"job_id": "a1b2c3"}` (202) |
| GET | `/api/runs/{job_id}` | — | JobStatus (§2.5) |
| DELETE | `/api/runs/{job_id}` | — | JobStatus with `state: "cancelled"` |
| GET | `/api/studies` | — | `[{"id","title","summary"}]` |
| GET | `/api/studies/{id}` | — | Study (§2.7) |

### 2.1 Universe
```json
{"as_of": "2026-10-07", "source": "snapshot",
 "assets": [{"ticker": "TCS.NS", "symbol": "TCS", "name": "Tata Consultancy Services Ltd.",
             "sector": "Information Technology", "excluded_reason": null}]}
```

### 2.2 RunRequest
```json
{
  "tickers": null,
  "k": 5,
  "risk_aversion": 0.5,
  "sector_cap": 2,
  "target_return": null,
  "capital": 1000000,
  "holdings": {},
  "qubit_cap": 12,
  "qaoa": {"variant": "standard", "reps": 2, "optimizer": "COBYLA", "init": "ramp",
           "shots": 4096, "maxiter": 150, "noise": false, "seed": 7}
}
```
- `tickers`: `null` means all non-excluded NIFTY 50 stocks.
- `holdings`: maps ticker to share count.
- `variant`: `standard` or `xy`.
- `optimizer`: `COBYLA`, `SPSA` or `NELDER_MEAD`.
- `init`: `random`, `ramp` or `interp`.
- `qubit_cap`: default 12 (a live run takes under a minute); max 16, the FakeGuadalupeV2 size (about 3 min per run).
- Validation: 2 ≤ k ≤ 15, 0 ≤ risk_aversion ≤ 1, 1 ≤ reps ≤ 5, 256 ≤ shots ≤ 20000.

### 2.3 Sample (inside results)
```json
{"bitstring": "1010010010", "prob": 0.083, "objective": -0.0412, "feasible": true, "optimal": true}
```

### 2.4 ScreenInfo
```json
{"applied": true,
 "rule": "Kept the 12 stocks with the highest estimation-window Sharpe ratio (2023-10-01 to 2025-09-30, rf 5.57%), max 3 per sector, to fit 16 qubits (12 assets + 4 slack).",
 "kept": ["TCS.NS", "..."], "dropped": ["ITC.NS", "..."],
 "qubits": {"assets": 12, "slack": 4, "total": 16}}
```

### 2.5 JobStatus
```json
{"job_id": "a1b2c3", "state": "running", "progress": 0.42,
 "stage": "Optimising QAOA parameters (iteration 63 of 150)",
 "convergence": [{"iter": 1, "energy": -0.012}, {"iter": 2, "energy": -0.019}],
 "elapsed_s": 7.9, "result": null, "error": null}
```
- `state` is one of `queued`, `running`, `done`, `error` or `cancelled`.
- `result` is a RunResult when `done`.
- `error` is a plain-language string when `error`.

### 2.6 RunResult
```json
{
  "run_id": "a1b2c3",
  "request": {"...": "echo of RunRequest"},
  "data": {"source": "snapshot", "as_of": "2026-10-07",
           "est_window": ["2023-10-01", "2025-09-30"], "test_window": ["2025-10-01", "2026-09-30"],
           "excluded": {"TMPV.NS": "Demerger on 2025-10-14 breaks the price series in the test window"},
           "filled": {"INDIGO.NS": 1},
           "notes": ["Survivorship bias: today's NIFTY 50 list is used for past dates."]},
  "screen": {"applied": false, "rule": "", "kept": [], "dropped": [], "qubits": {"assets": 10, "slack": 3, "total": 13}},
  "qubo": {"n_vars": 13, "n_assets": 10, "n_slack": 3,
           "terms": ["objective", "cardinality", "sector_cap", "transaction_cost"],
           "penalties": {"cardinality": 0.42, "sector_cap": 0.42}},
  "landscape": {"n_feasible": 210, "f_min": -0.071, "f_max": 0.012, "f_mean": -0.031},
  "solvers": [
    {"solver": "brute_force", "label": "Brute force (exact)", "kind": "classical",
     "selection": ["TCS.NS", "..."], "bitstring": "1010010010",
     "objective": -0.071, "exp_return": 0.214, "volatility": 0.131, "variance": 0.0172, "txn_cost": 0.0012,
     "feasible": true, "violations": [], "runtime_s": 0.04,
     "approx_ratio": 1.0, "p_opt": null, "feasible_rate": null,
     "portfolio": {"rows": [{"ticker": "TCS.NS", "name": "...", "sector": "...", "weight": 0.2,
                             "shares": 52, "price": 3810.5, "value": 198146.0}],
                   "invested": 991230.0, "cash_left": 8770.0},
     "oos": {"ann_return": 0.112, "ann_vol": 0.142, "sharpe": 0.39, "max_drawdown": -0.118},
     "details": {}}
  ],
  "qaoa": {"solver": "qaoa_standard",
           "convergence": [{"iter": 1, "energy": -0.012}],
           "samples": [{"bitstring": "1010010010", "prob": 0.083, "objective": -0.071, "feasible": true, "optimal": true}],
           "metrics": {"approx_ratio": 0.83, "p_opt": 0.083, "p_random": 0.0048, "feasible_rate": 0.61},
           "circuit": {"qubits": 13, "reps": 2, "depth": 96, "two_qubit_gates": 156, "optimizer": "COBYLA", "init": "ramp", "seed": 7},
           "noise": null},
  "frontier": {"continuous": [{"risk": 0.11, "ret": 0.15}],
               "discrete": [{"risk": 0.131, "ret": 0.214, "selection": ["TCS.NS", "..."]}]},
  "benchmarks": {"nifty50": {"ann_return": 0.08, "ann_vol": 0.13, "sharpe": 0.19, "max_drawdown": -0.12}},
  "verdict": {"level": "near",
              "headline": "QAOA found a portfolio within 0.8% of the exact optimum.",
              "details": ["It sampled the exact optimum with probability 8.3%, 17x more often than a random guess (0.48%).",
                          "Brute force solved this 10-stock instance exactly in 0.04 s; no speed benefit is claimed at this size."]},
  "recommended": "brute_force",
  "betas": {"TCS.NS": 0.82, "...": 1.0},
  "candles": {"brute_force": [{"date": "2025-10-03", "open": 1000000, "high": 1004100, "low": 998200, "close": 1002300}], "nifty50": ["..."]},
  "assets": [{"ticker": "TCS.NS", "name": "Tata Consultancy Services Ltd.", "sector": "Information Technology", "exp_return": 0.12, "volatility": 0.21}],
  "correlation": {"tickers": ["TCS.NS", "ITC.NS"], "matrix": [[1.0, 0.18], [0.18, 1.0]], "covariance": [[0.044, 0.007], [0.007, 0.035]]}
}
```
- **Solver ids:** `brute_force`, `relaxation`, `annealing`, `qaoa_standard`, `qaoa_xy`.
- **Enums:** `kind` is `classical` or `quantum`; `verdict.level` is `matched`, `near`, `worse` or `no-feasible`. Frontier points are plain dicts (`risk`, `ret`, plus `selection` for discrete).
- **No feasible sample:** a QAOA solver with no feasible sample has `selection: null`, `bitstring: null`, `feasible: false`, and null numbers, but **still has** `feasible_rate`.
- **`volatility`:** equals `sqrt(variance)`.
- **`assets` / `correlation` (portfolio report, optional):** `assets` has one row per stock of the requested universe (a superset of the screened, solved one; the same market the betas use); `exp_return` is the annualised mean log return (mu) and `volatility` is `sqrt(diag(Sigma))`, both from the estimation window only. `correlation` is `{tickers, matrix, covariance}` for the recommended portfolio's stocks: `matrix` = `cov / (sd_i * sd_j)` (diagonal 1, values in [-1, 1]); `covariance` = annualised covariance of daily log returns (x252), the same Sigma the optimiser uses.
- **`qaoa.noise`:** when noise is on, `{"backend": "FakeGuadalupeV2", "ideal": {metrics}, "noisy": {metrics}, "transpiled": {"depth": int, "two_qubit_gates": int}}`.
- **`details` per solver:**
  - relaxation: `relaxed_x` and `rounding`;
  - annealing: `seed` and `sweeps`;
  - QAOA: `most_probable`.

### 2.7 Study
```json
{"id": "depth", "title": "Effect of circuit depth",
 "description": "Mean over 10 fixed-seed 10-asset, K=5 instances, est window 2023-10-01..2025-09-30.",
 "x_label": "QAOA depth p", "y_label": "1 - approximation ratio",
 "series": [{"label": "Standard mixer", "points": [{"x": 1, "y": 0.31, "yerr": 0.05}]},
            {"label": "XY mixer + Dicke", "points": [{"x": 1, "y": 0.12, "yerr": 0.03}]}],
 "instance": {"n_assets": 10, "k": 5, "q": 0.5, "seeds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "shots": 4096},
 "notes": ["Noiseless statevector simulation."], "generated_at": "2026-10-09", "wall_time_s": 812.0}
```
Study ids: `depth`, `optimizer`, `init`, `mixer` and `noise`. A study may add more series. The frontend renders any number of series generically.
