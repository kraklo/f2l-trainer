# F2L Trainer

A client-only browser app that records CFOP solves from a GAN smart cube and analyses the cross,
xcross, each F2L pair and pair choice against a human-cost metric. It builds on the Bluetooth,
cube model and rendering code from [zb-trainer](https://github.com/kraklo/zb-trainer).

Work in progress. Licensed GPL-3.0-or-later.

## Development

```sh
npm install
npm run dev     # http://localhost:5173/
npm test
npm run build
```

Web Bluetooth needs Chrome or Edge. If the cube's MAC address can't be read automatically, enable
`chrome://flags/#enable-experimental-web-platform-features` or enter the MAC when prompted.

## Recording solves

The recording page at `/spike/` connects through
[gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth). It logs the hardware, gyro rate,
clock skew and every move with host and cube timestamps.

1. Start with the cube solved, then press **Connect**.
2. Press **New scramble** and follow the moves. A wrong turn updates the remaining moves. Scramble
   holding white top, green front: that grip is the gyro reference for the solve.
3. Inspect, then solve. The solve starts on your first turn.
4. The solve is saved to IndexedDB automatically. **Export all** and **Import** back the solves up as JSON.
5. To add a test fixture, press **Download fixture** and move the file into `fixtures/solves/`.

The recorder checks the cube's own state reports (about one every three turns) against the tracked
state, and marks the solve `desynced` if they ever disagree.

Each check must pass for a fixture to count:

- the scramble matches the start facelets the cube reports;
- replaying the moves matches the end facelets;
- at most 5% of moves lack a cube timestamp;
- the gyro reports at least 8 Hz during the solve (the GAN16 ui sends about 10 Hz).

## M0 hardware findings (GAN16 ui Maglev)

- **Connection.** The cube reports as `GAN16ui`, firmware 2.4, hardware 1.0, and speaks the Gen4 protocol
  (`GanGen4ProtocolDriver`). The driver is gan-web-bluetooth.
- **Gyro.** `gyroSupported` is false, because the library only sets it for `GAN12uiM`, but gyro packets
  (`0xEC`) decode fine.
  - Rate is about 10 Hz in bursts: gaps of 0–361 ms, median 80 ms. That is enough to see a whole-cube
    rotation, which takes about 250 ms.
- **Timestamps.** Every move carries a cube timestamp, and no moves are batched under one host timestamp.
  Replays match the cube's facelets at both ends.
- **Axes.** The gyro test (`fixtures/gyro/`) confirms the library's quaternion convention: +X red,
  +Y blue, +Z white, and the quaternion maps the cube body to the world.
  - Relative rotations are clean: `y`, `x` and `z` each measure 88–95° about the expected body axis.
  - Drift is ≤ 5° over a minute.
- **Calibration.** A fixed calibration quaternion is unreliable: the solving grip is tilted and the
  reference drifts between sessions. Calibration is therefore done per solve:
  1. The reference grip is the dominant orientation cluster during scrambling, which is white top,
     green front by construction.
  2. Each gyro sample becomes `ref⁻¹ ⊗ q`, snapped to the nearest of the 24 orientations, with hysteresis.
  3. After segmentation, the cross colour must sit on D for most of F2L. That check corrects any
     leftover tilt in the reference.

## Reconstruction

`npm run recon` prints each fixture's reconstruction: cross colour, inspection rotation, then each stage
with turns, time, look-ahead pause and moves. `npm run recon -- --write <name>` saves a reconstruction
you have checked by hand as `fixtures/expected/<name>`, which the tests then hold it to.

- **Clock.** Times use the cube's clock, fitted to the host clock (about 45 ms of Bluetooth jitter removed).
- **Rotations.** Rotations come from the gyro relative to the scramble grip. The leftover tilt of the
  solving grip is removed by assuming the cross is on D during F2L.
- **Merging.** Merging into slice and wide moves is configurable. `d`/`u`/`E` are off by default, because at solving speed
  a `U` + `y` regrip looks the same to the cube as a `d`. Merges also require the gyro to show the body still
  rotating when the turn registers (`fixtures/moves`). The GAN16 reports angular velocity as 0, so velocity
  can't help.
- **Stages.**
  - The cross counts as done once it stays intact, apart from breaks of up to 16 moves while pairs are inserted.
  - Slots are judged at moments when the cross is intact.
