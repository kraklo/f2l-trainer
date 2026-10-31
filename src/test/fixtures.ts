// Loads the real recordings in fixtures/ for tests.

import { readdirSync, readFileSync } from 'node:fs';
import { type GyroSample, type SolveFixture } from '../record/types';

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
