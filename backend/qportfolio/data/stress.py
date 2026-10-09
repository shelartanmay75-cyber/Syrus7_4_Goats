"""Market Crash Stress Testing & Portfolio Robustness Engine.

Provides quantitative impact calculations for:
- Broad market crashes (uniform direct price declines)
- Severe liquidity and systemic contractions
- Volatility spikes (dispersion / risk inflation without direct price changes)
- Sector-specific shocks (additive direct shocks targeting specific industries)
- Combined multi-factor crises
- Historical crisis replays using observed NIFTY 50 price data
- Portfolio Resilience Score (transparent 0-100 composite heuristic)
- Cross-portfolio robustness comparison across QAOA and classical benchmarks.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
import pandas as pd

from qportfolio.data.prices import load_prices
from qportfolio.data.risk import Market, build_market
from qportfolio.data.universe import Asset, load_universe

logger = logging.getLogger(__name__)

ScenarioType = Literal["predefined", "custom", "historical"]


@dataclass
class ScenarioConfig:
    """Specification of a hypothetical or historical stress scenario."""

    id: str
    name: str
    description: str
    scenario_type: ScenarioType
    market_shock: float = 0.0  # e.g. -0.20 for -20%
    target_sector: str | None = None
    sector_shock: float = 0.0  # additive shock on target_sector, e.g. -0.15
    volatility_multiplier: float = 1.0  # risk expansion factor, >= 1.0
    start_date: str | None = None  # for historical replay
    end_date: str | None = None  # for historical replay
    is_historical: bool = False
    stock_shocks: dict[str, float] = field(default_factory=dict)  # ticker -> explicit return shock


@dataclass
class StockStressImpact:
    """Stock-level impact details under a stress scenario."""

    ticker: str
    symbol: str
    name: str
    sector: str
    weight: float
    initial_value: float
    stressed_return: float
    stressed_value: float
    loss_amount: float
    loss_contribution_pct: float  # percentage of total portfolio loss


@dataclass
class SectorStressImpact:
    """Sector-level exposure and stress loss summary."""

    sector: str
    weight: float
    initial_value: float
    stressed_value: float
    loss_amount: float
    stressed_return: float


@dataclass
class StressResult:
    """Complete portfolio stress test evaluation output."""

    scenario: ScenarioConfig
    initial_value: float
    stressed_value: float
    loss_amount: float
    portfolio_return: float
    baseline_volatility: float
    stressed_volatility: float
    resilience_score: float
    stocks: list[StockStressImpact]
    sectors: list[SectorStressImpact]
    summary: str
    reconciled: bool


@dataclass
class PortfolioComparisonItem:
    """Robustness comparison row for an alternative portfolio under identical stress."""

    id: str
    label: str
    kind: str  # 'quantum' | 'classical' | 'baseline'
    feasible: bool
    objective: float | None
    initial_value: float
    stressed_value: float
    loss_amount: float
    portfolio_return: float
    baseline_volatility: float
    stressed_volatility: float
    top_sector: str
    top_sector_pct: float
    resilience_score: float


def compute_resilience_score(
    portfolio_return: float,
    sector_weights: dict[str, float],
    volatility_multiplier: float,
) -> float:
    """Compute transparent Stress Resilience Score from 0 to 100.

    Formula:
    1. Downside factor (0 to 1):
       Linear decay from 1.0 at 0% return to 0.0 at -50% return (loss >= 50%).
       downside_factor = max(0.0, min(1.0, 1.0 + portfolio_return / 0.50))
    2. Diversification factor (0 to 1):
       Sector Herfindahl-Hirschman Index: HHI = sum(sector_weight^2).
       Lower HHI means capital is spread across more sectors.
       diversification_factor = max(0.2, min(1.0, 1.0 - 0.45 * (HHI - 0.1) / 0.9))
    3. Volatility dampener (0 to 1):
       1.0 / sqrt(max(1.0, volatility_multiplier))

    Composite:
       100 * (0.60 * downside_factor + 0.25 * diversification_factor + 0.15 * vol_dampener)

    Note:
       This is an educational heuristic for comparative resilience.
       It is NOT a standard credit score or guarantee of real-world capital protection.
    """
    downside_factor = max(0.0, min(1.0, 1.0 + portfolio_return / 0.50))
    hhi = sum(w**2 for w in sector_weights.values()) if sector_weights else 1.0
    diversification_factor = max(0.2, min(1.0, 1.0 - 0.45 * max(0.0, hhi - 0.1) / 0.9))
    vol_dampener = 1.0 / np.sqrt(max(1.0, volatility_multiplier))

    raw_score = 100.0 * (
        0.60 * downside_factor
        + 0.25 * diversification_factor
        + 0.15 * vol_dampener
    )
    return round(float(max(0.0, min(100.0, raw_score))), 1)


def get_predefined_scenarios() -> list[ScenarioConfig]:
    """Return frozen standard stress scenarios."""
    return [
        ScenarioConfig(
            id="broad_market_crash",
            name="Broad Market Crash (-20%)",
            description="Hypothetical uniform 20% decline across all equities with a 25% volatility elevation.",
            scenario_type="predefined",
            market_shock=-0.20,
            target_sector=None,
            sector_shock=0.0,
            volatility_multiplier=1.25,
            is_historical=False,
        ),
        ScenarioConfig(
            id="severe_market_crash",
            name="Severe Market Crash (-35%)",
            description="Severe liquidity contraction causing an indiscriminate 35% decline across all equities and 75% volatility surge.",
            scenario_type="predefined",
            market_shock=-0.35,
            target_sector=None,
            sector_shock=0.0,
            volatility_multiplier=1.75,
            is_historical=False,
        ),
        ScenarioConfig(
            id="volatility_spike",
            name="Volatility Spike (2x VIX)",
            description="Sudden doubling of asset return dispersion. Asset prices remain unchanged initially, but portfolio uncertainty and risk double.",
            scenario_type="predefined",
            market_shock=0.0,
            target_sector=None,
            sector_shock=0.0,
            volatility_multiplier=2.0,
            is_historical=False,
        ),
        ScenarioConfig(
            id="sector_financials_shock",
            name="Financials Credit Shock (-25%)",
            description="Credit event or rate shock inducing -25% decline in Financial Services stocks while unaffected sectors face 0% direct price shock.",
            scenario_type="predefined",
            market_shock=0.0,
            target_sector="Financial Services",
            sector_shock=-0.25,
            volatility_multiplier=1.30,
            is_historical=False,
        ),
        ScenarioConfig(
            id="sector_it_shock",
            name="Tech / IT Valuation Shock (-25%)",
            description="Global tech valuation reset causing -25% drop in Information Technology stocks while other sectors face zero direct price shock.",
            scenario_type="predefined",
            market_shock=0.0,
            target_sector="Information Technology",
            sector_shock=-0.25,
            volatility_multiplier=1.30,
            is_historical=False,
        ),
        ScenarioConfig(
            id="combined_crisis",
            name="Combined Crisis (Market -15% + Financials -20%)",
            description="Broad market drawdown (-15%) combined with industry-specific distress in Financial Services (-20% additional, -35% total) and 2.0x volatility spike.",
            scenario_type="predefined",
            market_shock=-0.15,
            target_sector="Financial Services",
            sector_shock=-0.20,
            volatility_multiplier=2.0,
            is_historical=False,
        ),
    ]


def get_historical_scenarios(price_df: pd.DataFrame | None = None) -> list[ScenarioConfig]:
    """Extract historical crisis events with actual observed returns from snapshot data."""
    if price_df is None:
        try:
            price_df = load_prices().close
        except Exception as e:
            logger.warning("Could not load price data for historical scenarios: %s", e)
            return []

    events = [
        {
            "id": "hist_election_2024",
            "name": "2024 Election Shock (June 4, 2024)",
            "desc": "Single-day market plunge following surprise general election results (NIFTY -5.93%, infrastructure and PSU equities down 15–21%).",
            "start": "2024-06-03",
            "end": "2024-06-04",
            "vol_mult": 1.6,
        },
        {
            "id": "hist_yen_carry_2024",
            "name": "Global Carry-Trade Unwind (Aug 5, 2024)",
            "desc": "Worldwide equity deleveraging triggered by Bank of Japan rate rise and US recession fears (NIFTY -2.68%).",
            "start": "2024-08-02",
            "end": "2024-08-05",
            "vol_mult": 1.4,
        },
        {
            "id": "hist_fii_oct_2024",
            "name": "Geopolitical & FII Selloff (Oct 1–7, 2024)",
            "desc": "5-day sustained correction driven by Middle East tension escalation and massive foreign institutional outflows (NIFTY -5.28%).",
            "start": "2024-10-01",
            "end": "2024-10-07",
            "vol_mult": 1.45,
        },
        {
            "id": "hist_correction_apr_2025",
            "name": "Global Tariff & Bond Volatility (Apr 1–7, 2025)",
            "desc": "5-day market selloff driven by trade tariff announcements and sovereign yield surges (NIFTY -5.77%).",
            "start": "2025-04-01",
            "end": "2025-04-07",
            "vol_mult": 1.5,
        },
    ]

    historical_scenarios: list[ScenarioConfig] = []
    for ev in events:
        start_date = ev["start"]
        end_date = ev["end"]
        if start_date not in price_df.index or end_date not in price_df.index:
            continue

        p_start = price_df.loc[start_date]
        p_end = price_df.loc[end_date]
        rets = (p_end / p_start) - 1.0

        # Build stock shocks dictionary
        shocks: dict[str, float] = {}
        for col in price_df.columns:
            if col == "^NSEI":
                continue
            val = rets.get(col)
            if pd.notna(val):
                shocks[str(col)] = float(val)

        market_ret = float(rets.get("^NSEI", -0.05))

        historical_scenarios.append(
            ScenarioConfig(
                id=ev["id"],
                name=ev["name"],
                description=ev["desc"],
                scenario_type="historical",
                market_shock=market_ret,
                target_sector=None,
                sector_shock=0.0,
                volatility_multiplier=ev["vol_mult"],
                start_date=start_date,
                end_date=end_date,
                is_historical=True,
                stock_shocks=shocks,
            )
        )

    return historical_scenarios


def evaluate_stress(
    portfolio_items: list[dict[str, Any]] | list[str],
    capital: float,
    scenario: ScenarioConfig,
    market: Market | None = None,
) -> StressResult:
    """Evaluate portfolio sensitivity and loss under direct price and volatility shocks.

    Direct shock model (CONTRACTS and mathematical requirement):
    - For stock i with weight w_i:
      r_i is the assumed scenario return:
      * In historical mode: r_i from observed historical stock return (or market return fallback).
      * In custom/predefined mode:
        If stock i belongs to target_sector: r_i = market_shock + sector_shock
        Otherwise: r_i = market_shock
    - Portfolio return: R_p = sum(w_i * r_i)
    - Stressed portfolio value: V_stressed = V_0 * (1 + R_p)
    - Total loss amount: L = V_0 - V_stressed = sum(L_i)
    - Individual stock loss: L_i = V_0 * w_i * (-r_i)
    - Reconciliation verification: verifies |L - sum(L_i)| < 1e-4

    Args:
        portfolio_items: List of dicts with {'ticker': ..., 'weight': ...} or list of ticker strings.
                         If weight is missing or unnormalized, equal weights (1/k) are applied.
        capital: Initial portfolio value V_0 (in INR).
        scenario: Configured ScenarioConfig with shock parameters.
        market: Optional Market instance for covariance matrix and sector mappings.

    Returns:
        StressResult: Complete analysis with stock and sector breakdowns.
    """
    if capital <= 0:
        raise ValueError("Portfolio capital must be strictly positive")

    universe_assets = {a.ticker: a for a in load_universe()}

    # 1. Parse and validate portfolio items
    parsed_stocks: list[dict[str, Any]] = []
    if not portfolio_items:
        raise ValueError("Portfolio must contain at least one stock")

    for item in portfolio_items:
        if isinstance(item, str):
            ticker = item.strip()
            raw_weight = None
        elif isinstance(item, dict):
            ticker = item.get("ticker", "").strip()
            raw_weight = item.get("weight")
        else:
            continue

        if not ticker:
            continue

        asset = universe_assets.get(ticker)
        name = asset.name if asset else ticker
        symbol = asset.symbol if asset else ticker.replace(".NS", "")
        sector = asset.sector if asset else "Unclassified"

        parsed_stocks.append({
            "ticker": ticker,
            "symbol": symbol,
            "name": name,
            "sector": sector,
            "raw_weight": raw_weight,
        })

    if not parsed_stocks:
        raise ValueError("No valid tickers found in portfolio")

    # 2. Normalize weights
    has_weights = all(s["raw_weight"] is not None and s["raw_weight"] > 0 for s in parsed_stocks)
    if has_weights:
        total_w = sum(s["raw_weight"] for s in parsed_stocks)
        weights = [s["raw_weight"] / total_w for s in parsed_stocks]
    else:
        k_stocks = len(parsed_stocks)
        weights = [1.0 / k_stocks for _ in parsed_stocks]

    # 3. Compute baseline volatility if market covariance matrix available
    baseline_vol = 0.20  # default baseline annual volatility fallback
    if market is None:
        try:
            market = build_market()
        except Exception:
            market = None

    if market is not None:
        tickers = [s["ticker"] for s in parsed_stocks]
        try:
            sub_m = market.subset(tickers)
            w_arr = np.array(weights, dtype=float)
            port_var = float(w_arr.T @ sub_m.sigma @ w_arr)
            baseline_vol = float(np.sqrt(max(1e-8, port_var)))
        except Exception as e:
            logger.debug("Failed subset covariance for tickers %s: %s", tickers, e)

    vol_mult = max(0.5, float(scenario.volatility_multiplier))
    stressed_vol = float(baseline_vol * vol_mult)

    # 4. Calculate stock-level returns, values, and losses
    stock_impacts: list[StockStressImpact] = []
    sector_summary: dict[str, dict[str, float]] = {}

    portfolio_return = 0.0

    for i, stock in enumerate(parsed_stocks):
        ticker = stock["ticker"]
        sector = stock["sector"]
        w_i = weights[i]
        initial_v_i = capital * w_i

        # Determine stock scenario return
        if scenario.is_historical and ticker in scenario.stock_shocks:
            r_i = float(scenario.stock_shocks[ticker])
        else:
            r_i = float(scenario.market_shock)
            if scenario.target_sector and sector.lower() == scenario.target_sector.lower():
                r_i += float(scenario.sector_shock)

        # Clamping return lower bound to -1.0 (cannot lose more than 100% in a long-only position)
        r_i = max(-1.0, r_i)

        stressed_v_i = initial_v_i * (1.0 + r_i)
        loss_i = initial_v_i - stressed_v_i

        portfolio_return += w_i * r_i

        # Sector tracking
        if sector not in sector_summary:
            sector_summary[sector] = {
                "weight": 0.0,
                "initial_value": 0.0,
                "stressed_value": 0.0,
                "loss_amount": 0.0,
            }
        sec = sector_summary[sector]
        sec["weight"] += w_i
        sec["initial_value"] += initial_v_i
        sec["stressed_value"] += stressed_v_i
        sec["loss_amount"] += loss_i

        stock_impacts.append(
            StockStressImpact(
                ticker=ticker,
                symbol=stock["symbol"],
                name=stock["name"],
                sector=sector,
                weight=w_i,
                initial_value=round(initial_v_i, 2),
                stressed_return=round(r_i, 4),
                stressed_value=round(stressed_v_i, 2),
                loss_amount=round(loss_i, 2),
                loss_contribution_pct=0.0,  # calculated below
            )
        )

    # Total portfolio outcomes
    stressed_value = capital * (1.0 + portfolio_return)
    total_loss = capital - stressed_value

    # Compute loss contributions and sort stocks by loss amount descending
    for impact in stock_impacts:
        if abs(total_loss) > 1e-4:
            impact.loss_contribution_pct = round(float(impact.loss_amount / total_loss * 100.0), 2)
        else:
            impact.loss_contribution_pct = 0.0

    stock_impacts.sort(key=lambda s: s.loss_amount, reverse=True)

    # Reconcile check: sum(stock_losses) == total_loss within floating tolerance
    sum_stock_losses = sum(s.loss_amount for s in stock_impacts)
    reconciled = bool(abs(total_loss - sum_stock_losses) < 0.50)

    # Sector impacts list
    sector_impacts: list[SectorStressImpact] = []
    sector_weights_map: dict[str, float] = {}
    for sec_name, vals in sector_summary.items():
        sec_w = vals["weight"]
        sector_weights_map[sec_name] = sec_w
        init_v = vals["initial_value"]
        stress_v = vals["stressed_value"]
        sec_loss = vals["loss_amount"]
        sec_ret = (stress_v / init_v - 1.0) if init_v > 0 else 0.0
        sector_impacts.append(
            SectorStressImpact(
                sector=sec_name,
                weight=round(sec_w, 4),
                initial_value=round(init_v, 2),
                stressed_value=round(stress_v, 2),
                loss_amount=round(sec_loss, 2),
                stressed_return=round(sec_ret, 4),
            )
        )
    sector_impacts.sort(key=lambda s: s.loss_amount, reverse=True)

    # Resilience score
    resilience_score = compute_resilience_score(
        portfolio_return=portfolio_return,
        sector_weights=sector_weights_map,
        volatility_multiplier=vol_mult,
    )

    # Generate plain-language summary
    worst_stock = stock_impacts[0] if stock_impacts else None
    pct_loss_str = f"{-portfolio_return * 100:.1f}%" if portfolio_return < 0 else f"+{portfolio_return * 100:.1f}%"
    summary_parts = [
        f"Under '{scenario.name}', the estimated portfolio return is {portfolio_return * 100:+.2f}%.",
        f"Total portfolio value shifts from ₹{capital:,.0f} to ₹{stressed_value:,.0f} (loss of ₹{total_loss:,.0f}, {pct_loss_str}).",
    ]
    if worst_stock and worst_stock.loss_amount > 0:
        summary_parts.append(
            f"Largest loss contributor is {worst_stock.name} ({worst_stock.symbol}), contributing ₹{worst_stock.loss_amount:,.0f} ({worst_stock.loss_contribution_pct:.1f}% of total portfolio decline)."
        )
    if vol_mult > 1.05:
        summary_parts.append(
            f"Annual volatility expands from {baseline_vol * 100:.1f}% to {stressed_vol * 100:.1f}% (+{(vol_mult - 1) * 100:.0f}% risk surge)."
        )

    return StressResult(
        scenario=scenario,
        initial_value=round(capital, 2),
        stressed_value=round(stressed_value, 2),
        loss_amount=round(total_loss, 2),
        portfolio_return=round(portfolio_return, 4),
        baseline_volatility=round(baseline_vol, 4),
        stressed_volatility=round(stressed_vol, 4),
        resilience_score=resilience_score,
        stocks=stock_impacts,
        sectors=sector_impacts,
        summary=" ".join(summary_parts),
        reconciled=reconciled,
    )


def compare_portfolios(
    candidates: list[dict[str, Any]],
    scenario: ScenarioConfig,
    market: Market | None = None,
) -> list[PortfolioComparisonItem]:
    """Compare multiple candidate portfolios under the exact same scenario."""
    if market is None:
        try:
            market = build_market()
        except Exception:
            market = None

    comparison_results: list[PortfolioComparisonItem] = []

    for cand in candidates:
        cand_id = cand.get("id", "portfolio")
        label = cand.get("label", cand_id)
        kind = cand.get("kind", "classical")
        feasible = bool(cand.get("feasible", True))
        objective = cand.get("objective")
        capital = float(cand.get("capital", 1_000_000))
        items = cand.get("items", []) or cand.get("selection", [])

        if not items:
            continue

        try:
            res = evaluate_stress(items, capital=capital, scenario=scenario, market=market)
            top_sec = res.sectors[0].sector if res.sectors else "None"
            top_sec_pct = res.sectors[0].weight * 100.0 if res.sectors else 0.0

            comparison_results.append(
                PortfolioComparisonItem(
                    id=cand_id,
                    label=label,
                    kind=kind,
                    feasible=feasible,
                    objective=round(float(objective), 4) if objective is not None else None,
                    initial_value=res.initial_value,
                    stressed_value=res.stressed_value,
                    loss_amount=res.loss_amount,
                    portfolio_return=res.portfolio_return,
                    baseline_volatility=res.baseline_volatility,
                    stressed_volatility=res.stressed_volatility,
                    top_sector=top_sec,
                    top_sector_pct=round(top_sec_pct, 1),
                    resilience_score=res.resilience_score,
                )
            )
        except Exception as e:
            logger.warning("Failed stress comparison for candidate %s: %s", cand_id, e)

    return comparison_results
