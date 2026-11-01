# F2L Trainer

A client-only browser app that records CFOP solves from a GAN smart cube and analyses the cross,
xcross, each F2L pair and pair choice against a human-cost metric. It builds on the Bluetooth,
cube model and rendering code from [zb-trainer](https://github.com/kraklo/zb-trainer).

Licensed GPL-3.0-or-later.

## Using it

Open the app in Chrome or Edge (`npm run dev`, then http://localhost:5173/).

1. **Connect.** Start with the cube solved and press **Connect cube**.
2. **Solve.** Press **New scramble** and follow the moves, scrambling with white on top and green in front.
   Inspect, then solve; the timer starts on your first turn.
3. **Analysis.** The analysis opens when you finish.
   - The timeline shows each stage, with the look-ahead pause before it shaded.
   - Click a stage to see your moves replayed next to the suggestion.
   - For the cross you also get the optimal crosses on your colour and every other colour, plus the best xcross.
   - For each pair you get the search results and known algorithms for it, and how it ranked against the
     other open pairs. Click a suggestion to replay it.
4. **History.** History lists every solve, with export and import.
5. **Settings.** Settings covers your cross colours, the slice and wide moves you use, and the cost knobs.

The old capture page is still at `/spike/` for recording fixtures.

## Look-ahead training

The **Look-ahead** tab trains solving F2L without pauses:

1. Press **Start** and scramble. A metronome starts once the scramble is done.
2. Make one turn on every click, and only turns that help F2L. The solve ends the moment F2L is done;
   the last layer doesn't count.
3. The usual analysis opens, with the look-ahead result on top. Every turn is shown on its beat:
   on the beat, off the beat, filler, or a dot for a beat with no turn.
4. **Next scramble** scrambles again from where the cube is, so you never solve the last layer.

Scoring:

- **On the beat.** A turn counts as on the beat if it lands within a quarter of a beat. A steady lag
  between the click and the turn (Bluetooth, turn speed) is measured and removed first. Accuracy is
  beats hit ÷ (beats + extra turns), so pauses and turns between the beats both count against you.
- **Half turns and slices.** A half turn counts as one turn. Turns made together, like the two faces of
  an `M`, count as one beat.
- **Filler.** Within a run of turns on one axis, any turn that cancels out (`U U'`, or `U U2` instead of
  `U'`) is filler.

A solve is clean with at least 80% on the beat and no filler. Two clean solves in a row raise the
tempo by 5 turns/min, and that tempo is saved as your comfortable tempo. Two misses in a row lower the
tempo, and so does one solve under 60% on the beat. The tempo and comfortable tempo are saved between
sessions. You can also set the tempo by hand.

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

## Cross and xcross analysis

`src/solve/` searches a cubie-level model with the cross on D. Other cross colours and slots are
searched by viewing the cube after a whole-cube rotation.

- **Cross.** The distance table covers all 190,080 states for one cross colour. Its distribution of
  optimal lengths matches the published counts.
- **Cross suggestions.** The analysis lists every optimal and optimal+1 cross, ranked by the human cost
  in `solve/cost.ts`.
- **Xcross.** The search is IDA\* with exact cross+edge and cross+corner pruning tables.
- **Runtime.** Tables build in about 1.7 s and are cached in IndexedDB. The analysis runs in a Web
  Worker and takes under 10 ms per solve once the tables exist.
- **Verification.** Every reported solution is checked on the sticker model in the tests. The cubie
  model is checked against both the sticker model and cubing.js `KPuzzle`.

## F2L pair analysis

At each decision point (after the cross and after each pair) every open slot gets:

- **Case.** Its standard F2L case (1–41). The numbering matches zb-trainer's ZBLS sheet, or the pair is
  marked as having a piece in another slot.
- **Search.** The cheapest solutions by human cost. The search runs in the grip you had at the time,
  can use `y` rotations, and keeps the cross and finished slots intact. It adds a small penalty for
  inserting into a front slot while back slots are open, and charges for switching hands between `R`
  and `L`.
- **Known algorithms.** The algorithms that solve the pair from where it is, used directly or after a
  `y` rotation with any pre-AUF, cheapest first with their community votes.

The decision point ranks the open slots. It flags a pair choice that cost more than 2.0 over the
cheapest, and lists free pairs (cost ≤ 4).

The known algorithms are the 622 F2L algorithms on [SpeedCubeDB](https://speedcubedb.com/a/3x3/F2L),
covering all 41 cases in all four slots. Each one's slot and case are checked by running it backwards
from solved.

## History and personal costs

History shows rolling stats over the last 12, last 50 and all solves:

- cross moves over optimal, and the share of optimal crosses;
- how often a colour you use had a shorter cross;
- how often a much cheaper pair was open;
- the look-ahead pause before each of the four pairs;
- rotations per solve.

It also lists the F2L cases where your moves cost the most over the best found, with the cheapest
solution from the last time each came up. Per-solve summaries are cached in IndexedDB for the current
analysis settings.

**Fit from my solves** replaces the default move costs with your own: each move type's median time
(gaps over 600 ms count as thinking) relative to a `U` or `R` quarter turn, plus the extra time a hand
switch costs. A move type needs at least 15 samples, and moves without enough samples keep the default.
