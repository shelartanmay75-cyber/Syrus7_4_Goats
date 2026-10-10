"""Rule-based honesty verdict comparing QAOA and classical solvers."""
from __future__ import annotations

from typing import Any

try:
    from qportfolio.contracts import Landscape, QaoaMetrics, SolverResult, Verdict
except ImportError:
    from dataclasses import dataclass

    @dataclass
    class Verdict:
        level: str
        headline: str
        details: list[str]


# Banned phrases per PS-03 honesty rules (case-insensitive)
BANNED_PHRASES = ("advantage", "outperforms classical", "quantum speedup")


def _assert_no_banned_phrases(text: str) -> None:
    """Ensure no banned advantage phrases appear in verdict text."""
    lower = text.lower()
    for phrase in BANNED_PHRASES:
        if phrase in lower:
            raise ValueError(f"Banned phrase '{phrase}' detected in verdict text: {text}")


def verdict(
    solvers: list[Any], landscape: Any, qaoa: Any | None
) -> Verdict:
    """Generate a rule-based honesty verdict comparing QAOA and classical solvers.

    Levels:
    - 'matched': QAOA best objective equals the exact optimum.
    - 'near': QAOA best objective is within 1% relative gap of the optimum.
    - 'worse': QAOA best objective is worse than 1% relative gap.
    - 'no-feasible': QAOA found no feasible sample.

    Includes:
    - P(opt) vs random-guess comparison.
    - Classical runtime comparison ("no speed benefit is claimed at this size").
    - Size disclaimer (simulated, <= 16 qubits).

    Args:
        solvers: List of SolverResult objects.
        landscape: Feasible Landscape from brute force.
        qaoa: Optional QaoaMetrics object.

    Returns:
        Verdict: Structured verdict with level, headline, and details.
    """
    # 1. Identify solvers
    bf_solver = next((s for s in solvers if getattr(s, "solver", "") == "brute_force"), None)
    qaoa_solver = next(
        (
            s
            for s in solvers
            if getattr(s, "solver", "").startswith("qaoa_") or getattr(s, "kind", "") == "quantum"
        ),
        None,
    )

    bf_runtime = float(bf_solver.runtime_s) if bf_solver and hasattr(bf_solver, "runtime_s") else 0.04
    n_assets = len(landscape.optimum) if hasattr(landscape, "optimum") else 10
    f_opt = float(landscape.f_min) if hasattr(landscape, "f_min") else 0.0

    # 2. Determine verdict level
    is_qaoa_feasible = (
        qaoa is not None
        and getattr(qaoa, "feasible_rate", 0.0) > 1e-12
        and (qaoa_solver is None or getattr(qaoa_solver, "feasible", False))
    )

    if not is_qaoa_feasible:
        level = "no-feasible"
        headline = "QAOA found no feasible portfolio satisfying all constraints."
    else:
        f_qaoa = float(qaoa_solver.objective) if (qaoa_solver and qaoa_solver.objective is not None) else f_opt
        denom = max(abs(f_opt), 1e-12)
        gap = (f_qaoa - f_opt) / denom

        if gap <= 1e-6:
            level = "matched"
            headline = "QAOA matched the exact classical optimum objective."
            # A matched best sample can hide poor sampling; say so rather than let "matched" read as a clean win.
            p_opt, p_rand = getattr(qaoa, "p_opt", None), getattr(qaoa, "p_random", None)
            if p_opt is not None and p_rand is not None and p_opt < p_rand:
                headline = ("QAOA's best sample matched the exact optimum, but it sampled that optimum "
                            "less often than random guessing would on this instance.")
            elif getattr(qaoa, "approx_ratio", 1.0) < 0.5:
                headline = ("QAOA's best sample matched the exact optimum, but most of its samples "
                            "were far from it (approximation ratio below 0.5).")
        elif gap <= 0.01:
            level = "near"
            gap_pct = max(0.0, gap * 100.0)
            headline = f"QAOA found a portfolio within {gap_pct:.1f}% of the exact optimum."
        else:
            level = "worse"
            gap_pct = gap * 100.0
            headline = f"QAOA objective trailed the exact classical optimum by {gap_pct:.1f}%."

    # 3. Construct details lines
    details: list[str] = []

    # Detail 1: P(opt) vs random guess
    if qaoa is not None and hasattr(qaoa, "p_opt") and hasattr(qaoa, "p_random"):
        p_opt_pct = float(qaoa.p_opt) * 100.0
        p_rand_pct = float(qaoa.p_random) * 100.0
        if qaoa.p_random > 1e-12 and qaoa.p_opt > 1e-12:
            multiplier = qaoa.p_opt / qaoa.p_random
            relation = (f"{multiplier:.1f}x more often than" if multiplier >= 1
                        else f"{1 / multiplier:.1f}x less often than")
            d1 = (
                f"It sampled the exact optimum with probability {p_opt_pct:.2f}%, "
                f"{relation} a random guess ({p_rand_pct:.2f}%)."
            )
        else:
            d1 = (
                f"It sampled the exact optimum with probability {p_opt_pct:.2f}%, "
                f"compared to a uniform random guess baseline of {p_rand_pct:.2f}%."
            )
    else:
        d1 = "No QAOA sampling distribution was available for sampling comparison."
    details.append(d1)

    # Detail 2: Runtime comparison
    d2 = f"Brute force solved this {n_assets}-stock instance exactly in {bf_runtime:.2f} s; no speed benefit is claimed at this size."
    details.append(d2)

    # Detail 3: Size disclaimer
    d3 = f"Simulated on {n_assets} variables; this benchmark evaluates small-scale behavior and does not imply scaling to larger instances."
    details.append(d3)

    # Validate against banned phrases
    _assert_no_banned_phrases(headline)
    for line in details:
        _assert_no_banned_phrases(line)

    return Verdict(level=level, headline=headline, details=details)
