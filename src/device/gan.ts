// GAN smart cube connection through gan-web-bluetooth. Forwards every device event and keeps
// track of what the cube says about itself.

import { connectGanCube, type GanCubeConnection, type GanCubeEvent } from 'gan-web-bluetooth';
import { type Hardware } from '../record/types';

const MAC_KEY = 'f2l-trainer:macs';

function loadMacs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAC_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveMac(name: string, mac: string) {
  const macs = loadMacs();
  macs[name] = mac;
  localStorage.setItem(MAC_KEY, JSON.stringify(macs));
}

async function macProvider(device: BluetoothDevice, isFallbackCall?: boolean): Promise<string | null> {
  const cached = loadMacs()[device.name ?? ''];
  if (cached && !isFallbackCall) return cached;
  if (!isFallbackCall) return null; // let the library read it from advertisements
  const mac = prompt(`MAC address for ${device.name} (shown in the GAN app or chrome://bluetooth-internals):`, cached ?? '');
  return mac?.trim() || null;
}

export class Cube {
  hardware: Hardware;
  battery?: number;
  private listeners: ((e: GanCubeEvent) => void)[] = [];

  private constructor(private conn: GanCubeConnection) {
    const driver = (conn as unknown as { driver?: { constructor: { name: string } } }).driver;
    this.hardware = { name: conn.deviceName, protocol: driver?.constructor.name ?? '?', gyro: false };
    conn.events$.subscribe((e) => this.onEvent(e));
  }

  /** Asks the browser for a cube and connects; `onEvent` sees every event, including the first ones. */
  static async connect(onEvent: (e: GanCubeEvent) => void): Promise<Cube> {
    const conn = await connectGanCube(macProvider);
    saveMac(conn.deviceName, conn.deviceMAC);
    const cube = new Cube(conn);
    cube.on(onEvent);
    // moves are only reported once the library has seen the cube's state
    await cube.requestFacelets();
    await conn.sendCubeCommand({ type: 'REQUEST_HARDWARE' });
    await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
    return cube;
  }

  get name(): string {
    return this.conn.deviceName;
  }

  on(fn: (e: GanCubeEvent) => void) {
    this.listeners.push(fn);
  }

  requestFacelets(): Promise<void> {
    return this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  /** Resets the cube's internal state to solved; only valid when it is physically solved. */
  async reset() {
    await this.conn.sendCubeCommand({ type: 'REQUEST_RESET' });
    await this.requestFacelets();
  }

  disconnect(): Promise<void> {
    return this.conn.disconnect();
  }

  private onEvent(e: GanCubeEvent) {
    if (e.type === 'HARDWARE') {
      // gyroSupported is only set for known models; the GAN16 ui sends gyro data regardless.
      this.hardware = { ...this.hardware, name: e.hardwareName ?? this.hardware.name, gyro: this.hardware.gyro || !!e.gyroSupported, software: e.softwareVersion, hardware: e.hardwareVersion };
    } else if (e.type === 'GYRO') {
      this.hardware.gyro = true;
    } else if (e.type === 'BATTERY') {
      this.battery = e.batteryLevel;
    }
    for (const fn of this.listeners) fn(e);
  }
}
