// 3D cube using cubing.js. States are given as setup algs in the held frame; the display rotation is
// prepended so the colours match how the physical cube is held.

import { TwistyPlayer } from 'cubing/twisty';

export interface CubeViewOptions {
  controls?: boolean;
  hintFacelets?: boolean;
  tempoScale?: number;
}

export class CubeView {
  readonly player: TwistyPlayer;
  private rotation = '';

  constructor(container: HTMLElement, opts: CubeViewOptions = {}) {
    this.player = new TwistyPlayer({
      puzzle: '3x3x3',
      visualization: '3D',
      background: 'none',
      controlPanel: opts.controls ? 'bottom-row' : 'none',
      hintFacelets: opts.hintFacelets === false ? 'none' : 'floating',
      experimentalDragInput: 'auto',
      tempoScale: opts.tempoScale ?? 3,
      cameraLatitude: 32,
      cameraLongitude: 28,
    });
    this.player.classList.add('cube-view');
    container.append(this.player);
  }

  setRotation(rotation: string) {
    this.rotation = rotation;
  }

  setHintFacelets(on: boolean) {
    this.player.hintFacelets = on ? 'floating' : 'none';
  }

  setTempo(scale: number) {
    this.player.tempoScale = scale;
  }

  /** Shows the state reached by `setup` and clears any moves. */
  show(setup: string, alg = '') {
    this.player.experimentalSetupAlg = `${this.rotation} ${setup}`.trim();
    this.player.alg = alg;
    if (alg) this.player.jumpToStart();
  }

  addMove(move: string) {
    this.player.experimentalAddMove(move, { cancel: false });
  }

  play() {
    this.player.jumpToStart();
    this.player.play();
  }
}
