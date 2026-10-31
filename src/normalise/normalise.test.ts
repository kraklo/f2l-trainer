import { describe, expect, it } from 'vitest';
import { applyMoves, equalFacelets, FACES, normalized, parseAlg, solvedFacelets, type Facelets } from '../cube/cube';
import { crossSolved, slotName, slotSolved, slotsFor } from '../cube/pieces';
import { type Face } from '../record/types';
import { expectedOf, loadExpected, loadSolveFixture, replayFixture, solveFixtureNames } from '../test/fixtures';
import { FACE_MAPS } from './frames';
import { reconstruct, reconstructionAlg, type Reconstruction } from './normalise';

function stateAfter(scramble: string, r: Reconstruction, lastToken: number): Facelets {
  const alg = [r.inspection, ...r.tokens.slice(0, lastToken + 1).map((t) => t.move.base + ['', '', '2', "'"][t.move.amount])].join(' ');
  // centres back home = the cube's own frame, where the piece predicates apply
  return normalized(applyMoves(applyMoves(solvedFacelets(), scramble), parseAlg(alg)));
}

describe.skipIf(solveFixtureNames.length === 0).each(solveFixtureNames)('reconstruction of %s', (name) => {
  const record = replayFixture(loadSolveFixture(name));
  const r = reconstruct(record)!;

  it.runIf(loadExpected(name))('matches the hand-checked reconstruction', () => {
    expect(expectedOf(r)).toEqual(loadExpected(name));
  });

  it('solves the scramble', () => {
    const end = applyMoves(applyMoves(solvedFacelets(), record.scramble), reconstructionAlg(r));
    expect(equalFacelets(normalized(end), solvedFacelets())).toBe(true);
  });

  it('covers every token once, in order', () => {
    const covered = r.segments.flatMap((s) => Array.from({ length: Math.max(0, s.endIdx - s.startIdx + 1) }, (_, i) => s.startIdx + i));
    expect(covered).toEqual(r.tokens.map((_, i) => i));
    expect(r.segments.map((s) => s.kind)).toEqual(['cross', 'pair', 'pair', 'pair', 'pair', 'll']);
  });

  it('has the cross and each finished slot solved at its stage end', () => {
    const done = new Set<string>();
    for (const seg of r.segments.filter((s) => s.kind !== 'll')) {
      if (seg.slot) done.add(seg.slot);
      const state = stateAfter(record.scramble, r, seg.endIdx);
      expect(crossSolved(state, r.cross)).toBe(true);
      for (const slot of slotsFor(r.cross).filter((s) => done.has(slotName(s)))) expect(slotSolved(state, slot)).toBe(true);
    }
  });

  it('holds the cross on the bottom for most of F2L', () => {
    expect(r.diag.crossOnBottom).toBeGreaterThan(0.9);
    expect(r.diag.medianSnapDeg).toBeLessThan(25);
  });

  it('still reconstructs without gyro data', () => {
    const noGyro = reconstruct({ ...record, gyro: [] })!;
    expect(noGyro.diag.gyro).toBe(false);
    expect(noGyro.tokens.some((t) => t.rotation)).toBe(false);
    expect(FACE_MAPS[noGyro.tokens[0].frame][FACES[r.cross] as Face]).toBe('D');
    const end = applyMoves(applyMoves(solvedFacelets(), record.scramble), reconstructionAlg(noGyro));
    expect(equalFacelets(normalized(end), solvedFacelets())).toBe(true);
  });
});
