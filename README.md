# Quantum Portfolio Optimiser

Quantum portfolio optimisation you can trust: it grades itself against the exact answer, shows what hardware noise does to your rupees, and turns the result into a stress-tested whole-share trade list for Indian investors.

Team 4 GOATS | PS-03 Portfolio Optimisation using Quantum Computing | Qiskit Fall Fest 2026

## Live demo

- **Frontend:** https://quantum-portfolio.onrender.com
- **API health check:** https://quantum-portfolio-api.onrender.com/api/health
- Free hosting sleeps after 15 minutes idle, so the first visit can take about 1 minute to wake.
- The free server uses 32 noisy shots (local runs use 1,024), so noise figures online are rougher than local ones.
- A 5-minute walkthrough is in [DEMO.md](DEMO.md).

## What makes it different

Figures below come from one run on the NIFTY 50 snapshot. Other stocks, settings or seeds give other numbers.

- **Honest verdict every run.** QAOA is checked against the exact optimum (brute force over every portfolio), a random-guess baseline and two classical methods (relaxation + rounding, simulated annealing). Bad results are shown. In one run QAOA sampled the optimum 0.10% of the time, against 0.43% for random guessing, and the app said so.
- **No cheating.**
  - The classical answer is never fed to the circuit.
  - No future prices: estimation uses 2023-10-01 to 2025-09-30, scoring uses 2025-10-01 to 2026-09-30.
  - Invalid samples are never repaired. With no valid sample, the app shows no portfolio.
  - Banned claim words in the verdict text are blocked by tests.
- **Constraint-preserving XY-mixer QAOA with a Dicke-state start.** It stays inside the space of portfolios with exactly K stocks. In our studies 100% of samples were valid, against 39.4% for the standard mixer.
- **Noise analysis on a simulated IBM 16-qubit chip (FakeGuadalupeV2).** In one run, valid samples fell from 94.8% to 14.6%. The noisy run reported a different portfolio (BHARTIARTL in, M&M out). Estimated return went from +74.4% to +72.7%, about Rs 16,879 a year on Rs 10 lakh. The compiled circuit has 1,159 two-qubit gates.
- **Unseen-year test.** The estimated return was +74%. The actual return on the unseen test year was +3.5%, while the NIFTY 50 fell 9%. The app shows estimates and outcomes separately.
- **Indian retail output.** NIFTY 50 universe, whole-share rupee trade list, Indian brokerage costs (buy 0.1187%, sell 0.1037%) and a 5.57% risk-free rate. Constraints: exactly K stocks, sector cap, target return, existing holdings.
- **Market crash stress test.** Beta-scaled crash, volatility spike (VaR and Expected Shortfall), sector shock, loss drivers, and a historical replay of the NIFTY's worst fall in the test year. A separate Stress Test page has a scenario builder.
- **Portfolio Report.** Summary, compounded projections, 5 editable scenarios, 6 heatmaps (correlation, covariance, allocation by method, risk contribution, monthly returns, stress), CSV and PDF export.
- **Beginner-first UI.** Landing page, guided 8-step tour, Simple and Quantum research modes, a "How is this calculated?" note on every figure, white and black themes.

## How it works

1. **Data.** NIFTY 50 prices (a checked-in snapshot, so it works offline) become daily log returns. Expected returns and covariance come from the estimation window only. If stocks plus slack bits exceed 16 qubits, a declared Sharpe-ratio pre-screen shortlists the stocks, and every solver gets the same shortlist.
2. **QUBO.** One yes/no variable per stock. The objective is risk-weighted variance minus return. Investment rules (exactly K stocks, sector cap, target return, existing holdings and costs) become penalty or objective terms.
3. **Four solvers on the same problem.** Our own QAOA loop on Qiskit primitives, plus brute force, relaxation + rounding, and simulated annealing.
4. **Honesty checks.** Every answer is scored by one exact function. QAOA is compared with the exact optimum and with random guessing, tested on the unseen year against the NIFTY 50, and re-sampled on the noisy chip. A generated verdict reports all of it, good or bad.
5. **Report.** A whole-share rupee trade list, stress tests, and a Portfolio Report with heatmaps, scenarios and CSV or PDF export.

## Run locally

Needs [uv](https://docs.astral.sh/uv/) (Python 3.13 is pinned in `backend/.python-version`) and Node.js. Run from the repo root and quote any path with spaces. The first `uv sync` can take about 10 minutes.

Terminal 1, backend (API on port 8000):

```powershell
$env:PYTHONUTF8="1"
cd backend
uv sync
uv run uvicorn qportfolio.api.main:app --port 8000 --reload --reload-dir qportfolio
```

Terminal 2, frontend (dev server on port 5173):

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (the dev server proxies `/api` to port 8000). Health check: http://localhost:8000/api/health.

- **Noisy shots:** the `QP_NOISY_SHOTS` environment variable caps the shots used for the noisy run. The default is 1024. A small host can lower it, for example `$env:QP_NOISY_SHOTS="32"` before starting uvicorn.
- **Offline:** nothing needs the network. Prices come from the checked-in `backend/data/snapshot/prices.parquet` (50 tickers + ^NSEI, 2023-09-01 to 2026-10-07), and the data banner shows the snapshot date.
- **Phone on the same Wi-Fi:** add `--host 0.0.0.0` to the uvicorn command and run `npm run dev -- --host`, then open `http://<laptop-ip>:5173` on the phone. Allow the Windows Firewall prompt for private networks.
- **UI without a backend:** `$env:VITE_USE_MOCKS="1"; npm run dev` replays the example payloads in `contracts/api-examples/`. These are illustrative, not live results.
- **Checks:** `cd backend; uv run pytest -q` and `cd frontend; npm run build`.
- **Streamlit:** `streamlit run streamlit_app.py`, or deploy it to [Streamlit Community Cloud](https://share.streamlit.io). See [STREAMLIT.md](STREAMLIT.md).
- **Render:** the backend deploys from [`render.yaml`](render.yaml) or the root Dockerfile. See [RENDER.md](RENDER.md).

## Limits

- **Simulator, not hardware.** All circuits run on classical simulators. The noise results use a fake-backend model of an IBM chip, not a real device. There is no real-hardware run and no job IDs.
- **Small problem size.** The cap is 16 qubits (stocks plus slack bits), so brute force finishes instantly and is always available as the exact answer. Larger universes go through the declared pre-screen, so QAOA solves the reduced problem.
- **One test year.** Out-of-sample scores cover a single year. They are a leakage check, not evidence of skill.
- **Simplified investing.** No taxes, slippage or rebalancing. QAOA picks the stocks; weights are equal, converted to whole shares.
- **Survivorship bias.** Today's NIFTY 50 list is applied to past dates. It is stated, not corrected.
- **Noise is sample-only.** QAOA angles are optimised without noise, then the same circuit is sampled with noise.

Educational project, not investment advice.

## Technical reference

**Objective.** x_i = 1 if stock i is held, q in [0,1] is risk aversion, K the number of picks:

```
F(x) = q·xᵀΣx/K² − (1−q)·(μᵀx/K − tc(x))
```

tc(x) is transaction cost against current holdings (cash if none; buy 0.1187%, sell 0.1037%). Scaling by K means any selection scores as the risk-penalised net return of its equal-weight portfolio. Every solver minimises this F plus the same penalties. mu and Sigma are annualised (x252) from the estimation window only. A ticker with more than 5% missing data in that window is excluded, gaps of up to 3 days are forward-filled, and both are reported. `TMPV.NS` is excluded by default (demerger break in the test window).

**Pre-screen** (only when assets + slack bits exceed 16). Rank by estimation-window Sharpe (mu_i - rf)/sigma_i with rf = 5.57%, keep the top N = 16 - slack bits and at most cap+1 per sector.

**Constraint registry.** A new constraint is a new registry entry; no solver changes.

| Constraint | Form | In the QUBO |
|---|---|---|
| Cardinality | sum x = K | quadratic penalty A(sum x - K)^2 |
| Sector cap | sum of x_i in sector s <= cap | slack bits, ceil(log2(cap+1)) per sector, only where candidates exceed cap |
| Target return | mu.x/K - tc(x) >= R | 3-bit discretised slack |
| Transaction cost | tc(x) | objective term, no penalty |

Penalty weights: brute force over the QUBO (at most 65,536 states), doubling from 0.5x the objective spread, smallest weight whose best infeasible state is at least (F_min + mean feasible F)/2 (Brandhofer et al., Eq. 11). Feasibility is still re-checked exactly.

**QAOA** is our own loop: `QAOAAnsatz`, flattened, `StatevectorEstimator` for the energy, a classical optimiser, then `StatevectorSampler` for the final samples. No qiskit-optimization, qiskit-finance or qiskit-algorithms.
- **XY ring + Dicke (app default):** Dicke(n_assets, K) initial state, `XXPlusYYGate` ring mixer on asset qubits, X mixer on slack qubits, no cardinality term.
- **Standard:** X mixer, constraints as penalties. Available in the advanced settings and used in the studies.
- **Optimisers:** COBYLA and Nelder-Mead (SciPy), and SPSA (our own seeded implementation).
- **Initial points:** random (seeded uniform), linear ramp, and INTERP, the declared warm start that interpolates QAOA's own optimal depth p-1 parameters.

**Baselines** (same data, same constraints):
- brute force over every K-subset (also gives the landscape for the metrics);
- CVXPY convex relaxation, then top-K rounding with the rule reported and no hidden repair;
- simulated annealing: seeded single-flip Metropolis on the same QUBO including slack bits.

**Noise:** FakeGuadalupeV2 through Aer `NoiseModel.from_backend`, transpiled at optimisation level 1. Parameters are optimised noiselessly, then the same parameters are sampled ideally and under noise, and both sets of metrics are reported.

**Serving.** `Problem.evaluate` is the only feasibility judge and objective evaluator. FastAPI runs one job at a time (the UI polls every 500 ms and can cancel); the React app renders the result.

## Honesty rules we follow

| PS-03 "Not allowed" | What we do |
|---|---|
| Solving classically and wrapping the answer in a circuit | The QAOA portfolio is the best feasible bitstring sampled from the optimised circuit, judged by `Problem.evaluate`. There is no repair: with no feasible sample the selection is `null` and shown as such. |
| Injecting the known optimum as an undeclared initial state | No classical solution enters the circuit. The only warm start is INTERP (QAOA's own depth p-1 parameters), labelled wherever it appears. Brute force is used for scoring and for tuning penalty weights, never as a state. |
| Using future data in estimation | mu, Sigma, the pre-screen and estimation-end prices use 2023-10-01..2025-09-30 only. The test window 2025-10-01..2026-09-30 is used only for out-of-sample scoring. A test enforces this. |
| Overclaiming quantum performance | No claim that quantum beats classical. The banned claim phrases listed in `AGENTS.md` are blocked in verdict text by a test. Neutral and negative results are reported. |

## Evidence studies

Source: `backend/data/studies/*.json`, written by `backend/scripts/run_studies.py` on 2026-10-09. Instances are random 10-ticker subsets of the NIFTY 50 snapshot (real prices; the JSON notes call them "synthetic subsets"), K = 5, q = 0.5, no sector cap, target or costs, estimation window only, seeds 1 to 5, 4096 shots, 60 optimiser iterations, noiseless statevector unless stated. Values are mean ± sample standard deviation over instances. r is the approximation ratio, so 1 - r is lower-is-better.

| Study | Varied (other settings fixed) | Metric | Result |
|---|---|---|---|
| Depth, standard mixer | p = 1, 2, 3, 4 (COBYLA, ramp) | 1 - r | 0.858 ± 0.046, 0.737 ± 0.092, 0.799 ± 0.095, 0.862 ± 0.072 |
| Depth, XY + Dicke | p = 1, 2, 3, 4 (COBYLA, ramp) | 1 - r | 0.347 ± 0.094, 0.289 ± 0.052, 0.293 ± 0.078, 0.241 ± 0.015 |
| Depth, mean P(opt) | standard / XY, p = 1 to 4 | P(opt) | 0.0031, 0.0019, 0.0023, 0.0022 / 0.0128, 0.0189, 0.0339, 0.0379 |
| Optimiser | COBYLA, SPSA, Nelder-Mead (standard, p = 3, ramp) | 1 - r | 0.799 ± 0.095, 0.850 ± 0.029, 0.916 ± 0.042 |
| Initial point | random, ramp, INTERP (standard, p = 3, COBYLA) | 1 - r | 0.793 ± 0.056, 0.799 ± 0.095, 0.853 ± 0.047 |
| Mixer | standard vs XY + Dicke (p = 3, COBYLA, ramp) | feasible rate | 0.394 ± 0.202 vs 1.000 ± 0.000 |
| Mixer | same | P(opt) | 0.0023 ± 0.0010 vs 0.0339 ± 0.0265 |
| Noise (negative) | ideal vs noisy sampling, FakeGuadalupeV2 (XY + Dicke, p = 2, COBYLA, ramp; 1 instance, seed 1) | r | 0.697 to 0.081 |
| Noise (negative) | same | P(opt) | 0.0034 to 0.00024 |
| Noise (negative) | same | feasible rate | 1.000 to 0.160 |

Reading these without spin:
- Depth gave the standard mixer no consistent gain (p = 4 is no better than p = 1 within the error bars). The XY mixer improved slowly with p.
- At 60 iterations COBYLA beat SPSA and Nelder-Mead. This is a small budget, so the ranking is for this budget only.
- The INTERP warm start did not help; its error bar overlaps random and ramp.
- XY keeps every sample feasible (1.000 vs 0.394) and has the higher P(opt). For scale (arithmetic from n = 10, K = 5, not from the JSON): a uniform draw over all 1024 bitstrings hits the optimum with probability 0.00098, and a uniform draw over the 252 feasible subsets with 0.0040.
- Under noise the same XY parameters lose most of their quality, and only 16% of samples stay feasible. The study did not run the standard mixer under noise, so it does not show which mixer is more robust.
- Reduced scope: the plan called for 10 instances and p = 1 to 5. The checked-in studies use 5 instances, p = 1 to 4, 60 iterations, and a single noise instance with no error bar.

Regenerate the studies: `cd backend; uv run python scripts/run_studies.py --force`.

## Repo map

| Path | Contents |
|---|---|
| `backend/` | `qportfolio/` (data, qubo, quantum, classical, api, pipeline), `scripts/` (`fetch_snapshot.py`, `run_studies.py`, `smoke.py`), `data/` (snapshot, studies, `nifty50.csv`), `tests/` |
| `frontend/` | React 19, Vite 8, TypeScript, Tailwind 4, Recharts 3 |
| `contracts/` | Example API payloads used by mock mode |
| `docs/` | Plan (`docs/plans/`) and research notes (`docs/research/`), including the problem statement |
| `TEAMS/` | Team briefs and `CONTRACTS.md`, the frozen Python and HTTP interfaces |
| `DEMO.md` | 5-minute demo script, judge Q&A and fallback |

## Team

| Team | Member | Built |
|---|---|---|
| 1 | Wahab | QUBO, QAOA, noise, pipeline, evidence studies, contracts, integration |
| 2 | Tanmay | Market data, pre-screen, costs, whole shares, API |
| 3 | Piyush | Classical baselines, metrics, frontier, verdict |
| 4 | Swastik | Web app: form, live run, results, evidence page, mobile layout |
