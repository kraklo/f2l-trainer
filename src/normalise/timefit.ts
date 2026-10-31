// Fits the cube's clock to the host clock. Cube timestamps are precise relative to each other but
// drift; host timestamps carry Bluetooth jitter. A least-squares line maps cube time onto host time,
// so move times line up with gyro samples (host clock) without the jitter.

import { type RawMove } from '../record/types';

export interface TimeFit {
  /** Fitted host-clock time of each move. */
  times: number[];
  slope: number;
  /** RMS of host time minus fitted time, in ms (Bluetooth jitter). */
  residualMs: number;
}

export function fitTimes(moves: RawMove[]): TimeFit {
  const pairs = moves.flatMap((m) => (m.cubeTs !== null && m.hostTs !== null ? [[m.cubeTs, m.hostTs]] : []));
  let slope = 1, intercept = 0;
  if (pairs.length >= 2) {
    const n = pairs.length;
    const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
    const my = pairs.reduce((s, p) => s + p[1], 0) / n;
    let sxy = 0, sxx = 0;
    for (const [x, y] of pairs) {
      sxy += (x - mx) * (y - my);
      sxx += (x - mx) ** 2;
    }
    slope = sxx > 0 ? sxy / sxx : 1;
    intercept = my - slope * mx;
  } else if (pairs.length === 1) {
    intercept = pairs[0][1] - pairs[0][0];
  }

  const times: (number | null)[] = moves.map((m) => (m.cubeTs !== null && pairs.length ? slope * m.cubeTs + intercept : m.hostTs));
  // Recovered moves can lack both clocks: place them between their neighbours.
  for (let i = 0; i < times.length; i++) {
    if (times[i] !== null) continue;
    let j = i;
    while (j < times.length && times[j] === null) j++;
    const before = i > 0 ? times[i - 1]! : (times[j] ?? 0);
    const after = j < times.length ? times[j]! : before;
    for (let k = i; k < j; k++) times[k] = before + ((after - before) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  const fitted = times as number[];
  for (let i = 1; i < fitted.length; i++) fitted[i] = Math.max(fitted[i], fitted[i - 1]);

  const res = pairs.map(([x, y]) => (y - (slope * x + intercept)) ** 2);
  const residualMs = res.length ? Math.sqrt(res.reduce((a, b) => a + b, 0) / res.length) : 0;
  return { times: fitted, slope, residualMs };
}
