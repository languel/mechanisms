/* Ratchet and pawl — oscillating input into one-way stepped rotation.

   Co-planar two-layer stack:
   - Layer 1 (z = 4.0..10.0 mm): Oscillating Drive Lever beneath the ratchet wheel,
     extending radially past the wheel rim to carry the Drive Pawl pivot pin, plus
     a raised frame boss supporting the stationary Detent Pawl.
   - Layer 2 (z = 10.0..16.0 mm): Asymmetric Ratchet Wheel, Drive Pawl, Pawl Spring,
     and Detent Pawl all sharing the exact same Z plane so both pawls physically
     mesh with the ratchet teeth.
*/

import { KIT, slab, part, circle, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { ratchetProfile, arc, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'ratchet-pawl',
  title: 'Ratchet and pawl',
  movement: '507 Movements #75',
  motorMount: { partId: 'lever', label: 'Oscillating crank / servo link input', direction: 'CCW' },
  tagline: 'A lever that swings both ways, driving a wheel that only turns one way in discrete steps.',
  category: 'Intermittent feed',
  question: 'How does a back-and-forth oscillation become a series of equal steps in one direction — and '
    + 'what stops the wheel from backing up while the lever returns?',
  bigIdea: 'Each asymmetric tooth is a mechanical diode: a steep radial face to push against and a gentle back slope '
    + 'to climb over. One pawl drives on the forward stroke; a stationary detent pawl holds the load on the return.',
  notes: [
    {
      h: 'Why the teeth are asymmetrical',
      p: 'A ratchet tooth has a <b>drive flank</b> cut nearly radial and a <b>back slope</b> that rises '
        + 'gradually to the next tip. Pushed against the steep drive flank, the pawl locks into the root '
        + 'and turns the wheel. Dragged backward on the return stroke, the pawl rides up the gentle slope '
        + 'and drops into the next tooth space.',
    },
    {
      h: 'Two pawls sharing the load',
      p: 'The <b>drive pawl</b> rides on the swinging lever and only pushes during the forward half of the cycle. '
        + 'Without a second pawl, friction or load torque would pull the wheel backward during the return stroke. '
        + 'The frame-mounted <b>detent pawl</b> sits on the opposite side of the rim and catches each tooth as soon '
        + 'as the step completes.',
    },
    {
      h: 'Co-planar tooth engagement',
      p: 'On this model, the oscillating drive lever runs on the lower tier (`z = 4..10 mm`) and reaches '
        + 'out beyond the tooth tips (`r = r_outer + 8 mm`). A vertical pin on the lever carries the drive pawl '
        + 'in the upper tier (`z = 10..16 mm`), directly in the plane of the ratchet wheel and detent pawl.',
    },
    {
      h: 'Quantum angular resolution',
      p: 'Regardless of how rough the input lever stroke is, the output advances in exact steps of '
        + '<code>360° / teeth</code> — provided the lever swing exceeds one tooth pitch plus a small '
        + 'overtravel margin.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Ratchet & Pawl (#49, #75, #76)', url: 'https://507movements.com/mm_075.html' },
    { label: 'Ratchet (device) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Ratchet_(device)' },
  ],
  attribution: 'Ratchet and pawl — co-planar wheel, drive pawl, and detent pawl with lower-tier oscillating carrier lever.',
  screenshot: { t: 65, azimuth: -0.52, elevation: 0.78 },
  order: 50,
};

export const params = [
  { key: 'teeth', label: 'Teeth', min: 8, max: 20, step: 1, value: 12,
    help: 'One stroke advances the wheel by one tooth: 360° / teeth.' },
  { key: 'wheel', label: 'Wheel diameter', min: 48, max: 76, step: 2, value: 62, unit: 'mm',
    help: 'Outer tip diameter of the ratchet wheel.' },
  { key: 'swing', label: 'Lever swing', min: 24, max: 64, step: 2, value: 36, unit: '°',
    help: 'Angular stroke of the drive lever. Must exceed 360° / teeth to index.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm',
    help: 'Diametral clearance for the wheel, lever, and pawl pivots.' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;   // 4.0 mm
const TIER1_H = 6.0;          // z = 4.0 .. 10.0 mm (lever body + wheel lower hub + detent boss)
const TIER2_H = 6.0;          // z = 10.0 .. 16.0 mm (wheel teeth + drive pawl + detent pawl)
const PAWL_PIN_R = 2.0;

function pawlWorldAngle(pivotTheta, pawlR, pawlLen, rTarget) {
  const cosPsi = Math.max(-0.98, Math.min(0.98, (pawlR * pawlR + pawlLen * pawlLen - rTarget * rTarget) / (2 * pawlR * pawlLen)));
  return pivotTheta + Math.PI - Math.acos(cosPsi);
}

function tipAngleOffset(pawlR, pawlLen, rTarget) {
  const cosPhi = Math.max(-0.98, Math.min(0.98, (pawlR * pawlR + rTarget * rTarget - pawlLen * pawlLen) / (2 * pawlR * rTarget)));
  return Math.acos(cosPhi);
}

/** Exact radius of the sawtooth ratchet wheel at wheel-local angle (radians). */
function toothSurfaceRadius(localAngleRad, rRoot, rOuter, stepRad) {
  const u = ((localAngleRad / stepRad) % 1 + 1) % 1;
  if (u <= 0.86) {
    return rOuter - (rOuter - rRoot) * (u / 0.86);
  }
  if (u <= 0.94) {
    return rRoot;
  }
  return rRoot + (rOuter - rRoot) * ((u - 0.94) / 0.06);
}

function solvePawlPose(pivotTheta, wheelAngle, pawlR, pawlLen, rRoot, rOuter, stepRad) {
  const rRest = rRoot + 0.35;
  // Fixed-point solve so the pawl beak sits on the exact tooth surface at its true tip angle
  let rTip = rRest;
  for (let iter = 0; iter < 4; iter++) {
    const tipWorld = pivotTheta + tipAngleOffset(pawlR, pawlLen, rTip);
    const localAngle = tipWorld - wheelAngle;
    const r0 = toothSurfaceRadius(localAngle, rRoot, rOuter, stepRad);
    const r1 = toothSurfaceRadius(localAngle - 0.045 * stepRad, rRoot, rOuter, stepRad);
    rTip = Math.max(rRest, Math.max(r0, r1) + 0.45);
  }
  return pawlWorldAngle(pivotTheta, pawlR, pawlLen, rTip);
}

function geom(p) {
  const rOuter = p.wheel / 2;
  const teeth = p.teeth;
  const toothDepth = Math.max(4.6, p.wheel * 0.09);
  const rRoot = rOuter - toothDepth;
  const wheel = ratchetProfile({ teeth, rOuter, rRoot });
  const step = 360 / teeth;
  const stepRad = step * DEG;

  // Pivot radius of both pawls just outside the wheel tips:
  const pawlR = rOuter + 5.8;
  const rRest = rRoot + 0.35;
  // Size the pawl length to span ~64% of one tooth pitch so the entire pawl fits cleanly
  // inside a single tooth ramp without ever crossing the previous tooth crest at u = 0!
  const spanAngle = Math.max(14 * DEG, Math.min(24 * DEG, 0.64 * stepRad));
  const pawlLen = Math.sqrt(pawlR * pawlR + rRest * rRest - 2 * pawlR * rRest * Math.cos(spanAngle));
  const leverLen = pawlR + 18;

  // Place detent pivot at (0.5 + detentTeethOffset) * step so at the end of the forward stroke
  // (leverMax = +0.5 * step), both the drive pawl and detent pawl sit at identical tooth phase!
  const detentTeethOffset = Math.max(3, Math.round(teeth * 0.42));
  const detentAngle = (0.5 + detentTeethOffset) * stepRad;
  const detentRadius = pawlR;
  const detentPivot = {
    x: detentRadius * Math.cos(detentAngle),
    y: detentRadius * Math.sin(detentAngle),
  };
  const detentLen = pawlLen;
  const detentReach = 2.4;

  const plateW = Math.min(216, Math.round(rOuter * 2 + 86));
  const plateD = Math.min(160, Math.round(rOuter * 2 + 48));

  return {
    rOuter,
    rRoot,
    teeth,
    wheel,
    step,
    pawlR,
    pawlLen,
    leverLen,
    detentPivot,
    detentAngle,
    detentLen,
    detentReach,
    plateW,
    plateD,
    topOfStack: PLATE_T + TIER1_H + TIER2_H + 3.5,
  };
}

/** Tapered ratchet pawl profile in local coordinates: pivot at (0,0), tooth engagement tip at (len, 0).
    In local coords, +y faces inward toward the wheel and -y faces outward away from the wheel.
    The front pushing face [len - 2.1, -2.6] -> [len, 0] is parallel to the radial tooth wall,
    and the underside is recessed to negative y so it clears the tooth ramp behind the beak. */
function tangentialPawlOutline(len) {
  const r0 = 3.5;
  const pts = [];
  pts.push(...arc(0, 0, r0, Math.PI * 0.38, Math.PI * 1.48, 12));
  pts.push(
    [len * 0.48, -3.4],
    [len - 2.1, -2.6],
    [len, 0],
    [len - 2.4, -0.7],
    [len * 0.45, -0.4],
  );
  return pts;
}

export function build(p) {
  const g = geom(p);
  const { rOuter, rRoot, wheel, leverLen, pawlR, pawlLen, detentPivot, detentAngle, detentLen, plateW, plateD } = g;
  const boreR = POST_R + p.clearance / 2;
  const pawlBoreR = PAWL_PIN_R + p.clearance / 2;

  // Center the plate slightly toward +x to frame the extending drive lever and detent boss
  const xShift = 8;
  const x0 = -plateW / 2 + xShift;
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
    note: 'baseplate with central axle post and raised co-planar detent pedestal',
    solids: [
      slab({
        outer: roundedRect({ x: x0, y: y0, w: plateW, h: plateD, r: 8, n: 6 }),
        holes: mounts,
        z: 0,
        h: PLATE_T,
      }),
      // Central axle post supporting lever (Tier 1) and ratchet wheel (Tier 2)
      postSolid({ x: 0, y: 0, z0: PLATE_T, h: TIER1_H + TIER2_H + 1.5, r: POST_R }),
      // Raised pedestal under the detent pawl so the detent sits at Tier 2 (z = 10..16 mm)
      slab({
        outer: circle(detentPivot.x, detentPivot.y, 7.2, 32),
        z: PLATE_T,
        h: TIER1_H,
      }),
      // Detent pivot pin on top of the pedestal
      slab({
        outer: circle(detentPivot.x, detentPivot.y, PAWL_PIN_R, 28),
        z: PLATE_T + TIER1_H,
        h: TIER2_H + 1.2,
      }),
    ],
  });

  /* -- Drive lever (Tier 1: z = 4.0..10.0 mm, with pin + knob into Tier 2) -- */
  const lever = part({
    id: 'lever',
    name: 'Drive lever',
    color: '#dcb038',
    layer: 1,
    note: `oscillates ${p.swing}° under the wheel; carries the drive pawl pin at r = ${pawlR.toFixed(1)} mm`,
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: leverOutline(leverLen),
        holes: [circle(0, 0, boreR, 40)],
        z: 0,
        h: TIER1_H,
      }),
      // Integral vertical pivot pin at (pawlR, 0) rising into Tier 2 for the drive pawl
      slab({
        outer: circle(pawlR, 0, PAWL_PIN_R, 28),
        z: TIER1_H,
        h: TIER2_H + 1.2,
      }),
      // Integral finger grip knob at the outer tip of the lever
      slab({
        outer: circle(leverLen - 8.5, 0, 5.2, 28),
        z: TIER1_H,
        h: TIER2_H + 3.0,
      }),
    ],
  });

  /* -- Ratchet wheel (Tier 2: z = 10.0..16.0 mm) ---------------------------- */
  const wheelPart = part({
    id: 'wheel',
    name: 'Ratchet wheel',
    color: '#82c0e4',
    layer: 2,
    note: `${p.teeth} asymmetric teeth — advances ${g.step.toFixed(1)}° CCW per stroke`,
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: wheel.outer,
        holes: [
          circle(0, 0, boreR, 40),
          ...(rRoot > 20
            ? [0, 1, 2, 3].map((k) => {
                const a = (k * Math.PI) / 2 + Math.PI / 4;
                const rm = (10 + rRoot) * 0.5;
                return circle(rm * Math.cos(a), rm * Math.sin(a), Math.min(4.2, (rRoot - 14) * 0.28), 20);
              })
            : []),
        ],
        z: TIER1_H,
        h: TIER2_H,
      }),
    ],
  });

  /* -- Drive pawl (Tier 2: z = 10.0..16.0 mm, co-planar with wheel teeth!) -- */
  const drivePawl = part({
    id: 'drive-pawl',
    name: 'Drive pawl',
    color: '#5aa2d4',
    layer: 2,
    note: 'pivots on the lever pin and engages the steep ratchet tooth faces in the same Z plane',
    at: { x: 0, y: 0, z: PLATE_T + TIER1_H },
    solids: [
      slab({
        outer: tangentialPawlOutline(pawlLen, 6.6),
        holes: [circle(0, 0, pawlBoreR, 24)],
        z: 0,
        h: TIER2_H,
      }),
    ],
  });

  /* -- Compliant pawl spring clip (mounts behind drive pawl on the lever) --- */
  const spring = part({
    id: 'spring',
    name: 'Pawl spring',
    color: '#489e8b',
    layer: 2,
    note: 'compliant leaf finger that biases the drive pawl into the tooth root',
    at: { x: 0, y: 0, z: PLATE_T + TIER1_H },
    solids: [
      slab({
        outer: roundedRect({ x: 2.2, y: -5.6, w: Math.max(5.5, pawlLen * 0.48), h: 2.0, r: 0.9, n: 4 }),
        z: 0,
        h: 3.6,
      }),
    ],
  });

  /* -- Stationary detent pawl (Tier 2: z = 10.0..16.0 mm, co-planar!) ------- */
  const detentPart = part({
    id: 'detent',
    name: 'Detent pawl',
    color: '#5aa2d4',
    layer: 2,
    note: 'pivots on the raised frame pedestal to prevent reverse rotation during lever return',
    at: { x: detentPivot.x, y: detentPivot.y, z: PLATE_T + TIER1_H },
    pivot: { x: 0, y: 0 },
    solids: [
      slab({
        outer: tangentialPawlOutline(detentLen, 6.6),
        holes: [circle(0, 0, pawlBoreR, 24)],
        z: 0,
        h: TIER2_H,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 3,
    note: 'retains the ratchet wheel and detent pawl',
    at: { x: 0, y: 0, z: PLATE_T + TIER1_H + TIER2_H },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const capDetent = {
    ...cap,
    id: 'cap-detent',
    at: { x: detentPivot.x, y: detentPivot.y, z: PLATE_T + TIER1_H + TIER2_H },
    solids: [capSolid({ postR: PAWL_PIN_R, t: 2.6, wall: 2.2 })],
  };

  const checks = [
    {
      ok: p.swing >= g.step + 2,
      text: p.swing >= g.step + 2
        ? `Lever swing ${p.swing}° covers one ${g.step.toFixed(1)}° tooth pitch with ${(p.swing - g.step).toFixed(1)}° overtravel.`
        : `Lever swing ${p.swing}° is less than one ${g.step.toFixed(1)}° tooth — increase swing to index reliably.`,
    },
    {
      ok: true,
      text: `Co-planar engagement: wheel, drive pawl, and detent pawl all mesh at z = ${(PLATE_T + TIER1_H).toFixed(1)}..${(PLATE_T + TIER1_H + TIER2_H).toFixed(1)} mm.`,
    },
    {
      ok: rRoot > 14,
      text: `Root radius ${rRoot.toFixed(1)} mm leaves ${(rRoot - boreR).toFixed(1)} mm of solid rim web.`,
    },
    {
      ok: plateW <= 220,
      text: `Baseplate ${plateW} × ${plateD} mm fits a 220 mm print bed.`,
    },
  ];

  return { parts: [frame, wheelPart, lever, drivePawl, spring, detentPart, cap, capDetent], checks, g };
}

/* ------------------------------------------------------------------ motion */

function cycle(p, t) {
  const g = geom(p);
  const stepRad = g.step * DEG;
  const swingRad = p.swing * DEG;
  const leverMax = 0.5 * stepRad;
  const leverMin = leverMax - swingRad;

  const u = ((t / 360) % 1 + 1) % 1;          // 0..1 over one full oscillation
  const drive = u < 0.5;                       // forward half swings CCW (leverMin -> leverMax)
  const s = drive ? u / 0.5 : 1 - (u - 0.5) / 0.5;
  const ease = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, s)));
  const leverAngle = leverMin + ease * swingRad;

  // The drive pawl contacts the steep tooth face at leverEngage = leverMax - stepRad
  // (after taking up any overtravel swing - step) and pushes the wheel 1:1 to leverMax:
  const leverEngage = leverMax - stepRad;
  let advanced;
  if (!drive) {
    advanced = p.swing >= g.step ? 1 : (p.swing / g.step);
  } else if (p.swing >= g.step) {
    advanced = leverAngle <= leverEngage ? 0 : (leverAngle - leverEngage) / stepRad;
  } else {
    advanced = ease * (p.swing / g.step);
  }
  const turns = Math.floor(t / 360) * (p.swing >= g.step ? 1 : 0);
  return { leverAngle, leverMax, leverMin, advanced, drive, step: stepRad, turns };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const { leverAngle, leverMax, advanced, step, turns } = cycle(p, t);
  const rRest = g.rRoot + 0.35;
  // Angular offset from pivot to pawl tip when seated in the tooth pocket:
  const tipOffsetRest = tipAngleOffset(g.pawlR, g.pawlLen, rRest);
  // Phase the wheel so when lever is at leverMax and advanced = 1, the tooth pocket (u = 0.89)
  // sits directly under both the drive pawl tip and the stationary detent pawl tip:
  const baseWheelPhase = leverMax + tipOffsetRest - (1 + 0.89) * step;
  const wheelAngle = baseWheelPhase + (turns + advanced) * step;

  const driveRot = solvePawlPose(leverAngle, wheelAngle, g.pawlR, g.pawlLen, g.rRoot, g.rOuter, step);
  const detentRot = solvePawlPose(g.detentAngle, wheelAngle, g.pawlR, g.detentLen, g.rRoot, g.rOuter, step);
  const px = g.pawlR * Math.cos(leverAngle);
  const py = g.pawlR * Math.sin(leverAngle);

  return {
    frame: {},
    wheel: { rot: wheelAngle },
    lever: { rot: leverAngle },
    'drive-pawl': { rot: driveRot, dx: px, dy: py },
    spring: { rot: driveRot, dx: px, dy: py },
    detent: { rot: detentRot },
    cap: {},
    'cap-detent': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const { drive } = cycle(p, t);
  const strokes = Math.floor(t / 360) + (((t % 360) + 360) % 360 >= 180 ? 1 : 0);
  return [
    { label: 'Phase', value: drive ? 'drive' : 'return' },
    { label: 'Wheel', value: (((strokes % p.teeth) * g.step) % 360).toFixed(1), unit: '°' },
    { label: 'Step', value: g.step.toFixed(1), unit: '°' },
    { label: 'Teeth', value: p.teeth },
    { label: 'Revolutions', value: (strokes / p.teeth).toFixed(2) },
    { label: 'Direction', value: 'one way' },
  ];
}

export const steps = [
  {
    title: 'Forward stroke: the drive pawl locks and pushes',
    text: 'As the lower drive lever swings forward, its pawl drops against the radial drive flank of a ratchet tooth. Because both sit in the same Z plane (10–16 mm), the wheel advances with zero tipping moment.',
    t: 65,
    parts: ['drive-pawl', 'wheel', 'lever'],
  },
  {
    title: 'Return stroke: the detent holds the load',
    text: 'When the lever reverses, the stationary detent pawl on the upper-left pedestal catches the tooth behind it while the drive pawl ratchets smoothly over the sloped back of the next tooth.',
    t: 250,
    parts: ['detent', 'wheel'],
  },
  {
    title: 'One oscillation, one exact tooth pitch',
    text: 'Every full cycle advances the wheel by 360° / teeth. With 12 teeth, each stroke indexes the output by 30.0°.',
    t: 330,
    parts: ['lever', 'wheel'],
  },
  {
    title: 'Finer teeth, higher angular resolution',
    text: 'Increasing to 20 teeth cuts the step size to 18.0° per stroke — finer indexing resolution from the exact same architecture.',
    t: 90,
    parts: ['wheel'],
    set: { teeth: 20 },
  },
  {
    title: 'Under-stroke failure mode',
    text: 'If the lever swing is smaller than one tooth pitch (360° / teeth), the drive pawl never reaches the next tooth root and the mechanism stalls.',
    t: 90,
    parts: ['lever'],
    set: { teeth: 20, swing: 18 },
  },
];

/* ------------------------------------------------------------------ helpers */

function leverOutline(len) {
  const r0 = 10.5;
  const r1 = 8.5;
  const L = len - r1;
  const pts = [];
  pts.push(...arc(L, 0, r1, Math.PI / 2, -Math.PI / 2, 16));
  pts.push(...arc(0, 0, r0, -Math.PI / 2, -3 * Math.PI / 2, 18));
  return pts;
}
