import { type GanCubeEvent } from 'gan-web-bluetooth';
import { cube3x3x3 } from 'cubing/puzzles';
import { describe, expect, it } from 'vitest';
import { algToString, applyMoves, equalFacelets, parseAlg, solvedFacelets, toFaceletString } from '../cube/cube';
import { checkRecord, isDesynced } from '../record/checks';
import { f2lDone, Recorder } from '../record/recorder';
import { type Face, type RawMove } from '../record/types';
import { segmentRaw } from '../segment/segment';
import { analyse } from '../solve/analyse';
import { buildTables } from '../solve/tables';
import { loadSolveFixture, solveFixtureNames } from '../test/fixtures';
import { randomAlgs } from '../test/random';
import { buildSteps } from '../ui/steps';
import { patternData } from './rescramble';
import { CLEAN_STREAK, DEFAULT_TEMPO, FAIL_STREAK, nextTempo, scoreRhythm, TEMPO_STEP, type TempoState } from './rhythm';

/** Raw quarter turns at the given times (U2 as two quick quarters). */
function moves(spec: [string, number][]): RawMove[] {
  let serial = 0;
  return spec.flatMap(([m, t]) => {
    const { base, amount } = parseAlg(m)[0];
    const q = (amount === 3 ? 3 : 1) as 1 | 3;
    const one = (dt: number): RawMove => ({ face: base as Face, amount: q, hostTs: t + dt, cubeTs: t + dt, serial: serial++ });
    return amount === 2 ? [one(0), one(30)] : [one(0)];
  });
}

/** One turn per beat at 120 bpm (500 ms), with an optional steady lag. */
function onBeat(alg: string, lag = 0, start = 1000): [string, number][] {
  return alg.split(' ').map((m, i) => [m, start + i * 500 + lag]);
}

const INFO = { bpm: 120, beatZero: 0 };

describe('scoreRhythm', () => {
  it('scores one turn on every beat as clean, with the steady lag removed', () => {
    const r = scoreRhythm(moves(onBeat("R U R' U' F2 D", 60)), INFO);
    expect(r.turns).toBe(6); // F2 is one turn
    expect(r.beats).toBe(6);
    expect(r.hits).toBe(6);
    expect(r.missed).toBe(0);
    expect(r.fillers).toBe(0);
    expect(Math.round(r.lagMs)).toBe(60);
    expect(r.accuracy).toBe(1);
    expect(r.clean).toBe(true);
  });

  it('counts a pause as missed beats', () => {
    const spec = onBeat("R U R' U'");
    spec[2][1] += 1000; // two beats late, and so is everything after
    spec[3][1] += 1000;
    const r = scoreRhythm(moves(spec), INFO);
    expect(r.beats).toBe(6);
    expect(r.missed).toBe(2);
    expect(r.accuracy).toBeCloseTo(4 / 6);
    expect(r.clean).toBe(false);
  });

  it('counts turns between the beats as off the beat', () => {
    const spec = onBeat("R U R' U' R U");
    spec[3][1] += 250; // half a beat late
    const r = scoreRhythm(moves(spec), INFO);
    expect(r.events[3].onBeat).toBe(false);
    expect(r.extra).toBe(1);
    expect(r.missed).toBe(1);
  });

  it('flags turns that cancel as filler', () => {
    const r = scoreRhythm(moves(onBeat("U U' R U R'")), INFO);
    expect(r.fillers).toBe(2);
    expect(r.events.map((e) => e.filler)).toEqual([true, true, false, false, false]);
    expect(r.clean).toBe(false);
  });

  it('flags the wasted part of a same-axis run, through the opposite face', () => {
    // U D U2 nets to U' D: one U turn is wasted
    const r = scoreRhythm(moves(onBeat("U D U2 R")), INFO);
    expect(r.fillers).toBe(1);
    expect(r.events.map((e) => e.filler)).toEqual([true, false, false, false]);
  });

  it('treats simultaneous turns (a slice) as one beat and not as filler', () => {
    const spec: [string, number][] = [['R', 1000], ["L'", 1020], ['U', 1500], ['R', 2000]];
    const r = scoreRhythm(moves(spec), INFO);
    expect(r.events).toHaveLength(3);
    expect(r.fillers).toBe(0);
    expect(r.clean).toBe(true);
  });
});

describe('nextTempo', () => {
  const clean = { clean: true, accuracy: 0.95 };
  const missed = { clean: false, accuracy: 0.7 };
  const hopeless = { clean: false, accuracy: 0.3 };
  const run = (s: TempoState, rs: { clean: boolean; accuracy: number }[]) => rs.reduce((x, r) => nextTempo(x, r).state, s);

  it('goes up after a clean streak and remembers the tempo passed', () => {
    const s = run(DEFAULT_TEMPO, Array(CLEAN_STREAK).fill(clean));
    expect(s.bpm).toBe(DEFAULT_TEMPO.bpm + TEMPO_STEP);
    expect(s.comfortable).toBe(DEFAULT_TEMPO.bpm);
  });

  it('goes down after a fail streak, or straight away when far too fast', () => {
    expect(run(DEFAULT_TEMPO, Array(FAIL_STREAK).fill(missed)).bpm).toBe(DEFAULT_TEMPO.bpm - TEMPO_STEP);
    expect(nextTempo(DEFAULT_TEMPO, hopeless)).toMatchObject({ change: 'down', state: { bpm: DEFAULT_TEMPO.bpm - TEMPO_STEP } });
  });

  it('a miss breaks a clean streak', () => {
    const s = run(DEFAULT_TEMPO, [clean, missed, clean]);
    expect(s.bpm).toBe(DEFAULT_TEMPO.bpm);
    expect(s.cleanStreak).toBe(1);
  });

  it('drops the comfortable tempo when it can no longer be held', () => {
    const s = run({ bpm: 85, comfortable: 80, cleanStreak: 0, failStreak: 0 }, [hopeless, hopeless]);
    expect(s.bpm).toBe(75);
    expect(s.comfortable).toBe(75);
  });
});

describe('patternData', () => {
  it('agrees with cubing.js KPuzzle on random states', async () => {
    const kp = await cube3x3x3.kpuzzle();
    for (const alg of randomAlgs(300, 25, 3)) {
      const want = kp.defaultPattern().applyAlg(alg).patternData;
      const got = patternData(applyMoves(solvedFacelets(), alg));
      expect(got.EDGES).toEqual({ pieces: want.EDGES.pieces, orientation: want.EDGES.orientation });
      expect(got.CORNERS).toEqual({ pieces: want.CORNERS.pieces, orientation: want.CORNERS.orientation });
    }
  });
});

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

describe.skipIf(!solveFixtureNames.length)('look-ahead recording', () => {
  const fx = loadSolveFixture(solveFixtureNames[0]);
  const rec = new Recorder({ requestFacelets() {}, hardware: () => fx.record.hardware });
  rec.handle({ type: 'FACELETS', timestamp: 0, serial: 0, facelets: SOLVED, state: { CP: [], CO: [], EP: [], EO: [] } });
  rec.startScramble(fx.record.scramble, fx.record.startedAt, { goal: 'f2l' });
  for (const e of fx.events) {
    rec.handle(e);
    if (rec.phase === 'awaitEnd') break;
  }
  rec.finish();
  const first = rec.record!;

  it('ends the solve the moment F2L is done', () => {
    const all = fx.record.moves.map((m) => ({ base: m.face, amount: m.amount }));
    const seg = segmentRaw(applyMoves(solvedFacelets(), fx.record.scramble), all)!;
    expect(first.goal).toBe('f2l');
    expect(first.moves).toHaveLength(seg.f2lEnd + 1);
    expect(f2lDone(rec.state)).toBe(true);
  });

  it('analyses an F2L-only solve without a last layer step', () => {
    const a = analyse(buildTables(), first)!;
    expect(a.recon.segments.at(-1)!.turns).toBe(0);
    expect(buildSteps(first, a).map((s) => s.key)).toEqual(['overview', 'cross', 'pair-1', 'pair-2', 'pair-3', 'pair-4']);
  });

  it('scrambles again from the unsolved last layer and records a scramble from solved', () => {
    const shown = "R U2 F' L D2 B R' U F2";
    const here = algToString([...parseAlg(first.scramble), ...first.moves.map((m) => ({ base: m.face, amount: m.amount }))]);
    const fromSolved = `${here} ${shown}`;
    expect(rec.canScramble).toBe(false);
    expect(rec.canRescramble).toBe(true);
    rec.startScramble(shown, 1, { goal: 'f2l', fromSolved });
    let t = 1e9;
    const move = (m: string): GanCubeEvent => {
      t += 100;
      return { type: 'MOVE', timestamp: t, serial: t, face: 0, direction: m.endsWith("'") ? 1 : 0, move: m, localTimestamp: t, cubeTimestamp: t };
    };
    for (const m of parseAlg(shown)) for (let q = 0; q < (m.amount === 2 ? 2 : 1); q++) rec.handle(move(m.base + (m.amount === 3 ? "'" : '')));
    expect(rec.phase).toBe('inspection');
    rec.handle(move('R')); // the first solving turn
    rec.finish(toFaceletString(rec.state));
    const second = rec.record!;
    expect(second.scramble).toBe(fromSolved);
    expect(equalFacelets(applyMoves(solvedFacelets(), second.scramble), applyMoves(solvedFacelets(), fromSolved))).toBe(true);
    expect(isDesynced(checkRecord(second))).toBe(false);
  });
});
