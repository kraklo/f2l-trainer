import { describe, expect, it } from 'vitest';
import { applyMoves, FACES, solvedFacelets } from '../cube/cube';
import { ORIENTATIONS } from '../device/gyro';
import { type Face } from '../record/types';
import { FACE_MAPS, orientationsWith, rotationAlg } from './frames';

const CENTRES = [4, 13, 22, 31, 40, 49];

describe('held frames', () => {
  it('names each orientation with a rotation that matches its face map', () => {
    ORIENTATIONS.forEach((_, i) => {
      const state = applyMoves(solvedFacelets(), rotationAlg(0, i));
      for (const core of FACES as unknown as Face[]) {
        // the cube's own face `core` (colour id = its index) now sits at held face FACE_MAPS[i][core]
        expect(state[CENTRES[FACES.indexOf(FACE_MAPS[i][core])]]).toBe(FACES.indexOf(core));
      }
    });
  });

  it('composes rotations between orientations', () => {
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 24; j++) {
        const viaI = applyMoves(solvedFacelets(), `${rotationAlg(0, i)} ${rotationAlg(i, j)}`);
        const direct = applyMoves(solvedFacelets(), rotationAlg(0, j));
        expect(CENTRES.map((c) => viaI[c])).toEqual(CENTRES.map((c) => direct[c]));
      }
    }
  });

  it('uses single-move names for quarter rotations', () => {
    expect(ORIENTATIONS.map((_, i) => rotationAlg(0, i)).filter((a) => !a.includes(' ')).sort()).toEqual(
      ['', 'x', 'x2', "x'", 'y', 'y2', "y'", 'z', 'z2', "z'"].sort(),
    );
    expect(orientationsWith('D', 'D')).toHaveLength(4);
  });
});
