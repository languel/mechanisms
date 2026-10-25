# Mechanisms — motion you can print

A catalogue of simple motion mechanisms for visual learning. Each one is a single page with a
working 3D model, a live parameter panel, a written breakdown, and a print pack: the machine you look
at is the machine you print, in millimetres, flat on the bed.

**Site:** https://languel.github.io/mechanisms/ (published from the repository root by
`.github/workflows/pages.yml`).

## The starter catalogue

| Mechanism | The idea it teaches | Parameters |
| --- | --- | --- |
| **Crank and slider** | Constant rotation in, uneven straight-line motion out | stroke, rod length, clearance |
| **Servo crank** | A servo holds an angle, so it only gives half a crank circle | arm radius, rod, sweep, clearance |
| **Cam and follower** | A cam's outline *is* its timing diagram; roller size sets the limit | lift, rise, dwell, shoe, motion law |
| **Rack and pinion** | A gear unrolled; travel per turn is π × pitch diameter | module, teeth, stroke |
| **Spur gears** | The ratio is the tooth counts; the involute keeps it steady | teeth ×2, module, clearance |
| **Ratchet and pawl** | Back-and-forth in, equal steps out, one direction only | teeth, wheel, lever swing |
| **Geneva indexer** | Continuous in, dead stops out; the boss does the locking | slots, wheel, clearance |

Each page: `mechanisms/<slug>/index.html`, generated from `mechanisms/<slug>/mechanism.js`.

## Run it

```sh
npm run serve      # http://localhost:8080 — a static server with the right MIME types
npm test           # mesh, mechanism and export suites
npm run build      # regenerate every page, card image and the catalogue index
npm run export     # write a print pack per mechanism into export/
```

No dependencies and no bundler. The browser loads the same ES modules Node just checked; `package.json`
only carries `"type": "module"` and the scripts.

```sh
node src/export-cli.js cam-follower lift=12 rise=90 law=parabolic
node src/export-cli.js --all --out=dist
```

A pack contains one binary STL per printed part (already in its printing orientation, millimetres),
a `README.md` parameter and assembly sheet, and a `parts.csv` bill of materials with masses.

## How it works

One module per mechanism, and nothing else knows the geometry:

```js
export const meta = { title, tagline, category, question, bigIdea, notes, references };
export const params = [{ key, label, min, max, step, value, unit }];
export function build(p) { return { parts, checks }; }   // parts in print-flat millimetres
export function pose(p, t) { return { crank: { rot: t } }; }
export function readouts(p, t) { return [{ label, value, unit }]; }
export const steps = [{ title, text, t, parts, set }];
```

* `src/lib/profiles.js` — involute gears, racks, cams, ratchets, pawls, Geneva wheels
* `src/lib/kit.js` — the print standard (plate 4 mm, body 6 mm, 8 mm layer pitch, 0.3 mm fits) and the part vocabulary
* `src/lib/mesh.js` — scanline triangulation, extrusion, watertightness checks, binary STL
* `src/lib/export.js` — the print pack: STLs, ZIP, sheet, bill of materials
* `src/lib/iso.js` — the isometric figure used for cards and as the no-WebGL fallback
* `assets/js/viewer.js` — the 3D stage (three.js, vendored, orthographic isometric camera)
* `src/build.js` — renders every page, card and the catalogue

A part is extruded 2D profiles; the viewer extrudes the same profiles into triangles, the exporter
writes those triangles to STL, and the figure shades the same faces. That is the whole trick: the
picture, the numbers and the export cannot drift apart, because they are the same model.

## What is verified

Before a page is written, and in `npm test` at every parameter extreme of every mechanism:

* every solid is closed (each directed edge matched by its reverse) and wound outwards;
* no two solids in one part overlap in height *and* footprint;
* the triangulation's area equals the area its rings enclose (catches a hole crossing the outline);
* every part fits a 220 mm bed;
* readouts contain real numbers at every input angle, and every step names parts that exist.

The STLs are quantised to 0.1 µm before writing, so a shared edge is bit-identical after the float32
cast and the slicer's own watertightness test agrees with ours.

## Print standard, in one table

| Element | Size |
| --- | --- |
| Base plate | 4 mm |
| Links, gears, cams, levers | 6 mm |
| Turning layer pitch | 8 mm (6 mm body + 1.6 mm hub + 0.4 mm clearance) |
| Pivot post | Ø6.8 mm printed, or Ø3 mm steel rod in a Ø3.3 mm bore |
| Press cap | Ø13.2 × 3 mm, 0.3 mm interference |
| Running clearance | +0.30 mm (adjustable per mechanism) |

Read the full version at [`docs/print-standard.html`](docs/print-standard.html) and the modelling notes
at [`docs/design-notes.html`](docs/design-notes.html).

## Sources and credits

The mechanisms are the classics — Henry T. Brown's *Five Hundred and Seven Mechanical Movements*
(1868, [507movements.com](https://507movements.com)) for the vocabulary, standard kinematics for the
slider-crank, involute gears, cam laws and Geneva geometry, and the
[anatomy](https://github.com/wheresryan22/anatomy) skill's craft rules for the figures (one object,
many real parts, true numbers, one lit accent). The page structure follows the "make it a machine"
workflow: object, controls, inside view, numbers that come from the model, and one big idea.

Third-party code: three.js (MIT, `assets/vendor/three/`). Everything else in this repository is
original.
