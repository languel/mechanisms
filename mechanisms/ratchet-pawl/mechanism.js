/* Ratchet and pawl — motion that only goes one way.

   A lever swings back and forth; a pawl on its end drags a ratchet wheel
   forward by exactly one tooth per stroke, and a second pawl (the detent) holds
   the wheel while the lever returns. The asymmetry of the teeth is the whole
   trick: the steep face drives, the long slope lets the pawl climb back over.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { ratchetProfile, pawlProfile, arc, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'ratchet-pawl',
  title: 'Ratchet and pawl',
  tagline: 'A lever that swings both ways, driving a wheel that only turns one way.',
  category: 'Intermittent feed',
  question: 'How does a back-and-forth motion become a series of equal steps in one direction — and '
    + 'what stops the wheel running backwards between steps?',
  bigIdea: 'Each tooth is a one-way door: a steep face to push against and a long slope for the pawl '
    + 'to climb. One pawl drives, a second one holds, and the wheel advances one tooth per stroke.',
  notes: [
    {
      h: 'Why the teeth are lopsided',
      p: 'A ratchet tooth has a <b>drive face</b> nearly radial and a <b>back slope</b> that rises '
        + 'gently to the next tip. Pushed against the drive face, the pawl cannot slip: it either '
        + 'turns the wheel or breaks. Dragged the other way, the pawl rides up the slope, lifts over '
        + 'the tip and drops into the next gap. That asymmetrical tooth is the entire mechanism — no '
        + 'spring, no clutch, no control system.',
    },
    {
      h: 'Two pawls, not one',
      p: 'The driving pawl is on the lever and only pushes during the forward half of its swing. '
        + 'Between strokes the wheel would relax back under load, so a second, lighter pawl — the '
        + '<b>detent</b> — rests on the wheel behind it. While the drive pawl is returning, the detent '
        + 'is the one holding the load. Swap the roles with every stroke and the output never goes '
        + 'backwards.',
    },
    {
      h: 'The resolution is one tooth',
      p: 'The lever can be driven by anything: a solenoid, a cam, a hand. Whatever the input, the '
        + 'output moves in quantum steps of 360°/teeth. That is why ratchets appear wherever a '
        + 'mechanism has to count: a film advance, a socket wrench, a clock’s winding click, the '
        + 'paper feed of a printer, and the locking of a car’s handbrake.',
    },
    {
      h: 'The sound is the mechanism',
      p: 'A ratchet clicks because the pawl falls into a gap and hits the next drive face. The click '
        + 'is the sound of a discrete step being completed — a mechanism that reports its own state '
        + 'by ear, which is exactly why it survived into the age of sensors.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — ratchets and pawls (49, 75, 76, 79)', url: 'https://507movements.com/toc.html' },
    { label: 'Ratchet — Wikipedia', url: 'https://en.wikipedia.org/wiki/Ratchet_(device)' },
  ],
  attribution: 'Ratchet and pawl — from the mechanisms catalogue. The tooth count sets the step, and the page reports it.',
  screenshot: { t: 60, azimuth: -0.5, elevation: 0.95 },
  order: 50,
};

export const params = [
  { key: 'teeth', label: 'Teeth', min: 8, max: 20, step: 1, value: 12,
    help: 'One stroke advances the wheel by one tooth: 360°/teeth.' },
  { key: 'wheel', label: 'Wheel diameter', min: 48, max: 76, step: 2, value: 62, unit: 'mm' },
  { key: 'swing', label: 'Lever swing', min: 24, max: 64, step: 2, value: 36, unit: '°',
    help: 'The arc the drive lever sweeps. It only needs to be a little more than one tooth.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;
const HUB_T = KIT.hubT;
const BODY_T = KIT.bodyT;

function geom(p) {
  const rOuter = p.wheel / 2;
  const teeth = p.teeth;
  const rRoot = rOuter - Math.max(4, p.wheel * 0.075);
  const wheel = ratchetProfile({ teeth, rOuter, rRoot, driveFlank: 7 });
  const step = 360 / teeth;

  // Drive lever pivots on the wheel's own axle. Its pawl is a short finger
  // standing on the lever at pawlR, reaching out into the tooth band (the pawl
  // rides one layer above the wheel, so it passes over the rim).
  const pawlR = Math.max(8, rRoot - 14);
  const pawlLen = rRoot + 1.5 - pawlR;
  const leverLen = rOuter + 26;
  const pawl = pawlProfile({ length: pawlLen, width: 7, drop: 0 });

  // Detent: pivoted on the frame, its nose dropping into the teeth from outside.
  const detentAngle = 148 * DEG;
  const detentRadius = rRoot + 20;
  const detentPivot = { x: detentRadius * Math.cos(detentAngle), y: detentRadius * Math.sin(detentAngle) };
  const detentLen = detentRadius - rRoot - 0.6;
  const detent = pawlProfile({ length: detentLen, width: 8, drop: 0 });
  const detentReach = detentRadius - rRoot - detentLen;

  return {
    rOuter, rRoot, teeth, wheel, step, pawlR, leverLen, pawl, detentPivot, detent,
    detentReach,
    plate: { w: 2 * rOuter + 110, d: 2 * rOuter + 40 },
    topOfStack: PLATE_T + 10 + HUB_T + BODY_T + 12,
  };
}

export function build(p) {
  const g = geom(p);
  const { rOuter, rRoot, wheel, leverLen, pawlR, detentPivot, detent, pawl } = g;
  const wheelZ = PLATE_T;
  const pawlZ = PLATE_T + 10;

  const plateW = rOuter * 2 + 118;
  const plateD = rOuter * 2 + 44;
  const x0 = -rOuter - 40;

  const mounts = [[x0 + 12, -plateD / 2 + 12], [x0 + plateW - 12, -plateD / 2 + 12],
    [x0 + 12, plateD / 2 - 12], [x0 + plateW - 12, plateD / 2 - 12]]
    .map(([x, y]) => circle(x, y, 1.8, 20));

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#d9d0c1',
    note: 'plate, wheel axle post, lever post and detent post',
    solids: [
      slab({ outer: roundedRect({ x: x0, y: -plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }), holes: mounts, z: 0, h: PLATE_T }),
      postSolid({ x: 0, y: 0, z0: PLATE_T, h: g.topOfStack, r: POST_R }),
      postSolid({ x: detentPivot.x, y: detentPivot.y, z0: PLATE_T, h: 24, r: 3.0 }),
    ],
  });

  /* -- ratchet wheel ---------------------------------------------------- */
  const wheelPart = part({
    id: 'wheel',
    name: 'Ratchet wheel',
    color: '#b08b4a',
    layer: 0,
    note: `${p.teeth} teeth — each stroke is ${g.step.toFixed(1)}°`,
    at: { x: 0, y: 0, z: wheelZ },
    solids: [
      slab({ outer: circle(0, 0, 11, 44), holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40)], z: 0, h: HUB_T }),
      slab({ outer: wheel.outer, holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40)], z: HUB_T, h: BODY_T }),
    ],
  });

  /* -- drive lever, with its pawl ---------------------------------------- */
  const lever = part({
    id: 'lever',
    name: 'Drive lever',
    color: '#cf6a34',
    layer: 1,
    note: `swings ${p.swing}° and drags the wheel on the way out`,
    at: { x: 0, y: 0, z: wheelZ + 10 },
    solids: [
      slab({ outer: circle(0, 0, 11, 44), holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40)], z: 0, h: HUB_T }),
      slab({
        // the bar widens into a paddle at the end, so the lever reads as a handle
        outer: leverOutline(leverLen),
        holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40),
          circle(pawlR, 0, 1.6, 20),
          circle(leverLen - 9, -3.2, 1.5, 16),
          circle(leverLen - 9, 3.2, 1.5, 16)],
        z: HUB_T,
        h: BODY_T,
      }),
    ],
  });

  const drivePawl = part({
    id: 'drive-pawl',
    name: 'Drive pawl',
    color: '#6c7d8b',
    layer: 2,
    note: 'pivots on the lever; falls into each tooth gap',
    at: { x: 0, y: 0, z: wheelZ + 18 },
    zOrder: 3,
    solids: [slab({ outer: pawl.outer, holes: [circle(0, 0, 1.9, 24)], z: 0, h: 5 })],
  });

  const spring = part({
    id: 'spring',
    name: 'Pawl spring',
    color: '#9fb0a6',
    layer: 2,
    note: 'printed leaf that keeps the pawl in the teeth',
    at: { x: 0, y: 0, z: wheelZ + 15.8 },
    zOrder: 3,
    solids: [slab({ outer: roundedRect({ x: 2, y: 2, w: 34, h: 6, r: 3, n: 4 }), z: 0, h: 2.2 })],
  });

  /* -- detent ------------------------------------------------------------ */
  // the detent is drawn already pointing at the wheel, so its pose is a small
  // tilt only
  const toCentre = Math.atan2(-detentPivot.y, -detentPivot.x);
  const detentPart = part({
    id: 'detent',
    name: 'Detent pawl',
    color: '#6c7d8b',
    layer: 1,
    note: 'holds the wheel while the lever returns',
    at: { x: detentPivot.x, y: detentPivot.y, z: wheelZ + 2 },
    pivot: { x: 0, y: 0 },
    solids: [slab({
      outer: detent.outer.map(([x, y]) => [x * Math.cos(toCentre) - y * Math.sin(toCentre), x * Math.sin(toCentre) + y * Math.cos(toCentre)]),
      holes: [circle(0, 0, 1.9, 24)],
      z: 0,
      h: 5,
    })],
    baseRot: toCentre,
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 3,
    color: '#e7dfd0',
    layer: 3,
    note: 'axle, lever and detent',
    at: { x: 0, y: 0, z: g.topOfStack - 4 },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const capDetent = { ...cap, id: 'cap-detent', at: { x: detentPivot.x, y: detentPivot.y, z: 24 } };

  const checks = [
    { ok: p.swing >= g.step + 2, text: p.swing >= g.step + 2
      ? `Swing ${p.swing}° covers one ${g.step.toFixed(1)}° tooth with ${(p.swing - g.step).toFixed(1)}° to spare.`
      : `Swing ${p.swing}° is less than one ${g.step.toFixed(1)}° tooth — the wheel would never advance.` },
    { ok: g.detentReach > 0 && g.detentReach < 8, text: `Detent nose lands ${g.detentReach.toFixed(1)} mm short of the tooth root.` },
    { ok: rRoot > 14, text: `${(rRoot - 9).toFixed(1)} mm of web between the hub and the tooth root.` },
    { ok: plateW <= 220, text: `Plate ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm.` },
  ];

  return { parts: [frame, wheelPart, lever, drivePawl, spring, detentPart, cap, capDetent], checks, g };
}

/* ------------------------------------------------------------------ motion */

/** The lever swings once per 360° of t; the wheel steps by one tooth per swing. */
function cycle(p, t) {
  const g = geom(p);
  const u = ((t / 360) % 1 + 1) % 1;          // 0..1 over one stroke
  const drive = u < 0.5;                       // forward half
  const s = drive ? u / 0.5 : 1 - (u - 0.5) / 0.5;
  const ease = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, s)));
  const leverAngle = (-p.swing / 2 + ease * p.swing) * DEG;
  // the wheel advances only while the lever drives
  const advanced = drive ? ease : 1;
  const turns = Math.floor(t / 360);
  const wheelAngle = (turns + advanced * 0) * 0;
  void wheelAngle;
  void g;
  return { leverAngle, advanced, drive, step: g.step * DEG, turns };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const { leverAngle, advanced, drive, step, turns } = cycle(p, t);
  // wheel position: whole strokes already completed, plus this one's progress
  const wheelAngle = turns * step + (advanced * step) * (drive ? 1 : 1);
  const nose = g.rRoot;
  // the pawl rides over the teeth: its angle reflects the tooth face it is on
  const toothPhase = ((wheelAngle / step) % 1 + 1) % 1;
  const pawlTilt = (drive ? -1 : 1) * (0.16 + 0.12 * Math.sin(toothPhase * Math.PI)) * (drive ? 1 : 0.6);
  const pawlR = g.pawlR;
  const px = pawlR * Math.cos(leverAngle);
  const py = pawlR * Math.sin(leverAngle);
  void nose;

  return {
    frame: {},
    wheel: { rot: wheelAngle },
    lever: { rot: leverAngle },
    'drive-pawl': { rot: leverAngle + pawlTilt, dx: px, dy: py },
    spring: { rot: leverAngle, dx: px, dy: py },
    detent: { rot: (drive ? 1 : -1) * 0.05 * Math.sin(toothPhase * Math.PI) },
    cap: {},
    'cap-detent': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const { steps } = cycle(p, t);
  const strokes = Math.floor(t / 360) + ((t % 360) / 360 >= 0.5 ? 1 : 0);
  void steps;
  return [
    { label: 'Stroke', value: `${Math.floor(t / 360) + 1}` },
    { label: 'Wheel', value: (((strokes % p.teeth) * g.step) % 360).toFixed(1), unit: '°' },
    { label: 'Step', value: g.step.toFixed(1), unit: '°' },
    { label: 'Teeth', value: p.teeth },
    { label: 'Revolutions', value: (strokes / p.teeth).toFixed(2) },
    { label: 'Direction', value: 'one way' },
  ];
}

export const steps = [
  {
    title: 'The drive face pushes',
    text: 'The pawl meets the steep face of a tooth and cannot slide up it. The wheel has to move, or the pawl has to break.',
    t: 60,
    parts: ['drive-pawl', 'wheel'],
  },
  {
    title: 'The detent takes over',
    text: 'As the lever starts back, the drive pawl lifts over the tooth and the detent — resting one tooth behind — holds the wheel where it stopped.',
    t: 250,
    parts: ['detent', 'wheel'],
  },
  {
    title: 'One stroke, one tooth',
    text: 'A full swing of the lever advances the wheel by 360°/teeth. Twelve teeth give thirty degrees per stroke, and the strokes add up exactly.',
    t: 330,
    parts: ['lever', 'wheel'],
  },
  {
    title: 'More teeth, finer steps',
    text: 'Twenty teeth make each step 18°: finer resolution, but each tooth carries less load and the pawl has less room to fall into the gap.',
    t: 90,
    parts: ['wheel'],
    set: { teeth: 20 },
  },
  {
    title: 'A swing too short to work',
    text: 'Set the swing below one tooth and the pawl never clears the tip: the wheel rocks and returns, and nothing advances. The checks say so.',
    t: 90,
    parts: ['lever'],
    set: { teeth: 20, swing: 18 },
  },
];

/* ------------------------------------------------------------------ helpers */

/** A lever: a bar from the pivot that opens into a rounded paddle at the tip. */
function leverOutline(len) {
  const r0 = 6.5;                 // at the pivot
  const r1 = 9.5;                 // at the tip
  const L = len - r1;             // paddle centre
  const pts = [];
  // top edge, pivot circle to paddle
  pts.push([0, r0], [L, r1]);
  // paddle, over the top and round the end
  pts.push(...arc(L, 0, r1, Math.PI / 2, -Math.PI / 2, 16));
  // bottom edge back to the pivot
  pts.push([0, -r0]);
  // round the pivot
  pts.push(...arc(0, 0, r0, -Math.PI / 2, -3 * Math.PI / 2, 12));
  return pts;
}

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
