// Analysis screen: step through the solve (overview, cross, each pair, last layer). Each step plays
// what you did in a single 3D player and lists what you could have done instead; clicking an option
// plays it from the same state.
//
// The layout and the player are built once while the screen is shown (re-attaching a TwistyPlayer
// adds another 3D view); stepping only swaps the panel and the player's setup and moves.

import { type App, type View } from '../app';
import { fromFaceletString } from '../cube/cube';
import { COLOUR_NAMES } from '../cube/pieces';
import { type SolveRecord } from '../record/types';
import { CubeView } from '../render/cubeview';
import { pairDiagram } from '../render/svg';
import { type Analysis } from '../solve/analyse';
import { toFR } from '../solve/f2lcase';
import { viewFrom } from '../solve/view';
import { clear, fmtTime, h } from './dom';
import { algCubingUrl } from './links';
import { buildSteps, type OptionItem, type Playable, type Step } from './steps';

const sec = (ms: number) => (ms / 1000).toFixed(2);
const pct = (ms: number, total: number) => `${((ms / (total || 1)) * 100).toFixed(1)}%`;

function reconstructionText(a: Analysis): string {
  const lines = a.recon.inspection ? [`${a.recon.inspection} // inspection`] : [];
  a.recon.segments.forEach((s, i) => {
    const alg = a.recon.tokens.slice(s.startIdx, s.endIdx + 1).map((t) => t.move.base + ['', '', '2', "'"][t.move.amount]).join(' ');
    const label = s.kind === 'pair' ? `pair ${i}: ${s.slot}` : s.kind === 'll' ? 'last layer' : `${COLOUR_NAMES[a.recon.cross]} cross`;
    lines.push(`${alg || '.'} // ${label}`);
  });
  return lines.join('\n');
}

function diagramFor(item: OptionItem): SVGSVGElement | null {
  if (!item.diagram) return null;
  const { decision: d, position } = item.diagram;
  const v = viewFrom(fromFaceletString(d.state), toFR(position));
  return pairDiagram(v.facelets, v.colours.map((c) => d.colours[c]));
}

export interface StepUi {
  /** Option currently shown in the player, or null for your own moves. */
  selected: string | null;
  goTo(step: number): void;
  play(item: OptionItem | null): void;
}

/** Overview panel: summary, timeline and stage table (rows jump to their step). */
export function overviewPanel(record: SolveRecord, a: Analysis, steps: Step[], ui: StepUi): HTMLElement {
  const segs = a.recon.segments;
  const total = segs.reduce((s, x) => s + x.durationMs, 0);
  const turns = steps[0].yours.turns;
  const stepOf = (key: string) => steps.findIndex((s) => s.key === key);
  const keyOf = (i: number) => (segs[i].kind === 'cross' ? 'cross' : segs[i].kind === 'll' ? 'll' : `pair-${i}`);
  return h('div', { class: 'step-panel' },
    h('div', { class: 'summary' },
      h('div', { class: 'big' }, fmtTime(total)),
      h('div', null, `${turns} turns · ${(turns / (total / 1000 || 1)).toFixed(1)} TPS · ${COLOUR_NAMES[a.recon.cross]} cross · ${new Date(record.startedAt).toLocaleString()}`),
      record.status === 'desynced' ? h('div', { class: 'flag' }, '⚑ The cube and the recording disagree: this solve is excluded from stats') : null,
      h('div', { class: 'muted small' }, 'Scramble: ', h('code', null, record.scramble)),
      h('a', { href: algCubingUrl(record.scramble, reconstructionText(a), `F2L Trainer ${new Date(record.startedAt).toLocaleDateString()}`), target: '_blank', rel: 'noopener' }, 'Reconstruction on alg.cubing.net')),
    h('div', { class: 'timeline' }, segs.map((s, i) => {
      const look = s.durationMs ? Math.min(1, s.recognitionMs / s.durationMs) : 0;
      return h('div', { class: `seg ${s.kind}`, style: { flexGrow: String(Math.max(s.durationMs, 1) / (total || 1)) }, title: `${sec(s.durationMs)} s (${pct(s.durationMs, total)}), look-ahead ${sec(s.recognitionMs)} s`, onclick: () => ui.goTo(stepOf(keyOf(i))) },
        h('div', { class: 'look', style: { width: `${(look * 100).toFixed(1)}%` } }),
        h('span', null, s.kind === 'pair' ? `P${i}` : s.kind === 'cross' ? 'X' : 'LL'));
    })),
    h('table', { class: 'stages' },
      h('thead', null, h('tr', null, ['Stage', 'Turns', 'Time', 'Look-ahead', 'You → best'].map((t) => h('th', null, t)))),
      h('tbody', null, steps.slice(1).map((st, k) => h('tr', { class: 'clickable', onclick: () => ui.goTo(k + 1) },
        h('td', null, st.title, st.segment?.slot ? h('span', { class: 'muted small' }, ` ${st.segment.slot}`) : null),
        h('td', { class: 'num' }, String(st.yours.turns)),
        h('td', { class: 'num' }, `${sec(st.yours.ms)}s`, h('span', { class: 'muted small' }, ` (${pct(st.yours.ms, total)})`)),
        h('td', { class: 'num' }, st.key === 'cross' ? '' : sec(st.yours.lookMs)),
        h('td', null,
          st.key === 'cross' ? `${st.yours.turns} → ${a.cross.used.optimal} moves` : st.yours.cost !== undefined && st.yours.best !== undefined ? `${st.yours.cost.toFixed(1)} → ${st.yours.best.toFixed(1)}` : '',
          st.flags.length && st.key !== 'll' ? h('span', { class: 'flag' }, ' ⚑') : null))))));
}

/** A cross/pair/last-layer panel: what you did, flags, and the option groups. */
export function stepPanel(step: Step, ui: StepUi): HTMLElement {
  const y = step.yours;
  return h('div', { class: 'step-panel' },
    h('h2', null, step.title, step.segment?.slot ? h('span', { class: 'muted' }, ` · ${step.segment.slot} → ${step.segment.heldSlot}`) : null),
    h('div', { class: 'stats-line muted' },
      `${y.turns} turns · ${sec(y.ms)} s`, step.key !== 'cross' ? ` · look-ahead ${sec(y.lookMs)} s` : '',
      y.cost !== undefined ? ` · cost ${y.cost.toFixed(1)}` : '', y.best !== undefined ? ` (best ${y.best.toFixed(1)})` : ''),
    h('div', { class: `yours ${ui.selected === null ? 'selected' : ''}`, onclick: () => ui.play(null) },
      h('div', { class: 'label' }, 'You did'),
      h('code', null, y.alg || '—')),
    step.flags.map((f) => h('p', { class: 'flag' }, `⚑ ${f}`)),
    step.groups.filter((g) => g.items.length).map((g) => h('section', { class: 'option-group' },
      h('h3', null, g.title),
      h('ul', { class: 'options' }, g.items.map((item) => h('li', { class: item.id === ui.selected ? 'selected' : '', onclick: () => ui.play(item) },
        diagramFor(item),
        h('div', { class: 'option-body' },
          item.label ? h('div', { class: 'option-label' }, item.label) : null,
          h('code', null, item.alg),
          item.note ? h('div', { class: 'muted small' }, item.note) : null),
        item.cost !== undefined ? h('span', { class: 'cost' }, item.cost.toFixed(1)) : null))))),
  );
}

export class AnalysisView implements View {
  el = h('section', { class: 'view analysis' });
  private nav = h('nav', { class: 'steps' });
  private playerBox = h('div', { class: 'player-box' });
  private nowPlaying = h('div', { class: 'now-playing muted small' });
  private panel = h('div', { class: 'panel-box' });
  private player: CubeView | null = null;
  private record: SolveRecord | null = null;
  private analysis: Analysis | null | 'pending' | Error = null;
  private steps: Step[] = [];
  private step = 0;
  private selected: OptionItem | null = null;
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') this.goTo(this.step + 1);
    else if (e.key === 'ArrowLeft') this.goTo(this.step - 1);
    else return;
    e.preventDefault();
  };

  constructor(private app: App) {}

  get hasSolve(): boolean {
    return !!this.record;
  }

  show(record: SolveRecord) {
    this.record = record;
    this.analysis = 'pending';
    this.steps = [];
    this.step = 0;
    this.selected = null;
    this.app.analyser.analyse(record, this.app.settings.analysis).then(
      (a) => {
        if (this.record !== record) return;
        this.analysis = a;
        this.steps = a ? buildSteps(record, a) : [];
        if (this.app.view === 'analysis') this.render();
      },
      (e) => {
        this.analysis = e instanceof Error ? e : new Error(String(e));
        if (this.app.view === 'analysis') this.render();
      },
    );
  }

  /** Drop the player: a TwistyPlayer that is detached and re-attached adds another 3D view. */
  leave() {
    document.removeEventListener('keydown', this.onKey);
    this.player?.player.remove();
    this.player = null;
    clear(this.el);
  }

  private goTo(i: number) {
    if (i < 0 || i >= this.steps.length || i === this.step) return;
    this.step = i;
    this.selected = null;
    this.renderStep();
  }

  private play(item: OptionItem | null) {
    this.selected = item;
    this.renderStep();
    this.player?.play();
  }

  private load(p: Playable, label: string) {
    this.player?.show(p.setup, p.alg);
    clear(this.nowPlaying, label);
  }

  private renderStep() {
    const step = this.steps[this.step];
    const a = this.analysis as Analysis;
    clear(this.nav,
      h('button', { class: 'mini', disabled: this.step === 0, onclick: () => this.goTo(this.step - 1) }, '← Prev'),
      this.steps.map((s, i) => h('button', { class: `tab ${i === this.step ? 'active' : ''} ${s.flags.length && s.key !== 'll' ? 'flagged' : ''}`, onclick: () => this.goTo(i) }, s.title)),
      h('button', { class: 'mini', disabled: this.step === this.steps.length - 1, onclick: () => this.goTo(this.step + 1) }, 'Next →'));
    const ui: StepUi = { selected: this.selected?.id ?? null, goTo: (i) => this.goTo(i), play: (item) => this.play(item) };
    clear(this.panel, step.key === 'overview' ? overviewPanel(this.record!, a, this.steps, ui) : stepPanel(step, ui));
    if (this.selected) this.load(this.selected, `Option: ${this.selected.alg}`);
    else this.load(step.yours, step.key === 'overview' ? 'Your whole solve' : `You: ${step.yours.alg || '—'}`);
  }

  render() {
    const a = this.analysis;
    if (!this.record) return clear(this.el, h('p', { class: 'muted' }, 'Do a solve, or open one from History.'));
    if (a === 'pending') return clear(this.el, h('p', { class: 'muted' }, 'Analysing… (the first run builds the solver tables)'));
    if (a instanceof Error) return clear(this.el, h('p', { class: 'bad' }, `Analysis failed: ${a.message}`));
    if (!a) return clear(this.el, h('p', { class: 'bad' }, 'No F2L found in this solve.'));
    if (!this.el.contains(this.playerBox)) {
      clear(this.el, this.nav, h('div', { class: 'step-layout' }, h('div', { class: 'player-col' }, this.playerBox, this.nowPlaying), this.panel));
    }
    if (!this.player) this.player = new CubeView(this.playerBox, { controls: true, hintFacelets: false, tempoScale: 1.5 });
    document.removeEventListener('keydown', this.onKey);
    document.addEventListener('keydown', this.onKey);
    this.renderStep();
  }
}
