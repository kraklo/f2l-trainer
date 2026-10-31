// Cube spike / recording harness: connects a GAN cube, logs what it reports, and records solves
// through the Recorder into IndexedDB. Solves can also be downloaded as test fixtures.

import { cubeTimestampCalcSkew, type GanCubeEvent, type GanCubeMove } from 'gan-web-bluetooth';
import { randomScrambleForEvent } from 'cubing/scramble';
import { Cube } from '../src/device/gan';
import { referenceGrip, relative, snap } from '../src/device/gyro';
import { checkRecord, gyroRate } from '../src/record/checks';
import { Recorder } from '../src/record/recorder';
import { exportAll, importAll, listSolves, saveSolve } from '../src/record/store';
import { type GyroSample, type Quat, type RawMove, type SolveFixture } from '../src/record/types';
import { CubeView } from '../src/render/cubeview';
import { clear, h, toast } from '../src/ui/dom';

/** Ends a solve if the cube doesn't report its final state in time. */
const END_FACELETS_TIMEOUT = 2000;

let cube: Cube | null = null;
const recorder = new Recorder({
  requestFacelets: () => void cube?.requestFacelets(),
  hardware: () => cube?.hardware ?? { name: '?', protocol: '?', gyro: false },
});
let lastQuat: Quat | null = null;
let stored = 0;
let lastFixture: SolveFixture | null = null;
/** Free-form gyro recording for checking axis conventions and the held grip. */
let gyroTest: { startedAt: number; gyro: GyroSample[]; moves: RawMove[] } | null = null;
const gyroTimes: number[] = [];
const allMoves: GanCubeMove[] = [];

const app = document.getElementById('app')!;
const status = h('div', { class: 'status' });
const controls = h('div', { class: 'controls' });
const scrambleEl = h('div', { class: 'scramble' });
const checksEl = h('div', { class: 'checks' });
const logEl = h('pre', { class: 'log' });
const viewEl = h('div', { class: 'view' });
app.append(h('h1', null, 'GAN cube spike'), status, controls, h('div', { class: 'main' }, viewEl, h('div', null, scrambleEl, checksEl)), h('h2', null, 'Log'), logEl);
const view = new CubeView(viewEl, { hintFacelets: false, tempoScale: 5 });

function log(...args: unknown[]) {
  const line = `${(performance.now() / 1000).toFixed(3)}  ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  console.log(line);
  logEl.textContent = (line + '\n' + (logEl.textContent ?? '')).slice(0, 20000);
}

async function connect() {
  try {
    cube = await Cube.connect(onEvent);
  } catch (e) {
    log('connect failed', String(e));
    return;
  }
  log('connected', { name: cube.name, protocol: cube.hardware.protocol });
  render();
}

function onEvent(e: GanCubeEvent) {
  recorder.handle(e);
  switch (e.type) {
    case 'GYRO': {
      const q = e.quaternion;
      lastQuat = [q.x, q.y, q.z, q.w];
      gyroTimes.push(e.timestamp);
      while (gyroTimes.length && gyroTimes[0] < e.timestamp - 1000) gyroTimes.shift();
      gyroTest?.gyro.push({ hostTs: e.timestamp, q: lastQuat });
      renderStatusThrottled();
      return;
    }
    case 'HARDWARE':
      log('hardware', e);
      break;
    case 'BATTERY':
      log('battery', e.batteryLevel + '%');
      break;
    case 'FACELETS':
      log('facelets', e.serial, e.facelets);
      break;
    case 'MOVE':
      allMoves.push(e);
      gyroTest?.moves.push({ face: e.move[0] as RawMove['face'], amount: e.direction === 1 ? 3 : 1, hostTs: e.localTimestamp, cubeTs: e.cubeTimestamp, serial: e.serial });
      view.addMove(e.move);
      log('move', e.move, { serial: e.serial, host: e.localTimestamp, cube: e.cubeTimestamp });
      break;
    case 'DISCONNECT':
      log('disconnected');
      cube = null;
      break;
  }
  render();
}

let prevPhase = recorder.phase;
recorder.on(() => {
  if (recorder.phase === prevPhase) return;
  prevPhase = recorder.phase;
  log('phase', recorder.phase);
  if (recorder.phase === 'awaitEnd') {
    setTimeout(() => {
      if (recorder.phase === 'awaitEnd') {
        log('⚠ no facelets after solve');
        recorder.finish();
      }
    }, END_FACELETS_TIMEOUT);
  } else if (recorder.phase === 'done' && recorder.record) {
    lastFixture = { record: recorder.record, events: recorder.events };
    log('checks', checkRecord(recorder.record), 'desyncs', recorder.desyncs);
    void saveSolve(recorder.record).then(refreshStored);
  }
  render();
});

async function refreshStored() {
  stored = (await listSolves()).length;
  render();
}

async function newScramble() {
  if (!recorder.canScramble) {
    alert('Solve the cube first (or use "Reset cube state" if it is physically solved).');
    return;
  }
  const scramble = (await randomScrambleForEvent('333')).toString();
  lastFixture = null;
  view.show('');
  recorder.startScramble(scramble);
  log('scramble', scramble);
}

function download(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}

const stamp = (t: number) => new Date(t).toISOString().replace(/[:.]/g, '-');

function saveFixture() {
  if (lastFixture) download(lastFixture, `solve-${stamp(lastFixture.record.startedAt)}.json`);
}

async function exportBackup() {
  download(await exportAll(), `f2l-trainer-${new Date().toISOString().slice(0, 10)}.json`);
}

function importBackup() {
  const input = h('input', { type: 'file', accept: '.json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      toast(`Imported ${await importAll(JSON.parse(await file.text()))} solves`);
      await refreshStored();
    } catch (e) {
      toast(String(e), 'error');
    }
  });
  input.click();
}

function toggleGyroTest() {
  if (gyroTest) {
    download(gyroTest, `gyro-test-${stamp(gyroTest.startedAt)}.json`);
    log(`gyro test saved: ${gyroTest.gyro.length} samples, ${gyroTest.moves.length} turns`);
    gyroTest = null;
  } else {
    gyroTest = { startedAt: Date.now(), gyro: [], moves: [] };
    log('gyro test recording — follow the steps under the scramble, then press Stop');
  }
  render();
}

async function resetCube() {
  if (!cube || !confirm("Only do this when the cube is physically solved. Reset the cube's internal state to solved?")) return;
  await cube.reset();
}

let statusQueued = false;
function renderStatusThrottled() {
  if (statusQueued) return;
  statusQueued = true;
  setTimeout(() => {
    statusQueued = false;
    renderStatus();
  }, 250);
}

/** Live orientation relative to this solve's scramble grip, once the scramble is done. */
function liveGrip(): string {
  if (!lastQuat || (recorder.phase !== 'inspection' && recorder.phase !== 'solving')) return '–';
  const solveStart = recorder.solveStart ?? Infinity;
  const ref = referenceGrip(recorder.events.flatMap((e) =>
    e.type === 'GYRO' && e.timestamp < solveStart ? [{ hostTs: e.timestamp, q: [e.quaternion.x, e.quaternion.y, e.quaternion.z, e.quaternion.w] as Quat }] : []));
  if (!ref) return '–';
  const s = snap(relative(ref, lastQuat));
  return `orientation #${s.index}, ${s.angle.toFixed(0)}° off square`;
}

function renderStatus() {
  const hw = cube?.hardware;
  const skew = allMoves.length > 10 ? `${cubeTimestampCalcSkew(allMoves.slice(-256))}%` : '–';
  const elapsed = recorder.phase === 'solving' && recorder.solveStart !== undefined ? ((performance.now() - recorder.solveStart) / 1000).toFixed(2) + ' s' : '';
  clear(
    status,
    h('div', null, h('b', null, 'Cube: '), hw ? [hw.name, ' · ', hw.protocol, ' · gyro ', String(hw.gyro), ' · sw ', hw.software ?? '?', ' · hw ', hw.hardware ?? '?', cube?.battery !== undefined ? ` · ${cube.battery}%` : ''] : 'not connected'),
    h('div', null, h('b', null, 'Gyro: '), `${gyroTimes.length} Hz · `, liveGrip()),
    h('div', null, h('b', null, 'Clock skew: '), skew, ' · ', h('b', null, 'Phase: '), recorder.phase, ' ', elapsed, ` · ${stored} solves stored`),
  );
}

function render() {
  renderStatus();
  const connected = !!cube;
  const busy = recorder.phase !== 'idle' && recorder.phase !== 'done';
  clear(
    controls,
    h('button', { onclick: connect, disabled: connected }, 'Connect'),
    h('button', { onclick: newScramble, disabled: !connected || !recorder.synced || busy, class: 'primary' }, 'New scramble'),
    h('button', { onclick: () => recorder.cancel(), disabled: !busy }, 'Cancel'),
    h('button', { onclick: saveFixture, disabled: !lastFixture }, 'Download fixture'),
    h('button', { onclick: exportBackup }, 'Export all'),
    h('button', { onclick: importBackup }, 'Import'),
    h('button', { onclick: toggleGyroTest, disabled: !connected || busy }, gyroTest ? 'Stop & save gyro test' : 'Gyro test'),
    h('button', { onclick: resetCube, disabled: !connected }, 'Reset cube state'),
  );
  if (gyroTest) {
    clear(
      scrambleEl,
      h('div', { class: 'next' }, 'Gyro test'),
      h('ol', null,
        h('li', null, 'Hold white top, green front, perfectly square to you. Keep still 3 s.'),
        h('li', null, 'y (turn the whole cube so red is in front). Still 3 s. Repeat until green is in front again (4 y).'),
        h('li', null, "x (white goes to the back). Still 3 s. x' back. Still 3 s."),
        h('li', null, "z (white goes to the right). Still 3 s. z' back. Still 3 s."),
        h('li', null, "Now hold it how you naturally solve (white top, green front) for 3 s, then do R U R' U' a few times."),
      ),
    );
  } else if (recorder.phase === 'scrambling' && recorder.tracker) {
    clear(scrambleEl, h('div', { class: 'next' }, recorder.tracker.remaining || '✓'));
  } else if (recorder.phase === 'inspection') {
    clear(scrambleEl, h('div', { class: 'next' }, 'Inspect — the solve starts on your first turn'));
  } else if (recorder.phase === 'solving') {
    clear(scrambleEl, h('div', { class: 'next' }, `Solving… ${recorder.moveCount} turns`));
  } else {
    clear(scrambleEl, h('div', { class: 'muted' }, recorder.phase === 'done' ? `Solved: ${recorder.moveCount} turns` : 'Press New scramble with the cube solved.'));
  }
  const rec = recorder.record;
  if (rec) {
    clear(
      checksEl,
      h('div', null, `Status: ${rec.status} · gyro during solve ${gyroRate(rec).toFixed(1)} Hz · ${rec.gyro.length} samples`),
      h('ul', null, checkRecord(rec).map((r) => h('li', { class: r.ok ? 'good' : 'bad' }, `${r.ok ? '✓' : '✗'} ${r.name}`, r.detail ? ` — ${r.detail}` : ''))),
    );
  } else {
    clear(checksEl);
  }
}

if (!navigator.bluetooth) log('Web Bluetooth is not available in this browser; use Chrome or Edge.');
void refreshStored();
render();
