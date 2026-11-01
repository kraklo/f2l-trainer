// Web Audio metronome. Clicks are scheduled on the audio clock a little ahead of time (a timer alone
// drifts and stutters), and each click's time is mapped to performance.now, the clock the cube's
// moves are stamped with, so turns can be judged against the clicks.

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const START_DELAY_S = 0.15;

export class Metronome {
  private ctx: AudioContext | null = null;
  private timer = 0;
  private next = 0; // audio time of the next click to schedule
  private beat = 0;
  private startAudio = 0;
  private intervalS = 1;
  /** performance.now of the first click, once started. */
  beatZero: number | null = null;
  bpm = 0;

  get running(): boolean {
    return this.beatZero !== null;
  }

  /** performance.now of beat k. */
  beatTime(k: number): number {
    return (this.beatZero ?? 0) + k * this.intervalS * 1000;
  }

  async start(bpm: number) {
    this.stop();
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.resume();
    this.bpm = bpm;
    this.intervalS = 60 / bpm;
    this.beat = 0;
    this.startAudio = this.ctx.currentTime + START_DELAY_S;
    this.next = this.startAudio;
    this.beatZero = this.toPerf(this.startAudio);
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    this.beatZero = null;
  }

  /** performance.now at which audio scheduled for `t` is heard. */
  private toPerf(t: number): number {
    const ctx = this.ctx!;
    const ts = ctx.getOutputTimestamp?.();
    const latency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
    if (ts?.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
      return ts.performanceTime + (t - ts.contextTime) * 1000;
    }
    return performance.now() + (t - ctx.currentTime) * 1000 + latency;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.beatZero === null) return;
    while (this.next < ctx.currentTime + LOOKAHEAD_S) {
      this.click(this.next, this.beat % 4 === 0);
      this.beat++;
      this.next = this.startAudio + this.beat * this.intervalS;
    }
  }

  private click(at: number, accent: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.5, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}
