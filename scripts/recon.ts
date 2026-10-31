// Prints the reconstruction of each recorded fixture: npm run recon [-- [--write] <fixture name filter>]
// --write saves the cross and pairs as the expected (hand-checked) reconstruction for the fixture.

import { moveToString } from '../src/cube/cube';
import { colourName, reconstruct } from '../src/normalise/normalise';
import { expectedOf, loadSolveFixture, replayFixture, solveFixtureNames, writeExpected } from '../src/test/fixtures';

const args = process.argv.slice(2);
const write = args.includes('--write');
const filter = args.find((a) => !a.startsWith('--')) ?? '';
const s = (ms: number) => (ms / 1000).toFixed(2);

for (const name of solveFixtureNames.filter((n) => n.includes(filter))) {
  const record = replayFixture(loadSolveFixture(name));
  const r = reconstruct(record);
  if (!r) {
    console.log(`${name}: no F2L found`);
    continue;
  }
  if (write) writeExpected(name, expectedOf(r));
  const d = r.diag;
  console.log(`\n${name}\n  scramble: ${record.scramble}\n  cross ${colourName(r.cross)} · inspection ${r.inspection || '(none)'} · tilt ${d.tiltDeg.toFixed(0)}° · snap ${d.medianSnapDeg.toFixed(0)}° · cross on D ${(d.crossOnBottom * 100).toFixed(0)}% · ${d.merged} slice/wide merges`);
  for (const seg of r.segments) {
    const alg = r.tokens.slice(seg.startIdx, seg.endIdx + 1).map((t) => moveToString(t.move)).join(' ');
    const label = seg.kind === 'pair' ? `pair ${seg.slot} → ${seg.heldSlot}` : seg.kind;
    console.log(`  ${label.padEnd(26)} ${String(seg.turns).padStart(2)} turns ${s(seg.durationMs).padStart(6)}s  look ${s(seg.recognitionMs)}s  | ${alg || '(finished with previous stage)'}`);
  }
}
