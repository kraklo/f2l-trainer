// Analysis screen: timeline, per-stage table, and per-stage detail with replays of what you did next
// to the suggestion, cross options and the pair choice at each decision point.

import { type App, type View } from '../app';
import { fromFaceletString, moveToString } from '../cube/cube';
import { COLOUR_NAMES } from '../cube/pieces';
import { type StageSegment } from '../normalise/normalise';
import { type SolveRecord } from '../record/types';
import { CubeView } from '../render/cubeview';
import { pairDiagram } from '../render/svg';
import { type Analysis } from '../solve/analyse';
import { type DecisionPoint, type SlotOption } from '../solve/analyse-f2l';
import { type F2LSolution } from '../solve/f2l';
import { toFR } from '../solve/f2lcase';
import { viewFrom } from '../solve/view';
import { clear, fmtTime, h } from './dom';
import { algCubingUrl } from './links';

/** Puts a replay of `alg` from `setup` into `container` (a TwistyPlayer in the app). */
export type Replay = (container: HTMLElement, setup: string, alg: string) => void;

export interface AnalysisUi {
  expanded: Set<number>;
  /** Selected suggestion per stage index. */
  selected: Map<number, string>;
  toggle(stage: number): void;
  select(stage: number, alg: string): void;
  replay: Replay;
}

const colour = (c: number) => COLOUR_NAMES[c];
const sec = (ms: number) => (ms / 1000).toFixed(2);
const cost = (c: number) => (Number.isFinite(c) ? c.toFixed(1) : '–');

function tokenAlg(a: Analysis, from: number, to: number): string {
  return a.recon.tokens.slice(from, to + 1).map((t) => moveToString(t.move)).join(' ');
}

/** Setup that reaches the cube as held just before stage `i`. */
function setupBefore(record: SolveRecord, a: Analysis, i: number): string {
  return [record.scramble, a.recon.inspection, tokenAlg(a, 0, a.recon.segments[i].startIdx - 1)].filter(Boolean).join(' ');
}

function stageName(s: StageSegment, i: number): string {
  return s.kind === 'cross' ? 'Cross' : s.kind === 'll' ? 'Last layer' : `Pair ${i}`;
}

function reconstructionText(a: Analysis): string {
  const lines = a.recon.inspection ? [`${a.recon.inspection} // inspection`] : [];
  a.recon.segments.forEach((s, i) => {
    const alg = tokenAlg(a, s.startIdx, s.endIdx);
    const label = s.kind === 'pair' ? `pair ${i}: ${s.slot}` : s.kind === 'll' ? 'last layer' : `${colour(a.recon.cross)} cross`;
    lines.push(`${alg || '.'} // ${label}`);
  });
  return lines.join('\n');
}

function timeline(a: Analysis): HTMLElement {
  const segs = a.recon.segments;
  const total = segs.reduce((s, x) => s + x.durationMs, 0) || 1;
  return h('div', { class: 'timeline' }, segs.map((s, i) => {
    const look = s.durationMs ? Math.min(1, s.recognitionMs / s.durationMs) : 0;
    return h('div', { class: `seg ${s.kind}`, style: { flexGrow: String(Math.max(s.durationMs, 1) / total) }, title: `${stageName(s, i)}: ${sec(s.durationMs)} s, look-ahead ${sec(s.recognitionMs)} s` },
      h('div', { class: 'look', style: { width: `${(look * 100).toFixed(1)}%` } }),
      h('span', null, s.kind === 'pair' ? `P${i}` : s.kind === 'cross' ? 'X' : 'LL'));
  }));
}

function solutionList(stage: number, sols: F2LSolution[], ui: AnalysisUi, selected: string | undefined): HTMLElement {
  return h('ul', { class: 'solutions' }, sols.map((s) => h('li', { class: s.alg === selected ? 'selected' : '', onclick: () => ui.select(stage, s.alg) },
    h('span', { class: 'cost' }, cost(s.cost)),
    h('code', null, s.alg),
    s.source === 'known' ? h('span', { class: 'muted small' }, ` ${s.votes ?? 0} votes`) : null,
    s.penalty ? h('span', { class: 'muted small', title: 'Goes into a front slot while back slots are open' }, ' front') : null)));
}

function replays(ui: AnalysisUi, setup: string, yours: string, suggestion: string | undefined, suggestionSetup = setup): HTMLElement {
  const a = h('div', { class: 'replay' }), b = h('div', { class: 'replay' });
  ui.replay(a, setup, yours);
  if (suggestion) ui.replay(b, suggestionSetup, suggestion);
  return h('div', { class: 'replays' },
    h('figure', null, a, h('figcaption', null, 'You: ', h('code', null, yours || '–'))),
    h('figure', null, b, h('figcaption', null, 'Suggestion: ', h('code', null, suggestion ?? '–'))));
}

function crossDetail(record: SolveRecord, a: Analysis, ui: AnalysisUi): HTMLElement {
  const c = a.cross;
  const selected = ui.selected.get(0) ?? c.used.solutions[0]?.alg;
  const allowed = (col: number) => c.colours.find((x) => x.colour === col);
  const xc = (x: typeof c.xcross.best) => h('span', null, `${colour(x.colour)} cross + ${x.slot}, ${x.length} moves: `, h('code', null, `${x.rotation ? `(${x.rotation}) ` : ''}${x.alg}`));
  return h('div', { class: 'detail' },
    // suggestions are written for a grip with the cross on D, which may differ from your inspection grip
    replays(ui, setupBefore(record, a, 0), c.used.alg, selected, [record.scramble, c.used.rotation].filter(Boolean).join(' ')),
    h('div', { class: 'detail-cols' },
      h('div', null,
        h('h4', null, `${colour(c.used.colour)} cross: optimal ${c.used.optimal}, you ${c.used.turns}`),
        h('ul', { class: 'solutions' }, c.used.solutions.map((s) => h('li', { class: s.alg === selected ? 'selected' : '', onclick: () => ui.select(0, s.alg) },
          h('span', { class: 'cost' }, cost(s.cost)), h('code', null, s.alg), h('span', { class: 'muted small' }, ` ${s.length} moves`))))),
      h('div', null,
        h('h4', null, 'Every colour'),
        h('table', { class: 'compact' }, h('tbody', null, c.colours.map((x) => h('tr', { class: x.colour === c.used.colour ? 'chosen' : '' },
          h('td', null, colour(x.colour)), h('td', { class: 'num' }, String(x.optimal)),
          h('td', null, h('code', null, `${x.rotation ? `(${x.rotation}) ` : ''}${x.solutions[0]?.alg ?? ''}`)))))),
        c.bestAllowedColour !== c.used.colour && (allowed(c.bestAllowedColour)?.optimal ?? 99) < c.used.optimal
          ? h('p', { class: 'flag' }, `⚑ ${colour(c.bestAllowedColour)} had a ${allowed(c.bestAllowedColour)?.optimal}-move cross`) : null,
        h('h4', null, 'Xcross'),
        h('p', null, 'Best: ', xc(c.xcross.best)),
        h('p', null, `On ${colour(c.used.colour)}: `, xc(c.xcross.bestOnUsed), h('span', { class: 'muted' }, ` (you: ${c.crossPlusPairTurns} turns for cross + first pair)`)))));
}

function optionRow(d: DecisionPoint, o: SlotOption): HTMLElement {
  const v = viewFrom(fromFaceletString(d.state), toFR(o.position));
  const diagram = pairDiagram(v.facelets, v.colours.map((c) => d.colours[c]));
  return h('tr', { class: o.slot === d.chosen?.slot ? 'chosen' : '' },
    h('td', { class: 'diagram-cell' }, diagram),
    h('td', null, o.slot, h('div', { class: 'muted small' }, o.position)),
    h('td', null, o.case ? `F2L ${o.case}` : 'piece in another slot'),
    h('td', { class: 'num' }, cost(o.best)),
    h('td', null, h('code', null, (o.search[0] ?? o.known[0])?.alg ?? '')));
}

function pairDetail(record: SolveRecord, a: Analysis, i: number, ui: AnalysisUi): HTMLElement | null {
  const d = a.f2l.find((x) => x.after === i - 1);
  if (!d) return null;
  const seg = a.recon.segments[i];
  const option = d.chosen?.option;
  const sols = option ? [...option.search, ...option.known].sort((x, y) => x.cost - y.cost) : [];
  const selected = ui.selected.get(i) ?? sols[0]?.alg;
  const cheapest = d.options[0];
  return h('div', { class: 'detail' },
    replays(ui, setupBefore(record, a, i), tokenAlg(a, seg.startIdx, seg.endIdx), selected),
    h('div', { class: 'detail-cols' },
      h('div', null,
        h('h4', null, `${seg.slot}: you ${cost(d.chosen?.cost ?? NaN)}, best ${cost(option?.best ?? NaN)}`),
        option ? h('h5', null, 'Found by search') : null,
        option ? solutionList(i, option.search, ui, selected) : null,
        option?.known.length ? h('h5', null, 'Known algorithms') : null,
        option ? solutionList(i, option.known, ui, selected) : null),
      h('div', null,
        h('h4', null, 'Pair choice'),
        d.cheaperSlot ? h('p', { class: 'flag' }, `⚑ ${cheapest.slot} was ${cost((option?.best ?? 0) - cheapest.best)} cheaper`) : null,
        d.freePairs.length ? h('p', { class: 'muted' }, `Free pairs: ${d.freePairs.join(', ')}`) : null,
        h('table', { class: 'compact options' }, h('tbody', null, d.options.map((o) => optionRow(d, o)))))));
}

function bestLabel(a: Analysis, s: StageSegment, i: number): string {
  if (s.kind === 'cross') return `optimal ${a.cross.used.optimal}`;
  if (s.kind === 'll') return '';
  const d = a.f2l.find((x) => x.after === i - 1);
  if (!d?.chosen?.option) return s.turns ? '' : 'with previous';
  return `cost ${cost(d.chosen.cost)} → ${cost(d.chosen.option.best)}${d.cheaperSlot ? ' ⚑' : ''}`;
}

/** The analysis content for a solve. */
export function analysisContent(record: SolveRecord, a: Analysis, ui: AnalysisUi): HTMLElement[] {
  const segs = a.recon.segments;
  const turns = a.recon.tokens.filter((t) => !t.rotation).length;
  const total = segs.reduce((s, x) => s + x.durationMs, 0);
  const rows: HTMLElement[] = [];
  segs.forEach((s, i) => {
    const open = ui.expanded.has(i);
    rows.push(h('tr', { class: `stage ${s.kind} ${open ? 'open' : ''}`, onclick: s.kind === 'll' ? undefined : () => ui.toggle(i) },
      h('td', null, s.kind === 'll' ? '' : open ? '▾' : '▸', ' ', stageName(s, i), s.slot ? h('span', { class: 'muted small' }, ` ${s.slot} → ${s.heldSlot}`) : null),
      h('td', { class: 'num' }, String(s.turns)),
      h('td', { class: 'num' }, sec(s.durationMs)),
      h('td', { class: 'num' }, s.tps.toFixed(1)),
      h('td', { class: 'num' }, s.kind === 'cross' ? '' : sec(s.recognitionMs)),
      h('td', null, bestLabel(a, s, i))));
    if (open) {
      const detail = s.kind === 'cross' ? crossDetail(record, a, ui) : pairDetail(record, a, i, ui);
      if (detail) rows.push(h('tr', { class: 'detail-row' }, h('td', { colspan: '6' }, detail)));
    }
  });
  return [
    h('div', { class: 'summary' },
      h('div', { class: 'big' }, fmtTime(total)),
      h('div', null, `${turns} turns · ${(turns / (total / 1000 || 1)).toFixed(1)} TPS · ${colour(a.recon.cross)} cross · ${new Date(record.startedAt).toLocaleString()}`),
      record.status === 'desynced' ? h('div', { class: 'flag' }, '⚑ The cube and the recording disagree: this solve is excluded from stats') : null,
      h('div', { class: 'muted small' }, 'Scramble: ', h('code', null, record.scramble)),
      h('a', { href: algCubingUrl(record.scramble, reconstructionText(a), `F2L Trainer ${new Date(record.startedAt).toLocaleDateString()}`), target: '_blank', rel: 'noopener' }, 'Reconstruction on alg.cubing.net')),
    timeline(a),
    h('table', { class: 'stages' },
      h('thead', null, h('tr', null, ['Stage', 'Turns', 'Time', 'TPS', 'Look-ahead', 'You → best'].map((t) => h('th', null, t)))),
      h('tbody', null, rows)),
  ];
}

export class AnalysisView implements View {
  el = h('section', { class: 'view analysis' });
  private record: SolveRecord | null = null;
  private analysis: Analysis | null | 'pending' | Error = null;
  private ui: AnalysisUi;
  private players: CubeView[] = [];

  constructor(private app: App) {
    this.ui = {
      expanded: new Set(),
      selected: new Map(),
      toggle: (i) => {
        if (!this.ui.expanded.delete(i)) this.ui.expanded.add(i);
        this.render();
      },
      select: (i, alg) => {
        this.ui.selected.set(i, alg);
        this.render();
      },
      replay: (container, setup, alg) => {
        const v = new CubeView(container, { controls: true, hintFacelets: false, tempoScale: 1.5 });
        v.show(setup, alg);
        this.players.push(v);
      },
    };
  }

  /** Drop the replays: a TwistyPlayer that is detached and re-attached adds another 3D view. */
  leave() {
    clear(this.el);
    this.players = [];
  }

  get hasSolve(): boolean {
    return !!this.record;
  }

  show(record: SolveRecord) {
    this.record = record;
    this.analysis = 'pending';
    this.ui.expanded.clear();
    this.ui.selected.clear();
    this.app.analyser.analyse(record, this.app.settings.analysis).then(
      (a) => {
        if (this.record === record) this.analysis = a;
        if (this.app.view === 'analysis') this.render();
      },
      (e) => {
        this.analysis = e instanceof Error ? e : new Error(String(e));
        if (this.app.view === 'analysis') this.render();
      },
    );
  }

  render() {
    // TwistyPlayers are rebuilt with the DOM
    this.players = [];
    const a = this.analysis;
    if (!this.record) return clear(this.el, h('p', { class: 'muted' }, 'Do a solve, or open one from History.'));
    if (a === 'pending') return clear(this.el, h('p', { class: 'muted' }, 'Analysing… (the first run builds the solver tables)'));
    if (a instanceof Error) return clear(this.el, h('p', { class: 'bad' }, `Analysis failed: ${a.message}`));
    if (!a) return clear(this.el, h('p', { class: 'bad' }, 'No F2L found in this solve.'));
    clear(this.el, ...analysisContent(this.record, a, this.ui));
  }
}
