// M0 cube spike: connect a GAN cube through gan-web-bluetooth, log what it reports, and record
// scrambled solves as JSON fixtures.

import { connectGanCube, cubeTimestampCalcSkew, type GanCubeConnection, type GanCubeEvent, type GanCubeMove } from 'gan-web-bluetooth';
import { randomScrambleForEvent } from 'cubing/scramble';
import { applyMove, equalFacelets, fromFaceletString, solvedFacelets, toFaceletString, type Facelets } from '../src/cube/cube';
import { checkRecord, gyroRate, isDesynced } from '../src/record/checks';
import { ScrambleTracker } from '../src/record/scramble';
import { type Face, type GyroSample, type Hardware, type Quat, type RawMove, type SolveFixture, type SolveRecord } from '../src/record/types';
import { CubeView } from '../src/render/cubeview';
import { clear, h } from '../src/ui/dom';

type Phase = 'disconnected' | 'idle' | 'scrambling' | 'inspection' | 'solving' | 'awaitEnd' | 'done';

const MAC_KEY = 'f2l-trainer:macs';

let conn: GanCubeConnection | null = null;
let phase: Phase = 'disconnected';
let hardware: Hardware = { name: '?', protocol: '?', gyro: false };
let state: Facelets = solvedFacelets();
let synced = false;
let tracker: ScrambleTracker | null = null;
let scramble = '';
let events: GanCubeEvent[] = [];
let startFacelets = '';
let endFacelets: string | undefined;
let moves: RawMove[] = [];
let gyro: GyroSample[] = [];
let lastQuat: Quat | null = null;
let calib: Quat | undefined;
let startedAt = 0;
let solveStart = 0;
let record: SolveRecord | null = null;
let saved = 0;
/** Free-form gyro recording for checking axis conventions and the held grip. */
let gyroTest: { startedAt: number; calib?: Quat; gyro: GyroSample[]; moves: RawMove[] } | null = null;
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

function loadMacs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAC_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

async function macProvider(device: BluetoothDevice, isFallbackCall?: boolean): Promise<string | null> {
  const cached = loadMacs()[device.name ?? ''];
  if (cached && !isFallbackCall) return cached;
  if (!isFallbackCall) return null; // let the library read it from advertisements
  const mac = prompt(`MAC address for ${device.name} (shown in the GAN app or chrome://bluetooth-internals):`, cached ?? '');
  return mac?.trim() || null;
}

async function connect() {
  try {
    conn = await connectGanCube(macProvider);
  } catch (e) {
    log('connect failed', String(e));
    return;
  }
  const macs = loadMacs();
  macs[conn.deviceName] = conn.deviceMAC;
  localStorage.setItem(MAC_KEY, JSON.stringify(macs));
  const driver = (conn as unknown as { driver?: { constructor: { name: string } } }).driver;
  hardware = { name: conn.deviceName, protocol: driver?.constructor.name ?? '?', gyro: false };
  log('connected', { name: conn.deviceName, mac: conn.deviceMAC, protocol: hardware.protocol });
  phase = 'idle';
  synced = false;
  conn.events$.subscribe(onEvent);
  await conn.sendCubeCommand({ type: 'REQUEST_HARDWARE' });
  await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
  render();
}

function onEvent(e: GanCubeEvent) {
  if (phase !== 'idle' && phase !== 'disconnected' && phase !== 'done') events.push(e);
  switch (e.type) {
    case 'GYRO': {
      const q = e.quaternion;
      lastQuat = [q.x, q.y, q.z, q.w];
      gyroTimes.push(e.timestamp);
      while (gyroTimes.length && gyroTimes[0] < e.timestamp - 1000) gyroTimes.shift();
      if (phase === 'inspection' || phase === 'solving') gyro.push({ hostTs: e.timestamp, q: lastQuat });
      gyroTest?.gyro.push({ hostTs: e.timestamp, q: lastQuat });
      renderStatusThrottled();
      return;
    }
    case 'HARDWARE':
      hardware = { ...hardware, name: e.hardwareName ?? hardware.name, gyro: !!e.gyroSupported, software: e.softwareVersion, hardware: e.hardwareVersion };
      log('hardware', e);
      break;
    case 'BATTERY':
      log('battery', e.batteryLevel + '%');
      break;
    case 'FACELETS':
      onFacelets(e.facelets, e.serial);
      break;
    case 'MOVE':
      onMove(e);
      break;
    case 'DISCONNECT':
      log('disconnected');
      phase = 'disconnected';
      conn = null;
      break;
  }
  render();
}

function onFacelets(facelets: string, serial: number) {
  log('facelets', serial, facelets);
  const reported = fromFaceletString(facelets);
  if (phase === 'inspection' && !startFacelets) startFacelets = facelets;
  if (phase === 'awaitEnd') {
    endFacelets = facelets;
    finish();
  }
  if (!equalFacelets(reported, state)) {
    if (synced) log('⚠ tracked state differs from cube; resyncing to cube');
    state = reported;
  }
  synced = true;
}

function onMove(e: GanCubeEvent & { type: 'MOVE' }) {
  allMoves.push(e);
  const raw: RawMove = { face: e.move[0] as Face, amount: e.direction === 1 ? 3 : 1, hostTs: e.localTimestamp, cubeTs: e.cubeTimestamp, serial: e.serial };
  gyroTest?.moves.push(raw);
  const m = { base: raw.face, amount: raw.amount };
  state = applyMove(state, m);
  view.addMove(e.move);
  const prev = moves[moves.length - 1];
  const gap = prev?.cubeTs != null && raw.cubeTs != null ? raw.cubeTs - prev.cubeTs : null;
  log('move', e.move, { serial: e.serial, host: e.localTimestamp, cube: e.cubeTimestamp, gap });

  if (phase === 'scrambling' && tracker) {
    tracker.move(m);
    if (tracker.done) {
      phase = 'inspection';
      startFacelets = '';
      log('scrambled — inspect, the solve starts on your first turn');
      void conn?.sendCubeCommand({ type: 'REQUEST_FACELETS' });
    }
  } else if (phase === 'inspection' || phase === 'solving') {
    if (phase === 'inspection') {
      phase = 'solving';
      solveStart = e.localTimestamp ?? performance.now();
      if (!startFacelets) {
        startFacelets = toFaceletString(tracker!.target);
        log('⚠ no facelets reported before first turn; using tracked start state');
      }
    }
    moves.push(raw);
    if (equalFacelets(state, solvedFacelets())) {
      phase = 'awaitEnd';
      log(`solved in ${moves.length} turns`);
      void conn?.sendCubeCommand({ type: 'REQUEST_FACELETS' });
      setTimeout(() => {
        if (phase === 'awaitEnd') {
          log('⚠ no facelets after solve');
          finish();
        }
      }, 2000);
    }
  }
}

async function newScramble() {
  if (!equalFacelets(state, solvedFacelets())) {
    alert('Solve the cube first (or use "Reset cube state" if it is physically solved).');
    return;
  }
  scramble = (await randomScrambleForEvent('333')).toString();
  tracker = new ScrambleTracker(scramble, state);
  events = [];
  moves = [];
  gyro = [];
  record = null;
  endFacelets = undefined;
  startFacelets = '';
  startedAt = Date.now();
  phase = 'scrambling';
  view.show('');
  log('scramble', scramble);
  render();
}

function finish() {
  phase = 'done';
  record = {
    id: `${startedAt}`,
    version: 1,
    startedAt,
    scramble,
    startFacelets,
    endFacelets,
    inspectionMoves: [],
    moves,
    gyro,
    calib,
    hardware,
    status: 'ok',
  };
  const results = checkRecord(record);
  if (isDesynced(results)) record.status = 'desynced';
  log('checks', results);
  render();
}

function save() {
  if (!record) return;
  const fixture: SolveFixture = { record, events };
  download(fixture, `solve-${new Date(record.startedAt).toISOString().replace(/[:.]/g, '-')}.json`);
  saved++;
  render();
}

function download(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}

function toggleGyroTest() {
  if (gyroTest) {
    download(gyroTest, `gyro-test-${new Date(gyroTest.startedAt).toISOString().replace(/[:.]/g, '-')}.json`);
    log(`gyro test saved: ${gyroTest.gyro.length} samples, ${gyroTest.moves.length} turns`);
    gyroTest = null;
  } else {
    gyroTest = { startedAt: Date.now(), calib, gyro: [], moves: [] };
    log('gyro test recording — follow the steps under the scramble, then press Stop');
  }
  render();
}

function calibrate() {
  if (!lastQuat) {
    alert('No gyro data yet.');
    return;
  }
  calib = lastQuat;
  log('calibrated (white top, green front)', calib);
}

async function resetCube() {
  if (!conn || !confirm('Only do this when the cube is physically solved. Reset the cube\'s internal state to solved?')) return;
  await conn.sendCubeCommand({ type: 'REQUEST_RESET' });
  await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
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

function renderStatus() {
  const skew = allMoves.length > 10 ? `${cubeTimestampCalcSkew(allMoves.slice(-256))}%` : '–';
  const elapsed = phase === 'solving' ? ((performance.now() - solveStart) / 1000).toFixed(2) + ' s' : '';
  clear(
    status,
    h('div', null, h('b', null, 'Cube: '), hardware.name, ' · protocol ', hardware.protocol, ' · gyroSupported ', String(hardware.gyro), ' · sw ', hardware.software ?? '?', ' · hw ', hardware.hardware ?? '?'),
    h('div', null, h('b', null, 'Gyro: '), `${gyroTimes.length} Hz`, ' · q ', lastQuat ? lastQuat.map((v) => v.toFixed(3)).join(', ') : '–', calib ? ' · calibrated' : ' · not calibrated'),
    h('div', null, h('b', null, 'Clock skew: '), skew, ' · ', h('b', null, 'Phase: '), phase, ' ', elapsed, saved ? ` · ${saved} saved` : ''),
  );
}

function render() {
  renderStatus();
  const connected = !!conn;
  clear(
    controls,
    h('button', { onclick: connect, disabled: connected }, 'Connect'),
    h('button', { onclick: calibrate, disabled: !connected }, 'Calibrate gyro'),
    h('button', { onclick: newScramble, disabled: !connected || !synced || phase === 'solving' }, 'New scramble'),
    h('button', { onclick: save, disabled: !record, class: 'primary' }, 'Save solve JSON'),
    h('button', { onclick: toggleGyroTest, disabled: !connected || phase === 'scrambling' || phase === 'inspection' || phase === 'solving' }, gyroTest ? 'Stop & save gyro test' : 'Gyro test'),
    h('button', { onclick: resetCube, disabled: !connected }, 'Reset cube state'),
  );
  if (gyroTest) {
    clear(
      scrambleEl,
      h('div', { class: 'next' }, 'Gyro test'),
      h('ol', null,
        h('li', null, 'Hold white top, green front, perfectly square to you. Keep still 3 s.'),
        h('li', null, 'y (turn the whole cube so red is in front). Still 3 s. Repeat until green is in front again (4 y).'),
        h('li', null, 'x (white goes to the back). Still 3 s. x\' back. Still 3 s.'),
        h('li', null, 'z (white goes to the right). Still 3 s. z\' back. Still 3 s.'),
        h('li', null, "Now hold it how you naturally solve (white top, green front) for 3 s, then do R U R' U' a few times."),
      ),
    );
  } else if (phase === 'scrambling' && tracker) {
    clear(scrambleEl, h('div', { class: 'muted' }, scramble), h('div', { class: 'next' }, tracker.remaining || '✓'));
  } else if (phase === 'inspection') {
    clear(scrambleEl, h('div', { class: 'next' }, 'Inspect — the solve starts on your first turn'));
  } else if (phase === 'solving') {
    clear(scrambleEl, h('div', { class: 'next' }, `Solving… ${moves.length} turns`));
  } else {
    clear(scrambleEl, h('div', { class: 'muted' }, phase === 'done' ? `Solved: ${moves.length} turns` : 'Calibrate, then press New scramble with the cube solved.'));
  }
  if (record) {
    clear(
      checksEl,
      h('div', null, `Gyro during solve: ${gyroRate(record).toFixed(1)} Hz · ${record.gyro.length} samples`),
      h('ul', null, checkRecord(record).map((r) => h('li', { class: r.ok ? 'good' : 'bad' }, `${r.ok ? '✓' : '✗'} ${r.name}`, r.detail ? ` — ${r.detail}` : ''))),
    );
  } else {
    clear(checksEl);
  }
}

if (!navigator.bluetooth) log('Web Bluetooth is not available in this browser; use Chrome or Edge.');
render();
