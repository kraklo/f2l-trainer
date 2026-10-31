import { describe, expect, it } from 'vitest';
import { type RawMove } from '../record/types';
import { fitTimes } from './timefit';

const move = (hostTs: number | null, cubeTs: number | null): RawMove => ({ face: 'R', amount: 1, hostTs, cubeTs, serial: 0 });

describe('fitTimes', () => {
  it('maps cube time onto host time, removing jitter', () => {
    // 60 s of turns with ±45 ms of Bluetooth jitter, and a cube clock running 0.1% slow
    const jitter = [30, -20, 45, 0, -35, 10, 25, -40];
    const moves = Array.from({ length: 120 }, (_, i) => move(1000 + i * 500 + jitter[i % jitter.length], i * 500 * 0.999));
    const fit = fitTimes(moves);
    expect(fit.slope).toBeCloseTo(1 / 0.999, 3);
    expect(fit.residualMs).toBeLessThan(40);
    fit.times.forEach((t, i) => expect(Math.abs(t - (1000 + i * 500))).toBeLessThan(30));
  });

  it('places moves without timestamps between their neighbours', () => {
    const fit = fitTimes([move(0, 0), move(null, null), move(null, null), move(300, 300)]);
    expect(fit.times).toEqual([0, 100, 200, 300]);
  });
});
