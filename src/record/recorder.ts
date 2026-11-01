// Solve recorder: idle → scrambling → inspection → solving → awaitEnd → done.
// Driven purely by device events, so recorded event streams replay through it in tests.

import { type GanCubeEvent } from 'gan-web-bluetooth';
import { applyMove, equalFacelets, fromFaceletString, solvedFacelets, toFaceletString, type Facelets } from '../cube/cube';
import { crossSolved, slotSolved, slotsFor } from '../cube/pieces';
import { checkRecord, isDesynced } from './checks';
import { ScrambleTracker } from './scramble';
import { type Face, type GyroSample, type Hardware, type RawMove, type SolveRecord } from './types';

export type Phase = 'idle' | 'scrambling' | 'inspection' | 'solving' | 'awaitEnd' | 'done';

export interface ScrambleOptions {
  /** What ends the solve: a solved cube (default) or F2L done on any colour. */
  goal?: 'solved' | 'f2l';
  /**
   * Scrambling from the current state rather than from solved: the same end state as a scramble from
   * solved, which is what the record stores.
   */
  fromSolved?: string;
}

/** F2L done on some colour. */
export function f2lDone(state: Facelets): boolean {
  for (let c = 0; c < 6; c++) if (crossSolved(state, c) && slotsFor(c).every((s) => slotSolved(state, s))) return true;
  return false;
}

export interface RecorderOptions {
  requestFacelets(): void;
  hardware(): Hardware;
}

const RECORDING: Phase[] = ['scrambling', 'inspection', 'solving', 'awaitEnd'];

export class Recorder {
  phase: Phase = 'idle';
  /** Tracked core-frame cube state. */
  state: Facelets = solvedFacelets();
  /** Whether the cube has reported its state since connecting. */
  synced = false;
  tracker: ScrambleTracker | null = null;
  /** The finished solve, once phase is 'done'. */
  record: SolveRecord | null = null;
  /** Every device event since the scramble started. */
  events: GanCubeEvent[] = [];
  /** Times the cube's reported state disagreed with the tracked one during this recording. */
  desyncs = 0;

  private scramble = '';
  private goal: 'solved' | 'f2l' = 'solved';
  private startedAt = 0;
  private startFacelets = '';
  private scrambleMoves: RawMove[] = [];
  private moves: RawMove[] = [];
  private gyro: GyroSample[] = [];
  private listeners: (() => void)[] = [];
  /** Serial of the last state change seen (move or facelets), to line facelets up with moves. */
  private serial: number | null = null;

  constructor(private opts: RecorderOptions) {}

  on(fn: () => void) {
    this.listeners.push(fn);
  }

  get canScramble(): boolean {
    return this.synced && (this.phase === 'idle' || this.phase === 'done') && equalFacelets(this.state, solvedFacelets());
  }

  /** Turns since the solve started. */
  get solveMoves(): readonly RawMove[] {
    return this.moves;
  }

  get moveCount(): number {
    return this.moves.length;
  }

  /** Host time of the first solving turn. */
  get solveStart(): number | undefined {
    return this.moves[0]?.hostTs ?? undefined;
  }

  /** Whether a scramble can start from the cube's current state (see ScrambleOptions.fromSolved). */
  get canRescramble(): boolean {
    return this.synced && (this.phase === 'idle' || this.phase === 'done');
  }

  startScramble(scramble: string, startedAt = Date.now(), opts: ScrambleOptions = {}) {
    if (opts.fromSolved === undefined ? !this.canScramble : !this.canRescramble) {
      throw new Error('The cube must be connected and solved to start a scramble');
    }
    this.scramble = opts.fromSolved ?? scramble;
    this.goal = opts.goal ?? 'solved';
    this.startedAt = startedAt;
    this.startFacelets = '';
    this.scrambleMoves = [];
    this.moves = [];
    this.gyro = [];
    this.events = [];
    this.desyncs = 0;
    this.record = null;
    this.tracker = new ScrambleTracker(scramble, this.state);
    this.setPhase('scrambling');
  }

  cancel() {
    this.tracker = null;
    this.setPhase('idle');
  }

  handle(e: GanCubeEvent) {
    if (RECORDING.includes(this.phase)) this.events.push(e);
    if (e.type === 'GYRO') {
      if (RECORDING.includes(this.phase)) {
        const q = e.quaternion;
        this.gyro.push({ hostTs: e.timestamp, q: [q.x, q.y, q.z, q.w] });
      }
    } else if (e.type === 'FACELETS') {
      this.onFacelets(e.facelets, e.serial);
    } else if (e.type === 'MOVE') {
      this.onMove({ face: e.move[0] as Face, amount: e.direction === 1 ? 3 : 1, hostTs: e.localTimestamp, cubeTs: e.cubeTimestamp, serial: e.serial });
    }
  }

  /** Ends the solve without cube-reported end facelets (e.g. they never arrived). */
  finish(endFacelets?: string) {
    const record: SolveRecord = {
      id: `${this.startedAt}`,
      version: 1,
      startedAt: this.startedAt,
      scramble: this.scramble,
      startFacelets: this.startFacelets,
      endFacelets,
      scrambleMoves: this.scrambleMoves,
      inspectionMoves: [],
      moves: this.moves,
      gyro: this.gyro,
      hardware: { ...this.opts.hardware() },
      status: 'ok',
    };
    if (this.goal !== 'solved') record.goal = this.goal;
    if (this.desyncs > 0 || isDesynced(checkRecord(record))) record.status = 'desynced';
    this.record = record;
    this.tracker = null;
    this.setPhase('done');
  }

  private onFacelets(facelets: string, serial: number) {
    // A report can run ahead of the moves: after a dropped packet the cube's state already includes
    // moves the library is still recovering from history. Only compare once the moves have caught up.
    if (this.synced && serial !== this.serial) return;
    this.serial = serial;
    const reported = fromFaceletString(facelets);
    if (this.phase === 'inspection' && !this.startFacelets) this.startFacelets = facelets;
    if (!equalFacelets(reported, this.state)) {
      if (this.synced && RECORDING.includes(this.phase)) this.desyncs++;
      this.state = reported;
      if (this.tracker) this.tracker.state = reported;
    }
    this.synced = true;
    if (this.phase === 'awaitEnd') this.finish(facelets);
    else this.emit();
  }

  private onMove(m: RawMove) {
    if (this.phase === 'awaitEnd') this.finish(); // turned before the end state arrived
    this.serial = m.serial;
    this.state = applyMove(this.state, { base: m.face, amount: m.amount });

    if (this.phase === 'scrambling' && this.tracker) {
      this.scrambleMoves.push(m);
      this.tracker.move({ base: m.face, amount: m.amount });
      if (this.tracker.done) {
        this.setPhase('inspection');
        this.opts.requestFacelets();
      }
    } else if (this.phase === 'inspection' || this.phase === 'solving') {
      if (this.phase === 'inspection') {
        // facelets normally arrive right after scrambling; fall back to the tracked state
        if (!this.startFacelets && this.tracker) this.startFacelets = toFaceletString(this.tracker.target);
        this.phase = 'solving';
      }
      this.moves.push(m);
      if (this.goal === 'f2l' ? f2lDone(this.state) : equalFacelets(this.state, solvedFacelets())) {
        this.setPhase('awaitEnd');
        this.opts.requestFacelets();
      }
    }
    this.emit();
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
