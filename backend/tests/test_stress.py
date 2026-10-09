"""Unit and integration tests for Market Crash Stress Testing (USP).

Covers:
- Zero shock produces exactly 0% direct loss and V_stressed == V_0.
- Uniform -20% shock produces -20% portfolio return and 20% loss.
- Sector shock affects ONLY target sector (other sectors face 0% shock).
- Combined crisis scenario (market shock + additive sector shock + vol multiplier).
- Portfolio weights and stock-level loss contributions reconcile to total loss.
- Volatility shock handled separately from price shock (volatility increases without price drop).
- Transparent Stress Resilience Score (0 to 100) properties and bounds.
- Predefined and historical scenarios integrity.
- Candidate portfolio comparison across QAOA and classical benchmarks.
- Error handling for invalid parameters and empty portfolios.
- FastAPI endpoints: /api/stress/scenarios, /api/stress/evaluate, /api/stress/compare.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from qportfolio.api.main import app
from qportfolio.data.stress import (
    ScenarioConfig,
    compare_portfolios,
    compute_resilience_score,
    evaluate_stress,
    get_historical_scenarios,
    get_predefined_scenarios,
)


@pytest.fixture
def test_client():
    return TestClient(app)


def test_zero_shock_scenario():
    """A zero-shock scenario produces no direct-shock portfolio loss."""
    scenario = ScenarioConfig(
        id="zero_test",
        name="Zero Shock",
        description="Zero price change",
        scenario_type="custom",
        market_shock=0.0,
        target_sector=None,
        sector_shock=0.0,
        volatility_multiplier=1.0,
    )
    stocks = [
        {"ticker": "TCS.NS", "weight": 0.5},
        {"ticker": "INFY.NS", "weight": 0.5},
    ]
    res = evaluate_stress(stocks, capital=1_000_000, scenario=scenario)

    assert res.portfolio_return == pytest.approx(0.0)
    assert res.loss_amount == pytest.approx(0.0)
    assert res.stressed_value == pytest.approx(1_000_000)
    assert res.reconciled is True
    for s in res.stocks:
        assert s.loss_amount == pytest.approx(0.0)
        assert s.stressed_return == pytest.approx(0.0)


def test_uniform_negative_shock():
    """A uniform -20% shock produces a -20% portfolio return when weights sum to 1."""
    scenario = ScenarioConfig(
        id="crash_20",
        name="Broad Crash 20%",
        description="20% drop across board",
        scenario_type="predefined",
        market_shock=-0.20,
        target_sector=None,
        sector_shock=0.0,
        volatility_multiplier=1.25,
    )
    stocks = [
        {"ticker": "TCS.NS", "weight": 0.4},
        {"ticker": "HDFCBANK.NS", "weight": 0.6},
    ]
    capital = 500_000.0
    res = evaluate_stress(stocks, capital=capital, scenario=scenario)

    assert res.portfolio_return == pytest.approx(-0.20)
    assert res.stressed_value == pytest.approx(400_000.0)
    assert res.loss_amount == pytest.approx(100_000.0)
    assert res.reconciled is True

    # Check stock-level reconciliation
    tcs = next(s for s in res.stocks if s.ticker == "TCS.NS")
    hdfc = next(s for s in res.stocks if s.ticker == "HDFCBANK.NS")

    assert tcs.loss_amount == pytest.approx(40_000.0)
    assert hdfc.loss_amount == pytest.approx(60_000.0)
    assert tcs.loss_contribution_pct == pytest.approx(40.0)
    assert hdfc.loss_contribution_pct == pytest.approx(60.0)
    assert tcs.loss_amount + hdfc.loss_amount == pytest.approx(res.loss_amount)


def test_sector_shock_affects_only_target_sector():
    """Sector shock affects ONLY stocks in that sector when market_shock is 0%."""
    scenario = ScenarioConfig(
        id="financials_only",
        name="Financials Crisis",
        description="Only Financial Services drop",
        scenario_type="custom",
        market_shock=0.0,
        target_sector="Financial Services",
        sector_shock=-0.25,
        volatility_multiplier=1.2,
    )
    # TCS is Information Technology; HDFCBANK is Financial Services
    stocks = [
        {"ticker": "TCS.NS", "weight": 0.5},
        {"ticker": "HDFCBANK.NS", "weight": 0.5},
    ]
    res = evaluate_stress(stocks, capital=1_000_000, scenario=scenario)

    tcs = next(s for s in res.stocks if s.ticker == "TCS.NS")
    hdfc = next(s for s in res.stocks if s.ticker == "HDFCBANK.NS")

    assert tcs.stressed_return == pytest.approx(0.0)
    assert tcs.loss_amount == pytest.approx(0.0)
    assert hdfc.stressed_return == pytest.approx(-0.25)
    assert hdfc.loss_amount == pytest.approx(125_000.0)

    # Portfolio return should be 0.5 * 0 + 0.5 * (-0.25) = -0.125
    assert res.portfolio_return == pytest.approx(-0.125)
    assert res.loss_amount == pytest.approx(125_000.0)
    assert hdfc.loss_contribution_pct == pytest.approx(100.0)
    assert res.reconciled is True


def test_combined_crisis_scenario():
    """Combined scenario applies additive rule: market_shock + sector_shock for target sector."""
    scenario = ScenarioConfig(
        id="combined",
        name="Combined Shock",
        description="Market -15% plus Financials -20%",
        scenario_type="predefined",
        market_shock=-0.15,
        target_sector="Financial Services",
        sector_shock=-0.20,
        volatility_multiplier=2.0,
    )
    stocks = [
        {"ticker": "TCS.NS", "weight": 0.5},  # IT -> -0.15
        {"ticker": "HDFCBANK.NS", "weight": 0.5},  # Financials -> -0.15 + (-0.20) = -0.35
    ]
    res = evaluate_stress(stocks, capital=1_000_000, scenario=scenario)

    tcs = next(s for s in res.stocks if s.ticker == "TCS.NS")
    hdfc = next(s for s in res.stocks if s.ticker == "HDFCBANK.NS")

    assert tcs.stressed_return == pytest.approx(-0.15)
    assert hdfc.stressed_return == pytest.approx(-0.35)

    # Expected portfolio return = 0.5 * (-0.15) + 0.5 * (-0.35) = -0.25
    assert res.portfolio_return == pytest.approx(-0.25)
    assert res.loss_amount == pytest.approx(250_000.0)
    assert res.stressed_value == pytest.approx(750_000.0)
    assert res.reconciled is True
    assert tcs.loss_amount + hdfc.loss_amount == pytest.approx(250_000.0)


def test_volatility_shock_separate_from_price_shock():
    """Volatility multiplier inflates risk without causing direct price declines when market_shock is 0."""
    scenario_base = ScenarioConfig(
        id="base",
        name="No Vol Shock",
        description="",
        scenario_type="custom",
        market_shock=0.0,
        volatility_multiplier=1.0,
    )
    scenario_vol = ScenarioConfig(
        id="vol",
        name="2x Vol Shock",
        description="",
        scenario_type="predefined",
        market_shock=0.0,
        volatility_multiplier=2.0,
    )
    stocks = ["TCS.NS", "INFY.NS", "RELIANCE.NS"]
    res_base = evaluate_stress(stocks, capital=1_000_000, scenario=scenario_base)
    res_vol = evaluate_stress(stocks, capital=1_000_000, scenario=scenario_vol)

    # Direct prices and portfolio values are unchanged
    assert res_vol.portfolio_return == pytest.approx(0.0)
    assert res_vol.loss_amount == pytest.approx(0.0)
    assert res_vol.stressed_value == pytest.approx(1_000_000)

    # Volatility is doubled
    assert res_vol.stressed_volatility == pytest.approx(res_base.baseline_volatility * 2.0, rel=1e-3)
    # Resilience score is dampened by volatility elevation
    assert res_vol.resilience_score < res_base.resilience_score


def test_equal_weighting_fallback():
    """If weights are missing, equal weighting (1/k) is applied automatically."""
    scenario = ScenarioConfig(
        id="test",
        name="Test",
        description="",
        scenario_type="custom",
        market_shock=-0.10,
    )
    # Pass plain ticker strings
    stocks = ["TCS.NS", "INFY.NS", "HDFCBANK.NS", "RELIANCE.NS"]
    res = evaluate_stress(stocks, capital=400_000, scenario=scenario)

    assert len(res.stocks) == 4
    for s in res.stocks:
        assert s.weight == pytest.approx(0.25)
        assert s.initial_value == pytest.approx(100_000.0)
        assert s.loss_amount == pytest.approx(10_000.0)

    assert res.portfolio_return == pytest.approx(-0.10)
    assert res.loss_amount == pytest.approx(40_000.0)
    assert res.reconciled is True


def test_resilience_score_formula_and_bounds():
    """Resilience score stays strictly within [0, 100] and ranks intuitive risk correctly."""
    # Score with 0% loss and good diversification
    score_safe = compute_resilience_score(
        portfolio_return=0.0,
        sector_weights={"IT": 0.25, "Finance": 0.25, "Consumer": 0.25, "Energy": 0.25},
        volatility_multiplier=1.0,
    )
    assert 70.0 <= score_safe <= 100.0

    # Score with extreme crash (-50% loss) and concentrated sector (HHI=1.0)
    score_crash = compute_resilience_score(
        portfolio_return=-0.50,
        sector_weights={"Finance": 1.0},
        volatility_multiplier=2.5,
    )
    assert 0.0 <= score_crash <= 35.0
    assert score_safe > score_crash


def test_invalid_parameters():
    """Negative capital or empty portfolio raises clean ValueError."""
    scenario = ScenarioConfig(id="x", name="x", description="", scenario_type="custom")

    with pytest.raises(ValueError, match="capital must be strictly positive"):
        evaluate_stress(["TCS.NS"], capital=0, scenario=scenario)

    with pytest.raises(ValueError, match="at least one stock"):
        evaluate_stress([], capital=100_000, scenario=scenario)


def test_predefined_and_historical_scenarios_available():
    """Predefined and historical scenario loaders return non-empty verified scenarios."""
    predefined = get_predefined_scenarios()
    assert len(predefined) >= 5
    assert any(s.id == "broad_market_crash" for s in predefined)
    assert any(s.id == "combined_crisis" for s in predefined)

    historical = get_historical_scenarios()
    assert len(historical) >= 2
    assert any("2024" in s.name for s in historical)


def test_compare_portfolios_multi_candidate():
    """compare_portfolios evaluates multiple candidate portfolios under identical stress."""
    scenario = ScenarioConfig(
        id="crash",
        name="Crash",
        description="",
        scenario_type="predefined",
        market_shock=-0.20,
    )
    candidates = [
        {
            "id": "qaoa_standard",
            "label": "QAOA Standard",
            "kind": "quantum",
            "feasible": True,
            "objective": -0.045,
            "capital": 1_000_000,
            "items": ["TCS.NS", "INFY.NS"],
        },
        {
            "id": "brute_force",
            "label": "Brute Force",
            "kind": "classical",
            "feasible": True,
            "objective": -0.048,
            "capital": 1_000_000,
            "items": ["HDFCBANK.NS", "ICICIBANK.NS", "ITC.NS"],
        },
    ]
    results = compare_portfolios(candidates, scenario)
    assert len(results) == 2
    assert results[0].id == "qaoa_standard"
    assert results[0].portfolio_return == pytest.approx(-0.20)
    assert results[1].id == "brute_force"
    assert results[1].portfolio_return == pytest.approx(-0.20)


# =========================================================================
# API Endpoint Integration Tests
# =========================================================================
def test_api_get_scenarios(test_client):
    """GET /api/stress/scenarios returns predefined and historical scenario lists."""
    response = test_client.get("/api/stress/scenarios")
    assert response.status_code == 200
    data = response.json()
    assert "predefined" in data
    assert "historical" in data
    assert len(data["predefined"]) >= 5
    assert len(data["historical"]) >= 2


def test_api_evaluate_endpoint(test_client):
    """POST /api/stress/evaluate computes stress impact correctly over HTTP."""
    payload = {
        "portfolio": [
            {"ticker": "TCS.NS", "weight": 0.5},
            {"ticker": "INFY.NS", "weight": 0.5},
        ],
        "capital": 1_000_000.0,
        "scenario": {
            "id": "test_crash",
            "name": "Test Crash",
            "description": "Test HTTP scenario",
            "scenario_type": "custom",
            "market_shock": -0.20,
            "target_sector": None,
            "sector_shock": 0.0,
            "volatility_multiplier": 1.25,
            "is_historical": False,
            "stock_shocks": {},
        },
    }
    response = test_client.post("/api/stress/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["initial_value"] == 1_000_000.0
    assert data["stressed_value"] == 800_000.0
    assert data["loss_amount"] == 200_000.0
    assert data["portfolio_return"] == -0.20
    assert data["reconciled"] is True
    assert len(data["stocks"]) == 2
    assert "Tata Consultancy Services" in data["stocks"][0]["name"] or "Infosys" in data["stocks"][0]["name"]


def test_api_compare_endpoint(test_client):
    """POST /api/stress/compare compares multiple candidate portfolios over HTTP."""
    payload = {
        "candidates": [
            {
                "id": "c1",
                "label": "Candidate 1",
                "kind": "quantum",
                "feasible": True,
                "objective": -0.05,
                "capital": 500_000.0,
                "items": [{"ticker": "TCS.NS", "weight": 1.0}],
            },
            {
                "id": "c2",
                "label": "Candidate 2",
                "kind": "classical",
                "feasible": True,
                "objective": -0.04,
                "capital": 500_000.0,
                "items": [{"ticker": "HDFCBANK.NS", "weight": 1.0}],
            },
        ],
        "scenario": {
            "id": "test_crash",
            "name": "Test Crash",
            "description": "25% drop",
            "scenario_type": "custom",
            "market_shock": -0.25,
            "target_sector": None,
            "sector_shock": 0.0,
            "volatility_multiplier": 1.5,
            "is_historical": False,
            "stock_shocks": {},
        },
    }
    response = test_client.post("/api/stress/compare", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["portfolio_return"] == -0.25
    assert data[0]["loss_amount"] == 125_000.0
