/* Cam and roller follower — the mechanism that turns a steady rotation into a
   prescribed up-and-down motion, and the one mechanism where the shape of a part
   *is* the timing diagram.

   The cam outline is generated from the follower law you choose, with the roller
   radius subtracted along the normal, so the roller centre rides exactly on the
   law. Change the law and the cam's shape changes; change the roller and the cam
   can undercut itself. Both are visible and measurable on the page.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid, boreOn } from '../../src/lib/kit.js';
import { camProfile, camLift, laws, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'cam-follower',
  title: 'Cam and roller follower',
  tagline: 'A cam is a motion law you can hold: its shape is the timing diagram, '
    + 'wrapped around a shaft.',
  category: 'Rotary → timed lift',
  question: 'How can one steady rotation make a follower rise smoothly, dwell at the top, and '
    + 'come back down without a jolt — and what limits how fast it can do it?',
  bigIdea: 'You do not design a cam’s outline; you design its timing. The outline is just that '
    + 'timing wound round a shaft, pulled in by the roller radius.',
  notes: [
    {
      h: 'Three parts, one law',
      p: 'The <b>cam</b> turns at a constant speed. The <b>roller</b> rides its edge, and the '
        + '<b>follower</b> is trapped in a guide so it can only go up and down. Whatever radius the '
        + 'cam presents at the roller’s angle becomes the follower’s height. The cam’s outline is '
        + 'therefore the follower’s height plotted against angle, drawn in polar coordinates.',
    },
    {
      h: 'The law is the design',
      p: 'Between the base circle and the top of the lift the follower must cover the distance with '
        + 'no jump in position and no jump in velocity, or the machine will knock. Three laws are '
        + 'offered here. <b>Cycloidal</b> has zero velocity and zero acceleration at both ends: the '
        + 'smoothest, and the choice for fast machinery. <b>Harmonic (simple sine)</b> is gentle but '
        + 'starts and ends with a finite acceleration, which is a small knock. <b>Parabolic</b> '
        + '(constant acceleration) is the lightest cam and the harshest: its acceleration flips '
        + 'instantly at mid-lift. Toggle the law and watch the outline at the flanks change shape.',
    },
    {
      h: 'Why the roller size matters',
      p: 'The outline is the pitch curve pulled inward by the roller radius. Where the cam is '
        + 'concave, pulling inward by too much folds the outline over itself — an <i>undercut</i>. '
        + 'A cam with a short rise and a big roller is the classic way to cause it, and the page '
        + 'reports the tightest concave radius as you drag the sliders. Too small a roller, on the '
        + 'other hand, concentrates the contact stress on one line.',
    },
    {
      h: 'What returns the follower',
      p: 'This kit keeps the follower on the cam with a printed leaf spring behind it: a thin '
        + 'cantilever that presses the roller down against the cam at all times. Real machines use '
        + 'the same idea with a coil spring, gravity, or a grooved cam that pulls the follower both '
        + 'ways. Remove the spring and you have the desmodromic version.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — cams (95, 96, 97, 117)', url: 'https://507movements.com/toc.html' },
    { label: 'Cam design: follower motion laws — Wikipedia', url: 'https://en.wikipedia.org/wiki/Cam' },
  ],
  attribution: 'Cam and roller follower — from the mechanisms catalogue. The cam’s outline is generated from the follower law shown on the page.',
  screenshot: { t: 96 },
  order: 20,
};

export const params = [
  { key: 'lift', label: 'Lift', min: 4, max: 14, step: 0.5, value: 8, unit: 'mm',
    help: 'How far the follower rises from the base circle.' },
  { key: 'rise', label: 'Rise angle', min: 60, max: 200, step: 10, value: 120, unit: '°',
    help: 'Shaft degrees spent climbing. A short rise is a steep flank.' },
  { key: 'top', label: 'Top dwell', min: 0, max: 140, step: 10, value: 60, unit: '°',
    help: 'How long the follower stays at the top.' },
  { key: 'roller', label: 'Shoe diameter', min: 6, max: 16, step: 0.5, value: 10, unit: 'mm',
    help: 'The contact radius of the follower shoe. Bigger pads last longer but undercut a tight cam.' },
  { key: 'law', label: 'Motion law', kind: 'choice', value: 'cycloidal',
    options: [
      { value: 'cycloidal', label: 'Cycloidal — smoothest' },
      { value: 'harmonic', label: 'Harmonic — simple sine' },
      { value: 'parabolic', label: 'Parabolic — constant acceleration' },
    ],
    help: 'The curve the follower follows while it climbs.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

/* ---------------------------------------------------------------- geometry */

const BASE_R = 18;
const CAM_T = KIT.bodyT;

function geom(p) {
  // The fall fills whatever is left of the turn after the rise, the top dwell
  // and a bottom dwell long enough to see.
  const bottomDwell = 60;
  const fall = Math.max(40, 360 - p.rise - p.top - bottomDwell);
  const bottom = 360 - p.rise - p.top - fall;
  const lawParams = {
    lift: p.lift, rise: p.rise, top: p.top, fall, bottom, law: p.law,
  };
  const cam = camProfile({
    baseRadius: BASE_R,
    rollerRadius: p.roller / 2,
    ...lawParams,
    samples: 2,
  });

  const bore = boreOn(p.clearance);
  // The follower's shoe is a circular pad whose centre rides the pitch curve,
  // so the cam is offset by the shoe radius exactly as it would be by a roller.
  const shoeR = p.roller / 2;

  return {
    cam, lawParams, fall, bottom, bore, shoeR,
    pitch: (deg) => BASE_R + camLift(lawParams, deg),
    lift: (deg) => camLift(lawParams, deg),
  };
}

export function build(p) {
  const g = geom(p);
  const guideArm = { x0: -6, x1: 18, y0: -2, y1: 8 };
  const rod = { x0: 9, x1: 18, y0: 8, y1: 44 };
  const followerZ = KIT.plateT + 8;
  const followerTop = followerZ + KIT.hubT + KIT.bodyT;

  /* -- base frame ------------------------------------------------------- */
  const mounts = [[-58, -74], [58, -74], [-58, 74], [58, 74]].map(([x, y]) => circle(x, y, 1.8, 20));

  // A degree scale engraved round the cam: a tick every 5°, long ones every 30°,
  // so the shaft angle can be read straight off the plate.
  const scale = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const major = deg % 30 === 0;
    const r0 = 31, r1 = major ? 37 : 34;
    const hw = major ? 0.9 : 0.55;
    const a = deg * DEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    const at = (r, t) => [r * ca - t * sa, r * sa + t * ca];
    scale.push([at(r0, -hw), at(r0, hw), at(r1, hw), at(r1, -hw)]);
  }

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#d9d0c1',
    note: 'plate, follower guide, cam post and spring post in one print',
    solids: [
      slab({ outer: roundedRect({ x: -80, y: -88, w: 168, h: 176, r: 6, n: 6 }), holes: [...mounts, ...scale], z: 0, h: KIT.plateT }),
      // guide cheeks, straddling the rod with 0.35 mm each side
      slab({ outer: roundedRect({ x: 2.35, y: 12, w: 6.3, h: 34, r: 2, n: 4 }), z: KIT.plateT, h: 24 }),
      slab({ outer: roundedRect({ x: 18.65, y: 12, w: 6.3, h: 34, r: 2, n: 4 }), z: KIT.plateT, h: 24 }),
      postSolid({ x: 13.5, y: 74, z0: KIT.plateT, h: 22, r: 3.2 }),
      postSolid({ x: 0, y: 0, z0: KIT.plateT, h: followerTop - KIT.plateT + 2 }),
    ],
  });

  /* -- cam -------------------------------------------------------------- */
  const camPart = part({
    id: 'cam',
    name: 'Cam',
    color: '#cf6a34',
    layer: 0,
    note: `base circle Ø${BASE_R * 2} mm, lift ${p.lift} mm, ${p.law} law`,
    at: { x: 0, y: 0, z: KIT.plateT },
    solids: [
      slab({ outer: circle(0, 0, 10, 40), holes: [circle(0, 0, g.bore, 40)], z: 0, h: KIT.hubT }),
      slab({ outer: g.cam.outer, holes: [circle(0, 0, g.bore, 40)], z: KIT.hubT, h: CAM_T }),
    ],
  });

  /* -- follower: a shoe, an arm and a guided rod, one print ------------- */
  const follower = part({
    id: 'follower',
    name: 'Follower',
    color: '#6c7d8b',
    layer: 1,
    note: `sliding shoe Ø${p.roller} mm on a guided rod`,
    at: { x: 0, y: 0, z: followerZ },
    solids: [
      slab({ outer: circle(0, 0, g.shoeR, 44), z: 0, h: KIT.hubT }),
      slab({ outer: roundedRect({ x: -6, y: -2, w: 24, h: 10, r: 3, n: 4 }), z: KIT.hubT, h: KIT.bodyT }),
      slab({
        outer: roundedRect({ x: 9, y: 8, w: 9, h: 36, r: 3.5, n: 4 }),
        holes: [circle(13.5, 20, 2.4, 16), circle(13.5, 30, 2.4, 16)],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
    ],
  });
  void guideArm; void rod;

  const camCap = part({
    id: 'cam-cap',
    printId: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 2,
    note: 'one for the cam post, one for the spring post',
    at: { x: 0, y: 0, z: followerTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const springCap = part({
    id: 'spring-cap',
    printId: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 2,
    at: { x: 13.5, y: 74, z: KIT.plateT + 22 },
    solids: [capSolid({ postR: 3.2, t: 3 })],
  });

  /* -- spring: a printed cantilever pressing the rod down --------------- */
  const spring = part({
    id: 'spring',
    name: 'Leaf spring',
    color: '#9fb0a6',
    layer: 2,
    note: 'printed cantilever; flexes to keep the shoe on the cam',
    at: { x: 13.5, y: 74, z: KIT.plateT + 20 },
    solids: [slab({
      outer: roundedRect({ x: -6.5, y: -30, w: 13, h: 36, r: 2.5, n: 4 }),
      holes: [circle(0, 0, 1.9, 24)],
      z: 0,
      h: 2.4,
    })],
  });

  /* -- checks ------------------------------------------------------------ */
  const minWall = g.cam.minRadius - g.bore;
  const checks = [
    { ok: !g.cam.undercut, text: g.cam.undercut
      ? `Undercut: a Ø${p.roller} mm shoe cannot follow this flank. Reduce the lift or lengthen the rise.`
      : `No undercut — tightest concave radius ${g.cam.tightest.toFixed(1)} mm against a ${(p.roller / 2).toFixed(1)} mm shoe radius.` },
    { ok: minWall > 4, text: `${minWall.toFixed(1)} mm of material between the bore and the cam outline.` },
    { ok: p.rise + p.top <= 290, text: `Rise ${p.rise}° + top dwell ${p.top}° leaves ${(360 - p.rise - p.top).toFixed(0)}° to fall and settle.` },
    { ok: g.fall >= 60, text: `Fall ${g.fall.toFixed(0)}° — longer than 60° keeps the return gentle.` },
  ];

  return { parts: [frame, camPart, follower, camCap, springCap, spring], checks, g };
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  const th = t * DEG;
  const y = g.pitch(t);          // the shoe's centre rides the pitch curve
  return {
    frame: {},
    cam: { rot: th },
    follower: { dx: 0, dy: y },
    'cam-cap': {},
    'spring-cap': {},
    // the leaf tip rides the rod: it flexes by the lift
    spring: { dy: -(g.lift(t)) * 0.55 },
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const deg = ((t % 360) + 360) % 360;
  const lift = g.lift(deg);
  const slope = (g.lift(deg + 1) - g.lift(deg - 1)) / 2;
  const curve = g.lift(deg + 1) - 2 * g.lift(deg) + g.lift(deg - 1);
  const lp = g.lawParams;
  const face = deg < lp.rise ? 'rise'
    : deg < lp.rise + lp.top ? 'top dwell'
      : deg < lp.rise + lp.top + lp.fall ? 'fall' : 'base';
  return [
    { label: 'Shaft', value: Math.round(deg), unit: '°' },
    { label: 'Follower', value: lift.toFixed(2), unit: 'mm' },
    { label: 'Face', value: face },
    { label: 'Cam radius', value: (BASE_R + lift).toFixed(1), unit: 'mm' },
    { label: 'Velocity', value: slope.toFixed(2), unit: 'mm/°' },
    { label: 'Accel', value: curve.toFixed(3), unit: 'mm/°²' },
  ];
}

export const steps = [
  {
    title: 'Base circle: no lift',
    text: 'Over the bottom dwell the cam presents the same radius everywhere, so the follower sits still while the shaft turns.',
    t: 320,
    parts: ['cam', 'follower'],
  },
  {
    title: 'The rise',
    text: 'The radius grows from the base circle to the nose. The follower’s height is the radius the cam presents at that instant — the outline is the timing diagram.',
    t: 60,
    parts: ['cam', 'follower'],
  },
  {
    title: 'Top dwell',
    text: 'A constant-radius arc holds the follower at full lift. This is where a machine does its work: a valve fully open, a tool raised, a switch held.',
    t: 160,
    parts: ['follower', 'cam'],
  },
  {
    title: 'Switch to parabolic and watch the flank',
    text: 'The same lift and the same angles, but a constant-acceleration law: the flanks straighten and the curvature jumps in the middle. The cam is smaller, the knock is harder.',
    t: 60,
    parts: ['cam'],
    set: { law: 'parabolic' },
  },
  {
    title: 'A big roller undercuts a tight cam',
    text: 'Push the roller up and shorten the rise. The outline folds through itself — the audit reports an undercut, because the roller would have to cut the part to follow the law.',
    t: 60,
    parts: ['follower'],
    set: { roller: 16, rise: 60 },
  },
];
