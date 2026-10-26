/* Spur gear pair — the ratio you can count (507 Mechanical Movements #127).

   Two involute gears on fixed centres. The number of teeth sets the ratio and
   nothing else does: turn the driver once and the driven gear turns z1/z2 of a
   turn, in the opposite direction. Change a tooth count and the page re-cuts
   both gears, moves the posts to the new centre distance, and reports the ratio,
   the torque multiplication and the contact ratio from the tooth geometry.
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid, boreOn, SHAFT_OPTIONS, shaftSpec } from '../../src/lib/kit.js';
import { gearProfile, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'gear-pair',
  title: 'Spur gears',
  movement: '507 Movements #127',
  motorMount: { partId: 'driver', label: 'Motor / Servo Input Shaft', direction: 'CCW' },
  tagline: 'A ratio you can count: the teeth do the arithmetic, in whole numbers.',
  category: 'Rotary → rotary',
  question: 'Two gears mesh. What exactly decides how much slower the second one turns, and why do '
    + 'their teeth have that curve?',
  bigIdea: 'Teeth are a counting device. The ratio is the tooth counts, the centre distance is set by '
    + 'the module, and the involute curve keeps the angular velocity ratio constant while one tooth hands over to the next.',
  notes: [
    {
      h: 'The ratio is the tooth counts',
      p: 'Every tooth of the driver pushes one tooth of the driven gear, so after one full turn of the '
        + 'driver the driven gear has advanced by exactly <i>z</i><sub>1</sub> teeth — which is '
        + '<i>z</i><sub>1</sub>/<i>z</i><sub>2</sub> of a turn. Speed scales by <i>z</i><sub>1</sub>/<i>z</i><sub>2</sub> '
        + 'and torque scales by <i>z</i><sub>2</sub>/<i>z</i><sub>1</sub>, because mechanical power '
        + '<i>P</i> = τ · ω is conserved across the mesh.',
    },
    {
      h: 'The module is the contract',
      p: 'Pitch diameter <i>d</i> = <i>m</i> · <i>z</i>. Two gears only mesh if their modules <i>m</i> '
        + 'and pressure angles α match, because the circular pitch π · <i>m</i> on both pitch circles '
        + 'must be identical. Their centre distance is fixed at <i>C</i> = (<i>d</i><sub>1</sub> + <i>d</i><sub>2</sub>)/2. '
        + 'When you change a tooth count, the baseplate re-spaces both posts to the exact new centre distance.',
    },
    {
      h: 'Why the tooth flank is an involute',
      p: 'An involute curve is the path traced by the end of a taut string unwinding from a base circle. '
        + 'Its magic property (the fundamental law of gearing): the common normal at the contact point '
        + 'always passes through the fixed pitch point <i>P</i> on the line of centres, at a constant '
        + '20° pressure angle. That keeps the speed ratio rock-steady even if the centre distance shifts slightly.',
    },
    {
      h: 'Undercutting below 17 teeth',
      p: 'At a 20° pressure angle, the minimum tooth count without root interference is '
        + '2 / sin²(20°) ≈ 17 teeth. Below 17 teeth, the mating tooth tip sweeps inside the base circle '
        + 'and carves away the root (<i>undercutting</i>), weakening the tooth. The live checks warn '
        + 'whenever either gear drops below 17 teeth.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Spur gear train (#127)', url: 'https://507movements.com/mm_127.html' },
    { label: 'Involute gear kinematics — Wikipedia', url: 'https://en.wikipedia.org/wiki/Involute_gear' },
  ],
  attribution: 'Spur gears — true 20° involute profiles with 0.2 mm backlash and integral finger crank knob.',
  screenshot: { t: 35, azimuth: -0.62, elevation: 0.72 },
  order: 10,
};

export const params = [
  { key: 'driver', label: 'Driver teeth (z₁)', min: 12, max: 32, step: 1, value: 18,
    help: 'Input gear coupled to the motor or finger knob. Fewer teeth increase the reduction ratio.' },
  { key: 'driven', label: 'Driven teeth (z₂)', min: 16, max: 44, step: 1, value: 36,
    help: 'Output gear. More teeth multiply output torque and reduce speed.' },
  { key: 'module', label: 'Module (m)', min: 1.5, max: 2.5, step: 0.25, value: 2, unit: 'mm',
    help: 'Tooth size parameter (d = m × z). Both meshing gears must share the same module.' },
  { key: 'shaft', label: 'Driver motor shaft', kind: 'choice', value: 'post',
    options: SHAFT_OPTIONS,
    help: 'Cuts the driver gear bore to fit a NEMA 17 D-shaft, N20 gearmotor, SG90/MG996R servo spline, or baseplate post.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const GEAR_T = KIT.bodyT;

function geom(p) {
  const m = p.module;
  const bore = boreOn(p.clearance) * 2;
  const shaft = shaftSpec(p.shaft || 'post', p.clearance);
  const pitch1 = (m * p.driver) / 2;
  const pitch2 = (m * p.driven) / 2;
  const centre = pitch1 + pitch2;
  const x1 = -centre / 2;
  const x2 = centre / 2;

  const g1 = gearProfile({ teeth: p.driver, module: m, bore, backlash: 0.2, samples: 6, rotate: 0 });
  // Driven gear is phased so a tooth gap faces the driver's tooth along the -x line of centres
  const g2 = gearProfile({
    teeth: p.driven, module: m, bore, backlash: 0.2, samples: 6,
    rotate: Math.PI - Math.PI / p.driven,
  });

  const toothHeight = m * 2.25;
  const pa = 20 * DEG;
  const minTeeth = Math.ceil(2 / Math.sin(pa) ** 2);
  const undercut1 = Math.max(0, minTeeth - p.driver);
  const undercut2 = Math.max(0, minTeeth - p.driven);
  const ratio = p.driven / p.driver;

  const basePitch = Math.PI * m * Math.cos(pa);
  const rb1 = pitch1 * Math.cos(pa);
  const rb2 = pitch2 * Math.cos(pa);
  const ra1 = pitch1 + m;
  const ra2 = pitch2 + m;
  const pathOfContact = Math.sqrt(Math.max(0, ra1 * ra1 - rb1 * rb1))
    + Math.sqrt(Math.max(0, ra2 * ra2 - rb2 * rb2))
    - centre * Math.sin(pa);

  return {
    m, bore, shaft, pitch1, pitch2, centre, x1, x2, g1, g2, toothHeight, undercut1, undercut2, ratio,
    contact: Math.max(0, pathOfContact) / basePitch,
  };
}

export function build(p) {
  const g = geom(p);
  const { centre, x1, x2, g1, g2, bore, shaft } = g;
  const plateT = KIT.plateT;
  const gearZ = plateT;
  const gearTop = gearZ + KIT.hubT + GEAR_T;

  const leftSpan = Math.abs(x1) + g1.tipRadius + 18;
  const rightSpan = Math.abs(x2) + g2.tipRadius + 18;
  const halfX = Math.max(leftSpan, rightSpan);
  const plateW = Math.min(218, halfX * 2);
  const plateD = Math.min(218, Math.max(g1.tipRadius, g2.tipRadius) * 2 + 34);
  const x0 = -plateW / 2;

  const mounts = [
    [-plateW / 2 + 11, -plateD / 2 + 11],
    [plateW / 2 - 11, -plateD / 2 + 11],
    [-plateW / 2 + 11, plateD / 2 - 11],
    [plateW / 2 - 11, plateD / 2 - 11],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  // If a direct motor shaft is chosen, open a pass-through clearance hole in the baseplate at x1 so the motor shaft can enter from below!
  const frameHoles = [...mounts];
  if (!shaft.hasFramePost) {
    frameHoles.push(circle(x1, 0, shaft.postR + 1.8, 32));
  }

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#ece6da',
    note: `plate with axle centres at C = ${centre.toFixed(1)} mm (${shaft.label} on driver)`,
    explosion: [0, 0, 0],
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: -plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }),
        holes: frameHoles,
        z: 0,
        h: plateT,
      }),
      ...(shaft.hasFramePost
        ? [postSolid({ x: x1, y: 0, z0: plateT, h: gearTop - plateT + 2, r: POST_R })]
        : [postSolid({ x: x1, y: 0, z0: plateT, h: gearTop - plateT + 2, r: shaft.postR })]),
      postSolid({ x: x2, y: 0, z0: plateT, h: gearTop - plateT + 2, r: POST_R }),
    ],
  });

  // Driver gear has a raised finger knob near its rim so you can spin it by hand
  const knobOffset = Math.max(8.5, g1.rootRadius * 0.58);
  const knobR = Math.min(3.0, Math.max(2.0, (g1.rootRadius - 7.2) * 0.35));
  const hasKnob = g1.rootRadius > 13.5;

  const driverSolids = [
    slab({ outer: circle(0, 0, Math.max(9.6, shaft.hubR), 40), holes: [shaft.ring], z: 0, h: KIT.hubT }),
    slab({ outer: g1.outer, holes: [shaft.ring, ...webHoles(g1, hasKnob ? knobOffset : 0)], z: KIT.hubT, h: GEAR_T }),
  ];
  if (hasKnob) {
    driverSolids.push(slab({ outer: circle(-knobOffset, 0, knobR, 28), z: KIT.hubT + GEAR_T, h: 6.5 }));
  }

  const driver = part({
    id: 'driver',
    name: 'Driver gear',
    color: '#dcb038',
    layer: 1,
    explosion: [0, 0, 24],
    note: `${p.driver} teeth, pitch Ø${(g.pitch1 * 2).toFixed(1)} mm — ${shaft.note}`,
    at: { x: x1, y: 0, z: gearZ },
    solids: driverSolids,
  });

  const driven = part({
    id: 'driven',
    name: 'Driven gear',
    color: '#5aa2d4',
    layer: 1,
    explosion: [0, 0, 24],
    note: `${p.driven} teeth, pitch Ø${(g.pitch2 * 2).toFixed(1)} mm`,
    at: { x: x2, y: 0, z: gearZ },
    solids: [
      slab({ outer: circle(0, 0, 9.6, 40), holes: [circle(0, 0, bore / 2, 40)], z: 0, h: KIT.hubT }),
      slab({ outer: g2.outer, holes: [circle(0, 0, bore / 2, 40), ...webHoles(g2, 0)], z: KIT.hubT, h: GEAR_T }),
    ],
  });

  const cap = part({
    id: 'cap',
    printId: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 2,
    explosion: [0, 0, 48],
    note: 'snap-fit retainer caps for both pivot posts',
    at: { x: x1, y: 0, z: gearTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const cap2 = {
    ...cap,
    id: 'cap-driven',
    name: 'Driven cap',
    at: { x: x2, y: 0, z: gearTop },
    explosion: [0, 0, 48],
  };

  const checks = [
    {
      ok: g.undercut1 === 0 && g.undercut2 === 0,
      text: g.undercut1 || g.undercut2
        ? `Undercut warning: ${Math.max(g.undercut1, g.undercut2)} teeth below the 17-tooth minimum at 20° pressure angle.`
        : `Both gears ≥ 17 teeth: zero involute root undercut at 20° pressure angle.`,
    },
    { ok: Math.abs(g.centre - (g.pitch1 + g.pitch2)) < 1e-9, text: `Exact centre distance C = ${g.centre.toFixed(2)} mm = (d₁ + d₂) / 2.` },
    { ok: g.contact > 1.2, text: `Contact ratio ε = ${g.contact.toFixed(2)} (> 1.2 ensures continuous tooth-to-tooth handover).` },
    { ok: plateW <= 220, text: `Footprint ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm fits standard 220 mm print bed.` },
    { ok: true, text: `Ratio ${p.driven}:${p.driver} — 1 input turn → ${(p.driver / p.driven).toFixed(2)} output turns at ${(p.driven / p.driver).toFixed(2)}× torque.` },
  ];

  return { parts: [frame, driver, driven, cap, cap2], checks, g };
}

function webHoles(gear, avoidX = 0) {
  const holes = [];
  const rf = gear.rootRadius;
  if (rf < 16.5) return holes;
  const rr = (rf + 7.5) / 2;
  const holeR = Math.max(1.6, Math.min(4.2, rf * 0.11));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.62;
    const cx = rr * Math.cos(a), cy = rr * Math.sin(a);
    if (avoidX && Math.hypot(cx + avoidX, cy) < holeR + 4.2) continue;
    holes.push(circle(cx, cy, holeR, 20));
  }
  return holes;
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
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
    { label: 'Input θ₁', value: (((t % 360) + 360) % 360).toFixed(0), unit: '°' },
    { label: 'Output θ₂', value: ((-t * p.driver / p.driven) % 360).toFixed(0), unit: '°' },
    { label: 'Ratio i', value: `${p.driven}:${p.driver}` },
    { label: 'Centre C', value: g.centre.toFixed(1), unit: 'mm' },
    { label: 'Torque ×', value: (p.driven / p.driver).toFixed(2), unit: '×' },
    { label: 'Contact ε', value: g.contact.toFixed(2) },
  ];
}

export const steps = [
  {
    title: 'Pitch circles roll without slipping',
    text: 'Imagine two smooth cylinders of diameter d₁ = m·z₁ and d₂ = m·z₂ pressed together at the pitch point. The involute teeth force the gears to roll at the exact same speed ratio as those imaginary pitch circles, without slipping.',
    t: 40,
    parts: ['driver', 'driven'],
  },
  {
    title: '2:1 speed reduction & torque doubling',
    text: 'With an 18-tooth driver and a 36-tooth driven wheel, the ratio is 2:1. The driven gear turns at half the speed in the opposite direction, while delivering twice the turning torque.',
    t: 180,
    parts: ['driver', 'driven'],
    set: { driver: 18, driven: 36, module: 2 },
  },
  {
    title: 'Equal teeth (1:1) — reversing direction',
    text: 'Set both gears to 20 teeth and the ratio becomes 1:1. Speed and torque are unchanged, but the sense of rotation reverses across the mesh.',
    t: 240,
    parts: ['driver', 'driven'],
    set: { driver: 20, driven: 20 },
  },
  {
    title: 'Why small pinions undercut below 17 teeth',
    text: 'Drop the driver to 12 teeth against a 40-tooth wheel. Below 17 teeth at 20° pressure angle, the involute profile is undercut at the root, trading tooth strength for a compact 3.33:1 reduction.',
    t: 60,
    parts: ['driver'],
    set: { driver: 12, driven: 40 },
  },
  {
    title: 'Coarser module for heavy loads',
    text: 'Increase module m to 2.5 mm. Every tooth grows taller and thicker (addendum = m, dedendum = 1.25m), and the centre distance expands proportionally.',
    t: 140,
    parts: ['driver', 'driven', 'frame'],
    set: { driver: 16, driven: 28, module: 2.5 },
  },
];
