/* Brushed DC motor — Lorentz force, split-ring commutation, and PWM speed control.

   A hands-on 2.5× cutaway demonstrator + physical-computing explainer:
   - Stationary permanent-magnet stator (North & South curved pole shoes).
   - Rotating multi-pole slotted iron armature core.
   - Co-rotating split-ring copper commutator above the armature.
   - Stationary spring-loaded carbon brushes pressing against the commutator to flip
     coil current every 180° so torque never reverses.
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { arc, gearProfile, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'dc-motor',
  title: 'Brushed DC motor',
  tagline: 'Continuous rotation from a split copper ring that flips coil current every half turn — '
    + 'controlled in speed by PWM and in direction by an H-bridge.',
  category: 'Motors & actuators',
  kind: 'motor',
  question: 'If a coil in a magnetic field only wants to align with the magnets and stop, how does a DC '
    + 'motor keep spinning continuously — and why can’t an Arduino pin drive it directly?',
  bigIdea: 'Just as an armature pole reaches the magnet it is attracted to, the split-ring commutator slides '
    + 'across the carbon brushes and reverses the current in that coil — turning attraction into repulsion '
    + 'at the exact right angle, automatically, at any speed.',
  notes: [
    {
      h: '1. The mechanical switch inside the motor',
      p: 'A permanent magnet only pulls an electromagnet until their poles align; past that point it pulls '
        + 'the rotor back. A brushed DC motor solves this with a <b>commutator</b>: a segmented copper ring '
        + 'mounted on the shaft. Stationary <b>carbon brushes</b> rub against the ring so that whichever '
        + 'coil is crossing the horizontal field zone always carries current in the same spatial direction.',
    },
    {
      h: '2. Why 3 (or 5) armature poles instead of 2?',
      p: 'A 2-pole rotor has two dead spots where the brushes bridge the commutator gap and torque drops to '
        + 'zero. Using <b>3 or 5 poles</b> wired in a delta/star loop guarantees that at least two coils '
        + 'always produce torque in the same direction — making the motor self-starting from any angle.',
    },
    {
      h: '3. Speed vs. torque and Back-EMF',
      p: 'Spinning coils inside a magnet also act as a generator, producing a reverse voltage called '
        + '<b>Back-EMF</b> (`V_bemf = K_e · ω`) that opposes the supply voltage. At no load the rotor speeds '
        + 'up until `V_bemf` nearly equals `V_supply` and current drops small; when you stall the shaft, '
        + '`V_bemf = 0` and stall current spikes (`I_stall = V / R`).',
    },
    {
      h: '4. Driving it from an Arduino: H-Bridge + PWM',
      p: 'An Arduino GPIO pin safely sources 20 mA, while even a tiny hobby DC motor draws 150–800 mA. '
        + 'Use a transistor <b>H-bridge</b> (DRV8833, TB6612FNG, or L298N): four switches arranged in an "H" '
        + 'let you reverse polarity for CW/CCW rotation and pulse the enable pin with `analogWrite()` (PWM) '
        + 'to vary average voltage and speed.',
    },
  ],
  wiring: {
    driver: 'TB6612FNG / DRV8833 Dual H-Bridge',
    supply: '5–9 V external motor supply (common GND with Arduino)',
    connections: [
      { from: 'Arduino D9 (PWM ~)', to: 'Driver PWMA / IN1', role: 'PWM duty cycle (speed)' },
      { from: 'Arduino D8', to: 'Driver AIN1 / IN2', role: 'Direction control A' },
      { from: 'Arduino D7', to: 'Driver AIN2', role: 'Direction control B' },
      { from: 'External 6 V + / −', to: 'Driver VM & GND', role: 'High-current motor rail' },
      { from: 'Driver AOUT1 / AOUT2', to: 'DC Motor terminals', role: 'Reversibleswitched coil power' },
    ],
  },
  code: `// Brushed DC Motor: Speed (PWM) + Direction (H-Bridge)
const int PIN_PWM = 9;   // Timer PWM pin -> Driver PWMA
const int PIN_DIR1 = 8;  // Direction pin 1 -> Driver AIN1
const int PIN_DIR2 = 7;  // Direction pin 2 -> Driver AIN2

void setMotor(int speedPct, bool forward) {
  int pwm = map(constrain(speedPct, 0, 100), 0, 100, 0, 255);
  digitalWrite(PIN_DIR1, forward ? HIGH : LOW);
  digitalWrite(PIN_DIR2, forward ? LOW  : HIGH);
  analogWrite(PIN_PWM, pwm);
}

void setup() {
  pinMode(PIN_PWM, OUTPUT);
  pinMode(PIN_DIR1, OUTPUT);
  pinMode(PIN_DIR2, OUTPUT);
}

void loop() {
  setMotor(75, true);    // 75% duty cycle forward
  delay(2000);
  setMotor(0, true);     // Coast / stop
  delay(500);
  setMotor(50, false);   // 50% duty cycle reverse
  delay(2000);
}`,
  references: [
    { label: 'Brushed DC electric motor — Wikipedia', url: 'https://en.wikipedia.org/wiki/Brushed_DC_electric_motor' },
    { label: 'H-bridge bidirectional motor control', url: 'https://en.wikipedia.org/wiki/H-bridge' },
  ],
  attribution: 'Brushed DC motor cutaway — printable 2.5× classroom demonstrator of stator poles, slotted rotor, split commutator, and brushes.',
  screenshot: { t: 38, azimuth: -0.52, elevation: 0.82 },
  order: 80,
};

export const params = [
  { key: 'duty', label: 'PWM duty cycle', min: 10, max: 100, step: 5, value: 75, unit: '%',
    help: 'Average voltage fraction sent by analogWrite(). Scales no-load speed linearly.' },
  { key: 'load', label: 'Mechanical load', min: 0, max: 80, step: 5, value: 20, unit: '%',
    help: 'External load torque as a percentage of stall torque. Increases current draw and slows the rotor.' },
  { key: 'poles', label: 'Armature poles', min: 3, max: 5, step: 2, value: 3,
    help: 'Number of wound rotor salient poles and commutator segments (3 or 5).' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Running clearance on the central rotor shaft and brush pivots.' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;   // 4.0 mm
const STATOR_H = 10.0;        // z = 4.0 .. 14.0 mm
const COMM_H = 6.0;           // z = 14.0 .. 20.0 mm
const PINION_H = 5.0;         // z = 20.0 .. 25.0 mm
const BRUSH_POST_R = 2.8;

function geom(p) {
  const statorOuterR = 48;
  const statorYokeR = 41.5;
  const statorPoleR = 32.5;
  const rotorR = 30.0;
  const commR = 13.0;
  const brushPivotX = 27.5;
  const brushPivotY = -20.0;

  // Electrical / mechanical telemetry model (6V nominal hobby motor)
  const vSupply = 6.0;
  const vEff = vSupply * (p.duty / 100);
  const speedFactor = Math.max(0.05, (p.duty / 100) * (1 - p.load / 100));
  const rpm = Math.round(6000 * speedFactor);
  const backEmf = vEff * (1 - p.load / 100);
  const currentMa = Math.round(60 + 950 * (p.duty / 100) * (p.load / 100));

  return {
    statorOuterR,
    statorYokeR,
    statorPoleR,
    rotorR,
    commR,
    brushPivotX,
    brushPivotY,
    vEff,
    speedFactor,
    rpm,
    backEmf,
    currentMa,
    plateW: 132,
    plateD: 124,
    topZ: PLATE_T + STATOR_H + COMM_H + PINION_H,
  };
}

/** Stator ring with North (+x) and South (-x) curved field pole shoes. */
function statorOutline(outerR, yokeR, poleR) {
  const outer = circle(0, 0, outerR, 64);
  // Build inner hole with two inward-protruding pole shoes centered at 0° and 180°
  const poleHalf = 52 * DEG;
  const inner = [];
  // Right pole shoe (-52° to +52° at poleR)
  inner.push(...arc(0, 0, poleR, -poleHalf, poleHalf, 20));
  // Top yoke arc (+56° to +124° at yokeR)
  inner.push(...arc(0, 0, yokeR, poleHalf + 0.07, Math.PI - poleHalf - 0.07, 16));
  // Left pole shoe (+128° to +232° at poleR)
  inner.push(...arc(0, 0, poleR, Math.PI - poleHalf, Math.PI + poleHalf, 20));
  // Bottom yoke arc (+236° to +304° at yokeR)
  inner.push(...arc(0, 0, yokeR, Math.PI + poleHalf + 0.07, 2 * Math.PI - poleHalf - 0.07, 16));
  return { outer, inner };
}

/** Multi-pole T-laminated armature profile with coil slots and rounded pole shoes. */
function armatureOutline(poles, rOuter, rCore = 12.5) {
  const pts = [];
  const step = (2 * Math.PI) / poles;
  const shoeHalf = step * 0.34;
  const neckHalf = step * 0.14;
  const rNeck = rOuter - 4.2;

  for (let i = 0; i < poles; i++) {
    const c = i * step;
    // Root between poles
    pts.push(...arc(0, 0, rCore, c - step / 2 + neckHalf, c - neckHalf, 5));
    // Rising neck to pole shoe tip
    pts.push([rNeck * Math.cos(c - neckHalf), rNeck * Math.sin(c - neckHalf)]);
    // Curved pole shoe outer arc
    pts.push(...arc(0, 0, rOuter, c - shoeHalf, c + shoeHalf, 12));
    // Falling neck back to root
    pts.push([rNeck * Math.cos(c + neckHalf), rNeck * Math.sin(c + neckHalf)]);
  }
  return pts;
}

/** Split-ring commutator with radial insulation slots between copper segments. */
function commutatorOutline(poles, rOuter) {
  const pts = [];
  const step = (2 * Math.PI) / poles;
  const gapHalf = 0.065;
  const rSlot = rOuter - 2.6;

  for (let i = 0; i < poles; i++) {
    const a0 = i * step + gapHalf;
    const a1 = (i + 1) * step - gapHalf;
    pts.push(...arc(0, 0, rOuter, a0, a1, 14));
    const gMid = (i + 1) * step;
    pts.push([rSlot * Math.cos(a1), rSlot * Math.sin(a1)]);
    pts.push([rSlot * Math.cos(gMid + gapHalf), rSlot * Math.sin(gMid + gapHalf)]);
  }
  return pts;
}

/** Single brush arm pivoting at (px, py) and pressing a carbon block against (sx * commR, 0). */
function brushArmOutline(sx, px, py, commR) {
  // sx = -1 for left (+) brush, +1 for right (-) brush
  const xTip = sx * (commR + 0.5);
  const xBack = sx * (commR + 7.5);
  const xPivOut = sx * (Math.abs(px) + 5.0);
  const xPivIn = sx * (Math.abs(px) - 4.5);

  const raw = [
    [xTip, -4.5],
    [xTip, 4.5],
    [xBack, 4.5],
    [xPivOut, py + 4.0],
    [xPivOut, py - 4.8],
    [xPivIn, py - 4.8],
    [xPivIn, py + 1.0],
    [xBack, -4.5],
  ];
  return sx > 0 ? raw : raw.slice().reverse();
}

export function build(p) {
  const g = geom(p);
  const boreR = POST_R + p.clearance / 2;
  const brushBoreR = BRUSH_POST_R + p.clearance / 2;

  const mounts = [
    [-g.plateW / 2 + 10, -g.plateD / 2 + 10],
    [g.plateW / 2 - 10, -g.plateD / 2 + 10],
    [-g.plateW / 2 + 10, g.plateD / 2 - 10],
    [g.plateW / 2 - 10, g.plateD / 2 - 10],
  ].map(([x, y]) => circle(x, y, 2.0, 20));

  const frame = part({
    id: 'frame',
    name: 'Test stand baseplate',
    role: 'frame',
    color: '#ece6da',
    note: 'baseplate with central rotor shaft post and dual raised brush-holder pedestals',
    solids: [
      slab({
        outer: roundedRect({ x: -g.plateW / 2, y: -g.plateD / 2, w: g.plateW, h: g.plateD, r: 8, n: 6 }),
        holes: mounts,
        z: 0,
        h: PLATE_T,
      }),
      // Central rotor axle post
      postSolid({ x: 0, y: 0, z0: PLATE_T, h: STATOR_H + COMM_H + PINION_H + 1.5, r: POST_R }),
      // Left and right brush pedestals rising through the stator plane into the commutator plane
      ...[-1, 1].map((sx) =>
        slab({
          outer: circle(sx * g.brushPivotX, g.brushPivotY, 5.2, 28),
          z: PLATE_T,
          h: STATOR_H,
        })
      ),
      ...[-1, 1].map((sx) =>
        slab({
          outer: circle(sx * g.brushPivotX, g.brushPivotY, BRUSH_POST_R, 24),
          z: PLATE_T + STATOR_H,
          h: COMM_H + 1.0,
        })
      ),
    ],
  });

  /* -- Stationary permanent-magnet stator (z = 4.0..14.0 mm) -------------- */
  const st = statorOutline(g.statorOuterR, g.statorYokeR, g.statorPoleR);
  const stator = part({
    id: 'stator',
    name: 'Stator magnets (N / S)',
    color: '#5aa2d4',
    layer: 1,
    note: 'outer flux ring with curved North and South permanent-magnet pole shoes',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: st.outer,
        holes: [
          st.inner,
          circle(0, g.statorOuterR - 3.2, 1.8, 16),
          circle(0, -g.statorOuterR + 3.2, 1.8, 16),
        ],
        z: 0,
        h: STATOR_H,
      }),
    ],
  });

  /* -- Rotating wound armature core (z = 4.0..14.0 mm) -------------------- */
  const coilHoles = [];
  for (let i = 0; i < p.poles; i++) {
    const a = (i * 2 * Math.PI) / p.poles;
    coilHoles.push(circle(19.5 * Math.cos(a), 19.5 * Math.sin(a), 2.2, 18));
  }
  const rotor = part({
    id: 'rotor',
    name: 'Wound armature rotor',
    color: '#82c0e4',
    layer: 1,
    note: `${p.poles}-pole laminated iron core with copper coil slots`,
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: armatureOutline(p.poles, g.rotorR, 12.2),
        holes: [circle(0, 0, boreR, 36), ...coilHoles],
        z: 0,
        h: STATOR_H,
      }),
    ],
  });

  /* -- Split-ring copper commutator (z = 14.0..20.0 mm) ------------------- */
  const commutator = part({
    id: 'commutator',
    name: 'Split-ring commutator',
    color: '#dcb038',
    layer: 2,
    note: `${p.poles} copper segments separated by air/mica gaps — rotates with the rotor to flip current`,
    at: { x: 0, y: 0, z: PLATE_T + STATOR_H },
    solids: [
      slab({
        outer: commutatorOutline(p.poles, g.commR),
        holes: [circle(0, 0, boreR, 36)],
        z: 0,
        h: COMM_H,
      }),
    ],
  });

  /* -- Stationary spring carbon brushes (z = 14.0..20.0 mm) --------------- */
  const brushes = part({
    id: 'brushes',
    name: 'Carbon brushes (+ / −)',
    color: '#5a636b',
    layer: 2,
    note: 'stationary graphite contacts pressing against opposite sides of the spinning commutator',
    at: { x: 0, y: 0, z: PLATE_T + STATOR_H },
    solids: [-1, 1].map((sx) =>
      slab({
        outer: brushArmOutline(sx, g.brushPivotX, g.brushPivotY, g.commR),
        holes: [circle(sx * g.brushPivotX, g.brushPivotY, brushBoreR, 24)],
        z: 0,
        h: COMM_H,
      })
    ),
  });

  /* -- Output drive pinion (z = 20.0..25.0 mm) ---------------------------- */
  const pinionGear = gearProfile({ teeth: 14, module: 2.0 });
  const pinion = part({
    id: 'pinion',
    name: 'Output drive pinion',
    color: '#489e8b',
    layer: 3,
    note: '14-tooth module-2 output pinion delivering mechanical shaft power',
    at: { x: 0, y: 0, z: PLATE_T + STATOR_H + COMM_H },
    solids: [
      slab({
        outer: pinionGear.outer,
        holes: [circle(0, 0, boreR, 36), circle(7.5, 0, 1.8, 16)],
        z: 0,
        h: PINION_H,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 1,
    color: '#e7dfd0',
    layer: 4,
    note: 'retains the rotor, commutator, and output pinion on the shaft',
    at: { x: 0, y: 0, z: g.topZ },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });

  const checks = [
    {
      ok: true,
      text: `Air gap ${(g.statorPoleR - g.rotorR).toFixed(1)} mm between the ${p.poles}-pole rotor and N/S stator pole shoes.`,
    },
    {
      ok: p.poles >= 3,
      text: `${p.poles} commutator segments (${(360 / p.poles).toFixed(0)}° each) eliminate dead-spot stall angles.`,
    },
    {
      ok: p.load < 95,
      text: `At ${p.duty}% PWM and ${p.load}% load: ~${g.rpm} RPM, Back-EMF ${g.backEmf.toFixed(2)} V, coil current ${g.currentMa} mA.`,
    },
    {
      ok: g.plateW <= 220,
      text: `Cutaway demonstrator footprint ${g.plateW} × ${g.plateD} mm fits a standard print bed.`,
    },
  ];

  return { parts: [frame, stator, rotor, commutator, brushes, pinion, cap], checks, g };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const rot = t * g.speedFactor * DEG;
  return {
    frame: {},
    stator: {},
    rotor: { rot },
    commutator: { rot },
    brushes: {},
    pinion: { rot },
    cap: {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const deg = ((t * g.speedFactor) % 360 + 360) % 360;
  const activeSeg = (Math.floor((deg / 360) * p.poles) % p.poles) + 1;
  return [
    { label: 'PWM duty', value: `${p.duty}`, unit: '%' },
    { label: 'Speed', value: `${g.rpm}`, unit: 'RPM' },
    { label: 'Back-EMF', value: g.backEmf.toFixed(2), unit: 'V' },
    { label: 'Current', value: `${g.currentMa}`, unit: 'mA' },
    { label: 'Commutator', value: `Seg ${activeSeg}/${p.poles}` },
    { label: 'Rotor', value: deg.toFixed(0), unit: '°' },
  ];
}

export const steps = [
  {
    title: 'Magnetic attraction & repulsion (Lorentz force)',
    text: 'Current enters through the carbon brushes into the commutator and energizes the armature coils. One rotor pole is pulled toward the North stator magnet while the opposite pole is pushed away from the South magnet.',
    t: 25,
    parts: ['stator', 'rotor'],
  },
  {
    title: 'Commutation: flipping current at the neutral zone',
    text: 'As a rotor pole aligns with the stator magnet, the split gap in the copper commutator slides past the stationary carbon brush. Current in that winding reverses direction so torque keeps pushing the same way.',
    t: 60,
    parts: ['commutator', 'brushes'],
  },
  {
    title: 'PWM speed control (analogWrite)',
    text: 'Lowering PWM duty cycle to 35% chops the 6 V supply into narrow pulses. The rotor’s mechanical inertia averages those pulses into a lower effective voltage and slower speed.',
    t: 140,
    parts: ['rotor', 'pinion'],
    set: { duty: 35, load: 15 },
  },
  {
    title: 'Heavy mechanical load: Back-EMF drops, current spikes',
    text: 'Increasing mechanical load to 75% slows the rotor down. Because Back-EMF is proportional to speed, less counter-voltage opposes the supply and coil current climbs sharply to deliver more torque.',
    t: 210,
    parts: ['pinion', 'rotor'],
    set: { duty: 85, load: 75 },
  },
  {
    title: '5-pole armature: smoother torque, less ripple',
    text: 'Switching from a 3-pole to a 5-pole rotor & commutator narrows each commutation step from 120° to 72°, reducing torque ripple and brush sparking.',
    t: 90,
    parts: ['rotor', 'commutator'],
    set: { poles: 5, duty: 75, load: 20 },
  },
];
