"""Pydantic models mirroring TEAMS/CONTRACTS.md section 2 one-to-one, plus Landscape (section 1.4).

Field names are the JSON keys. Change this file only together with CONTRACTS.md and contracts/api-examples/.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, Field

SolverId = Literal["brute_force", "relaxation", "annealing", "qaoa_standard", "qaoa_xy"]


# --- 2.1 Universe -----------------------------------------------------------
class AssetInfo(BaseModel):
    ticker: str
    symbol: str
    name: str
    sector: str
    excluded_reason: str | None = None


class Universe(BaseModel):
    as_of: str
    source: Literal["cache", "snapshot", "live"]
    assets: list[AssetInfo]


# --- 2.2 RunRequest ---------------------------------------------------------
class QaoaSettings(BaseModel):
    variant: Literal["standard", "xy"] = "standard"
    reps: int = Field(2, ge=1, le=5)
    optimizer: Literal["COBYLA", "SPSA", "NELDER_MEAD"] = "COBYLA"
    init: Literal["random", "ramp", "interp"] = "ramp"
    shots: int = Field(4096, ge=256, le=20000)
    maxiter: int = 150
    noise: bool = False
    seed: int = 7


class RunRequest(BaseModel):
    tickers: list[str] | None = None  # None = all non-excluded NIFTY 50 stocks
    k: int = Field(5, ge=2, le=15)
    risk_aversion: float = Field(0.5, ge=0, le=1)
    sector_cap: int | None = 2
    target_return: float | None = None
    capital: float = 1_000_000
    holdings: dict[str, int] = {}  # ticker -> share count
    qubit_cap: int = 12  # 16 allowed (FakeGuadalupeV2 size) but ~3 min per live run; 12 keeps it under a minute
    qaoa: QaoaSettings = QaoaSettings()


# --- 2.3 Sample, 2.4 ScreenInfo --------------------------------------------
class Sample(BaseModel):
    bitstring: str  # asset bits only, x0 first
    prob: float
    objective: float | None
    feasible: bool
    optimal: bool


class QubitCount(BaseModel):
    assets: int
    slack: int
    total: int


class ScreenInfo(BaseModel):
    applied: bool
    rule: str
    kept: list[str]
    dropped: list[str]
    qubits: QubitCount


# --- 2.6 RunResult building blocks -----------------------------------------
class DataInfo(BaseModel):
    source: Literal["cache", "snapshot", "live"]
    as_of: str
    est_window: tuple[str, str]
    test_window: tuple[str, str]
    excluded: dict[str, str]
    filled: dict[str, int]
    notes: list[str]


class QuboInfo(BaseModel):
    n_vars: int
    n_assets: int
    n_slack: int
    terms: list[str]
    penalties: dict[str, float]


class LandscapeSummary(BaseModel):
    n_feasible: int
    f_min: float
    f_max: float
    f_mean: float


@dataclass
class Landscape:
    """Feasible selections only (section 1.4). Produced by brute_force, consumed by QAOA, metrics and studies."""
    selections: np.ndarray  # (F, n) 0/1
    objectives: np.ndarray  # (F,)
    returns: np.ndarray  # (F,)
    variances: np.ndarray  # (F,)
    f_min: float
    f_max: float
    f_mean: float
    optimum: np.ndarray  # (n,) 0/1


class PortfolioRow(BaseModel):
    ticker: str
    name: str
    sector: str
    weight: float
    shares: int
    price: float
    value: float


class PortfolioOut(BaseModel):
    rows: list[PortfolioRow]
    invested: float
    cash_left: float


class OOS(BaseModel):
    ann_return: float
    ann_vol: float
    sharpe: float
    max_drawdown: float


class SolverResult(BaseModel):
    """A QAOA solver with no feasible sample has selection/bitstring/numbers None but still has feasible_rate."""
    solver: SolverId
    label: str
    kind: Literal["classical", "quantum"]
    selection: list[str] | None
    bitstring: str | None
    objective: float | None
    exp_return: float | None
    volatility: float | None  # sqrt(variance)
    variance: float | None
    txn_cost: float | None
    feasible: bool
    violations: list[str] = []
    runtime_s: float
    approx_ratio: float | None = None
    p_opt: float | None = None
    feasible_rate: float | None = None
    portfolio: PortfolioOut | None = None
    oos: OOS | None = None
    details: dict[str, Any] = {}


class ConvergencePoint(BaseModel):
    iter: int
    energy: float


class QaoaMetrics(BaseModel):
    approx_ratio: float
    p_opt: float
    p_random: float
    feasible_rate: float
    # Top 20 by probability. Not serialised: the JSON carries them as qaoa.samples.
    top_samples: list[Sample] = Field(default_factory=list, exclude=True)


class CircuitInfo(BaseModel):
    qubits: int
    reps: int
    depth: int
    two_qubit_gates: int
    optimizer: str
    init: str
    seed: int


class TranspiledInfo(BaseModel):
    depth: int
    two_qubit_gates: int


class NoiseInfo(BaseModel):
    backend: str
    ideal: QaoaMetrics
    noisy: QaoaMetrics
    transpiled: TranspiledInfo


class QaoaBlock(BaseModel):
    solver: Literal["qaoa_standard", "qaoa_xy"]
    convergence: list[ConvergencePoint]
    samples: list[Sample]
    metrics: QaoaMetrics
    circuit: CircuitInfo
    noise: NoiseInfo | None = None


class Frontier(BaseModel):
    continuous: list[dict[str, float]]  # {"risk", "ret"}
    discrete: list[dict[str, Any]]  # {"risk", "ret", "selection": [tickers]}; plain dicts, as classical/ builds them


class Verdict(BaseModel):
    level: Literal["matched", "near", "worse", "no-feasible"]
    headline: str
    details: list[str]


class RunResult(BaseModel):
    run_id: str
    request: RunRequest
    data: DataInfo
    screen: ScreenInfo
    qubo: QuboInfo
    landscape: LandscapeSummary
    solvers: list[SolverResult]
    qaoa: QaoaBlock
    frontier: Frontier
    benchmarks: dict[str, OOS]
    verdict: Verdict
    recommended: SolverId
    betas: dict[str, float] | None = None  # stress tests: beta to the equal-weight market of the requested universe, estimation window only
    candles: dict[str, list[dict]] | None = None  # weekly OHLC of each portfolio's rupee value over the test window, plus nifty50
    # Portfolio report, estimation window only. assets: every stock of the requested universe (a superset of the solved one), as
    # {ticker, name, sector, exp_return, volatility}. correlation: {tickers, matrix, covariance} for the recommended portfolio.
    assets: list[dict] | None = None
    correlation: dict[str, Any] | None = None


# --- 2.5 JobStatus ----------------------------------------------------------
class JobStatus(BaseModel):
    job_id: str
    state: Literal["queued", "running", "done", "error", "cancelled"]
    progress: float
    stage: str
    convergence: list[ConvergencePoint] = []
    elapsed_s: float
    result: RunResult | None = None  # set when done
    error: str | None = None  # plain-language, set when error


# --- 2.7 Study --------------------------------------------------------------
class StudyPoint(BaseModel):
    x: float
    y: float
    yerr: float | None = None


class StudySeries(BaseModel):
    label: str
    points: list[StudyPoint]


class StudySummary(BaseModel):
    id: str
    title: str
    summary: str


class Study(BaseModel):
    id: str
    title: str
    description: str
    x_label: str
    y_label: str
    series: list[StudySeries]
    instance: dict[str, Any]
    notes: list[str]
    generated_at: str
    wall_time_s: float
