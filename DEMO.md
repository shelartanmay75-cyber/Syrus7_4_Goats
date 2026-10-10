# Demo script: 5 minutes

Team 4 GOATS | PS-03 | Qiskit Fall Fest 2026. For the presenter.

Live site: https://quantum-portfolio.onrender.com (API: https://quantum-portfolio-api.onrender.com/api/health).

Rules for the talk:
- Read numbers off the screen. Do not round them in our favour. The numbers quoted below come from our rehearsal run and will differ a little on yours.
- We make no claim that quantum beats classical. Say what the verdict says, including bad results.

## Before you start

- [ ] Two minutes before: open the API health URL so the free server wakes up (first visit can take about 1 minute).
- [ ] Open the frontend. Stay in **Simple** mode (top bar) and the white theme.
- [ ] Do one full rehearsal run so the server is warm. Note how long it takes. The free server uses 32 noisy shots, so noise numbers are rougher than local ones.
- [ ] Keep a local copy ready in case the site is down (see "If the live site is asleep").

## Script

| Time | What to click | One sentence to say |
|---|---|---|
| 0:00 | Landing page. Click nothing yet. | "Quantum portfolio optimisation you can trust: it grades itself against the exact answer, shows what hardware noise does to your rupees, and gives an Indian investor a stress-tested whole-share trade list." |
| 0:30 | Click **Take the 60-second tour**. Press **Next** through the first five stops (stocks, risk profile, how many stocks, review, run), then **Skip tour**. Pick about 10 to 20 stocks, a risk profile and K = 5. Click **Run Portfolio-Pulse Optimization Pipeline**. | "In Simple mode you pick stocks, a risk level and how many to hold, and the app runs the quantum method and three classical methods on the same problem." |
| 1:30 | When the run ends, show the portfolio and trade list, then scroll to the honest verdict. Then scroll to **Compare the methods** (candlesticks and bars). | "QAOA is graded against the exact best answer and against random guessing. In our run it sampled the optimum 0.10% of the time, against 0.43% for random guessing, and the app says so." |
| 2:30 | Click **Portfolio Report** in the sidebar. Scroll to **H - Noise analysis**. | "Same circuit, sampled on a simulated IBM 16-qubit chip: valid samples fell from 94.8% to 14.6%, the pick changed (BHARTIARTL in, M&M out), and the estimated return dropped about Rs 16,879 a year on Rs 10 lakh." |
| 3:15 | Click the **Quantum research** toggle in the top bar. Go back to **Optimise** and scroll to the **Market crash stress test**: crash, volatility spike, sector shock, loss drivers. Then **Historical replay**. | "These are what-ifs, not forecasts: a beta-scaled crash, a volatility spike with VaR and Expected Shortfall, a sector shock, and a replay of the NIFTY's worst fall in the test year." |
| 4:00 | Click **Portfolio Report**. Show the summary (estimated vs actual), the scenarios, then scroll to the heatmaps. Click **Download CSV**. | "One report: five editable scenarios, six heatmaps, and CSV or PDF to take away. The estimate was +74%; the unseen year gave +3.5%, while the NIFTY 50 fell 9%." |
| 4:40 | Stay on the report. | "Limits: simulator, not hardware; small problem so brute force is instant; one test year; no taxes, slippage or rebalancing; today's index list. It is educational, not investment advice." |

If a step runs long, drop the 3:15 historical replay first, then the covariance heatmap. Do not skip the verdict or the noise analysis.

## Likely judge questions

**Is this classical in disguise?**
No. The reported portfolio is the best valid bitstring sampled from the optimised circuit, judged by one exact function. No classical solution enters the circuit. The only warm start reuses QAOA's own lower-depth angles and is labelled. Two classical steps are declared: the pre-screen for large universes, and penalty tuning by enumerating the QUBO.

**Why not 50 qubits?**
Simulation cost doubles with every qubit, and noisy simulation is slower still. We cap at 16 (stocks plus slack bits), the size of the simulated IBM chip. Larger universes go through a declared Sharpe-ratio pre-screen, and QAOA solves the reduced set.

**Does quantum beat classical here?**
We do not claim it. Brute force solves every instance exactly. In our studies the XY mixer reached a valid sample every time, but the optimum still appeared in only about 3% of samples. The verdict shows neutral and negative results as they are.

**Is there look-ahead?**
No. Expected returns, covariance and the pre-screen use 2023-10-01 to 2025-09-30 only. 2025-10-01 to 2026-09-30 is used only for scoring, and a test enforces the split. Survivorship bias remains: today's NIFTY 50 list is applied to past dates.

**Did you run on real hardware?**
No. The noise results come from a simulated IBM chip (FakeGuadalupeV2) in Aer. They can differ from a real device. We have no hardware job IDs.

**Why equal weights?**
Encoding weights needs extra qubits per stock, which we cannot afford at 16 qubits. QAOA picks the stocks; the picks get equal weight and are converted to whole shares for the capital.

## If the live site is asleep

The free host sleeps after 15 minutes idle, and waking takes about 1 minute. Open the health URL first. If it still does not answer, run locally (needs [uv](https://docs.astral.sh/uv/) and Node.js; the first `uv sync` can take about 10 minutes, so do this before the demo).

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

Open http://localhost:5173. Local runs use 1,024 noisy shots (set `QP_NOISY_SHOTS` to change it). Prices come from a checked-in snapshot, so no internet is needed.

Other fallbacks:
- [ ] **Run too slow or stuck.** Cancel, pick fewer stocks and run again.
- [ ] **Recording.** Record one full run of this script beforehand and keep it open. Say "this is a recording of the same script" before playing it.
- [ ] **Mock mode, last resort.** `$env:VITE_USE_MOCKS="1"; npm run dev` replays example payloads, not a live run. Say so out loud and do not quote its numbers as results.
