"""Stress Testing API Router and Schemas (Market Crash Stress Testing USP).

Provides endpoints for:
- Querying predefined and historical stress scenarios
- Evaluating portfolio loss, risk, stock-level attribution and sector impact
- Comparing alternative solver portfolios under identical adverse market conditions
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from qportfolio.data.stress import (
    PortfolioComparisonItem,
    ScenarioConfig,
    SectorStressImpact,
    StockStressImpact,
    StressResult,
    compare_portfolios,
    evaluate_stress,
    get_historical_scenarios,
    get_predefined_scenarios,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stress", tags=["stress"])


class ScenarioModel(BaseModel):
    """Scenario configuration schema for API payloads."""

    id: str
    name: str
    description: str
    scenario_type: Literal["predefined", "custom", "historical"] = "predefined"
    market_shock: float = Field(0.0, ge=-1.0, le=2.0)
    target_sector: str | None = None
    sector_shock: float = Field(0.0, ge=-1.0, le=2.0)
    volatility_multiplier: float = Field(1.0, ge=0.1, le=10.0)
    start_date: str | None = None
    end_date: str | None = None
    is_historical: bool = False
    stock_shocks: dict[str, float] = {}


class ScenariosResponse(BaseModel):
    """Response containing standard predefined and historical crisis scenarios."""

    predefined: list[ScenarioModel]
    historical: list[ScenarioModel]


class PortfolioItemInput(BaseModel):
    """Stock item with optional allocation weight."""

    ticker: str
    weight: float | None = None


class StressEvaluateRequest(BaseModel):
    """Request payload for evaluating a portfolio under stress."""

    portfolio: list[PortfolioItemInput] | list[str]
    capital: float = Field(1_000_000.0, gt=0)
    scenario: ScenarioModel


class StockStressImpactModel(BaseModel):
    ticker: str
    symbol: str
    name: str
    sector: str
    weight: float
    initial_value: float
    stressed_return: float
    stressed_value: float
    loss_amount: float
    loss_contribution_pct: float


class SectorStressImpactModel(BaseModel):
    sector: str
    weight: float
    initial_value: float
    stressed_value: float
    loss_amount: float
    stressed_return: float


class StressResultModel(BaseModel):
    scenario: ScenarioModel
    initial_value: float
    stressed_value: float
    loss_amount: float
    portfolio_return: float
    baseline_volatility: float
    stressed_volatility: float
    resilience_score: float
    stocks: list[StockStressImpactModel]
    sectors: list[SectorStressImpactModel]
    summary: str
    reconciled: bool


class CandidatePortfolioInput(BaseModel):
    id: str
    label: str
    kind: str = "classical"
    feasible: bool = True
    objective: float | None = None
    capital: float = Field(1_000_000.0, gt=0)
    items: list[PortfolioItemInput] | list[str] = []


class StressCompareRequest(BaseModel):
    candidates: list[CandidatePortfolioInput]
    scenario: ScenarioModel


class PortfolioComparisonItemModel(BaseModel):
    id: str
    label: str
    kind: str
    feasible: bool
    objective: float | None = None
    initial_value: float
    stressed_value: float
    loss_amount: float
    portfolio_return: float
    baseline_volatility: float
    stressed_volatility: float
    top_sector: str
    top_sector_pct: float
    resilience_score: float


def _to_scenario_config(model: ScenarioModel) -> ScenarioConfig:
    return ScenarioConfig(
        id=model.id,
        name=model.name,
        description=model.description,
        scenario_type=model.scenario_type,
        market_shock=model.market_shock,
        target_sector=model.target_sector,
        sector_shock=model.sector_shock,
        volatility_multiplier=model.volatility_multiplier,
        start_date=model.start_date,
        end_date=model.end_date,
        is_historical=model.is_historical,
        stock_shocks=model.stock_shocks,
    )


def _to_scenario_model(cfg: ScenarioConfig) -> ScenarioModel:
    return ScenarioModel(
        id=cfg.id,
        name=cfg.name,
        description=cfg.description,
        scenario_type=cfg.scenario_type,
        market_shock=cfg.market_shock,
        target_sector=cfg.target_sector,
        sector_shock=cfg.sector_shock,
        volatility_multiplier=cfg.volatility_multiplier,
        start_date=cfg.start_date,
        end_date=cfg.end_date,
        is_historical=cfg.is_historical,
        stock_shocks=cfg.stock_shocks,
    )


def _to_stress_result_model(res: StressResult) -> StressResultModel:
    return StressResultModel(
        scenario=_to_scenario_model(res.scenario),
        initial_value=res.initial_value,
        stressed_value=res.stressed_value,
        loss_amount=res.loss_amount,
        portfolio_return=res.portfolio_return,
        baseline_volatility=res.baseline_volatility,
        stressed_volatility=res.stressed_volatility,
        resilience_score=res.resilience_score,
        stocks=[
            StockStressImpactModel(
                ticker=s.ticker,
                symbol=s.symbol,
                name=s.name,
                sector=s.sector,
                weight=s.weight,
                initial_value=s.initial_value,
                stressed_return=s.stressed_return,
                stressed_value=s.stressed_value,
                loss_amount=s.loss_amount,
                loss_contribution_pct=s.loss_contribution_pct,
            )
            for s in res.stocks
        ],
        sectors=[
            SectorStressImpactModel(
                sector=sec.sector,
                weight=sec.weight,
                initial_value=sec.initial_value,
                stressed_value=sec.stressed_value,
                loss_amount=sec.loss_amount,
                stressed_return=sec.stressed_return,
            )
            for sec in res.sectors
        ],
        summary=res.summary,
        reconciled=res.reconciled,
    )


@router.get("/scenarios", response_model=ScenariosResponse)
def list_scenarios() -> ScenariosResponse:
    """Retrieve predefined and historical market crash scenarios."""
    predefined = [_to_scenario_model(s) for s in get_predefined_scenarios()]
    historical = [_to_scenario_model(s) for s in get_historical_scenarios()]
    return ScenariosResponse(predefined=predefined, historical=historical)


@router.post("/evaluate", response_model=StressResultModel)
def evaluate_portfolio_stress(req: StressEvaluateRequest) -> StressResultModel:
    """Evaluate portfolio sensitivity and financial impact under a market shock scenario."""
    # Convert input items
    portfolio_items: list[dict[str, Any]] = []
    for item in req.portfolio:
        if isinstance(item, str):
            portfolio_items.append({"ticker": item})
        elif isinstance(item, PortfolioItemInput):
            portfolio_items.append({"ticker": item.ticker, "weight": item.weight})
        elif isinstance(item, dict):
            portfolio_items.append(item)

    if not portfolio_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Portfolio must contain at least one stock",
        )

    scenario_cfg = _to_scenario_config(req.scenario)

    try:
        res = evaluate_stress(
            portfolio_items=portfolio_items,
            capital=req.capital,
            scenario=scenario_cfg,
        )
        return _to_stress_result_model(res)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))
    except Exception as e:
        logger.exception("Error evaluating stress: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute portfolio stress scenario",
        )


@router.post("/compare", response_model=list[PortfolioComparisonItemModel])
def compare_candidate_portfolios(req: StressCompareRequest) -> list[PortfolioComparisonItemModel]:
    """Compare candidate portfolios (e.g. QAOA vs classical solvers) under identical stress conditions."""
    if not req.candidates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Must provide at least one candidate portfolio to compare",
        )

    candidates_data: list[dict[str, Any]] = []
    for cand in req.candidates:
        items = []
        for it in cand.items:
            if isinstance(it, str):
                items.append({"ticker": it})
            elif isinstance(it, PortfolioItemInput):
                items.append({"ticker": it.ticker, "weight": it.weight})
            elif isinstance(it, dict):
                items.append(it)

        candidates_data.append({
            "id": cand.id,
            "label": cand.label,
            "kind": cand.kind,
            "feasible": cand.feasible,
            "objective": cand.objective,
            "capital": cand.capital,
            "items": items,
        })

    scenario_cfg = _to_scenario_config(req.scenario)

    try:
        results = compare_portfolios(candidates=candidates_data, scenario=scenario_cfg)
        return [
            PortfolioComparisonItemModel(
                id=c.id,
                label=c.label,
                kind=c.kind,
                feasible=c.feasible,
                objective=c.objective,
                initial_value=c.initial_value,
                stressed_value=c.stressed_value,
                loss_amount=c.loss_amount,
                portfolio_return=c.portfolio_return,
                baseline_volatility=c.baseline_volatility,
                stressed_volatility=c.stressed_volatility,
                top_sector=c.top_sector,
                top_sector_pct=c.top_sector_pct,
                resilience_score=c.resilience_score,
            )
            for c in results
        ]
    except Exception as e:
        logger.exception("Error comparing portfolios: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compare candidate portfolios under stress",
        )
