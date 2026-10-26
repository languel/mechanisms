/* Belt and pulley drive — transmitting rotary motion across a span in the same
   sense of rotation (507 Mechanical Movements #157).

   Two flanged pulleys on fixed centres coupled by a closed loop belt and an
   eccentric tensioner idler. Unlike meshing gears — which reverse direction at
   every mesh and require their pitch circles to touch — an open belt drive turns
   both shafts in the same direction across an arbitrary centre distance C.
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid, boreOn, SHAFT_OPTIONS, shaftSpec } from '../../src/lib/kit.js';
import { arc, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'belt-pulley',
  title: 'Belt and pulley drive',
  movement: '507 Movements #157',
  motorMount: { partId: 'driver', label: 'Motor / Stepper Input Pulley', direction: 'CCW' },
  tagline: 'Span a distance without an intermediate gear train: a taut loop carries surface speed from one drum to another in the same direction.',
  category: 'Rotary → rotary',
  question: 'How do you transmit rotation across a long span without a chain of idler gears — and what decides how much torque a belt can carry before it slips?',
  bigIdea: 'Every point on an inextensible belt travels at the same linear speed v = ω₁·r₁ = ω₂·r₂. That locks the speed ratio to the pulley diameters while preserving rotation direction, and the Euler–Eytelwein capstan equation T₁/T₂ = e^(μ·θ) makes friction grow exponentially with the wrap angle θ.',
  notes: [
    {
      h: 'Same-direction rotation across any span',
      p: 'Two meshing spur gears always reverse direction and require large diameters to bridge a long centre distance. An <b>open belt</b> wraps around both pulleys in the same sense, so input and output rotate together (ω₂/ω₁ = <i>d</i>₁/<i>d</i>₂) while the centre distance <i>C</i> can be chosen independently of the ratio.',
    },
    {
      h: 'Wrap angle & the Capstan equation',
      p: 'On the smaller pulley, the belt touches an arc of angle θ<sub>wrap</sub> = 180° − 2·arcsin((<i>d</i>₂ − <i>d</i>₁)/(2<i>C</i>)). Maximum non-slip tension ratio follows Euler’s capstan law: <i>T</i><sub>tight</sub> / <i>T</i><sub>slack</sub> = <i>e</i><sup>μ·θ</sup>. Because θ sits in the exponent, even a modest increase in wrap angle dramatically boosts torque capacity.',
    },
    {
      h: 'Why an idler tensioner goes on the slack side',
      p: 'Pressing an idler roller against the outside of the <b>slack span</b> takes up belt stretch and Simultaneously increases the wrap angle θ on both pulleys without adding bending stress under peak tight-side tension.',
    },
    {
      h: 'Printing flexible TPU belts vs O-ring / GT2 belts',
      p: 'The included belt STL is sized for 95A TPU filament (or acts as a drop-in gauge for a standard 3 mm round polyurethane O-ring or 2GT timing belt loop). Flanged pulley rims keep the belt centred on the crown.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Belt & Pulley (#157)', url: 'https://507movements.com/mm_157.html' },
    { label: 'Belt drive & Euler–Eytelwein equation — Wikipedia', url: 'https://en.wikipedia.org/wiki/Belt_(mechanical)' },
  ],
  attribution: 'Belt and pulley drive — flanged driver/driven pulleys, slack-side tensioner idler, and tangent loop belt.',
  screenshot: { t: 40, azimuth: -0.60, elevation: 0.74 },
  order: 15,
};

export const params = [
  { key: 'd1', label: 'Driver pulley Ø (d₁)', min: 22, max: 44, step: 2, value: 28, unit: 'mm',
    help: 'Pitch diameter of the input pulley coupled to the motor.' },
  { key: 'd2', label: 'Driven pulley Ø (d₂)', min: 28, max: 68, step: 2, value: 52, unit: 'mm',
    help: 'Pitch diameter of the output pulley. Ratio i = d₂ / d₁.' },
  { key: 'span', label: 'Centre distance (C)', min: 58, max: 96, step: 2, value: 76, unit: 'mm',
    help: 'Axle-to-axle spacing between the two pulleys.' },
  { key: 'shaft', label: 'Driver motor shaft', kind: 'choice', value: 'post',
    options: SHAFT_OPTIONS,
    help: 'Cuts the driver pulley bore to match a NEMA 17 stepper, N20 gearmotor, hobby servo spline, or baseplate post.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const PULLEY_T = KIT.bodyT;

function geom(p) {
  const r1 = p.d1 / 2;
  const r2 = p.d2 / 2;
  const C = Math.max(p.span, r1 + r2 + 14);
  const x1 = -C / 2;
  const x2 = C / 2;
  const bore = boreOn(p.clearance);
  const shaft = shaftSpec(p.shaft || 'post', p.clearance);

  // Tangent angle beta: sin(beta) = (r2 - r1) / C
  const sinB = Math.max(-0.85, Math.min(0.85, (r2 - r1) / C));
  const beta = Math.asin(sinB);
  const wrap1Deg = 180 - (2 * beta) / DEG;
  const wrap2Deg = 180 + (2 * beta) / DEG;

  // Exact open-belt pitch length:
  const beltLen = 2 * C * Math.cos(beta) + Math.PI * (r1 + r2) + 2 * beta * (r2 - r1);
  const ratio = p.d2 / p.d1;

  // Idler roller sits near the slack (bottom) span
  const idlerR = 7.5;
  const beltT = 2.4;
  const midBottomY = -((r1 + r2) / 2) * Math.cos(beta);
  const idlerX = -4;
  const idlerY = midBottomY - beltT - idlerR - 0.6;

  return {
    r1, r2, C, x1, x2, bore, shaft, beta, wrap1Deg, wrap2Deg, beltLen, ratio,
    idlerR, idlerX, idlerY, beltT,
    pulleyTop: KIT.plateT + KIT.hubT + PULLEY_T,
  };
}

/** Closed tangent-arc stadium ring at radius r1 + dr around (x1,0) and r2 + dr around (x2,0). */
function tangentBeltRing(x1, r1, x2, r2, beta) {
  const aTop = Math.PI / 2 + beta;
  const aBot = (3 * Math.PI) / 2 - beta;
  // Left pulley arc from top tangent CCW around -x to bottom tangent
  const leftArc = arc(x1, 0, r1, aTop, aBot, 28);
  // Right pulley arc from bottom tangent CCW around +x to top tangent
  const rightArc = arc(x2, 0, r2, aBot - Math.PI * 2, aTop, 32);
  return [...leftArc, ...rightArc];
}

function pulleyGrooveHoles(r, boreRing, avoidX = 0) {
  const holes = [boreRing];
  if (r < 17) return holes;
  const ringR = (r + 7.5) * 0.5;
  const holeR = Math.min(3.8, (r - 10) * 0.2);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const cx = ringR * Math.cos(a), cy = ringR * Math.sin(a);
    if (avoidX && Math.hypot(cx - avoidX, cy) < holeR + 4.0) continue;
    holes.push(circle(cx, cy, holeR, 20));
  }
  return holes;
}

export function build(p) {
  const g = geom(p);
  const { r1, r2, C, x1, x2, bore, shaft, beta, idlerR, idlerX, idlerY, beltT } = g;
  const plateT = KIT.plateT;

  const leftEdge = x1 - r1 - 18;
  const rightEdge = x2 + r2 + 18;
  const plateW = Math.min(218, rightEdge - leftEdge);
  const yMax = Math.max(r1, r2) + 18;
  const yMin = Math.min(-Math.max(r1, r2) - 18, idlerY - idlerR - 12);
  const plateD = Math.min(200, yMax - yMin);
  const x0 = (leftEdge + rightEdge) / 2 - plateW / 2;
  const y0 = (yMax + yMin) / 2 - plateD / 2;

  const mounts = [
    [x0 + 11, y0 + 11],
    [x0 + plateW - 11, y0 + 11],
    [x0 + 11, y0 + plateD - 11],
    [x0 + plateW - 11, y0 + plateD - 11],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#ece6da',
    explosion: [0, 0, 0],
    note: `baseplate with pulley posts at C = ${C.toFixed(1)} mm (${shaft.label} on driver) and slack-side tensioner post`,
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: y0, w: plateW, h: plateD, r: 7, n: 6 }),
        holes: mounts,
        z: 0,
        h: plateT,
      }),
      postSolid({ x: x1, y: 0, z0: plateT, h: g.pulleyTop - plateT + 2, r: shaft.hasFramePost ? POST_R : shaft.postR }),
      postSolid({ x: x2, y: 0, z0: plateT, h: g.pulleyTop - plateT + 2, r: POST_R }),
      postSolid({ x: idlerX, y: idlerY, z0: plateT, h: g.pulleyTop - plateT + 2, r: POST_R }),
    ],
  });

  // Driver pulley with top crank knob + alignment spoke holes
  const knobX = -Math.max(6.5, r1 * 0.52);
  const driverSolids = [
    slab({ outer: circle(0, 0, Math.max(9.2, shaft.hubR), 40), holes: [shaft.ring], z: 0, h: KIT.hubT }),
    slab({
      outer: circle(0, 0, r1, 56),
      holes: pulleyGrooveHoles(r1, shaft.ring, knobX),
      z: KIT.hubT,
      h: PULLEY_T,
    }),
    slab({ outer: circle(knobX, 0, 2.5, 24), z: KIT.hubT + PULLEY_T, h: 5.5 }),
  ];

  const driver = part({
    id: 'driver',
    name: 'Driver pulley',
    color: '#dcb038',
    layer: 1,
    explosion: [0, 0, 20],
    note: `Ø${p.d1} mm pitch drum — ${shaft.note}`,
    at: { x: x1, y: 0, z: plateT },
    solids: driverSolids,
  });

  const driven = part({
    id: 'driven',
    name: 'Driven pulley',
    color: '#5aa2d4',
    layer: 1,
    explosion: [0, 0, 20],
    note: `Ø${p.d2} mm output drum — turns in the same sense at 1:${g.ratio.toFixed(2)} speed`,
    at: { x: x2, y: 0, z: plateT },
    solids: [
      slab({ outer: circle(0, 0, 9.6, 40), holes: [circle(0, 0, bore, 40)], z: 0, h: KIT.hubT }),
      slab({
        outer: circle(0, 0, r2, 64),
        holes: pulleyGrooveHoles(r2, circle(0, 0, bore, 40), r2 * 0.55),
        z: KIT.hubT,
        h: PULLEY_T,
      }),
      // Visual rotation witness boss on the driven pulley
      slab({ outer: circle(r2 * 0.55, 0, 2.6, 20), z: KIT.hubT + PULLEY_T, h: 2.4 }),
    ],
  });

  // Tensioner idler roller on the slack side
  const idler = part({
    id: 'idler',
    name: 'Tensioner idler',
    color: '#82c0e4',
    layer: 1,
    explosion: [0, -10, 20],
    note: 'slack-side tensioner roller that takes up belt stretch and increases wrap angle',
    at: { x: idlerX, y: idlerY, z: plateT },
    solids: [
      slab({ outer: circle(0, 0, 6.2, 32), holes: [circle(0, 0, bore, 32)], z: 0, h: KIT.hubT }),
      slab({ outer: circle(0, 0, idlerR, 40), holes: [circle(0, 0, bore, 32)], z: KIT.hubT, h: PULLEY_T }),
    ],
  });

  // Flexible TPU / elastomer belt loop wrapping tangentially around both pulleys
  const beltInner = tangentBeltRing(x1, r1 + 0.15, x2, r2 + 0.15, beta);
  const beltOuter = tangentBeltRing(x1, r1 + 0.15 + beltT, x2, r2 + 0.15 + beltT, beta);
  const belt = part({
    id: 'belt',
    name: 'Drive belt loop (TPU)',
    material: 'TPU 95A / O-ring',
    color: '#489e8b',
    layer: 2,
    explosion: [0, 0, 36],
    note: `closed loop length L = ${g.beltLen.toFixed(1)} mm (print in 95A TPU or substitute Ø3 mm O-ring)`,
    at: { x: 0, y: 0, z: plateT + KIT.hubT },
    solids: [
      slab({
        outer: beltOuter,
        holes: [beltInner],
        z: 0.4,
        h: PULLEY_T - 0.8,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    printId: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 3,
    explosion: [0, 0, 52],
    note: 'retains driven pulley and idler roller on their posts',
    at: { x: x2, y: 0, z: g.pulleyTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const capIdler = {
    ...cap,
    id: 'cap-idler',
    name: 'Idler cap',
    at: { x: idlerX, y: idlerY, z: g.pulleyTop },
  };

  // Capstan tension ratio for mu = 0.35 (PLA/TPU friction coefficient)
  const capstanRatio = Math.exp(0.35 * (g.wrap1Deg * DEG));
  const checks = [
    { ok: g.wrap1Deg >= 135, text: `Driver wrap angle θ₁ = ${g.wrap1Deg.toFixed(1)}° (capstan tension ratio e^(μθ) = ${capstanRatio.toFixed(2)}× at μ = 0.35).` },
    { ok: C >= r1 + r2 + 12, text: `Clear span between pulley rims = ${(C - r1 - r2).toFixed(1)} mm.` },
    { ok: true, text: `Exact belt pitch length L = ${g.beltLen.toFixed(1)} mm; speed ratio i = ${g.ratio.toFixed(2)}:1 in the same direction.` },
    { ok: plateW <= 220, text: `Footprint ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm fits a standard 220 mm print bed.` },
  ];

  return { parts: [frame, driver, driven, idler, belt, cap, capIdler], checks, g };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const a1 = t * DEG;
  const a2 = a1 * (p.d1 / p.d2); // SAME direction as driver!
  const aIdler = -a1 * (g.r1 / g.idlerR); // outside idler turns opposite
  return {
    frame: {},
    driver: { rot: a1 },
    driven: { rot: a2 },
    idler: { rot: aIdler },
    belt: {},
    cap: {},
    'cap-idler': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const deg1 = ((t % 360) + 360) % 360;
  const deg2 = (((t * p.d1) / p.d2) % 360 + 360) % 360;
  const capstan = Math.exp(0.35 * g.wrap1Deg * DEG);
  return [
    { label: 'Driver θ₁', value: deg1.toFixed(0), unit: '°' },
    { label: 'Driven θ₂', value: deg2.toFixed(0), unit: '°' },
    { label: 'Ratio i', value: `${g.ratio.toFixed(2)}:1` },
    { label: 'Wrap θ₁', value: g.wrap1Deg.toFixed(0), unit: '°' },
    { label: 'Belt L', value: g.beltLen.toFixed(0), unit: 'mm' },
    { label: 'T₁/T₂ max', value: `${capstan.toFixed(2)}×` },
  ];
}

export const steps = [
  {
    title: 'Same-sense rotation via surface velocity matching',
    text: 'Because the belt does not cross between the two drums, both pulleys turn counterclockwise together. Every millimetre of belt paid out by the driver is taken up by the driven pulley.',
    t: 45,
    parts: ['driver', 'belt', 'driven'],
  },
  {
    title: 'Wrap angle on the smaller pulley sets the slip limit',
    text: 'Notice how the belt diverges from the smaller driver pulley toward the larger driven pulley, reducing the driver wrap angle below 180°. Friction capacity follows Euler’s capstan law T₁/T₂ = e^(μ·θ).',
    t: 120,
    parts: ['driver', 'belt'],
    set: { d1: 24, d2: 64 },
  },
  {
    title: '1:1 synchronous transfer across a long span',
    text: 'Set both pulleys to 36 mm diameter: wrap angle becomes a full 180° on both drums and shaft rotation is transferred 1:1 across 76 mm without intermediate gears.',
    t: 200,
    parts: ['driver', 'driven', 'belt'],
    set: { d1: 36, d2: 36 },
  },
  {
    title: 'Slack-side tensioner idler',
    text: 'The brass idler roller rides against the outside of the bottom slack span, taking up belt elongation without fighting the tight top span.',
    t: 290,
    parts: ['idler', 'belt'],
  },
];
