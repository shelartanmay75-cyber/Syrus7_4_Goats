"""U10: the pipeline orchestrator (run -> RunResult), progress reporting, cancel."""
from __future__ import annotations

import math
import threading

import numpy as np
import pytest

from qportfolio.contracts import QaoaSettings, RunRequest, RunResult
from qportfolio.pipeline import Cancelled, run

FAST = QaoaSettings(reps=1, maxiter=30, shots=1024)
TICKERS = ["TCS.NS", "HDFCBANK.NS", "RELIANCE.NS", "ITC.NS", "SUNPHARMA.NS", "MARUTI.NS"]


def small_request(**kw) -> RunRequest:
    return RunRequest(tickers=TICKERS, k=3, qaoa=FAST, **kw)


@pytest.fixture(scope="module")
def small_run() -> tuple[RunResult, list[float]]:
    fractions: list[float] = []
    result = run(small_request(), on_progress=lambda f, stage, point: fractions.append(f))
    return result, fractions


def test_small_request_gives_a_complete_valid_result(small_run):
    result, _ = small_run
    assert RunResult.model_validate_json(result.model_dump_json()) == result
    assert [s.solver for s in result.solvers] == ["brute_force", "relaxation", "annealing", "qaoa_standard"]
    for s in result.solvers:
        if s.feasible:
            assert s.portfolio is not None and s.oos is not None
            assert s.volatility == pytest.approx(math.sqrt(s.variance))
    best = min((s for s in result.solvers if s.feasible), key=lambda s: s.objective)
    assert result.recommended == best.solver
    assert result.landscape.n_feasible == 20  # C(6, 3), sector cap 2 never binds on 6 different sectors
    assert "nifty50" in result.benchmarks and result.data.notes


def test_report_assets_and_correlation(small_run):
    result, _ = small_run
    assert [a["ticker"] for a in result.assets] == TICKERS  # all 6 fit the cap, so none is screened out
    assert all(a["name"] and a["sector"] and a["volatility"] > 0 for a in result.assets)
    best = next(s for s in result.solvers if s.solver == result.recommended)
    corr = result.correlation
    assert corr["tickers"] == best.selection
    m = np.array(corr["matrix"])
    assert m.shape == (3, 3) and np.allclose(np.diag(m), 1.0) and np.allclose(m, m.T) and np.all(np.abs(m) <= 1.0)
    cov = np.array(corr["covariance"])  # annualised Sigma of the picked stocks: symmetric, and sqrt(w' S w) is the solver's volatility
    assert cov.shape == (3, 3) and np.allclose(cov, cov.T) and np.all(np.diag(cov) > 0)
    assert math.sqrt(cov.sum() / 9) == pytest.approx(best.volatility, abs=1e-5)
    sd = np.sqrt(np.diag(cov))
    assert np.allclose(cov / np.outer(sd, sd), m, atol=1e-4)
    # the report's portfolio return is the mean of the picked stocks' mu, which must match the solver's exp_return
    mu = {a["ticker"]: a["exp_return"] for a in result.assets}
    assert np.mean([mu[t] for t in best.selection]) == pytest.approx(best.exp_return, abs=1e-5)


def test_progress_never_decreases_and_ends_at_one(small_run):
    _, fractions = small_run
    assert fractions == sorted(fractions)
    assert fractions[-1] == 1.0


def test_all_tickers_are_screened_to_fit_the_cap():  # AE1
    result = run(RunRequest(k=5, qaoa=FAST))
    assert result.screen.applied
    assert result.screen.qubits.total <= 16
    assert {a["ticker"] for a in result.assets} > set(result.screen.kept)  # the report's assets cover the whole requested universe
    for s in result.solvers:
        if s.selection is not None:
            assert set(s.selection) <= set(result.screen.kept)


def test_cancel_during_qaoa_raises():
    cancel = threading.Event()

    def on_progress(fraction, stage, point):
        if point is not None:  # a QAOA iteration
            cancel.set()

    with pytest.raises(Cancelled):
        run(small_request(), on_progress=on_progress, cancel=cancel)


def test_cancel_before_start_raises():
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(Cancelled):
        run(small_request(), cancel=cancel)
