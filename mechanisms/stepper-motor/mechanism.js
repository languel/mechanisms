/* Bipolar hybrid stepper motor — open-loop discrete angular indexing via multi-phase coils.

   2.5× cutaway classroom demonstrator + physical-computing explainer:
   - 4-pole stator core (A+, B+, A−, B−) with Vernier stator teeth.
   - 4 copper coil bobbins wound in two bipolar phases (Phase A and Phase B).
   - Toothed permanent-magnet rotor whose tooth pitch differs slightly from the stator
     poles so energizing A -> B -> A' -> B' pulls the rotor in exact quantum steps.
   - Supports Wave Drive, Full-Step (2-phase on), Half-Step, and Sinusoidal Microstepping.
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { arc, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'stepper-motor',
  title: 'Bipolar stepper motor',
  tagline: 'No brushes, no position sensor — just toothed magnets pulled in exact angular quanta '
    + 'by energizing Phase A and Phase B in sequence.',
  category: 'Motors & actuators',
  kind: 'motor',
  question: 'How does a 3D printer or CNC router move to an exact fraction of a millimetre without '
    + 'an encoder — and what is the difference between full-stepping, half-stepping, and microstepping?',
  bigIdea: 'The rotor has N teeth while the stator poles sits at 90° electrical quadrature. Energizing '
    + 'Phase A aligns one pair of rotor teeth; switching to Phase B pulls the nearest misaligned tooth '
    + 'pair into alignment, advancing the shaft by an exact fraction of a tooth pitch (90° / N).',
  notes: [
    {
      h: '1. Vernier tooth alignment (why steps are tiny)',
      p: 'When Phase A (left/right poles) is energized, two opposite rotor teeth snap directly into line '
        + 'with the Phase A poles. Because the rotor has `N` equally spaced teeth (for example 8 teeth '
        + 'here, or 50 on a real 1.8° NEMA-17), the adjacent rotor teeth near the Phase B poles (top/bottom) '
        + 'are offset by a quarter of a tooth pitch. Switching current from Phase A to Phase B pulls those '
        + 'offset teeth into alignment, rotating the shaft by `360° / (4 · N)`.',
    },
    {
      h: '2. Wave drive vs. Full-step vs. Half-step',
      p: '<b>Wave drive</b> energizes one phase at a time (`A+ → B+ → A− → B−`). <b>Full-step</b> keeps '
        + 'both phases energized together (`A+B+ → A−B+ → A−B− → A+B−`), parking the rotor halfway between '
        + 'poles with √2 ≈ 41% more holding torque. <b>Half-step</b> alternates single- and dual-phase states '
        + 'to double the angular resolution.',
    },
    {
      h: '3. Microstepping (sinusoidal current vector)',
      p: 'Instead of switching coils abruptly on and off, a chopper driver like the <b>TMC2209</b> or '
        + '<b>A4988</b> proportions current continuously as `I_A = I_max cos(θ_e)` and `I_B = I_max sin(θ_e)`. '
        + 'This rotates the magnetic field vector smoothly, dividing each full step into 8, 16, or 256 '
        + 'quiet microsteps.',
    },
    {
      h: '4. Constant-current STEP / DIR drivers',
      p: 'Rather than controlling 4 H-bridge wires directly from Arduino pins, modern physical-computing '
        + 'projects use a <b>STEP / DIR</b> driver (A4988, DRV8825, TMC2209). Every rising pulse on `STEP` '
        + 'advances one step; `DIR` selects CW or CCW, and the driver’s current-sense chopper regulates coil '
        + 'current automatically.',
    },
  ],
  wiring: {
    driver: 'A4988 / DRV8825 / TMC2209 Stepper Driver',
    supply: '12–24 V VMOT supply + 100 µF decoupling capacitor across VMOT/GND',
    connections: [
      { from: 'Arduino D3', to: 'Driver STEP', role: 'Rising edge = 1 step pulse' },
      { from: 'Arduino D2', to: 'Driver DIR', role: 'HIGH = CW, LOW = CCW' },
      { from: 'Arduino 5V & GND', to: 'Driver VDD & GND', role: 'Logic reference supply' },
      { from: 'Driver 1A / 1B', to: 'Stepper Coil A (Black/Green)', role: 'Bipolar Phase A winding' },
      { from: 'Driver 2A / 2B', to: 'Stepper Coil B (Red/Blue)', role: 'Bipolar Phase B winding' },
    ],
  },
  code: `// Bipolar Stepper Motor with STEP / DIR Driver (A4988 / TMC2209)
const int PIN_STEP = 3;
const int PIN_DIR  = 2;
const int STEPS_PER_REV = 200; // 1.8 deg/step (or 3200 at 16x microstepping)

void stepMove(int steps, bool clockwise, int pulseDelayUs) {
  digitalWrite(PIN_DIR, clockwise ? HIGH : LOW);
  for (int i = 0; i < steps; i++) {
    digitalWrite(PIN_STEP, HIGH);
    delayMicroseconds(pulseDelayUs);
    digitalWrite(PIN_STEP, LOW);
    delayMicroseconds(pulseDelayUs);
  }
}

void setup() {
  pinMode(PIN_STEP, OUTPUT);
  pinMode(PIN_DIR, OUTPUT);
}

void loop() {
  stepMove(STEPS_PER_REV, true, 800);   // Exact 360 deg CW index
  delay(600);
  stepMove(STEPS_PER_REV / 2, false, 1200); // Exact 180 deg CCW return
  delay(600);
}`,
  references: [
    { label: 'Stepper motor fundamentals — Wikipedia', url: 'https://en.wikipedia.org/wiki/Stepper_motor' },
    { label: 'Jones on Stepping Motors (Univ. of Iowa)', url: 'https://homepage.divms.uiowa.edu/~jones/step/' },
  ],
  attribution: 'Bipolar stepper motor cutaway — printable 4-pole stator, Phase A/B coil bobbins, toothed Vernier rotor, and step pointer.',
  screenshot: { t: 45, azimuth: -0.48, elevation: 0.84 },
  order: 90,
};

export const params = [
  { key: 'teeth', label: 'Rotor teeth', min: 6, max: 14, step: 4, value: 10,
    help: 'Number of rotor teeth (must be 4k + 2 so quadrature poles offset by 1/4 pitch). Full step = 90° / teeth.' },
  { key: 'mode', label: 'Excitation mode', kind: 'choice', value: 'full',
    options: [
      { value: 'wave', label: 'Wave — 1 phase on' },
      { value: 'full', label: 'Full-step — 2 phases on' },
      { value: 'half', label: 'Half-step — 8-state' },
      { value: 'micro', label: 'Microstep — sinusoidal' },
    ],
    help: 'Wave (1-phase), Full (2-phase on), Half (8-state), or Sinusoidal Microstepping.' },
  { key: 'current', label: 'Coil current', min: 200, max: 1400, step: 100, value: 800, unit: 'mA',
    help: 'Chopper driver peak current limit per phase. Sets holding torque.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Running clearance on the central rotor shaft.' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;   // 4.0 mm
const STATOR_H = 10.0;        // z = 4.0 .. 14.0 mm
const COIL_H = 4.5;           // z = 14.0 .. 18.5 mm
const POINTER_H = 5.0;        // z = 14.0 .. 19.0 mm

function geom(p) {
  const statorOuterR = 49;
  const statorYokeR = 41.5;
  const statorPoleR = 28.5;
  const rotorOuterR = 26.5;
  const rotorRootR = 22.8;

  const fullStepDeg = 90 / p.teeth;
  const resolutionDeg =
    p.mode === 'half' ? fullStepDeg / 2 : p.mode === 'micro' ? fullStepDeg / 16 : fullStepDeg;
  const modeGain = p.mode === 'full' ? 1.41 : p.mode === 'half' ? 1.2 : 1.0;
  const holdingTorqueNcm = ((p.current / 800) * (p.teeth / 10) * 28 * modeGain).toFixed(1);

  return {
    statorOuterR,
    statorYokeR,
    statorPoleR,
    rotorOuterR,
    rotorRootR,
    fullStepDeg,
    resolutionDeg,
    holdingTorqueNcm,
    plateW: 124,
    plateD: 124,
    topZ: PLATE_T + STATOR_H + POINTER_H,
  };
}

/** 4-pole stator iron ring with inward pole shoes at 0°, 90°, 180°, 270°. */
function stator4PoleOutline(outerR, yokeR, poleR) {
  const outer = circle(0, 0, outerR, 64);
  const inner = [];
  const poleHalf = 22 * DEG;
  for (let k = 0; k < 4; k++) {
    const c = (k * Math.PI) / 2;
    inner.push(...arc(0, 0, poleR, c - poleHalf, c + poleHalf, 12));
    inner.push(...arc(0, 0, yokeR, c + poleHalf + 0.06, c + Math.PI / 2 - poleHalf - 0.06, 14));
  }
  return { outer, inner };
}

/** Toothed ferromagnetic rotor profile with N salient teeth. */
function toothedRotorOutline(teeth, rOuter, rRoot) {
  const pts = [];
  const pitch = (2 * Math.PI) / teeth;
  const tipHalf = pitch * 0.24;
  const rootHalf = pitch * 0.22;

  for (let i = 0; i < teeth; i++) {
    const c = i * pitch;
    pts.push(...arc(0, 0, rRoot, c - pitch / 2 + tipHalf, c - rootHalf, 4));
    pts.push(...arc(0, 0, rOuter, c - tipHalf, c + tipHalf, 6));
  }
  return pts;
}

/** Pointer needle dial sitting above the rotor to show discrete angular steps. */
function pointerDialOutline() {
  const rHub = 9.5;
  const L = 23.0;
  const pts = [];
  pts.push([L, 0], [rHub * 0.7, 3.6]);
  pts.push(...arc(0, 0, rHub, 0.38, 2 * Math.PI - 0.38, 28));
  pts.push([rHub * 0.7, -3.6]);
  return pts;
}

export function build(p) {
  const g = geom(p);
  const boreR = POST_R + p.clearance / 2;

  const mounts = [
    [-g.plateW / 2 + 10, -g.plateD / 2 + 10],
    [g.plateW / 2 - 10, -g.plateD / 2 + 10],
    [-g.plateW / 2 + 10, g.plateD / 2 - 10],
    [g.plateW / 2 - 10, g.plateD / 2 - 10],
  ].map(([x, y]) => circle(x, y, 2.2, 20));

  const frame = part({
    id: 'frame',
    name: 'NEMA test mount baseplate',
    role: 'frame',
    color: '#ece6da',
    note: 'NEMA-style mounting plate with central rotor shaft post and corner bolt pattern',
    solids: [
      slab({
        outer: roundedRect({ x: -g.plateW / 2, y: -g.plateD / 2, w: g.plateW, h: g.plateD, r: 10, n: 6 }),
        holes: mounts,
        z: 0,
        h: PLATE_T,
      }),
      postSolid({ x: 0, y: 0, z0: PLATE_T, h: STATOR_H + POINTER_H + 1.5, r: POST_R }),
    ],
  });

  /* -- 4-pole stator iron core (z = 4.0..14.0 mm) -------------------------- */
  const st = stator4PoleOutline(g.statorOuterR, g.statorYokeR, g.statorPoleR);
  const stator = part({
    id: 'stator',
    name: '4-pole stator core',
    color: '#5aa2d4',
    layer: 1,
    note: 'silicon-steel stator ring with Phase A (0°/180°) and Phase B (90°/270°) poles',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: st.outer,
        holes: [
          st.inner,
          ...[0, 1, 2, 3].map((k) => {
            const a = (k * Math.PI) / 2 + Math.PI / 4;
            return circle(45 * Math.cos(a), 45 * Math.sin(a), 1.8, 16);
          }),
        ],
        z: 0,
        h: STATOR_H,
      }),
    ],
  });

  /* -- Phase A & Phase B copper coil bobbins (z = 14.0..18.5 mm) ----------- */
  const coilBobbinSlabs = [
    // Phase A+ (+x) and A- (-x)
    slab({ outer: roundedRect({ x: 29, y: -8.5, w: 12, h: 17, r: 2.2, n: 4 }), z: 0, h: COIL_H }),
    slab({ outer: roundedRect({ x: -41, y: -8.5, w: 12, h: 17, r: 2.2, n: 4 }), z: 0, h: COIL_H }),
    // Phase B+ (+y) and B- (-y)
    slab({ outer: roundedRect({ x: -8.5, y: 29, w: 17, h: 12, r: 2.2, n: 4 }), z: 0, h: COIL_H }),
    slab({ outer: roundedRect({ x: -8.5, y: -41, w: 17, h: 12, r: 2.2, n: 4 }), z: 0, h: COIL_H }),
  ];
  const coils = part({
    id: 'coils',
    name: 'Phase A & B coil windings',
    color: '#dcb038',
    layer: 2,
    note: 'quadrature bipolar windings energized in sequence by the chopper driver',
    at: { x: 0, y: 0, z: PLATE_T + STATOR_H },
    solids: coilBobbinSlabs,
  });

  /* -- Toothed permanent-magnet rotor (z = 4.0..14.0 mm) ------------------- */
  const rotor = part({
    id: 'rotor',
    name: 'Toothed magnet rotor',
    color: '#82c0e4',
    layer: 1,
    note: `${p.teeth} salient teeth — full step = ${g.fullStepDeg.toFixed(1)}° (90° / ${p.teeth})`,
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: toothedRotorOutline(p.teeth, g.rotorOuterR, g.rotorRootR),
        holes: [
          circle(0, 0, boreR, 36),
          ...[0, 1, 2, 3].map((k) => {
            const a = (k * Math.PI) / 2;
            return circle(14 * Math.cos(a), 14 * Math.sin(a), 2.8, 18);
          }),
        ],
        z: 0,
        h: STATOR_H,
      }),
    ],
  });

  /* -- Step index pointer needle (z = 14.0..19.0 mm) ----------------------- */
  const pointer = part({
    id: 'pointer',
    name: 'Step index pointer',
    color: '#489e8b',
    layer: 2,
    note: 'visualizes discrete full-step, half-step, and microstep increments',
    at: { x: 0, y: 0, z: PLATE_T + STATOR_H },
    solids: [
      slab({
        outer: pointerDialOutline(),
        holes: [circle(0, 0, boreR, 36)],
        z: 0,
        h: POINTER_H,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 1,
    color: '#e7dfd0',
    layer: 3,
    note: 'retains the toothed rotor and step pointer on the shaft',
    at: { x: 0, y: 0, z: g.topZ },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });

  const checks = [
    {
      ok: p.teeth % 4 === 2,
      text: `${p.teeth} rotor teeth (4k + 2 rule): opposite poles align while quadrature poles offset by 1/4 tooth pitch (${g.fullStepDeg.toFixed(1)}°).`,
    },
    {
      ok: true,
      text: `Mode "${p.mode}": angular resolution ${g.resolutionDeg.toFixed(2)}° per command, ${Math.round(360 / g.resolutionDeg)} steps/rev.`,
    },
    {
      ok: true,
      text: `Holding torque ~${g.holdingTorqueNcm} N·cm at ${p.current} mA/phase.`,
    },
    {
      ok: g.plateW <= 220,
      text: `Baseplate ${g.plateW} × ${g.plateD} mm fits a standard print bed.`,
    },
  ];

  return { parts: [frame, stator, coils, rotor, pointer, cap], checks, g };
}

/** Compute discrete or microstepped rotor angle and coil excitation from scrubbing angle t. */
function stepState(p, t) {
  const g = geom(p);
  // 1 electrical cycle (4 full steps) per 90° of timeline scrubber t so discrete steps are clearly visible!
  const fullStepsFloat = t / 22.5;
  let steppedIndex;
  let elecAngleRad;

  if (p.mode === 'wave' || p.mode === 'full') {
    steppedIndex = Math.floor(fullStepsFloat);
    const frac = fullStepsFloat - steppedIndex;
    // Snappy settling into each discrete detent step
    const settle = frac < 0.28 ? 0.5 - 0.5 * Math.cos((frac / 0.28) * Math.PI) : 1;
    const effectiveStep = steppedIndex + settle - 1;
    elecAngleRad = ((steppedIndex % 4 + 4) % 4) * (Math.PI / 2) + ( p.mode === 'full' ? Math.PI / 4 : 0 );
    return {
      mechDeg: effectiveStep * g.fullStepDeg,
      iA: Math.cos(elecAngleRad),
      iB: Math.sin(elecAngleRad),
      stepCount: steppedIndex,
    };
  }
  if (p.mode === 'half') {
    const halfFloat = fullStepsFloat * 2;
    const halfIdx = Math.floor(halfFloat);
    const frac = halfFloat - halfIdx;
    const settle = frac < 0.32 ? 0.5 - 0.5 * Math.cos((frac / 0.32) * Math.PI) : 1;
    const effectiveHalf = halfIdx + settle - 1;
    elecAngleRad = ((halfIdx % 8 + 8) % 8) * (Math.PI / 4);
    return {
      mechDeg: effectiveHalf * (g.fullStepDeg / 2),
      iA: Math.cos(elecAngleRad),
      iB: Math.sin(elecAngleRad),
      stepCount: halfIdx,
    };
  }
  // Microstepping: smooth sinusoidal current vector
  elecAngleRad = fullStepsFloat * (Math.PI / 2);
  return {
    mechDeg: fullStepsFloat * g.fullStepDeg,
    iA: Math.cos(elecAngleRad),
    iB: Math.sin(elecAngleRad),
    stepCount: Math.floor(fullStepsFloat * 16),
  };
}

export function pose(p, t = 0) {
  const st = stepState(p, t);
  const rot = st.mechDeg * DEG;
  return {
    frame: {},
    stator: {},
    coils: {},
    rotor: { rot },
    pointer: { rot },
    cap: {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const st = stepState(p, t);
  const iAmA = Math.round(st.iA * p.current);
  const iBmA = Math.round(st.iB * p.current);
  return [
    { label: 'Mode', value: p.mode.toUpperCase() },
    { label: 'Step angle', value: g.resolutionDeg.toFixed(2), unit: '°' },
    { label: 'Rotor', value: (((st.mechDeg % 360) + 360) % 360).toFixed(1), unit: '°' },
    { label: 'Phase A', value: `${iAmA >= 0 ? '+' : ''}${iAmA}`, unit: 'mA' },
    { label: 'Phase B', value: `${iBmA >= 0 ? '+' : ''}${iBmA}`, unit: 'mA' },
    { label: 'Torque', value: g.holdingTorqueNcm, unit: 'N·cm' },
  ];
}

export const steps = [
  {
    title: 'Vernier tooth alignment: why the rotor steps',
    text: 'Look closely at the air gap: while the horizontal Phase A poles are aligned tooth-to-tooth with the rotor, the vertical Phase B poles sit offset by 1/4 of a tooth pitch.',
    t: 15,
    parts: ['stator', 'rotor'],
    set: { mode: 'wave', teeth: 10 },
  },
  {
    title: 'Full-step mode: both phases energized (+41% torque)',
    text: 'In Full-Step mode, Phase A and Phase B are energized simultaneously (+566 mA / +566 mA), locking the rotor firmly between poles with √2 times the holding torque of Wave Drive.',
    t: 40,
    parts: ['coils', 'rotor'],
    set: { mode: 'full', teeth: 10 },
  },
  {
    title: 'Half-stepping: doubling angular resolution',
    text: 'Alternating between 1-phase-on and 2-phases-on cuts the step angle in half (from 9.0° to 4.5° on this 10-tooth model) without changing a single physical part.',
    t: 75,
    parts: ['pointer', 'coils'],
    set: { mode: 'half', teeth: 10 },
  },
  {
    title: 'Sinusoidal microstepping: ultra-smooth motion',
    text: 'By proportioning coil currents as I_A = I cos(θ) and I_B = I sin(θ), the magnetic field vector rotates continuously and eliminates discrete step ringing.',
    t: 120,
    parts: ['pointer', 'rotor'],
    set: { mode: 'micro', teeth: 10 },
  },
  {
    title: 'More rotor teeth = finer mechanical step',
    text: 'Increasing the rotor from 6 teeth to 14 teeth shrinks the full-step angle from 15.0° to 6.43° (a real NEMA-17 uses 50 teeth for 1.8° per full step).',
    t: 45,
    parts: ['rotor'],
    set: { teeth: 14, mode: 'full' },
  },
];
