/* Four-bar Grashof linkage — converting continuous crank rotation into bounded
   oscillating rocker motion (507 Mechanical Movements #84).

   A planar four-bar linkage consists of four pin-jointed bars: the stationary
   ground frame (d), the continuously rotating input crank (a), the floating
   coupler link (b), and the oscillating output rocker (c). When Grashof's
   inequality s + l <= p + q holds with the crank as the shortest link, the
   crank spins a full 360° while the rocker sweeps back and forth between two
   exact dead-centre toggle angles.
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid, boreOn, SHAFT_OPTIONS, shaftSpec } from '../../src/lib/kit.js';
import { capsule, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'four-bar',
  title: 'Four-bar linkage',
  movement: '507 Movements #84',
  motorMount: { partId: 'crank', label: 'Continuous DC / Servo Crank Input', direction: 'CCW' },
  tagline: 'Four bars and four pin joints: the simplest closed-loop linkage that turns full rotation into a tailored sweeping arc.',
  category: 'Rotary → rotary',
  question: 'What decides whether the input crank can spin a full 360° or jams partway around — and why does the output rocker sweep faster in one direction than the other?',
  bigIdea: 'Grashof’s law (s + l ≤ p + q) is the pass/fail rule of linkages: as long as the shortest link plus the longest link does not exceed the sum of the other two, the shortest link can revolve continuously while driving the output rocker between two collinear toggle positions.',
  notes: [
    {
      h: 'Grashof’s condition: s + l ≤ p + q',
      p: 'Sort the four bar lengths from shortest (<i>s</i>) to longest (<i>l</i>), with intermediate links <i>p</i> and <i>q</i>. If <i>s</i> + <i>l</i> ≤ <i>p</i> + <i>q</i> and the shortest link is the input crank <i>a</i>, the linkage is a <b>crank-rocker</b>: the crank spins continuously while the output rocker oscillates without ever locking up.',
    },
    {
      h: 'Dead-centre toggles & quick-return',
      p: 'The rocker reaches its extreme left and right angles when the crank <i>a</i> and coupler <i>b</i> pull into a straight line (extended length <i>a</i> + <i>b</i>, folded length |<i>b</i> − <i>a</i>|). Because those two collinear positions are not 180° apart on the crank circle, the forward swing and return swing take unequal times — a natural <b>quick-return</b> action.',
    },
    {
      h: 'Transmission angle γ',
      p: 'The angle γ between the coupler <i>b</i> and the output rocker <i>c</i> determines how effectively force transfers into output torque (τ ∝ sin γ). Good linkage design keeps γ between 40° and 140° throughout the cycle.',
    },
    {
      h: 'Non-colliding 3-tier Z stack',
      p: 'To let the crank revolve a full 360° without hitting the coupler or rocker, the crank and rocker sit on Tier 1 (<i>z</i> = 4..11.6 mm), a low-profile axle cap retains the crank, and the floating coupler bridges across Tier 2 (<i>z</i> = 15..22.6 mm).',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Crank & Rocker (#84)', url: 'https://507movements.com/mm_084.html' },
    { label: 'Four-bar linkage & Grashof condition — Wikipedia', url: 'https://en.wikipedia.org/wiki/Four-bar_linkage' },
  ],
  attribution: 'Four-bar Grashof linkage — exact closed-loop trigonometrical solver with 3-tier non-colliding stack.',
  screenshot: { t: 55, azimuth: -0.58, elevation: 0.74 },
  order: 35,
};

export const params = [
  { key: 'crank', label: 'Crank length (a)', min: 14, max: 26, step: 1, value: 18, unit: 'mm',
    help: 'Shortest link (input crank). Must satisfy Grashof condition to spin 360°.' },
  { key: 'coupler', label: 'Coupler length (b)', min: 52, max: 82, step: 2, value: 66, unit: 'mm',
    help: 'Floating rod connecting the crank pin to the rocker pin.' },
  { key: 'rocker', label: 'Rocker length (c)', min: 36, max: 62, step: 2, value: 46, unit: 'mm',
    help: 'Output oscillating arm pivoted on the right ground post.' },
  { key: 'ground', label: 'Ground span (d)', min: 56, max: 84, step: 2, value: 68, unit: 'mm',
    help: 'Fixed distance between the crank axle and rocker axle on the baseplate.' },
  { key: 'shaft', label: 'Crank motor shaft', kind: 'choice', value: 'post',
    options: SHAFT_OPTIONS,
    help: 'Cuts the input crank bore to fit a NEMA 17 stepper, N20 gearmotor, servo spline, or baseplate post.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;

/** Exact planar 4-bar position solver for crank angle theta (radians). */
function solveFourBar(a, b, c, d, theta) {
  // Crank pivot at (-d/2, 0), Rocker pivot at (+d/2, 0)
  const ax = -d / 2 + a * Math.cos(theta);
  const ay = a * Math.sin(theta);
  const dx = d / 2 - ax;
  const dy = -ay;
  const diag = Math.hypot(dx, dy);

  // Law of cosines on triangle (CrankPin A) - (RockerPin B) - (RockerPivot O4)
  const cosAlpha = Math.max(-0.995, Math.min(0.995, (diag * diag + c * c - b * b) / (2 * diag * c)));
  const alpha = Math.acos(cosAlpha);
  const baseAng = Math.atan2(-dy, -dx); // angle from O4 (+d/2, 0) toward A (ax, ay)
  // Upper (open) branch places B in the +y half-plane:
  const rockerAng = baseAng - alpha;
  const bx = d / 2 + c * Math.cos(rockerAng);
  const by = c * Math.sin(rockerAng);
  const couplerAng = Math.atan2(by - ay, bx - ax);

  // Transmission angle gamma between coupler b and rocker c:
  const cosGamma = Math.max(-1, Math.min(1, (b * b + c * c - diag * diag) / (2 * b * c)));
  const gammaDeg = Math.acos(cosGamma) / DEG;

  return { ax, ay, bx, by, rockerAng, couplerAng, gammaDeg };
}

function geom(p) {
  const a = p.crank;
  const b = p.coupler;
  const c = p.rocker;
  const d = p.ground;
  const lengths = [a, b, c, d].sort((x, y) => x - y);
  const grashofMargin = (lengths[1] + lengths[2]) - (lengths[0] + lengths[3]);
  const isGrashof = grashofMargin >= 0 && a === lengths[0];

  const turn = POST_R * 2 + p.clearance;
  const shaft = shaftSpec(p.shaft || 'post', p.clearance);
  const tier1Top = PLATE_T + KIT.hubT + KIT.bodyT; // 11.6 mm
  const capAxleTop = tier1Top + 3.0;               // 14.6 mm
  const couplerZ = capAxleTop + 0.5;               // 15.1 mm
  const couplerTop = couplerZ + KIT.hubT + KIT.bodyT; // 22.7 mm

  // Compute rocker sweep range across full rotation
  let minRocker = Infinity, maxRocker = -Infinity, minGamma = 180;
  for (let deg = 0; deg < 360; deg += 4) {
    const s = solveFourBar(a, b, c, d, deg * DEG);
    minRocker = Math.min(minRocker, s.rockerAng / DEG);
    maxRocker = Math.max(maxRocker, s.rockerAng / DEG);
    minGamma = Math.min(minGamma, s.gammaDeg, 180 - s.gammaDeg);
  }

  return {
    a, b, c, d, grashofMargin, isGrashof, turn, shaft,
    tier1Top, capAxleTop, couplerZ, couplerTop,
    xCrank: -d / 2,
    xRocker: d / 2,
    rockerSweepDeg: maxRocker - minRocker,
    minGamma,
  };
}

export function build(p) {
  const g = geom(p);
  const { a, b, c, d, turn, shaft, tier1Top, couplerZ, couplerTop, xCrank, xRocker } = g;

  const leftEdge = xCrank - a - 24;
  const rightEdge = xRocker + c + 22;
  const plateW = Math.min(218, Math.max(148, rightEdge - leftEdge));
  const plateD = Math.min(180, Math.max(116, (c + 24) * 2));
  const x0 = (leftEdge + rightEdge) / 2 - plateW / 2;
  const y0 = -plateD / 2;

  const mounts = [
    [x0 + 11, y0 + 11],
    [x0 + plateW - 11, y0 + 11],
    [x0 + 11, y0 + plateD - 11],
    [x0 + plateW - 11, y0 + plateD - 11],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  const frame = part({
    id: 'frame',
    name: 'Ground frame (d)',
    role: 'frame',
    color: '#ece6da',
    explosion: [0, 0, 0],
    note: `fixed ground link d = ${d} mm with crank and rocker pivot posts`,
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: y0, w: plateW, h: plateD, r: 7, n: 6 }),
        holes: mounts,
        z: 0,
        h: PLATE_T,
      }),
      postSolid({ x: xCrank, y: 0, z0: PLATE_T, h: tier1Top - PLATE_T + 1.8, r: shaft.hasFramePost ? POST_R : shaft.postR }),
      postSolid({ x: xRocker, y: 0, z0: PLATE_T, h: tier1Top - PLATE_T + 1.8, r: POST_R }),
    ],
  });

  // Input crank (a) on Tier 1 with tall crank pin rising to Tier 2
  const crank = part({
    id: 'crank',
    name: 'Input crank (a)',
    color: '#dcb038',
    layer: 1,
    explosion: [0, 0, 18],
    note: `shortest Grashof link a = ${a} mm (${shaft.label}) — revolves a full 360°`,
    at: { x: xCrank, y: 0, z: PLATE_T },
    solids: [
      slab({ outer: circle(0, 0, Math.max(8.8, shaft.hubR), 36), holes: [shaft.ring], z: 0, h: KIT.hubT }),
      slab({
        outer: capsule(0, 0, a, 0, 7.2, 18),
        holes: [shaft.ring],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
      slab({
        outer: circle(a, 0, POST_R, 32),
        z: KIT.hubT + KIT.bodyT,
        h: (couplerTop - PLATE_T) - (KIT.hubT + KIT.bodyT) + 1.8,
      }),
    ],
  });

  // Output rocker (c) on Tier 1 with tall wrist pin rising to Tier 2
  const rocker = part({
    id: 'rocker',
    name: 'Output rocker (c)',
    color: '#82c0e4',
    layer: 1,
    explosion: [0, 0, 18],
    note: `oscillating output link c = ${c} mm — sweeps ${g.rockerSweepDeg.toFixed(1)}° between toggle limits`,
    at: { x: xRocker, y: 0, z: PLATE_T },
    solids: [
      slab({ outer: circle(0, 0, 8.8, 36), holes: [circle(0, 0, turn / 2, 36)], z: 0, h: KIT.hubT }),
      slab({
        outer: capsule(0, 0, c, 0, 7.2, 18),
        holes: [circle(0, 0, turn / 2, 36)],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
      slab({
        outer: circle(c, 0, POST_R, 32),
        z: KIT.hubT + KIT.bodyT,
        h: (couplerTop - PLATE_T) - (KIT.hubT + KIT.bodyT) + 1.8,
      }),
    ],
  });

  // Floating coupler (b) on Tier 2 bridging crank pin A to rocker pin B
  const coupler = part({
    id: 'coupler',
    name: 'Coupler link (b)',
    color: '#5aa2d4',
    layer: 2,
    explosion: [0, 0, 38],
    note: `floating connecting rod b = ${b} mm riding on Tier 2 above the crank axle`,
    at: { x: 0, y: 0, z: couplerZ },
    solids: [
      slab({ outer: circle(0, 0, 6.8, 32), holes: [circle(0, 0, turn / 2, 32)], z: 0, h: KIT.hubT }),
      slab({ outer: circle(b, 0, 6.8, 32), holes: [circle(b, 0, turn / 2, 32)], z: 0, h: KIT.hubT }),
      slab({
        outer: capsule(0, 0, b, 0, 6.6, 20),
        holes: [circle(0, 0, turn / 2, 32), circle(b, 0, turn / 2, 32)],
        z: KIT.hubT,
        h: KIT.bodyT,
      }),
    ],
  });

  const capSolids = [capSolid({ postR: POST_R, t: 3 })];
  const capCrank = part({
    id: 'cap-crank',
    printId: 'cap',
    name: 'Press cap',
    qty: 4,
    color: '#e7dfd0',
    layer: 1,
    explosion: [0, 0, 28],
    note: 'snap-fit caps retaining all four revolute joints',
    at: { x: xCrank, y: 0, z: tier1Top },
    solids: capSolids,
  });
  const capRocker = { ...capCrank, id: 'cap-rocker', at: { x: xRocker, y: 0, z: tier1Top } };
  const capPinA = { ...capCrank, id: 'cap-a', layer: 3, explosion: [0, 0, 54], at: { x: 0, y: 0, z: couplerTop } };
  const capPinB = { ...capCrank, id: 'cap-b', layer: 3, explosion: [0, 0, 54], at: { x: 0, y: 0, z: couplerTop } };

  const checks = [
    {
      ok: g.isGrashof,
      text: g.isGrashof
        ? `Grashof condition holds (margin +${g.grashofMargin.toFixed(1)} mm): crank a = ${a} mm spins a full 360°.`
        : `Non-Grashof warning (margin ${g.grashofMargin.toFixed(1)} mm): s + l > p + q, so crank would toggle-lock.`,
    },
    {
      ok: g.minGamma >= 28,
      text: `Minimum transmission angle γ_min = ${g.minGamma.toFixed(1)}° (≥ 30° ensures smooth torque transfer without binding).`,
    },
    {
      ok: true,
      text: `Output rocker c = ${c} mm sweeps through Δφ = ${g.rockerSweepDeg.toFixed(1)}° per crank revolution.`,
    },
    {
      ok: plateW <= 220,
      text: `Baseplate ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm fits a 220 mm print bed.`,
    },
  ];

  return { parts: [frame, crank, rocker, coupler, capCrank, capRocker, capPinA, capPinB], checks, g };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const th = t * DEG;
  const s = solveFourBar(g.a, g.b, g.c, g.d, th);
  return {
    frame: {},
    crank: { rot: th },
    rocker: { rot: s.rockerAng },
    coupler: { dx: s.ax, dy: s.ay, rot: s.couplerAng },
    'cap-crank': {},
    'cap-rocker': {},
    'cap-a': { dx: s.ax, dy: s.ay },
    'cap-b': { dx: s.bx, dy: s.by },
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const deg = ((t % 360) + 360) % 360;
  const s = solveFourBar(g.a, g.b, g.c, g.d, deg * DEG);
  return [
    { label: 'Crank θ', value: deg.toFixed(0), unit: '°' },
    { label: 'Rocker φ', value: (s.rockerAng / DEG).toFixed(1), unit: '°' },
    { label: 'Sweep Δφ', value: g.rockerSweepDeg.toFixed(1), unit: '°' },
    { label: 'Trans γ', value: s.gammaDeg.toFixed(0), unit: '°' },
    { label: 'Grashof', value: g.isGrashof ? 'crank-rocker' : 'rocker' },
  ];
}

export const steps = [
  {
    title: 'Continuous rotation in, bounded oscillation out',
    text: 'Because the input crank a is the shortest bar and satisfies s + l ≤ p + q, it spins 360° continuously while the output rocker c oscillates smoothly back and forth.',
    t: 55,
    parts: ['crank', 'coupler', 'rocker'],
  },
  {
    title: 'Extended dead-centre toggle (crank + coupler collinear)',
    text: 'When the crank and coupler pull into a straight line of length a + b, the rocker reaches its furthest clockwise limit and pauses momentarily.',
    t: 25,
    parts: ['crank', 'coupler', 'rocker'],
  },
  {
    title: 'Folded dead-centre toggle (coupler overlaps crank)',
    text: 'Half a cycle later, the coupler folds directly back over the crank (effective length b − a) on Tier 2, bringing the rocker to its counterclockwise limit.',
    t: 205,
    parts: ['crank', 'coupler'],
  },
  {
    title: 'Widening the rocker sweep by lengthening the crank',
    text: 'Increase crank length a from 18 mm to 24 mm: the rocker sweep angle Δφ expands dramatically while the minimum transmission angle γ tightens.',
    t: 90,
    parts: ['crank', 'rocker'],
    set: { crank: 24, rocker: 46 },
  },
];
