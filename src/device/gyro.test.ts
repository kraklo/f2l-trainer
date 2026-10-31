import { describe, expect, it } from 'vitest';
import { type GyroSample } from '../record/types';
import { loadGyroTests, loadSolveFixture, solveFixtureNames } from '../test/fixtures';
import { ORIENTATIONS, angleBetween, referenceGrip, relative, snap } from './gyro';

function sampleAt(gyro: GyroSample[], seconds: number): GyroSample {
  const t = gyro[0].hostTs + seconds * 1000;
  return gyro.reduce((a, b) => (Math.abs(b.hostTs - t) < Math.abs(a.hostTs - t) ? b : a));
}

describe('orientations', () => {
  it('has 24 distinct orientations starting at identity', () => {
    expect(ORIENTATIONS).toHaveLength(24);
    expect(snap([0, 0, 0, 1])).toEqual({ index: 0, angle: 0 });
    for (let i = 0; i < 24; i++) {
      for (let j = i + 1; j < 24; j++) expect(angleBetween(ORIENTATIONS[i], ORIENTATIONS[j])).toBeGreaterThan(89);
    }
  });
});

describe('gyro test recording', () => {
  // Still poses (seconds from start): square grip, y, y2, y', back, x, back, z, back.
  const poses = [2, 7.5, 13.5, 19, 24.5, 30, 35, 39.5, 44];
  it.each(loadGyroTests())('snaps each still pose to a square orientation', (test) => {
    const ref = sampleAt(test.gyro, poses[0]).q;
    const snaps = poses.map((t) => snap(relative(ref, sampleAt(test.gyro, t).q)));
    for (const s of snaps) expect(s.angle).toBeLessThan(15);
    const [, y, y2, yi, back1, x, back2, z, back3] = snaps.map((s) => s.index);
    expect([back1, back2, back3]).toEqual([0, 0, 0]);
    expect(new Set([0, y, y2, yi, x, z]).size).toBe(6);
  });
});

describe.skipIf(solveFixtureNames.length === 0)('reference grip from the scramble', () => {
  it.each(solveFixtureNames)('%s: solve samples sit near square orientations', (name) => {
    const { record } = loadSolveFixture(name);
    const solveStart = record.moves[0].hostTs!;
    const gyro = record.gyro.filter((g) => g.hostTs >= solveStart);
    const ref = referenceGrip(
      loadSolveFixture(name).events.flatMap((e) =>
        e.type === 'GYRO' && e.timestamp < solveStart ? [{ hostTs: e.timestamp, q: [e.quaternion.x, e.quaternion.y, e.quaternion.z, e.quaternion.w] as GyroSample['q'] }] : []),
    )!;
    const angles = gyro.map((g) => snap(relative(ref, g.q)).angle).sort((a, b) => a - b);
    expect(angles[Math.floor(angles.length / 2)]).toBeLessThan(30);
  });
});
