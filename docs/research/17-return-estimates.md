# 17 - Expected-return estimates: why the optimiser uses CAPM

**Problem.** The report showed +74% expected annual return. That was the raw past average of the stocks the optimiser picked. The optimiser rewards high past returns, so it picks the stocks that just ran up most, and the estimate is biased upward. The same portfolio returned +3.5% in the unseen test year.

**Method choice, without touching the test year.** We split the estimation data: estimate on 2023-10-01..2024-09-30, then check each method per stock on 2024-10-01..2025-09-30. The test year (2025-10-01..2026-09-30) is not used.

| Estimate (49 stocks) | Average predicted | Average error per stock | Rank correlation with reality |
|---|---|---|---|
| Raw past average | +59.8% | 62.7 points | 0.03 |
| Bayes-Stein (Jorion 1986), 52% pull | +41.5% | 43.9 points | 0.03 |
| **CAPM: 5.57% + beta × (12% − 5.57%)** | +12.0% | **19.8 points** | **0.18** |
| Same 12% for every stock | +12.0% | 19.8 points | n/a |

Realised mean on the validation year: −1.5%. Past returns barely predicted future returns; market sensitivity (beta) did better. So `mu_estimator` defaults to `"capm"`.

**Check on the unseen test year (after the choice).** Exact optimum (brute force) for 9 settings, K = 4..6, risk aversion 0.2 / 0.5 / 0.8, sector cap 2, 12-qubit pre-screen:

| Estimate used by the optimiser | Mean estimate | Mean real test-year return | Mean gap |
|---|---|---|---|
| Raw past average | +74.1% | +4.9% | 69.3 points |
| Bayes-Stein | +27.2% | +2.5% | 24.7 points |
| **CAPM** | +14.2% | **+12.7%** | **4.5 points** |

NIFTY 50 over the same test year: −9.0%. Per stock on the test year, CAPM and Bayes-Stein had the same average error (19.0 points), but CAPM ranked stocks better (0.33 vs 0.15).

**Limits.**
- One validation year and one test year are two samples. CAPM's picks (steel, energy, infrastructure, a lender) may have done well partly by luck in this particular year.
- The 12% long-run market return is a stated assumption, not fitted to data.
- Beta is measured against the equal-weight average of the requested universe, not the NIFTY 50 index.

**What the app shows.** The report headline is the CAPM estimate (what the optimiser uses). The Bayes-Stein estimate and the raw past average stay visible and are labelled: the raw average as "past performance, not a forecast".
