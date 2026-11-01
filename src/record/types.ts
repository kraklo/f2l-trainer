// Raw solve recordings. Only raw device data is stored; everything else is derived, so improved
// analysis can re-run over old solves.

import type { GanCubeEvent } from 'gan-web-bluetooth';

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export type Quat = [x: number, y: number, z: number, w: number];

/** A core-frame quarter turn as reported by the cube (white U, green F). */
export interface RawMove {
  face: Face;
  amount: 1 | 3;
  /** Host clock (performance.now) at packet arrival; null for moves recovered from history. */
  hostTs: number | null;
  /** Cube clock; null for some recovered moves. */
  cubeTs: number | null;
  serial: number;
}

/** Quaternion in the library's frame: right-handed, +X red, +Y blue, +Z white. */
export interface GyroSample {
  hostTs: number;
  q: Quat;
}

export interface Hardware {
  name: string;
  protocol: string;
  gyro: boolean;
  software?: string;
  hardware?: string;
}

export interface SolveRecord {
  id: string;
  version: 1;
  startedAt: number;
  scramble: string;
  /** Cube-reported facelets (Kociemba URFDLB) after scrambling. */
  startFacelets: string;
  /** Cube-reported facelets after the solve. */
  endFacelets?: string;
  /** Every turn made while scrambling, including corrections. */
  scrambleMoves: RawMove[];
  /** Turns made during inspection, before the solve started. */
  inspectionMoves: RawMove[];
  moves: RawMove[];
  /** From the start of scrambling; the scramble grip is the gyro reference. */
  gyro: GyroSample[];
  hardware: Hardware;
  status: 'ok' | 'desynced' | 'dnf';
  /** What the solve ends on: a solved cube (the default) or F2L done (look-ahead training). */
  goal?: 'solved' | 'f2l';
  /** Look-ahead training: the metronome the solve was turned to. */
  lookahead?: LookaheadInfo;
}

export interface LookaheadInfo {
  /** Turns per minute. */
  bpm: number;
  /** Host time (performance.now) of the metronome's first click. */
  beatZero: number;
}

/** A fixture: the derived record plus every device event from scramble start, for replaying the recorder. */
export interface SolveFixture {
  record: SolveRecord;
  events: GanCubeEvent[];
}

export function rawMoveToString(m: RawMove): string {
  return m.face + (m.amount === 3 ? "'" : '');
}
