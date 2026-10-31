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

## M0: recording capture fixtures

The spike page at `/spike/` connects through
[gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) and logs the hardware name,
protocol, gyro rate, clock skew and every move with host and cube timestamps.

1. Start with the cube solved, then press **Connect**.
2. Optional: press **Calibrate gyro**. Calibration now comes from the scramble grip, so this is no longer needed.
3. Press **New scramble** and follow the moves. A wrong turn updates the remaining moves.
4. Inspect, then solve. The solve starts on your first turn.
5. Check the results under the scramble, then press **Save solve JSON**.
6. Move the downloaded files into `fixtures/solves/`. `npm test` then runs the capture checks on each one.

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
