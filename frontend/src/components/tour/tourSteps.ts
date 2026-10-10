// Guided tour steps. `target` matches a `data-tour="..."` attribute in the page.
export const TOUR_DONE_KEY = 'qp_tour_done';

export const TOUR_STEPS: { target: string; title: string; body: string }[] = [
  { target: 'universe', title: 'Pick your stocks', body: 'Choose the NIFTY 50 stocks the optimiser may pick from. A smaller list runs faster.' },
  { target: 'risk', title: 'Choose a risk profile', body: 'Cautious, balanced or bold. It sets how much the optimiser worries about ups and downs compared with chasing return.' },
  { target: 'holdings-count', title: 'How many stocks to hold', body: 'Set how many stocks the final portfolio should contain.' },
  { target: 'review', title: 'Check your choices', body: 'A quick summary of what you picked. Change anything here before you run.' },
  { target: 'run', title: 'Run the optimiser', body: 'Starts the quantum method and the three classical methods on the same problem. It takes about 10 seconds.' },
  { target: 'results', title: 'Your results', body: 'The portfolio, with weights, and a trade list in whole shares and rupees.' },
  { target: 'verdict', title: 'The honest verdict', body: 'A scorecard against the exact best answer: matched, near, or worse. If the quantum method does worse, it says so.' },
  { target: 'evidence-tab', title: 'See the evidence', body: 'Open the charts behind the verdict: convergence, sampled answers and the effect of noise.' },
];

/** Walk-through of the Portfolio Report; targets are the report's section ids. */
export const REPORT_TOUR_STEPS: { target: string; title: string; body: string }[] = [
  { target: 'rp-a', title: 'Three return numbers', body: 'Expected return is the estimate the optimiser used (by default, from how much the stocks move with the market). Recent-history and past performance are shown for comparison; past performance is what already happened, not a forecast.' },
  { target: 'rp-b', title: 'What your money could become', body: 'Pick a horizon to see the estimate compounded, and the typical range around it. Two outcomes in three land inside the range if the model is right.' },
  { target: 'rp-d', title: 'What-if scenarios', body: 'Bull = the market rises 15%, Bear = falls 15%, Crash = falls 30%, Recovery = a 30% crash then a 25% rebound. Each stock moves by its beta times the market. You can edit every move.' },
  { target: 'rp-e', title: 'The real test', body: 'What the same stocks actually did in a year the optimiser never saw, against the NIFTY 50. This is the honest check on everything above.' },
  { target: 'rp-g', title: 'Quantum vs classical', body: 'Every method solved the same problem. Here you see what each picked, how close it got to the best answer, and how long it took.' },
  { target: 'rp-noise', title: 'Noise analysis', body: 'The quantum circuit re-run on a simulated IBM chip with real error rates, and what that does to the portfolio it would pick.' },
  { target: 'rp-h', title: 'Heatmaps', body: 'Colour grids: which stocks move together, where the risk sits, and how each method differs.' },
  { target: 'report-export', title: 'Take it with you', body: 'Download every table as a CSV, or print the report as a PDF.' },
];
