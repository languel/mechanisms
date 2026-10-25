/* Rack and pinion — rotation into straight-line travel without a crank.

   The pitch line of the rack is tangent to the pinion's pitch circle, so every
   radian the pinion turns moves the rack by exactly one pitch radius. The rack
   is a gear unrolled, which is why the module has to match: the same tooth
   spacing must run round the circle and along the line.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid, boreOn } from '../../src/lib/kit.js';
import { gearProfile, rackProfile } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'rack-pinion',
  title: 'Rack and pinion',
  tagline: 'A gear unrolled into a straight line: every radian of the pinion is one pitch '
    + 'radius of travel.',
  category: 'Rotary ↔ linear',
  question: 'How does a gear drive something in a straight line, and what has to match for the '
    + 'teeth to run smoothly into each other?',
  bigIdea: 'The rack is the pinion’s pitch circle unrolled. Match the module and the tooth spacing '
    + 'lines up; the travel per turn is fixed by the pitch radius, not by the teeth you can see.',
  notes: [
    {
      h: 'One number decides the match',
      p: 'A gear is defined by its <b>module</b>: the pitch diameter divided by the tooth count. The '
        + 'rack has the same module, so its teeth are spaced π·m apart — exactly the pitch on the '
        + 'pinion’s pitch circle. Two parts only mesh if this number agrees, which is why the module '
        + 'slider changes the pinion and the rack together.',
    },
    {
      h: 'Travel per turn',
      p: 'The contact point sits on the pitch circle, so the rack moves by the length of arc the '
        + 'pitch circle rolls through: one full turn moves the rack by π·<i>d</i>, where <i>d</i> is '
        + 'the pitch diameter. That is 2π<i>r</i> — the circumference. The readouts show the pitch '
        + 'diameter and the travel per turn so you can check it against the ruler on the plate.',
    },
    {
      h: 'Why a keeper and not a groove',
      p: 'A printed rack cannot have a dovetail cut into its side, because every part here is a flat '
        + 'profile extruded upwards. Instead the rack slides through two printed <b>keepers</b>: '
        + 'rectangular windows standing on the plate, 0.4 mm larger than the rack in every direction. '
        + 'They hold the rack against the pinion without touching the teeth, and they print flat '
        + 'with no supports.',
    },
    {
      h: 'Where you meet it',
      p: 'Steering racks in cars, the focuser on a telescope, a plotter’s pen carriage and the '
        + 'azimuth drive of a small telescope mount are all rack and pinion. Pair it with a stepper '
        + 'and you have a linear stage with no belt to stretch.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — racks and pinions (81, 113, 114, 115)', url: 'https://507movements.com/toc.html' },
    { label: 'Rack and pinion — Wikipedia', url: 'https://en.wikipedia.org/wiki/Rack_and_pinion' },
  ],
  attribution: 'Rack and pinion — from the mechanisms catalogue. Both parts are generated from the same module and pressure angle.',
  screenshot: { t: 210 },
  order: 30,
};

export const params = [
  { key: 'module', label: 'Module', min: 1.5, max: 3, step: 0.25, value: 2, unit: 'mm',
    help: 'Pitch diameter ÷ teeth. The pinion and the rack share it — this is what makes them mesh.' },
  { key: 'teeth', label: 'Pinion teeth', min: 12, max: 26, step: 1, value: 18,
    help: 'Fewer teeth give more travel per turn but a weaker, more undercut tooth.' },
  { key: 'stroke', label: 'Rack stroke', min: 24, max: 80, step: 4, value: 56, unit: 'mm',
    help: 'How far the rack travels. The rail and keepers are sized to match.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const PINION_T = KIT.bodyT;
const RACK_H = 12;

function geom(p) {
  const m = p.module;
  const rp = (m * p.teeth) / 2;
  const bore = boreOn(p.clearance);
  const pinion = gearProfile({
    // phase the teeth so that at zero travel one pinion tooth points straight
    // down the mesh line, into the gap between two rack teeth
    teeth: p.teeth, module: m, bore: bore * 2, hub: KIT.hubT, backlash: 0.22, samples: 6,
    rotate: -Math.PI / 2,
  });
  const pinionR = pinion.tipRadius;

  // the rack's pitch line sits one pitch radius below the pinion's centre, with
  // the teeth pointing up at the pinion
  const rackY = -rp;
  const rackTeeth = Math.ceil((p.stroke + 80) / (Math.PI * m));
  const rack = rackProfile({
    teeth: rackTeeth, module: m, height: RACK_H, backlash: 0.22,
  });
  const rackLen = rackTeeth * Math.PI * m;
  const bodyTop = rackY + rack.root;          // root of the teeth
  const bodyBottom = rackY - RACK_H;          // the rack's back

  const travel = p.stroke;
  return {
    m, rp, bore, pinion, pinionR, rack, rackY, rackLen, rackTeeth, bodyTop, bodyBottom, travel,
    pinionTop: KIT.plateT + KIT.hubT + PINION_T,
  };
}

export function build(p) {
  const g = geom(p);
  const { rp, pinion, rack, rackY, bodyTop, bodyBottom, travel } = g;
  const plateT = KIT.plateT;
  const pinionZ = plateT;

  const half = travel / 2;
  const rackStart = -half - 20;
  const rackEnd = rackStart + g.rackLen;

  /* -- base frame ------------------------------------------------------- */
  const mounts = [[-86, -74], [86, -74], [-86, 72], [86, 72]].map(([x, y]) => circle(x, y, 1.8, 20));

  // Keepers: a bridge over the rack at each end of its stroke, so the rack
  // cannot lift away from the pinion. The two feet stand beside the rack (clear
  // of its back and its teeth) and the lintel spans over the top with 0.4 mm to
  // spare. Printed as one part: a 12 mm bridge with no supports.
  const keeperY0 = rackY - RACK_H - 2.4;
  const keeperY1 = rackY + rack.tip + 2.4;
  const pillarTop = 14;
  const keeperSolids = [
    slab({ outer: roundedRect({ x: -7, y: keeperY0, w: 14, h: 4.6, r: 1.6, n: 3 }), z: 0, h: pillarTop }),
    slab({ outer: roundedRect({ x: -7, y: keeperY1 - 4.6, w: 14, h: 4.6, r: 1.6, n: 3 }), z: 0, h: pillarTop }),
    slab({ outer: roundedRect({ x: -7, y: keeperY0, w: 14, h: keeperY1 - keeperY0, r: 2, n: 4 }), z: pillarTop, h: 5 }),
  ];
  const keeperAt = (x) => ({
    ...part({
      id: 'keeper',
      name: 'Rack keeper',
      qty: 2,
      color: '#b08b4a',
      layer: 2,
      note: 'bridges over the rack; prints with a 12 mm bridge, no supports',
      at: { x, y: rackY, z: plateT },
      solids: keeperSolids.map((s2) => ({
        ...s2,
        outer: s2.outer.map(([px, py]) => [px, py - rackY]),
      })),
    }),
  });

  const ticks = [];
  for (let i = 0; i <= travel; i += 5) {
    const major = i % 20 === 0;
    ticks.push(rect(-half + i - 0.55, -76, 1.1, major ? 4.4 : 2.6));
  }

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#d9d0c1',
    note: 'plate, two rack keepers, pinion post and a 5 mm ruler',
    solids: [
      slab({ outer: roundedRect({ x: -110, y: -84, w: 220, h: 168, r: 6, n: 6 }), holes: [...mounts, ...ticks], z: 0, h: plateT }),
      postSolid({ x: 0, y: 0, z0: plateT, h: g.pinionTop - plateT + 2, r: POST_R }),
    ],
  });

  /* -- pinion ------------------------------------------------------------ */
  const pinionPart = part({
    id: 'pinion',
    name: 'Pinion',
    color: '#cf6a34',
    layer: 0,
    note: `${p.teeth} teeth, module ${p.module} — pitch Ø${(rp * 2).toFixed(1)} mm`,
    // the teeth interlock with the rack, which flat shading cannot order; draw
    // the pinion on top so its near teeth read clearly
    zOrder: 2,
    at: { x: 0, y: 0, z: pinionZ },
    solids: [
      slab({ outer: circle(0, 0, 10, 40), holes: [circle(0, 0, g.bore, 40)], z: 0, h: KIT.hubT }),
      slab({ outer: pinion.outer, holes: [circle(0, 0, g.bore, 40), ...pinionLightening(pinion)], z: KIT.hubT, h: PINION_T }),
      // one tooth marked as a pointer so the turning is visible
    ],
  });

  /* -- rack -------------------------------------------------------------- */
  const rackPart = part({
    id: 'rack',
    name: 'Rack',
    color: '#6c7d8b',
    layer: 0,
    note: `${g.rackTeeth} teeth — same module, same tooth spacing`,
    at: { x: rackStart, y: g.rackY, z: plateT },
    solids: [
      slab({
        outer: rack.outer,
        holes: [circle(rackLengthHalf(g) - 26, -6, 2.2, 20), circle(rackLengthHalf(g) + 26, -6, 2.2, 20)],
        z: 0,
        h: KIT.bodyT,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 1,
    color: '#e7dfd0',
    layer: 2,
    note: 'press onto the pinion post',
    at: { x: 0, y: 0, z: g.pinionTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });

  /* -- checks ------------------------------------------------------------ */
  const travelPerTurn = Math.PI * 2 * rp;
  const checks = [
    { ok: p.teeth >= 12, text: `${p.teeth} teeth at module ${p.module} — undercut stays mild above 12.` },
    { ok: rp > pinion.tipRadius - 3, text: `Pinion tip Ø${(pinion.tipRadius * 2).toFixed(1)} mm, root Ø${(pinion.rootRadius * 2).toFixed(1)} mm.` },
    { ok: keeperFits(g), text: 'Each keeper bridges the rack with 0.4 mm to spare and never touches the teeth.' },
    { ok: travel <= g.rackLen - 40, text: `${travel} mm stroke on a ${g.rackLen.toFixed(0)} mm rack — the teeth never leave the keepers.` },
    { ok: Math.abs(travelPerTurn - Math.PI * 2 * rp) < 1e-6, text: `One turn moves the rack ${travelPerTurn.toFixed(1)} mm = π × pitch Ø.` },
  ];

  return { parts: [frame, pinionPart, rackPart, keeperAt(-(half + 26)), keeperAt(half + 26), cap], checks, g };
}

function keeperFits(g) {
  const pillarTop = 14;
  return pillarTop > g.rack.tip + 0.4 && (g.rackY - RACK_H - 2.4) < g.bodyBottom - 0.4;
}
const rackLengthHalf = (g) => g.rackLen / 2;
function pinionLightening(pinion) {
  const holes = [];
  const rf = pinion.rootRadius;
  if (rf < 16) return holes;
  const rr = (rf + 5) / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    holes.push(circle(rr * Math.cos(a), rr * Math.sin(a), Math.max(1.4, rf * 0.11), 18));
  }
  return holes;
}

/* ------------------------------------------------------------------ motion */

/** The page's t sweeps the rack through its stroke; the pinion angle follows. */
export function pose(p, t = 0) {
  const g = geom(p);
  const s = ((t / 360) % 1 + 1) % 1;          // 0 → 1 across the stroke
  const dx = -g.travel / 2 + s * g.travel;     // rack travel
  const rot = -dx / g.rp;                      // rolling without slip
  return {
    frame: {},
    pinion: { rot },
    rack: { dx },
    cap: {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const s = ((t / 360) % 1 + 1) % 1;
  const travel = -g.travel / 2 + s * g.travel;
  const angle = (-travel / g.rp) / (Math.PI / 180);
  return [
    { label: 'Pinion', value: (angle % 360).toFixed(0), unit: '°' },
    { label: 'Rack', value: travel.toFixed(1), unit: 'mm' },
    { label: 'Pitch Ø', value: (g.rp * 2).toFixed(1), unit: 'mm' },
    { label: 'Per turn', value: (Math.PI * 2 * g.rp).toFixed(1), unit: 'mm' },
    { label: 'Teeth', value: p.teeth },
    { label: 'Module', value: p.module.toFixed(2) },
  ];
}

export const steps = [
  {
    title: 'One tooth enters, the next leaves',
    text: 'At any moment one or two teeth are carrying the load. Watch the contact point travel along the tooth flank as the pinion turns — that rolling is what makes it smooth.',
    t: 180,
    parts: ['pinion', 'rack'],
  },
  {
    title: 'The pitch circle is a ruler',
    text: 'The contact sits on the pitch circle, so the rack moves exactly as far as that circle rolls. One full turn is the circumference: π × pitch diameter.',
    t: 260,
    parts: ['pinion'],
  },
  {
    title: 'The keepers do the guiding',
    text: 'Two printed windows hold the rack against the pinion. They are 0.4 mm larger than the rack, and they never touch the teeth.',
    t: 120,
    parts: ['frame', 'rack'],
  },
  {
    title: 'Fewer teeth, more travel per turn',
    text: 'Drop to 12 teeth and the pinion gets small: each turn pushes the rack less far, but the torque goes up in the same proportion. Gearing is a trade, never a free gain.',
    t: 180,
    parts: ['pinion'],
    set: { teeth: 12 },
  },
  {
    title: 'A bigger module carries more load',
    text: 'Module 3 makes every tooth taller and thicker. The pinion grows, travel per turn grows, and the teeth stop being delicate.',
    t: 180,
    parts: ['pinion', 'rack'],
    set: { teeth: 18, module: 3 },
  },
];
