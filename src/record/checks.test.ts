import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyMoves, parseAlg, solvedFacelets, toFaceletString } from '../cube/cube';
import { checkRecord } from './checks';
import { type SolveFixture } from './types';

const DIR = new URL('../../fixtures/solves/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('facelet order', () => {
  it('matches gan-web-bluetooth Kociemba strings', () => {
    // example from gan-web-bluetooth's toKociembaFacelets docs: state after F R
    expect(toFaceletString(applyMoves(solvedFacelets(), parseAlg('F R')))).toBe('UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB');
  });
});

describe.skipIf(files.length === 0)('recorded fixtures', () => {
  it.each(files)('%s passes capture checks', (file) => {
    const fixture = JSON.parse(readFileSync(new URL(file, DIR), 'utf8')) as SolveFixture;
    const failed = checkRecord(fixture.record).filter((r) => !r.ok);
    expect(failed).toEqual([]);
  });
});
