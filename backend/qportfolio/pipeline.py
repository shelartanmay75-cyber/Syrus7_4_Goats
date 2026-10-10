"""Pipeline orchestrator (CONTRACTS.md 1.5, U10): one RunRequest in, one RunResult out."""
from __future__ import annotations

import threading
import uuid
from collections.abc import Callable
from dataclasses import asdict, replace

import numpy as np
import pandas as pd


def bayes_stein(mu: np.ndarray, sigma: np.ndarray, years: float) -> tuple[np.ndarray, float, float]:
    """Jorion (1986) Bayes-Stein shrinkage of expected returns toward the minimum-variance portfolio's mean.

    Plain sample means overstate the stocks that just ran up, and an optimiser then picks exactly those (selection bias).
    Shrinking every mean toward a common target, by an amount the data sets, removes most of that bias. Annualised inputs;
    `years` of daily observations (~252 a year). Estimation window only, so it adds no look-ahead.
    Returns (shrunk mu, shrinkage weight in [0, 1], target).
    """
    n = len(mu)
    inv = np.linalg.pinv(sigma)
    ones = np.ones(n)
    target = float((inv @ ones) @ mu / (ones @ inv @ ones))
    d = mu - target
    weight = min(max((n + 2) / ((n + 2) + years * float(d @ inv @ d)), 0.0), 1.0)
    return (1 - weight) * mu + weight * target, weight, target


# Long-run nominal market return assumed by the CAPM estimate (Indian equities). A stated assumption, not fitted to data.
LONG_RUN_MARKET = 0.12


def capm_returns(sigma: np.ndarray, risk_free: float, market: float = LONG_RUN_MARKET) -> np.ndarray:
    """CAPM expected annual log returns: log(1 + rf + beta x (market - rf)), beta to the equal-weight market of `sigma`.

    Uses only how each stock moves with the market (estimation-window covariance), not its past returns. On a validation
    year inside the estimation data it was the most accurate estimate per stock (see docs/research/17-return-estimates.md).
    """
    w = np.full(len(sigma), 1.0 / len(sigma))
    cov_with_market = sigma @ w
    beta = cov_with_market / float(w @ cov_with_market)
    return np.log1p(risk_free + beta * (market - risk_free))


def market_betas(market) -> dict[str, float]:
    """Beta of each stock to the equal-weight market of `market`, from the estimation-window covariance only."""
    w = np.full(len(market.tickers), 1.0 / len(market.tickers))
    cov_with_market = market.sigma @ w
    return {t: round(float(b), 4) for t, b in zip(market.tickers, cov_with_market / float(w @ cov_with_market))}


def weekly_candles(wealth, start: float) -> list[dict]:
    """Weekly open/high/low/close of a growth path (DatetimeIndex, starts at 1.0), in rupees from `start`."""
    out, prev = [], start
    for _, w in (wealth * start).groupby(pd.Grouper(freq="W-FRI")):
        if w.empty:
            continue
        close = float(w.iloc[-1])
        out.append({"date": w.index[-1].date().isoformat(), "open": round(prev), "high": round(max(prev, float(w.max()))),
                    "low": round(min(prev, float(w.min()))), "close": round(close)})
        prev = close
    return out


def test_candles(market, solvers, capital: float) -> dict[str, list[dict]]:
    """Test-window candles for each feasible portfolio (equal-weight buy-and-hold, as in out_of_sample) and NIFTY 50."""
    out = {r.solver: weekly_candles((1.0 + market.test_returns[r.selection]).cumprod().mean(axis=1), capital)
           for r in solvers if r.feasible and r.selection}
    out["nifty50"] = weekly_candles((1.0 + market.benchmark_test_returns).cumprod(), capital)
    return out


def asset_stats(market, past_mu: np.ndarray, shrunk_mu: np.ndarray) -> list[dict]:
    """Per stock of the requested universe (the same market the betas use), estimation window only, annual log returns:
    the estimate the optimiser used, the raw past average, and the Bayes-Stein shrunk past average; plus volatility."""
    names = {a.ticker: a.name for a in load_universe()}
    vol = np.sqrt(np.diag(market.sigma))
    return [{"ticker": t, "name": names.get(t, t), "sector": sec, "exp_return": round(float(m), 6),
             "past_return": round(float(p), 6), "shrunk_return": round(float(b), 6), "volatility": round(float(v), 6)}
            for t, sec, m, p, b, v in zip(market.tickers, market.sectors, market.mu, past_mu, shrunk_mu, vol)]


def selection_correlation(market, selection: list[str]) -> dict:
    """Correlation (corr = cov / (sd_i * sd_j)) and annualised covariance of the picked stocks, estimation window only."""
    idx = [market.tickers.index(t) for t in selection]
    cov = market.sigma[np.ix_(idx, idx)]
    sd = np.sqrt(np.diag(cov))
    corr = np.clip(cov / np.outer(sd, sd), -1.0, 1.0)
    np.fill_diagonal(corr, 1.0)
    return {"tickers": list(selection), "matrix": np.round(corr, 4).tolist(), "covariance": np.round(cov, 8).tolist()}


class Cancelled(Exception):
    """Defined before the heavier imports: quantum/qaoa.py imports it from this module."""


from .classical import annealing, brute_force, relaxation  # noqa: E402
from .contracts import (  # noqa: E402
    OOS,
    DataInfo,
    LandscapeSummary,
    PortfolioOut,
    QaoaBlock,
    QuboInfo,
    RunRequest,
    RunResult,
    ScreenInfo,
)
from .data import (  # noqa: E402
    RF,
    benchmark_oos,
    build_market,
    linear_costs,
    load_universe,
    out_of_sample,
    prescreen,
    to_shares,
)
from .frontier import frontier  # noqa: E402
from .problem import Problem  # noqa: E402
from .qubo.builder import build_qubo  # noqa: E402
from .verdict import verdict  # noqa: E402

SURVIVORSHIP_NOTE = "Survivorship bias: today's NIFTY 50 list is used for past dates."


def run(request: RunRequest, on_progress: Callable[[float, str, dict | None], None] | None = None,
        cancel: threading.Event | None = None) -> RunResult:
    from .quantum.qaoa import qaoa_solve  # late: qaoa imports Cancelled from this module

    def step(fraction: float, stage: str) -> None:
        """Report a finished stage; the cancel check between stages lives here."""
        if cancel is not None and cancel.is_set():
            raise Cancelled
        if on_progress is not None:
            on_progress(fraction, stage, None)

    step(0.0, "Starting")
    full = build_market(request.tickers)
    past_mu = full.mu
    win = full.windows
    years = (pd.Timestamp(win.est_end) - pd.Timestamp(win.est_start)).days / 365.25
    shrunk_mu, weight, target = bayes_stein(full.mu, full.sigma, years)
    estimator = {"method": request.mu_estimator, "shrinkage": round(weight, 4), "target": round(target, 6),
                 "market_return": LONG_RUN_MARKET, "risk_free": RF}
    # Every later step (pre-screen, QUBO, solvers, frontier, report) uses the chosen estimate of expected return.
    if request.mu_estimator == "capm":
        full = replace(full, mu=capm_returns(full.sigma, RF))
    elif request.mu_estimator == "bayes_stein":
        full = replace(full, mu=shrunk_mu)
    step(0.05, "Market data loaded")

    # prescreen returns applied=False when the universe already fits; target_return adds 3 slack bits it cannot see.
    budget = request.qubit_cap - 3 if request.target_return is not None else request.qubit_cap
    s = prescreen(full, request.k, budget, request.sector_cap)
    screen = ScreenInfo(applied=s.applied, rule=s.rule, kept=s.kept, dropped=s.dropped, qubits=asdict(s.qubits))
    market = full.subset(screen.kept) if screen.applied else full
    step(0.1, "Universe screened")

    # Holdings are share counts; weights use estimation-end prices of the full market (a dropped holding still costs a sale).
    prices = dict(zip(full.tickers, full.est_end_prices))
    weights = {t: n * float(prices[t]) / request.capital for t, n in request.holdings.items() if t in prices}
    notes = [SURVIVORSHIP_NOTE]
    if estimator["method"] == "capm":
        notes.append(f"Expected returns use CAPM: {RF:.2%} risk-free + beta x ({LONG_RUN_MARKET:.0%} assumed long-run market "
                     "- risk-free). Past returns are not used, because they overstate recent winners.")
    elif estimator["method"] == "bayes_stein":
        notes.append(f"Expected returns use Bayes-Stein shrinkage: each stock's past average is pulled "
                     f"{estimator['shrinkage']:.0%} toward a common target, because raw past averages overstate recent winners.")
    if len(weights) < len(request.holdings):
        unpriced = ", ".join(sorted(set(request.holdings) - set(weights)))
        notes.append(f"Holdings without a price in the market were ignored in transaction costs: {unpriced}.")
    lin, const = linear_costs(market.tickers, request.k, weights)
    problem = Problem(tickers=market.tickers, sectors=market.sectors, mu=market.mu, sigma=market.sigma, k=request.k,
                      q=request.risk_aversion, cost_lin=lin, cost_const=const, sector_cap=request.sector_cap,
                      target_return=request.target_return)
    qubo = build_qubo(problem)  # tunes the penalties
    step(0.15, "QUBO built")

    exact, landscape = brute_force(problem)
    solvers = [exact, relaxation(problem), annealing(problem, qubo, seed=request.qaoa.seed)]
    step(0.3, "Classical baselines solved")

    def qaoa_progress(fraction: float, stage: str, point: dict | None) -> None:
        on_progress(0.3 + 0.6 * fraction, stage, point)

    qaoa_result, block = qaoa_solve(problem, qubo, request.qaoa, qaoa_progress if on_progress else None, cancel,
                                    landscape)
    solvers.append(qaoa_result)
    qaoa = QaoaBlock.model_validate(block)
    step(0.9, "QAOA sampled")

    # Allocation and out-of-sample score for every solver that picked something (feasible or not).
    for i, r in enumerate(solvers):
        if r.selection is not None:
            portfolio = PortfolioOut(**asdict(to_shares(market.tickers, market.est_end_prices, request.capital,
                                                        r.selection)))
            oos = OOS(**asdict(out_of_sample(market, r.selection)))
            solvers[i] = r.model_copy(update={"portfolio": portfolio, "oos": oos})

    # Recommend the feasible solver with the lowest objective; ties go to the earlier (exact) solver.
    best = min((r for r in solvers if r.feasible), key=lambda r: r.objective)
    recommended = best.solver
    w = full.windows
    result = RunResult(
        run_id=uuid.uuid4().hex[:6],
        request=request,
        data=DataInfo(source=full.source, as_of=full.as_of, est_window=(w.est_start, w.est_end),
                      test_window=(w.test_start, w.test_end), excluded=full.excluded, filled=full.filled,
                      notes=notes),
        screen=screen,
        qubo=QuboInfo(n_vars=qubo.n_assets + qubo.n_slack, n_assets=qubo.n_assets, n_slack=qubo.n_slack,
                      terms=["objective", *qubo.penalties, "transaction_cost"], penalties=qubo.penalties),
        landscape=LandscapeSummary(n_feasible=len(landscape.selections), f_min=landscape.f_min,
                                   f_max=landscape.f_max, f_mean=landscape.f_mean),
        solvers=solvers,
        qaoa=qaoa,
        frontier=frontier(market, landscape),
        benchmarks={"nifty50": OOS(**asdict(benchmark_oos(market)))},
        verdict=verdict(solvers, landscape, qaoa.metrics),
        recommended=recommended,
        betas=market_betas(full),
        candles=test_candles(market, solvers, request.capital),
        assets=asset_stats(full, past_mu, shrunk_mu),
        estimator=estimator,
        correlation=selection_correlation(market, best.selection),
    )
    step(1.0, "Done")
    return result
