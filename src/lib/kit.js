/* kit.js — the print standard and the part vocabulary.

   Every mechanism in the catalogue is a printed kit that shares one standard:

     plate   4 mm base plate, 3.1 mm holes for 3 mm steel rod
     body    6 mm thick links, gears, cams and levers
     layer   parts stacked on one axle sit 8 mm apart, each on its own 1.6 mm
             hub, so nothing rubs and nothing needs a spacer
     fit     0.3 mm clearance on every turning bore, 0.1 mm interference on
             any part meant to stay put
     wall    2.4 mm minimum around a bore, 1.6 mm minimum web
     print   flat on the bed, 0.2 mm layers, no supports anywhere

   Mechanisms author their parts in this frame: z = 0 is the bed face, +z is up,
   and the assembled machine stacks the same parts along +z. That is why the
   browser can draw the exact triangles the STL export writes.
*/

import { circle, slot, rect, roundedRect, roundedRectC } from './profiles.js';

export const KIT = {
  rod: 3.0,
  fit: 0.3,
  press: 0.1,
  plateT: 4,
  bodyT: 6,
  layerPitch: 8,
  hubT: 1.6,
  hubR: 7,
  wall: 2.4,
  web: 1.6,
  density: 1.24, // g/cm³, PLA
};

/** Bore diameter for a rod, with a running fit (or an interference fit). */
export function boreFor(rod = KIT.rod, kind = 'turn') {
  return rod + (kind === 'press' ? -KIT.press : KIT.fit);
}

/** Assembled height of layer i: the base plate top is layer 0's floor. */
export const layerZ = (i) => KIT.plateT + i * KIT.layerPitch;

/** A plate solid. `holes` are [ring] arrays in the same local frame. */
export function slab({ outer, holes = [], z = 0, h }) {
  return { outer, holes, z, h };
}

/**
 * The body of a rotating part with its stand-off hub: a boss on the bed face,
 * then the body above it. Prints flat, stacks cleanly, no spacers.
 */
export function spunSolids({ outer, holes = [], bore = 0, hubR = KIT.hubR, hubT = KIT.hubT, t = KIT.bodyT }) {
  const out = [];
  if (hubT > 0) {
    out.push(slab({
      outer: circle(0, 0, Math.max(hubR, bore / 2 + KIT.wall), 40),
      holes: bore > 0 ? [circle(0, 0, bore / 2, 40)] : [],
      z: 0,
      h: hubT,
    }));
  }
  out.push(slab({ outer, holes, z: hubT, h: t }));
  return out;
}

/** A link (bar) between two bores, as a stadium, centred on its first bore. */
export function linkSolids({ length, width, t = KIT.bodyT, hubT = KIT.hubT, hubR = 6.5, bore = 0 }) {
  const outer = capsule(0, 0, length, 0, width / 2);
  const holes = [
    circle(0, 0, bore / 2, 32),
    circle(length, 0, bore / 2, 32),
  ];
  return spunSolids({ outer, holes, bore, hubR, hubT, t });
}

/** Stadium outline from (x1,y1) to (x2,y2). */
export function capsule(x1, y1, x2, y2, r, n = 16) {
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

/** A printed spacer: a thin annulus. */
export function washer({ r = 6, bore = 0, z = 0, h = 1 }) {
  return slab({ outer: circle(0, 0, r, 32), holes: [circle(0, 0, bore / 2, 32)], z, h });
}

/* --------------------------------------------------------------- hardware */

/** A steel rod: shown in the machine, never in the print pack. */
export function rodPart({ id, name, x, y, z0, z1, d = KIT.rod, note = '' }) {
  return {
    id,
    name,
    kind: 'hardware',
    material: 'steel rod',
    color: '#9aa3ab',
    note,
    solids: [slab({ outer: circle(x, y, d / 2, 20), z: z0, h: z1 - z0 })],
    at: { x: 0, y: 0, z: 0 },
  };
}

/** A printed push-on collar that keeps a part on its rod. */
export function collarPart({ id, name, x, y, z, d = KIT.rod, r = 5.2, h = 3, color }) {
  return {
    id,
    name,
    kind: 'print',
    material: 'PLA',
    color,
    note: 'push on the rod and add a drop of glue',
    solids: [slab({ outer: circle(x, y, r, 28), holes: [circle(x, y, (d + 0.15) / 2, 28)], z: 0, h })],
    at: { x: 0, y: 0, z },
  };
}

/* ------------------------------------------------------------------ parts */

/**
 * A part. `solids` are in the part's print-flat frame; `at` places it in the
 * assembled machine; `pivot` is the point a rotation turns about (usually 0,0).
 */
export function part({
  id, name, solids, at = { x: 0, y: 0, z: 0 }, pivot = { x: 0, y: 0 },
  kind = 'print', color, material = 'PLA', note = '', qty = 1, layer = 0,
  printId = null, role = 'part',
}) {
  if (!solids || !solids.length) throw new Error(`part ${id}: no solids`);
  return {
    id, name, solids, at, pivot, kind, color, material, note, qty, layer,
    printId: printId || id, role,
  };
}

/* ------------------------------------------------------------- base frames */

/**
 * A base plate: bores for the axle rods, printed rails that guide a slider, and
 * a ruler of tick holes along one edge. Ticks are drilled right through the
 * plate, so they print without a second shell and stay crisp at 0.2 mm layers.
 */
export function framePart({
  id = 'frame', name = 'Base frame', w, d, t = KIT.plateT, holes = [], rails = [], ticks = null,
  color = '#ece6da', note = 'the whole machine is bolted to this plate',
}) {
  const rings = holes.map((h) => h.ring ?? h);
  if (ticks) {
    // A ruler along one edge: `axis: 'x'` ticks hang off a horizontal edge,
    // `axis: 'y'` ticks off a vertical one. Every fifth tick is long.
    const { x0 = 0, y0 = 0, count, step, len = 3, width = 1.2, axis = 'x', from = 1 } = ticks;
    for (let i = 0; i <= count; i++) {
      const major = i % 5 === 0;
      const l = (major ? len * 1.7 : len) * from;
      if (axis === 'x') rings.push(rect(x0 + i * step - width / 2, y0, width, l));
      else rings.push(rect(x0, y0 + i * step - width / 2, l, width));
    }
  }
  const solids = [slab({ outer: roundedRectC(w, d, 5, 6), holes: rings, z: 0, h: t })];
  for (const rail of rails) {
    solids.push(slab({ outer: rail.outer, holes: rail.holes ?? [], z: rail.z ?? t, h: rail.h }));
  }
  return part({ id, name, solids, color, note });
}

export { circle, slot, rect, roundedRect, roundedRectC };

/* ------------------------------------------------------- repeatable kit bits */

/** The standard pivot post: Ø6.8, printed as part of the plate or a link. */
export const POST_R = 3.4;
export const CAP_T = 3;

/** A press cap that holds a link on a post. One print, many places. */
export function capSolid({ postR = POST_R, t = CAP_T, wall = 3.2 } = {}) {
  return slab({
    outer: circle(0, 0, postR + wall, 44),
    holes: [circle(0, 0, (postR * 2 - 0.3) / 2, 44)],
    z: 0,
    h: t,
  });
}

/** A post standing on a plate or on a link. */
export function postSolid({ x = 0, y = 0, z0, h, r = POST_R }) {
  return slab({ outer: circle(x, y, r, 36), z: z0, h });
}

/** A running bore on a post, with the clearance added. */
export const boreOn = (clearance = KIT.fit, postR = POST_R) => (postR * 2 + clearance) / 2;

/** A disc with a bore, a stand-off hub and lightening holes. */
export function discSolids({ radius, boreR, hubR = 10, t = KIT.bodyT, hubT = KIT.hubT, web = true, ringR = 0 }) {
  const holes = [circle(0, 0, boreR, 40)];
  if (web && radius > boreR + 14) {
    const rr = ringR || (radius + boreR) / 2;
    const holeR = Math.max(2, (radius - boreR) * 0.16);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      holes.push(circle(rr * Math.cos(a), rr * Math.sin(a), holeR, 18));
    }
  }
  return [
    slab({ outer: circle(0, 0, Math.max(hubR, boreR + 2.4), 40), holes: [circle(0, 0, boreR, 40)], z: 0, h: hubT }),
    slab({ outer: circle(0, 0, radius, 64), holes, z: hubT, h: t }),
  ];
}

/** An arm from a pivot to a tip, with a boss at each end. */
export function armSolids({ length, width = 13, boreR, bossR = 6.8, t = KIT.bodyT, hubT = KIT.hubT }) {
  return [
    slab({ outer: circle(0, 0, bossR, 36), holes: [circle(0, 0, boreR, 36)], z: 0, h: hubT }),
    slab({
      outer: capsule(0, 0, length, 0, width / 2, 18),
      holes: [circle(0, 0, boreR, 36), circle(length, 0, boreR, 36)],
      z: hubT,
      h: t,
    }),
  ];
}

/* ------------------------------------------- motor & servo shaft bores */

export const SHAFT_OPTIONS = [
  { value: 'post', label: 'Baseplate pivot post (Ø6.8 mm slip-fit)' },
  { value: 'nema17', label: 'NEMA 17 stepper (5 mm D-shaft)' },
  { value: 'n20', label: 'N20 / TT gearmotor (3 mm D-shaft)' },
  { value: 'sg90', label: 'SG90 / MG90S micro servo (4.8 mm spline)' },
  { value: 'mg996r', label: 'MG996R standard servo (5.8 mm 25T spline)' },
  { value: 'dowel8', label: '8 mm wood / steel shaft (press-fit)' },
];

/** Flat-sided D-shaft bore centered at (0,0) with flat on the +x side. */
export function dShaftProfile(r, flatX, n = 36) {
  const xFlat = Math.min(r - 0.15, Math.max(-r + 0.2, flatX));
  const a0 = Math.acos(xFlat / r);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((Math.PI * 2 - 2 * a0) * i) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/** Return the 2D bore ring, outer hub radius, and human description for a chosen motor/servo shaft. */
export function shaftSpec(shaft = 'post', clearance = 0.3) {
  const fit = Math.max(0.08, clearance * 0.45);
  switch (shaft) {
    case 'nema17': {
      const r = 2.5 + fit * 0.5;
      const flatX = 2.0 + fit * 0.4; // 4.5 mm across the D-flat on a 5 mm shaft
      return {
        id: 'nema17',
        label: '5 mm NEMA 17 D-shaft',
        ring: dShaftProfile(r, flatX, 36),
        postR: 2.5,
        hubR: 8.5,
        hasFramePost: false,
        note: '5.0 mm D-bore (4.5 mm across flat) for direct press-fit onto a NEMA 17 stepper shaft',
      };
    }
    case 'n20': {
      const r = 1.5 + fit * 0.45;
      const flatX = 1.0 + fit * 0.35; // 2.5 mm across D-flat on a 3 mm shaft
      return {
        id: 'n20',
        label: '3 mm N20 D-shaft',
        ring: dShaftProfile(r, flatX, 32),
        postR: 1.5,
        hubR: 7.5,
        hasFramePost: false,
        note: '3.0 mm D-bore (2.5 mm across flat) for N20 / TT DC gearmotors',
      };
    }
    case 'sg90': {
      const r = 2.4 + fit * 0.4; // 4.8 mm SG90 21T spline press-fit
      return {
        id: 'sg90',
        label: '4.8 mm SG90 spline',
        ring: circle(0, 0, r, 21),
        postR: 2.4,
        hubR: 8.5,
        hasFramePost: false,
        note: 'Ø4.8 mm 21-tooth spline bore for SG90 / MG90S micro servos (secure with M2 × 6 screw)',
      };
    }
    case 'mg996r': {
      const r = 2.9 + fit * 0.4; // 5.8 mm Futaba/MG996R 25T spline
      return {
        id: 'mg996r',
        label: '5.8 mm 25T servo spline',
        ring: circle(0, 0, r, 25),
        postR: 2.9,
        hubR: 9.5,
        hasFramePost: false,
        note: 'Ø5.8 mm 25-tooth spline bore for MG996R / standard hobby servos (secure with M3 screw)',
      };
    }
    case 'dowel8': {
      const r = 4.0 + fit * 0.35;
      return {
        id: 'dowel8',
        label: '8 mm round shaft',
        ring: circle(0, 0, r, 40),
        postR: 4.0,
        hubR: 10.2,
        hasFramePost: false,
        note: 'Ø8.0 mm bore for standard 8 mm steel rod or wooden dowel',
      };
    }
    case 'post':
    default: {
      const r = boreOn(clearance, POST_R);
      return {
        id: 'post',
        label: 'Ø6.8 mm baseplate post',
        ring: circle(0, 0, r, 40),
        postR: POST_R,
        hubR: 9.6,
        hasFramePost: true,
        note: `Ø${(r * 2).toFixed(2)} mm slip-fit bore on integral Ø6.8 mm baseplate post`,
      };
    }
  }
}

/* ------------------------------------------------ color themes & hardware */

export const COLOR_THEMES = {
  'sky-gold': {
    id: 'sky-gold',
    label: 'Sky & Gold (Default)',
    primary: '#dcb038',    // Warm Gold (driver / input)
    secondary: '#5aa2d4',  // Light Sky Blue (driven / follower)
    tertiary: '#82c0e4',   // Soft Powder Blue (coupler / cluster)
    accent: '#489e8b',     // Seafoam Teal (springs / belts / coils)
    frame: '#efeae0',      // Soft Warm Paper
    cap: '#dfd8ca',        // Muted Linen
    hardware: '#8d99a4',   // Brushed Steel
  },
  'cmyk': {
    id: 'cmyk',
    label: 'CMYK',
    primary: '#e5c520',    // Process Yellow
    secondary: '#009fe3',  // Process Cyan
    tertiary: '#e6007e',   // Process Magenta
    accent: '#2b2b2e',     // Process Key / Black
    frame: '#f2f0eb',
    cap: '#d2d0cc',
    hardware: '#73737a',
  },
  'grayscale': {
    id: 'grayscale',
    label: 'Grayscale',
    primary: '#4d5156',    // Dark neutral slate
    secondary: '#8a9199',  // Mid gray
    tertiary: '#b4bac2',   // Light slate gray
    accent: '#34373b',     // Charcoal accent
    frame: '#ebecee',
    cap: '#d0d4da',
    hardware: '#656b73',
  },
  'patent': {
    id: 'patent',
    label: 'Patent Ink',
    primary: '#faf6ee',
    secondary: '#faf6ee',
    tertiary: '#faf6ee',
    accent: '#faf6ee',
    frame: '#faf6ee',
    cap: '#faf6ee',
    hardware: '#ede7da',
    patent: true,
  },
  'hatches': {
    id: 'hatches',
    label: 'Different Hatches',
    primary: '#e8e2d4',    // Distinct hatching pattern in 2D & shaded tonal fill
    secondary: '#ded6c4',
    tertiary: '#d4cbba',
    accent: '#443f38',
    frame: '#f4efe4',
    cap: '#cac1b0',
    hardware: '#8d877e',
    hatch: true,
  },
  'spectrum': {
    id: 'spectrum',
    label: 'Spectrum (Muted)',
    primary: '#c4695d',    // Muted terracotta / coral
    secondary: '#4d8fa8',  // Muted cerulean / ocean
    tertiary: '#d49b42',   // Muted amber
    accent: '#629874',     // Muted sage green
    frame: '#eeeae1',
    cap: '#8c7fa6',        // Muted lavender
    hardware: '#7a818c',
  },
};

/**
 * Determine whether a part should be toggled by the "Hardware" button:
 * includes steel rods/fasteners (`kind === 'hardware'`), press-fit retainer
 * caps (`cap*`), compliant return springs (`spring`), and motor endbells.
 */
export function isHardwarePart(part) {
  if (!part) return false;
  if (part.kind === 'hardware' || part.role === 'hardware' || part.role === 'fastener') return true;
  if (/^cap(-|$)/.test(part.id) || part.id === 'spring' || part.id === 'endbell') return true;
  return false;
}

/** Classify a part into a semantic color slot for theme switching. */
export function partColorSlot(part) {
  if (!part) return 'primary';
  if (part.role === 'frame' || part.id === 'frame') return 'frame';
  if (part.kind === 'hardware') return 'hardware';
  if (/^cap(-|$)/.test(part.id)) return 'cap';
  const c = String(part.color || '').toLowerCase();
  if (c === '#ece6da' || c === '#efeae0') return 'frame';
  if (c === '#e7dfd0' || c === '#dfd8ca') return 'cap';
  if (c === '#2f7a54' || c === '#489e8b' || part.id === 'spring' || part.id === 'belt') return 'accent';
  if (c === '#cf5a28' || c === '#cf6a34' || c === '#dcb038' || c === '#e2b842') return 'primary';
  if (c === '#39699c' || c === '#3f6888' || c === '#5aa2d4' || c === '#67b0e0') return 'secondary';
  if (c === '#b08b4a' || c === '#82c0e4' || c === '#e6c865') return 'tertiary';
  return 'secondary';
}

/** Return the hex color for a part under the active color theme. */
export function resolvePartColor(part, themeId = 'sky-gold') {
  const theme = COLOR_THEMES[themeId] || COLOR_THEMES['sky-gold'];
  const slot = partColorSlot(part);
  return theme[slot] || part?.color || theme.primary;
}


