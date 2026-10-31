import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteSolve, exportAll, getSolve, importAll, listSolves, saveSolve } from './store';
import { type SolveRecord } from './types';

function solve(id: string, startedAt: number): SolveRecord {
  return {
    id, version: 1, startedAt, scramble: 'R', startFacelets: '', scrambleMoves: [], inspectionMoves: [], moves: [], gyro: [],
    hardware: { name: 'test', protocol: 'test', gyro: false }, status: 'ok',
  };
}

describe('solve store', () => {
  it('saves, lists oldest first, exports, imports and deletes', async () => {
    await saveSolve(solve('b', 2));
    await saveSolve(solve('a', 1));
    expect((await listSolves()).map((s) => s.id)).toEqual(['a', 'b']);
    expect((await getSolve('b'))?.startedAt).toBe(2);

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await deleteSolve('a');
    await deleteSolve('b');
    expect(await listSolves()).toEqual([]);

    expect(await importAll(backup)).toBe(2);
    expect((await listSolves()).map((s) => s.id)).toEqual(['a', 'b']);
    await expect(importAll({ app: 'zb-trainer' })).rejects.toThrow();
  });
});
