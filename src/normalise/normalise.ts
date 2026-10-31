// Turns a raw recording into a held-frame reconstruction split into stages:
// fitted times → cross colour and stage ends (core frame) → per-solve gyro reference grip, squared up
// using the cross being on the bottom during F2L → held-frame turns and rotations → slice/wide/half
// merging → timed stage segments.

import { FACES, fromFaceletString, parseAlg, type Move } from '../cube/cube';
import { COLOUR_NAMES, slotName } from '../cube/pieces';
import { angleBetween, qconj, qmul, referenceGrip, snap } from '../device/gyro';
import { type Face, type Quat, type SolveRecord } from '../record/types';
import { segmentRaw } from '../segment/segment';
import { DEFAULT_TIMELINE, FACE_MAPS, gripTilt, orientationTimeline, orientationsWith, rotationAlg, type FrameChange, type TimelineOptions } from './frames';
import { DEFAULT_MERGE, mergeTokens, type MergeOptions, type Token } from './merge';
import { fitTimes } from './timefit';

export interface StageSegment {
  kind: 'cross' | 'pair' | 'll';
  /** Pair colours, e.g. 'green-red'. */
  slot?: string;
  /** Where the pair went in, in the held frame at the time: 'FR', 'FL', 'BR' or 'BL'. */
  heldSlot?: string;
  /** Token range, inclusive; empty when startIdx > endIdx (finished together with the previous stage). */
  startIdx: number;
  endIdx: number;
  turns: number;
  rotations: number;
  /** From the previous stage's last turn to this stage's last turn. */
  durationMs: number;
  /** Gap between the previous stage and this stage's first turn (look-ahead). */
  recognitionMs: number;
  /** Idle gaps over the pause threshold, including the recognition gap. */
  pauseMs: number;
  /** First turn to last turn. */
  execMs: number;
  tps: number;
}

export interface Reconstruction {
  /** Rotation from the scramble grip (white top, green front) to the grip at the first turn. */
  inspection: string;
  tokens: Token[];
  /** Cross colour as a core face id (0-5, URFDLB = white red green yellow orange blue). */
  cross: number;
  segments: StageSegment[];
  diag: {
    gyro: boolean;
    clockSlope: number;
    fitResidualMs: number;
    /** Tilt of the solving grip relative to the scramble grip that was removed. */
    tiltDeg: number;
    /** Median angle between solve-time gyro samples and the nearest square orientation. */
    medianSnapDeg: number;
    /** Share of F2L turns made with the cross colour held on D. */
    crossOnBottom: number;
    merged: number;
  };
}

export interface NormaliseOptions {
  timeline: TimelineOptions;
  merge: MergeOptions;
  pauseThresholdMs: number;
}

export const DEFAULT_NORMALISE: NormaliseOptions = { timeline: DEFAULT_TIMELINE, merge: DEFAULT_MERGE, pauseThresholdMs: 150 };

const IDENTITY: Quat = [0, 0, 0, 1];

export function reconstruct(rec: SolveRecord, opts = DEFAULT_NORMALISE): Reconstruction | null {
  if (!rec.moves.length) return null;
  const fit = fitTimes(rec.moves);
  const times = fit.times;
  const core: Move[] = rec.moves.map((m) => ({ base: m.face, amount: m.amount }));
  const seg = segmentRaw(fromFaceletString(rec.startFacelets), core);
  if (!seg) return null;
  const crossFace = FACES[seg.cross] as Face;
  const crossDown = orientationsWith(crossFace, 'D');

  // Gyro reference: the scramble grip, squared up so the cross sits on D during F2L.
  const solveStart = times[0];
  const scrambleEnd = rec.scrambleMoves?.at(-1)?.hostTs ?? solveStart;
  const ref = referenceGrip(rec.gyro.filter((g) => g.hostTs <= scrambleEnd));
  const after = rec.gyro.filter((g) => g.hostTs > scrambleEnd);
  let changes: FrameChange[] = [];
  let tilt: Quat = IDENTITY;
  let pre: Quat = IDENTITY;
  if (ref && after.length) {
    const pre0 = qconj(ref);
    const f2lEndT = times[Math.max(seg.f2lEnd, 0)];
    tilt = gripTilt(after.filter((g) => g.hostTs >= solveStart && g.hostTs <= f2lEndT), pre0, crossDown);
    pre = qmul(qconj(tilt), pre0);
    changes = orientationTimeline(after, pre, opts.timeline);
  }
  if (!changes.length) {
    // No gyro: hold the cross on D with the fewest rotations, and assume no rotations during the solve.
    const best = crossDown.reduce((a, b) => (rotationAlg(0, b).length < rotationAlg(0, a).length ? b : a));
    changes = [{ t: -Infinity, index: best }];
  }
  const frameAt = (t: number) => {
    let index = changes[0].index;
    for (const c of changes) {
      if (c.t > t) break;
      index = c.index;
    }
    return index;
  };

  // Held-frame tokens.
  const first = frameAt(solveStart);
  const raw: Token[] = [];
  let frame = first;
  rec.moves.forEach((m, i) => {
    const f = frameAt(times[i]);
    if (f !== frame) {
      const change = [...changes].reverse().find((c) => c.t <= times[i])!;
      for (const r of parseAlg(rotationAlg(frame, f))) raw.push({ move: r, t: change.t, tEnd: change.t, src: [], rotation: true, frame: f });
      frame = f;
    }
    raw.push({ move: { base: FACE_MAPS[f][m.face], amount: m.amount }, t: times[i], tEnd: times[i], src: [i], rotation: false, frame: f });
  });
  const { tokens, merged } = mergeTokens(raw, opts.merge);

  const rawToToken: number[] = [];
  tokens.forEach((tok, k) => tok.src.forEach((s) => (rawToToken[s] = k)));
  const tokenEnd = (rawEnd: number) => (rawEnd < 0 ? -1 : rawToToken[rawEnd]);

  // Stage segments.
  const segments: StageSegment[] = [];
  let prevEnd = -1;
  const addSegment = (kind: StageSegment['kind'], endIdx: number, extra: Partial<StageSegment> = {}) => {
    endIdx = Math.max(endIdx, prevEnd);
    segments.push({ kind, ...timing(tokens, prevEnd, endIdx, opts.pauseThresholdMs), ...extra });
    prevEnd = endIdx;
  };
  addSegment('cross', tokenEnd(seg.crossEnd));
  for (const { slot, end } of seg.slots) {
    const endIdx = tokenEnd(end);
    const held = FACE_MAPS[tokens[Math.max(endIdx, prevEnd, 0)]?.frame ?? first];
    addSegment('pair', endIdx, { slot: slotName(slot), heldSlot: heldSlotName(slot.faces.map((f) => held[FACES[f] as Face])) });
  }
  addSegment('ll', tokens.length - 1);

  // Diagnostics.
  const solveSamples = after.filter((g) => g.hostTs >= solveStart);
  const snaps = solveSamples.map((g) => snap(qmul(pre, g.q)).angle).sort((a, b) => a - b);
  const f2lTurns = tokens.slice(0, tokenEnd(seg.f2lEnd) + 1).filter((t) => !t.rotation);
  return {
    inspection: rotationAlg(0, first),
    tokens,
    cross: seg.cross,
    segments,
    diag: {
      gyro: !!ref && after.length > 0,
      clockSlope: fit.slope,
      fitResidualMs: fit.residualMs,
      tiltDeg: angleBetween(tilt, IDENTITY),
      medianSnapDeg: snaps.length ? snaps[Math.floor(snaps.length / 2)] : 0,
      crossOnBottom: f2lTurns.length ? f2lTurns.filter((t) => FACE_MAPS[t.frame][crossFace] === 'D').length / f2lTurns.length : 0,
      merged,
    },
  };
}

function timing(tokens: Token[], prevEnd: number, endIdx: number, pauseThreshold: number) {
  const startIdx = prevEnd + 1;
  const segTokens = tokens.slice(startIdx, endIdx + 1);
  const turns = segTokens.filter((t) => !t.rotation);
  const prevEndT = prevEnd >= 0 ? tokens[prevEnd].tEnd : (tokens[0]?.t ?? 0);
  const recognitionMs = turns.length ? Math.max(0, turns[0].t - prevEndT) : 0;
  let pauseMs = recognitionMs > pauseThreshold ? recognitionMs : 0;
  for (let i = 1; i < turns.length; i++) {
    const gap = turns[i].t - turns[i - 1].tEnd;
    if (gap > pauseThreshold) pauseMs += gap;
  }
  const durationMs = turns.length ? turns[turns.length - 1].tEnd - prevEndT : 0;
  return {
    startIdx,
    endIdx,
    turns: turns.length,
    rotations: segTokens.length - turns.length,
    durationMs,
    recognitionMs,
    pauseMs,
    execMs: turns.length ? turns[turns.length - 1].tEnd - turns[0].t : 0,
    tps: durationMs > 0 ? (turns.length * 1000) / durationMs : 0,
  };
}

function heldSlotName(faces: Face[]): string {
  const fb = faces.find((f) => f === 'F' || f === 'B');
  const rl = faces.find((f) => f === 'R' || f === 'L');
  return fb && rl ? fb + rl : faces.join('');
}

/** The reconstruction as one alg: inspection rotation, then every token. */
export function reconstructionAlg(r: Reconstruction): string {
  return [r.inspection, ...r.tokens.map((t) => t.move.base + ['', '', '2', "'"][t.move.amount])].filter(Boolean).join(' ');
}

export function colourName(face: number): string {
  return COLOUR_NAMES[face];
}
