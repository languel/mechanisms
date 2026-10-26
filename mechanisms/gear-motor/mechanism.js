/* DC Gearmotor & Quadrature Encoder — how an N20 / TT gearhead turns 9,000 RPM
   into high-torque continuous rotation, and how a rear Hall encoder counts every turn.

   4-axis printable cutaway demonstrator + physical-computing explainer:
   - Axis 1 (x1): High-speed DC motor shaft with 6-slot quadrature encoder disc
     (Tier 1: z = 4..9.5 mm) and 10T input pinion (Tier 2: z = 9.5..15.5 mm).
   - Axis 2 (x2): First compound cluster gear — 24T upper gear driven by motor
     pinion (Tier 2) + 10T lower pinion (Tier 1).
   - Axis 3 (x3): Second compound cluster gear — 24T lower gear driven by Axis 2
     (Tier 1) + 10T upper pinion (Tier 2).
   - Axis 4 (x4): Final output spur gear (20T–30T on Tier 2) + high-torque D-shaft
     output hub & indicator arm (Tier 3: z = 15.5..21.0 mm).
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { gearProfile, arc, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'gear-motor',
  title: 'DC gearmotor & encoder',
  tagline: 'Three compound spur reduction stages multiply torque 15× while a rear quadrature '
    + 'encoder tracks speed and direction.',
  category: 'Motors & actuators',
  kind: 'motor',
  motorMount: {
    partId: 'motor-pinion',
    label: 'High-speed DC motor core + 10T input pinion (Axis 1)',
    direction: 'CW / CCW PWM',
  },
  question: 'How does a tiny N20 or yellow TT gearmotor lift heavy loads that would stall a bare '
    + 'DC motor — and how do two Hall sensors on the rear shaft measure exact RPM and direction?',
  bigIdea: 'A gearmotor cascades multiple compound pinion-and-gear pairs inside one frame so gear '
    + 'ratios multiply (G = R₁ × R₂ × R₃): speed drops by G while output torque multiplies by η·G. '
    + 'Mounting a quadrature encoder disc on the fast motor side multiplies tick resolution by G '
    + 'at the output shaft.',
  notes: [
    {
      h: '1. Why bare DC motors need a gearbox',
      p: 'A small brushed DC motor makes peak mechanical power at <b>6,000–12,000 RPM</b> with tiny '
        + 'torque (~0.04 kg·cm). Connecting a mechanism directly stalls the rotor and burns watts as '
        + 'heat (`P_heat = I²R`). Adding a 3-stage compound gearhead divides speed into the useful '
        + '<b>50–300 RPM</b> range while multiplying torque by <b>15× to 150×</b>.',
    },
    {
      h: '2. Compound gear stages: exponential ratio in a compact box',
      p: 'A single spur pair with a 15:1 ratio would require a giant 150-tooth wheel meshing with a '
        + '10-tooth pinion. Instead, an N20 or TT gearbox stacks three ~2.5:1 stages back-to-back on '
        + 'alternating Z-tiers (`2.4 × 2.4 × 2.6 = 15.0:1`), fitting inside a palm-sized frame.',
    },
    {
      h: '3. Quadrature encoders on the fast shaft',
      p: 'Two Hall-effect or optical sensors (`CHA` and `CHB`) spaced 90° apart in electrical phase '
        + 'watch a multi-pole disc on the <b>input motor shaft</b>. Because the disc spins `G` times '
        + 'faster than the output shaft, a simple 6-pulse disc (24 quadrature edges/rev) yields '
        + '<b>`24 × G ≈ 360` counts per output revolution</b> (~1° resolution)!',
    },
    {
      h: '4. Torque limit, efficiency & back-drivability',
      p: 'Each spur mesh has ~92% efficiency (`η_total ≈ 0.92³ ≈ 78%`). Higher reduction ratios '
        + 'increase output torque (`τ_out = η · G · τ_motor`) but also increase reflected rotor inertia '
        + 'by `G²`, making high-ratio gearmotors harder to back-drive by hand.',
    },
  ],
  wiring: {
    driver: 'TB6612FNG / DRV8833 H-Bridge + 2× Hall Quadrature Interrupts',
    supply: '6.0–12.0 V motor supply + 5.0 V logic rail for Hall encoder',
    connections: [
      { from: 'Arduino D5 (PWM) / D4', to: 'TB6612 PWMA / AIN1-AIN2', role: 'Motor speed (PWM) & direction' },
      { from: 'Arduino D2 (INT0)', to: 'Encoder Channel A (Yellow)', role: 'Quadrature pulse interrupt A' },
      { from: 'Arduino D3 (INT1)', to: 'Encoder Channel B (Green)', role: 'Quadrature phase B (direction)' },
      { from: 'Arduino 5V & GND', to: 'Encoder VCC (Blue) & GND (Black)', role: 'Hall sensor power (3.3–5 V)' },
    ],
  },
  code: `// DC Gearmotor with Quadrature Encoder: Closed-Loop Position / RPM Readout
const int PIN_ENC_A = 2;   // Hardware interrupt INT0
const int PIN_ENC_B = 3;   // Quadrature phase B
const int PIN_PWM   = 5;   // H-bridge PWM speed
const int PIN_DIR   = 4;   // H-bridge direction

volatile long encoderTicks = 0;
const float TICKS_PER_OUT_REV = 360.0; // 24 edges/motor_rev * 15:1 gearhead

void onEncoderA() {
  // If B lags A, shaft is spinning forward; if B leads A, reverse
  if (digitalRead(PIN_ENC_A) == digitalRead(PIN_ENC_B)) encoderTicks++;
  else encoderTicks--;
}

void setup() {
  pinMode(PIN_ENC_A, INPUT_PULLUP);
  pinMode(PIN_ENC_B, INPUT_PULLUP);
  pinMode(PIN_PWM, OUTPUT);
  pinMode(PIN_DIR, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_ENC_A), onEncoderA, CHANGE);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(PIN_DIR, HIGH);
  analogWrite(PIN_PWM, 180); // ~70% PWM duty
  float outputDeg = (encoderTicks / TICKS_PER_OUT_REV) * 360.0;
  Serial.println(outputDeg);
  delay(50);
}`,
  references: [
    { label: '507 Movements #199 — Compound Spur Gear Reduction', url: 'https://507movements.com/mm_199.html' },
    { label: 'Incremental quadrature encoder — Wikipedia', url: 'https://en.wikipedia.org/wiki/Incremental_encoder' },
  ],
  attribution: 'DC gearmotor & quadrature encoder cutaway — 3-stage compound spur gearhead with rear Hall encoder disc and high-torque output hub.',
  screenshot: { t: 40, azimuth: -0.56, elevation: 0.78 },
  order: 95,
};

export const params = [
  { key: 'stage3', label: 'Final output teeth', min: 20, max: 30, step: 2, value: 26,
    help: 'Teeth on the final output gear (Axis 4). Multiplies with Stage 1 (24:10) and Stage 2 (24:10).' },
  { key: 'pwm', label: 'PWM duty cycle', min: 15, max: 100, step: 5, value: 75, unit: '%',
    help: 'H-bridge PWM duty cycle applied to the DC motor core.' },
  { key: 'load', label: 'Output load torque', min: 0, max: 85, step: 5, value: 25, unit: '%',
    help: 'Mechanical load on the slow output shaft (increases motor current and slows RPM).' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Running clearance between the four gear-train bores and their Ø6.8 mm posts.' },
];

export const hardware = [
  { name: 'N20 DC gearmotor core', qty: 1, spec: '6V 300 RPM Ø12 mm', url: 'https://www.pololu.com/category/60/micro-metal-gearmotors', note: 'drives the 10T input pinion' },
  { name: 'H-bridge motor driver', qty: 1, spec: 'DRV8833 Dual H-Bridge 1.2A', url: 'https://www.ti.com/product/DRV8833', note: 'PWM directional speed control' },
  { name: 'Hall effect sensor IC', qty: 2, spec: 'A3144 / US1881 bipolar latch', url: 'https://www.allegromicro.com/en/products/sense/magnetic-digital-position-sensor-ics/bipolar-switches-latches/a3144', note: 'quadrature channels A and B' },
  { name: 'Neodymium disc magnets', qty: 6, spec: 'Ø3 mm × 2 mm N52', url: 'https://www.kjmagnetics.com/proddetail.asp?prod=D21B-N52', note: 'press into 6-pole encoder disc' },
  { name: 'Steel dowel pins', qty: 4, spec: 'Ø3 mm × 20 mm precision ground', url: 'https://www.mcmaster.com/dowel-pins/diameter~3mm/', note: 'hardened steel axles for 4 geartrain stages' },
];

const PLATE_T = KIT.plateT;   // 4.0 mm
const TIER1_H = 5.5;          // z = 4.0 .. 9.5 mm (Encoder disc, Compound-1 10T, Compound-2 24T)
const TIER2_H = 5.8;          // z = 9.5 .. 15.3 mm (Motor 10T pinion, Compound-1 24T, Compound-2 10T, Output gear)
const TIER3_H = 5.0;          // z = 15.3 .. 20.3 mm (Output torque arm & D-shaft indicator)

function geom(p) {
  const m = 1.65;
  const gPinion = gearProfile({ teeth: 10, module: m });
  const gStage = gearProfile({ teeth: 24, module: m });
  const gOut = gearProfile({ teeth: p.stage3, module: m });

  const c12 = gPinion.pitchRadius + gStage.pitchRadius; // 8.25 + 19.80 = 28.05 mm
  const c23 = gPinion.pitchRadius + gStage.pitchRadius; // 28.05 mm
  const c34 = gPinion.pitchRadius + gOut.pitchRadius;   // 8.25 + 0.825 * stage3

  // Fold the 4 axes in a slight compact dogleg so the gearbox stays short and fits easily on the bed
  const x1 = -44.0, y1 = -8.0;
  const x2 = x1 + c12, y2 = -8.0;
  const a23 = 0.36; // slight upward angle for compact N20/TT gearhead layout
  const x3 = x2 + c23 * Math.cos(a23);
  const y3 = y2 + c23 * Math.sin(a23);
  const x4 = x3 + c34, y4 = y3;

  const r1 = 24 / 10;
  const r2 = 24 / 10;
  const r3 = p.stage3 / 10;
  const totalRatio = r1 * r2 * r3;

  const minX = x1 - 24;
  const maxX = x4 + gOut.tipRadius + 16;
  const plateW = Math.ceil((maxX - minX) / 2) * 2;
  const plateX0 = minX;
  const plateD = 88;

  return {
    gPinion,
    gStage,
    gOut,
    x1, y1,
    x2, y2,
    x3, y3,
    x4, y4,
    r1, r2, r3,
    totalRatio,
    plateX0,
    plateW,
    plateD,
    topZ: PLATE_T + TIER1_H + TIER2_H + TIER3_H,
  };
}

export function build(p) {
  const g = geom(p);
  const boreR = POST_R + p.clearance / 2;

  const mounts = [
    [g.plateX0 + 10, -g.plateD / 2 + 10],
    [g.plateX0 + g.plateW - 10, -g.plateD / 2 + 10],
    [g.plateX0 + 10, g.plateD / 2 - 10],
    [g.plateX0 + g.plateW - 10, g.plateD / 2 - 10],
  ].map(([x, y]) => circle(x, y, 2.0, 20));

  const frame = part({
    id: 'frame',
    name: 'Gearhead frame plate',
    role: 'frame',
    color: '#efeae0',
    note: `4-axis compound gearhead plate (${g.totalRatio.toFixed(1)}:1 reduction)`,
    solids: [
      slab({
        outer: roundedRect({ x: g.plateX0, y: -g.plateD / 2, w: g.plateW, h: g.plateD, r: 8, n: 6 }),
        holes: mounts,
        z: 0,
        h: PLATE_T,
      }),
      postSolid({ x: g.x1, y: g.y1, z0: PLATE_T, h: TIER1_H + TIER2_H + 1.5, r: POST_R }),
      postSolid({ x: g.x2, y: g.y2, z0: PLATE_T, h: TIER1_H + TIER2_H + 1.5, r: POST_R }),
      postSolid({ x: g.x3, y: g.y3, z0: PLATE_T, h: TIER1_H + TIER2_H + 1.5, r: POST_R }),
      // Support boss under the final output gear on Tier 1 (z = PLATE_T .. PLATE_T + TIER1_H)
      slab({
        outer: circle(g.x4, g.y4, 9.5, 32),
        z: PLATE_T,
        h: TIER1_H,
      }),
      // Post 4 rises from top of the Tier 1 support boss
      postSolid({ x: g.x4, y: g.y4, z0: PLATE_T + TIER1_H, h: TIER2_H + TIER3_H + 1.5, r: POST_R }),
    ],
  });

  /* -- Axis 1: Quadrature Encoder Disc (Tier 1) + 10T Motor Pinion (Tier 2) - */
  const encSlots = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    encSlots.push(circle(11.2 * Math.cos(a), 11.2 * Math.sin(a), 2.1, 16));
  }
  const encoderDisc = part({
    id: 'encoder',
    name: '6-pole quadrature encoder disc',
    color: '#489e8b',
    layer: 1,
    note: `spins on the fast motor shaft — ${Math.round(24 * g.totalRatio)} quadrature counts per output rev`,
    at: { x: g.x1, y: g.y1, z: PLATE_T },
    solids: [
      slab({
        outer: circle(0, 0, 15.6, 48),
        holes: [circle(0, 0, boreR, 32), ...encSlots],
        z: 0,
        h: TIER1_H - 0.5,
      }),
    ],
  });

  const motorPinion = part({
    id: 'motor-pinion',
    name: '10T DC motor input pinion',
    color: '#dcb038',
    layer: 2,
    note: `input drive pinion spinning ${g.totalRatio.toFixed(1)}× faster than the output shaft`,
    at: { x: g.x1, y: g.y1, z: PLATE_T + TIER1_H },
    solids: [
      slab({
        outer: g.gPinion.outer,
        holes: [circle(0, 0, boreR, 32)],
        z: 0,
        h: TIER2_H,
      }),
    ],
  });

  /* -- Axis 2: First compound gear (24T upper Tier 2 + 10T lower Tier 1) ---- */
  const compound1 = part({
    id: 'compound-1',
    name: 'Stage 1/2 compound gear (24T / 10T)',
    color: '#5aa2d4',
    layer: 1,
    note: '24T upper gear driven by motor pinion; 10T lower pinion drives Stage 2',
    at: { x: g.x2, y: g.y2, z: PLATE_T },
    solids: [
      slab({
        outer: g.gPinion.outer,
        holes: [circle(0, 0, boreR, 32)],
        z: 0,
        h: TIER1_H,
      }),
      slab({
        outer: g.gStage.outer,
        holes: [
          circle(0, 0, boreR, 32),
          ...[0, 1, 2, 3].map((k) => circle(11.6 * Math.cos((k * Math.PI) / 2), 11.6 * Math.sin((k * Math.PI) / 2), 2.5, 16)),
        ],
        z: TIER1_H,
        h: TIER2_H,
      }),
    ],
  });

  /* -- Axis 3: Second compound gear (24T lower Tier 1 + 10T upper Tier 2) --- */
  const compound2 = part({
    id: 'compound-2',
    name: 'Stage 2/3 compound gear (24T / 10T)',
    color: '#82c0e4',
    layer: 1,
    note: '24T lower gear driven by Stage 1; 10T upper pinion drives the final output wheel',
    at: { x: g.x3, y: g.y3, z: PLATE_T },
    solids: [
      slab({
        outer: g.gStage.outer,
        holes: [
          circle(0, 0, boreR, 32),
          ...[0, 1, 2, 3].map((k) => circle(11.6 * Math.cos((k * Math.PI) / 2 + 0.4), 11.6 * Math.sin((k * Math.PI) / 2 + 0.4), 2.5, 16)),
        ],
        z: 0,
        h: TIER1_H,
      }),
      slab({
        outer: g.gPinion.outer,
        holes: [circle(0, 0, boreR, 32)],
        z: TIER1_H,
        h: TIER2_H,
      }),
    ],
  });

  /* -- Axis 4: Final output gear (Tier 2) + Hub collar (Tier 3) ------------- */
  const rLight = (boreR + g.gOut.rootRadius) * 0.5;
  const rHole = Math.max(1.6, Math.min(2.6, (g.gOut.rootRadius - boreR) * 0.22));
  const outputGear = part({
    id: 'output-gear',
    name: `${p.stage3}T final output gear & hub`,
    color: '#dcb038',
    layer: 2,
    note: `delivers ${(g.totalRatio * 0.78).toFixed(1)}× motor torque at 1/${g.totalRatio.toFixed(1)} speed`,
    at: { x: g.x4, y: g.y4, z: PLATE_T + TIER1_H },
    solids: [
      slab({
        outer: g.gOut.outer,
        holes: [
          circle(0, 0, boreR, 36),
          ...[0, 1, 2, 3].map((k) => circle(rLight * Math.cos((k * Math.PI) / 2), rLight * Math.sin((k * Math.PI) / 2), rHole, 18)),
        ],
        z: 0,
        h: TIER2_H,
      }),
      slab({
        outer: circle(0, 0, 8.6, 36),
        holes: [circle(0, 0, boreR, 32), circle(6.0, 0, 1.2, 16)],
        z: TIER2_H,
        h: TIER3_H,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 4,
    color: '#dfd8ca',
    layer: 3,
    note: 'retains the four gearhead shafts',
    at: { x: g.x4, y: g.y4, z: g.topZ },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const cap1 = { ...cap, id: 'cap-1', at: { x: g.x1, y: g.y1, z: PLATE_T + TIER1_H + TIER2_H } };
  const cap2 = { ...cap, id: 'cap-2', at: { x: g.x2, y: g.y2, z: PLATE_T + TIER1_H + TIER2_H } };
  const cap3 = { ...cap, id: 'cap-3', at: { x: g.x3, y: g.y3, z: PLATE_T + TIER1_H + TIER2_H } };

  const checks = [
    {
      ok: true,
      text: `3-stage compound ratio: (24/10) × (24/10) × (${p.stage3}/10) = ${g.totalRatio.toFixed(2)}:1 total reduction.`,
    },
    {
      ok: true,
      text: `Quadrature encoder resolution: 6 slots × 4 edges × ${g.totalRatio.toFixed(2)} = ${Math.round(24 * g.totalRatio)} counts/rev (${(360 / (24 * g.totalRatio)).toFixed(2)}°/count).`,
    },
    {
      ok: g.plateW <= 220,
      text: `Gearhead plate ${g.plateW} × ${g.plateD} mm fits a 220 mm print bed.`,
    },
  ];

  return {
    parts: [frame, encoderDisc, motorPinion, compound1, compound2, outputGear, cap, cap1, cap2, cap3],
    checks,
    g,
  };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const speedScale = Math.max(0.15, (p.pwm / 100) * (1 - (p.load / 100) * 0.65));
  // t is one cycle; let the fast motor shaft spin multiple turns per cycle so the reduction is dramatic
  const motorRot = t * DEG * 3.0 * speedScale;
  const rot1 = -motorRot / g.r1 + (Math.PI / 24);
  const rot2 = -rot1 / g.r2 + (Math.PI / 24);
  const outRot = -rot2 / g.r3;

  return {
    frame: {},
    encoder: { rot: motorRot },
    'motor-pinion': { rot: motorRot },
    'compound-1': { rot: rot1 },
    'compound-2': { rot: rot2 },
    'output-gear': { rot: outRot },
    cap: {},
    'cap-1': {},
    'cap-2': {},
    'cap-3': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const speedFactor = Math.max(0.08, (p.pwm / 100) * (1 - (p.load / 100) * 0.68));
  const motorRpm = Math.round(9000 * speedFactor);
  const outRpm = (motorRpm / g.totalRatio).toFixed(1);
  const torqueMult = (g.totalRatio * 0.78).toFixed(1);
  const cpr = Math.round(24 * g.totalRatio);
  const outDeg = ((t * 3.0 * speedFactor) / g.totalRatio) % 360;

  return [
    { label: 'Ratio G', value: `${g.totalRatio.toFixed(1)}:1` },
    { label: 'Motor', value: `${motorRpm}`, unit: 'rpm' },
    { label: 'Output', value: outRpm, unit: 'rpm' },
    { label: 'Torque ×', value: `${torqueMult}×` },
    { label: 'Encoder', value: `${cpr}`, unit: 'cpr' },
    { label: 'Out θ', value: `${Math.round(outDeg)}`, unit: '°' },
  ];
}

export const steps = [
  {
    title: 'Stage 1: High-speed DC motor & 6-pole encoder disc',
    text: 'The yellow 10T motor pinion and green 6-pole encoder disc spin together at up to 9,000 RPM on Axis 1. Placing the encoder on the fast shaft multiplies its angular resolution by the full gear ratio.',
    t: 40,
    parts: ['motor-pinion', 'encoder'],
    set: { stage3: 26, pwm: 75, load: 20 },
  },
  {
    title: 'Stage 1 → Stage 2: First 2.4:1 compound reduction',
    text: 'The 10T motor pinion drives the 24T upper wheel on Axis 2 (slowing speed by 2.4×). Locked underneath that wheel is a second 10T pinion spinning at the same reduced speed.',
    t: 110,
    parts: ['compound-1', 'motor-pinion'],
    set: { stage3: 26, pwm: 75, load: 20 },
  },
  {
    title: 'Stage 2 → Stage 3: Cascaded multiplication (2.4 × 2.4 = 5.76:1)',
    text: 'Axis 2’s lower 10T pinion drives the 24T lower gear on Axis 3, compounding the reduction to 5.76:1 while stepping back up to Tier 2 via its upper 10T pinion.',
    t: 185,
    parts: ['compound-2', 'compound-1'],
    set: { stage3: 26, pwm: 75, load: 20 },
  },
  {
    title: 'Final Output Hub: 15:1 speed division & 11.7× torque multiplication',
    text: 'The final 26T output gear and torque arm spin 15× slower than the motor core, multiplying shaft torque by η·G ≈ 11.7× (assuming 92% mesh efficiency per stage) and delivering 360 quadrature encoder counts per output turn.',
    t: 260,
    parts: ['output-gear'],
    set: { stage3: 26, pwm: 85, load: 45 },
  },
];
