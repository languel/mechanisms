/* mesh.js — polygons in, printable triangles out.

   Every printed part in the catalogue is an extruded 2D profile: a plate with
   bores, slots and lightening holes. That keeps the parametric model honest —
   the browser draws the very triangles the STL export writes, so what you see
   is what you print.

   Caps are cut by a scanline: the profile is sliced into horizontal bands at
   every vertex height, each band is paired left-to-right by the even-odd rule,
   and every band boundary is split at every vertex that lies on it. Both
   neighbours of a boundary therefore use the same points, so the triangulation
   has no T-junctions and the side walls can be built straight from the cap's
   own boundary edges. tests/mesh.test.js proves every profile in the catalogue
   extrudes to a closed, consistently wound solid of exactly the right volume.
*/

/* ---------------------------------------------------------------- polygons */

/** Signed area. Positive = counter-clockwise. */
export function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const crossOf = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Drop repeated points, including a repeated closing point. */
export function cleanPolygon(poly, tol = 1e-7) {
  const out = [];
  const t2 = tol * tol;
  for (const p of poly) {
    const q = out[out.length - 1];
    if (q && dist2(q, p) < t2) continue;
    out.push([p[0], p[1]]);
  }
  while (out.length > 2 && dist2(out[0], out[out.length - 1]) < t2) out.pop();
  return out;
}

/**
 * Remove exactly-collinear vertices. Caps and side walls must be built from the
 * same vertex set or the mesh will not be closed, so everything goes through
 * this before triangulation.
 */
export function simplifyRing(poly, tol = 1e-9) {
  const p = cleanPolygon(poly);
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (Math.abs(crossOf(a, b, c)) <= tol) {
        p.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return p;
}

/** Reverse a polygon if needed so that it winds the given way. */
export function orient(poly, ccw = true) {
  const p = cleanPolygon(poly);
  if (p.length < 3) return p;
  return (signedArea(p) > 0) === ccw ? p : p.slice().reverse();
}

export function pointInPolygon(pt, poly) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------ triangulator */

const xAt = (a, b, y) => {
  if (Math.abs(y - a[1]) <= 1e-9) return a[0];
  if (Math.abs(y - b[1]) <= 1e-9) return b[0];
  return a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
};

/** Points of `xs` strictly between xa and xb, sorted, plus the ends. */
function splitLine(y, xa, xb, xs) {
  const out = [[xa, y]];
  for (const x of xs) {
    if (x > xa + 1e-7 && x < xb - 1e-7) out.push([x, y]);
  }
  out.push([xb, y]);
  return out;
}

/** Merge two x-monotone chains into triangles. */
function strip(bottom, top, out) {
  let i = 0, j = 0;
  const nb = bottom.length - 1, nt = top.length - 1;
  let guard = 0;
  while ((i < nb || j < nt) && guard++ < 10000) {
    if (j >= nt || (i < nb && bottom[i + 1][0] <= top[j + 1][0])) {
      out.push([bottom[i], bottom[i + 1], top[j]]);
      i++;
    } else {
      out.push([top[j + 1], top[j], bottom[i]]);
      j++;
    }
  }
}

/**
 * Triangulate a polygon with holes by scanline decomposition.
 *
 * The profile is cut at every vertex height. Inside each band every edge is a
 * straight segment, so sorting them left to right and pairing them (even-odd)
 * gives the solid intervals between the outer ring and the holes — no bridging,
 * no pinch points, and nothing to go wrong when holes nearly touch.
 *
 * @param {number[][]} outer
 * @param {number[][][]} holes
 * @returns {number[][][]} counter-clockwise triangles
 */
export function triangulate(outer, holes = []) {
  const rings = [orient(simplifyRing(outer), true)];
  for (const h of holes) {
    const r = orient(simplifyRing(h), false);
    if (r.length >= 3 && Math.abs(signedArea(r)) > 1e-9) rings.push(r);
  }
  const shell = rings[0];
  if (shell.length < 3) return [];

  const edges = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (Math.abs(a[1] - b[1]) < 1e-12) continue; // horizontal edges bound no band
      edges.push({
        a, b, ymin: Math.min(a[1], b[1]), ymax: Math.max(a[1], b[1]),
      });
    }
  }
  edges.sort((p, q) => p.ymin - q.ymin);

  const ysRaw = [];
  for (const ring of rings) for (const p of ring) ysRaw.push(p[1]);
  ysRaw.sort((a, b) => a - b);
  const ys = [];
  for (const y of ysRaw) if (!ys.length || y - ys[ys.length - 1] > 1e-9) ys.push(y);

  // x of every vertex sitting on each band line, for splitting the boundaries
  const lineX = ys.map((y) => {
    const xs = [];
    for (const ring of rings) {
      for (const p of ring) if (Math.abs(p[1] - y) <= 1e-9) xs.push(p[0]);
    }
    xs.sort((a, b) => a - b);
    const out = [];
    for (const x of xs) if (!out.length || x - out[out.length - 1] > 1e-7) out.push(x);
    return out;
  });

  const tris = [];
  const active = [];
  let next = 0;
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k], y1 = ys[k + 1];
    if (y1 - y0 < 1e-9) continue;
    while (next < edges.length && edges[next].ymin <= y0 + 1e-9) active.push(edges[next++]);
    for (let i = active.length - 1; i >= 0; i--) if (active[i].ymax <= y0 + 1e-9) active.splice(i, 1);

    const ym = (y0 + y1) / 2;
    const spans = [];
    for (const e of active) {
      if (e.ymax < y1 - 1e-9) continue;
      spans.push({ x: xAt(e.a, e.b, ym), x0: xAt(e.a, e.b, y0), x1: xAt(e.a, e.b, y1) });
    }
    if (!spans.length) continue;
    spans.sort((p, q) => p.x - q.x);
    if (spans.length % 2 !== 0) {
      throw new Error(`scanline: ${spans.length} crossings at y=${ym.toFixed(3)} — the profile is not a simple set of rings`);
    }
    for (let i = 0; i < spans.length; i += 2) {
      const L = spans[i], R = spans[i + 1];
      if (R.x0 - L.x0 < 1e-9 && R.x1 - L.x1 < 1e-9) continue;
      strip(
        splitLine(y0, L.x0, R.x0, lineX[k]),
        splitLine(y1, L.x1, R.x1, lineX[k + 1]),
        tris,
      );
    }
  }

  const out = tris
    .filter((t) => Math.abs(signedArea(t)) > 1e-12)
    .map((t) => (signedArea(t) < 0 ? [t[0], t[2], t[1]] : t));

  // Self-check: a correct triangulation covers exactly the ring's area. If a
  // hole crosses its outline, or two rings overlap, the scanline still returns
  // something plausible — this is what catches it.
  let expected = Math.abs(signedArea(shell));
  for (let i = 1; i < rings.length; i++) expected -= Math.abs(signedArea(rings[i]));
  const got = out.reduce((a, t) => a + signedArea(t), 0);
  if (Math.abs(got - expected) > Math.max(1e-6, Math.abs(expected) * 1e-6)) {
    throw new Error(
      `profile does not triangulate cleanly: covered ${got.toFixed(3)} mm² but the rings enclose `
      + `${expected.toFixed(3)} mm² (a hole probably crosses the outline)`,
    );
  }
  return out;
}

/* -------------------------------------------------------------- extrusion */

/**
 * Extrude a profile (outer ring + holes) between z and z + h.
 * @returns {number[][][]} triangles [[x,y,z],[x,y,z],[x,y,z]] with outward normals
 */
export function extrude({ outer, holes = [], z = 0, h }) {
  if (!(h > 0)) throw new Error('extrude: height must be positive');
  const snap = (v) => Math.round(v * 1e4) / 1e4;
  const snapRing = (r) => cleanPolygon(r.map((p) => [snap(p[0]), snap(p[1])]));
  const cleanOuter = snapRing(outer);
  const cleanHoles = (holes || []).map(snapRing).filter((r) => r.length >= 3);
  const cap = triangulate(cleanOuter, cleanHoles);
  if (!cap.length) return [];

  const tris = [];
  for (const t of cap) {
    tris.push([
      [t[0][0], t[0][1], z + h], [t[1][0], t[1][1], z + h], [t[2][0], t[2][1], z + h],
    ]);
    tris.push([
      [t[2][0], t[2][1], z], [t[1][0], t[1][1], z], [t[0][0], t[0][1], z],
    ]);
  }

  // Side walls come from the cap's own boundary edges, so cap and wall share
  // every vertex exactly — including the extra points the scanline added where
  // a band meets a vertex on the same line.
  const boundary = new Map();
  const undirected = (p, q) => {
    const a = `${key2(p)}|${key2(q)}`, b = `${key2(q)}|${key2(p)}`;
    return a < b ? a : b;
  };
  for (const t of cap) {
    for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const u = undirected(p, q);
      if (boundary.has(u)) boundary.delete(u);
      else boundary.set(u, [p, q]);
    }
  }

  // Outer ring runs counter-clockwise and holes clockwise, so the solid lies to
  // the left of every boundary walk and the outward normal is the walk rotated
  // by -90°.
  for (const [p, q] of boundary.values()) {
    const A0 = [p[0], p[1], z], B0 = [q[0], q[1], z];
    const B1 = [q[0], q[1], z + h], A1 = [p[0], p[1], z + h];
    tris.push([A0, B0, B1]);
    tris.push([A0, B1, A1]);
  }
  return quantize(tris);
}

const key2 = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;

/**
 * Snap coordinates to a 0.1 µm grid. Cap and wall vertices are computed by
 * different routes (interpolation along a band, and a ring point), so they can
 * differ in the last bits. Binary STL is float32, which would keep that
 * difference and leave the mesh non-watertight in a slicer's exact-edge sense;
 * quantising first makes every shared vertex bit-identical after the cast.
 */
const Q = 1e4;   // 0.1 µm
const q = (v) => Math.round(v * Q) / Q;
export function quantize(tris) {
  return tris.map((t) => t.map((v) => [q(v[0]), q(v[1]), q(v[2])]));
}

/** Extrude a stack of {outer, holes, z, h} solids into one triangle list. */
export function extrudeSolids(solids) {
  return solids.flatMap((s) => extrude(s));
}

/* ------------------------------------------------------------------ checks */

const key = (v) => `${Math.round(v[0] * 1e6)},${Math.round(v[1] * 1e6)},${Math.round(v[2] * 1e6)}`;

/**
 * A printable mesh must be closed and consistently wound.
 *
 * The rule: every directed edge is matched by the same number of its reverse.
 * That is what a slicer needs to see a closed surface. It allows one thing on
 * purpose — a part built from stacked solids (a hub under a link) shares a face
 * at the interface, so those internal edges appear in equal pairs. The check
 * counts them separately as `interfaces` so the report can say so.
 */
export function checkMesh(tris) {
  const edges = new Map();
  let volume = 0;
  for (const [a, b, c] of tris) {
    if (!a || !b || !c) return { closed: false, problems: [{ edge: 'degenerate' }], volume: 0, triangles: tris.length };
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = `${key(p)}|${key(q)}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
    volume += (
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6;
  }
  const problems = [];
  let interfaces = 0;
  for (const [k, n] of edges) {
    const [p, q] = k.split('|');
    const rev = edges.get(`${q}|${p}`) || 0;
    if (rev !== n) {
      problems.push({ edge: k, count: `${n} forward vs ${rev} reverse — the surface is open or folded` });
    } else if (n > 1) {
      interfaces += n - 1;
    }
  }
  return {
    closed: problems.length === 0,
    volume,
    triangles: tris.length,
    edges: edges.size,
    interfaces,
    problems: problems.slice(0, 6),
  };
}

export function bbox(tris) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const v of t) for (let i = 0; i < 3; i++) {
    if (v[i] < lo[i]) lo[i] = v[i];
    if (v[i] > hi[i]) hi[i] = v[i];
  }
  return { min: lo, max: hi, size: hi.map((v, i) => v - lo[i]) };
}

/* -------------------------------------------------------------------- STL */

function normalOf(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/** Binary STL in millimetres. */
export function stlBinary(tris, header = 'mechanisms catalogue') {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buf);
  const enc = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, enc.length).set(enc);
  view.setUint32(80, tris.length, true);
  let o = 84;
  for (const [a, b, c] of tris) {
    const n = normalOf(a, b, c);
    view.setFloat32(o, n[0], true);
    view.setFloat32(o + 4, n[1], true);
    view.setFloat32(o + 8, n[2], true);
    let p = o + 12;
    for (const v of [a, b, c]) {
      view.setFloat32(p, v[0], true);
      view.setFloat32(p + 4, v[1], true);
      view.setFloat32(p + 8, v[2], true);
      p += 12;
    }
    o += 50;
  }
  return new Uint8Array(buf);
}
