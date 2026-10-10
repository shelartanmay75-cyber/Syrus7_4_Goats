// Guided tour: spotlights each [data-tour] element in turn. A step whose element is not on screen shows as a centered card.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TOUR_DONE_KEY, TOUR_STEPS } from './tourSteps';

const PAD = 8;
const MARGIN = 16;
const CARD_W = 340;
const find = (target: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"], [id="${target}"]`)].find((el) => el.offsetParent !== null) ?? null;
const btn = 'min-h-[44px] px-4 border font-mono text-xs uppercase tracking-[0.08em] disabled:opacity-40';

export function Tour({ open, onClose, steps = TOUR_STEPS }: { open: boolean; onClose: () => void; steps?: typeof TOUR_STEPS }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(240);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i >= steps.length - 1;

  const close = useCallback(() => {
    try { localStorage.setItem(TOUR_DONE_KEY, '1'); } catch { /* storage may be blocked */ }
    onClose();
  }, [onClose]);
  const next = () => (last ? close() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));

  useLayoutEffect(() => { if (open) setI(0); }, [open]);

  // Scroll to the step, follow it on resize and scroll, move focus to the card.
  useLayoutEffect(() => {
    if (!open) return;
    const el = step ? find(step.target) : null;
    const measure = () => setRect(el ? el.getBoundingClientRect() : null);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    measure();
    cardRef.current?.focus();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, step]);

  useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' && step) next();
      else if (e.key === 'ArrowLeft' && step) back();
      else if (e.key === 'Tab') { // keep focus inside the dialog
        const items = cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
        if (!items?.length) return;
        const first = items[0], end = items[items.length - 1];
        if (e.shiftKey && document.activeElement !== end) { end.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === end) { first.focus(); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 2 * MARGIN);
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
  let top = (vh - cardH) / 2, left = (vw - w) / 2;
  if (step && rect) {
    const below = rect.bottom + PAD + 12, above = rect.top - PAD - 12 - cardH;
    top = below + cardH <= vh - MARGIN ? below : above >= MARGIN ? above : vh;
    left = clamp(rect.left, MARGIN, vw - MARGIN - w);
  }
  top = clamp(top, MARGIN, vh - MARGIN - cardH);

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {step && rect ? (
        <div
          className="fixed pointer-events-none outline outline-1 outline-white"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD, boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)' }}
        />
      ) : <div className="fixed inset-0 bg-black/80" />}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className="fixed bg-surface border border-line-strong p-4 outline-none"
        style={{ top, left, width: w, maxHeight: vh - 2 * MARGIN, overflowY: 'auto' }}
      >
        {step && <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted">Step {i + 1} of {steps.length}</p>}
        <h2 id="tour-title" className="font-display text-2xl uppercase font-medium leading-none mt-1">
          {step ? step.title : 'Start on the Optimize page to see the tour'}
        </h2>
        {step && <p className="text-sm text-muted mt-2">{step.body}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {step ? (
            <>
              <button type="button" onClick={back} disabled={i === 0} className={`${btn} border-line-strong text-text`}>Back</button>
              <button type="button" onClick={next} className={`${btn} border-white bg-white text-black`}>{last ? 'Done' : 'Next'}</button>
              <button type="button" onClick={close} className={`${btn} border-transparent text-muted hover:text-text`}>Skip tour</button>
            </>
          ) : (
            <button type="button" onClick={close} className={`${btn} border-white bg-white text-black`}>Close</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
