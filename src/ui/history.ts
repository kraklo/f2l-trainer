// History: rolling stats, the F2L cases most worth drilling, personal cost weights, and the list of
// stored solves with backup and restore.

import { type App, type View } from '../app';
import { DEFAULT_NORMALISE, reconstruct } from '../normalise/normalise';
import { deleteSolve, exportAll, importAll, listSolves } from '../record/store';
import { type SolveRecord } from '../record/types';
import { DEFAULT_WEIGHTS } from '../solve/cost';
import { aggregate, type Stats } from '../stats/aggregate';
import { summaries } from '../stats/cache';
import { type SolveSummary } from '../stats/summary';
import { fitWeights, moveTimings, type PersonalWeights } from '../stats/weights';
import { clear, h, toast } from './dom';

function solveTime(r: SolveRecord): number | undefined {
  const t = r.moves.map((m) => m.cubeTs ?? m.hostTs).filter((x): x is number => x !== null);
  return t.length > 1 ? t[t.length - 1] - t[0] : undefined;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const secs = (ms: number) => (ms / 1000).toFixed(2);
const WINDOWS: [string, number | undefined][] = [['Last 12', 12], ['Last 50', 50], ['All', undefined]];

function statsTable(s: SolveSummary[]): HTMLElement {
  const cols = WINDOWS.filter(([, n]) => n === undefined || s.length > n).map(([label, n]) => [label, aggregate(s, n)] as [string, Stats]);
  const row = (label: string, f: (st: Stats) => string, help?: string) =>
    h('tr', null, h('td', { title: help ?? '' }, label), cols.map(([, st]) => h('td', { class: 'num' }, f(st))));
  return h('table', { class: 'stats' },
    h('thead', null, h('tr', null, h('th', null, ''), cols.map(([label, st]) => h('th', { class: 'num' }, `${label} (${st.solves})`)))),
    h('tbody', null,
      row('Cross + F2L time', (st) => secs(st.meanF2lMs)),
      row('Cross moves over optimal', (st) => st.crossExcess.toFixed(1)),
      row('Optimal crosses', (st) => pct(st.crossOptimalShare)),
      row('Better cross on another colour', (st) => pct(st.betterColourShare), 'Among the colours you use (Settings)'),
      row('Pairs where a cheaper pair was open', (st) => pct(st.cheaperPairShare)),
      [0, 1, 2, 3].map((i) => row(`Look-ahead before pair ${i + 1}`, (st) => secs(st.lookahead[i]))),
      row('Rotations per solve', (st) => st.rotationsPerSolve.toFixed(1))));
}

function weightsTable(w: PersonalWeights): HTMLElement {
  const keys = ['U', 'R', 'L', 'F', 'D', 'B', 'y'];
  const cell = (v: number | undefined) => h('td', { class: 'num' }, v === undefined ? '–' : v.toFixed(2));
  return h('table', { class: 'compact' },
    h('thead', null, h('tr', null, ['Move', 'Default', 'Yours', 'Half turn default', 'Yours'].map((t) => h('th', null, t)))),
    h('tbody', null, keys.map((k) => h('tr', null,
      h('td', null, k),
      cell(DEFAULT_WEIGHTS.quarter[k]), cell(w.quarter[k]),
      cell(DEFAULT_WEIGHTS.quarter[k] * DEFAULT_WEIGHTS.halfFactor), cell(w.half[k]))),
    h('tr', null, h('td', null, 'Hand switch'), cell(DEFAULT_WEIGHTS.sideSwitch), cell(w.sideSwitch), h('td', null), h('td', null))));
}

export class HistoryView implements View {
  el = h('section', { class: 'view history' });
  private statsEl = h('div', { class: 'panel stats-panel' });
  private weightsEl = h('div', { class: 'panel' });
  private fitted: PersonalWeights | null = null;
  private generation = 0;

  constructor(private app: App) {}

  async render() {
    const gen = ++this.generation;
    const solves = await listSolves();
    if (gen !== this.generation) return;
    const ok = solves.filter((s) => s.status === 'ok');
    clear(this.el,
      h('h2', null, 'Stats'),
      this.statsEl,
      h('h2', null, 'Your move speeds'),
      this.weightsEl,
      h('h2', null, 'Solves'),
      h('div', { class: 'controls' },
        h('button', { onclick: () => this.exportBackup() }, 'Export all'),
        h('button', { onclick: () => this.importBackup() }, 'Import')),
      this.solveList(solves.slice().reverse()),
    );
    this.renderWeights(ok);
    if (!ok.length) return clear(this.statsEl, h('p', { class: 'muted' }, 'Stats appear after your first solve.'));
    clear(this.statsEl, h('p', { class: 'muted' }, `Analysing 0 of ${ok.length} solves…`));
    const sums = await summaries(ok, this.app.settings.analysis, this.app.analyser, (n) => {
      if (gen === this.generation) clear(this.statsEl, h('p', { class: 'muted' }, `Analysing ${n} of ${ok.length} solves…`));
    });
    if (gen !== this.generation) return;
    const worst = aggregate(sums).worstCases;
    clear(this.statsEl,
      statsTable(sums),
      h('h3', null, 'Cases to drill'),
      worst.length
        ? h('table', { class: 'compact' }, h('tbody', null, worst.map((c) => h('tr', null,
          h('td', null, `F2L ${c.case}`),
          h('td', { class: 'num' }, `${c.count}×`),
          h('td', { class: 'num' }, `+${c.meanGap.toFixed(1)} cost`),
          h('td', null, h('span', { class: 'muted small' }, 'cheapest last time: '), h('code', null, c.example))))))
        : h('p', { class: 'muted' }, 'Nothing yet: every pair matched the best found.'),
      h('p', { class: 'muted small' }, 'Desynced solves are left out. Stats follow your current analysis settings.'));
  }

  private renderWeights(ok: SolveRecord[]) {
    const current = this.app.settings.analysis.personalWeights;
    const fit = () => {
      const timings = ok.flatMap((r) => {
        const recon = reconstruct(r, { ...DEFAULT_NORMALISE, merge: { ...DEFAULT_NORMALISE.merge, wides: this.app.settings.analysis.wides } });
        return recon ? moveTimings(recon) : [];
      });
      this.fitted = fitWeights(timings, ok.length);
      if (!this.fitted) toast('Not enough solves yet to fit your weights', 'error');
      this.renderWeights(ok);
    };
    const use = (w: PersonalWeights | null) => {
      this.app.settings.analysis.personalWeights = w;
      this.app.saveSettings();
      toast(w ? 'Using your weights for new analyses' : 'Using the default weights');
      void this.render();
    };
    clear(this.weightsEl,
      h('p', { class: 'muted' }, 'Suggestions are ranked by cost. Fitting replaces the default cost of each move with how long it actually takes you, relative to U and R.'),
      current ? h('p', null, `Using your weights, fitted from ${current.solves} solves on ${new Date(current.fittedAt).toLocaleDateString()}.`) : null,
      h('div', { class: 'controls' },
        h('button', { onclick: fit, disabled: !ok.length }, 'Fit from my solves'),
        this.fitted ? h('button', { class: 'primary', onclick: () => use(this.fitted) }, 'Use these weights') : null,
        current ? h('button', { onclick: () => use(null) }, 'Use defaults') : null),
      this.fitted ?? current ? weightsTable((this.fitted ?? current)!) : null,
    );
  }

  private solveList(solves: SolveRecord[]): HTMLElement {
    if (!solves.length) return h('p', { class: 'muted' }, 'No solves yet.');
    return h('table', { class: 'history-table' },
      h('thead', null, h('tr', null, ['When', 'Time', 'Turns', 'Status', ''].map((t) => h('th', null, t)))),
      h('tbody', null, solves.map((s) => h('tr', { class: 'clickable', onclick: () => this.app.openSolve(s) },
        h('td', null, new Date(s.startedAt).toLocaleString()),
        h('td', { class: 'num' }, ((solveTime(s) ?? 0) / 1000).toFixed(2)),
        h('td', { class: 'num' }, String(s.moves.length)),
        h('td', { class: s.status === 'ok' ? 'muted' : 'bad' }, s.status),
        h('td', null, h('button', { class: 'mini', onclick: (e: Event) => this.remove(e, s) }, 'Delete'))))));
  }

  private async remove(e: Event, s: SolveRecord) {
    e.stopPropagation();
    if (!confirm('Delete this solve?')) return;
    await deleteSolve(s.id);
    void this.render();
  }

  private async exportBackup() {
    const blob = new Blob([JSON.stringify(await exportAll())], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `f2l-trainer-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private importBackup() {
    const input = h('input', { type: 'file', accept: '.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        toast(`Imported ${await importAll(JSON.parse(await file.text()))} solves`);
        void this.render();
      } catch (err) {
        toast(String(err), 'error');
      }
    });
    input.click();
  }
}
