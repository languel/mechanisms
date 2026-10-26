/* Rack and pinion — rotation into straight-line travel (507 Mechanical Movements #81).

   The pitch line of the rack is tangent to the pinion's pitch circle, so every
   radian the pinion turns moves the rack by exactly one pitch radius. The rack
   is a gear unrolled into a straight bar with flat-sided trapezoidal teeth at
   the 20° pressure angle.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid, boreOn, SHAFT_OPTIONS, shaftSpec } from '../../src/lib/kit.js';
import { gearProfile, rackProfile } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'rack-pinion',
  title: 'Rack and pinion',
  movement: '507 Movements #81',
  motorMount: { partId: 'pinion', label: 'Stepper / Servo Input Shaft', direction: 'CW' },
  tagline: 'A gear unrolled into a straight line: every radian of the pinion is one pitch radius of travel.',
  category: 'Rotary ↔ linear',
  question: 'How does a gear drive something in a straight line at constant speed, and what has to match '
    + 'for a round gear and a flat bar to mesh smoothly?',
  bigIdea: 'The rack is a gear of infinite radius. Because its pitch circle is flat, its involute '
    + 'flanks become straight lines inclined at the 20° pressure angle, and one full turn of the pinion '
    + 'translates the rack by exact circumference π × d.',
  notes: [
    {
      h: 'An involute of infinite radius is a straight flank',
      p: 'Stretch a gear’s radius toward infinity: its pitch circle flattens into a straight <b>pitch line</b>, '
        + 'and its curved involute tooth flanks flatten into straight-sided trapezoids inclined at 20°. '
        + 'That is why a straight-sided rack meshes with a curved-tooth pinion with zero speed ripple.',
    },
    {
      h: 'Linear travel per turn = π · m · z',
      p: 'Because the pinion’s pitch circle rolls along the rack’s pitch line without slipping, one '
        + 'revolution of the pinion moves the rack by the pitch circumference <i>C</i> = π · <i>d</i> = '
        + 'π · <i>m</i> · <i>z</i>. Unlike a crank-and-slider, linear velocity is strictly proportional '
        + 'to shaft angular velocity across the entire stroke.',
    },
    {
      h: 'Resisting separating force with a back guide',
      p: 'Because the teeth meet at a 20° pressure angle, driving the rack with tangential force <i>F<sub>t</sub></i> '
        + 'also pushes the rack away from the pinion with radial separating force '
        + '<i>F<sub>r</sub></i> = <i>F<sub>t</sub></i> · tan(20°) ≈ 0.36 · <i>F<sub>t</sub></i>. '
        + 'The baseplate includes a full-length rear guide rail and two end keepers that counter that separating force.',
    },
    {
      h: 'Physical computing applications',
      p: 'Pair a rack and pinion with a continuous-rotation servo or a stepper motor to build linear '
        + 'actuators, pen plotters, syringe pumps, Z-axis lifts, and sliding doors where stroke length '
        + 'is limited only by how long you print the rack bar.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Rack and pinion (#81)', url: 'https://507movements.com/mm_081.html' },
    { label: 'Rack and pinion kinematics — Wikipedia', url: 'https://en.wikipedia.org/wiki/Rack_and_pinion' },
  ],
  attribution: 'Rack and pinion — matched 20° involute pinion and linear rack with rear guide channel and millimeter scale.',
  screenshot: { t: 210, azimuth: -0.58, elevation: 0.74 },
  order: 20,
};

export const params = [
  { key: 'module', label: 'Module (m)', min: 1.5, max: 3, step: 0.25, value: 2, unit: 'mm',
    help: 'Tooth size (pitch = π × m). Shared between the pinion and the rack.' },
  { key: 'teeth', label: 'Pinion teeth (z)', min: 12, max: 26, step: 1, value: 18,
    help: 'Sets the pitch diameter d = m × z and travel per turn π × d.' },
  { key: 'stroke', label: 'Rack stroke', min: 24, max: 80, step: 4, value: 56, unit: 'mm',
    help: 'Total linear travel of the rack between the end keepers.' },
  { key: 'shaft', label: 'Pinion motor shaft', kind: 'choice', value: 'post',
    options: SHAFT_OPTIONS,
    help: 'Cuts the pinion bore to fit a NEMA 17 stepper, N20 gearmotor, SG90/MG996R servo spline, or baseplate post.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const PINION_T = KIT.bodyT;
const RACK_H = 12;

function geom(p) {
  const m = p.module;
  const rp = (m * p.teeth) / 2;
  const bore = boreOn(p.clearance);
  const shaft = shaftSpec(p.shaft || 'post', p.clearance);
  const pinionY = rp * 0.45;
  const rackY = pinionY - rp; // rack pitch line is tangent to bottom of pinion pitch circle

  const pinion = gearProfile({
    teeth: p.teeth,
    module: m,
    bore: bore * 2,
    hub: KIT.hubT,
    backlash: 0.22,
    samples: 6,
    rotate: -Math.PI / 2, // tooth points straight down (-y) into rack gap at x = 0
  });
  const pinionR = pinion.tipRadius;

  const pitch = Math.PI * m;
  const halfTeeth = Math.ceil((p.stroke / 2 + 28) / pitch);
  const rackTeeth = halfTeeth * 2;
  const x0 = -halfTeeth * pitch; // ensures a tooth space sits right at x = 0
  const rack = rackProfile({
    teeth: rackTeeth,
    module: m,
    height: RACK_H,
    backlash: 0.22,
    x0,
  });
  const rackLen = rackTeeth * pitch;
  const bodyTop = rackY + rack.root;
  const bodyBottom = rackY - RACK_H;
  const travel = p.stroke;

  return {
    m, rp, bore, shaft, pinion, pinionR, pinionY, rack, rackY, rackLen, rackTeeth,
    bodyTop, bodyBottom, travel, x0,
    pinionTop: KIT.plateT + KIT.hubT + PINION_T,
  };
}

export function build(p) {
  const g = geom(p);
  const { rp, shaft, pinion, pinionY, rack, rackY, travel } = g;
  const plateT = KIT.plateT;
  const pinionZ = plateT;

  const half = travel / 2;
  const keeperX = half + 22;
  const plateW = Math.min(218, Math.max(168, g.rackLen + 26));
  const yTop = Math.max(54, pinionY + g.pinionR + 18);
  const yBot = Math.min(-54, rackY - RACK_H - 22);
  const plateD = Math.min(200, yTop - yBot);
  const yCenter = (yTop + yBot) / 2;

  const mounts = [
    [-plateW / 2 + 12, yCenter - plateD / 2 + 12],
    [plateW / 2 - 12, yCenter - plateD / 2 + 12],
    [-plateW / 2 + 12, yCenter + plateD / 2 - 12],
    [plateW / 2 - 12, yCenter + plateD / 2 - 12],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  // Millimetre ruler slots along the front edge of the baseplate
  const ticks = [];
  for (let i = 0; i <= travel; i += 5) {
    const major = i % 20 === 0;
    ticks.push(rect(-half + i - 0.55, rackY - RACK_H - 14, 1.1, major ? 4.5 : 2.6));
  }

  // Compact bridge keepers at either end of the stroke
  const tunnelY0 = rackY - RACK_H - 0.6;
  const tunnelY1 = rackY + rack.tip + 1.2;
  const rearPillarH = 4.8;
  const frontPillarH = 4.8;
  const keeperY0 = tunnelY0 - rearPillarH;
  const keeperY1 = tunnelY1 + frontPillarH;
  const pillarTop = KIT.hubT + PINION_T + 0.8;
  const keeperSolids = [
    slab({ outer: roundedRect({ x: -6, y: keeperY0 - rackY, w: 12, h: rearPillarH, r: 1.4, n: 3 }), z: 0, h: pillarTop }),
    slab({ outer: roundedRect({ x: -6, y: tunnelY1 - rackY, w: 12, h: frontPillarH, r: 1.4, n: 3 }), z: 0, h: pillarTop }),
    slab({ outer: roundedRect({ x: -6, y: keeperY0 - rackY, w: 12, h: keeperY1 - keeperY0, r: 1.8, n: 4 }), z: pillarTop, h: 3.6 }),
  ];

  // Rear guide wall supports the back of the rack along the stroke between the two end keepers
  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#ece6da',
    explosion: [0, 0, 0],
    note: `baseplate with pinion axis (${shaft.label}), rear rack guide wall and 5 mm travel scale`,
    solids: [
      slab({
        outer: roundedRect({ x: -plateW / 2, y: yCenter - plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }),
        holes: [...mounts, ...ticks],
        z: 0,
        h: plateT,
      }),
      // Rear guide wall that resists the 20° radial separating force
      slab({
        outer: roundedRect({ x: -keeperX + 6.3, y: keeperY0, w: (keeperX - 6.3) * 2, h: rearPillarH, r: 1.4, n: 4 }),
        z: plateT,
        h: KIT.hubT + PINION_T,
      }),
      postSolid({ x: 0, y: pinionY, z0: plateT, h: g.pinionTop - plateT + 2, r: shaft.hasFramePost ? POST_R : shaft.postR }),
    ],
  });

  const keeperL = part({
    id: 'keeper',
    printId: 'keeper',
    name: 'Rack keeper',
    qty: 2,
    color: '#82c0e4',
    layer: 2,
    explosion: [0, 0, 42],
    note: 'captive bridge guides at both ends of the rack',
    at: { x: -keeperX, y: rackY, z: plateT },
    solids: keeperSolids,
  });
  const keeperR = {
    ...keeperL,
    id: 'keeper-r',
    name: 'Right keeper',
    at: { x: keeperX, y: rackY, z: plateT },
    explosion: [0, 0, 42],
  };

  // Pinion with integral finger crank knob and selectable motor shaft bore
  const knobR = Math.max(8, g.pinion.rootRadius * 0.56);
  const pinionSolids = [
    slab({ outer: circle(0, 0, Math.max(9.8, shaft.hubR), 40), holes: [shaft.ring], z: 0, h: KIT.hubT }),
    slab({
      outer: pinion.outer,
      holes: [shaft.ring, ...pinionLightening(pinion, knobR)],
      z: KIT.hubT,
      h: PINION_T,
    }),
  ];
  if (g.pinion.rootRadius > 13.5) {
    pinionSolids.push(slab({ outer: circle(0, knobR, 2.6, 24), z: KIT.hubT + PINION_T, h: 6.5 }));
  }

  const pinionPart = part({
    id: 'pinion',
    name: 'Pinion gear',
    color: '#dcb038',
    layer: 1,
    explosion: [0, 0, 22],
    note: `${p.teeth} teeth, module ${p.module} mm — ${shaft.note}`,
    zOrder: 2,
    at: { x: 0, y: pinionY, z: pinionZ },
    solids: pinionSolids,
  });

  // Rack sits on a 1.6 mm sliding strip so its 6 mm tooth face aligns with the pinion's 6 mm face
  const rackPart = part({
    id: 'rack',
    name: 'Linear rack',
    color: '#5aa2d4',
    layer: 1,
    explosion: [0, -18, 22],
    note: `${g.rackTeeth} teeth, pitch ${(Math.PI * p.module).toFixed(2)} mm`,
    at: { x: 0, y: g.rackY, z: plateT },
    solids: [
      slab({
        outer: roundedRect({ x: g.x0 + 4, y: -RACK_H + 1.5, w: g.rackLen - 8, h: RACK_H - 3.5, r: 2, n: 4 }),
        holes: [circle(-24, -6.5, 2.2, 20), circle(24, -6.5, 2.2, 20)],
        z: 0,
        h: KIT.hubT,
      }),
      slab({
        outer: rack.outer,
        holes: [circle(-24, -6.5, 2.2, 20), circle(24, -6.5, 2.2, 20)],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 1,
    color: '#e7dfd0',
    layer: 3,
    explosion: [0, 0, 56],
    note: 'retains the pinion on its pivot post',
    at: { x: 0, y: pinionY, z: g.pinionTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });

  const travelPerTurn = Math.PI * 2 * rp;
  const checks = [
    { ok: p.teeth >= 12, text: `${p.teeth} teeth at module ${p.module} mm — pitch diameter d = ${(rp * 2).toFixed(1)} mm.` },
    { ok: rp > pinion.tipRadius - 3.5, text: `Pinion tip Ø${(pinion.tipRadius * 2).toFixed(1)} mm, root Ø${(pinion.rootRadius * 2).toFixed(1)} mm.` },
    { ok: keeperFits(g), text: 'Rear guide rail and end keepers clear the rack by 0.4 mm with zero tooth contact.' },
    { ok: travel <= g.rackLen - 36, text: `${travel} mm stroke on a ${g.rackLen.toFixed(0)} mm rack — teeth stay fully engaged.` },
    { ok: Math.abs(travelPerTurn - Math.PI * 2 * rp) < 1e-6, text: `1 full turn translates the rack by ${travelPerTurn.toFixed(1)} mm = π × d.` },
  ];

  return { parts: [frame, pinionPart, rackPart, keeperL, keeperR, cap], checks, g };
}

function keeperFits(g) {
  const pillarTop = KIT.hubT + PINION_T + 0.8;
  return pillarTop > g.rack.tip + 0.4;
}

function pinionLightening(pinion, avoidY = 0) {
  const holes = [];
  const rf = pinion.rootRadius;
  if (rf < 16) return holes;
  const rr = (rf + 5.5) / 2;
  const holeR = Math.max(1.4, rf * 0.1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    const cx = rr * Math.cos(a), cy = rr * Math.sin(a);
    if (avoidY && Math.hypot(cx, cy - avoidY) < holeR + 3.8) continue;
    holes.push(circle(cx, cy, holeR, 18));
  }
  return holes;
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  // Smooth reciprocating sweep across the rack stroke so you can watch both directions,
  // or linear mapping across 0..360°
  const u = ((t / 360) % 1 + 1) % 1;
  const tri = u < 0.5 ? u * 2 : (1 - u) * 2;
  const ease = 0.5 - 0.5 * Math.cos(Math.PI * tri);
  const dx = -g.travel / 2 + ease * g.travel;
  const rot = dx / g.rp; // bottom of pinion moves +dx when rotating +rot CCW
  return {
    frame: {},
    pinion: { rot },
    rack: { dx },
    keeper: {},
    'keeper-r': {},
    cap: {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const currentPose = pose(p, t);
  const dx = currentPose.rack.dx;
  const rotDeg = (currentPose.pinion.rot * 180) / Math.PI;
  const perTurn = Math.PI * 2 * g.rp;
  return [
    { label: 'Pinion θ', value: rotDeg.toFixed(0), unit: '°' },
    { label: 'Rack x', value: dx.toFixed(1), unit: 'mm' },
    { label: 'Pitch Ø', value: (g.rp * 2).toFixed(1), unit: 'mm' },
    { label: 'Travel / turn', value: perTurn.toFixed(1), unit: 'mm' },
    { label: 'Tooth pitch', value: (Math.PI * p.module).toFixed(2), unit: 'mm' },
    { label: 'Stroke', value: p.stroke, unit: 'mm' },
  ];
}

export const steps = [
  {
    title: 'Zero datum: tooth in gap at the pitch point',
    text: 'At mid-stroke (x = 0 mm), the pinion’s bottom tooth sits squarely in the centre gap of the rack. The rack’s pitch line is tangent to the pinion’s pitch circle at radius r = m·z/2.',
    t: 90,
    parts: ['pinion', 'rack'],
  },
  {
    title: 'Every radian gives one pitch radius of travel',
    text: 'As the pinion turns through angle θ (radians), the rack translates by s = r · θ. Read the travel off the 5 mm scale slots along the baseplate.',
    t: 180,
    parts: ['pinion', 'rack', 'frame'],
  },
  {
    title: 'Rear guide rail resists the 20° separating force',
    text: 'Because the involute flanks meet at 20°, pushing the rack sideways also pushes it downward with force F·tan(20°). The rear guide rail and end keepers hold the pitch line at the exact mesh depth.',
    t: 135,
    parts: ['frame', 'keeper', 'rack'],
  },
  {
    title: 'Bigger pinion = faster linear travel',
    text: 'Raise the pinion from 18 to 24 teeth. The pitch diameter jumps by 33%, so each revolution of the motor shaft moves the rack a third farther (at 25% less linear push force).',
    t: 180,
    parts: ['pinion', 'rack'],
    set: { teeth: 24, module: 2 },
  },
];
