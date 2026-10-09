"""Tests for the HTTP API, Job Runner, and Studies service (Unit U11).

Scenarios:
1. GET /api/health returns ok and version.
2. GET /api/universe returns 50 assets with sectors, provenance, and exclusion reasons.
3. POST /api/screen with 30 tickers returns kept + dropped = 30.
4. POST /api/runs returns job_id; polling reaches done with a validating RunResult (stub pipeline).
5. DELETE /api/runs/{id} while running moves state to cancelled within 2 s.
6. A pipeline exception gives state=error and an error string with no traceback.
7. Unknown job id returns 404 for GET and DELETE.
8. GET /api/studies and GET /api/studies/{id} with empty dir and populated dir; unknown id returns 404.
9. Invalid RunRequest input returns 422 with a clean detail message.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from qportfolio.api.jobs import JobRunner
from qportfolio.api.main import app
from qportfolio.contracts import RunResult, Universe
from qportfolio.data import load_universe
from qportfolio.pipeline import Cancelled

client = TestClient(app)

EXAMPLE_DIR = Path(__file__).resolve().parents[1] / "contracts" / "api-examples"
if not EXAMPLE_DIR.exists():
    # If resolved from workspace root
    EXAMPLE_DIR = Path(__file__).resolve().parents[2] / "contracts" / "api-examples"


def test_health():
    """GET /api/health returns ok: true and version: 0.1.0."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "version": "0.1.0"}


def test_universe():
    """GET /api/universe returns 50 assets with sectors, source, and as_of."""
    response = client.get("/api/universe")
    assert response.status_code == 200
    data = response.json()

    # Validate schema via Pydantic model
    univ = Universe.model_validate(data)
    assert univ.source in ("cache", "snapshot", "live")
    assert len(univ.as_of) > 0
    assert len(univ.assets) == 50

    # Ensure every asset has non-empty sector
    for asset in univ.assets:
        assert asset.ticker.endswith(".NS")
        assert len(asset.sector) > 0

    # TMPV.NS should be flagged with an excluded_reason
    tmpv = next((a for a in univ.assets if a.ticker == "TMPV.NS"), None)
    assert tmpv is not None
    assert tmpv.excluded_reason is not None
    assert "Demerger" in tmpv.excluded_reason


def test_screen_thirty_tickers():
    """POST /api/screen with 30 tickers returns kept + dropped totaling 30."""
    all_assets = load_universe()
    thirty_tickers = [a.ticker for a in all_assets[:30]]

    payload = {
        "tickers": thirty_tickers,
        "k": 5,
        "qubit_cap": 16,
    }
    response = client.post("/api/screen", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "kept" in data
    assert "dropped" in data
    assert "qubits" in data
    assert len(data["kept"]) + len(data["dropped"]) == 30
    assert data["qubits"]["total"] <= 16


def test_runs_lifecycle_done():
    """POST /api/runs returns job_id; polling reaches done with a valid RunResult."""
    payload = {
        "k": 5,
        "risk_aversion": 0.5,
        "capital": 1000000,
    }
    response = client.post("/api/runs", json=payload)
    assert response.status_code == 202
    body = response.json()
    assert "job_id" in body
    job_id = body["job_id"]

    # Poll until done (timeout 20s)
    start_t = time.time()
    final_data = None
    while time.time() - start_t < 20.0:
        get_res = client.get(f"/api/runs/{job_id}")
        assert get_res.status_code == 200
        status_data = get_res.json()
        if status_data["state"] == "done":
            final_data = status_data
            break
        time.sleep(0.05)

    assert final_data is not None, "Job did not complete within timeout"
    assert final_data["state"] == "done"
    assert final_data["progress"] == 1.0
    assert final_data["result"] is not None
    # Validate result schema against contracts
    RunResult.model_validate(final_data["result"])


def test_runs_cancel_within_two_seconds(monkeypatch):
    """DELETE /api/runs/{id} while running moves state to cancelled within 2 s."""
    # Slow fake pipeline that sleeps and checks cancel
    def slow_fake(request, on_progress=None, cancel=None):
        for i in range(100):
            if cancel is not None and cancel.is_set():
                raise Cancelled()
            if on_progress:
                on_progress(i / 100.0, f"Simulating step {i}", {"iter": i, "energy": -0.01})
            time.sleep(0.05)
        return None

    # Patch the worker function on the global job_runner
    runner = JobRunner(max_workers=1, run_fn=slow_fake)
    monkeypatch.setattr("qportfolio.api.main.job_runner", runner)

    # Start run
    res = client.post("/api/runs", json={"k": 5})
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    # Wait until it is running
    t0 = time.time()
    while time.time() - t0 < 2.0:
        status_res = client.get(f"/api/runs/{job_id}")
        if status_res.json()["state"] == "running":
            break
        time.sleep(0.02)

    # Cancel the job
    cancel_start = time.time()
    del_res = client.delete(f"/api/runs/{job_id}")
    assert del_res.status_code == 200
    assert del_res.json()["state"] == "cancelled"

    # Verify polling reflects cancelled within 2s
    cancelled = False
    while time.time() - cancel_start < 2.0:
        get_res = client.get(f"/api/runs/{job_id}")
        if get_res.json()["state"] == "cancelled":
            cancelled = True
            break
        time.sleep(0.02)

    assert cancelled, "Job was not cancelled within 2 seconds"
    assert get_res.json()["result"] is None


def test_runs_pipeline_exception_handling(monkeypatch):
    """A pipeline exception gives state=error with no traceback or paths in the message."""
    def failing_fake(request, on_progress=None, cancel=None):
        raise ValueError("Invalid covariance matrix: missing price history for selected tickers")

    runner = JobRunner(max_workers=1, run_fn=failing_fake)
    monkeypatch.setattr("qportfolio.api.main.job_runner", runner)

    res = client.post("/api/runs", json={"k": 5})
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    # Poll until error
    t0 = time.time()
    error_data = None
    while time.time() - t0 < 3.0:
        status_res = client.get(f"/api/runs/{job_id}")
        if status_res.json()["state"] == "error":
            error_data = status_res.json()
            break
        time.sleep(0.05)

    assert error_data is not None, "Job did not enter error state"
    assert error_data["state"] == "error"
    assert error_data["result"] is None
    error_msg = error_data["error"]
    assert "Invalid covariance matrix" in error_msg
    # Ensure no traceback or internal paths leaked
    assert "Traceback" not in error_msg
    assert "File \"" not in error_msg
    assert "line " not in error_msg.lower()


def test_unknown_job_id_returns_404():
    """Unknown job id returns 404 for GET and DELETE."""
    get_res = client.get("/api/runs/nonexistent_id")
    assert get_res.status_code == 404
    assert "detail" in get_res.json()
    assert "nonexistent_id" in get_res.json()["detail"]

    del_res = client.delete("/api/runs/nonexistent_id")
    assert del_res.status_code == 404
    assert "detail" in del_res.json()


def test_studies_endpoints(tmp_path, monkeypatch):
    """GET /api/studies and GET /api/studies/{id} behavior with empty and populated directories."""
    # 1. Empty dir
    monkeypatch.setattr("qportfolio.api.studies._DEFAULT_STUDIES_DIR", tmp_path / "empty_studies")
    res = client.get("/api/studies")
    assert res.status_code == 200
    assert res.json() == []

    # 404 for non-existent study
    res_404 = client.get("/api/studies/unknown_study")
    assert res_404.status_code == 404
    assert "detail" in res_404.json()

    # 2. Populated dir with study_depth.json
    studies_dir = tmp_path / "studies"
    studies_dir.mkdir(parents=True, exist_ok=True)
    depth_src = EXAMPLE_DIR / "study_depth.json"
    assert depth_src.exists(), f"Expected fixture at {depth_src}"
    shutil.copy(depth_src, studies_dir / "depth.json")

    monkeypatch.setattr("qportfolio.api.studies._DEFAULT_STUDIES_DIR", studies_dir)

    # GET /api/studies
    res_list = client.get("/api/studies")
    assert res_list.status_code == 200
    summaries = res_list.json()
    assert len(summaries) == 1
    assert summaries[0]["id"] == "depth"
    assert summaries[0]["title"] == "Effect of circuit depth"
    assert "summary" in summaries[0]

    # GET /api/studies/depth
    res_detail = client.get("/api/studies/depth")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["id"] == "depth"
    assert "series" in detail
    assert len(detail["series"]) == 2
    assert detail["series"][0]["label"] == "Standard mixer"


def test_validation_error_returns_clean_422():
    """Invalid parameters return 422 with a clean error detail message."""
    # k must be between 2 and 15
    payload = {"k": 99}
    res = client.post("/api/runs", json=payload)
    assert res.status_code == 422
    assert "detail" in res.json()
    assert isinstance(res.json()["detail"], str)


def test_ae6_universe_offline(monkeypatch):
    """AE6: With network offline (yf.download failing), /api/universe reports source: snapshot and as_of."""
    def fake_download(*args, **kwargs):
        raise RuntimeError("No internet connection")

    monkeypatch.setattr("yfinance.download", fake_download)

    res = client.get("/api/universe")
    assert res.status_code == 200
    data = res.json()
    assert data["source"] == "snapshot"
    assert data["as_of"] == "2026-10-07"
    assert len(data["assets"]) == 50


def test_offline_run_twice_in_a_row(monkeypatch):
    """AE6: The default run reaches done offline, twice in a row without a restart."""
    def fake_download(*args, **kwargs):
        raise RuntimeError("No internet connection")

    monkeypatch.setattr("yfinance.download", fake_download)

    payload = {
        "k": 3,
        "qubit_cap": 8,
        "qaoa": {"reps": 1, "maxiter": 10, "shots": 256},
    }

    # Run 1
    res1 = client.post("/api/runs", json=payload)
    assert res1.status_code == 202
    job_id1 = res1.json()["job_id"]

    start_t = time.time()
    final1 = None
    while time.time() - start_t < 15.0:
        s = client.get(f"/api/runs/{job_id1}").json()
        if s["state"] == "done":
            final1 = s
            break
        time.sleep(0.05)

    assert final1 is not None and final1["state"] == "done"
    assert final1["result"]["data"]["source"] == "snapshot"

    # Run 2 (immediately after, without restarting server)
    res2 = client.post("/api/runs", json=payload)
    assert res2.status_code == 202
    job_id2 = res2.json()["job_id"]

    start_t = time.time()
    final2 = None
    while time.time() - start_t < 15.0:
        s = client.get(f"/api/runs/{job_id2}").json()
        if s["state"] == "done":
            final2 = s
            break
        time.sleep(0.05)

    assert final2 is not None and final2["state"] == "done"
    assert final2["result"]["data"]["source"] == "snapshot"


def test_startup_with_no_cache_directory(tmp_path, monkeypatch):
    """Startup with no cache directory present works properly."""
    nonexistent_cache = tmp_path / "cache_missing"
    monkeypatch.setattr("qportfolio.data.prices._CACHE_DIR", nonexistent_cache)
    monkeypatch.setattr("qportfolio.data.prices._CACHE_FILE", nonexistent_cache / "prices.parquet")
    assert not nonexistent_cache.exists()

    # Universe call works
    u_res = client.get("/api/universe")
    assert u_res.status_code == 200
    assert u_res.json()["source"] == "snapshot"

    # Screen call works
    s_res = client.post("/api/screen", json={"k": 5})
    assert s_res.status_code == 200
    assert "kept" in s_res.json()

    # Health call works
    h_res = client.get("/api/health")
    assert h_res.status_code == 200

