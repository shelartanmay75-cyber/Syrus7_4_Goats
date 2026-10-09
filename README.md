# Quantum Portfolio Optimiser

Team 4 GOATS | PS-03 Portfolio Optimisation using Quantum Computing | Qiskit Fall Fest 2026

## What it does

Takes NIFTY 50 daily prices to a K-stock portfolio, formulated as one QUBO with real investment rules (cardinality, sector cap, target return, transaction cost).
Solves it with our own QAOA loop on Qiskit 2.5 primitives and with three classical baselines (brute force, CVXPY relaxation + rounding, simulated annealing) on the same data and constraints.
A React app shows the portfolio against the efficient frontier and every solver, with live convergence, sampled bitstrings, noise effect, out-of-sample scores and a verdict. No quantum advantage is claimed.

## Quick start (Windows, PowerShell)

Needs [uv](https://docs.astral.sh/uv/) (Python 3.13 is pinned in `backend/.python-version`) and Node.js. Run from the repo root and quote any path with spaces. The first `uv sync` can take about 10 minutes.

Terminal 1, backend:

```powershell
$env:PYTHONUTF8="1"
cd backend
uv sync
uv run uvicorn qportfolio.api.main:app --port 8000 --reload --reload-dir qportfolio
```

Terminal 2, frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (the dev server proxies `/api` to port 8000). Health check: http://localhost:8000/api/health.

- **Offline:** nothing needs the network. Prices come from the checked-in `backend/data/snapshot/prices.parquet` (50 tickers + ^NSEI, 2023-09-01 to 2026-10-07), and the data banner shows the snapshot date.
- **Phone on the same Wi-Fi:** add `--host 0.0.0.0` to the uvicorn command and run `npm run dev -- --host`, then open `http://<laptop-ip>:5173` on the phone. Allow the Windows Firewall prompt for private networks.
- **UI without a backend:** `$env:VITE_USE_MOCKS="1"; npm run dev` replays the example payloads in `contracts/api-examples/`. These are illustrative, not live results.
- **Checks:** `cd backend; uv run pytest -q` and `cd frontend; npm run build`.
- **Streamlit (1-Click Web Deployment):** Run `streamlit run streamlit_app.py` locally or deploy directly to [Streamlit Community Cloud](https://share.streamlit.io) using `streamlit_app.py` as the entrypoint. See [STREAMLIT.md](STREAMLIT.md).
- **Render (Backend Deployment):** Deploy the backend to [Render](https://render.com) using [`render.yaml`](render.yaml) or Docker, and connect it to your Vercel frontend. See [RENDER.md](RENDER.md).

## How it works

Pipeline:

1. **Data.** Adjusted closes become daily log returns. mu and Sigma are annualised (x252) from the estimation window only. A ticker with more than 5% missing data in that window is excluded, gaps of up to 3 days are forward-filled, and both are reported. `TMPV.NS` is excluded by default (demerger break in the test window).
2. **Pre-screen** (only when assets + slack bits exceed the qubit cap, at most 16). Rank by estimation-window Sharpe (mu_i - rf)/sigma_i with rf = 5.57%, keep the top N = 16 - slack bits and at most cap+1 per sector. Every solver gets the same reduced set, and the app says so.
3. **QUBO** from the constraint registry, with tuned penalty weights.
4. **Solve** with QAOA and the three baselines.
5. **Score.** `Problem.evaluate` is the only feasibility judge and objective evaluator. Metrics are measured against the brute-force landscape.
6. **Allocate and test.** Equal weights, converted to whole shares for the investor's capital. Out-of-sample return, volatility, Sharpe and drawdown on the test window against NIFTY 50 (^NSEI), then a generated verdict.
7. **Serve.** FastAPI runs one job at a time (the UI polls every 500 ms and can cancel); the React app renders the result.

**Objective.** x_i = 1 if stock i is held, q in [0,1] is risk aversion, K the number of picks:

```
F(x) = q·xᵀΣx/K² − (1−q)·(μᵀx/K − tc(x))
```

tc(x) is transaction cost against current holdings (cash if none; buy 0.1187%, sell 0.1037%). Scaling by K means any selection scores as the risk-penalised net return of its equal-weight portfolio. Every solver minimises this F plus the same penalties.

**Constraint registry.** A new constraint is a new registry entry; no solver changes.

| Constraint | Form | In the QUBO |
|---|---|---|
| Cardinality | sum x = K | quadratic penalty A(sum x - K)^2 |
| Sector cap | sum of x_i in sector s <= cap | slack bits, ceil(log2(cap+1)) per sector, only where candidates exceed cap |
| Target return | mu.x/K - tc(x) >= R | 3-bit discretised slack |
| Transaction cost | tc(x) | objective term, no penalty |

Penalty weights: brute force over the QUBO (at most 65,536 states), doubling from 0.5x the objective spread, smallest weight whose best infeasible state is at least (F_min + mean feasible F)/2 (Brandhofer et al., Eq. 11). Feasibility is still re-checked exactly.

**QAOA** is our own loop: `QAOAAnsatz`, flattened, `StatevectorEstimator` for the energy, a classical optimiser, then `StatevectorSampler` for the final samples. No qiskit-optimization, qiskit-finance or qiskit-algorithms.
- **Standard:** X mixer, constraints as penalties. The primary solver.
- **XY ring + Dicke:** Dicke(n_assets, K) initial state, `XXPlusYYGate` ring mixer on asset qubits, X mixer on slack qubits, no cardinality term. A comparison arm.

**Optimisers:** COBYLA and Nelder-Mead (SciPy), and SPSA (our own seeded implementation).

**Initial points:** random (seeded uniform), linear ramp, and INTERP, the declared warm start that interpolates QAOA's own optimal depth p-1 parameters.

**Baselines** (same data, same constraints):
- brute force over every K-subset (also gives the landscape for the metrics);
- CVXPY convex relaxation, then top-K rounding with the rule reported and no hidden repair;
- simulated annealing: seeded single-flip Metropolis on the same QUBO including slack bits.

**Noise:** FakeGuadalupeV2 through Aer `NoiseModel.from_backend`, transpiled at optimisation level 1. Parameters are optimised noiselessly, then the same parameters are sampled ideally and under noise, and both sets of metrics are reported.

## Honesty rules we follow

| PS-03 "Not allowed" | What we do |
|---|---|
| Solving classically and wrapping the answer in a circuit | The QAOA portfolio is the best feasible bitstring sampled from the optimised circuit, judged by `Problem.evaluate`. There is no repair: with no feasible sample the selection is `null` and shown as such. |
| Injecting the known optimum as an undeclared initial state | No classical solution enters the circuit. The only warm start is INTERP (QAOA's own depth p-1 parameters), labelled wherever it appears. Brute force is used for scoring and for tuning penalty weights, never as a state. |
| Using future data in estimation | mu, Sigma, the pre-screen and estimation-end prices use 2023-10-01..2025-09-30 only. The test window 2025-10-01..2026-09-30 is used only for out-of-sample scoring. A test enforces this. |
| Claiming quantum advantage without evidence | None claimed. Verdict text may not contain "advantage", "outperforms classical" or "quantum speedup" (tested). Neutral and negative results are reported below. |

## Key results

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

## Limitations

- **n <= 16 qubits** (assets + slack bits, the FakeGuadalupeV2 size). Larger universes go through the declared classical pre-screen, so QAOA solves the reduced problem.
- **Equal weights.** QAOA selects stocks; weights are equal and converted to whole shares. Lot-encoded min/max weights are deferred because they multiply the qubit count.
- **Survivorship bias.** Today's NIFTY 50 list is applied to past dates. It is stated, not corrected.
- **Noise is sample-only,** in live runs and in the study: parameters are optimised noiselessly. This is a fake-backend model, not a real device; there is no real-hardware run and no job IDs.
- **Reduced study scope.** The plan called for 10 instances and p = 1 to 5. The checked-in studies use 5 instances, p = 1 to 4, 60 iterations, and a single noise instance with no error bar. They are random 10-asset subsets with K = 5 and no sector cap, target return or costs.
- **One test window.** Out-of-sample scores are a single year, a leakage check and not evidence of skill.

## Repo map

| Path | Contents |
|---|---|
| `backend/` | `qportfolio/` (data, qubo, quantum, classical, api, pipeline), `scripts/` (`fetch_snapshot.py`, `run_studies.py`, `smoke.py`), `data/` (snapshot, studies, `nifty50.csv`), `tests/` |
| `frontend/` | React 19, Vite 8, TypeScript, Tailwind 4, Recharts 3 |
| `contracts/` | Example API payloads used by mock mode |
| `docs/` | Plan (`docs/plans/`) and research notes (`docs/research/`), including the problem statement |
| `TEAMS/` | Team briefs and `CONTRACTS.md`, the frozen Python and HTTP interfaces |
| `DEMO.md` | 5-minute demo script, judge Q&A and fallback checklist |

Regenerate the studies: `cd backend; uv run python scripts/run_studies.py --force`.

## Team

| Team | Member | Built |
|---|---|---|
| 1 | Wahab | QUBO, QAOA, noise, pipeline, evidence studies, contracts, integration |
| 2 | Tanmay | Market data, pre-screen, costs, whole shares, API |
| 3 | Piyush | Classical baselines, metrics, frontier, verdict |
| 4 | Swastik | Web app: form, live run, results, evidence page, mobile layout |
