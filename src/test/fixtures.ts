// Loads the real recordings in fixtures/ for tests.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { moveToString } from '../cube/cube';
import { COLOUR_NAMES } from '../cube/pieces';
import { type Reconstruction } from '../normalise/normalise';
import { Recorder } from '../record/recorder';
import { type GyroSample, type SolveFixture, type SolveRecord } from '../record/types';

const SOLVES = new URL('../../fixtures/solves/', import.meta.url);
const GYRO = new URL('../../fixtures/gyro/', import.meta.url);

export const solveFixtureNames = readdirSync(SOLVES).filter((f) => f.endsWith('.json')).sort();

export function loadSolveFixture(name: string): SolveFixture {
  return JSON.parse(readFileSync(new URL(name, SOLVES), 'utf8')) as SolveFixture;
}

export interface GyroTestFixture {
  startedAt: number;
  gyro: GyroSample[];
}

export function loadGyroTests(): GyroTestFixture[] {
  return readdirSync(GYRO)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(new URL(f, GYRO), 'utf8')) as GyroTestFixture);
}

/**
 * The fixture's solve as the current recorder produces it, by replaying the recorded event stream.
 * (Fixture records were saved by older code; the events are the source of truth.)
 */
export function replayFixture(fx: SolveFixture): SolveRecord {
  const rec = new Recorder({ requestFacelets() {}, hardware: () => fx.record.hardware });
  rec.handle({ type: 'FACELETS', timestamp: 0, serial: 0, facelets: SOLVED, state: { CP: [], CO: [], EP: [], EO: [] } });
  rec.startScramble(fx.record.scramble, fx.record.startedAt);
  for (const e of fx.events) rec.handle(e);
  if (!rec.record) throw new Error('fixture did not replay to a finished solve');
  return rec.record;
}

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

/** The hand-checked part of a reconstruction: cross colour, inspection rotation, and cross and pairs. */
export interface ExpectedReconstruction {
  cross: string;
  inspection: string;
  stages: { kind: string; slot?: string; heldSlot?: string; alg: string }[];
}

const EXPECTED = new URL('../../fixtures/expected/', import.meta.url);

export function expectedOf(r: Reconstruction): ExpectedReconstruction {
  return {
    cross: COLOUR_NAMES[r.cross],
    inspection: r.inspection,
    stages: r.segments
      .filter((s) => s.kind !== 'll')
      .map((s) => ({ kind: s.kind, slot: s.slot, heldSlot: s.heldSlot, alg: r.tokens.slice(s.startIdx, s.endIdx + 1).map((t) => moveToString(t.move)).join(' ') })),
  };
}

export function loadExpected(name: string): ExpectedReconstruction | null {
  const url = new URL(name, EXPECTED);
  return existsSync(url) ? (JSON.parse(readFileSync(url, 'utf8')) as ExpectedReconstruction) : null;
}

export function writeExpected(name: string, e: ExpectedReconstruction) {
  mkdirSync(EXPECTED, { recursive: true });
  writeFileSync(new URL(name, EXPECTED), JSON.stringify(e, null, 2) + '\n');
}
