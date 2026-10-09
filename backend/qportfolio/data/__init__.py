"""Data layer for Quantum Portfolio Optimiser.

Exports:
- load_universe: Loads 50 NIFTY 50 assets.
- load_prices: Loads adjusted close prices from cache/snapshot/live.
- build_market: Builds Market structure with mu, sigma, test returns, and provenance.
- prescreen: Pre-screens assets by Sharpe ratio to fit quantum qubit budgets.
- linear_costs: Linear transaction cost formulation tc(x) = lin · x + const.
- to_shares: Allocates discrete whole-share portfolios from selections.
- out_of_sample, benchmark_oos: Evaluates held-out out-of-sample portfolio performance.
- Asset, PriceData, Windows, Market, ScreenInfo, QubitsInfo, PortfolioOut, PortfolioRow, OOS: Dataclasses.
- RF, C_BUY, C_SELL, DEFAULT_WINDOWS: Standard project constants.
"""
from __future__ import annotations

from qportfolio.data.allocate import PortfolioOut, PortfolioRow, to_shares
from qportfolio.data.costs import linear_costs
from qportfolio.data.evaluate import OOS, benchmark_oos, out_of_sample
from qportfolio.data.prices import PriceData, load_prices
from qportfolio.data.risk import (
    C_BUY,
    C_SELL,
    DEFAULT_WINDOWS,
    RF,
    Market,
    Windows,
    build_market,
)
from qportfolio.data.screen import QubitsInfo, ScreenInfo, prescreen
from qportfolio.data.stress import (
    PortfolioComparisonItem,
    ScenarioConfig,
    SectorStressImpact,
    StockStressImpact,
    StressResult,
    compare_portfolios,
    compute_resilience_score,
    evaluate_stress,
    get_historical_scenarios,
    get_predefined_scenarios,
)
from qportfolio.data.universe import Asset, load_universe

__all__ = [
    "Asset",
    "C_BUY",
    "C_SELL",
    "DEFAULT_WINDOWS",
    "Market",
    "OOS",
    "PortfolioOut",
    "PortfolioRow",
    "PriceData",
    "QubitsInfo",
    "RF",
    "ScenarioConfig",
    "ScreenInfo",
    "SectorStressImpact",
    "StockStressImpact",
    "StressResult",
    "Windows",
    "benchmark_oos",
    "build_market",
    "compare_portfolios",
    "compute_resilience_score",
    "evaluate_stress",
    "get_historical_scenarios",
    "get_predefined_scenarios",
    "linear_costs",
    "load_prices",
    "load_universe",
    "out_of_sample",
    "prescreen",
    "to_shares",
]
