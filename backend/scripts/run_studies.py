"""Evidence studies (U14): depth, optimiser, init, mixer and noise, written as Study JSON (CONTRACTS.md 2.7).

    uv run python scripts/run_studies.py [--quick] [--out DIR] [--only depth,optimizer,...] [--force]

Each study is written as soon as it finishes and skipped if its file already exists (--force overwrites), so a long
run can be resumed. --quick (2 instances, p <= 2, maxiter 20) requires --out so it cannot overwrite committed results.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from qportfolio.classical.brute_force import brute_force  # noqa: E402
from qportfolio.contracts import QaoaSettings, Study  # noqa: E402
from qportfolio.data import build_market  # noqa: E402
from qportfolio.problem import Problem  # noqa: E402
from qportfolio.quantum.qaoa import qaoa_solve  # noqa: E402
from qportfolio.qubo.builder import build_qubo  # noqa: E402

N_ASSETS, K, Q, SHOTS = 10, 5, 0.5, 4096
VARIANTS = {"standard": "Standard mixer", "xy": "XY mixer + Dicke"}
OPTIMIZERS = {"COBYLA": "COBYLA", "SPSA": "SPSA", "NELDER_MEAD": "Nelder-Mead"}
INITS = {"random": "Random init", "ramp": "Ramp init", "interp": "INTERP warm start"}
NOISELESS = "Noiseless statevector simulation."
NOISY = "FakeGuadalupeV2 noise model, sample-only (parameters optimised noiselessly)"


def make_instances(n: int):
    """n fixed-seed instances: seed s draws N_ASSETS tickers from the estimation-window market (snapshot, no network)."""
    prices = pd.read_parquet(BACKEND / "data" / "snapshot" / "prices.parquet")
    market = build_market(prices_df=prices, source="snapshot")
    insts = []
    for seed in range(1, n + 1):
        picks = sorted(np.random.default_rng(seed).choice(len(market.tickers), N_ASSETS, replace=False))
        sub = market.subset([market.tickers[i] for i in picks])
        problem = Problem(sub.tickers, sub.sectors, sub.mu, sub.sigma, K, Q, np.zeros(N_ASSETS), 0.0, None, None)
        insts.append((seed, problem, build_qubo(problem), brute_force(problem)[1]))
    return insts, market.windows


def solve(ctx, insts=None, **kw) -> list[dict]:
    """One qaoa block per instance (metrics against that instance's brute-force landscape)."""
    return [qaoa_solve(problem, qubo, QaoaSettings(seed=seed, shots=SHOTS, maxiter=ctx.maxiter, **kw), landscape=ls)[1]
            for seed, problem, qubo, ls in insts or ctx.insts]


def point(x: float, values) -> dict:
    """Mean over instances with the sample standard deviation as yerr (0 for a single instance)."""
    v = np.asarray(values, dtype=float)
    return {"x": x, "y": float(v.mean()), "yerr": float(v.std(ddof=1)) if len(v) > 1 else 0.0}


def err(blocks: list[dict]) -> list[float]:
    return [1 - b["metrics"]["approx_ratio"] for b in blocks]


def depth(ctx):
    series, notes = [], [NOISELESS, f"Depth p = 1..{ctx.pmax}."]
    for variant, label in VARIANTS.items():
        points, p_opt = [], []
        for p in range(1, ctx.pmax + 1):
            blocks = solve(ctx, variant=variant, reps=p)
            points.append(point(p, err(blocks)))
            p_opt.append(np.mean([b["metrics"]["p_opt"] for b in blocks]))
        series.append({"label": label, "points": points})
        notes.append(f"Mean P(opt) for p = 1..{ctx.pmax}, {label}: " + ", ".join(f"{v:.4f}" for v in p_opt))
    return ("Effect of circuit depth", f"{ctx.base(len(ctx.insts))} COBYLA, ramp init.", "QAOA depth p",
            "1 - approximation ratio", series, notes)


def optimizer(ctx):
    series = [{"label": label, "points": [point(i, err(solve(ctx, reps=ctx.p_mid, optimizer=name)))]}
              for i, (name, label) in enumerate(OPTIMIZERS.items())]
    axis = ", ".join(f"{i} = {label}" for i, label in enumerate(OPTIMIZERS.values()))
    return ("Classical optimiser", f"{ctx.base(len(ctx.insts))} Standard mixer, p = {ctx.p_mid}, ramp init.",
            f"Optimiser ({axis})", "1 - approximation ratio", series, [NOISELESS])


def init(ctx):
    series = [{"label": label, "points": [point(i, err(solve(ctx, reps=ctx.p_mid, init=name)))]}
              for i, (name, label) in enumerate(INITS.items())]
    axis = ", ".join(f"{i} = {label}" for i, label in enumerate(INITS.values()))
    notes = [NOISELESS, "INTERP is the declared warm start: optimise at p = 1 from the ramp, then extend one depth at a "
             "time by interpolating the parameters; the evaluation budget is split equally across depths."]
    return ("Parameter initialisation", f"{ctx.base(len(ctx.insts))} Standard mixer, p = {ctx.p_mid}, COBYLA.",
            f"Initialisation ({axis})", "1 - approximation ratio", series, notes)


def mixer(ctx):
    series = []
    for i, (variant, label) in enumerate(VARIANTS.items()):
        metrics = [b["metrics"] for b in solve(ctx, variant=variant, reps=ctx.p_mid)]
        for name, key in (("feasible rate", "feasible_rate"), ("P(opt)", "p_opt")):
            series.append({"label": f"{label}: {name}", "points": [point(i, [m[key] for m in metrics])]})
    axis = ", ".join(f"{i} = {label}" for i, label in enumerate(VARIANTS.values()))
    return ("Mixer choice", f"{ctx.base(len(ctx.insts))} p = {ctx.p_mid}, COBYLA, ramp init "
            f"(p = {ctx.p_mid} declared for every mixer).", f"Mixer ({axis})", "Probability", series, [NOISELESS])


def noise(ctx):
    depth_study = json.loads((ctx.out / "depth.json").read_text(encoding="utf-8"))
    at_p2 = {s["label"]: next(pt["y"] for pt in s["points"] if pt["x"] == 2) for s in depth_study["series"]}
    best = min(VARIANTS, key=lambda v: at_p2[VARIANTS[v]])  # lowest 1 - r at p = 2
    blocks = solve(ctx, ctx.noise_insts, variant=best, reps=2, noise=True)
    series = [{"label": label, "points": [point(i, [b["noise"][side][key] for b in blocks])
                                          for i, side in enumerate(("ideal", "noisy"))]}
              for label, key in (("Approximation ratio", "approx_ratio"), ("P(opt)", "p_opt"),
                                 ("Feasible rate", "feasible_rate"))]
    notes = [NOISY, f"Best mixer from the depth study at p = 2 (lowest 1 - r): {VARIANTS[best]}."]
    return ("Effect of hardware noise", f"{ctx.base(len(ctx.noise_insts))} {VARIANTS[best]}, p = 2, COBYLA, ramp init; "
            "the same optimised parameters sampled ideally and under noise.", "Sampling (0 = ideal, 1 = noisy)",
            "Metric value", series, notes)


STUDIES = {"depth": depth, "optimizer": optimizer, "init": init, "mixer": mixer, "noise": noise}


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--quick", action="store_true", help="2 instances, p <= 2, maxiter 20 (requires --out)")
    ap.add_argument("--out", type=Path, help="output directory (default backend/data/studies)")
    ap.add_argument("--only", help=f"comma-separated subset of {','.join(STUDIES)}")
    ap.add_argument("--force", action="store_true", help="overwrite studies that already exist")
    ap.add_argument("--instances", type=int, help="number of instances (default 10; quick 2)")
    ap.add_argument("--maxiter", type=int, help="optimiser evaluation budget (default 150; quick 20)")
    ap.add_argument("--pmax", type=int, help="deepest p in the depth study (default 5; quick 2)")
    ap.add_argument("--noise-instances", type=int, help="noise study uses the first N instances (default all)")
    args = ap.parse_args(argv)
    if args.quick and args.out is None:
        ap.error("--quick requires --out so it cannot overwrite the committed studies")
    names = args.only.split(",") if args.only else list(STUDIES)
    if unknown := [n for n in names if n not in STUDIES]:
        ap.error(f"unknown study {unknown}; choose from {','.join(STUDIES)}")

    out = args.out or BACKEND / "data" / "studies"
    insts, w = make_instances(args.instances or (2 if args.quick else 10))
    ctx = SimpleNamespace(insts=insts, out=out, maxiter=args.maxiter or (20 if args.quick else 150),
                          pmax=args.pmax or (2 if args.quick else 5))
    ctx.p_mid = min(3, ctx.pmax)
    ctx.noise_insts = insts[:args.noise_instances or len(insts)]
    window = f"{w.est_start}..{w.est_end}"
    ctx.base = lambda n: (f"Mean over {n} fixed-seed {N_ASSETS}-asset, K={K}, q={Q} instances (no sector cap or target, "
                          f"zero costs), est window {window}.")

    for name in names:
        path = out / f"{name}.json"
        if path.exists() and not args.force:
            print(f"[skip] {name}: {path} exists", flush=True)
            continue
        print(f"[run ] {name}", flush=True)
        t0 = time.perf_counter()
        title, description, x_label, y_label, series, notes = STUDIES[name](ctx)
        wall = time.perf_counter() - t0
        seeds = [s for s, *_ in (ctx.noise_insts if name == "noise" else insts)]
        notes += [f"Synthetic subset of NIFTY 50 tickers; estimation window {window}",
                  f"{len(seeds)} instance(s) with seeds {seeds}, QAOA seed = instance seed, maxiter {ctx.maxiter}, "
                  f"{SHOTS} shots; yerr is the sample standard deviation over instances."]
        study = Study(id=name, title=title, description=description, x_label=x_label, y_label=y_label, series=series,
                      instance={"n_assets": N_ASSETS, "k": K, "q": Q, "seeds": seeds, "shots": SHOTS,
                                "maxiter": ctx.maxiter}, notes=notes,
                      generated_at=date.today().isoformat(), wall_time_s=round(wall, 1))
        out.mkdir(parents=True, exist_ok=True)  # created only once a study has finished, not before the long run
        path.write_text(study.model_dump_json(indent=1), encoding="utf-8")
        print(f"[done] {name}: {wall:.1f}s -> {path}", flush=True)


if __name__ == "__main__":
    main()
