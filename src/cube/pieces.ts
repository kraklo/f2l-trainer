// Piece-level predicates on the sticker model (centres home, i.e. core frame): cross and F2L slots
// for any cross colour.

import { POS, type Facelets } from './cube';

export const COLOUR_NAMES = ['white', 'red', 'green', 'yellow', 'orange', 'blue']; // by face id URFDLB

const faceOf = (i: number) => Math.floor(i / 9);

/** Sticker indices of each cubie, grouped by position. */
const CUBIES: number[][] = (() => {
  const groups = new Map<string, number[]>();
  POS.forEach((p, i) => {
    const k = p.join(',');
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  return [...groups.values()];
})();

const EDGES = CUBIES.filter((c) => c.length === 2);
const CORNERS = CUBIES.filter((c) => c.length === 3);

function pieceSolved(state: Facelets, stickers: number[]): boolean {
  return stickers.every((i) => state[i] === faceOf(i));
}

export interface Slot {
  cross: number;
  /** The two side faces the slot sits between. */
  faces: [number, number];
  corner: number[];
  edge: number[];
}

const touches = (piece: number[], face: number) => piece.some((i) => faceOf(i) === face);

export function crossEdges(cross: number): number[][] {
  return EDGES.filter((e) => touches(e, cross));
}

/** The four F2L slots for a cross colour. */
export function slotsFor(cross: number): Slot[] {
  return CORNERS.filter((c) => touches(c, cross)).map((corner) => {
    const [a, b] = corner.map(faceOf).filter((f) => f !== cross);
    const edge = EDGES.find((e) => touches(e, a) && touches(e, b))!;
    return { cross, faces: [a, b], corner, edge };
  });
}

export function crossSolved(state: Facelets, cross: number): boolean {
  return crossEdges(cross).every((e) => pieceSolved(state, e));
}

export function slotSolved(state: Facelets, slot: Slot): boolean {
  return pieceSolved(state, slot.corner) && pieceSolved(state, slot.edge);
}

export function slotName(slot: Slot): string {
  return slot.faces.map((f) => COLOUR_NAMES[f]).join('-');
}
