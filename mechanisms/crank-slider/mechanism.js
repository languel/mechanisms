/* Crank and slider — the mechanism inside every engine, pump and compressor
   (507 Mechanical Movements #92).

   Geometry is authored in millimetres, print-flat: z = 0 is the bed face.
   Reference frame: the crank axis is the origin, the slider runs along +x, and
   the crank turns anticlockwise. The connecting rod rides on a raised plane
   above the flush crank axle cap so the crank can spin a full 360° without interference.
*/

import { KIT, slab, part, roundedRect, circle, rect } from '../../src/lib/kit.js';
import { slot, capsule } from '../../src/lib/profiles.js';

const D = Math.PI / 180;

export const meta = {
  slug: 'crank-slider',
  title: 'Crank and slider',
  movement: '507 Movements #92',
  motorMount: { partId: 'crank', label: 'DC Gearmotor / Crank Shaft', direction: 'CCW' },
  tagline: 'One part turns continuously; the other can only slide. Every piston engine, pump and compressor is built on the link between them.',
  category: 'Rotary → linear',
  question: 'If the crank turns at a constant speed, why does the slider race through the middle '
    + 'of its stroke, stop dead at each end, and move asymmetrically between the two halves?',
  bigIdea: 'The slider only sees the horizontal projection of the crank pin’s circle plus the cosine '
    + 'foreshortening of the tilted connecting rod — so its stroke is exactly 2r, while the rod-to-crank '
    + 'ratio L/r controls how much sideways thrust the guide rails must absorb.',
  notes: [
    {
      h: 'Three moving parts, two dead centres',
      p: 'The <b>crank</b> carries an eccentric pin at radius <i>r</i>. The <b>connecting rod</b> '
        + 'of length <i>L</i> links that pin to the <b>slider</b>, which is constrained between parallel '
        + 'guide rails. At θ = 0° (Top Dead Centre, <i>x</i> = <i>L</i> + <i>r</i>) and θ = 180° '
        + '(Bottom Dead Centre, <i>x</i> = <i>L</i> − <i>r</i>), the crank and rod are collinear '
        + 'and the slider velocity passes through zero. The total stroke is always <i>S</i> = 2<i>r</i>.',
    },
    {
      h: 'Why the motion is not a pure sine wave',
      p: 'Exact slider position is <i>x</i>(θ) = <i>r</i> cos θ + √(<i>L</i>² − <i>r</i>² sin² θ). '
        + 'Because the connecting rod tilts through angle φ = arcsin((<i>r</i>/<i>L</i>) sin θ), it '
        + 'pulls the slider slightly closer whenever sin θ ≠ 0. A shorter rod (smaller <i>L</i>/<i>r</i>) '
        + 'increases peak acceleration at TDC and increases lateral thrust against the guide rails.',
    },
    {
      h: 'Three-tier non-colliding z-stack',
      p: 'For the crank to spin a full 360°, the connecting rod must sweep directly over the crank’s '
        + 'central axle. Here the crank disc and slider sit on Tier 1 (<i>z</i> = 4..11.6 mm), the '
        + 'axle cap sits at <i>z</i> = 11.6..14.6 mm, and the crank pin and slider wrist pin rise to '
        + 'carry the connecting rod on Tier 2 (<i>z</i> = 15..22.6 mm) — completely clearing the axle cap.',
    },
    {
      h: 'Reversible kinematics: pump vs engine',
      p: 'Drive the crank with a gearmotor and you have a reciprocating pump, compressor or punch. '
        + 'Push the slider with steam, combustion gas or a pneumatic cylinder and it drives the crank — '
        + 'providing a flywheel carries it past the two dead-centre singularities.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Slider-crank (#92)', url: 'https://507movements.com/mm_092.html' },
    { label: 'Slider-crank linkage equations — Wikipedia', url: 'https://en.wikipedia.org/wiki/Slider-crank_linkage' },
  ],
  attribution: 'Crank and slider — 3-tier non-colliding stack with integral guide rails and 5 mm stroke ruler.',
  screenshot: { t: 118, azimuth: -0.58, elevation: 0.74 },
  order: 30,
};

export const params = [
  { key: 'stroke', label: 'Stroke', min: 18, max: 60, step: 2, value: 34, unit: 'mm',
    help: 'Twice the crank pin radius r: total distance between dead centres.' },
  { key: 'rod', label: 'Rod length', min: 44, max: 116, step: 2, value: 80, unit: 'mm',
    help: 'Centre-to-centre connecting rod length. Higher L/r reduces rail side-load.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Diametral running clearance on all pivot bores.' },
];

export const hardware = [];

const POST_R = 3.4;
const CAP_T = 3;
const SLIDE_L = 32;
const SLIDE_W = 28;
const RAIL_W = 5.2;
const PLATE_T = KIT.plateT;

const crankDiscR = (stroke) => Math.max(19, stroke / 2 + 10.5);

function geom(p) {
  const r = p.stroke / 2;
  const L = p.rod;
  const turn = POST_R * 2 + p.clearance;
  const press = POST_R * 2 - 0.3;
  const capR = POST_R + 3.2;

  const crankTop = PLATE_T + KIT.hubT + KIT.bodyT; // 11.6 mm
  const axleCapTop = crankTop + CAP_T;             // 14.6 mm
  const rodZ = axleCapTop + 0.5;                   // 15.1 mm (clears axle cap!)
  const rodBot = rodZ + KIT.hubT;
  const rodTop = rodBot + KIT.bodyT;               // 22.7 mm
  const capTop = rodTop + CAP_T;                   // 25.7 mm

  const discR = crankDiscR(p.stroke);
  const railFrom = Math.max(L - r - SLIDE_L / 2 - 6, discR + 4);
  const railTo = L + r + SLIDE_L / 2 + 10;
  const xMin = -(discR + 18);
  const xMax = L + r + SLIDE_L / 2 + 18;
  const plateD = 96;

  const sliderX = (deg) => {
    const th = deg * D;
    return r * Math.cos(th) + Math.sqrt(L * L - (r * Math.sin(th)) ** 2);
  };

  return {
    r, L, turn, press, capR, crankTop, axleCapTop, rodZ, rodBot, rodTop, capTop, discR,
    railFrom, railTo, xMin, xMax, plateD, plateW: xMax - xMin, sliderX,
    railGap: SLIDE_W / 2 + 0.35,
  };
}

export function build(p) {
  const g = geom(p);
  const {
    r, L, turn, press, capR, crankTop, rodZ, rodTop, discR,
    railFrom, railTo, xMin, xMax, plateW, plateD, railGap,
  } = g;

  const mountHoles = [
    [xMin + 12, -plateD / 2 + 12], [xMax - 12, -plateD / 2 + 12],
    [xMin + 12, plateD / 2 - 12], [xMax - 12, plateD / 2 - 12],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  const ticks = [];
  for (let x = Math.ceil(railFrom / 5) * 5; x <= railTo - 4; x += 5) {
    const major = x % 20 === 0;
    ticks.push(rect(x - 0.55, -plateD / 2 + 3, 1.1, major ? 4.8 : 2.8));
  }

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    color: '#ece6da',
    role: 'frame',
    explosion: [0, 0, 0],
    note: 'plate with parallel piston guide rails, crank axle post and 5 mm stroke scale',
    solids: [
      slab({
        outer: roundedRect({ x: xMin, y: -plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }),
        holes: [...mountHoles, ...ticks],
        z: 0,
        h: PLATE_T,
      }),
      ...[-1, 1].map((s) => slab({
        outer: roundedRect({
          x: railFrom,
          y: s === 1 ? railGap : -railGap - RAIL_W,
          w: railTo - railFrom,
          h: RAIL_W,
          r: 1.5,
          n: 3,
        }),
        z: PLATE_T,
        h: KIT.hubT + KIT.bodyT,
      })),
      slab({ outer: circle(0, 0, POST_R, 36), z: PLATE_T, h: crankTop - PLATE_T + 1.8 }),
    ],
  });

  const webHoles = [];
  const webR = discR - 7.5;
  for (let i = 0; i < 3; i++) {
    const a = (60 + i * 120) * D;
    const holeR = Math.max(2.2, discR * 0.09);
    const cx = webR * Math.cos(a), cy = webR * Math.sin(a);
    if (Math.hypot(cx - r, cy) > holeR + POST_R + 2.2 && Math.hypot(cx, cy) > holeR + turn / 2 + 2.8) {
      webHoles.push(circle(cx, cy, holeR, 20));
    }
  }

  const crank = part({
    id: 'crank',
    name: 'Crank disc',
    color: '#dcb038',
    layer: 1,
    explosion: [0, 0, 18],
    note: `eccentric crank pin at r = ${r.toFixed(1)} mm (stroke = 2r = ${p.stroke} mm)`,
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({ outer: circle(0, 0, 10, 40), holes: [circle(0, 0, turn / 2, 40)], z: 0, h: KIT.hubT }),
      slab({
        outer: circle(0, 0, discR, 64),
        holes: [circle(0, 0, turn / 2, 40), ...webHoles],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
      slab({
        outer: circle(r, 0, POST_R, 32),
        z: KIT.hubT + KIT.bodyT,
        h: (rodTop - PLATE_T) - KIT.hubT - KIT.bodyT + 1.8,
      }),
    ],
  });

  const conrod = part({
    id: 'conrod',
    name: 'Connecting rod',
    color: '#5aa2d4',
    layer: 2,
    explosion: [0, 0, 38],
    note: `centre-to-centre L = ${L} mm — ratio L/r = ${(L / r).toFixed(2)}`,
    at: { x: 0, y: 0, z: rodZ },
    solids: [
      slab({ outer: circle(0, 0, 6.8, 32), holes: [circle(0, 0, turn / 2, 32)], z: 0, h: KIT.hubT }),
      slab({ outer: circle(L, 0, 6.8, 32), holes: [circle(L, 0, turn / 2, 32)], z: 0, h: KIT.hubT }),
      slab({
        outer: capsule(0, 0, L, 0, 6.8, 20),
        holes: [circle(0, 0, turn / 2, 32), circle(L, 0, turn / 2, 32)],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
    ],
  });

  const slider = part({
    id: 'slider',
    name: 'Piston slider',
    color: '#82c0e4',
    layer: 1,
    explosion: [0, 0, 18],
    note: 'guided block constrained to 1D linear translation along +x',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: roundedRect({ x: -SLIDE_L / 2, y: -SLIDE_W / 2, w: SLIDE_L, h: SLIDE_W, r: 3.5, n: 5 }),
        holes: [slot(-11, -7, -7, -7, 3.8), slot(7, -7, 11, -7, 3.8), slot(-11, 7, -7, 7, 3.8), slot(7, 7, 11, 7, 3.8)],
        z: 0,
        h: KIT.hubT + KIT.bodyT,
      }),
      slab({
        outer: circle(0, 0, POST_R, 32),
        z: KIT.hubT + KIT.bodyT,
        h: (rodTop - PLATE_T) - (KIT.hubT + KIT.bodyT) + 1.8,
      }),
    ],
  });

  const capSolids = [slab({
    outer: circle(0, 0, capR, 40),
    holes: [circle(0, 0, press / 2, 40)],
    z: 0,
    h: CAP_T,
  })];

  const caps = [
    part({
      id: 'cap-axle',
      printId: 'cap',
      name: 'Press cap',
      qty: 3,
      color: '#e7dfd0',
      layer: 1,
      explosion: [0, 0, 28],
      note: 'retains crank on axle; sits below connecting rod plane',
      at: { x: 0, y: 0, z: crankTop },
      solids: capSolids,
    }),
    part({
      id: 'cap-crank',
      printId: 'cap',
      name: 'Crank pin cap',
      qty: 3,
      color: '#e7dfd0',
      layer: 3,
      explosion: [0, 0, 54],
      at: { x: 0, y: 0, z: rodTop },
      solids: capSolids,
    }),
    part({
      id: 'cap-slider',
      printId: 'cap',
      name: 'Wrist pin cap',
      qty: 3,
      color: '#e7dfd0',
      layer: 3,
      explosion: [0, 0, 54],
      at: { x: 0, y: 0, z: rodTop },
      solids: capSolids,
    }),
  ];

  const travel = g.sliderX(0) - g.sliderX(180);
  const maxPhi = (Math.asin(Math.min(0.98, r / L)) * 180) / Math.PI;
  const checks = [
    { ok: L / r >= 2.2, text: `Rod ratio L/r = ${(L / r).toFixed(2)} — peak connecting rod obliquity φ_max = ${maxPhi.toFixed(1)}°.` },
    { ok: railFrom >= discR + 2, text: `Guide rails start at x = ${railFrom.toFixed(0)} mm, clearing the Ø${(discR * 2).toFixed(0)} mm crank disc.` },
    { ok: Math.abs(travel - p.stroke) < 0.01, text: `Exact stroke between TDC and BDC = ${travel.toFixed(1)} mm = 2r.` },
    { ok: plateW <= 220 && plateD <= 220, text: `Baseplate ${plateW.toFixed(0)} × ${plateD} mm fits a 220 mm print bed.` },
    { ok: r >= POST_R + 4.5, text: `Crank pin clears central axle cap; connecting rod sweeps 360° unimpeded.` },
  ];

  return { parts: [frame, crank, slider, conrod, ...caps], checks, g };
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  const th = t * D;
  const pinX = g.r * Math.cos(th);
  const pinY = g.r * Math.sin(th);
  const sx = g.sliderX(t);
  const phi = Math.atan2(-pinY, sx - pinX);

  return {
    frame: {},
    crank: { rot: th },
    conrod: { rot: phi, dx: pinX, dy: pinY },
    slider: { dx: sx, dy: 0 },
    'cap-crank': { dx: pinX, dy: pinY },
    'cap-slider': { dx: sx, dy: 0 },
    'cap-axle': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const th = t * D;
  const x = g.sliderX(t);
  const pinX = g.r * Math.cos(th);
  const pinY = g.r * Math.sin(th);
  const phi = Math.atan2(-pinY, x - pinX) / D;
  const slide = -g.r * Math.sin(th)
    * (1 + (g.r * Math.cos(th)) / Math.sqrt(g.L * g.L - (g.r * Math.sin(th)) ** 2));

  return [
    { label: 'Crank θ', value: Math.round(((t % 360) + 360) % 360), unit: '°' },
    { label: 'Slider x', value: x.toFixed(1), unit: 'mm' },
    { label: 'Rod φ', value: phi.toFixed(1), unit: '°' },
    { label: 'dx / dθ', value: slide.toFixed(2), unit: 'mm/rad' },
    { label: 'Ratio L/r', value: (g.L / g.r).toFixed(2) },
  ];
}

export const steps = [
  {
    title: 'Top Dead Centre (0°): maximum extension',
    text: 'At θ = 0°, the crank pin and connecting rod line up straight along +x at x = L + r. Instantaneous slider velocity is zero while acceleration is at its peak.',
    t: 0,
    parts: ['crank', 'conrod', 'slider'],
  },
  {
    title: 'Quarter turn (90°): peak velocity & side thrust',
    text: 'At θ = 90°, the crank pin moves parallel to the rails and the connecting rod reaches its steepest tilt angle φ = arcsin(r/L), pressing sideways against the guide rails.',
    t: 90,
    parts: ['conrod', 'slider', 'frame'],
  },
  {
    title: 'Bottom Dead Centre (180°): full retraction',
    text: 'At θ = 180°, the crank pin passes behind the axle as the connecting rod bridges cleanly over the flush axle cap. The slider reaches x = L − r, completing a stroke of 2r.',
    t: 180,
    parts: ['crank', 'conrod', 'slider'],
  },
  {
    title: 'Short rod (L/r ≈ 2.4): high angularity',
    text: 'Shorten the rod to 48 mm with a 40 mm stroke. Watch the steep connecting-rod angle φ and notice how the slider dwells longer near BDC and snaps faster through TDC.',
    t: 75,
    parts: ['conrod', 'slider'],
    set: { stroke: 40, rod: 48 },
  },
  {
    title: 'Long rod (L/r > 4): pure harmonic approximation',
    text: 'Lengthen the rod to 108 mm. The rod stays nearly horizontal throughout the cycle, minimizing guide friction and approaching pure sinusoidal harmonic motion.',
    t: 75,
    parts: ['conrod', 'slider'],
    set: { stroke: 30, rod: 108 },
  },
];
