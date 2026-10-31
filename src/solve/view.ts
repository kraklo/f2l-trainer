// Seeing the cube from another orientation. Solvers work with the cross on D; a "view" is the cube
// state after a whole-cube rotation, recoloured so its centres read as home. Moves found in a view are
// exactly what a solver holding the cube that way would turn.

import { applyMoves, rotationFor, solvedFacelets, type Facelets } from '../cube/cube';

export interface View {
  /** Rotation from the cube's own frame (white top, green front) to this view. */
  rotation: string;
  facelets: Facelets;
  /** Original colour (core face id) at each of the view's faces, URFDLB. */
  colours: number[];
}

const CENTRES = [4, 13, 22, 31, 40, 49];
const OPPOSITE = [3, 4, 5, 0, 1, 2];

/** The shortest rotation alg equivalent to `rotation` (e.g. "x2 y y'" → "x2"). */
export function simplifyRotation(rotation: string): string {
  const r = applyMoves(solvedFacelets(), rotation);
  return rotationFor(r[CENTRES[0]], r[CENTRES[2]]) ?? rotation;
}

export function viewFrom(core: Facelets, rotation: string): View {
  rotation = simplifyRotation(rotation);
  const rotated = applyMoves(core, rotation);
  const colours = CENTRES.map((c) => rotated[c]);
  const recolour = new Array<number>(6);
  colours.forEach((col, face) => (recolour[col] = face));
  return { rotation, facelets: rotated.map((v) => recolour[v]), colours };
}

/** A view with `cross` on D, keeping `front` in front when possible (else the first that fits). */
export function crossView(core: Facelets, cross: number, front = 2): View {
  const fronts = [front, 2, 1, 5, 4, 0, 3].filter((f) => f !== cross && f !== OPPOSITE[cross]);
  for (const f of fronts) {
    const rot = rotationFor(OPPOSITE[cross], f);
    if (rot !== null) return viewFrom(core, rot);
  }
  throw new Error('no view');
}
