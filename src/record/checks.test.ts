import { describe, expect, it } from 'vitest';
import { applyMoves, parseAlg, solvedFacelets, toFaceletString } from '../cube/cube';
import { loadSolveFixture, solveFixtureNames } from '../test/fixtures';
import { checkRecord } from './checks';

describe('facelet order', () => {
  it('matches gan-web-bluetooth Kociemba strings', () => {
    // example from gan-web-bluetooth's toKociembaFacelets docs: state after F R
    expect(toFaceletString(applyMoves(solvedFacelets(), parseAlg('F R')))).toBe('UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB');
  });
});

describe.skipIf(solveFixtureNames.length === 0)('recorded fixtures', () => {
  it.each(solveFixtureNames)('%s passes capture checks', (name) => {
    const failed = checkRecord(loadSolveFixture(name).record).filter((r) => !r.ok);
    expect(failed).toEqual([]);
  });
});
