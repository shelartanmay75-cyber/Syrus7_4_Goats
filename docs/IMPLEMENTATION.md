# Implementation plan: Quantum Portfolio Optimiser (PS-03)

Team 4 GOATS · Qiskit Fall Fest 2026 · NIFTY 50

**One line:** quantum portfolio optimisation you can trust. It grades itself against the exact answer, shows what hardware noise does to your rupees, and turns the result into a stress-tested whole-share trade list for Indian investors.

- Live app: https://quantum-portfolio.onrender.com · API: https://quantum-portfolio-api.onrender.com/api/health
- Detailed design (requirements R1–R22, decisions KTD1–KTD16, units U1–U15): [plans/2026-10-08-2115-feat-quantum-portfolio-optimiser-plan.md](plans/2026-10-08-2115-feat-quantum-portfolio-optimiser-plan.md)
- Frozen interfaces: [../TEAMS/CONTRACTS.md](../TEAMS/CONTRACTS.md)

---

## 1. Goal and scope

| | |
|---|---|
| Problem | Choose exactly K stocks from the NIFTY 50 that balance estimated return against risk, under real-world rules |
| Quantum method | QAOA on Qiskit 2.5 V2 primitives, our own loop (no `qiskit_finance` / `qiskit_optimization`) |
| Baselines | Brute force (exact), relaxation + rounding (CVXPY), simulated annealing |
| Output | Portfolio, whole-share ₹ trade list, honest verdict, stress tests, report with CSV/PDF export |
| Non-goals | Claiming quantum advantage; live trading; investment advice |

## 2. Architecture

```text
yfinance snapshot (parquet, cached)            frontend (React 19 + Vite + Tailwind 4 + Recharts 3)
        │                                              ▲  polls every 500 ms
        ▼                                              │
data/  estimation window 2023-10-01..2025-09-30 ──► μ, Σ, betas      FastAPI  /api/runs  (job runner, 1 worker)
       test window       2025-10-01..2026-09-30 ──► backtest only          │
        │                                                                  ▼
pre-screen (Sharpe, sector-aware) ──► Problem ──► QUBO (+ slack bits) ──► pipeline.run()
                                                   │                        │
                       ┌───────────────┬───────────┴───────┬────────────────┤
                       ▼               ▼                   ▼                ▼
                  brute force    relaxation+round   simulated annealing   QAOA (XY mixer + Dicke)
                       │               │                   │                │ ideal sampling
                       │               │                   │                │ noisy sampling (FakeGuadalupeV2)
                       └───────────────┴─────── Problem.evaluate (the only judge) ──┘
                                                   │
                   metrics (approx ratio, P(opt), random baseline) ─► verdict ─► RunResult JSON
                   frontier · out-of-sample backtest · weekly candles · betas · correlation
```

## 3. Mathematical core

- **Objective (minimised):** F(x) = q · xᵀΣx / K² − (1 − q) · (μᵀx / K − tc(x)). x ∈ {0,1}ⁿ picks stocks, q is risk aversion (Lower risk 0.8 · Balanced 0.5 · Growth 0.2), and tc is the Indian buy/sell cost (0.1187% / 0.1037%).
- **Constraints as QUBO penalties:**
  - exactly K stocks (pair coefficient 2A);
  - sector cap via ⌈log₂(cap+1)⌉ slack bits;
  - minimum target return via 3 slack bits;
  - existing holdings change only the cost term.
  - The penalty weight A comes from a bound, never from the solved optimum.
- **Ising mapping:** x = (1 − Z)/2. The qubit cap defaults to 12 variables (assets plus slack bits), with a maximum of 16.
- **QAOA:**
  - ansatz: XY ring mixer (XX+YY) on a Dicke-state start, so samples stay at exactly K stocks; a standard X mixer is also available;
  - depth p 1–4, optimised with COBYLA from a ramp or `interp` start;
  - 2,048 ideal shots; the reported portfolio is the best feasible sample.
- **Noise:** the same circuit and angles are re-sampled on the FakeGuadalupeV2 noise model (sample-only mode). The cap is 1,024 shots, set by `QP_NOISY_SHOTS` (32 on the free server).
- **Metrics:**
  - approximation ratio (Brandhofer Eq. 8);
  - P(optimum) against the uniform-random baseline;
  - feasible rate;
  - for the backtest: realised return, volatility, Sharpe and max drawdown against NIFTY 50.

## 4. Honesty gates (enforced by code and tests)

| Rule | How it is enforced |
|---|---|
| No classical answer wrapped in a circuit | QAOA's portfolio is only ever the best feasible sampled bitstring |
| No injected optimum | Only warm start is QAOA's own depth p−1 angles (`interp`), labelled |
| No look-ahead | μ, Σ, betas and the pre-screen use the estimation window only; the test window feeds the backtest only |
| No silent repair | No feasible sample gives `selection: null`, shown as such (also for the noisy pick) |
| One judge | `Problem.evaluate` is the only feasibility and objective function |
| No advantage claims | Verdict and UI texts are checked for banned phrases in tests |
| Bad results shown | The verdict says when QAOA matched the optimum but sampled it less often than random guessing |

## 5. Delivery phases

| Phase | What was built | Owner | Status |
|---|---|---|---|
| 0. Research and plan | PS-03 brief, Qiskit 2.5 environment spike, competitor and USP research (32 projects), unified plan, team prompts | TEAM-1 | Done |
| 1. Contracts and data | Pydantic contracts and API examples; yfinance snapshot; NIFTY 50 list (TMPV.NS excluded, demerger); μ/Σ; Sharpe pre-screen; costs | TEAM-1, TEAM-2 | Done |
| 2. QUBO | Builder, constraints (K, sector cap, target return, holdings), penalty bound, Ising map, plain-language infeasibility errors | TEAM-1 | Done |
| 3. Quantum core | QAOA loop on V2 primitives, XY mixer and Dicke state, init strategies, COBYLA, little-endian decoding, noise layer | TEAM-1 | Done |
| 4. Classical and metrics | Brute-force landscape, CVXPY relaxation and rounding, simulated annealing, approx ratio and P(opt), frontier, verdict | TEAM-3 | Done |
| 5. Pipeline and API | `pipeline.run`, FastAPI job runner (progress, cancel, convergence stream), universe and screen endpoints, stress endpoints | TEAM-1, TEAM-2 | Done |
| 6. Evidence studies | Depth, mixer, init, optimiser and noise studies (5 seeded instances each) shown on the Evidence page | TEAM-1 | Done |
| 7. Frontend | Landing page and ASCII hero, guided tour, Simple / Quantum research modes, optimise flow, results dashboard, method comparison candles, stress tests, historical replay, Stress Test page, Portfolio Report with 6 heatmaps, CSV/PDF export, glossary, white/black themes | TEAM-4, TEAM-1 | Done |
| 8. Noise analysis | Noisy pick, its expected return and volatility, and same-as-ideal flag in every run; report section; CSV block | TEAM-1 | Done |
| 9. Deployment | Render web service (API) and static site (frontend), env-tuned for the free tier, keep-alive workflow | TEAM-1 | Done |
| 10. Docs | README for judges, 5-minute demo script, this plan | TEAM-1 | Done |

**Team split:**
- **TEAM-1 (Claude Code):** quantum core, integrator and PR merges.
- **TEAM-2 (Antigravity):** data and API.
- **TEAM-3 (Antigravity):** classical methods and metrics.
- **TEAM-4 (Antigravity):** frontend.

Each team works on its own `team-N/work` branch against frozen contracts, and TEAM-1 merges by PR after the tests pass.

## 6. Features by screen

- **Landing:** pitch, how it works, the honest-verdict promise, ASCII bull and chart.
- **Optimise:**
  - presets, stock universe and constraints;
  - a summary, then Run with live progress and the convergence chart;
  - results: portfolio and ₹ trade list, verdict, method comparison (weekly candlesticks per method and NIFTY 50, grouped bars), stress cards (beta crash, VaR/ES volatility spike, sector shock, loss drivers), historical replay.
- **Stress Test:** a scenario builder, multi-scenario sensitivity and robustness comparison, served by backend stress endpoints.
- **Portfolio Report, sections A–J:**
  - A summary · B expected returns and compounding · C risk · D scenarios · E backtest · F expected vs actual · G quantum vs classical;
  - H noise analysis · I heatmaps (correlation, covariance, allocation by method, risk contribution, monthly returns, stress) · J sources;
  - CSV and Print/PDF export.
- **Evidence, Methodology, Glossary:** studies, QUBO derivation, plain-language terms.

## 7. Verification

| Check | Result |
|---|---|
| Backend tests | `uv run pytest -q`: contracts, problem, QUBO, QAOA (incl. noise), pipeline (incl. report fields), metrics (incl. honest verdict), API, data, stress |
| Frontend | `npm run build` (TypeScript strict) passes |
| Browser end to end (local) | Full run in about 12 s without noise; all report sections render with no NaN; CSV of 68 lines with figures checked by hand |
| Deployed end to end | Full run with noise completes in about 80 s on the free tier; result carries noise, betas, candles, assets and correlation |
| Studies | XY + Dicke: 100% valid samples vs 39.4% (standard mixer); P(opt) 3.4% vs 0.23%. Noise: valid samples 100% → 16%, approx ratio 0.70 → 0.08 |
| Live run (example) | Ideal: 94.8% valid, P(opt) 0.10% vs random 0.43% (shown honestly). Noisy: 14.6% valid, different portfolio, +72.7% vs +74.4% estimated return. Test year: +3.5% vs NIFTY 50 −9.0% |

## 8. Deployment

| Item | Setting |
|---|---|
| API | Render web service, free plan, Singapore. Build `pip install -r backend/requirements.txt`; start `uvicorn qportfolio.api.main:app`. Env: `PYTHON_VERSION=3.13.0`, `PYTHONUTF8=1`, `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, `QP_NOISY_SHOTS=32`, `CORS_ORIGINS=*` |
| Frontend | Render static site: `npm ci && npm run build` in `frontend/`, publishing `frontend/dist`, with `VITE_API_BASE_URL` set to the API URL |
| Keep-alive | `.github/workflows/keep-alive.yml` pings the API every 10 minutes (the free tier sleeps after 15 minutes idle) |
| Redeploys | Triggered by hand after merges (Render's GitHub app is not installed on the org, so automatic deploys do not fire) |
| Free-tier limits | 0.15 CPU and 512 MB: noisy sampling costs about 0.1 s per shot, hence 32 noisy shots online and 1,024 locally |

## 9. Risks and limits

- Simulator, not hardware: the noise model approximates one IBM device.
- Small instances (12 variables), so brute force is instant and no speed claim is made.
- One test year is one sample; estimates are much higher than the realised return in the example run.
- Equal weights, buy-and-hold; no taxes, slippage, rebalancing or separately modelled dividends.
- Survivorship bias, because today's NIFTY 50 list is used for past dates.
- Educational tool, not investment advice.

## 10. Next steps (after the hackathon)

1. A real IBM Quantum run on one instance, with readout-error mitigation and feasibility post-selection. This needs an IBM token.
2. A CVaR-QAOA objective with an equal-budget ablation against plain expectation.
3. Parameter transfer from 10 to 12 assets to cut optimiser iterations.
4. An exact MIP baseline (stronger than relaxation + rounding).
5. Sector decomposition to cover all 50 stocks.
6. Extend the data back to 2020 for COVID and 2022 historical crash replays.
7. Install Render's GitHub app, or add deploy hooks, for automatic redeploys; optionally a Vercel frontend.
