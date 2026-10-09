// Landing page: what the app does, in plain English, with the honest scorecard up front.
import { Card, Eyebrow } from '../components/ui';
import landingArt from '../assets/landing-art.txt?raw';

const STEPS = [
  'Choose stocks, your risk level and how many to hold.',
  'A quantum algorithm (QAOA, run on a simulator) and three classical methods solve the exact same problem.',
  'You get the portfolio, a whole-share ₹ trade list, and an honest verdict.',
];

const HONEST = [
  { title: 'Checked against the best', body: 'Every run is compared with the exact best answer (found by brute force) and with random guessing.' },
  { title: 'Bad results are shown', body: 'When the quantum method does worse, we say so plainly.' },
  { title: 'No hints for the circuit', body: 'We never hand the quantum circuit the classical answer.' },
  { title: 'No peeking at the future', body: 'We never use future prices to choose the portfolio.' },
];

const GETS = [
  { title: 'Your portfolio', body: 'The stocks picked and how much of your money goes into each.' },
  { title: '₹ trade list', body: 'Whole shares to buy, with Indian brokerage costs included.' },
  { title: 'Why these stocks', body: 'Return, risk and sector for each pick.' },
  { title: 'Evidence', body: 'Convergence, sampled answers and the effect of noise.' },
];

const btn = 'min-h-[44px] px-6 border font-mono text-xs uppercase tracking-[0.08em] inline-flex items-center justify-center';

export function Landing({ onStart, onTour }: { onStart: () => void; onTour: () => void }) {
  return (
    <div className="space-y-12 md:space-y-16">
      <section aria-labelledby="landing-title" className="pt-4 md:pt-10 md:grid md:grid-cols-[1.15fr_1fr] md:gap-8 md:items-center">
        <div>
        <Eyebrow>Qiskit Fall Fest 2026 · PS-03</Eyebrow>
        <h1 id="landing-title" className="mt-3 max-w-4xl text-5xl md:text-6xl leading-[0.95]">
          Quantum portfolio picks, with an honest scorecard every run.
        </h1>
        <p className="mt-4 max-w-prose text-base text-muted">
          Tell us which Indian stocks you like and how much risk you can take. We pick a mix, then show how a quantum method really did against the exact best answer.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={onStart} className={`${btn} border-white bg-white text-black`}>Start optimizing</button>
          <button type="button" onClick={onTour} className={`${btn} border-line-strong text-text hover:border-white`}>Take the 60-second tour</button>
        </div>
        </div>
        {/* Decorative ASCII hero art, drawn as text in the theme colour (see .landing-ascii in index.css) */}
        <div className="landing-ascii-wrap hidden md:block" aria-hidden="true">
          <pre className="landing-ascii">{landingArt}</pre>
        </div>
      </section>

      <section aria-labelledby="how-title">
        <Eyebrow>How it works</Eyebrow>
        <h2 id="how-title" className="font-display text-2xl uppercase font-medium leading-none mt-1 mb-4">Three steps</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map((text, n) => (
            <li key={n} className="border border-line bg-surface p-4">
              <span className="font-display text-5xl font-medium leading-none text-faint" aria-hidden="true">{n + 1}</span>
              <p className="mt-2 text-sm text-text"><span className="sr-only">Step {n + 1}: </span>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="honest-title" className="border border-line-strong bg-surface p-5 md:p-8">
        <Eyebrow>Our main promise</Eyebrow>
        <h2 id="honest-title" className="font-display text-4xl md:text-5xl uppercase font-medium leading-none mt-2">The honest verdict</h2>
        <p className="mt-3 max-w-prose text-base text-text">
          Most tools only show good news. Ours gives every run a scorecard, and a poor score stays on it.
        </p>
        <ul className="mt-6 grid gap-px bg-line border border-line sm:grid-cols-2">
          {HONEST.map((h) => (
            <li key={h.title} className="bg-bg p-4">
              <h3 className="text-xl">{h.title}</h3>
              <p className="mt-1 text-sm text-muted">{h.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="gets-title">
        <Eyebrow>What you get</Eyebrow>
        <h2 id="gets-title" className="font-display text-2xl uppercase font-medium leading-none mt-1 mb-4">After each run</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GETS.map((g) => (
            <Card key={g.title}>
              <h3 className="text-lg">{g.title}</h3>
              <p className="mt-1 text-sm text-muted">{g.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <p className="border-t border-line pt-4 text-xs text-muted">
        Educational tool, not investment advice. Past performance does not guarantee future returns.
      </p>
    </div>
  );
}
