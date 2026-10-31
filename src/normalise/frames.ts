// Held frame from the gyro. "World" here is the solver's frame, anchored on the scramble grip:
// up is where white was (+Z), front where green was (−Y), right where red was (+X).
// An orientation o (body → world) puts the cube's own face f at world direction o·axis(f).

import { ORIENTATIONS, angleBetween, qconj, qmul, snap } from '../device/gyro';
import { type Face, type GyroSample, type Quat } from '../record/types';

type Vec = [number, number, number];

const AXIS: Record<Face, Vec> = { U: [0, 0, 1], D: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0], F: [0, -1, 0], B: [0, 1, 0] };
const FACE_LIST = Object.keys(AXIS) as Face[];

function rotate(q: Quat, v: Vec): Vec {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q));
  return [p[0], p[1], p[2]];
}

function faceAt(v: Vec): Face {
  let best: Face = 'U', bd = -2;
  for (const f of FACE_LIST) {
    const a = AXIS[f];
    const d = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
    if (d > bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

/** Held face for each of the cube's own (core) faces, in orientation `ORIENTATIONS[index]`. */
export const FACE_MAPS: Record<Face, Face>[] = ORIENTATIONS.map((o) => Object.fromEntries(FACE_LIST.map((f) => [f, faceAt(rotate(o, AXIS[f]))])) as Record<Face, Face>);

function axisAngle(axis: Vec, deg: number): Quat {
  const h = (deg * Math.PI) / 360;
  return [axis[0] * Math.sin(h), axis[1] * Math.sin(h), axis[2] * Math.sin(h), Math.cos(h)];
}

// Whole-cube rotations in the solver's frame: x turns like R, y like U, z like F (clockwise seen
// from that face, i.e. −90° about its outward axis).
const GENERATORS: [string, Quat][] = [
  ['x', axisAngle(AXIS.R, -90)],
  ['y', axisAngle(AXIS.U, -90)],
  ['z', axisAngle(AXIS.F, -90)],
];

/** Shortest x/y/z alg for each world-frame rotation, found by breadth-first search. */
const ROTATION_ALGS: { q: Quat; alg: string }[] = (() => {
  const out = [{ q: [0, 0, 0, 1] as Quat, alg: '' }];
  for (let i = 0; i < out.length; i++) {
    for (const [name, g] of GENERATORS) {
      let q = out[i].q;
      for (const suffix of ['', '2', "'"]) {
        q = qmul(g, q); // applying g after the current rotation
        if (!out.some((o) => angleBetween(o.q, q) < 1)) out.push({ q, alg: `${out[i].alg} ${name}${suffix}`.trim() });
      }
    }
  }
  return out;
})();

/** Rotation alg taking the cube from orientation index `from` to `to`. */
export function rotationAlg(from: number, to: number): string {
  const r = qmul(ORIENTATIONS[to], qconj(ORIENTATIONS[from]));
  return ROTATION_ALGS.find((o) => angleBetween(o.q, r) < 1)!.alg;
}

export interface FrameChange {
  t: number;
  index: number;
}

export interface TimelineOptions {
  /** A new orientation must be within this many degrees of square... */
  maxDeg: number;
  /** ...for this many consecutive samples. */
  confirm: number;
}

export const DEFAULT_TIMELINE: TimelineOptions = { maxDeg: 30, confirm: 2 };

/**
 * Snapped orientation over time. `pre` maps a raw quaternion into the solver's frame (pre ⊗ q).
 * Returns the orientation index after each accepted change, starting from the first confident sample.
 */
export function orientationTimeline(samples: GyroSample[], pre: Quat, opts = DEFAULT_TIMELINE): FrameChange[] {
  const out: FrameChange[] = [];
  let current = -1, candidate = -1, since = 0, count = 0;
  for (const s of samples) {
    const { index, angle } = snap(qmul(pre, s.q));
    if (angle > opts.maxDeg || index === current) {
      candidate = -1;
      continue;
    }
    if (index !== candidate) {
      candidate = index;
      since = s.hostTs;
      count = 0;
    }
    if (++count >= opts.confirm) {
      current = index;
      out.push({ t: since, index });
      candidate = -1;
    }
  }
  return out;
}

/**
 * Leftover tilt of the solving grip relative to the scramble grip, as a world-frame rotation T with
 * pre ⊗ q ≈ T ⊗ O for the allowed orientations O. Removing it (conj(T) ⊗ pre) squares up the grip.
 */
export function gripTilt(samples: GyroSample[], pre: Quat, allowed: number[]): Quat {
  const sum: Quat = [0, 0, 0, 0];
  for (const s of samples) {
    const rel = qmul(pre, s.q);
    let best: Quat | null = null, bestAngle = 46;
    for (const i of allowed) {
      const t = qmul(rel, qconj(ORIENTATIONS[i]));
      const a = angleBetween(t, [0, 0, 0, 1]);
      if (a < bestAngle) {
        bestAngle = a;
        best = t;
      }
    }
    if (!best) continue;
    const sign = best[3] < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) sum[k] += sign * best[k];
  }
  const n = Math.hypot(...sum);
  return n > 0 ? [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n] : [0, 0, 0, 1];
}

/** Orientation indices that put the cube's own face `core` at held face `held`. */
export function orientationsWith(core: Face, held: Face): number[] {
  return FACE_MAPS.flatMap((m, i) => (m[core] === held ? [i] : []));
}
