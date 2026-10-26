/* Positional hobby servo — inside the black box: DC motor, compound gear train,
   potentiometer feedback sensor, and PWM pulse-width comparator.

   3-axis printable cutaway demonstrator + physical-computing explainer:
   - Axis 1 (left): High-speed DC motor armature & 10T input pinion (z = 10..15.5 mm).
   - Axis 2 (middle): Compound reduction gear — 26T upper stage driven by the motor
     pinion (z = 10..15.5 mm) + 10T lower pinion (z = 4..10 mm).
   - Axis 3 (right): 30T final output gear (z = 4..10 mm), coupled potentiometer wiper
     disc (z = 15.5..19.5 mm), and 3D-printable servo horn (z = 19.5..24.5 mm).
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { gearProfile, arc, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'servo-motor',
  title: 'Positional servo motor',
  tagline: 'Inside the plastic case: a tiny DC motor, a compound reduction geartrain, and a '
    + 'potentiometer that closes the position feedback loop.',
  category: 'Motors & actuators',
  kind: 'motor',
  question: 'How does a 3-wire hobby servo know its exact shaft angle — and how does a 1000–2000 µs '
    + 'pulse tell the internal DC motor when to spin and when to stop?',
  bigIdea: 'A hobby servo is not a special kind of electric motor — it is a complete closed-loop control '
    + 'system in a box: a fast DC motor, a high-ratio compound gear train, a potentiometer wired as a '
    + 'voltage divider on the output shaft, and a comparator chip that drives the motor until measured '
    + 'angle equals commanded pulse width.',
  notes: [
    {
      h: '1. Four subsystems inside one case',
      p: 'Pop the lid off an SG90 or MG996R servo and you find four parts working together: '
        + '(1) a high-RPM <b>brushed DC motor</b>, (2) a <b>compound reduction geartrain</b> (~50:1 to 180:1) '
        + 'that trades speed for torque, (3) a <b>rotary potentiometer</b> coupled directly to the final '
        + 'output gear, and (4) a <b>control PCB</b> with an H-bridge and pulse-width comparator.',
    },
    {
      h: '2. How the 50 Hz servo pulse works (1000–2000 µs)',
      p: 'Unlike DC motor PWM where duty cycle sets speed, a hobby servo reads the <b>absolute high-time '
        + 'duration</b> of a pulse sent every 20 ms (50 Hz): <b>1000 µs (1.0 ms)</b> commands −90° (0°), '
        + '<b>1500 µs (1.5 ms)</b> commands center (90°), and <b>2000 µs (2.0 ms)</b> commands +90° (180°).',
    },
    {
      h: '3. Proportional error feedback & deadband',
      p: 'Inside the servo IC, the incoming pulse charges a reference capacitor while the potentiometer '
        + 'produces a voltage proportional to current shaft angle `θ_actual`. The difference `e = θ_cmd − θ_actual` '
        + 'drives the internal H-bridge: large errors run the DC motor at full speed; as `e` shrinks inside '
        + 'the ~4 µs (~0.4°) <b>deadband</b>, the H-bridge shuts off so the servo holds without hunting.',
    },
    {
      h: '4. Compound gears: huge ratio in a tiny footprint',
      p: 'Stacking a large driven gear and a small driving pinion on the same intermediate shaft creates a '
        + '<b>compound gear stage</b>. Ratios multiply from stage to stage (`R_total = R_1 × R_2 × R_3`), '
        + 'turning a 9000 RPM / low-torque DC motor into a 60 RPM output spline strong enough to lift a '
        + 'robotic arm.',
    },
  ],
  wiring: {
    driver: 'Built-in Servo Control PCB (Arduino Servo.h)',
    supply: '5.0–6.0 V regulated 1–2 A rail (do not power multiple servos from Arduino 5V pin)',
    connections: [
      { from: 'Arduino D9', to: 'Servo Orange / Yellow (SIG)', role: '50 Hz pulse (1000–2000 µs)' },
      { from: 'External 5V +', to: 'Servo Red (VCC)', role: 'Motor & control power (4.8–6 V)' },
      { from: 'Arduino GND + Supply −', to: 'Servo Brown / Black (GND)', role: 'Common signal & power ground' },
    ],
  },
  code: `// Positional Hobby Servo: Closed-Loop Angle Control (1000-2000 us)
#include <Servo.h>

Servo myServo;
const int PIN_SERVO = 9;

void setup() {
  myServo.attach(PIN_SERVO, 1000, 2000); // 1000 us = 0 deg, 2000 us = 180 deg
}

void loop() {
  myServo.writeMicroseconds(1500); // Center position (90 deg)
  delay(1000);
  myServo.writeMicroseconds(1000); // Full CCW (-90 / 0 deg)
  delay(1000);
  myServo.writeMicroseconds(2000); // Full CW (+90 / 180 deg)
  delay(1000);
}`,
  references: [
    { label: 'Servomechanism & RC servo control — Wikipedia', url: 'https://en.wikipedia.org/wiki/Servo_control' },
    { label: 'Arduino Servo Library reference', url: 'https://docs.arduino.cc/libraries/servo/' },
  ],
  attribution: 'Positional servo motor cutaway — printable 3-axis compound geartrain, DC motor pinion, potentiometer wiper, and servo horn.',
  screenshot: { t: 55, azimuth: -0.52, elevation: 0.80 },
  order: 100,
};

export const params = [
  { key: 'pulse', label: 'Command pulse', min: 1000, max: 2000, step: 25, value: 1500, unit: 'µs',
    help: 'Center command pulse width (1000 µs = −90°, 1500 µs = 0° center, 2000 µs = +90°).' },
  { key: 'sweep', label: 'Dynamic sweep', min: 0, max: 140, step: 10, value: 90, unit: '°',
    help: 'Oscillation amplitude around the commanded pulse center so you can watch the geartrain work.' },
  { key: 'kp', label: 'Loop stiffness (Kp)', min: 2, max: 10, step: 1, value: 7,
    help: 'Proportional feedback gain of the internal comparator loop.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Running clearance on the three gear-train shafts.' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;   // 4.0 mm
const TIER1_H = 6.0;          // z = 4.0 .. 10.0 mm (DC motor can, compound lower pinion, output gear)
const TIER2_H = 5.5;          // z = 10.0 .. 15.5 mm (DC motor pinion, compound upper gear)
const TIER3_H = 4.0;          // z = 15.5 .. 19.5 mm (Potentiometer feedback wiper on output shaft)
const TIER4_H = 5.0;          // z = 19.5 .. 24.5 mm (Servo horn arm)

function geom(p) {
  // Stage 1 (Tier 2: z = 10..15.5 mm): 10T motor pinion (m=1.6) -> 26T compound upper gear (m=1.6)
  const gMotor = gearProfile({ teeth: 10, module: 1.6 });
  const gCompUpper = gearProfile({ teeth: 26, module: 1.6 });

  // Stage 2 (Tier 1: z = 4..10 mm): 10T compound lower pinion (m=1.8) -> 30T output gear (m=1.8)
  const gCompLower = gearProfile({ teeth: 10, module: 1.8 });
  const gOutput = gearProfile({ teeth: 30, module: 1.8 });

  const c12 = gMotor.pitchRadius + gCompUpper.pitchRadius;     // 8.0 + 20.8 = 28.8 mm
  const c23 = gCompLower.pitchRadius + gOutput.pitchRadius;    // 9.0 + 27.0 = 36.0 mm

  const x1 = -34.0;
  const x2 = x1 + c12; // -5.2 mm
  const x3 = x2 + c23; // +30.8 mm

  const ratio1 = 26 / 10;
  const ratio2 = 30 / 10;
  const totalRatio = ratio1 * ratio2; // 7.80x visible cutaway reduction

  return {
    gMotor,
    gCompUpper,
    gCompLower,
    gOutput,
    x1,
    x2,
    x3,
    ratio1,
    ratio2,
    totalRatio,
    plateW: 138,
    plateD: 92,
    topZ: PLATE_T + TIER1_H + TIER2_H + TIER3_H + TIER4_H,
  };
}

/** Potentiometer wiper disc with resistive track indicator tabs. */
function potWiperOutline(r = 14.5) {
  const pts = [];
  pts.push([r + 4.5, 0], [r - 1.0, 3.2]);
  pts.push(...arc(0, 0, r, 0.24, 2 * Math.PI - 0.24, 32));
  pts.push([r - 1.0, -3.2]);
  return pts;
}

/** Symmetric double-ended servo horn with mounting holes. */
function servoHornOutline(len = 34) {
  const rHub = 8.8;
  const rTip = 5.4;
  const pts = [];
  pts.push(...arc(len, 0, rTip, -Math.PI / 2, Math.PI / 2, 12));
  pts.push(...arc(0, 0, rHub, 0.55, Math.PI - 0.55, 10));
  pts.push(...arc(-len * 0.55, 0, rTip, Math.PI / 2, (3 * Math.PI) / 2, 12));
  pts.push(...arc(0, 0, rHub, Math.PI + 0.55, 2 * Math.PI - 0.55, 10));
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
  ].map(([x, y]) => circle(x, y, 2.0, 20));

  // Degree scale ticks around the output shaft (x3, 0)
  const scaleHoles = [];
  for (let deg = -90; deg <= 90; deg += 30) {
    const a = deg * DEG;
    const rTick = 34.5;
    scaleHoles.push(circle(g.x3 + rTick * Math.cos(a), rTick * Math.sin(a), 1.1, 12));
  }

  const frame = part({
    id: 'frame',
    name: 'Servo gearbox baseplate',
    role: 'frame',
    color: '#ece6da',
    note: '3-axis gear train plate with DC motor housing boss, idler post, and output spline post',
    solids: [
      slab({
        outer: roundedRect({ x: -g.plateW / 2, y: -g.plateD / 2, w: g.plateW, h: g.plateD, r: 8, n: 6 }),
        holes: [...mounts, ...scaleHoles],
        z: 0,
        h: PLATE_T,
      }),
      // DC motor housing cylinder on Tier 1 under the input pinion (at x1)
      slab({
        outer: circle(g.x1, 0, 14.5, 36),
        z: PLATE_T,
        h: TIER1_H,
      }),
      // Post 1 (DC motor shaft above motor can)
      postSolid({ x: g.x1, y: 0, z0: PLATE_T + TIER1_H, h: TIER2_H + 1.5, r: POST_R }),
      // Post 2 (Compound idler gear shaft)
      postSolid({ x: g.x2, y: 0, z0: PLATE_T, h: TIER1_H + TIER2_H + 1.5, r: POST_R }),
      // Post 3 (Final output shaft carrying output gear, pot wiper, and servo horn)
      postSolid({ x: g.x3, y: 0, z0: PLATE_T, h: TIER1_H + TIER2_H + TIER3_H + TIER4_H + 1.5, r: POST_R }),
    ],
  });

  /* -- Axis 1: High-speed DC motor input pinion (Tier 2: z = 10..15.5 mm) -- */
  const motorPinion = part({
    id: 'motor-pinion',
    name: 'DC motor & 10T pinion',
    color: '#dcb038',
    layer: 2,
    note: `spins ${g.totalRatio.toFixed(1)}× faster than the output horn`,
    at: { x: g.x1, y: 0, z: PLATE_T + TIER1_H },
    solids: [
      slab({
        outer: g.gMotor.outer,
        holes: [circle(0, 0, boreR, 32)],
        z: 0,
        h: TIER2_H,
      }),
    ],
  });

  /* -- Axis 2: Compound reduction gear (10T lower + 26T upper) ------------- */
  const compoundGear = part({
    id: 'compound-gear',
    name: 'Compound idler gear (26T / 10T)',
    color: '#5aa2d4',
    layer: 1,
    note: 'two gears locked together: 26T upper stage driven by the motor, 10T lower stage driving the output',
    at: { x: g.x2, y: 0, z: PLATE_T },
    solids: [
      // Tier 1 (z = 0..6.0 mm): 10T lower pinion driving the 30T output gear
      slab({
        outer: g.gCompLower.outer,
        holes: [circle(0, 0, boreR, 32)],
        z: 0,
        h: TIER1_H,
      }),
      // Tier 2 (z = 6.0..11.5 mm): 26T upper gear meshing with the 10T motor pinion
      slab({
        outer: g.gCompUpper.outer,
        holes: [
          circle(0, 0, boreR, 32),
          ...[0, 1, 2, 3].map((k) => {
            const a = (k * Math.PI) / 2;
            return circle(12.2 * Math.cos(a), 12.2 * Math.sin(a), 2.8, 18);
          }),
        ],
        z: TIER1_H,
        h: TIER2_H,
      }),
    ],
  });

  /* -- Axis 3: Final 30T output gear (Tier 1: z = 4.0..10.0 mm) ------------ */
  const outputGear = part({
    id: 'output-gear',
    name: '30T final output gear',
    color: '#82c0e4',
    layer: 1,
    note: 'final reduction stage multiplying torque onto the output spline',
    at: { x: g.x3, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: g.gOutput.outer,
        holes: [
          circle(0, 0, boreR, 36),
          ...[0, 1, 2, 3].map((k) => {
            const a = (k * Math.PI) / 2 + Math.PI / 4;
            return circle(15.5 * Math.cos(a), 15.5 * Math.sin(a), 3.6, 20);
          }),
        ],
        z: 0,
        h: TIER1_H,
      }),
    ],
  });

  /* -- Axis 3: Feedback potentiometer wiper (Tier 3: z = 15.5..19.5 mm) ---- */
  const potentiometer = part({
    id: 'potentiometer',
    name: 'Feedback potentiometer wiper',
    color: '#489e8b',
    layer: 2,
    note: 'coupled directly to the output shaft — converts angle into 0.5–4.5 V feedback voltage',
    at: { x: g.x3, y: 0, z: PLATE_T + TIER1_H + TIER2_H },
    solids: [
      slab({
        outer: potWiperOutline(14.5),
        holes: [circle(0, 0, boreR, 32), circle(-7.5, 0, 2.0, 16)],
        z: 0,
        h: TIER3_H,
      }),
    ],
  });

  /* -- Axis 3: Printable servo horn (Tier 4: z = 19.5..24.5 mm) ------------ */
  const horn = part({
    id: 'horn',
    name: 'Servo output horn',
    color: '#dcb038',
    layer: 3,
    note: 'multi-hole linkage horn bolted to the output spline',
    at: { x: g.x3, y: 0, z: PLATE_T + TIER1_H + TIER2_H + TIER3_H },
    solids: [
      slab({
        outer: servoHornOutline(32),
        holes: [
          circle(0, 0, boreR, 32),
          circle(14, 0, 1.6, 16),
          circle(21, 0, 1.6, 16),
          circle(28, 0, 1.6, 16),
          circle(-14, 0, 1.6, 16),
        ],
        z: 0,
        h: TIER4_H,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 4,
    note: 'retains the compound gear and output stack',
    at: { x: g.x3, y: 0, z: g.topZ },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const capIdler = {
    ...cap,
    id: 'cap-idler',
    at: { x: g.x2, y: 0, z: PLATE_T + TIER1_H + TIER2_H },
  };

  const cmdDeg = ((p.pulse - 1500) / 500) * 90;
  const checks = [
    {
      ok: p.pulse >= 1000 && p.pulse <= 2000,
      text: `Pulse ${p.pulse} µs commands center target angle ${cmdDeg >= 0 ? '+' : ''}${cmdDeg.toFixed(1)}°.`,
    },
    {
      ok: true,
      text: `2-stage cutaway reduction (26:10 × 30:10 = ${g.totalRatio.toFixed(2)}:1): the motor pinion turns ${g.totalRatio.toFixed(1)}° for every 1° of horn motion.`,
    },
    {
      ok: true,
      text: `Co-planar meshing on both tiers: Stage 1 at z = 10..15.5 mm, Stage 2 at z = 4..10 mm.`,
    },
    {
      ok: g.plateW <= 220,
      text: `Baseplate ${g.plateW} × ${g.plateD} mm fits a 220 mm print bed.`,
    },
  ];

  return {
    parts: [frame, motorPinion, compoundGear, outputGear, potentiometer, horn, cap, capIdler],
    checks,
    g,
  };
}

/** Closed-loop angle state at timeline parameter t. */
function servoState(p, t) {
  const centerDeg = ((p.pulse - 1500) / 500) * 90;
  const wave = Math.sin(t * DEG);
  const rawCmd = centerDeg + (p.sweep / 2) * wave;
  const cmdDeg = Math.max(-90, Math.min(90, rawCmd));
  // Simulate proportional closed-loop tracking lag inversely proportional to kp
  const lagRad = 0.28 / p.kp;
  const actualRaw = centerDeg + (p.sweep / 2) * Math.sin(t * DEG - lagRad) * (p.kp / (p.kp + 0.6));
  const actualDeg = Math.max(-90, Math.min(90, actualRaw));
  const errDeg = cmdDeg - actualDeg;
  const pulseUs = Math.round(1500 + (cmdDeg / 90) * 500);
  const potVolts = 2.5 + (actualDeg / 90) * 2.0;
  return { cmdDeg, actualDeg, errDeg, pulseUs, potVolts };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const st = servoState(p, t);
  const outRot = st.actualDeg * DEG;
  const compRot = -outRot * g.ratio2 + (Math.PI / 10); // phase offset for clean tooth mesh
  const motorRot = -compRot * g.ratio1;

  return {
    frame: {},
    'motor-pinion': { rot: motorRot },
    'compound-gear': { rot: compRot },
    'output-gear': { rot: outRot },
    potentiometer: { rot: outRot },
    horn: { rot: outRot },
    cap: {},
    'cap-idler': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const st = servoState(p, t);
  return [
    { label: 'Pulse', value: `${st.pulseUs}`, unit: 'µs' },
    { label: 'Target', value: st.cmdDeg.toFixed(1), unit: '°' },
    { label: 'Horn', value: st.actualDeg.toFixed(1), unit: '°' },
    { label: 'Error', value: st.errDeg.toFixed(1), unit: '°' },
    { label: 'Pot wiper', value: st.potVolts.toFixed(2), unit: 'V' },
    { label: 'Ratio', value: `${g.totalRatio.toFixed(1)}:1` },
  ];
}

export const steps = [
  {
    title: 'Neutral pulse (1500 µs): zero error, motor at rest',
    text: 'When the incoming 50 Hz signal stays high for 1500 µs and dynamic sweep is 0°, the potentiometer wiper reads 2.50 V. Error is 0.0° inside the deadband, so the DC motor stops and holds position.',
    t: 0,
    parts: ['horn', 'potentiometer'],
    set: { pulse: 1500, sweep: 0, kp: 8 },
  },
  {
    title: 'High-speed DC motor into compound reduction',
    text: 'Watch the left 10T motor pinion spin 7.8× faster than the output horn. The middle compound gear steps down speed in two co-planar stages while multiplying torque by 7.8×.',
    t: 65,
    parts: ['motor-pinion', 'compound-gear', 'output-gear'],
    set: { pulse: 1500, sweep: 90, kp: 7 },
  },
  {
    title: 'Potentiometer feedback closes the loop',
    text: 'The green wiper disc turns lock-step with the final output gear. Its voltage tells the comparator chip the shaft’s true angle so external disturbances are actively corrected.',
    t: 110,
    parts: ['potentiometer', 'horn'],
    set: { pulse: 1500, sweep: 90, kp: 7 },
  },
  {
    title: 'Commanding full CW (+90° at 2000 µs)',
    text: 'Setting pulse width to 2000 µs shifts the target setpoint to +90° (4.50 V on the potentiometer). The internal H-bridge drives the DC motor until the horn reaches +90° and stops.',
    t: 90,
    parts: ['horn', 'potentiometer', 'motor-pinion'],
    set: { pulse: 2000, sweep: 0, kp: 8 },
  },
  {
    title: 'Soft loop gain (low Kp): tracking lag under load',
    text: 'Lowering loop stiffness Kp to 2 increases the proportional error needed to drive the motor, producing a visible phase lag between Target angle and actual Horn angle.',
    t: 45,
    parts: ['horn', 'potentiometer'],
    set: { pulse: 1500, sweep: 120, kp: 2 },
  },
];
