"""FastAPI HTTP application for Quantum Portfolio Optimiser (CONTRACTS.md §2).

Provides endpoints for health, universe data, pre-screening, background jobs,
and precomputed studies.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from qportfolio.api.jobs import job_runner
from qportfolio.api.stress import router as stress_router
from qportfolio.api.studies import get_study, list_studies
from qportfolio.contracts import (
    AssetInfo,
    JobStatus,
    QubitCount,
    RunRequest,
    ScreenInfo,
    Study,
    StudySummary,
    Universe,
)
from qportfolio.data import RF, build_market, load_prices, load_universe, prescreen

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Quantum Portfolio Optimiser API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

import os

# CORS configuration per CONTRACTS.md §2: allow Vite frontend dev server, local network, and production domains
cors_env = os.getenv("CORS_ORIGINS", "*").strip()
if cors_env == "*" or not cors_env:
    cors_origins = ["*"]
    cors_credentials = False
    origin_regex = None
else:
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        *[o.strip() for o in cors_env.split(",") if o.strip()],
    ]
    cors_credentials = True
    origin_regex = r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=origin_regex,
    allow_credentials=cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Format validation errors in a clean plain-language message."""
    error_messages: list[str] = []
    for err in exc.errors():
        loc_parts = [str(x) for x in err.get("loc", []) if x != "body"]
        loc_str = " -> ".join(loc_parts)
        msg = err.get("msg", "Invalid value")
        error_messages.append(f"{loc_str}: {msg}" if loc_str else msg)

    detail = "; ".join(error_messages) or "Invalid request parameters"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": detail},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    """Ensure HTTP exceptions adhere to the {'detail': '...'} shape."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": str(exc.detail)},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catch-all to guarantee no traceback or file path ever reaches a client."""
    logger.exception("Internal server error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred."},
    )


# --- 2. Health -------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    """Health check endpoint."""
    return {"ok": True, "version": "0.1.0"}


# --- 2.1 Universe -----------------------------------------------------------
@app.get("/api/universe", response_model=Universe)
def get_universe() -> Universe:
    """Get NIFTY 50 assets with sector classifications, provenance, and exclusion reasons."""
    assets = load_universe()
    price_data = load_prices()
    market = build_market()

    asset_list: list[AssetInfo] = []
    for a in assets:
        excluded_reason = market.excluded.get(a.ticker, None)
        asset_list.append(
            AssetInfo(
                ticker=a.ticker,
                symbol=a.symbol,
                name=a.name,
                sector=a.sector,
                excluded_reason=excluded_reason,
            )
        )

    return Universe(
        as_of=price_data.as_of,
        source=price_data.source,
        assets=asset_list,
    )


# --- 2.4 Screen -------------------------------------------------------------
@app.post("/api/screen", response_model=ScreenInfo)
def screen_universe(request: RunRequest) -> ScreenInfo:
    """Pre-screen stocks to fit qubit budget based on estimation-window Sharpe ratio."""
    market = build_market(tickers=request.tickers)
    # Subtract 3 qubits if target_return constraint is active (CONTRACTS.md §1.2)
    slack_adjustment = 3 if request.target_return is not None else 0
    qubit_budget = request.qubit_cap - slack_adjustment

    result = prescreen(
        market=market,
        k=request.k,
        qubit_budget=qubit_budget,
        sector_cap=request.sector_cap,
        rf=RF,
    )

    return ScreenInfo(
        applied=result.applied,
        rule=result.rule,
        kept=result.kept,
        dropped=result.dropped,
        qubits=QubitCount(
            assets=result.qubits.assets,
            slack=result.qubits.slack,
            total=result.qubits.total,
        ),
    )


# --- 2.5 Job Runner ---------------------------------------------------------
@app.post("/api/runs", status_code=status.HTTP_202_ACCEPTED)
def start_run(request: RunRequest) -> dict[str, str]:
    """Queue a portfolio optimization job. Returns 202 Accepted with job_id."""
    job_id = job_runner.submit(request)
    return {"job_id": job_id}


@app.get("/api/runs/{job_id}", response_model=JobStatus)
def get_run_status(job_id: str) -> JobStatus:
    """Poll job progress, status, live convergence, and result."""
    job_status = job_runner.get(job_id)
    if job_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    return job_status


@app.delete("/api/runs/{job_id}", response_model=JobStatus)
def cancel_run(job_id: str) -> JobStatus:
    """Cancel a queued or running job."""
    job_status = job_runner.get(job_id)
    if job_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    cancelled_status = job_runner.cancel(job_id)
    if cancelled_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    return cancelled_status


# --- 2.7 Studies ------------------------------------------------------------
@app.get("/api/studies", response_model=list[StudySummary])
def get_studies_list() -> list[StudySummary]:
    """List summary cards of precomputed quantum studies."""
    return list_studies()


@app.get("/api/studies/{study_id}", response_model=Study)
def get_study_detail(study_id: str) -> Study:
    """Retrieve full data series for a specific study."""
    study = get_study(study_id)
    if study is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Study '{study_id}' not found")
    return study


# --- 2.8 Stress Testing -----------------------------------------------------
app.include_router(stress_router)

