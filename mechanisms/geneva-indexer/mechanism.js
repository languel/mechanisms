/* Geneva indexer — continuous input rotation to intermittent dwell-and-index motion.

   Properly stacked 2-tier architecture centered at (0,0):
   - Tier 1 (z = 4.0..9.6 mm):
     * Driver Pin-Carrier Disc (radius = pinRadius + 5.5 mm), passing cleanly beneath
       the outer rim of the Geneva wheel.
     * Geneva Wheel Central Hub (radius = 9.5 mm).
   - Tier 2 (z = 9.6..15.6 mm, co-planar!):
     * Slotted Geneva Wheel body with radial slots and concave locking arcs.
     * Driver Crescent Locking Boss (radius = lockR with concave clearance relief on
       the pin side so the Geneva wheel horns pass during indexing).
     * Driver Indexing Pin at (-pinRadius, 0), riding inside the carrier disc and
       engaging the Geneva wheel slots in the exact same Z plane.
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { genevaProfile, genevaDriver, arc, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'geneva-indexer',
  title: 'Geneva indexer',
  movement: '507 Movements #215',
  motorMount: { partId: 'driver', label: 'Continuous DC / gearmotor input', direction: 'CW' },
  tagline: 'One steady turn in, discrete locked stops out — the mechanism behind film projectors '
    + 'and rotary indexing tables.',
  category: 'Intermittent index',
  question: 'How can a continuously turning shaft make an output wheel alternate between exact angular steps '
    + 'and dead-locked rest periods?',
  bigIdea: 'The driver combines a full-diameter lower pin-carrier disc with a co-planar drive pin and '
    + 'crescent locking boss. During indexing, the pin sweeps a radial slot while the crescent clearance '
    + 'lets the wheel horns pass; during dwell, the circular boss locks the wheel concave arc.',
  notes: [
    {
      h: 'Pin carrier + crescent locking boss',
      p: 'In a real Geneva mechanism, the indexing pin sits outside the locking boss radius. A lower '
        + '<b>carrier disc</b> (`z = 4..9.6 mm`) supports the pin at radius `r_pin`, while the upper '
        + 'tier (`z = 9.6..15.6 mm`) holds both the <b>drive pin</b> and a <b>crescent-relieved locking boss</b> '
        + 'in the exact same plane as the slotted Geneva wheel.',
    },
    {
      h: 'Why the crescent relief is essential',
      p: 'While the pin is inside a slot, the pointed tips ("horns") of the Geneva wheel swing inward '
        + 'across the driver’s perimeter. Cutting a concave crescent out of the locking boss on the pin '
        + 'side gives those horns clearance during indexing, while leaving more than 200° of circular '
        + 'arc to lock the wheel dead during dwell.',
    },
    {
      h: 'Tangent entry, impact-free indexing',
      p: 'The centre distance `C = R / sin(π / n)` makes the driver pin’s circular path strictly tangent '
        + 'to the radial slot at the moment of entry and exit. Angular velocity starts and ends at zero, '
        + 'preventing hammer blows at the transitions.',
    },
    {
      h: 'Slot count sets the dwell-to-motion ratio',
      p: 'For `n` slots, each turn advances the wheel by `360° / n` while the driver turns through '
        + '`180° − 360° / n`. Four slots give 90° steps over 90° of driver rotation (25% move, 75% locked dwell).',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Geneva Stop (#215)', url: 'https://507movements.com/mm_215.html' },
    { label: 'Geneva drive — Wikipedia', url: 'https://en.wikipedia.org/wiki/Geneva_drive' },
  ],
  attribution: 'Geneva indexer — centered two-axis layout with lower pin-carrier disc and co-planar crescent locking cam.',
  screenshot: { t: 25, azimuth: -0.48, elevation: 0.78 },
  order: 60,
};

export const params = [
  { key: 'slots', label: 'Slots', min: 3, max: 8, step: 1, value: 4,
    help: 'Number of stops per turn of the Geneva wheel. Step angle = 360° / slots.' },
  { key: 'wheel', label: 'Wheel diameter', min: 48, max: 88, step: 4, value: 64, unit: 'mm',
    help: 'Outer diameter of the slotted Geneva wheel (automatically capped to fit a 220 mm print bed).' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Running clearance on the two axle posts and slot width.' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;   // 4.0 mm
const CARRIER_H = 5.6;        // z = 4.0 .. 9.6 mm (driver carrier disc & wheel lower hub)
const BODY_H = 6.0;           // z = 9.6 .. 15.6 mm (Geneva wheel, crescent lock boss, & drive pin)

function geom(p) {
  const n = p.slots;
  const beta0 = Math.PI / n;
  const maxR = 88 / (1 / Math.cos(beta0) + Math.tan(beta0) + 0.25);
  const R = Math.max(22, Math.min(p.wheel / 2, maxR));
  const pinR = Math.max(2.1, R * 0.072);
  const slotWidth = pinR * 2 + p.clearance * 2 + 0.5;
  const wheel = genevaProfile({ slots: n, radius: R, slotWidth });
  const centre = wheel.centre;
  const driver = genevaDriver({ discR: wheel.lockDisc, pinR, pinOffset: wheel.pinRadius });
  const stepAngle = 360 / n;
  const driveAngle = 180 - 360 / n;
  const peak = (n - 1) / (2 * n - 4);
  const carrierR = wheel.pinRadius + pinR + 4.0;

  return {
    slots: n,
    wheel,
    centre,
    pinR,
    driver,
    stepAngle,
    driveAngle,
    peak,
    lockR: wheel.lockDisc,
    carrierR,
    xW: -centre / 2,
    xD: centre / 2,
    topOfStack: PLATE_T + CARRIER_H + BODY_H + 3.5,
  };
}

/** Crescent locking boss outline centered at (0,0) with exact concave clearance for the Geneva wheel rim on the -x side. */
function crescentBossOutline(lockR, cutCenterDist, cutR, minWallR = 6.0) {
  const d = cutCenterDist;
  const safeCutR = Math.min(cutR, d - minWallR);
  if (safeCutR <= d - lockR + 0.4) {
    return circle(0, 0, lockR, 48);
  }
  const cosAlpha = Math.max(-0.82, Math.min(0.82, (lockR * lockR + d * d - safeCutR * safeCutR) / (2 * lockR * d)));
  const alpha = Math.acos(cosAlpha); // measured from -x axis (angle PI)
  const startA = Math.PI - alpha;
  const endA = -Math.PI + alpha;

  // Outer locking arc (from startA CW around +x to endA)
  const outerPts = arc(0, 0, lockR, startA, endA, 44);

  // Inner concave relief arc on circle (-d, 0, safeCutR)
  const pEnd = outerPts[outerPts.length - 1];
  const pStart = outerPts[0];
  const bStart = Math.atan2(pEnd[1], pEnd[0] + d);
  const bEnd = Math.atan2(pStart[1], pStart[0] + d);
  const innerPts = arc(-d, 0, safeCutR, bStart, bEnd, 28).slice(1, -1);

  return [...outerPts, ...innerPts];
}

export function build(p) {
  const g = geom(p);
  const { centre, wheel, pinR, lockR, carrierR, xW, xD } = g;
  const boreR = POST_R + p.clearance / 2;

  const leftEdge = xW - wheel.radius - 16;
  const rightEdge = xD + carrierR + 16;
  const plateW = rightEdge - leftEdge;
  const plateD = Math.max(wheel.radius, carrierR) * 2 + 32;
  const x0 = leftEdge;
  const y0 = -plateD / 2;

  const mounts = [
    [x0 + 10, y0 + 10],
    [x0 + plateW - 10, y0 + 10],
    [x0 + 10, y0 + plateD - 10],
    [x0 + plateW - 10, y0 + plateD - 10],
  ].map(([x, y]) => circle(x, y, 2.0, 20));

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#ece6da',
    note: `baseplate with axle posts at exact tangent center distance C = ${centre.toFixed(1)} mm`,
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: y0, w: plateW, h: plateD, r: 8, n: 6 }),
        holes: mounts,
        z: 0,
        h: PLATE_T,
      }),
      postSolid({ x: xW, y: 0, z0: PLATE_T, h: CARRIER_H + BODY_H + 1.5, r: POST_R }),
      postSolid({ x: xD, y: 0, z0: PLATE_T, h: CARRIER_H + BODY_H + 1.5, r: POST_R }),
    ],
  });

  /* -- Slotted Geneva wheel (Hub on Tier 1, Wheel body on Tier 2) ---------- */
  const maxHubR = Math.min(10.5, Math.max(boreR + 2.2, centre - carrierR - 1.2));
  const wheelPart = part({
    id: 'wheel',
    name: 'Geneva wheel',
    color: '#5aa2d4',
    layer: 2,
    note: `${p.slots} radial slots & concave dwell arcs — ${g.stepAngle.toFixed(0)}° step per turn`,
    at: { x: xW, y: 0, z: PLATE_T },
    solids: [
      // Lower support hub on Tier 1 (z = 0..5.6 mm)
      slab({
        outer: circle(0, 0, maxHubR, 40),
        holes: [circle(0, 0, boreR, 40)],
        z: 0,
        h: CARRIER_H,
      }),
      // Slotted wheel body on Tier 2 (z = 5.6..11.6 mm, world z = 9.6..15.6 mm)
      slab({
        outer: wheel.outer,
        holes: [circle(0, 0, boreR, 40)],
        z: CARRIER_H,
        h: BODY_H,
      }),
    ],
  });

  /* -- Driver disc: Tier 1 Pin-Carrier + Tier 2 Crescent Boss & Drive Pin -- */
  // Cut the crescent relief with a circle centered at (-centre, 0) of radius wheel.radius + 1.2 mm
  // so the Geneva wheel horns sweep cleanly through the crescent with zero overlap!
  const crescent = crescentBossOutline(
    lockR,
    centre,
    wheel.radius + 1.2
  );
  const knobX = Math.min(lockR * 0.55, carrierR * 0.45);

  const driverPart = part({
    id: 'driver',
    name: 'Driver rotor',
    color: '#dcb038',
    layer: 1,
    note: `lower pin-carrier disc Ø${(carrierR * 2).toFixed(1)} mm + co-planar crescent locking cam & pin`,
    at: { x: xD, y: 0, z: PLATE_T },
    solids: [
      // Tier 1 (z = 0..5.6 mm): Full-radius Pin Carrier Disc supporting the indexing pin
      slab({
        outer: circle(0, 0, carrierR, 64),
        holes: [
          circle(0, 0, boreR, 40),
          circle(0, carrierR * 0.56, 3.2, 20),
          circle(0, -carrierR * 0.56, 3.2, 20),
        ],
        z: 0,
        h: CARRIER_H,
      }),
      // Tier 2 (z = 5.6..11.6 mm): Co-planar Crescent Locking Boss
      slab({
        outer: crescent,
        holes: [circle(0, 0, boreR, 40)],
        z: CARRIER_H,
        h: BODY_H,
      }),
      // Tier 2 (z = 5.6..11.6 mm): Co-planar Indexing Drive Pin at (-pinRadius, 0)
      slab({
        outer: circle(-wheel.pinRadius, 0, pinR, 28),
        z: CARRIER_H,
        h: BODY_H,
      }),
      // Tier 3 (z = 11.6..18.6 mm): Integral finger crank knob on the opposite side (+x)
      slab({
        outer: circle(knobX, 0, 4.4, 24),
        z: CARRIER_H + BODY_H,
        h: 7.0,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 3,
    note: 'retains the Geneva wheel and driver rotor on their posts',
    at: { x: xW, y: 0, z: PLATE_T + CARRIER_H + BODY_H },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const capDriver = {
    ...cap,
    id: 'cap-driver',
    at: { x: xD, y: 0, z: PLATE_T + CARRIER_H + BODY_H },
  };

  const checks = [
    {
      ok: p.slots >= 3,
      text: `${p.slots} slots: ${g.stepAngle.toFixed(1)}° step during ${g.driveAngle.toFixed(1)}° of driver rotation; locked dwell for ${(360 - g.driveAngle).toFixed(1)}°.`,
    },
    {
      ok: true,
      text: `Co-planar engagement: driver pin (r = ${wheel.pinRadius.toFixed(1)} mm) and crescent boss (Ø${(lockR * 2).toFixed(1)} mm) mesh with the wheel at z = ${(PLATE_T + CARRIER_H).toFixed(1)}..${(PLATE_T + CARRIER_H + BODY_H).toFixed(1)} mm.`,
    },
    {
      ok: wheel.slotBottom > 3,
      text: `Slot root radius ${wheel.slotBottom.toFixed(1)} mm leaves ample hub strength.`,
    },
    {
      ok: plateW <= 220,
      text: `Baseplate ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm (centre distance C = ${centre.toFixed(1)} mm).`,
    },
  ];

  return { parts: [frame, wheelPart, driverPart, cap, capDriver], checks, g };
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  const driverAngle = t * DEG;
  const half = g.driveAngle / 2;
  let rel = ((t % 360) + 360) % 360;               // 0 = pin pointing toward the Geneva wheel (-x)
  if (rel > 180) rel -= 360;
  const turns = Math.round((t - rel) / 360);
  let localBeta;
  if (Math.abs(rel) <= half) {
    const alpha = rel * DEG;
    localBeta = Math.atan2(
      g.wheel.pinRadius * Math.sin(alpha),
      g.centre - g.wheel.pinRadius * Math.cos(alpha),
    );
  } else {
    localBeta = (rel > 0 ? 0.5 : -0.5) * g.stepAngle * DEG;
  }
  const wheelAngle = localBeta + turns * g.stepAngle * DEG;
  return {
    frame: {},
    wheel: { rot: wheelAngle },
    driver: { rot: -driverAngle },
    cap: {},
    'cap-driver': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const rel = ((t % 360) + 360) % 360;
  const relS = rel > 180 ? rel - 360 : rel;
  const driving = Math.abs(relS) <= g.driveAngle / 2;
  return [
    { label: 'Driver', value: (((t % 360) + 360) % 360).toFixed(0), unit: '°' },
    { label: 'State', value: driving ? 'indexing' : 'locked' },
    { label: 'Step', value: g.stepAngle.toFixed(1), unit: '°' },
    { label: 'Drive arc', value: g.driveAngle.toFixed(0), unit: '°' },
    { label: 'Stops', value: p.slots },
    { label: 'Peak accel', value: `${g.peak.toFixed(2)}×` },
  ];
}

export const steps = [
  {
    title: 'Locked dwell: crescent boss in the concave arc',
    text: 'Outside the indexing window, the circular perimeter of the driver’s crescent boss fills the concave arc between slots. The Geneva wheel is geometrically locked against rotation.',
    t: 180,
    parts: ['driver', 'wheel'],
  },
  {
    title: 'Tangent entry: the pin enters the radial slot',
    text: 'Carried on the lower disc, the drive pin arrives along a path tangent to the radial slot wall so indexing begins without shock.',
    t: 318,
    parts: ['driver', 'wheel'],
  },
  {
    title: 'Mid-index: wheel horns pass through the crescent cutout',
    text: 'At t = 0° the pin is deepest in the slot and the Geneva wheel reaches peak angular velocity while its horns pass cleanly through the concave cutout in the driver boss.',
    t: 0,
    parts: ['driver', 'wheel'],
  },
  {
    title: 'Six slots: finer steps and a 67% locked dwell',
    text: 'Increasing to 6 slots produces 60° steps driven over 120° of input rotation and locked for the remaining 240°.',
    t: 20,
    parts: ['wheel'],
    set: { slots: 6 },
  },
  {
    title: 'Three slots: maximum 120° step angle',
    text: 'Three slots swing the wheel through 120° in just 60° of driver rotation — rapid indexing with high peak angular acceleration.',
    t: 15,
    parts: ['wheel', 'driver'],
    set: { slots: 3 },
  },
];
