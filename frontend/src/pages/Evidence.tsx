import React, { useState, useEffect } from 'react';
import { StudySummary, Study } from '../api/types';
import { listStudies, getStudy } from '../api/client';
import { StudyChart } from '../components/StudyChart';

export const Evidence: React.FC = () => {
  const [studiesIndex, setStudiesIndex] = useState<StudySummary[]>([]);
  const [activeStudyId, setActiveStudyId] = useState<string>('');
  const [currentStudy, setCurrentStudy] = useState<Study | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studyReload, setStudyReload] = useState(0); // bump to re-fetch the open study

  const fetchStudiesIndex = () => {
    setLoadingList(true);
    setListError(null);
    listStudies()
      .then(res => {
        setStudiesIndex(res);
        if (res.length > 0) setActiveStudyId(res[0].id);
      })
      .catch(err => {
        setListError(err.message || 'Unable to load benchmark study index from backend.');
      })
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    fetchStudiesIndex();
  }, []);

  useEffect(() => {
    if (!activeStudyId) return;
    let stale = false; // a slow reply for a study the user already left is ignored
    setLoadingStudy(true);
    setStudyError(null);
    getStudy(activeStudyId)
      .then(res => { if (!stale) setCurrentStudy(res); })
      .catch(err => {
        if (!stale) setStudyError(err.message || `Unable to load study data for ${activeStudyId}.`);
      })
      .finally(() => { if (!stale) setLoadingStudy(false); });
    return () => { stale = true; };
  }, [activeStudyId, studyReload]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-surface border border-line p-6">
        <h1 className="text-xl font-medium text-text mb-2 flex items-center gap-2">
          Portfolio-Pulse — Empirical Quantum Evidence &amp; Benchmark Studies
        </h1>
        <p className="text-xs text-muted leading-relaxed">
          Systematic benchmark study runs evaluating QAOA circuit depth (p), classical optimizer convergence, parameter initialization (warm-start interp), XY ring mixers, physical hardware noise simulation, and the classical baselines solving the same problems.
        </p>
      </div>

      {loadingList ? (
        <div className="p-8 text-center text-xs text-muted bg-surface border border-line">
          Loading evidence study index...
        </div>
      ) : listError ? (
        <div className="bg-surface border border-line-strong p-6 text-center space-y-3">
          <h2 className="text-sm font-medium text-text">⚠ Unable to Load Benchmark Studies</h2>
          <p className="text-xs text-text max-w-md mx-auto">{listError}</p>
          <button
            type="button"
            onClick={fetchStudiesIndex}
            className="px-5 py-2.5 min-h-[44px] bg-text text-bg font-medium text-xs hover:bg-muted transition-all"
          >
            Retry Loading Studies
          </button>
        </div>
      ) : studiesIndex.length === 0 ? (
        <div className="bg-surface border border-line p-8 text-center space-y-2">
          <h2 className="text-sm font-medium text-text">No Studies Available Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto">
            Benchmark studies are generated offline by <code className="text-text">scripts/run_studies.py</code>. Run it, then reload this page.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Study Selector Tabs */}
          <div className="flex bg-surface p-1.5 border border-line overflow-x-auto gap-1">
            {studiesIndex.map(s => {
              const isSelected = activeStudyId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveStudyId(s.id)}
                  className={`px-4 py-2 min-h-[44px] text-xs font-medium whitespace-nowrap transition-all flex items-center justify-center border ${
                    isSelected
                      ? 'bg-surface-elevated text-white border-accent-blue/60 shadow-xs'
                      : 'border-transparent text-muted hover:text-text hover:bg-surface-elevated'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    {isSelected && <span className="w-1.5 h-1.5 bg-accent-blue shrink-0"></span>}
                    <span>{s.title}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Study View */}
          {loadingStudy ? (
            <div className="p-12 text-center text-xs text-muted bg-surface border border-line space-y-3">
              <p>Loading study dataset...</p>
            </div>
          ) : studyError ? (
            <div className="bg-surface border border-line-strong p-6 text-center space-y-3">
              <h3 className="text-xs font-medium text-text">⚠ Study Unavailable</h3>
              <p className="text-xs text-text break-words">{studyError}</p>
              <button
                type="button"
                onClick={() => setStudyReload(n => n + 1)}
                className="px-5 py-2.5 min-h-[44px] bg-text text-bg font-medium text-xs hover:bg-muted transition-all"
              >
                Retry
              </button>
            </div>
          ) : currentStudy ? (
            <StudyChart study={currentStudy} />
          ) : (
            <div className="p-8 text-center text-xs text-muted bg-surface border border-line">
              Select a study from above to view empirical plots.
            </div>
          )}
        </div>
      )}

      {/* How each method works */}
      <section className="bg-surface border border-line p-6 space-y-4" aria-labelledby="methods-guide">
        <div>
          <h2 id="methods-guide" className="text-sm font-medium text-text">How each method works</h2>
          <p className="text-xs text-muted mt-1">Every method gets the same stocks, estimates and rules, and every answer is judged by the same function. Only the way of searching differs.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {METHODS.map((m) => (
            <div key={m.name} className="bg-bg border border-line p-4 space-y-2">
              <h3 className="text-xs font-medium text-text">{m.name}</h3>
              <p className="text-xs text-muted"><span className="text-text">What it does:</span> {m.does}</p>
              <p className="text-xs text-muted"><span className="text-text">Guarantee:</span> {m.guarantee}</p>
              <p className="text-xs text-muted"><span className="text-text">Cost:</span> {m.cost}</p>
              <p className="text-xs text-muted"><span className="text-text">Role here:</span> {m.role}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          On the 5 test problems in the "Classical baselines vs QAOA" study (10 stocks, pick 5: 252 possible portfolios), all four methods found the exact optimum; brute force took about 0.005 s and QAOA about 4.6 s on a simulator. At this size the problem is easy for every method, so the study shows that QAOA works, not that it is faster or better.
        </p>
      </section>
    </div>
  );
};

const METHODS = [
  {
    name: 'Markowitz mean-variance model (the problem itself)',
    does: 'Scores a portfolio by its risk (variance from the covariance matrix) against its expected return. The efficient frontier is the set of portfolios with the best return for each level of risk.',
    guarantee: 'Not a solver: it defines what "best" means. The frontier chart places the answer from each method against the best possible trade-offs.',
    cost: 'Needs estimates of return and covariance from past prices; those estimates are the weakest link.',
    role: 'Every method below minimises the same objective: risk aversion × variance − (1 − risk aversion) × (return − trading cost).',
  },
  {
    name: 'Brute force (exact)',
    does: 'Checks every possible portfolio of exactly K stocks and keeps the best one that obeys every rule.',
    guarantee: 'Always finds the true optimum.',
    cost: 'Grows explosively: 252 portfolios for 5 of 10 stocks, but about 10 billion for 10 of 50.',
    role: 'The ground truth: QAOA and the other methods are scored against it.',
  },
  {
    name: 'Relaxation + rounding',
    does: 'Pretends each yes/no choice can be a fraction, solves that smooth convex problem quickly (CVXPY), then rounds to the top K stocks.',
    guarantee: 'None after rounding: the rounded portfolio can miss the optimum or break a rule.',
    cost: 'Very fast, and scales to large universes.',
    role: 'The standard classical shortcut a practitioner would try first.',
  },
  {
    name: 'Simulated annealing',
    does: 'Starts from a random portfolio and keeps flipping stocks in and out, accepting worse moves early on (like cooling metal) so it can escape poor local choices.',
    guarantee: 'None, but it usually finds very good answers with enough sweeps.',
    cost: 'Fast; works on the same QUBO the quantum circuit uses.',
    role: 'A heuristic on the identical QUBO, so the fairest classical comparison for QAOA.',
  },
  {
    name: 'QAOA (quantum)',
    does: 'Encodes the QUBO in a quantum circuit, tunes its angles with a classical optimiser, then samples portfolios; the best valid sample is the answer.',
    guarantee: 'None; more depth can help, and hardware noise hurts (see the noise study).',
    cost: 'Slow on a simulator, and limited by qubit count and noise on real devices.',
    role: 'The method under test, compared honestly against the three above.',
  },
];
