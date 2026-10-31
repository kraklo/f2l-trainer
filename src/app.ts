// App shell: owns the cube connection, the recorder, the analysis worker and settings, and switches
// between views. Same pattern as zb-trainer: each view builds its root once and re-renders on demand.

import { type GanCubeEvent } from 'gan-web-bluetooth';
import { Cube } from './device/gan';
import { Recorder } from './record/recorder';
import { saveSolve } from './record/store';
import { type SolveRecord } from './record/types';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Analyser } from './solve/client';
import { AnalysisView } from './ui/analysis';
import { clear, h, toast } from './ui/dom';
import { HistoryView } from './ui/history';
import { SettingsView } from './ui/settings';
import { SolveView } from './ui/solve';

export type ViewName = 'solve' | 'analysis' | 'history' | 'settings';

export interface View {
  el: HTMLElement;
  render(): void;
  leave?(): void;
}

/** Ends a solve if the cube doesn't report its final state in time. */
const END_FACELETS_TIMEOUT = 2000;

export class App {
  settings: Settings = loadSettings();
  cube: Cube | null = null;
  connecting = false;
  recorder = new Recorder({
    requestFacelets: () => void this.cube?.requestFacelets(),
    hardware: () => this.cube?.hardware ?? { name: '?', protocol: '?', gyro: false },
  });
  analyser = new Analyser();
  view: ViewName = 'solve';
  views: { solve: SolveView; analysis: AnalysisView; history: HistoryView; settings: SettingsView } & Record<ViewName, View>;
  private header = h('header');
  private main = h('main');

  constructor(root: HTMLElement) {
    this.views = {
      solve: new SolveView(this),
      analysis: new AnalysisView(this),
      history: new HistoryView(this),
      settings: new SettingsView(this),
    };
    root.append(this.header, this.main);
    let prev = this.recorder.phase;
    this.recorder.on(() => {
      if (this.recorder.phase !== prev) {
        prev = this.recorder.phase;
        this.onPhase();
      }
    });
    this.showView('solve');
  }

  saveSettings() {
    saveSettings(this.settings);
  }

  showView(name: ViewName) {
    if (name !== this.view) this.views[this.view].leave?.();
    this.view = name;
    clear(this.main, this.views[name].el);
    this.views[name].render();
    this.renderHeader();
  }

  openSolve(record: SolveRecord) {
    this.views.analysis.show(record);
    this.showView('analysis');
  }

  private onPhase() {
    const { phase, record } = this.recorder;
    if (phase === 'awaitEnd') {
      setTimeout(() => {
        if (this.recorder.phase === 'awaitEnd') this.recorder.finish();
      }, END_FACELETS_TIMEOUT);
    } else if (phase === 'done' && record) {
      saveSolve(record).catch((e) => toast(`Could not save the solve: ${e}`, 'error'));
      if (record.status === 'desynced') toast('The cube and the recording disagree; this solve is marked desynced', 'error');
      this.openSolve(record);
    }
  }

  private onCubeEvent(e: GanCubeEvent) {
    this.recorder.handle(e);
    if (e.type === 'BATTERY' || e.type === 'HARDWARE') this.renderHeader();
    if (e.type === 'DISCONNECT') {
      this.cube = null;
      this.recorder.cancel();
      this.renderHeader();
      toast('Cube disconnected', 'error');
    }
    if (this.view === 'solve') this.views.solve.onCubeEvent(e);
  }

  async connectCube() {
    this.connecting = true;
    this.renderHeader();
    try {
      this.cube = await Cube.connect((e) => this.onCubeEvent(e));
    } catch (e) {
      toast(`Could not connect: ${e}`, 'error');
    }
    this.connecting = false;
    this.renderHeader();
    this.views[this.view].render();
  }

  async disconnectCube() {
    await this.cube?.disconnect();
    this.cube = null;
    this.renderHeader();
  }

  renderHeader() {
    const tab = (name: ViewName, label: string) =>
      h('button', { class: `tab ${this.view === name ? 'active' : ''}`, onclick: () => this.showView(name) }, label);
    let cubeBtn: HTMLElement;
    if (this.cube) {
      cubeBtn = h('button', { class: 'cube-btn connected', title: 'Disconnect', onclick: () => this.disconnectCube() },
        h('span', { class: 'dot' }), this.cube.hardware.name, this.cube.battery !== undefined ? ` · ${this.cube.battery}%` : '');
    } else {
      cubeBtn = h('button', { class: 'cube-btn', disabled: this.connecting, onclick: () => this.connectCube() }, this.connecting ? 'Connecting…' : 'Connect cube');
    }
    clear(this.header,
      h('div', { class: 'brand' }, 'F2L Trainer'),
      h('nav', null,
        tab('solve', 'Solve'),
        this.views.analysis.hasSolve ? tab('analysis', 'Analysis') : null,
        tab('history', 'History'),
        tab('settings', 'Settings')),
      cubeBtn,
    );
  }
}
