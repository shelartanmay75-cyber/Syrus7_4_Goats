// Reusable CSS-grid heatmap. 'diverging' is zero-centred (loss colour - surface - gain colour) for signed values;
// 'sequential' runs from the surface colour to the accent blue for unsigned values. Values are printed in the cells when the
// grid is at most 12 x 12 (the colour is never the only signal); every cell has a title tooltip with row, column, value and period.
import { formatPct } from '../lib/format';

const LABEL_LIMIT = 12;
const MAX_MIX = 70; // % of the full colour at the extremes, so the printed value stays readable

interface HeatmapProps {
  title: string; // accessible name of the grid
  rows: string[];
  cols: string[];
  values: (number | null)[][];
  scale: 'diverging' | 'sequential';
  /** Diverging: the value shown at full colour (default: the largest absolute value). Sequential: [low, high] (default: min and max). */
  domain?: [number, number];
  format?: (v: number) => string;
  /** Appears in every tooltip, e.g. "estimation window 2023-10-01 to 2025-09-30". */
  period?: string;
  /** Header of the row-label column. */
  corner?: string;
}

const defaultFormat = (v: number) => v.toFixed(2);
export const pctFormat = (v: number) => formatPct(v, { digits: 1, sign: true });

export function Heatmap({ title, rows, cols, values, scale, domain, format = defaultFormat, period, corner = '' }: HeatmapProps) {
  const flat = values.flat().filter((v): v is number => v !== null && Number.isFinite(v));
  const lim = domain ? Math.max(Math.abs(domain[0]), Math.abs(domain[1])) : Math.max(1e-12, ...flat.map(Math.abs));
  const lo = domain ? domain[0] : Math.min(0, ...flat), hi = domain ? domain[1] : Math.max(...flat, lo + 1e-12);
  const labels = rows.length <= LABEL_LIMIT && cols.length <= LABEL_LIMIT;

  const mixed = (colour: string, pct: number) => `color-mix(in srgb, ${colour} ${pct.toFixed(1)}%, var(--color-surface))`;
  const fill = (v: number | null) => {
    if (v === null || !Number.isFinite(v)) return 'var(--color-bg)';
    if (scale === 'sequential') return mixed('var(--color-accent-blue)', MAX_MIX * Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
    return mixed(v < 0 ? 'var(--c-loss2)' : 'var(--c-gain2)', MAX_MIX * Math.min(1, Math.abs(v) / lim));
  };
  const legendBar = scale === 'sequential'
    ? `linear-gradient(to right, var(--color-surface), ${mixed('var(--color-accent-blue)', MAX_MIX)})`
    : `linear-gradient(to right, ${mixed('var(--c-loss2)', MAX_MIX)}, var(--color-surface), ${mixed('var(--c-gain2)', MAX_MIX)})`;

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <div role="table" aria-label={title} className="grid gap-px w-max min-w-full text-sm"
          style={{ gridTemplateColumns: `minmax(72px, auto) repeat(${cols.length}, minmax(64px, 1fr))` }}>
          <div role="row" className="contents">
            <div role="columnheader" className="label px-1 py-1 text-left">{corner}</div>
            {cols.map((c) => <div key={c} role="columnheader" title={c} className="label px-1 py-1 text-center truncate">{c}</div>)}
          </div>
          {rows.map((r, i) => (
            <div key={r} role="row" className="contents">
              <div role="rowheader" title={r} className="px-1 py-1.5 text-text truncate">{r}</div>
              {cols.map((c, j) => {
                const v = values[i]?.[j] ?? null;
                const shown = v !== null && Number.isFinite(v);
                return (
                  <div key={c} role="cell" title={`${r} × ${c}: ${shown ? format(v as number) : 'no value'}${period ? ` (${period})` : ''}`}
                    className="px-1 py-1.5 text-center text-text tabular-nums border border-line/40" style={{ background: fill(v) }}>
                    {labels ? (shown ? format(v as number) : '—') : <span className="sr-only">{shown ? format(v as number) : '—'}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{scale === 'diverging' ? format(-lim) : format(lo)}</span>
        <span aria-hidden="true" className="inline-block h-3 w-40 border border-line" style={{ background: legendBar }} />
        <span>{scale === 'diverging' ? format(lim) : format(hi)}</span>
        {scale === 'diverging' && <span>· centre (0) is neutral</span>}
        {!labels && <span>· grid too large for cell labels: hover a cell for its value</span>}
      </figcaption>
    </figure>
  );
}
