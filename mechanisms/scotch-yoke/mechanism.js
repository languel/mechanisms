/* Scotch yoke — converting steady rotation into pure sinusoidal linear motion
   (507 Mechanical Movements #88).

   Unlike a crank-and-slider — whose tilted connecting rod introduces second-order
   harmonic distortion — a Scotch yoke couples the rotating crank pin directly
   into a perpendicular transverse slot on the sliding yoke. The horizontal
   displacement is an exact cosine wave x(θ) = r · cos(θ).
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid, boreOn, SHAFT_OPTIONS, shaftSpec } from '../../src/lib/kit.js';
import { slot, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'scotch-yoke',
  title: 'Scotch yoke',
  movement: '507 Movements #88',
  motorMount: { partId: 'crank', label: 'DC Gearmotor / Stepper Crank Axis', direction: 'CCW' },
  tagline: 'A crank pin in a transverse slot: the geometric definition of a sine wave turned into solid hardware.',
  category: 'Rotary ↔ linear',
  question: 'How do you generate pure simple harmonic motion x(θ) = r·cos(θ) without the connecting-rod asymmetry of a crank and slider?',
  bigIdea: 'Replace the swinging connecting rod with a vertical slot fixed at 90° to the slide axis. As the crank pin circles at radius r, its vertical component slides freely up and down the slot while its horizontal projection r·cos(θ) drives the yoke directly.',
  notes: [
    {
      h: 'Pure Simple Harmonic Motion (SHM)',
      p: 'In a crank-and-slider, rod tilt shortens the reach whenever sin θ ≠ 0. In a <b>Scotch yoke</b>, the slot is strictly perpendicular to the guide rails, so position is <i>x</i>(θ) = <i>r</i>·cos θ, velocity is <i>v</i>(θ) = −<i>r</i>ω·sin θ, and acceleration is <i>a</i>(θ) = −<i>r</i>ω²·cos θ — a mathematically pure sine/cosine oscillator.',
    },
    {
      h: 'More time at the ends of the stroke',
      p: 'Compared with a short-rod crank-slider, a Scotch yoke spends slightly longer dwelling near both dead centres and has symmetric peak accelerations at +<i>r</i> and −<i>r</i>, making it ideal for shake tables, valve actuators, and Bourdon/harmonic test rigs.',
    },
    {
      h: 'Sliding friction vs roller bearing shoe',
      p: 'Because the crank pin slides up and down inside the slot through a distance of 2<i>r</i> every revolution, industrial Scotch yokes fit a rolling bushing (or square bronze slipper block) on the crank pin to turn sliding friction into rolling contact.',
    },
    {
      h: 'Co-planar dual-stem guided yoke',
      p: 'The crank disc sits on Tier 1 (<i>z</i> = 4..10 mm) while its eccentric pin and roller bushing rise into Tier 2 (<i>z</i> = 10..16 mm) to engage the slotted cross-head of the guided yoke.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Scotch Yoke (#88)', url: 'https://507movements.com/mm_088.html' },
    { label: 'Scotch yoke kinematics — Wikipedia', url: 'https://en.wikipedia.org/wiki/Scotch_yoke' },
  ],
  attribution: 'Scotch yoke — eccentric crank disc, rolling slot bushing, and dual-rail guided H-yoke with SHM scale.',
  screenshot: { t: 45, azimuth: -0.58, elevation: 0.74 },
  order: 32,
};

export const params = [
  { key: 'stroke', label: 'Stroke (2r)', min: 20, max: 48, step: 2, value: 32, unit: 'mm',
    help: 'Peak-to-peak harmonic travel 2r of the yoke.' },
  { key: 'shaft', label: 'Crank motor shaft', kind: 'choice', value: 'post',
    options: SHAFT_OPTIONS,
    help: 'Cuts the crank disc bore to match a NEMA 17 stepper, N20 gearmotor, servo spline, or baseplate post.' },
  { key: 'clearance', label: 'Slot & rail clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;
const TIER1_H = 6.0; // z = 4..10 mm: crank disc
const TIER2_H = 6.0; // z = 10..16 mm: slotted yoke + crank pin roller

function geom(p) {
  const r = p.stroke / 2;
  const shaft = shaftSpec(p.shaft || 'post', p.clearance);
  const discR = r + 11.5;
  const pinR = 3.2;
  const bushingR = 5.4;
  const slotW = bushingR * 2 + p.clearance * 2;
  const slotHalfH = r + 3.5;

  const yokeOuterH = (slotHalfH + bushingR + 6.5) * 2;
  const yokeBoxW = slotW + 13;
  const stemL = 36;
  const stemH = 14;

  const plateW = Math.min(218, (r + yokeBoxW / 2 + stemL + 22) * 2);
  const plateD = Math.min(180, yokeOuterH + 38);

  return {
    r, shaft, discR, pinR, bushingR, slotW, slotHalfH,
    yokeOuterH, yokeBoxW, stemL, stemH, plateW, plateD,
    topZ: PLATE_T + TIER1_H + TIER2_H,
  };
}

/** Symmetric H-yoke outline with left and right guide stems along the x-axis. */
function yokeOutline(boxW, boxH, stemL, stemH) {
  const hw = boxW / 2;
  const hh = boxH / 2;
  const sh = stemH / 2;
  const totalHalfX = hw + stemL;
  return [
    [-totalHalfX, -sh],
    [-hw, -sh],
    [-hw, -hh],
    [hw, -hh],
    [hw, -sh],
    [totalHalfX, -sh],
    [totalHalfX, sh],
    [hw, sh],
    [hw, hh],
    [-hw, hh],
    [-hw, sh],
    [-totalHalfX, sh],
  ];
}

export function build(p) {
  const g = geom(p);
  const { r, shaft, discR, pinR, bushingR, slotW, slotHalfH, yokeOuterH, yokeBoxW, stemL, stemH, plateW, plateD } = g;

  const mounts = [
    [-plateW / 2 + 11, -plateD / 2 + 11],
    [plateW / 2 - 11, -plateD / 2 + 11],
    [-plateW / 2 + 11, plateD / 2 - 11],
    [plateW / 2 - 11, plateD / 2 - 11],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  // Millimetre harmonic displacement scale along the right stem
  const ticks = [];
  const scaleX0 = yokeBoxW / 2 + 10;
  for (let dx = -r; dx <= r; dx += 4) {
    const major = dx === 0 || Math.abs(dx) === r;
    ticks.push(rect(scaleX0 + dx - 0.5, -stemH / 2 - 12, 1.0, major ? 4.8 : 2.8));
  }

  // Left and right guide rails straddling the yoke's horizontal stems
  const railGapY = stemH / 2 + p.clearance + 0.2;
  const railXStart = discR + 4.5;
  const railLen = plateW / 2 - railXStart - 12;
  const railSlabs = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const rx = sx > 0 ? railXStart : -railXStart - railLen;
      const ry = sy > 0 ? railGapY : -railGapY - 5.2;
      railSlabs.push(
        slab({
          outer: roundedRect({ x: rx, y: ry, w: railLen, h: 5.2, r: 1.5, n: 4 }),
          z: PLATE_T,
          h: TIER1_H + TIER2_H,
        })
      );
    }
  }

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#ece6da',
    explosion: [0, 0, 0],
    note: `baseplate with central crank post (${shaft.label}), four linear stem guide rails, and harmonic scale`,
    solids: [
      slab({
        outer: roundedRect({ x: -plateW / 2, y: -plateD / 2, w: plateW, h: plateD, r: 7, n: 6 }),
        holes: [...mounts, ...ticks],
        z: 0,
        h: PLATE_T,
      }),
      ...railSlabs,
      postSolid({ x: 0, y: 0, z0: PLATE_T, h: TIER1_H + 1.5, r: shaft.hasFramePost ? POST_R : shaft.postR }),
    ],
  });

  // Crank disc on Tier 1 (z = 4..10 mm) with eccentric pin rising into Tier 2 (z = 10..17.5 mm)
  const crank = part({
    id: 'crank',
    name: 'Crank rotor',
    color: '#dcb038',
    layer: 1,
    explosion: [0, 0, 18],
    note: `eccentric pin at r = ${r} mm (${shaft.note})`,
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      slab({
        outer: circle(0, 0, discR, 64),
        holes: [
          shaft.ring,
          circle(-r * 0.55, r * 0.5, 3.2, 20),
          circle(-r * 0.55, -r * 0.5, 3.2, 20),
        ],
        z: 0,
        h: TIER1_H,
      }),
      slab({
        outer: circle(r, 0, pinR, 32),
        z: TIER1_H,
        h: TIER2_H + 1.8,
      }),
    ],
  });

  // Rolling slot bushing on the crank pin inside the yoke slot
  const bushing = part({
    id: 'bushing',
    name: 'Slot roller bushing',
    color: '#82c0e4',
    layer: 2,
    explosion: [0, 0, 32],
    note: `Ø${(bushingR * 2).toFixed(1)} mm rolling slipper bushing that glides vertically inside the yoke slot`,
    at: { x: 0, y: 0, z: PLATE_T + TIER1_H },
    solids: [
      slab({
        outer: circle(0, 0, bushingR, 36),
        holes: [circle(0, 0, pinR + p.clearance / 2, 32)],
        z: 0,
        h: TIER2_H,
      }),
    ],
  });

  // Reciprocating slotted yoke on Tier 2 (z = 10..16 mm) with underside support pads on its stems
  const padX0 = discR + 6;
  const padW = yokeBoxW / 2 + stemL - padX0 - 2;
  const yoke = part({
    id: 'yoke',
    name: 'Slotted Scotch yoke',
    color: '#5aa2d4',
    layer: 2,
    explosion: [0, 0, 38],
    note: `transverse slot width ${slotW.toFixed(1)} mm — outputs pure cosine displacement x = r·cos(θ)`,
    at: { x: 0, y: 0, z: PLATE_T },
    solids: [
      // Left & right sliding stem pads on Tier 1 so the yoke prints & glides at the exact Tier 2 height
      slab({
        outer: roundedRect({ x: -padX0 - padW, y: -stemH / 2 + 1, w: padW, h: stemH - 2, r: 1.5, n: 4 }),
        z: 0,
        h: TIER1_H,
      }),
      slab({
        outer: roundedRect({ x: padX0, y: -stemH / 2 + 1, w: padW, h: stemH - 2, r: 1.5, n: 4 }),
        z: 0,
        h: TIER1_H,
      }),
      // Main slotted H-yoke body on Tier 2
      slab({
        outer: yokeOutline(yokeBoxW, yokeOuterH, stemL, stemH),
        holes: [slot(0, -slotHalfH, 0, slotHalfH, slotW, 20)],
        z: TIER1_H,
        h: TIER2_H,
      }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Pin cap',
    qty: 1,
    color: '#e7dfd0',
    layer: 3,
    explosion: [0, 0, 54],
    note: 'retains the roller bushing and yoke on the crank pin',
    at: { x: 0, y: 0, z: g.topZ },
    solids: [capSolid({ postR: pinR, t: 2.8, wall: 2.6 })],
  });

  const checks = [
    { ok: true, text: `Exact Simple Harmonic Motion: x(θ) = ${r.toFixed(1)}·cos(θ) mm (zero 2nd-harmonic rod distortion).` },
    { ok: railXStart > discR + 2, text: `Stem guide rails clear the Ø${(discR * 2).toFixed(0)} mm crank rotor by ${(railXStart - discR).toFixed(1)} mm.` },
    { ok: slotHalfH >= r + 2, text: `Slot half-travel ${slotHalfH.toFixed(1)} mm leaves ${(slotHalfH - r).toFixed(1)} mm end clearance at ±90°.` },
    { ok: plateW <= 220, text: `Footprint ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm fits a 220 mm print bed.` },
  ];

  return { parts: [frame, crank, bushing, yoke, cap], checks, g };
}

export function pose(p, t = 0) {
  const g = geom(p);
  const th = t * DEG;
  const px = g.r * Math.cos(th);
  const py = g.r * Math.sin(th);
  return {
    frame: {},
    crank: { rot: th },
    bushing: { dx: px, dy: py },
    yoke: { dx: px, dy: 0 },
    cap: { dx: px, dy: py },
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const deg = ((t % 360) + 360) % 360;
  const th = deg * DEG;
  const x = g.r * Math.cos(th);
  const v = -g.r * Math.sin(th);
  const a = -g.r * Math.cos(th);
  return [
    { label: 'Crank θ', value: deg.toFixed(0), unit: '°' },
    { label: 'Yoke x(θ)', value: x.toFixed(1), unit: 'mm' },
    { label: 'Slot y(θ)', value: (g.r * Math.sin(th)).toFixed(1), unit: 'mm' },
    { label: 'Vel dx/dθ', value: v.toFixed(1), unit: 'mm/rad' },
    { label: 'Accel d²x', value: a.toFixed(1), unit: 'mm/rad²' },
  ];
}

export const steps = [
  {
    title: 'Right dead centre (θ = 0°, x = +r)',
    text: 'At θ = 0° the crank pin sits at the horizontal midline of the slot: x = +r, horizontal velocity is zero, and peak restoring acceleration points left.',
    t: 0,
    parts: ['crank', 'yoke', 'bushing'],
  },
  {
    title: 'Mid-stroke peak velocity (θ = 90°, x = 0)',
    text: 'At θ = 90° the roller bushing reaches the top of the vertical slot while the yoke passes through x = 0 at maximum linear speed v = −r·ω.',
    t: 90,
    parts: ['bushing', 'yoke'],
  },
  {
    title: 'Left dead centre (θ = 180°, x = −r)',
    text: 'Unlike a crank-and-slider, the left and right dead-centre accelerations have identical magnitudes |a| = r·ω² because there is no connecting-rod angle φ.',
    t: 180,
    parts: ['yoke', 'crank'],
  },
  {
    title: 'Pure cosine wave across any stroke',
    text: 'Increase stroke to 44 mm: the vertical slot and crank disc grow together, expanding harmonic amplitude to ±22 mm.',
    t: 45,
    parts: ['yoke', 'crank'],
    set: { stroke: 44 },
  },
];
