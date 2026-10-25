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
  color = '#d9d0c1', note = 'the whole machine is bolted to this plate',
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
