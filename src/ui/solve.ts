// Solve screen: scramble guidance, live cube, timer and live stage splits.
// The splits here are a live estimate; the analysis recomputes them exactly from the recording.
//
// The layout is built once and only its text is updated: re-attaching a TwistyPlayer makes it add
// another 3D view, so the live cube stays put while the screen is shown and is rebuilt (from the
// moves since the scramble started) when the screen is shown again.

import { type GanCubeEvent } from 'gan-web-bluetooth';
import { randomScrambleForEvent } from 'cubing/scramble';
import '../scramble-setup';
import { type App, type View } from '../app';
import { moveToString } from '../cube/cube';
import { crossSolved, slotSolved, slotsFor } from '../cube/pieces';
import { type ScrambleTracker } from '../record/scramble';
import { CubeView } from '../render/cubeview';
import { clear, h, toast } from './dom';

/** A scramble row of fixed-width cells: done moves become dots, so nothing shifts. */
export function scrambleRow(tracker: ScrambleTracker): HTMLElement {
  const { done, next, undo } = tracker.display;
  return h('div', null,
    h('div', { class: 'muted small' }, 'Scramble with white on top, green in front'),
    h('div', { class: 'scramble' }, tracker.moves.map((m, i) =>
      h('span', { class: `mv ${i < done ? 'done' : i === done ? 'next' : ''}` }, i < done ? '·' : i === done && next ? next : moveToString(m)))),
    h('div', { class: 'undo' }, undo ? `Undo: ${undo}` : ''));
}

const STAGE_NAMES = ['Cross', 'Pair 1', 'Pair 2', 'Pair 3', 'Pair 4'];

export class SolveView implements View {
  el = h('section', { class: 'view solve' });
  private controlsEl = h('div', { class: 'controls' });
  private promptEl = h('div', { class: 'prompt-area' });
  private timerEl = h('div', { class: 'timer' }, '0.00');
  private cubeBox = h('div', { class: 'cube-box' });
  private splitsEl = h('tbody');
  private cubeView: CubeView | null = null;
  /** Turns since the scramble started, to rebuild the live cube. */
  private liveMoves: string[] = [];
  private splits: number[] = [];
  private raf = 0;

  constructor(private app: App) {
    this.el.append(
      h('div', { class: 'solve-main' }, this.controlsEl, this.promptEl, this.timerEl, this.cubeBox),
      h('aside', { class: 'splits panel' },
        h('h3', null, 'Splits'),
        h('table', null, this.splitsEl),
        h('p', { class: 'muted small' }, 'Live estimate; the analysis has exact splits.')),
    );
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
    this.liveMoves = [];
    this.cubeView?.show('');
    this.timerEl.textContent = '0.00';
    rec.startScramble(scramble);
    this.render();
  }

  onCubeEvent(e: GanCubeEvent) {
    if (e.type !== 'MOVE') return;
    this.liveMoves.push(e.move);
    this.cubeView?.addMove(e.move);
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
    } else {
      this.raf = 0;
    }
  };

  private update() {
    if (this.app.recorder.phase === 'solving') {
      this.trackSplits();
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    }
    this.render();
  }

  leave() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cubeView?.player.remove();
    this.cubeView = null;
  }

  render() {
    const { recorder, cube, settings } = this.app;
    if (settings.liveCube && !this.cubeView) {
      this.cubeView = new CubeView(this.cubeBox, { hintFacelets: false, tempoScale: 5 });
      this.cubeView.show(this.liveMoves.join(' '));
    } else if (!settings.liveCube && this.cubeView) {
      this.leave();
    }
    this.cubeBox.hidden = !settings.liveCube;

    const busy = recorder.phase !== 'idle' && recorder.phase !== 'done';
    clear(this.controlsEl,
      h('button', { class: 'primary', disabled: !cube || busy, onclick: () => this.newScramble() }, 'New scramble'),
      busy ? h('button', { onclick: () => recorder.cancel() }, 'Cancel') : null,
      cube && !recorder.canScramble && !busy
        ? h('button', { onclick: async () => confirm("Reset the cube's internal state to solved? Only do this if it is physically solved.") && (await cube.reset()) }, 'Cube is solved')
        : null);

    let prompt: HTMLElement;
    switch (recorder.phase) {
      case 'scrambling':
        prompt = scrambleRow(recorder.tracker!);
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
    clear(this.promptEl, prompt);

    clear(this.splitsEl, STAGE_NAMES.map((name, i) => h('tr', null,
      h('td', null, name),
      h('td', { class: 'num' }, this.splits[i] !== undefined ? (this.splits[i] / 1000).toFixed(2) : '–'),
      h('td', { class: 'num muted' }, this.splits[i] !== undefined && i > 0 ? `+${((this.splits[i] - this.splits[i - 1]) / 1000).toFixed(2)}` : ''))));
  }
}
