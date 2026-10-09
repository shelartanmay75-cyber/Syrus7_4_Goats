import React, { useState, useEffect } from 'react';
import { Optimise } from './pages/Optimise';
import { StressTest } from './pages/StressTest';
import { Report } from './pages/Report';
import { Evidence } from './pages/Evidence';
import { Method } from './pages/Method';
import { GlossaryPage } from './pages/GlossaryPage';
import { GlossaryDrawer } from './components/Glossary';
import { getHealth } from './api/client';
import { RunResult } from './api/types';
import { Landing } from './pages/Landing';
import { Tour } from './components/tour/Tour';
import { TOUR_DONE_KEY } from './components/tour/tourSteps';
import { downloadReportCsv } from './lib/report';

type Tab = 'optimise' | 'stress' | 'report' | 'method' | 'evidence' | 'glossary';

interface NavItem {
  id: Tab;
  label: string;
  sublabel: string;
  icon: (active: boolean) => React.ReactNode;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('optimise');
  const [glossaryDrawerOpen, setGlossaryDrawerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [selectedSolverKey, setSelectedSolverKey] = useState<string>('brute_force');
  const [home, setHome] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  // White theme by default; the choice is remembered in this browser.
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('qp_theme') === 'dark'; } catch { return false; } });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('qp_theme', dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
  }, [dark]);
  // Simple mode hides research-only detail ([data-research]); Research mode shows everything.
  const [research, setResearch] = useState(() => { try { return localStorage.getItem('qp_mode') === 'research'; } catch { return false; } });
  useEffect(() => {
    document.documentElement.classList.toggle('simple', !research);
    try { localStorage.setItem('qp_mode', research ? 'research' : 'simple'); } catch { /* storage blocked */ }
  }, [research]);
  const modeButton = (
    <div role="group" aria-label="Detail level" className="inline-flex border border-accent-blue">
      {([false, true] as const).map((r) => (
        <button key={String(r)} type="button" onClick={() => setResearch(r)} aria-pressed={research === r}
          className={`px-2 py-0.5 text-xs font-mono uppercase ${research === r ? 'bg-accent-blue text-bg' : 'text-accent-blue-hover'}`}>
          {r ? 'Quantum research' : 'Simple'}
        </button>
      ))}
    </div>
  );
  const themeButton = (
    <button type="button" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to white mode' : 'Switch to black mode'} title={dark ? 'White mode' : 'Black mode'}
      className="inline-flex items-center justify-center w-9 h-9 border border-line-strong text-muted hover:text-text">
      {dark ? (
        // Sun: switch to white mode
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
        </svg>
      ) : (
        // Crescent moon: switch to black mode
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );

  // Poll backend health status periodically
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await getHealth();
        if (mounted) setBackendOnline(res.ok);
      } catch {
        if (mounted) setBackendOnline(false);
      }
    };
    check();
    const interval = window.setInterval(check, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const navItems: NavItem[] = [
    {
      id: 'optimise',
      label: 'Optimise',
      sublabel: 'QUBO & Solver Pipeline',
      icon: (active) => (
        <svg
          className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-accent-blue-hover' : 'text-muted'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      )
    },
    {
      id: 'stress',
      label: 'Market Stress Test',
      sublabel: 'Crash Resilience & Shocks',
      icon: (active) => (
        <svg
          className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-accent-blue-hover' : 'text-muted'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      id: 'report',
      label: 'Portfolio Report',
      sublabel: 'Returns, Risk & Backtest',
      icon: (active) => (
        <svg
          className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-accent-blue-hover' : 'text-muted'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      )
    },
    {
      id: 'method',
      label: 'Methodology',
      sublabel: 'QUBO & PS-03 Charter',
      icon: (active) => (
        <svg
          className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-accent-blue-hover' : 'text-muted'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      )
    },
    {
      id: 'evidence',
      label: 'Evidence',
      sublabel: 'Empirical Studies & Runs',
      icon: (active) => (
        <svg
          className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-accent-blue-hover' : 'text-muted'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      )
    },
    {
      id: 'glossary',
      label: 'Glossary',
      sublabel: 'Quantitative Terminology',
      icon: (active) => (
        <svg
          className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-accent-blue-hover' : 'text-muted'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      )
    }
  ];

  const handleTabChange = (tabId: Tab) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  // Leave the landing page for Optimise; the tour opens on request, or on a first visit.
  const start = (tour: boolean) => {
    setHome(false);
    handleTabChange('optimise');
    window.scrollTo({ top: 0 });
    let seen = false;
    try { seen = localStorage.getItem(TOUR_DONE_KEY) === '1'; } catch { /* storage blocked */ }
    if (tour || !seen) setTourOpen(true);
  };

  return (
    <>
    {home && (
      <div className="min-h-screen bg-bg text-text px-4 sm:px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-end gap-2 mb-4">{modeButton}{themeButton}</div>
          <Landing onStart={() => start(false)} onTour={() => start(true)} />
        </div>
      </div>
    )}
    <div hidden={home} className="min-h-screen bg-bg text-text flex selection:bg-text selection:text-bg">
      {/* =========================================================================
          LEFT SIDEBAR (Fixed Desktop, Collapsible Drawer Mobile)
          ========================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-line flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Sidebar Brand Header */}
          <div className="p-5 border-b border-line flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Quantum Glyph Icon */}
              <div className="w-8 h-8 bg-surface-elevated border border-line-strong flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5 text-text"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="3" fill="var(--c-fg)" />
                  <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)" stroke="var(--c-muted3)" />
                  <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)" stroke="var(--c-muted3)" />
                </svg>
              </div>

              <div>
                <h1 className="text-lg leading-none font-medium tracking-wider text-text uppercase">
                  Portfolio-Pulse
                </h1>
                <div className="flex items-center space-x-1.5 mt-1">
                  <span className="label text-[13px] text-muted tracking-widest">
                    Quantum Portfolio · PS-03
                  </span>
                </div>
              </div>
            </div>

            {/* Close Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-muted hover:text-text p-1"
              aria-label="Close navigation"
            >
              ✕
            </button>
          </div>

          {/* Navigation Section */}
          <div className="p-3">
            <div className="label px-3 py-2 text-[13px] text-faint tracking-widest">
              Navigation
            </div>
            <nav className="space-y-1" aria-label="Main Navigation">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabChange(item.id)}
                    data-tour={item.id === 'evidence' ? 'evidence-tab' : undefined}
                    data-research={item.id === 'method' ? true : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full text-left px-3.5 py-3 transition-all flex items-center space-x-3 border-l-2 focus-visible:outline-white ${
                      isActive
                        ? 'border-accent-blue bg-accent-blue-subtle text-white font-medium'
                        : 'border-transparent text-muted hover:text-text hover:bg-surface-elevated'
                    }`}
                  >
                    {item.icon(isActive)}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-wider leading-none">
                        {item.label}
                      </div>
                      <div data-research className="text-[13px] text-faint truncate mt-1">
                        {item.sublabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Drawer Action */}
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={() => setGlossaryDrawerOpen(true)}
              className="w-full text-left px-3.5 py-2.5 text-xs text-muted hover:text-text bg-surface-card border border-line hover:border-line-strong transition-colors flex items-center justify-between"
              title="Open quick glossary drawer without changing view"
            >
              <span className="flex items-center space-x-2">
                <span className="text-[14px]">Quick Reference</span>
              </span>
              <span className="text-[13px] font-mono text-faint">DRAWER →</span>
            </button>
          </div>
        </div>

        {/* Sidebar Status Footer */}
        <div data-research className="p-4 border-t border-line bg-surface-card space-y-3">
          {/* Backend Status Dot */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted text-[14px] flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendOnline === true
                    ? 'bg-gain animate-pulse'
                    : backendOnline === false
                    ? 'bg-loss'
                    : 'bg-muted'
                }`}
              ></span>
              <span className="font-mono text-[13px]">
                {backendOnline === true
                  ? 'API ONLINE (8000)'
                  : backendOnline === false
                  ? 'API OFFLINE'
                  : 'CONNECTING...'}
              </span>
            </span>
            <span className="text-[13px] font-mono text-faint">Portfolio-Pulse v0.1.0</span>
          </div>

          <div className="text-[13px] text-muted space-y-0.5 pt-2 border-t border-line/40">
            <div>Qiskit 2.5 · Aer Simulator</div>
            <div>NIFTY 50 (Cached 2026-10-07)</div>
            <div className="text-faint">Team 4 GOATS · Fall Fest 2026</div>
          </div>
        </div>
      </aside>

      {/* Backdrop for Mobile Sidebar */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/80 md:hidden backdrop-blur-xs"
        />
      )}

      {/* =========================================================================
          MAIN WORKSPACE
          ========================================================================= */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Top Terminal Status Header Bar */}
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-line px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Hamburger Button (Mobile) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 text-muted hover:text-text border border-line"
              aria-label="Open sidebar navigation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Breadcrumb / Title */}
            <div className="flex items-baseline space-x-2 truncate">
              <span className="label text-[14px] text-muted hidden sm:inline">PORTFOLIO-PULSE //</span>
              <span className="text-sm font-medium tracking-wider text-text uppercase">
                {activeTab === 'optimise' && 'Portfolio Optimisation & Solvers'}
                {activeTab === 'stress' && 'Market Crash Stress Testing & Resilience'}
                {activeTab === 'report' && 'Portfolio Report'}
                {activeTab === 'method' && 'Methodology & QUBO Specification'}
                {activeTab === 'evidence' && 'Empirical Quantum Benchmarks'}
                {activeTab === 'glossary' && 'Quantum & Quantitative Lexicon'}
              </span>
            </div>
          </div>

          {/* Right Status Tags */}
          <div className="flex items-center space-x-2 shrink-0">
            <button type="button" onClick={() => { setHome(true); window.scrollTo({ top: 0 }); }} className="inline-flex items-center px-2 py-0.5 border border-line-strong text-[13px] font-mono uppercase text-muted hover:text-text">
              Home
            </button>
            <button type="button" onClick={() => start(true)} className="inline-flex items-center px-2 py-0.5 border border-line-strong text-[13px] font-mono uppercase text-muted hover:text-text">
              Tour
            </button>
            {runResult && (
              <button type="button" onClick={() => downloadReportCsv(runResult)} title="Download the full report for the latest run"
                className="inline-flex items-center px-2 py-0.5 border border-accent-blue text-[13px] font-mono uppercase text-accent-blue-hover hover:opacity-80">
                Download CSV
              </button>
            )}
            {modeButton}
            {themeButton}
            <span data-research className="hidden sm:inline-flex items-center px-2 py-0.5 bg-surface text-muted border border-line text-[13px] font-mono">
              UNIVERSE: NIFTY 50
            </span>
            <span data-research className="hidden md:inline-flex items-center px-2 py-0.5 bg-surface text-muted border border-line text-[13px] font-mono">
              QUBITS: MAX 16
            </span>
            <span data-research className="inline-flex items-center px-2 py-0.5 bg-surface-elevated text-text border border-line-strong text-[13px] font-mono">
              RF: 5.57%
            </span>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Kept mounted so running jobs and results survive navigation */}
          <div hidden={activeTab !== 'optimise'}>
            <Optimise
              runResult={runResult}
              onRunResultChange={setRunResult}
              onSelectSolverChange={setSelectedSolverKey}
              onNavigateToStress={() => handleTabChange('stress')}
            />
          </div>
          <div hidden={activeTab !== 'stress'}>
            <StressTest
              runResult={runResult}
              initialSolverKey={selectedSolverKey}
              onNavigateToOptimise={() => handleTabChange('optimise')}
            />
          </div>
          <div hidden={activeTab !== 'report'}>
            <Report runResult={runResult} onNavigateToOptimise={() => handleTabChange('optimise')} />
          </div>
          {activeTab === 'method' && <Method />}
          {activeTab === 'evidence' && <Evidence />}
          {activeTab === 'glossary' && <GlossaryPage />}
        </main>

        {/* Footer */}
        <footer className="border-t border-line py-6 px-4 sm:px-8 text-center mt-12 space-y-2 bg-surface/50">
          <p className="label text-[14px]">
            Portfolio-Pulse · Qiskit Fall Fest 2026 · Team 4 GOATS · Qiskit 2.5 V2 Primitives &amp; Aer Simulator
          </p>
          <p className="label text-[13px] text-muted">
            Data: Yahoo Finance via yfinance (adjusted close), cached snapshot (2023-09-01 to 2026-10-07)
          </p>
          <p className="text-[14px] text-faint">
            Educational tool, not investment advice. Past performance does not guarantee future returns.
          </p>
        </footer>
      </div>

      {/* Quick Quantum Glossary Drawer */}
      <GlossaryDrawer
        isOpen={glossaryDrawerOpen}
        onClose={() => setGlossaryDrawerOpen(false)}
      />
    </div>
    <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
    </>
  );
};

export default App;
