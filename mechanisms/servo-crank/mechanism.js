/* Servo crank — converting a hobby servo's bounded 0–180° sweep into guided linear travel.

   Fixes from previous version:
   - Eliminated double-offset pin/cap bug (`at: { x: 0, y: 0 }` so `dx = pinX` places
     the crank pin and cap directly inside the arm's outer bore!).
   - Clean, non-colliding elevation stack from SG90 servo cradle to 3-hole servo horn,
     connecting rod, and guided linear carriage.
*/

import { KIT, slab, part, circle, rect, roundedRect, capSolid } from '../../src/lib/kit.js';
import { DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'servo-crank',
  title: 'Servo crank',
  movement: '507 Movements #93',
  motorMount: { partId: 'arm', label: 'SG90 / MG90S Servo Spline', direction: 'OSC' },
  tagline: 'A servo holds a commanded angle, not a continuous speed — turning its 180° arc into '
    + 'linear position control.',
  category: 'Physical computing',
  question: 'A standard hobby servo sweeps 0–180° instead of spinning continuously. How do you size the horn '
    + 'arm and connecting rod to get smooth, predictable linear stroke?',
  bigIdea: 'Mount the linkage so the servo’s 90° midpoint stands perpendicular to the slider axis (or sweeps '
    + 'symmetrically across it): the three mounting holes on the printed horn trade stroke length against push force.',
  notes: [
    {
      h: 'Closed-loop angle control',
      p: 'Inside an SG90 / MG90S hobby servo sit a DC motor, a multi-stage reduction gear train, a '
        + 'potentiometer coupled to the output spline, and a comparator chip. A 50 Hz pulse between '
        + '<b>1000 µs</b> and <b>2000 µs</b> commands an exact target angle; the internal loop drives '
        + 'the motor until the potentiometer voltage matches.',
    },
    {
      h: 'Three holes, three force-vs-stroke ratios',
      p: 'The printed servo arm provides three pin bores at `0.55 r`, `0.78 r`, and `1.00 r`. '
        + 'Moving the connecting rod to an inner hole reduces linear travel while multiplying the '
        + 'available linear thrust (`F ≈ τ / r`) — a quick mechanical gear change without reprinting.',
    },
    {
      h: 'Connecting-rod obliquity',
      p: 'Just like a full crank-slider, a short rod (`L / r < 2.5`) tilts steeply at the middle of '
        + 'the sweep and shoves the carriage sideways into its guide rails. Keeping `L / r ≥ 3` keeps '
        + 'transmission efficiency high.',
    },
    {
      h: 'Drop-in SG90 / MG90S cradle',
      p: 'The baseplate includes a snug pocket and M2 mounting pillars sized for a standard 9 g micro '
        + 'servo (`22.8 × 12.6 mm` body), so students can bolt a real servo directly into their print.',
    },
  ],
  references: [
    { label: 'Servo control: PWM pulse width to angle', url: 'https://en.wikipedia.org/wiki/Servo_control' },
    { label: '507 Mechanical Movements — Cranks and Linkages', url: 'https://507movements.com/toc.html' },
  ],
  wiring: {
    driver: 'SG90 / MG90S 9g Micro Servo (Arduino Servo.h)',
    supply: '5 V regulated rail (500 mA peak per micro servo)',
    connections: [
      { from: 'Arduino D9', to: 'SG90 Orange (Signal)', role: '50 Hz PWM position signal' },
      { from: '5 V Supply +', to: 'SG90 Red (VCC)', role: '4.8–6.0 V servo power' },
      { from: 'Arduino GND', to: 'SG90 Brown (GND)', role: 'Common reference ground' },
    ],
  },
  code: `// Servo Crank: Linear Carriage Position Control via SG90 Servo
#include <Servo.h>

Servo crankServo;
const int PIN_SERVO = 9;

void setup() {
  crankServo.attach(PIN_SERVO);
}

void loop() {
  // Smoothly sweep the servo arm from 0 to 180 deg and back
  for (int deg = 0; deg <= 180; deg += 2) {
    crankServo.write(deg);
    delay(15);
  }
  for (int deg = 180; deg >= 0; deg -= 2) {
    crankServo.write(deg);
    delay(15);
  }
}`,
  attribution: 'Servo crank — drop-in SG90/MG90S cradle with 3-hole servo horn, connecting rod, and linear carriage.',
  screenshot: { t: 300, azimuth: -0.55, elevation: 0.78 },
  order: 70,
};

export const params = [
  { key: 'arm', label: 'Arm radius', min: 12, max: 30, step: 2, value: 20, unit: 'mm',
    help: 'Outer pin distance from the servo spline.' },
  { key: 'rod', label: 'Rod length', min: 46, max: 96, step: 2, value: 68, unit: 'mm',
    help: 'Centre-to-centre connecting rod length.' },
  { key: 'sweep', label: 'Servo sweep', min: 90, max: 180, step: 10, value: 180, unit: '°',
    help: 'Commanded angular sweep of the servo around its midpoint.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Running clearance on the pin joints and carriage rails.' },
];

export const hardware = [
  { name: 'Micro servo', qty: 1, spec: 'SG90 / MG90S (22.8 × 12.6 × 22.5 mm)', url: 'https://www.towerpro.com.tw/product/sg90-7/', note: 'drops into the printed cradle' },
  { name: 'Screw', qty: 2, spec: 'M2 × 8 mm', url: 'https://www.mcmaster.com/screws/thread-size~m2/', note: 'secures servo mounting lugs' },
  { name: 'Screw', qty: 1, spec: 'M2 × 6 mm', url: 'https://www.mcmaster.com/screws/thread-size~m2/', note: 'locks printed arm onto the servo spline' },
  { name: 'Pin', qty: 2, spec: 'Ø2 mm × 12 mm steel dowel', url: 'https://www.mcmaster.com/dowel-pins/diameter~2mm/', note: 'arm-to-rod and rod-to-carriage joints' },
];

const PLATE_T = KIT.plateT;   // 4.0 mm
const ARM_Z = 24.0;           // Servo horn plane above the SG90 body
const ROD_Z = ARM_Z + 5.0;    // Connecting rod plane (z = 29.0..34.0 mm)
const PIN = 2.0;

function geom(p) {
  const r = p.arm;
  const L = p.rod;
  const turn = PIN + p.clearance;
  const carriageL = 30;
  const carriageW = 26;
  const railGap = carriageW / 2 + p.clearance;

  const servo = { w: 23.2, d: 12.6, h: 20.0, lugSpan: 28, lugHole: 2.2 };
  const pivot = { x: 0, y: 0 };

  const sliderX = (deg) => r * Math.cos(deg * DEG) + Math.sqrt(L * L - (r * Math.sin(deg * DEG)) ** 2);
  const railFrom = Math.max(L - r - carriageL / 2 - 4, r + 15);
  const railTo = L + r + carriageL / 2 + 8;

  const x0 = -32;
  const x1 = railTo + 12;
  const plateD = 82;

  return {
    r,
    L,
    turn,
    carriageL,
    carriageW,
    railGap,
    servo,
    pivot,
    sliderX,
    railFrom,
    railTo,
    x0,
    x1,
    plateW: x1 - x0,
    plateD,
    top: ROD_Z + 8,
  };
}

export function build(p) {
  const g = geom(p);
  const { r, L, turn, carriageL, carriageW, railGap, servo, railFrom, railTo, x0, x1, plateW, plateD } = g;

  const mounts = [
    [x0 + 10, -plateD / 2 + 10],
    [x1 - 10, -plateD / 2 + 10],
    [x0 + 10, plateD / 2 - 10],
    [x1 - 10, plateD / 2 - 10],
  ].map(([x, y]) => circle(x, y, 2.0, 20));

  const cradle = {
    x: -servo.w / 2 - 2.8,
    y: -servo.d / 2 - 2.8,
    w: servo.w + 5.6,
    h: servo.d + 5.6,
  };

  // Ruler ticks along the upper guide rail
  const tickSlabs = [];
  for (let x = Math.ceil(railFrom / 5) * 5; x <= railTo - 4; x += 5) {
    const major = x % 10 === 0;
    tickSlabs.push(
      slab({
        outer: rect(x - 0.45, railGap + 1.2, 0.9, major ? 3.2 : 1.8),
        z: PLATE_T + 6.4,
        h: 0.8,
      })
    );
  }

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#ece6da',
    note: 'SG90/MG90S servo cradle, dual linear guide rails, and 5 mm stroke scale',
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: -plateD / 2, w: plateW, h: plateD, r: 8, n: 6 }),
        holes: [
          ...mounts,
          circle(-servo.lugSpan / 2, 0, servo.lugHole / 2, 20),
          circle(servo.lugSpan / 2, 0, servo.lugHole / 2, 20),
        ],
        z: 0,
        h: PLATE_T,
      }),
      slab({ outer: cradleOutline(cradle), z: PLATE_T, h: 15.5 }),
      ...[-1, 1].map((s) =>
        slab({
          outer: rect(railFrom, s === 1 ? railGap : -railGap - 5.2, railTo - railFrom, 5.2),
          z: PLATE_T,
          h: 6.4,
        })
      ),
      ...tickSlabs,
    ],
  });

  /* -- Printed 3-hole servo horn arm (z = 24..29 mm) ---------------------- */
  const armHoles = [0.55, 0.78, 1].map((f) => circle(r * f, 0, turn / 2, 24));
  const arm = part({
    id: 'arm',
    name: 'Servo arm',
    color: '#dcb038',
    layer: 1,
    note: `three stroke-selection bores at 0.55r, 0.78r, and 1.00r (${r} mm)`,
    at: { x: 0, y: 0, z: ARM_Z },
    solids: [
      slab({
        outer: circle(0, 0, 8.2, 36),
        holes: [circle(0, 0, (2.6 + p.clearance) / 2, 24)],
        z: -2.0,
        h: 2.0,
      }),
      slab({
        outer: armOutline(r),
        holes: [circle(0, 0, (2.6 + p.clearance) / 2, 24), ...armHoles],
        z: 0,
        h: 5.0,
      }),
    ],
  });

  /* -- Connecting rod (z = 29..34 mm) ------------------------------------- */
  const rodPart = part({
    id: 'rod',
    name: 'Connecting rod',
    color: '#82c0e4',
    layer: 2,
    note: `centre-to-centre length L = ${L} mm`,
    at: { x: 0, y: 0, z: ROD_Z },
    solids: [
      slab({
        outer: capsule(0, 0, L, 0, 5.8, 18),
        holes: [circle(0, 0, turn / 2, 30), circle(L, 0, turn / 2, 30)],
        z: 0,
        h: 5.0,
      }),
    ],
  });

  /* -- Guided linear carriage --------------------------------------------- */
  const carriage = part({
    id: 'carriage',
    name: 'Carriage',
    color: '#5aa2d4',
    layer: 1,
    note: 'linear slider block with raised wrist-pin boss reaching the rod plane',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: roundedRect({ x: -carriageL / 2, y: -carriageW / 2, w: carriageL, h: carriageW, r: 3.5, n: 4 }),
        holes: [circle(0, 0, turn / 2, 30), circle(-9.5, 0, 2.4, 20), circle(9.5, 0, 2.4, 20)],
        z: 0,
        h: KIT.bodyT,
      }),
      slab({
        outer: circle(0, 0, 5.4, 28),
        holes: [circle(0, 0, turn / 2, 24)],
        z: KIT.bodyT,
        h: ROD_Z - PLATE_T - KIT.bodyT,
      }),
    ],
  });

  // Note: at.x = 0, at.y = 0 because pose() supplies dx: pinX, dy: pinY!
  const caps = [
    part({
      id: 'cap-arm',
      printId: 'cap-pin',
      name: 'Pin cap',
      qty: 2,
      color: '#e7dfd0',
      layer: 3,
      note: 'retains the Ø2 mm joint pins',
      at: { x: 0, y: 0, z: ROD_Z + 5.0 },
      solids: [capSolid({ postR: 2.2, t: 2.4, wall: 2.2 })],
    }),
    part({
      id: 'cap-carriage',
      printId: 'cap-pin',
      name: 'Pin cap',
      qty: 2,
      color: '#e7dfd0',
      layer: 3,
      at: { x: 0, y: 0, z: ROD_Z + 5.0 },
      solids: [capSolid({ postR: 2.2, t: 2.4, wall: 2.2 })],
    }),
  ];

  const pins = [
    {
      id: 'pin-arm',
      name: 'Pin (arm)',
      at: { x: 0, y: 0, z: ARM_Z },
      solids: [slab({ outer: circle(0, 0, PIN / 2, 20), z: 0, h: 10.5 })],
    },
    {
      id: 'pin-carriage',
      name: 'Pin (carriage)',
      at: { x: 0, y: 0, z: ROD_Z - 4.0 },
      solids: [slab({ outer: circle(0, 0, PIN / 2, 20), z: 0, h: 9.5 })],
    },
  ].map((pin) => ({
    ...pin,
    kind: 'hardware',
    material: 'steel Ø2',
    color: '#9aa3ab',
    note: 'Ø2 mm dowel pin joint',
  }));

  const servoProxy = {
    id: 'servo',
    name: 'Micro servo',
    kind: 'hardware',
    material: 'SG90 / MG90S',
    color: '#4c545c',
    note: 'standard 9 g hobby servo body, mounting ears, and output spline',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: roundedRect({ x: -servo.w / 2, y: -servo.d / 2, w: servo.w, h: servo.d, r: 1.6, n: 3 }),
        z: 0,
        h: 15.5,
      }),
      slab({
        outer: roundedRect({
          x: -servo.lugSpan / 2 - 2,
          y: -servo.d / 2,
          w: servo.lugSpan + 4,
          h: servo.d,
          r: 1.6,
          n: 3,
        }),
        z: 15.5,
        h: 2.5,
      }),
      slab({
        outer: roundedRect({ x: -servo.w / 2, y: -servo.d / 2, w: servo.w, h: servo.d, r: 1.6, n: 3 }),
        z: 18.0,
        h: 2.0,
      }),
      slab({ outer: circle(0, 0, 5.5, 28), z: 20.0, h: 2.0 }),
    ],
  };

  const stroke = Math.abs(g.sliderX(0) - g.sliderX(p.sweep / 2));
  const checks = [
    {
      ok: L / r >= 2.2,
      text: `Rod-to-arm ratio L/r = ${(L / r).toFixed(2)} — keeps side-load on the carriage low.`,
    },
    {
      ok: p.sweep <= 180,
      text: `Commanded sweep ${p.sweep}° gives ${stroke.toFixed(1)} mm of linear carriage travel.`,
    },
    {
      ok: railFrom > r + 10,
      text: `Guide rails start at x = ${railFrom.toFixed(0)} mm, safely clear of the ${r} mm arm.`,
    },
    {
      ok: plateW <= 220,
      text: `Baseplate ${plateW.toFixed(0)} × ${plateD} mm fits a 220 mm print bed.`,
    },
  ];

  return { parts: [frame, servoProxy, ...pins, arm, rodPart, carriage, ...caps], checks, g };
}

function cradleOutline(c) {
  const t = 3.2;
  return [
    [c.x, c.y],
    [c.x + c.w, c.y],
    [c.x + c.w, c.y + c.h],
    [c.x + c.w - t, c.y + c.h],
    [c.x + c.w - t, c.y + t],
    [c.x + t, c.y + t],
    [c.x + t, c.y + c.h],
    [c.x, c.y + c.h],
  ];
}

function armOutline(r) {
  const r0 = 7.5;
  const r1 = 6.2;
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI / 2 - (i / 14) * Math.PI;
    pts.push([r + r1 * Math.cos(a), r1 * Math.sin(a)]);
  }
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI / 2 - (i / 14) * Math.PI;
    pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
  }
  return pts;
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  const u = ((t / 360) % 1 + 1) % 1;
  const s = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);        // 0..1..0
  const angle = (-p.sweep / 2 + s * p.sweep) * DEG;
  const pinX = g.r * Math.cos(angle);
  const pinY = g.r * Math.sin(angle);
  const sx = g.sliderX(angle / DEG);
  const phi = Math.atan2(-pinY, sx - pinX);
  return {
    frame: {},
    servo: {},
    arm: { rot: angle },
    rod: { rot: phi, dx: pinX, dy: pinY },
    carriage: { dx: sx },
    'cap-arm': { dx: pinX, dy: pinY },
    'cap-carriage': { dx: sx },
    'pin-arm': { dx: pinX, dy: pinY },
    'pin-carriage': { dx: sx },
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const u = ((t / 360) % 1 + 1) % 1;
  const s = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);
  const deg = -p.sweep / 2 + s * p.sweep;
  const sx = g.sliderX(deg);
  const pulse = 1.5 + (deg / 180) * 1.0;                  // 1.0 ms at -90°, 2.0 ms at +90°
  return [
    { label: 'Servo', value: deg.toFixed(0), unit: '°' },
    { label: 'Pulse', value: pulse.toFixed(2), unit: 'ms' },
    { label: 'Carriage', value: sx.toFixed(1), unit: 'mm' },
    { label: 'Travel', value: Math.abs(sx - g.sliderX(p.sweep / 2)).toFixed(1), unit: 'mm' },
    { label: 'Rod angle', value: (Math.atan2(-g.r * Math.sin(deg * DEG), sx - g.r * Math.cos(deg * DEG)) / DEG).toFixed(1), unit: '°' },
    { label: 'L/r', value: (g.L / g.r).toFixed(2) },
  ];
}

export const steps = [
  {
    title: 'Mid-sweep (1500 µs): arm aligned with the slider',
    text: 'At 0° (1.50 ms pulse width), the servo horn points straight along the slider track, placing the carriage at its maximum extension.',
    t: 90,
    parts: ['arm', 'rod', 'carriage'],
  },
  {
    title: 'End of sweep: bounded 180° arc',
    text: 'At ±90° (1.0 ms or 2.0 ms pulse), the horn stands perpendicular to the track and pulls the carriage back by approximately one arm radius r.',
    t: 0,
    parts: ['arm', 'carriage'],
  },
  {
    title: 'Maximum connecting-rod obliquity',
    text: 'At the ends of the sweep, the connecting rod reaches its steepest angle arcsin(r / L), creating lateral thrust against the guide rails.',
    t: 180,
    parts: ['rod'],
  },
  {
    title: 'Short rod penalty',
    text: 'Shortening the rod to 46 mm sharply increases the rod angle and lateral rail friction.',
    t: 180,
    parts: ['rod', 'carriage'],
    set: { rod: 46 },
  },
  {
    title: 'Inner horn hole: less travel, higher force',
    text: 'Using a smaller effective arm radius (12 mm) reduces travel while multiplying the linear push force available from the same servo torque.',
    t: 0,
    parts: ['arm'],
    set: { arm: 12, rod: 68 },
  },
];

function capsule(x1, y1, x2, y2, r, n = 16) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = a - Math.PI / 2 + (i / n) * Math.PI;
    out.push([x2 + r * Math.cos(t), y2 + r * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = a + Math.PI / 2 + (i / n) * Math.PI;
    out.push([x1 + r * Math.cos(t), y1 + r * Math.sin(t)]);
  }
  return out;
}
