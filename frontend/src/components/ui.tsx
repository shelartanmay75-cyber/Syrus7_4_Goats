// Shared UI primitives for the redesign: monochrome, square corners, accessible.
import type { ReactNode } from 'react';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.08em] text-accent-blue-hover">{children}</p>;
}

/** A page section: mono eyebrow, condensed title, optional lead line. */
export function Section({ id, eyebrow, title, lead, children }: {
  id?: string; eyebrow?: string; title: string; lead?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="border-t border-dotted border-line-strong pt-6 mt-10 first:mt-0 first:border-0 first:pt-0">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id ? `${id}-title` : undefined} className="font-display text-2xl uppercase font-medium leading-none mt-1 mb-2">{title}</h2>
      {lead && <p className="text-muted text-sm mb-4 max-w-prose">{lead}</p>}
      {children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-line p-4 ${className}`}>{children}</div>;
}

/** A metric with a big tabular number and a one-line plain explanation. */
export function Stat({ label, value, hint, help, tone = 'text-text' }: {
  label: string; value: ReactNode; hint?: ReactNode; help?: ReactNode; tone?: string;
}) {
  return (
    <div className="p-4 border border-line bg-surface min-w-0">
      <div className="flex items-start justify-between gap-2"><Eyebrow>{label}</Eyebrow>{help && <InfoTip label={label}>{help}</InfoTip>}</div>
      <p className={`mt-1 text-2xl md:text-3xl font-medium tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted leading-snug">{hint}</p>}
    </div>
  );
}

/** "What this means": what it shows, what you can infer, what you cannot. Collapsed details hold more. */
export function WhatThisMeans({ shows, infer, cannot, children }: {
  shows: ReactNode; infer: ReactNode; cannot: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="mt-3 border-l-2 border-line-strong pl-3 text-sm text-muted space-y-1">
      <p><span className="text-text">What this shows:</span> {shows}</p>
      <p><span className="text-text">You can infer:</span> {infer}</p>
      <p><span className="text-text">You cannot conclude:</span> {cannot}</p>
      {children && (
        <details className="mt-1">
          <summary className="cursor-pointer text-text">Technical details</summary>
          <div className="mt-2">{children}</div>
        </details>
      )}
    </div>
  );
}

/** Keyboard- and touch-friendly help: a native disclosure, no hover-only tooltip. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="inline-block align-middle">
      <summary aria-label={`What is ${label}?`} className="list-none cursor-pointer inline-flex h-6 w-6 items-center justify-center border border-line-strong text-xs text-muted hover:text-text">?</summary>
      <div role="note" className="mt-1 max-w-xs border border-line-strong bg-bg p-2 text-xs text-muted">{children}</div>
    </details>
  );
}

/** Polite live region for statuses, and an assertive one for errors. */
export function Status({ error = false, children }: { error?: boolean; children: ReactNode }) {
  return error
    ? <div role="alert" className="border border-loss p-3 text-sm text-text">⚠ {children}</div>
    : <div role="status" aria-live="polite" className="text-sm text-muted">{children}</div>;
}
