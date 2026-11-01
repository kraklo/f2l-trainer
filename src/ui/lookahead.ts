// Look-ahead training: solve F2L to a metronome, one turn on every beat and no filler turns. The solve
// ends the moment F2L is done; the next scramble starts from there (the last layer stays as it is).
// After each solve the tempo goes up after a clean streak and down after a failed one.
//
// Like the solve screen, the layout and live cube are built once and only the text is updated.

import { type GanCubeEvent } from 'gan-web-bluetooth';
import { type App, type View } from '../app';
import { invertAlg } from '../cube/cube';
import { Metronome } from '../lookahead/metronome';
import { rescramble } from '../lookahead/rescramble';
import { CLEAN_STREAK, FAIL_STREAK, MAX_BPM, MIN_BPM, nextTempo, recordRhythm, scoreRhythm, TEMPO_STEP, type Rhythm } from '../lookahead/rhythm';
import { type SolveRecord } from '../record/types';
import { CubeView } from '../render/cubeview';
import { clear, h, toast } from './dom';
import { scrambleRow } from './solve';

interface SessionEntry {
  record: SolveRecord;
  rhythm: Rhythm;
}

export const pctText = (x: number) => `${Math.round(x * 100)}%`;

export class LookaheadView implements View {
  el = h('section', { class: 'view solve lookahead' });
  private controlsEl = h('div', { class: 'controls' });
  private tempoEl = h('div', { class: 'tempo-bar' });
  private promptEl = h('div', { class: 'prompt-area' });
  private beatEl = h('div', { class: 'beats' }, [0, 1, 2, 3].map(() => h('span', { class: 'beat' })));
  private liveEl = h('div', { class: 'live-stats muted' });
  private cubeBox = h('div', { class: 'cube-box' });
  private sessionEl = h('tbody');
  private cubeView: CubeView | null = null;
  private metronome = new Metronome();
  /** The recording in progress is a look-ahead solve. */
  private active = false;
  private preparing = false;
  /** Setup alg for the live cube (the state the scramble started from) and turns since. */
  private liveSetup = '';
  private liveMoves: string[] = [];
  private session: SessionEntry[] = [];
  private raf = 0;
  private lastPhase = '';

  constructor(private app: App) {
    this.el.append(
      h('div', { class: 'solve-main' }, this.controlsEl, this.tempoEl, this.promptEl, this.beatEl, this.liveEl, this.cubeBox),
      h('aside', { class: 'splits panel' },
        h('h3', null, 'This session'),
        h('table', { class: 'compact' },
          h('thead', null, h('tr', null, ['Tempo', 'On beat', 'Filler', ''].map((t) => h('th', null, t)))),
          this.sessionEl),
        h('p', { class: 'muted small' },
          `Turn once on every click and only make turns that help F2L. ${CLEAN_STREAK} clean solves in a row (≥ 80% on the beat, no filler) raise the tempo; ${FAIL_STREAK} misses lower it.`)),
    );
    app.recorder.on(() => this.onRecorder());
  }

  get tempo() {
    return this.app.settings.lookahead;
  }

  /** Starts the next look-ahead scramble from wherever the cube is. */
  async next() {
    const rec = this.app.recorder;
    if (!rec.canRescramble) {
      toast(this.app.cube ? 'Finish or cancel the current solve first' : 'Connect the cube first', 'error');
      return;
    }
    this.preparing = true;
    this.render();
    try {
      let r;
      for (;;) {
        const from = rec.state;
        r = await rescramble(from);
        if (rec.state === from) break; // turned while the scramble was being made: make another
      }
      if (!rec.canRescramble) return;
      this.liveSetup = `${r.fromSolved} ${invertAlg(r.shown)}`;
      this.liveMoves = [];
      this.cubeView?.show(this.liveSetup);
      rec.startScramble(r.shown, Date.now(), { goal: 'f2l', fromSolved: r.fromSolved });
      this.active = true;
    } catch (e) {
      toast(`Could not make a scramble: ${e}`, 'error');
    } finally {
      this.preparing = false;
      this.render();
    }
  }

  cancel() {
    this.active = false;
    this.metronome.stop();
    this.app.recorder.cancel();
  }

  private setBpm(bpm: number) {
    const s = this.app.settings;
    s.lookahead = { ...s.lookahead, bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, bpm)), cleanStreak: 0, failStreak: 0 };
    this.app.saveSettings();
    this.render();
  }

  /**
   * Called by the app when a recording finishes, before it is saved: tags look-ahead solves with
   * their metronome, scores them and adapts the tempo.
   */
  finishSolve(record: SolveRecord) {
    if (!this.active) return;
    this.active = false;
    const beatZero = this.metronome.beatZero;
    this.metronome.stop();
    if (beatZero === null) return;
    record.lookahead = { bpm: this.tempo.bpm, beatZero };
    const rhythm = recordRhythm(record);
    if (!rhythm) return;
    this.session.push({ record, rhythm });
    if (record.status !== 'ok') return;
    const { state, change } = nextTempo(this.tempo, rhythm);
    this.app.settings.lookahead = state;
    this.app.saveSettings();
    if (change === 'up') toast(`Clean! Tempo up to ${state.bpm} turns/min`);
    else if (change === 'down') toast(`Tempo down to ${state.bpm} turns/min`);
  }

  onCubeEvent(e: GanCubeEvent) {
    if (e.type !== 'MOVE') return;
    this.liveMoves.push(e.move);
    this.cubeView?.addMove(e.move);
  }

  private onRecorder() {
    const phase = this.app.recorder.phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      if (this.active && phase === 'inspection') {
        this.metronome.start(this.tempo.bpm).catch((e) => toast(`Could not start the metronome: ${e}`, 'error'));
      } else if (phase === 'idle') {
        this.active = false;
        this.metronome.stop();
      }
    }
    if (this.app.view === 'lookahead') {
      if (this.metronome.running && !this.raf) this.raf = requestAnimationFrame(this.tick);
      this.render();
    }
  }

  /** Lights the beat dot for the current click (one of four, the first accented). */
  private tick = () => {
    if (!this.metronome.running || this.app.view !== 'lookahead') {
      this.raf = 0;
      for (const d of this.beatEl.children) d.classList.remove('on');
      return;
    }
    const interval = 60000 / this.metronome.bpm;
    const k = Math.floor((performance.now() - this.metronome.beatTime(0)) / interval);
    const lit = k >= 0 && performance.now() - this.metronome.beatTime(k) < Math.min(120, interval / 2);
    [...this.beatEl.children].forEach((d, i) => d.classList.toggle('on', lit && ((k % 4) + 4) % 4 === i));
    this.raf = requestAnimationFrame(this.tick);
  };

  leave() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cubeView?.player.remove();
    this.cubeView = null;
  }

  private renderTempo() {
    const t = this.tempo;
    const busy = this.active || this.preparing;
    const streak = t.cleanStreak ? ` · clean ${t.cleanStreak}/${CLEAN_STREAK}` : t.failStreak ? ` · missed ${t.failStreak}/${FAIL_STREAK}` : '';
    clear(this.tempoEl,
      h('button', { class: 'mini', disabled: busy || t.bpm <= MIN_BPM, title: 'Slower', onclick: () => this.setBpm(t.bpm - TEMPO_STEP) }, '−'),
      h('div', { class: 'tempo' }, h('span', { class: 'bpm' }, String(t.bpm)), ' turns/min',
        h('span', { class: 'muted small' }, ` (${(t.bpm / 60).toFixed(2)} TPS)`)),
      h('button', { class: 'mini', disabled: busy || t.bpm >= MAX_BPM, title: 'Faster', onclick: () => this.setBpm(t.bpm + TEMPO_STEP) }, '+'),
      h('div', { class: 'muted small' }, t.comfortable === null ? 'No comfortable tempo yet' : `Comfortable at ${t.comfortable} turns/min`, streak));
  }

  private renderLive() {
    const rec = this.app.recorder;
    const moves = rec.solveMoves;
    if (!this.active || !this.metronome.running || !moves.length || this.metronome.beatZero === null) return clear(this.liveEl);
    const r = scoreRhythm([...moves], { bpm: this.metronome.bpm, beatZero: this.metronome.beatZero });
    clear(this.liveEl, `${r.turns} turns · ${pctText(r.accuracy)} on the beat · `,
      h('span', { class: r.fillers ? 'bad' : '' }, `${r.fillers} filler`));
  }

  private renderSession() {
    clear(this.sessionEl, this.session.slice(-12).reverse().map(({ record, rhythm }) => h('tr', { class: 'clickable', onclick: () => this.app.openSolve(record) },
      h('td', { class: 'num' }, String(rhythm.bpm)),
      h('td', { class: 'num' }, pctText(rhythm.accuracy)),
      h('td', { class: `num ${rhythm.fillers ? 'bad' : ''}` }, String(rhythm.fillers)),
      h('td', null, record.status !== 'ok' ? h('span', { class: 'bad' }, 'desynced') : rhythm.clean ? h('span', { class: 'good' }, '✓') : ''))));
  }

  render() {
    const { recorder, cube, settings } = this.app;
    if (settings.liveCube && !this.cubeView) {
      this.cubeView = new CubeView(this.cubeBox, { hintFacelets: false, tempoScale: 5 });
      this.cubeView.show(this.liveSetup, this.liveMoves.join(' '));
      if (this.liveMoves.length) this.cubeView.player.jumpToEnd();
    } else if (!settings.liveCube && this.cubeView) {
      this.leave();
    }
    this.cubeBox.hidden = !settings.liveCube;

    const busy = recorder.phase !== 'idle' && recorder.phase !== 'done';
    clear(this.controlsEl,
      h('button', { class: 'primary', disabled: !cube || busy || this.preparing, onclick: () => this.next() },
        this.preparing ? 'Making a scramble…' : this.session.length ? 'Next scramble' : 'Start'),
      busy ? h('button', { onclick: () => this.cancel() }, 'Cancel') : null);
    this.renderTempo();

    let prompt: HTMLElement;
    if (busy && !this.active) {
      prompt = h('div', { class: 'prompt muted' }, 'A normal solve is in progress. Cancel it to train look-ahead.');
    } else {
      switch (recorder.phase) {
        case 'scrambling':
          prompt = scrambleRow(recorder.tracker!);
          break;
        case 'inspection':
          prompt = h('div', { class: 'prompt' }, 'Inspect, then turn on a click. One turn per click, no filler turns.');
          break;
        case 'solving':
        case 'awaitEnd':
          prompt = h('div', { class: 'prompt' }, 'Solving F2L…');
          break;
        default:
          prompt = h('div', { class: 'prompt muted' },
            !cube ? 'Connect your cube to start.'
              : !recorder.synced ? 'Waiting for the cube…'
              : 'Press Start. The solve ends when F2L is done, and the next scramble starts from there.');
      }
    }
    clear(this.promptEl, prompt);
    this.renderLive();
    this.renderSession();
    if (this.metronome.running && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }
}
