// Solve screen: scramble guidance, live cube, timer and live stage splits.
// The splits here are a live estimate; the analysis recomputes them exactly from the recording.

import { type GanCubeEvent } from 'gan-web-bluetooth';
import { randomScrambleForEvent } from 'cubing/scramble';
import { type App, type View } from '../app';
import { crossSolved, slotSolved, slotsFor } from '../cube/pieces';
import { CubeView } from '../render/cubeview';
import { clear, h, toast } from './dom';

const STAGE_NAMES = ['Cross', 'Pair 1', 'Pair 2', 'Pair 3', 'Pair 4'];

export class SolveView implements View {
  el = h('section', { class: 'view solve' });
  private cubeView: CubeView | null = null;
  private cubeBox = h('div', { class: 'cube-box' });
  private timerEl = h('div', { class: 'timer' }, '0.00');
  private splits: number[] = [];
  private raf = 0;

  constructor(private app: App) {
    app.recorder.on(() => {
      if (app.view === 'solve') this.update();
    });
  }

  private get start(): number | undefined {
    return this.app.recorder.solveStart;
  }

  async newScramble() {
    const rec = this.app.recorder;
    if (!rec.canScramble) {
      toast('Connect the cube and make sure it is solved first', 'error');
      return;
    }
    const scramble = (await randomScrambleForEvent('333')).toString();
    this.splits = [];
    this.cubeView?.show('');
    rec.startScramble(scramble);
    this.render();
  }

  onCubeEvent(e: GanCubeEvent) {
    if (e.type === 'MOVE') this.cubeView?.addMove(e.move);
  }

  /** Records a split whenever the best F2L progress (cross, then each slot) goes up. */
  private trackSplits() {
    const start = this.start;
    if (start === undefined) return;
    const state = this.app.recorder.state;
    let progress = 0;
    for (let c = 0; c < 6; c++) {
      if (!crossSolved(state, c)) continue;
      progress = Math.max(progress, 1 + slotsFor(c).filter((s) => slotSolved(state, s)).length);
    }
    while (this.splits.length < progress) this.splits.push(performance.now() - start);
  }

  private tick = () => {
    const start = this.start;
    if (this.app.recorder.phase === 'solving' && start !== undefined) {
      this.timerEl.textContent = ((performance.now() - start) / 1000).toFixed(2);
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private update() {
    const phase = this.app.recorder.phase;
    if (phase === 'solving') {
      this.trackSplits();
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.render();
  }

  leave() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  render() {
    const { recorder, cube } = this.app;
    if (this.app.settings.liveCube && !this.cubeView) this.cubeView = new CubeView(this.cubeBox, { hintFacelets: false, tempoScale: 5 });
    let prompt: HTMLElement;
    switch (recorder.phase) {
      case 'scrambling':
        prompt = h('div', null, h('div', { class: 'muted small' }, 'Scramble with white on top, green in front'), h('div', { class: 'scramble' }, recorder.tracker?.remaining || '✓'));
        break;
      case 'inspection':
        prompt = h('div', { class: 'prompt' }, 'Inspect. The timer starts on your first turn.');
        break;
      case 'solving':
      case 'awaitEnd':
        prompt = h('div', { class: 'prompt' }, 'Solving…');
        break;
      default:
        prompt = h('div', { class: 'prompt muted' },
          !cube ? 'Connect your cube to start.' : !recorder.synced ? 'Waiting for the cube…' : recorder.canScramble ? 'Press New scramble.' : 'Solve the cube to start a new scramble.');
    }
    const busy = recorder.phase !== 'idle' && recorder.phase !== 'done';
    clear(this.el,
      h('div', { class: 'solve-main' },
        h('div', { class: 'controls' },
          h('button', { class: 'primary', disabled: !cube || busy, onclick: () => this.newScramble() }, 'New scramble'),
          busy ? h('button', { onclick: () => recorder.cancel() }, 'Cancel') : null,
          cube && !recorder.canScramble && !busy
            ? h('button', { onclick: async () => confirm("Reset the cube's internal state to solved? Only do this if it is physically solved.") && (await cube.reset()) }, 'Cube is solved')
            : null),
        prompt,
        this.timerEl,
        this.app.settings.liveCube ? this.cubeBox : null),
      h('aside', { class: 'splits panel' },
        h('h3', null, 'Splits'),
        h('table', null, h('tbody', null, STAGE_NAMES.map((name, i) => h('tr', null,
          h('td', null, name),
          h('td', { class: 'num' }, this.splits[i] !== undefined ? (this.splits[i] / 1000).toFixed(2) : '–'),
          h('td', { class: 'num muted' }, this.splits[i] !== undefined && i > 0 ? `+${((this.splits[i] - this.splits[i - 1]) / 1000).toFixed(2)}` : ''))))),
        h('p', { class: 'muted small' }, 'Live estimate; the analysis has exact splits.')),
    );
    if (recorder.phase !== 'solving' && this.start === undefined) this.timerEl.textContent = '0.00';
  }
}
