import { type GanCubeEvent } from 'gan-web-bluetooth';
import { describe, expect, it } from 'vitest';
import { applyMoves, solvedFacelets, toFaceletString } from '../cube/cube';
import { loadSolveFixture, solveFixtureNames } from '../test/fixtures';
import { Recorder } from './recorder';
import { type SolveFixture } from './types';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

function solvedEvent(): GanCubeEvent {
  return { type: 'FACELETS', timestamp: 0, serial: 0, facelets: SOLVED, state: { CP: [], CO: [], EP: [], EO: [] } };
}

/** Replays a fixture's recorded event stream through a fresh recorder. */
function replay(fx: SolveFixture, events = fx.events) {
  let requests = 0;
  const rec = new Recorder({ requestFacelets: () => requests++, hardware: () => fx.record.hardware });
  rec.handle(solvedEvent());
  rec.startScramble(fx.record.scramble, fx.record.startedAt);
  for (const e of events) rec.handle(e);
  return { rec, requests: () => requests };
}

describe('Recorder', () => {
  it('refuses to scramble before the cube has reported its state', () => {
    const rec = new Recorder({ requestFacelets: () => {}, hardware: () => ({ name: '', protocol: '', gyro: false }) });
    expect(rec.canScramble).toBe(false);
    expect(() => rec.startScramble('R U')).toThrow();
  });

  it('goes through every phase on a synthetic solve', () => {
    const rec = new Recorder({ requestFacelets: () => {}, hardware: () => ({ name: 'test', protocol: 'test', gyro: false }) });
    const phases: string[] = [];
    rec.on(() => phases.at(-1) !== rec.phase && phases.push(rec.phase));
    rec.handle(solvedEvent());
    rec.startScramble('R U');
    const move = (face: string, direction: number, t: number): GanCubeEvent =>
      ({ type: 'MOVE', timestamp: t, serial: t, face: 0, direction, move: face + (direction ? "'" : ''), localTimestamp: t, cubeTimestamp: t });
    rec.handle(move('R', 0, 1));
    rec.handle(move('U', 0, 2));
    rec.handle(move('U', 1, 3));
    rec.handle(move('R', 1, 4));
    expect(rec.phase).toBe('awaitEnd');
    rec.handle({ ...solvedEvent(), serial: 4 } as GanCubeEvent);
    expect(phases).toEqual(['idle', 'scrambling', 'inspection', 'solving', 'awaitEnd', 'done']);
    // no start facelets were reported, so the tracked scramble state stands in for them
    expect(rec.record?.startFacelets).toBe(toFaceletString(applyMoves(solvedFacelets(), 'R U')));
    expect(rec.record?.status).toBe('ok');
  });
});

describe.skipIf(solveFixtureNames.length === 0)('Recorder on recorded solves', () => {
  it.each(solveFixtureNames)('%s replays to the same solve', (name) => {
    const fx = loadSolveFixture(name);
    const { rec, requests } = replay(fx);
    expect(rec.phase).toBe('done');
    expect(rec.desyncs).toBe(0);
    const r = rec.record!;
    expect(r.status).toBe('ok');
    expect(r.moves).toEqual(fx.record.moves);
    expect(r.startFacelets).toBe(fx.record.startFacelets);
    expect(r.endFacelets).toBe(SOLVED);
    expect(r.scrambleMoves.length).toBeGreaterThanOrEqual(r.scramble.split(' ').length);
    // gyro now starts at the scramble, where the reference grip comes from
    expect(r.gyro.length).toBeGreaterThan(fx.record.gyro.length);
    expect(requests()).toBe(2);
  });

  it.each(solveFixtureNames)('%s is marked desynced when a solve turn is lost', (name) => {
    const fx = loadSolveFixture(name);
    const solveStart = fx.record.moves[0].hostTs!;
    const moves = fx.events.filter((e) => e.type === 'MOVE' && e.timestamp > solveStart);
    const dropped = moves[Math.floor(moves.length / 2)];
    const { rec } = replay(fx, fx.events.filter((e) => e !== dropped));
    // the cube's periodic state reports resync the tracker, so the solve still ends
    expect(rec.desyncs).toBeGreaterThan(0);
    expect(rec.phase).toBe('done');
    expect(rec.record!.status).toBe('desynced');
  });
});
