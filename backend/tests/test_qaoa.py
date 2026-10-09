"""U6 integration: qaoa_solve (optimise, sample, decode, judge with Problem.evaluate, metrics)."""
from __future__ import annotations

import json
import threading
from itertools import product

import numpy as np
import pytest

from qportfolio.contracts import Landscape, QaoaSettings
from qportfolio.pipeline import Cancelled
from qportfolio.problem import Problem
from qportfolio.quantum.qaoa import _decode, qaoa_solve
from qportfolio.qubo.builder import build_qubo

METRIC_KEYS = {"approx_ratio", "p_opt", "p_random", "feasible_rate"}


def make_problem(q=0.5, mu=None) -> Problem:
    """6 assets, K=3, no sector or target constraint."""
    rng = np.random.default_rng(0)
    a = rng.normal(size=(6, 6)) * 0.15
    return Problem(
        tickers=[f"T{i}.NS" for i in range(6)],
        sectors=[f"S{i}" for i in range(6)],
        mu=rng.uniform(0.03, 0.25, 6) if mu is None else np.asarray(mu, float),
        sigma=a @ a.T + 0.01 * np.eye(6),
        k=3,
        q=q,
        cost_lin=np.full(6, 0.002),
        cost_const=0.0,
        sector_cap=None,
        target_return=None,
    )


def landscape_of(problem: Problem) -> Landscape:
    """Feasible landscape by enumeration through Problem.evaluate."""
    rows = [(np.array(x), problem.evaluate(np.array(x))) for x in product([0, 1], repeat=len(problem.tickers))]
    rows = [(x, ev) for x, ev in rows if ev.feasible]
    obj = np.array([ev.objective for _, ev in rows])
    return Landscape(
        selections=np.array([x for x, _ in rows]),
        objectives=obj,
        returns=np.array([ev.exp_return for _, ev in rows]),
        variances=np.array([ev.variance for _, ev in rows]),
        f_min=float(obj.min()),
        f_max=float(obj.max()),
        f_mean=float(obj.mean()),
        optimum=rows[int(obj.argmin())][0],
    )


def test_decode_reverses_little_endian_and_drops_slack():
    assert _decode({"000011": 10}, 6) == {"110000": 1.0}  # qubits 0 and 1 set -> assets 0 and 1
    assert _decode({"010011": 3, "000011": 1}, 4) == {"1100": 1.0}  # slack bits dropped, then merged


def test_no_feasible_sample_is_reported_not_repaired():
    problem = make_problem(q=0.0, mu=np.full(6, 0.2))  # return-only objective wants all six assets
    qubo = build_qubo(problem, penalties={"cardinality": 1e-6})
    res, block = qaoa_solve(problem, qubo, QaoaSettings(shots=256, seed=7))
    assert res.selection is None and res.bitstring is None and res.objective is None
    assert res.feasible is False
    assert res.feasible_rate is not None and res.feasible_rate < 1
    assert block["metrics"]["feasible_rate"] == res.feasible_rate


def test_p2_cobyla_standard_samples_the_brute_force_optimum():
    problem = make_problem()
    landscape = landscape_of(problem)
    opt = "".join(str(int(b)) for b in landscape.optimum)
    settings = QaoaSettings(reps=2, optimizer="COBYLA", init="ramp", shots=4096, maxiter=150, seed=7)
    res, block = qaoa_solve(problem, build_qubo(problem), settings, landscape=landscape)

    assert any(s["bitstring"] == opt and s["optimal"] for s in block["samples"])
    assert res.bitstring == opt and res.objective == pytest.approx(landscape.f_min)
    assert res.p_opt == block["metrics"]["p_opt"] > 0
    assert block["metrics"]["p_random"] == pytest.approx(1 / 20)
    assert res.details["most_probable"] in {s["bitstring"] for s in block["samples"]}
    assert block["solver"] == "qaoa_standard" and block["noise"] is None
    assert block["circuit"]["reps"] == 2 and block["circuit"]["optimizer"] == "COBYLA"
    assert block["circuit"]["qubits"] == 6 and block["circuit"]["two_qubit_gates"] > 0
    assert len(block["samples"]) <= 22  # top 20 + optimum + chosen answer and len(block["convergence"]) <= 150
    json.dumps(block)  # JSON-ready


def test_p2_cobyla_xy_stays_feasible_and_samples_the_optimum():
    # The standard mixer scores approx_ratio ~0.34 here (feasible_rate ~0.66); the XY mixer keeps every sample feasible.
    problem = make_problem()
    landscape = landscape_of(problem)
    opt = "".join(str(int(b)) for b in landscape.optimum)
    settings = QaoaSettings(variant="xy", reps=2, optimizer="COBYLA", init="ramp", shots=4096, maxiter=150, seed=7)
    res, block = qaoa_solve(problem, build_qubo(problem), settings, landscape=landscape)

    assert block["solver"] == res.solver == "qaoa_xy"
    assert res.feasible_rate == pytest.approx(1.0)
    assert any(s["bitstring"] == opt and s["optimal"] for s in block["samples"])
    assert block["metrics"]["approx_ratio"] > 0.5


def test_interp_warm_start_shares_the_budget_across_depths():
    problem = make_problem()
    settings = QaoaSettings(reps=2, init="interp", maxiter=40, shots=256, seed=7)
    _, block = qaoa_solve(problem, build_qubo(problem), settings)
    iters = [c["iter"] for c in block["convergence"]]
    assert iters == list(range(1, len(iters) + 1)) and len(iters) <= 40
    assert block["circuit"]["reps"] == 2 and block["circuit"]["init"] == "interp"


def test_cancel_set_up_front_stops_within_one_evaluation():
    problem = make_problem()
    cancel = threading.Event()
    cancel.set()
    calls = []
    with pytest.raises(Cancelled):
        qaoa_solve(problem, build_qubo(problem), QaoaSettings(), on_progress=lambda *a: calls.append(a), cancel=cancel)
    assert len(calls) <= 1


def _flat_counts(skip: set[str] = frozenset(), rare: set[str] = frozenset()) -> dict[str, int]:
    """Every 6-asset bitstring drawn 10 times (little-endian keys), except `skip` (never drawn) and `rare` (once)."""
    bits = ("".join(b) for b in product("01", repeat=6))
    return {b[::-1]: (1 if b in rare else 10) for b in bits if b not in skip}


def test_optimum_outside_top_20_is_appended_with_its_real_probability(monkeypatch):
    problem = make_problem()
    landscape = landscape_of(problem)
    opt = "".join(str(int(b)) for b in landscape.optimum)
    counts = _flat_counts(rare={opt})  # 64 distinct bitstrings, the optimum the least likely
    monkeypatch.setattr("qportfolio.quantum.qaoa.sample_ideal", lambda *a: counts)
    settings = QaoaSettings(reps=1, maxiter=10, shots=256, seed=7)
    res, block = qaoa_solve(problem, build_qubo(problem), settings, landscape=landscape)

    assert len(block["samples"]) == 21
    last = block["samples"][-1]
    assert last["bitstring"] == opt and last["optimal"] is True and last["feasible"] is True
    assert last["prob"] == pytest.approx(1 / sum(counts.values()))
    assert res.bitstring == opt  # QAOA's own answer is the optimum, already shown once


def test_best_feasible_outside_top_20_is_appended_and_the_unsampled_optimum_is_not_invented(monkeypatch):
    problem = make_problem()
    landscape = landscape_of(problem)
    order = np.argsort(landscape.objectives)
    opt = "".join(str(int(b)) for b in landscape.optimum)
    second = "".join(str(int(b)) for b in landscape.selections[order[1]])
    counts = _flat_counts(skip={opt}, rare={second})  # optimum never drawn, runner-up the least likely
    monkeypatch.setattr("qportfolio.quantum.qaoa.sample_ideal", lambda *a: counts)
    settings = QaoaSettings(reps=1, maxiter=10, shots=256, seed=7)
    res, block = qaoa_solve(problem, build_qubo(problem), settings, landscape=landscape)

    assert res.bitstring == second
    last = block["samples"][-1]
    assert len(block["samples"]) == 21 and last["bitstring"] == second and last["optimal"] is False
    assert not any(s["bitstring"] == opt or s["optimal"] for s in block["samples"])


def test_noisy_sampling_is_capped_at_1024_shots(monkeypatch):
    problem = make_problem()
    seen = []

    def fake_noisy(circuit, values, shots, seed):
        seen.append(shots)
        return _flat_counts()

    monkeypatch.setattr("qportfolio.quantum.qaoa.sample_noisy", fake_noisy)
    settings = QaoaSettings(reps=1, maxiter=10, shots=4096, noise=True, seed=7)
    _, block = qaoa_solve(problem, build_qubo(problem), settings, landscape=landscape_of(problem))
    assert seen == [1024] and block["noise"] is not None

    seen.clear()
    qaoa_solve(problem, build_qubo(problem), QaoaSettings(reps=1, maxiter=10, shots=512, noise=True, seed=7))
    assert seen == [512]  # below the cap it is left alone


def test_noise_block_has_ideal_and_noisy_metrics():
    problem = make_problem()
    settings = QaoaSettings(reps=1, maxiter=20, shots=256, noise=True, seed=7)
    _, block = qaoa_solve(problem, build_qubo(problem), settings, landscape=landscape_of(problem))
    noise = block["noise"]
    assert noise["backend"] == "FakeGuadalupeV2"
    assert set(noise["ideal"]) == set(noise["noisy"]) == METRIC_KEYS
    assert noise["ideal"] == block["metrics"]
    assert noise["transpiled"]["depth"] > 0 and noise["transpiled"]["two_qubit_gates"] > 0
    assert noise["shots"] == 256
    pick = noise["best_noisy"]
    if pick is not None:  # the noisy pick is a real sampled portfolio with exactly K stocks and its own estimates
        assert len(pick["selection"]) == problem.k and pick["volatility"] >= 0
        assert isinstance(pick["same_as_ideal"], bool)
