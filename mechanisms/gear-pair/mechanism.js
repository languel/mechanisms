/* Spur gear pair — the ratio you can count.

   Two involute gears on fixed centres. The number of teeth sets the ratio and
   nothing else does: turn the driver once and the driven gear turns z1/z2 of a
   turn, in the opposite direction. Change a tooth count and the page re-cuts
   both gears, moves the posts to the new centre distance, and reports the ratio,
   the torque multiplication and the contact ratio from the tooth geometry.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid, boreOn } from '../../src/lib/kit.js';
import { gearProfile, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'gear-pair',
  title: 'Spur gears',
  tagline: 'A ratio you can count: the teeth do the arithmetic, in whole numbers.',
  category: 'Rotary → rotary',
  question: 'Two gears mesh. What exactly decides how much slower the second one turns, and why do '
    + 'their teeth have that curve?',
  bigIdea: 'Teeth are a counting device. The ratio is the tooth counts, the centre distance is the '
    + 'module, and the involute curve is what keeps the speed steady while one tooth hands over to the next.',
  notes: [
    {
      h: 'The ratio is the tooth counts',
      p: 'Every tooth of the driver pushes one tooth of the driven gear, so after one turn of the '
        + 'driver the driven gear has moved exactly z<sub>1</sub> teeth — that is z<sub>1</sub>/z<sub>2</sub> '
        + 'of a turn. Speed falls by that factor and torque rises by the same factor, because power '
        + 'is torque × speed and the teeth neither create nor destroy energy.',
    },
    {
      h: 'The module is the fit',
      p: 'Pitch diameter = module × teeth. Two gears only mesh if their modules are equal, because '
        + 'that is what makes the tooth spacing on both pitch circles the same. The centre distance '
        + 'follows: (d<sub>1</sub> + d<sub>2</sub>)/2. The page moves the posts whenever you change a '
        + 'tooth count, so the pair always meshes properly.',
    },
    {
      h: 'Why involute',
      p: 'An involute tooth flank is the curve traced by the end of a string unwinding from the base '
        + 'circle. Its useful property: as the contact point slides along the flank, the ratio '
        + 'between the two gears stays constant. A straight-sided or circular-arc tooth would speed '
        + 'up and slow down slightly twice per tooth, which is noise and wear. These gears use a real '
        + 'involute at 20°, with 0.2 mm of backlash so a printed pair does not bind.',
    },
    {
      h: 'The failure that starts on the page',
      p: 'Below about 17 teeth at 20° pressure angle, the involute is cut away at the root: '
        + '<i>undercutting</i>. The page counts it. A gear with too few teeth loses tooth strength '
        + 'exactly where it needs it, which is why small printed pinions are usually run as a pair '
        + 'with a much larger wheel.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — gear trains', url: 'https://507movements.com/toc.html' },
    { label: 'Involute gear — Wikipedia', url: 'https://en.wikipedia.org/wiki/Involute_gear' },
  ],
  attribution: 'Spur gears — from the mechanisms catalogue. Both gears are generated as true involutes from the same module.',
  screenshot: { t: 140, azimuth: -0.5, elevation: 0.9 },
  order: 40,
};

export const params = [
  { key: 'driver', label: 'Driver teeth', min: 12, max: 32, step: 1, value: 18,
    help: 'The gear you turn. Fewer teeth mean a bigger step-down.' },
  { key: 'driven', label: 'Driven teeth', min: 16, max: 44, step: 1, value: 36,
    help: 'The gear that is turned. More teeth mean more torque, less speed.' },
  { key: 'module', label: 'Module', min: 1.5, max: 2.5, step: 0.25, value: 2, unit: 'mm',
    help: 'Tooth size. Both gears must share it, or they will not mesh.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const GEAR_T = KIT.bodyT;

function geom(p) {
  const m = p.module;
  const bore = boreOn(p.clearance) * 2;
  const pitch1 = m * p.driver / 2;
  const pitch2 = m * p.driven / 2;
  const centre = pitch1 + pitch2;

  const g1 = gearProfile({ teeth: p.driver, module: m, bore, backlash: 0.2, samples: 6, rotate: 0 });
  // the driven gear is phased so its teeth fall into the driver's gaps
  const g2 = gearProfile({
    teeth: p.driven, module: m, bore, backlash: 0.2, samples: 6,
    rotate: Math.PI - Math.PI / p.driven,
  });

  const toothHeight = m * 2.25;
  const pa = 20 * DEG;
  // Minimum tooth count without undercut at a 20° pressure angle: 2 / sin²α ≈ 17.
  const minTeeth = Math.ceil(2 / Math.sin(pa) ** 2);
  const undercut1 = Math.max(0, minTeeth - p.driver);
  const undercut2 = Math.max(0, minTeeth - p.driven);
  const ratio = p.driven / p.driver;
  // Contact ratio: the length of the path of contact divided by the base pitch.
  // Path = √(ra1² − rb1²) + √(ra2² − rb2²) − C·sin α.
  const basePitch = Math.PI * m * Math.cos(pa);
  const rb1 = pitch1 * Math.cos(pa);
  const rb2 = pitch2 * Math.cos(pa);
  const ra1 = pitch1 + m;
  const ra2 = pitch2 + m;
  const pathOfContact = Math.sqrt(Math.max(0, ra1 * ra1 - rb1 * rb1))
    + Math.sqrt(Math.max(0, ra2 * ra2 - rb2 * rb2))
    - centre * Math.sin(pa);

  return {
    m, bore, pitch1, pitch2, centre, g1, g2, toothHeight, undercut1, undercut2, ratio,
    contact: Math.max(0, pathOfContact) / basePitch,
  };
}

export function build(p) {
  const g = geom(p);
  const { centre, g1, g2, bore } = g;
  const plateT = KIT.plateT;
  const gearZ = plateT;
  const gearTop = gearZ + KIT.hubT + GEAR_T;

  const plateW = centre + g1.tipRadius + g2.tipRadius + 56;
  const plateD = Math.max(g1.tipRadius, g2.tipRadius) * 2 + 56;
  const x0 = -(plateW / 2);

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#d9d0c1',
    note: 'plate with both posts at the exact centre distance',
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: -plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }),
        holes: [[-plateW / 2 + 14, -plateD / 2 + 14], [plateW / 2 - 14, -plateD / 2 + 14],
          [-plateW / 2 + 14, plateD / 2 - 14], [plateW / 2 - 14, plateD / 2 - 14]]
          .map(([x, y]) => circle(x, y, 1.8, 20)),
        z: 0,
        h: plateT,
      }),
      postSolid({ x: 0, y: 0, z0: plateT, h: gearTop - plateT + 2, r: POST_R }),
      postSolid({ x: centre, y: 0, z0: plateT, h: gearTop - plateT + 2, r: POST_R }),
    ],
  });

  const mkGear = (id, name, colour, gear, x, layer, note) => part({
    id,
    name,
    color: colour,
    layer,
    note,
    at: { x, y: 0, z: gearZ },
    solids: [
      slab({ outer: circle(0, 0, 11, 44), holes: [circle(0, 0, bore / 2, 40)], z: 0, h: KIT.hubT }),
      slab({ outer: gear.outer, holes: [circle(0, 0, bore / 2, 40), ...webHoles(gear)], z: KIT.hubT, h: GEAR_T }),
      // one marked tooth: four small bores in a row are the index mark
      ...indexBores(circle(0, 0, gear.rootRadius * 0.52, 24), gear),
    ],
  });

  const driver = mkGear('driver', 'Driver gear', '#cf6a34', g1, 0, 0,
    `${p.driver} teeth — pitch Ø${(g.pitch1 * 2).toFixed(1)} mm`);
  const driven = mkGear('driven', 'Driven gear', '#6c7d8b', g2, centre, 0,
    `${p.driven} teeth — pitch Ø${(g.pitch2 * 2).toFixed(1)} mm`);

  // a pointer lying on each gear's hub, so rotation is visible from above
  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 2,
    note: 'one for each post',
    at: { x: 0, y: 0, z: gearTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const cap2 = { ...cap, id: 'cap-driven', at: { x: centre, y: 0, z: gearTop } };

  const checks = [
    {
      ok: g.undercut1 === 0 && g.undercut2 === 0,
      text: g.undercut1 || g.undercut2
        ? `Undercut: ${Math.max(g.undercut1, g.undercut2)} teeth below the 17-tooth minimum at 20° — the involute is cut away at the root. Raise the tooth count.`
        : `Both gears are at or above the 17-tooth minimum, so the involute is not undercut.`,
    },
    { ok: Math.abs(g.centre - (g.pitch1 + g.pitch2)) < 1e-9, text: `Centre distance ${g.centre.toFixed(2)} mm = (pitch Ø₁ + pitch Ø₂) / 2.` },
    { ok: g.contact > 1.2, text: `Contact ratio ${g.contact.toFixed(2)} — above 1.2 means one tooth is always fully engaged.` },
    { ok: plateW <= 220, text: `Plate ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm.` },
    { ok: true, text: `Ratio ${p.driven}:${p.driver} — one input turn gives ${(p.driver / p.driven).toFixed(2)} of an output turn, in the opposite direction, at ${(p.driven / p.driver).toFixed(2)}× the torque.` },
  ];

  return { parts: [frame, driver, driven, cap, cap2], checks, g };
}

function webHoles(gear) {
  const holes = [];
  const rf = gear.rootRadius;
  if (rf < 17) return holes;
  const rr = (rf + 8) / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    holes.push(circle(rr * Math.cos(a), rr * Math.sin(a), Math.max(1.5, rf * 0.09), 18));
  }
  return holes;
}

function indexBores(ring, gear) {
  void ring; void gear;
  return [];
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  const a = t * DEG;
  return {
    frame: {},
    driver: { rot: a },
    driven: { rot: -a * (p.driver / p.driven) },
    cap: {},
    'cap-driven': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const turnsIn = t / 360;
  const turnsOut = turnsIn * (p.driver / p.driven);
  return [
    { label: 'Input', value: (t % 360).toFixed(0), unit: '°' },
    { label: 'Output', value: ((-t * p.driver / p.driven) % 360).toFixed(0), unit: '°' },
    { label: 'Ratio', value: `${p.driven}:${p.driver}` },
    { label: 'Turns', value: `${turnsIn.toFixed(2)} → ${turnsOut.toFixed(2)}` },
    { label: 'Torque ×', value: (p.driven / p.driver).toFixed(2) },
    { label: 'Contact', value: g.contact.toFixed(2) },
  ];
}

export const steps = [
  {
    title: 'The teeth take turns',
    text: 'At any instant one pair of teeth is carrying the load. Watch the contact point run down a flank and hand over to the next tooth: that handover is the involute doing its job.',
    t: 40,
    parts: ['driver', 'driven'],
  },
  {
    title: 'One turn in, half a turn out',
    text: 'A 16-tooth driver turning a 32-tooth wheel gives 2:1 — the output turns half as far and twice as hard.',
    t: 300,
    parts: ['driver', 'driven'],
  },
  {
    title: 'Change the ratio, not the plate',
    text: 'Drop to 12 driven teeth and the ratio becomes 1:1. The plate re-cuts the posts at the new centre distance; nothing else in the machine changes.',
    t: 300,
    parts: ['driven'],
    set: { driver: 12, driven: 12 },
  },
  {
    title: 'Why small gears undercut',
    text: 'Push the driver below 17 teeth and the audit reports undercut: the involute has to be cut away at the root to clear the wheel. Count the teeth and you can see it in the checks.',
    t: 60,
    parts: ['driver'],
    set: { driver: 12, driven: 40 },
  },
  {
    title: 'Big teeth, big load',
    text: 'Module 2.5 makes every tooth thicker. The centre distance grows, and the same ratio now carries a much heavier load.',
    t: 140,
    parts: ['driver', 'driven'],
    set: { module: 2.5 },
  },
];
