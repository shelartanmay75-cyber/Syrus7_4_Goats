"""Unit and regression tests for metrics, frontier, and verdict (Team 3, U9)."""
from __future__ import annotations

import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
import pytest

from qportfolio.classical.brute_force import brute_force
from qportfolio.frontier import _solve_continuous_weights, frontier
from qportfolio.metrics import Sample, qaoa_metrics
from qportfolio.verdict import BANNED_PHRASES, verdict


@dataclass
class LandscapeStub:
    selections: np.ndarray
    objectives: np.ndarray
    returns: np.ndarray
    variances: np.ndarray
    f_min: float
    f_max: float
    f_mean: float
    optimum: np.ndarray


@dataclass
class MarketSubsetStub:
    tickers: list[str]
    sectors: list[str]
    mu: np.ndarray
    sigma: np.ndarray


@dataclass
class SolverResultStub:
    solver: str
    label: str
    kind: str
    selection: list[str] | None
    bitstring: str | None
    objective: float | None
    exp_return: float | None
    volatility: float | None
    variance: float | None
    txn_cost: float | None
    feasible: bool
    violations: list[str]
    runtime_s: float
    approx_ratio: float | None = None
    details: dict[str, Any] = field(default_factory=dict)


def test_all_samples_on_optimum():
    """When all samples are on the optimum, approx_ratio = 1.0 and p_opt = 1.0."""
    landscape = LandscapeStub(
        selections=np.array([[1, 0], [0, 1]]),
        objectives=np.array([-0.10, -0.02]),
        returns=np.array([0.15, 0.10]),
        variances=np.array([0.02, 0.03]),
        f_min=-0.10,
        f_max=-0.02,
        f_mean=-0.06,
        optimum=np.array([1, 0]),
    )

    samples = [
        Sample(bitstring="10", prob=0.6, objective=-0.10, feasible=True, optimal=True),
        Sample(bitstring="10", prob=0.4, objective=-0.10, feasible=True, optimal=True),
    ]

    metrics = qaoa_metrics(samples, landscape)

    assert pytest.approx(metrics.approx_ratio, abs=1e-9) == 1.0
    assert pytest.approx(metrics.p_opt, abs=1e-9) == 1.0
    assert pytest.approx(metrics.feasible_rate, abs=1e-9) == 1.0
    assert pytest.approx(metrics.p_random, abs=1e-9) == 0.5  # 1 / 2 feasible states


def test_all_samples_infeasible():
    """When all samples are infeasible, approx_ratio = 0.0, feasible_rate = 0.0, and verdict is no-feasible."""
    landscape = LandscapeStub(
        selections=np.array([[1, 0], [0, 1]]),
        objectives=np.array([-0.05, 0.02]),
        returns=np.array([0.12, 0.08]),
        variances=np.array([0.01, 0.02]),
        f_min=-0.05,
        f_max=0.02,
        f_mean=-0.015,
        optimum=np.array([1, 0]),
    )

    samples = [
        Sample(bitstring="00", prob=0.7, objective=None, feasible=False, optimal=False),
        Sample(bitstring="11", prob=0.3, objective=None, feasible=False, optimal=False),
    ]

    metrics = qaoa_metrics(samples, landscape)

    assert pytest.approx(metrics.approx_ratio, abs=1e-9) == 0.0
    assert pytest.approx(metrics.feasible_rate, abs=1e-9) == 0.0
    assert pytest.approx(metrics.p_opt, abs=1e-9) == 0.0

    qaoa_sol = SolverResultStub(
        solver="qaoa_standard",
        label="QAOA (standard)",
        kind="quantum",
        selection=None,
        bitstring=None,
        objective=None,
        exp_return=None,
        volatility=None,
        variance=None,
        txn_cost=None,
        feasible=False,
        violations=["no feasible sample"],
        runtime_s=1.2,
    )
    solvers = [qaoa_sol]

    v = verdict(solvers, landscape, metrics)
    assert v.level == "no-feasible"
    assert "no feasible" in v.headline.lower()


def test_approx_ratio_hand_computed_landscape():
    """Approximation ratio uses feasible-only f_min and f_max and matches hand computation."""
    # Landscape: f_min = -0.20, f_max = 0.10 -> range = 0.30
    landscape = LandscapeStub(
        selections=np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]]),
        objectives=np.array([-0.20, -0.05, 0.10]),
        returns=np.array([0.20, 0.15, 0.10]),
        variances=np.array([0.03, 0.02, 0.01]),
        f_min=-0.20,
        f_max=0.10,
        f_mean=-0.05,
        optimum=np.array([1, 0, 0]),
    )

    # Sample 1: F = -0.20 -> r = (0.10 - (-0.20)) / 0.30 = 1.0, prob = 0.5
    # Sample 2: F = -0.05 -> r = (0.10 - (-0.05)) / 0.30 = 0.15 / 0.30 = 0.5, prob = 0.3
    # Sample 3: Infeasible -> r = 0.0, prob = 0.2
    # Expected approx_ratio = 0.5 * 1.0 + 0.3 * 0.5 + 0.2 * 0.0 = 0.50 + 0.15 = 0.65
    samples = [
        Sample(bitstring="100", prob=0.5, objective=-0.20, feasible=True, optimal=True),
        Sample(bitstring="010", prob=0.3, objective=-0.05, feasible=True, optimal=False),
        Sample(bitstring="111", prob=0.2, objective=0.35, feasible=False, optimal=False),
    ]

    metrics = qaoa_metrics(samples, landscape)

    assert pytest.approx(metrics.approx_ratio, abs=1e-9) == 0.65
    assert pytest.approx(metrics.p_opt, abs=1e-9) == 0.5
    assert pytest.approx(metrics.feasible_rate, abs=1e-9) == 0.8
    assert pytest.approx(metrics.p_random, abs=1e-9) == 1.0 / 3.0
    assert len(metrics.top_samples) == 3


def test_verdict_banned_phrases_across_all_levels():
    """Honesty gate: Verdict text for all levels and qaoa=None must contain zero banned phrases."""
    landscape = LandscapeStub(
        selections=np.array([[1, 0], [0, 1]]),
        objectives=np.array([-0.10, 0.05]),
        returns=np.array([0.15, 0.10]),
        variances=np.array([0.02, 0.03]),
        f_min=-0.10,
        f_max=0.05,
        f_mean=-0.025,
        optimum=np.array([1, 0]),
    )
    bf_solver = SolverResultStub(
        solver="brute_force",
        label="Brute force (exact)",
        kind="classical",
        selection=["A"],
        bitstring="10",
        objective=-0.10,
        exp_return=0.15,
        volatility=math.sqrt(0.02),
        variance=0.02,
        txn_cost=0.001,
        feasible=True,
        violations=[],
        runtime_s=0.05,
    )

    # 1. Level 'matched'
    qaoa_matched = SolverResultStub(
        solver="qaoa_standard",
        label="QAOA",
        kind="quantum",
        selection=["A"],
        bitstring="10",
        objective=-0.10,
        exp_return=0.15,
        volatility=math.sqrt(0.02),
        variance=0.02,
        txn_cost=0.001,
        feasible=True,
        violations=[],
        runtime_s=1.2,
    )
    metrics_matched = qaoa_metrics(
        [Sample(bitstring="10", prob=1.0, objective=-0.10, feasible=True, optimal=True)],
        landscape,
    )
    v_matched = verdict([bf_solver, qaoa_matched], landscape, metrics_matched)
    assert v_matched.level == "matched"

    # 2. Level 'near' (gap <= 1%)
    # -0.0995 vs -0.10 -> gap = 0.0005 / 0.10 = 0.005 (0.5%)
    qaoa_near = SolverResultStub(
        solver="qaoa_standard",
        label="QAOA",
        kind="quantum",
        selection=["B"],
        bitstring="01",
        objective=-0.0995,
        exp_return=0.149,
        volatility=0.14,
        variance=0.02,
        txn_cost=0.001,
        feasible=True,
        violations=[],
        runtime_s=1.5,
    )
    v_near = verdict([bf_solver, qaoa_near], landscape, metrics_matched)
    assert v_near.level == "near"

    # 3. Level 'worse' (gap > 1%)
    # -0.08 vs -0.10 -> gap = 0.02 / 0.10 = 0.20 (20%)
    qaoa_worse = SolverResultStub(
        solver="qaoa_standard",
        label="QAOA",
        kind="quantum",
        selection=["B"],
        bitstring="01",
        objective=-0.08,
        exp_return=0.13,
        volatility=0.14,
        variance=0.02,
        txn_cost=0.001,
        feasible=True,
        violations=[],
        runtime_s=1.5,
    )
    v_worse = verdict([bf_solver, qaoa_worse], landscape, metrics_matched)
    assert v_worse.level == "worse"

    # 4. Level 'no-feasible'
    qaoa_infeas = SolverResultStub(
        solver="qaoa_standard",
        label="QAOA",
        kind="quantum",
        selection=None,
        bitstring=None,
        objective=None,
        exp_return=None,
        volatility=None,
        variance=None,
        txn_cost=None,
        feasible=False,
        violations=["no feasible bitstrings"],
        runtime_s=1.1,
    )
    v_no_feas = verdict([bf_solver, qaoa_infeas], landscape, None)
    assert v_no_feas.level == "no-feasible"

    # 5. qaoa = None handling
    v_none = verdict([bf_solver], landscape, None)
    assert v_none.level == "no-feasible"

    # Verify every single verdict text against BANNED_PHRASES
    all_verdicts = [v_matched, v_near, v_worse, v_no_feas, v_none]
    for vd in all_verdicts:
        text_corpus = f"{vd.headline} " + " ".join(vd.details)
        lower_corpus = text_corpus.lower()
        for banned in BANNED_PHRASES:
            assert banned not in lower_corpus, f"Found banned phrase '{banned}' in verdict: {text_corpus}"


def test_continuous_frontier_weights_sum_to_one():
    """Every continuous frontier point has weights summing to 1 and each >= 0."""
    tickers = ["T1", "T2", "T3", "T4"]
    mu = np.array([0.20, 0.16, 0.12, 0.08])
    sigma = np.array([
        [0.04, 0.01, 0.00, 0.00],
        [0.01, 0.05, 0.00, 0.00],
        [0.00, 0.00, 0.03, 0.01],
        [0.00, 0.00, 0.01, 0.02],
    ])
    market = MarketSubsetStub(tickers=tickers, sectors=["S1", "S1", "S2", "S2"], mu=mu, sigma=sigma)

    weights_list = _solve_continuous_weights(market, n_targets=25)
    assert len(weights_list) > 0

    for w, risk, ret in weights_list:
        assert len(w) == 4
        assert pytest.approx(float(np.sum(w)), abs=1e-5) == 1.0
        assert np.all(w >= -1e-6), f"Weights had negative values: {w}"
        assert risk >= 0.0


def test_discrete_pareto_frontier_non_dominated():
    """Every point on the discrete Pareto frontier is strictly non-dominated."""
    tickers = ["A", "B", "C", "D"]
    market = MarketSubsetStub(
        tickers=tickers,
        sectors=["S"] * 4,
        mu=np.array([0.20, 0.15, 0.10, 0.05]),
        sigma=0.04 * np.eye(4),
    )

    # 4 feasible selections with distinct risk and returns
    # p1: risk=0.10, ret=0.20 (best)
    # p2: risk=0.12, ret=0.18 (dominated by p1 since risk is higher and ret is lower)
    # p3: risk=0.08, ret=0.12 (Pareto optimal: lower risk than p1, lower return)
    # p4: risk=0.15, ret=0.10 (dominated by both p1 and p3)
    landscape = LandscapeStub(
        selections=np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]),
        objectives=np.array([-0.1, -0.05, 0.0, 0.05]),
        returns=np.array([0.20, 0.18, 0.12, 0.10]),
        variances=np.array([0.10**2, 0.12**2, 0.08**2, 0.15**2]),
        f_min=-0.1,
        f_max=0.05,
        f_mean=-0.025,
        optimum=np.array([1, 0, 0, 0]),
    )

    fr = frontier(market, landscape)

    assert len(fr.continuous) == 25
    # Only p1 and p3 should be on the discrete Pareto frontier
    assert len(fr.discrete) == 2
    # Verify non-domination between all returned discrete points
    for i, p_a in enumerate(fr.discrete):
        for j, p_b in enumerate(fr.discrete):
            if i != j:
                # p_b cannot dominate p_a
                b_dominates_a = (
                    p_b["risk"] <= p_a["risk"]
                    and p_b["ret"] >= p_a["ret"]
                    and (p_b["risk"] < p_a["risk"] or p_b["ret"] > p_a["ret"])
                )
                assert not b_dominates_a, f"Point {p_b} dominates {p_a}"


def test_matched_verdict_flags_sampling_worse_than_random():
    """A best sample that matches the optimum must not read as a clean win when P(opt) is below random."""
    from types import SimpleNamespace as NS
    from qportfolio.verdict import verdict
    bf = NS(solver="brute_force", kind="classical", feasible=True, objective=-1.0, runtime_s=0.01)
    q = NS(solver="qaoa_xy", kind="quantum", feasible=True, objective=-1.0, runtime_s=5.0)
    land = NS(f_min=-1.0, optimum=[1, 0, 1, 0])
    metrics = NS(p_opt=0.001, p_random=0.0043, approx_ratio=0.52, feasible_rate=0.95)
    v = verdict([bf, q], land, metrics)
    assert v.level == "matched"
    assert "less often than random guessing" in v.headline
    assert "less often than a random guess" in v.details[0]
