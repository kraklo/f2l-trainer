// Look-ahead training: scores a solve turned to a metronome, and adapts the tempo.
//
// Turns come from the cube's quarter turns (core frame, so whole-cube rotations are invisible):
// - two quarter turns of the same face and direction in quick succession are one half turn (as in the
//   reconstruction, but never across a beat);
// - turns that start together (an M is R and L' at once) are one event on one beat.
// A filler turn is one that achieves nothing: within a run of turns on one axis (U and D commute),
// whatever cancels out (U U', U U2 instead of U') is filler. A half turn split into two quarter turns
// in the same direction (U U, or r r across a rotation) is not filler: each quarter makes progress.
//
// The beat grid is the metronome's click times. A steady lag between click and turn (Bluetooth, the
// time a turn takes to register) is measured as the median offset and removed before judging.

import { DEFAULT_MERGE } from '../normalise/merge';
import { fitTimes } from '../normalise/timefit';
import { type Face, type LookaheadInfo, type RawMove, type SolveRecord } from '../record/types';

export interface RhythmEvent {
  /** Fitted host time of the event's first turn. */
  t: number;
  /** Indices into the record's moves. */
  src: number[];
  beat: number;
  /** Offset from that beat after removing the steady lag, in ms. */
  offsetMs: number;
  onBeat: boolean;
  /** Every turn in the event was filler. */
  filler: boolean;
}

export interface Rhythm {
  bpm: number;
  intervalMs: number;
  /** Steady lag from click to registered turn that was removed. */
  lagMs: number;
  events: RhythmEvent[];
  /** Beats from the first turn to the last. */
  beats: number;
  /** Beats with a turn on them. */
  hits: number;
  /** Beats without a turn (pauses). */
  missed: number;
  /** Events off the beat, or a second event on a beat already hit. */
  extra: number;
  /** Turns (half turns count once) and how many of them were filler. */
  turns: number;
  fillers: number;
  /** hits / (beats + extra): 1 means one turn on every beat and nothing else. */
  accuracy: number;
  clean: boolean;
}

/** Share of the beat a turn may be early or late and still count. */
export const BEAT_TOLERANCE = 0.25;
/** A solve passes at this accuracy with no filler. */
export const CLEAN_ACCURACY = 0.8;
/** Below this the tempo drops straight away. */
export const TOO_FAST_ACCURACY = 0.6;
/** Turns closer than this (and at most this share of a beat) are one event. */
const SAME_EVENT_MS = 100;
const SAME_EVENT_FRAC = 0.35;
/** Two quarter turns closer than this (and at most this share of a beat) are a half turn. */
const HALF_TURN_MS = DEFAULT_MERGE.halfTurnGapMs;
const HALF_TURN_FRAC = 0.5;

interface Turn {
  face: Face;
  /** Quarter turns, 1-3. */
  amount: number;
  t: number;
  src: number[];
  filler: boolean;
}

const AXIS: Record<Face, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

/** Quarter turns merged into turns: a quick second quarter in the same direction makes a half turn. */
export function mergeTurns(moves: RawMove[], times: number[], mergeMs: number): Turn[] {
  const turns: Turn[] = [];
  moves.forEach((m, i) => {
    const last = turns[turns.length - 1];
    if (last && last.face === m.face && last.amount === m.amount && last.src.length === 1 && times[i] - times[last.src[0]] <= mergeMs) {
      last.amount = 2;
      last.src.push(i);
    } else {
      turns.push({ face: m.face, amount: m.amount, t: times[i], src: [i], filler: false });
    }
  });
  return turns;
}

/**
 * Marks filler turns: in each run of same-axis turns, a face's turns net out to at most one turn, so
 * all but the last of them (all of them, when they cancel) are filler, unless they are just a half
 * turn done as two quarters in the same direction. Returns the filler count.
 */
export function markFillers(turns: Turn[]): number {
  let count = 0;
  for (let i = 0; i < turns.length; ) {
    let j = i;
    while (j < turns.length && AXIS[turns[j].face] === AXIS[turns[i].face]) j++;
    const run = turns.slice(i, j);
    for (const face of new Set(run.map((t) => t.face))) {
      const own = run.filter((t) => t.face === face);
      // r r across a rotation, or a slow U U: one half turn, not filler
      if (own.length === 2 && own.every((t) => t.amount === own[0].amount && t.amount !== 2)) continue;
      const net = own.reduce((s, t) => s + t.amount, 0) % 4;
      const wasted = net ? own.slice(0, -1) : own;
      for (const t of wasted) t.filler = true;
      count += wasted.length;
    }
    i = j;
  }
  return count;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export function scoreRhythm(moves: RawMove[], info: LookaheadInfo, times = fitTimes(moves).times): Rhythm {
  const interval = 60000 / info.bpm;
  const sameEvent = Math.min(SAME_EVENT_MS, interval * SAME_EVENT_FRAC);
  const turns = mergeTurns(moves, times, Math.min(HALF_TURN_MS, interval * HALF_TURN_FRAC));
  const fillers = markFillers(turns);

  const groups: Turn[][] = [];
  for (const t of turns) {
    const g = groups[groups.length - 1];
    if (g && t.t - g[0].t <= sameEvent) g.push(t);
    else groups.push([t]);
  }

  // Offsets wrap to [-interval/2, interval/2); their median is the steady lag.
  const phase = (t: number) => {
    const x = (t - info.beatZero) / interval;
    return (x - Math.round(x)) * interval;
  };
  const lagMs = median(groups.map((g) => phase(g[0].t)));
  const events: RhythmEvent[] = groups.map((g) => {
    const x = (g[0].t - lagMs - info.beatZero) / interval;
    const beat = Math.round(x);
    const offsetMs = (x - beat) * interval;
    return { t: g[0].t, src: g.flatMap((t) => t.src), beat, offsetMs, onBeat: Math.abs(offsetMs) <= interval * BEAT_TOLERANCE, filler: g.every((t) => t.filler) };
  });

  const hit = new Set<number>();
  let extra = 0;
  for (const e of events) {
    if (e.onBeat && !hit.has(e.beat)) hit.add(e.beat);
    else extra++;
  }
  const beats = events.length ? events[events.length - 1].beat - events[0].beat + 1 : 0;
  const accuracy = beats ? hit.size / (beats + extra) : 0;
  return {
    bpm: info.bpm,
    intervalMs: interval,
    lagMs,
    events,
    beats,
    hits: hit.size,
    missed: beats - hit.size,
    extra,
    turns: turns.length,
    fillers,
    accuracy,
    clean: accuracy >= CLEAN_ACCURACY && fillers === 0,
  };
}

export function recordRhythm(rec: SolveRecord): Rhythm | null {
  return rec.lookahead && rec.moves.length ? scoreRhythm(rec.moves, rec.lookahead) : null;
}

// ---- tempo ----

export interface TempoState {
  /** Tempo of the next solve, in turns per minute. */
  bpm: number;
  /** The last tempo passed (CLEAN_STREAK clean solves in a row), or null before the first pass. */
  comfortable: number | null;
  cleanStreak: number;
  failStreak: number;
}

export const DEFAULT_TEMPO: TempoState = { bpm: 60, comfortable: null, cleanStreak: 0, failStreak: 0 };
export const TEMPO_STEP = 5;
export const MIN_BPM = 20;
export const MAX_BPM = 400;
/** Clean solves in a row to move up, and failed ones in a row to move down. */
export const CLEAN_STREAK = 2;
export const FAIL_STREAK = 2;

export type TempoChange = 'up' | 'down' | null;

/** The tempo after a solve: up after a clean streak, down after a fail streak or a solve far too fast. */
export function nextTempo(s: TempoState, r: Pick<Rhythm, 'clean' | 'accuracy'>): { state: TempoState; change: TempoChange } {
  if (r.clean) {
    const cleanStreak = s.cleanStreak + 1;
    if (cleanStreak < CLEAN_STREAK) return { state: { ...s, cleanStreak, failStreak: 0 }, change: null };
    return { state: { bpm: Math.min(MAX_BPM, s.bpm + TEMPO_STEP), comfortable: s.bpm, cleanStreak: 0, failStreak: 0 }, change: 'up' };
  }
  const failStreak = s.failStreak + 1;
  if (failStreak < FAIL_STREAK && r.accuracy >= TOO_FAST_ACCURACY) return { state: { ...s, cleanStreak: 0, failStreak }, change: null };
  const bpm = Math.max(MIN_BPM, s.bpm - TEMPO_STEP);
  // A tempo you can no longer hold isn't comfortable any more.
  const comfortable = s.comfortable === null ? null : Math.min(s.comfortable, bpm);
  return { state: { bpm, comfortable, cleanStreak: 0, failStreak: 0 }, change: bpm < s.bpm ? 'down' : null };
}
