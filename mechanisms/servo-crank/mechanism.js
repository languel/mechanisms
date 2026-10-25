/* Servo crank — a hobby servo's 180° of travel turned into a useful stroke.

   A servo cannot spin; it holds an angle. So it can only ever drive half a
   crank circle, and that changes everything about the motion: the stroke, the
   speed profile and the fact that a servo crank spends most of its time near the
   ends of the stroke where the rod angle is worst.

   This kit is the bridge from physical computing to real mechanisms: the servo
   is the one bought part, everything it pushes is printed.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'servo-crank',
  title: 'Servo crank',
  tagline: 'A servo holds an angle, not a speed. Half a crank circle is all it can give you — '
    + 'and that decides the whole motion.',
  category: 'Physical computing',
  question: 'A servo sweeps 0–180°, but a crank needs a full turn. What does a servo-driven crank '
    + 'actually give you, and how do you choose the arm length?',
  bigIdea: 'A servo crank is half a crank: the slider goes from the middle of its stroke to the end '
    + 'and back, so pick the arm radius for the stroke and the rod for the smoothness you can afford.',
  notes: [
    {
      h: 'The servo is an angle holder',
      p: 'Inside, a small DC motor, a gear train and a position sensor: the controller compares the '
        + 'pulse width on the signal wire (about 1 ms for one end, 2 ms for the other) with the '
        + 'measured angle and drives the motor until they agree. That closed loop is why a servo '
        + 'holds its position against a load — and why it cannot be commanded to rotate.',
    },
    {
      h: 'Half a circle, and where it starts',
      p: 'A 180° servo covers half of a crank’s circle. Set the arm so that the servo’s mid position '
        + 'points along the rod, and the slider sits mid-stroke; sweep to either end and the slider '
        + 'travelled <i>r</i>. If you want the full 2<i>r</i> stroke from a servo, you need a crank '
        + 'whose pin passes across the line of the rod — a rocker, or a four-bar — and the page’s '
        + 'stroke readout makes that limit visible.',
    },
    {
      h: 'Dead band and backlash',
      p: 'A hobby servo ignores command changes smaller than its dead band (about 5 µs, roughly '
        + '0.5°), and the printed joints add their own clearance. Both show up as a slider that '
        + 'jitters slightly at the ends of the stroke but not in the middle. Metal-gear servos with '
        + 'tighter dead bands are worth it for anything that has to hold position.',
    },
    {
      h: 'Why the arm has three holes',
      p: 'The printed arm carries three pin holes at different radii, so one part covers three '
        + 'strokes. Move the rod to the outer hole for more travel, the inner hole for more force — '
        + 'the same trade as a gear ratio, made by moving one pin.',
    },
  ],
  references: [
    { label: 'Servo control: pulse width and angle', url: 'https://en.wikipedia.org/wiki/Servo_control' },
    { label: '507 Mechanical Movements — cranks and their substitutes', url: 'https://507movements.com/toc.html' },
  ],
  attribution: 'Servo crank — from the mechanisms catalogue. The servo is bought; the arm, rod and carriage are printed.',
  screenshot: { t: 300, azimuth: -0.55, elevation: 0.9 },
  order: 10,
};

export const params = [
  { key: 'arm', label: 'Arm radius', min: 12, max: 30, step: 2, value: 20, unit: 'mm',
    help: 'Pin distance from the servo spline. The stroke is twice this, but a servo can only give half of it.' },
  { key: 'rod', label: 'Rod length', min: 46, max: 96, step: 2, value: 68, unit: 'mm',
    help: 'Longer rods keep the rod angle small and the slider smooth.' },
  { key: 'sweep', label: 'Servo sweep', min: 90, max: 180, step: 10, value: 180, unit: '°',
    help: 'How much of its range the servo is commanded to use.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [
  { name: 'Micro servo', qty: 1, spec: 'SG90 / MG90S, 22.8 × 12.6 × 22.5 mm', note: 'the only bought part' },
  { name: 'Screw', qty: 2, spec: 'M2 × 8 mm', note: 'servo mounting lugs' },
  { name: 'Screw', qty: 1, spec: 'M2 × 6 mm', note: 'arm to the servo horn' },
  { name: 'Pin', qty: 2, spec: 'Ø2 mm steel, 10 mm', note: 'arm-to-rod and rod-to-carriage' },
];

const PLATE_T = KIT.plateT;
const ARM_Z = 24;             // the servo's output sits above the plate
const ROD_Z = ARM_Z + 10;
const PIN = 2.0;

function geom(p) {
  const r = p.arm;
  const L = p.rod;
  const turn = PIN + p.clearance;
  const press = PIN - 0.15;
  const carriageL = 30;
  const carriageW = 26;
  const railGap = carriageW / 2 + 0.35;

  // the servo body sits in a cradle at x = 0; its output shaft points up at the
  // plate's centre-left, and the arm turns there.
  const servo = { w: 23.2, d: 12.6, h: 22.5, lugSpan: 28, lugHole: 2.2 };
  const pivot = { x: 0, y: 0 };

  const sliderX = (deg) => r * Math.cos(deg * DEG) + Math.sqrt(L * L - (r * Math.sin(deg * DEG)) ** 2);
  const railFrom = Math.max(L - r - carriageL / 2 - 6, r + 18);
  const railTo = L + r + carriageL / 2 + 12;

  const x0 = -58;
  const x1 = railTo + 16;
  const plateD = 92;

  return {
    r, L, turn, press, carriageL, carriageW, railGap, servo, pivot, sliderX,
    railFrom, railTo, x0, x1, plateW: x1 - x0, plateD,
    top: ROD_Z + KIT.hubT + 5 + 12,
  };
}

export function build(p) {
  const g = geom(p);
  const { r, L, turn, press, carriageL, carriageW, railGap, servo, railFrom, railTo, x0, x1, plateW, plateD } = g;

  /* -- base frame: plate, servo cradle, rails ---------------------------- */
  const mounts = [[x0 + 12, -plateD / 2 + 12], [x1 - 12, -plateD / 2 + 12],
    [x0 + 12, plateD / 2 - 12], [x1 - 12, plateD / 2 - 12]].map(([x, y]) => circle(x, y, 1.8, 20));

  const cradle = {
    x: -servo.w / 2 - 2.6,
    y: -servo.d / 2 - 2.6,
    w: servo.w + 5.2,
    h: servo.d + 5.2,
  };

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#d9d0c1',
    note: 'servo cradle, two rails and a ruler in one print',
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: -plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }),
        holes: [...mounts,
          circle(-servo.lugSpan / 2, 0, servo.lugHole / 2, 20),
          circle(servo.lugSpan / 2, 0, servo.lugHole / 2, 20)],
        z: 0,
        h: PLATE_T,
      }),
      // the cradle: one U-shaped wall, open at the top where the servo drops in
      slab({ outer: cradleOutline(cradle), z: PLATE_T, h: 18 }),
      // rails for the carriage
      ...[-1, 1].map((s) => slab({
        outer: rect(railFrom, s === 1 ? railGap : -railGap - 5, railTo - railFrom, 5),
        z: PLATE_T,
        h: 6.4,
      })),
    ],
  });

  /* -- printed arm: bolts to the servo horn ----------------------------- */
  const armHoles = [0.55, 0.78, 1].map((f) => circle(r * f, 0, turn / 2, 24));
  const arm = part({
    id: 'arm',
    name: 'Servo arm',
    color: '#cf6a34',
    layer: 1,
    note: `three pin holes — 0.55r, 0.78r and r (${r} mm)`,
    at: { x: 0, y: 0, z: ARM_Z },
    solids: [
      slab({
        outer: armOutline(r),
        holes: [circle(0, 0, (2.6 + p.clearance) / 2, 24), ...armHoles],
        z: 0,
        h: 5,
      }),
      slab({ outer: circle(0, 0, 9, 36), holes: [circle(0, 0, (2.6 + p.clearance) / 2, 24)], z: 5, h: 3 }),
    ],
  });

  /* -- rod with a bore at each end -------------------------------------- */
  const rodPart = part({
    id: 'rod',
    name: 'Connecting rod',
    color: '#6c7d8b',
    layer: 2,
    note: `centre-to-centre ${L} mm`,
    at: { x: 0, y: 0, z: ROD_Z },
    solids: [slab({
      outer: capsule(0, 0, L, 0, 6, 18),
      holes: [circle(0, 0, turn / 2, 30), circle(L, 0, turn / 2, 30)],
      z: 0,
      h: 5,
    })],
  });

  /* -- carriage ---------------------------------------------------------- */
  const carriage = part({
    id: 'carriage',
    name: 'Carriage',
    color: '#b08b4a',
    layer: 1,
    note: 'trapped between the rails',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: roundedRect({ x: -carriageL / 2, y: -carriageW / 2, w: carriageL, h: carriageW, r: 3, n: 4 }),
        holes: [circle(0, 0, turn / 2, 30), circle(-9, 0, 2, 16), circle(9, 0, 2, 16)],
        z: 0,
        h: KIT.bodyT,
      }),
      slab({ outer: circle(0, 0, 4.6, 28), z: KIT.bodyT, h: ROD_Z - PLATE_T - KIT.bodyT }),
    ],
  });

  const caps = [
    part({
      id: 'cap-arm',
      printId: 'cap-pin',
      name: 'Pin cap',
      qty: 2,
      color: '#e7dfd0',
      layer: 3,
      note: 'press onto the two Ø2 pins',
      at: { x: r, y: 0, z: ROD_Z + 5 },
      solids: [capSolid({ postR: 2.6, t: 2.4, wall: 2.4 })],
    }),
    part({
      id: 'cap-carriage',
      printId: 'cap-pin',
      name: 'Pin cap',
      qty: 2,
      color: '#e7dfd0',
      layer: 3,
      at: { x: 0, y: 0, z: ROD_Z + 5 },
      solids: [capSolid({ postR: 2.6, t: 2.4, wall: 2.4 })],
    }),
  ];

  const pins = [
    { id: 'pin-arm', name: 'Pin (arm)', at: { x: r, y: 0, z: ARM_Z },
      solids: [slab({ outer: circle(0, 0, PIN / 2, 20), z: 0, h: 12 })] },
    { id: 'pin-carriage', name: 'Pin (carriage)', at: { x: 0, y: 0, z: PLATE_T + KIT.bodyT },
      solids: [slab({ outer: circle(0, 0, PIN / 2, 20), z: 0, h: 12 })] },
  ].map((pin) => ({
    ...pin,
    kind: 'hardware',
    material: 'steel Ø2',
    color: '#9aa3ab',
    note: 'the rod pivots on these',
  }));

  const servoProxy = {
    id: 'servo',
    name: 'Micro servo',
    kind: 'hardware',
    material: 'SG90 / MG90S',
    color: '#4c545c',
    note: 'the bought part: body, lugs and output spline',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({ outer: roundedRect({ x: -servo.w / 2, y: -servo.d / 2, w: servo.w, h: servo.d, r: 1.6, n: 3 }), z: 0, h: servo.h }),
      slab({ outer: roundedRect({ x: -servo.lugSpan / 2 - 2, y: -servo.d / 2 - 3.2, w: servo.lugSpan + 4, h: servo.d + 3.2, r: 2, n: 3 }), z: servo.h - 5, h: 2.6 }),
      slab({ outer: circle(0, 0, 3, 24), z: servo.h, h: ARM_Z - PLATE_T - servo.h }),
    ],
  };

  // The excursion over the swept range: from the arm at mid (carriage furthest)
  // to the arm at the end of the sweep (carriage closest).
  const stroke = Math.abs(g.sliderX(0) - g.sliderX(p.sweep / 2));
  const checks = [
    { ok: L / r >= 2, text: `Rod ratio L/r = ${(L / r).toFixed(2)} — below 2 the carriage slams into the ends.` },
    { ok: p.sweep <= 180, text: `Sweep ${p.sweep}° of the servo’s 180° range; the carriage travels ${stroke.toFixed(1)} mm.` },
    { ok: railFrom > r + 10, text: `Rails start ${railFrom.toFixed(0)} mm out, clear of the swinging arm.` },
    { ok: plateW <= 220, text: `Plate ${plateW.toFixed(0)} × ${plateD} mm.` },
  ];

  return { parts: [frame, servoProxy, ...pins, arm, rodPart, carriage, ...caps], checks, g };
}

/** A U-shaped wall around the servo, open at +y so the servo drops in. */
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

/** The arm: a slim neck from the spline, opening into a paddle at the tip. */
function armOutline(r) {
  const r0 = 7.5;                 // neck half-width at the spline
  const r1 = 9;                   // paddle half-width
  const L = Math.max(r0 + 2, r - 7);
  const pts = [[0, r0], [L, r1]];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI / 2 - (i / 14) * Math.PI;
    pts.push([L + r1 * Math.cos(a), r1 * Math.sin(a)]);
  }
  pts.push([0, -r0]);
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 - (i / 12) * Math.PI;
    pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
  }
  return pts;
}

/* ------------------------------------------------------------------ motion */

/** The servo sweeps -sweep/2 … +sweep/2 once per t turn, easing at each end. */
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
  const pulse = 1.5 + (deg / 180) * 1.0;                  // 1 ms at -90°, 2 ms at +90°
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
    title: 'Centre: the mid point of the stroke',
    text: 'At the servo’s mid position the arm points along the rod, so the carriage sits at the middle of its travel. This is where the mechanism is calmest.',
    t: 0,
    parts: ['arm', 'rod', 'carriage'],
  },
  {
    title: 'Sweeping out: the stroke is only r',
    text: 'Because the servo cannot pass 90°, the arm never crosses the line of the rod. The carriage travels r, not 2r — half the stroke a full crank would give.',
    t: 180,
    parts: ['arm', 'carriage'],
  },
  {
    title: 'The worst rod angle',
    text: 'At the end of the sweep the rod is at its steepest. That angle is the sideways load on the carriage, and it is why the rod should be long relative to the arm.',
    t: 250,
    parts: ['rod'],
  },
  {
    title: 'A short rod, a rough ride',
    text: 'Drop the rod length and the carriage lurches at the ends of the sweep. The readouts show the rod angle climbing as the rod gets shorter.',
    t: 250,
    parts: ['rod', 'carriage'],
    set: { rod: 46 },
  },
  {
    title: 'A smaller arm, a smaller stroke',
    text: 'The arm’s inner pin holes are for exactly this: halve the radius and halve the travel, while the servo pushes the same torque against half the lever.',
    t: 180,
    parts: ['arm'],
    set: { arm: 12, rod: 68 },
  },
];

/* ------------------------------------------------------------------ helpers */

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
