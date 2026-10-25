/* Crank and slider — the mechanism inside every engine, pump and compressor.

   Geometry is authored in millimetres, print-flat: z = 0 is the bed face. The
   assembled machine stacks the same parts above the base plate, so the page
   draws exactly the triangles the STL export writes.

   Reference frame: the crank axis is the origin, the slider runs along +x, and
   the crank turns anticlockwise.
*/

import { KIT, slab, part, roundedRect, circle, rect } from '../../src/lib/kit.js';
import { slot } from '../../src/lib/profiles.js';

const D = Math.PI / 180;

export const meta = {
  slug: 'crank-slider',
  title: 'Crank and slider',
  tagline: 'One part turns, the other can only slide. Everything about an engine follows '
    + 'from the link between them.',
  category: 'Rotary → linear',
  question: 'If the crank turns at a constant speed, why does the slider race through the middle '
    + 'of its stroke and stop dead at each end?',
  bigIdea: 'The slider only sees the part of the crank pin’s circle that points along the rails, '
    + 'so its speed rises and falls twice per turn while the crank never changes pace.',
  notes: [
    {
      h: 'What each part does',
      p: 'The <b>crank</b> carries a pin at radius <i>r</i> from the axle. The <b>connecting rod</b> '
        + 'is pinned to that pin at one end and to the <b>slider</b> at the other. The slider is '
        + 'trapped between two rails, so the rod cannot swing freely: as the crank turns, the rod’s '
        + 'far end is pushed along the rails. The crank pin travels a full circle; the slider only '
        + 'sees the horizontal part of it, which is why the stroke is exactly 2<i>r</i>.',
    },
    {
      h: 'The two numbers that decide everything',
      p: 'The <b>stroke</b> is twice the crank radius — set by where the pin sits on the crank. The '
        + '<b>rod length</b> changes nothing about the stroke; it changes how the slider moves '
        + 'within it. A long rod keeps the rod angle small, so the slider follows an almost perfect '
        + 'sine. A short rod swings wide, presses hard sideways into the rails, makes the slider '
        + 'linger at the ends and rush the middle. Engine designers keep the rod-to-crank ratio '
        + 'above about 3 for exactly this reason.',
    },
    {
      h: 'Why it is printed as a stack',
      p: 'Two links cannot share one plane without colliding, so the crank, the rod and the slider '
        + 'each sit on their own level and are joined by vertical pins. The pins here are printed '
        + 'posts on the crank and the slider, with press-on caps above the rod: the rod is captive, '
        + 'and nothing has to be bought. The axle is a printed post on the base plate too — this '
        + 'machine needs no hardware at all.',
    },
    {
      h: 'Where you meet it',
      p: 'Steam engines, petrol engines, air compressors, bicycle pedals, sewing-machine needles and '
        + 'foot pumps are all this mechanism. Run it backwards — push the slider — and it becomes '
        + 'the pump or the engine: linear force in, rotation out.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — cranks (92, 93, 98)', url: 'https://507movements.com/toc.html' },
    { label: 'Slider-crank linkage — Wikipedia', url: 'https://en.wikipedia.org/wiki/Slider-crank_linkage' },
  ],
  attribution: 'Crank and slider — from the mechanisms catalogue. This print pack is generated from the same model the page runs.',
  screenshot: { t: 118 },
};

export const params = [
  { key: 'stroke', label: 'Stroke', min: 18, max: 60, step: 2, value: 34, unit: 'mm',
    help: 'Twice the crank radius: how far the slider travels.' },
  { key: 'rod', label: 'Rod length', min: 44, max: 116, step: 2, value: 80, unit: 'mm',
    help: 'Centre to centre. Longer rods make the slider’s motion smoother.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Added to every turning bore. Raise it if your printer runs tight.' },
];

export const hardware = [];

/* ---------------------------------------------------------------- geometry */

const POST_R = 3.4;          // every pivot post is Ø6.8
const CAP_T = 3;
const SLIDE_L = 34;
const SLIDE_W = 30;
const RAIL_W = 5;
const PLATE_T = KIT.plateT;

const crankDiscR = (stroke) => Math.max(19, stroke / 2 + 11);

function geom(p) {
  const r = p.stroke / 2;
  const L = p.rod;
  const turn = POST_R * 2 + p.clearance;      // running bore on a post
  const press = POST_R * 2 - 0.3;             // cap bore: press fit on a post
  const capR = POST_R + 3.2;

  const rodZ = PLATE_T + 10;                  // layer 1 floor, clear of the axle cap
  const rodBot = rodZ + KIT.hubT;
  const rodTop = rodBot + KIT.bodyT;
  const capTop = rodTop + CAP_T;

  const discR = crankDiscR(p.stroke);
  const railFrom = Math.max(L - r - SLIDE_L / 2 - 6, discR + 3);
  const railTo = L + r + SLIDE_L / 2 + 10;
  const xMin = -(discR + 22);
  const xMax = L + r + SLIDE_L / 2 + 18;
  const plateD = 98;

  const sliderX = (deg) => {
    const th = deg * D;
    return r * Math.cos(th) + Math.sqrt(L * L - (r * Math.sin(th)) ** 2);
  };

  return {
    r, L, turn, press, capR, rodZ, rodBot, rodTop, capTop, discR,
    railFrom, railTo, xMin, xMax, plateD, plateW: xMax - xMin, sliderX,
    railGap: SLIDE_W / 2 + 0.35,
  };
}

export function build(p) {
  const g = geom(p);
  const {
    r, L, turn, press, capR, rodZ, rodTop, capTop, discR,
    railFrom, railTo, xMin, xMax, plateW, plateD, railGap,
  } = g;

  /* -- base frame: plate, rails, axle post ------------------------------ */

  const mountHoles = [
    [xMin + 13, -plateD / 2 + 13], [xMax - 13, -plateD / 2 + 13],
    [xMin + 13, plateD / 2 - 13], [xMax - 13, plateD / 2 - 13],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  // ruler ticks punched right through the plate along the front edge
  const ticks = [];
  for (let i = 0; i * 5 <= plateW - 34; i++) {
    const major = i % 5 === 0;
    ticks.push(rect(xMin + 16 + i * 5 - 0.55, -plateD / 2 + 1.4, 1.1, major ? 4.4 : 2.6));
  }

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    color: '#d9d0c1',
    role: 'frame',
    note: 'plate, two guide rails, the axle post and a 5 mm ruler, in one print',
    solids: [
      slab({
        outer: roundedRect({ x: xMin, y: -plateD / 2, w: plateW, h: plateD, r: 5, n: 6 }),
        holes: [...mountHoles, ...ticks],
        z: 0,
        h: PLATE_T,
      }),
      ...[-1, 1].map((s) => slab({
        outer: rect(railFrom, s === 1 ? railGap : -railGap - RAIL_W, railTo - railFrom, RAIL_W),
        z: PLATE_T,
        h: 6.4,
      })),
      slab({ outer: circle(0, 0, POST_R, 36), z: PLATE_T, h: 7.6 }), // axle post
    ],
  });

  /* -- crank ------------------------------------------------------------- */

  const webHoles = [];
  const webR = discR - 7;
  for (let i = 0; i < 3; i++) {
    const a = (40 + i * 120) * D;
    const holeR = Math.max(2.4, discR * 0.095);
    const cx = webR * Math.cos(a), cy = webR * Math.sin(a);
    if (Math.hypot(cx - r, cy) > holeR + POST_R + 1.6 && Math.hypot(cx, cy) > holeR + turn / 2 + 2.6) {
      webHoles.push(circle(cx, cy, holeR, 20));
    }
  }

  const crank = part({
    id: 'crank',
    name: 'Crank disc',
    color: '#cf6a34',
    layer: 0,
    note: `pin at ${r.toFixed(1)} mm — the stroke is twice this`,
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
        h: (capTop - PLATE_T) - KIT.hubT - KIT.bodyT,
      }),
    ],
  });

  /* -- connecting rod ---------------------------------------------------- */

  const conrod = part({
    id: 'conrod',
    name: 'Connecting rod',
    color: '#6c7d8b',
    layer: 1,
    note: `centre-to-centre ${L} mm — L/r = ${(L / r).toFixed(2)}`,
    at: { x: 0, y: 0, z: rodZ },
    solids: [
      slab({ outer: circle(0, 0, 10.4, 40), holes: [circle(0, 0, turn / 2, 40)], z: 0, h: KIT.hubT }),
      slab({
        outer: capsule(0, 0, L, 0, 6.4, 20),
        holes: [circle(0, 0, turn / 2, 40), circle(L, 0, turn / 2, 40)],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
    ],
  });

  /* -- slider ------------------------------------------------------------ */

  const slider = part({
    id: 'slider',
    name: 'Slider',
    color: '#b08b4a',
    layer: 0,
    note: 'trapped between the rails, so it can only slide',
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: roundedRect({ x: -SLIDE_L / 2, y: -SLIDE_W / 2, w: SLIDE_L, h: SLIDE_W, r: 3, n: 5 }),
        holes: [slot(-13, 0, -9, 0, 4.6), slot(9, 0, 13, 0, 4.6)],
        z: 0,
        h: KIT.bodyT,
      }),
      slab({ outer: circle(0, 0, POST_R, 32), z: KIT.bodyT, h: (capTop - PLATE_T) - KIT.bodyT }),
    ],
  });

  /* -- caps: one print, three places ------------------------------------- */

  const capSolids = [slab({
    outer: circle(0, 0, capR, 44),
    holes: [circle(0, 0, press / 2, 44)],
    z: 0,
    h: CAP_T,
  })];

  const caps = [
    part({ id: 'cap-axle', printId: 'cap', name: 'Press cap', qty: 3, color: '#e7dfd0', layer: 2,
      note: 'press onto a post above a link; print three',
      at: { x: 0, y: 0, z: PLATE_T + 7.6 }, solids: capSolids }),
    part({ id: 'cap-crank', printId: 'cap', name: 'Press cap', qty: 3, color: '#e7dfd0', layer: 2,
      at: { x: r, y: 0, z: rodTop }, solids: capSolids }),
    part({ id: 'cap-slider', printId: 'cap', name: 'Press cap', qty: 3, color: '#e7dfd0', layer: 2,
      at: { x: 0, y: 0, z: rodTop }, solids: capSolids }),
  ];

  /* -- checks ------------------------------------------------------------ */

  const travel = g.sliderX(0) - g.sliderX(180);
  const checks = [
    { ok: L / r >= 2.2, text: `Rod ratio L/r = ${(L / r).toFixed(2)} — 2 or more keeps the side load on the rails low.` },
    { ok: railFrom >= discR + 2 || railFrom > L - r - SLIDE_L / 2 - 1,
      text: `Rails start at ${railFrom.toFixed(0)} mm, clear of the ${discR} mm crank disc.` },
    { ok: Math.abs(travel - p.stroke) < 0.01, text: `Slider travel ${travel.toFixed(1)} mm = 2r, as it must be.` },
    { ok: plateW <= 220 && plateD <= 220, text: `Frame ${plateW.toFixed(0)} × ${plateD} mm — fits a 220 mm bed.` },
    { ok: r >= POST_R + 6, text: `Crank pin has ${(discR - r).toFixed(1)} mm of material around it.` },
  ];

  return { parts: [...caps, frame, crank, conrod, slider], checks, g };
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
  // dx/dθ: how far the slider moves per radian of crank angle
  const slide = -g.r * Math.sin(th)
    * (1 + (g.r * Math.cos(th)) / Math.sqrt(g.L * g.L - (g.r * Math.sin(th)) ** 2));

  return [
    { label: 'Shaft', value: Math.round(((t % 360) + 360) % 360), unit: '°' },
    { label: 'Slider', value: x.toFixed(1), unit: 'mm' },
    { label: 'Rod angle', value: phi.toFixed(1), unit: '°' },
    { label: 'Slide rate', value: slide.toFixed(2), unit: 'mm/rad' },
    { label: 'L/r', value: (g.L / g.r).toFixed(2) },
  ];
}

export const steps = [
  {
    title: 'The crank pin at full extension',
    text: 'With the crank pointing away from the slider the pin is at its furthest, and the slider sits at the end of its stroke.',
    t: 0,
    parts: ['crank', 'conrod', 'slider'],
  },
  {
    title: 'A quarter turn: half the motion is sideways',
    text: 'The pin now moves mostly across the rails, not along them. The slider is at its fastest here. Watch the rod angle — this is the side load the rails have to take.',
    t: 90,
    parts: ['conrod', 'slider'],
  },
  {
    title: 'Half a turn: the near end',
    text: 'The pin has come back past the axle, so the slider is as close as it gets. The distance between these two extremes is exactly twice the crank radius.',
    t: 180,
    parts: ['crank', 'slider'],
  },
  {
    title: 'A short rod swings wide',
    text: 'Shorten the rod and the same crank makes the rod lurch. The slider hesitates at the ends and races the middle, and the rails feel a much bigger sideways push.',
    t: 70,
    parts: ['conrod'],
    set: { rod: 52 },
  },
  {
    title: 'A long rod is almost a sine',
    text: 'Lengthen it and the rod barely moves off the axis. The slider’s speed becomes almost perfectly sinusoidal, which is why real engines use long rods.',
    t: 70,
    parts: ['conrod', 'slider'],
    set: { rod: 108 },
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
