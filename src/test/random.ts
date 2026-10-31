// Deterministic pseudo-random inputs for tests.

import { FACES } from '../cube/cube';

/** Random face-turn algs from a seeded LCG (no same-face repeats). */
export function randomAlgs(count: number, length: number, seed = 1): string[] {
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  return Array.from({ length: count }, () => {
    const moves: string[] = [];
    while (moves.length < length) {
      const f = FACES[Math.floor(rand() * 6)];
      if (moves.length && moves[moves.length - 1][0] === f) continue;
      moves.push(f + ['', '2', "'"][Math.floor(rand() * 3)]);
    }
    return moves.join(' ');
  });
}
