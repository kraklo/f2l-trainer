// Isometric F2L pair diagram (adapted from zb-trainer): U, F and R faces, with everything except
// the centres and the pair's two pieces greyed out.

import { NORMAL, POS, type Facelets } from '../cube/cube';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const COLOUR_HEX = ['#ffffff', '#e0262c', '#16a34a', '#facc15', '#f97316', '#2563eb'];
export const GREY = '#4b5563';

/** Sticker indices grouped by cubie, for each sticker. */
const CUBIE_OF: number[][] = (() => {
  const groups = new Map<string, number[]>();
  POS.forEach((p, i) => groups.set(p.join(','), [...(groups.get(p.join(',')) ?? []), i]));
  return POS.map((p) => groups.get(p.join(','))!);
})();

/**
 * Pair diagram for a view with the pair's slot at FR: `colours` maps the view's face ids to real
 * colours (core face ids). The FR pair is the corner coloured D/F/R and the edge coloured F/R.
 */
export function pairDiagram(state: Facelets, colours: number[]): SVGSVGElement {
  const isPair = (i: number) => {
    const set = CUBIE_OF[i].map((j) => state[j]).sort().join(',');
    return set === '1,2,3' || set === '1,2';
  };
  const fill = (i: number) => (i % 9 === 4 || isPair(i) ? COLOUR_HEX[colours[state[i]]] : GREY);
  const proj = (x: number, y: number, z: number) => [(x - z) * 0.866, (x + z) * 0.5 - y];
  const polys: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < 54; i++) {
    const n = NORMAL[i];
    if (!(n[0] === 1 || n[1] === 1 || n[2] === 1)) continue;
    const c = POS[i].map((v, k) => v + 0.5 * n[k]);
    const axes = [0, 1, 2].filter((k) => n[k] === 0);
    const corners = [[-0.46, -0.46], [0.46, -0.46], [0.46, 0.46], [-0.46, 0.46]].map(([a, b]) => {
      const q = c.slice();
      q[axes[0]] += a;
      q[axes[1]] += b;
      const [sx, sy] = proj(q[0], q[1], q[2]);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      return `${sx.toFixed(3)},${sy.toFixed(3)}`;
    });
    polys.push(`<polygon points="${corners.join(' ')}" fill="${fill(i)}" stroke="#111" stroke-width="0.06" stroke-linejoin="round"/>`);
  }
  const m = 0.15;
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', `${(minX - m).toFixed(2)} ${(minY - m).toFixed(2)} ${(maxX - minX + 2 * m).toFixed(2)} ${(maxY - minY + 2 * m).toFixed(2)}`);
  el.setAttribute('class', 'diagram');
  el.innerHTML = polys.join('');
  return el;
}
