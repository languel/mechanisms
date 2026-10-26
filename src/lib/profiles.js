/* profiles.js — the 2D vocabulary every mechanism is drawn with.

   All dimensions are millimetres, in the part's own print-flat frame. Profiles
   are plain arrays of [x, y] points, so a part is just a list of extrusions and
   the same numbers feed the viewer and the STL export.
*/

const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ basics */

export function circle(cx, cy, r, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function arc(cx, cy, r, a0, a1, n = 24) {
  const pts = [];
  const steps = Math.max(2, n);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function rect(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** Rectangle centred on the origin. */
export function rectC(w, h) {
  return rect(-w / 2, -h / 2, w, h);
}

export function roundedRect({ x, y, w, h, r = 2, n = 6 }) {
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  if (r <= 0.01) return rect(x, y, w, h);
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return pts;
}

/** Rounded rectangle centred on the origin (rounded in plan, both ends). */
export function roundedRectC(w, h, r = 2, n = 6) {
  return roundedRect({ x: -w / 2, y: -h / 2, w, h, r, n });
}

/** A slot: two straight sides and two semicircular ends, as a hole profile. */
export function slot(x1, y1, x2, y2, width, n = 14) {
  return capsule(x1, y1, x2, y2, width / 2, n);
}

export function capsule(x1, y1, x2, y2, r, n = 14) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(...[]); // keep shape simple below
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = a - Math.PI / 2 + (i / n) * Math.PI;
    out.push([x2 + r * Math.cos(t), y2 + r * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = a + Math.PI / 2 + (i / n) * Math.PI;
    out.push([x1 + r * Math.cos(t), y1 + r * Math.sin(t)]);
  }
  void pts;
  return out;
}

/** An annulus, ready to use as a hole list: outer ring plus one hole. */
export function annulus(cx, cy, rOuter, rInner, n = 48) {
  return { outer: circle(cx, cy, rOuter, n), holes: [circle(cx, cy, rInner, n)] };
}

/** Rotate a point list about a centre. */
export function rotateProfile(pts, angle, cx = 0, cy = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

export function translateProfile(pts, dx, dy) {
  return pts.map(([x, y]) => [x + dx, y + dy]);
}

/* ------------------------------------------------------------------- gears */

/** Half tooth angle of an involute gear at radius r (radians). */
function involuteHalfAngle({ rp, rb, z, backlash }, r) {
  const inv = (rad) => {
    const a = Math.acos(Math.min(1, rb / Math.max(rad, rb)));
    return Math.tan(a) - a;
  };
  const invP = inv(rp);
  return Math.PI / (2 * z) - backlash / (2 * rp) + invP - inv(r);
}

/**
 * Involute spur gear outline: a printable tooth form (20° pressure angle by
 * default, real involute flanks, a little backlash so a printed pair meshes).
 *
 * @param {object} o
 * @param {number} o.teeth
 * @param {number} o.module pitch diameter = module × teeth
 * @param {number} [o.pressure=20] pressure angle, degrees
 * @param {number} [o.backlash=0.18] tooth thinning at the pitch circle, mm
 * @param {number} [o.bore=0] bore diameter, mm
 * @param {number} [o.hub=0] hub height, mm (>0 adds a hub solid)
 * @param {number} [o.samples=5] points per involute flank
 * @param {number} [o.rotate=0] phase, radians
 */
export function gearProfile({
  teeth,
  module,
  pressure = 20,
  backlash = 0.18,
  bore = 0,
  hub = 0,
  hubRadius = 0,
  web = true,
  samples = 5,
  rotate = 0,
}) {
  const m = module, z = teeth;
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(pressure * DEG);
  const rf = Math.max(1.2, rp - 1.25 * m);
  const g = { rp, rb, z, backlash };
  const half = (r) => involuteHalfAngle(g, r);

  // Tip radius: the nominal addendum, pulled back if the tooth would come to a
  // point (small tooth counts).
  let ra = rp + m;
  const minHalf = 0.012;
  if (half(ra) < minHalf) {
    let lo = Math.max(rb, rf), hi = ra;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (half(mid) < minHalf) hi = mid; else lo = mid;
    }
    ra = lo;
  }
  const rStart = Math.max(rb, rf);
  const flank = [];
  for (let i = 0; i <= samples; i++) flank.push(rStart + ((ra - rStart) * i) / samples);

  const step = TAU / z;
  const pts = [];
  for (let k = 0; k < z; k++) {
    const mid = k * step + rotate;
    // root arc across the space, from the previous tooth to this one
    pts.push(...arc(0, 0, rf, mid - step / 2, mid - half(rStart), 3));
    if (rf < rb) {
      // below the base circle the flank is radial
      pts.push([rf * Math.cos(mid - half(rb)), rf * Math.sin(mid - half(rb))]);
    }
    for (const r of flank) pts.push([r * Math.cos(mid - half(r)), r * Math.sin(mid - half(r))]);
    for (let i = 1; i <= 2; i++) {
      const a = mid - half(ra) + (i / 3) * (2 * half(ra));
      pts.push([ra * Math.cos(a), ra * Math.sin(a)]);
    }
    for (let i = flank.length - 1; i >= 0; i--) {
      const r = flank[i];
      pts.push([r * Math.cos(mid + half(r)), r * Math.sin(mid + half(r))]);
    }
    if (rf < rb) pts.push([rf * Math.cos(mid + half(rb)), rf * Math.sin(mid + half(rb))]);
    pts.push(...arc(0, 0, rf, mid + half(rStart), mid + step / 2, 3));
  }

  const outer = dedupeRing(pts);
  const holes = [];
  if (bore > 0) holes.push(circle(0, 0, bore / 2, 40));
  if (web && rf > 9 && bore > 0) {
    const ringR = (Math.max(bore / 2 + 2.6, rf * 0.34) + rf * 0.72) / 2;
    const count = z >= 20 ? 5 : 4;
    const holeR = Math.max(1.3, Math.min(ringR * 0.5, rf * 0.14));
    if (ringR - holeR > bore / 2 + 1.4 && ringR + holeR < rf - 1.8) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + Math.PI / count;
        holes.push(circle(ringR * Math.cos(a), ringR * Math.sin(a), holeR, 20));
      }
    }
  }
  return {
    outer,
    holes,
    pitchRadius: rp,
    baseRadius: rb,
    tipRadius: ra,
    rootRadius: rf,
    hub: hub > 0
      ? {
        outer: circle(0, 0, Math.max(hubRadius, bore ? bore / 2 + 2.4 : 4), 36),
        holes: bore ? [circle(0, 0, bore / 2, 40)] : [],
        height: hub,
      }
      : null,
  };
}

/**
 * Straight rack. Teeth run along +x with the pitch line at y = 0; the body
 * extends down to -height. Meshes with a pinion whose centre sits at y = +rp.
 */
export function rackProfile({
  teeth,
  module,
  pressure = 20,
  backlash = 0.18,
  height = 8,
  x0 = 0,
}) {
  const m = module, p = Math.PI * m;
  const tanP = Math.tan(pressure * DEG);
  const tip = m;
  const root = -1.25 * m;
  const tipHalf = p / 4 - backlash / 2 - m * tanP;
  const rootHalf = p / 4 - backlash / 2 + 1.25 * m * tanP;
  const xEnd = x0 + teeth * p;
  const pts = [[x0, -height], [x0, root]];
  for (let k = 0; k < teeth; k++) {
    const c = x0 + p / 2 + k * p;
    pts.push([c - rootHalf, root]);
    pts.push([c - tipHalf, tip]);
    pts.push([c + tipHalf, tip]);
    pts.push([c + rootHalf, root]);
  }
  pts.push([xEnd, root], [xEnd, -height]);
  return { outer: dedupeRing(pts), pitchLine: 0, tip, root, end: xEnd, pitch: p, start: x0 };
}

/* -------------------------------------------------------------------- cams */

/** Follower motion laws, normalised 0→1 over the travel. */
export const laws = {
  harmonic: (s) => 0.5 - 0.5 * Math.cos(Math.PI * s),
  cycloidal: (s) => s - Math.sin(TAU * s) / TAU,
  parabolic: (s) => (s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s)),
};

function segmentsCut(a, b, c, d) {
  const d1 = cross2(c, d, a), d2 = cross2(c, d, b), d3 = cross2(a, b, c), d4 = cross2(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Radius of the circle through three points (curvature radius, r → ∞ if flat). */
function circumradius(a, b, c) {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  if (area2 < 1e-9) return Infinity;
  return (ab * bc * ca) / (2 * area2);
}

/**
 * Radial roller-follower cam.
 *
 * The cam outline is the pitch curve — radius baseRadius + lift·law(θ) — pulled
 * in along its normal by the roller radius, so the roller centre rides exactly
 * on the law. Returns the outline plus the numbers the page reports: the
 * tightest concave radius (which sets the largest roller the cam can take) and
 * whether this combination undercuts.
 */
export function camProfile({
  baseRadius = 18,
  lift = 8,
  rollerRadius = 5,
  rise = 120,
  top = 60,
  fall = 120,
  bottom = 60,
  law = 'cycloidal',
  samples = 2,
} = {}) {
  const total = rise + top + fall + bottom;
  const f = laws[law] || laws.cycloidal;
  const N = Math.max(240, Math.round(total * samples));
  const pitch = [];
  for (let i = 0; i <= N; i++) {
    const deg = (i / N) * total;
    let s;
    if (deg < rise) s = f(deg / rise);
    else if (deg < rise + top) s = 1;
    else if (deg < rise + top + fall) s = 1 - f((deg - rise - top) / fall);
    else s = 0;
    const th = deg * DEG;
    const r = baseRadius + lift * s;
    pitch.push([r * Math.cos(th), r * Math.sin(th), s, deg]);
  }

  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = pitch[i], b = pitch[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = dy / len, ny = -dx / len;
    if (a[0] * nx + a[1] * ny < 0) { nx = -nx; ny = -ny; }
    pts.push([a[0] - rollerRadius * nx, a[1] - rollerRadius * ny]);
  }

  let tightest = Infinity;
  for (let i = 0; i < pitch.length - 2; i++) {
    tightest = Math.min(tightest, circumradius(pitch[i], pitch[i + 1], pitch[i + 2]));
  }
  const outer = dedupeRing(pts);
  const minRadius = Math.min(...outer.map((p) => Math.hypot(p[0], p[1])));

  // A roller wider than the tightest concave corner folds the outline over
  // itself. Folds are local, so comparing each segment with its neighbours is
  // enough and stays fast enough to run on every slider move.
  let folded = false;
  const W = 36;
  for (let i = 0; i < outer.length && !folded; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    for (let k = 2; k < W && k < outer.length - 2; k++) {
      const j = (i + k) % outer.length;
      const c = outer[j], d = outer[(j + 1) % outer.length];
      if (segmentsCut(a, b, c, d)) { folded = true; break; }
    }
  }

  return {
    outer,
    pitch,
    minRadius,
    tightest,
    folded,
    undercut: folded || tightest < rollerRadius * 1.02,
    degrees: pitch.map((p) => p[3]),
    totalAngle: total,
    maxRoller: tightest,
  };
}

/** Cam lift at a shaft angle in degrees, from the same law the outline uses. */
export function camLift({ lift, rise, top, fall, bottom, law = 'cycloidal' }, deg) {
  const total = rise + top + fall + bottom;
  const d = ((deg % total) + total) % total;
  const f = laws[law] || laws.cycloidal;
  if (d < rise) return lift * f(d / rise);
  if (d < rise + top) return lift;
  if (d < rise + top + fall) return lift * (1 - f((d - rise - top) / fall));
  return 0;
}

/* ------------------------------------------------------------------ helper */

/** Remove points closer together than tol, and points on a straight run. */
export function dedupeRing(pts, tol = 1e-4) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) continue;
    out.push([round(p[0]), round(p[1])]);
  }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < tol) out.pop();
  return out;
}

function round(v) {
  return Math.round(v * 1e4) / 1e4;
}

/** Snap a value to a sensible print increment. */
export function snap(v, step) {
  return Math.round(v / step) * step;
}

/* ---------------------------------------------------------------- ratchets */

/**
 * Ratchet wheel outline: asymmetric teeth with a steep drive face and a long
 * back slope, so a pawl can ride over them in one direction only.
 */
export function ratchetProfile({ teeth = 12, rOuter = 30, rRoot = 23 }) {
  const step = TAU / teeth;
  const pts = [];
  for (let k = 0; k < teeth; k++) {
    const a0 = k * step;
    // Tooth crest at a0, descending along a smooth 86% back slope to rRoot
    const rampSteps = 7;
    for (let j = 0; j <= rampSteps; j++) {
      const u = (0.86 * j) / rampSteps;
      const r = rOuter - (rOuter - rRoot) * (j / rampSteps);
      const a = a0 + u * step;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    // Root pocket flat at the base of the steep radial drive face (86% -> 94% of step)
    const aPocket = a0 + 0.94 * step;
    pts.push([rRoot * Math.cos(aPocket), rRoot * Math.sin(aPocket)]);
    // From 94% to 100% (next tooth's a0), the steep drive face rises sharply to rOuter
  }
  return { outer: dedupeRing(pts), step };
}

/**
 * Pawl outline: a bar from the pivot to a nose that sits slightly below the bar's
 * axis, so the nose drops into a tooth gap while the body clears the tips.
 */
export function pawlProfile({ length = 30, width = 9, nose = 3.2, drop = 2.2 }) {
  const r = width / 2;
  return { outer: dedupeRing(capsule(0, 0, length - r * 1.4, -drop, r, 14)) };
}

/* ------------------------------------------------------------------ Geneva */

/**
 * Geneva (Maltese cross) driven wheel, built to the standard construction.
 *
 * With n slots and a centre distance C:
 *   pin circle radius  ρ = C·sin(π/n)      (this is also the wheel's rim radius)
 *   slot bottom        = C − ρ
 *   locking arc radius r_a = C − R_lock    (the driver's locking disc radius R_lock
 *                                           sits in this arc, so the wheel cannot move)
 *
 * The outline is the rim, broken by n radial slots (straight sides, round bottom)
 * and n concave locking arcs (radius r_a centred on the wheel).
 */
export function genevaProfile({
  slots = 4,
  radius = 36,
  slotWidth = 8.2,
}) {
  const n = slots;
  const R = radius;
  const beta0 = Math.PI / n;
  // Exact tangent entry right triangle: R = C * cos(pi/n), pinRadius = R * tan(pi/n) = C * sin(pi/n)
  // Ensure C - R >= 8.5 mm even for high slot counts (n = 7, 8) so the wheel rim clears the driver shaft
  const C = Math.max(R / Math.cos(beta0), R + 8.5);
  const rho = Math.sqrt(Math.max(16, C * C - R * R));
  const slotBottom = Math.max(6.2, C - rho - 0.8);
  const step = TAU / n;

  const dSlot = Math.asin(Math.min(0.75, slotWidth / 2 / R));
  const back = Math.asin(Math.min(0.85, slotWidth / 2 / slotBottom));
  const hornArc = Math.max(0.055, beta0 * 0.14);
  const phiScallop = Math.max(0.08, beta0 - dSlot - hornArc);

  // Exact concave scallop centered at the driver axle (C * cos(aMid), C * sin(aMid))
  const rScallop = Math.sqrt(C * C + R * R - 2 * C * R * Math.cos(phiScallop));
  const rLock = C - rScallop;
  const lockDisc = Math.max(6.8, rScallop - 0.55);

  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = k * step;
    // 1. Radial slot: in along -side, round the semicircular bottom, out along +side
    pts.push([R * Math.cos(a - dSlot), R * Math.sin(a - dSlot)]);
    pts.push([slotBottom * Math.cos(a - back), slotBottom * Math.sin(a - back)]);
    pts.push(...arc(0, 0, slotBottom, a - back, a + back, 8));
    pts.push([R * Math.cos(a + dSlot), R * Math.sin(a + dSlot)]);

    // 2. Horn tip arc on outer radius R
    const aMid = a + beta0;
    const aScStart = aMid - phiScallop;
    const aScEnd = aMid + phiScallop;
    pts.push(...arc(0, 0, R, a + dSlot, aScStart, 4));

    // 3. True concave dwell scallop centered at the mating driver centre (cx, cy)
    const cx = C * Math.cos(aMid);
    const cy = C * Math.sin(aMid);
    const p1x = R * Math.cos(aScStart) - cx;
    const p1y = R * Math.sin(aScStart) - cy;
    const p2x = R * Math.cos(aScEnd) - cx;
    const p2y = R * Math.sin(aScEnd) - cy;
    let ang1 = Math.atan2(p1y, p1x);
    let ang2 = Math.atan2(p2y, p2x);
    // Sweep the inward arc (around angle aMid + PI) from p1 to p2
    while (ang2 > ang1) ang2 -= TAU;
    if (ang1 - ang2 > Math.PI) ang2 += TAU;
    pts.push(...arc(cx, cy, rScallop, ang1, ang2, 18));

    // 4. Horn tip arc on outer radius R to the next slot mouth
    pts.push(...arc(0, 0, R, aScEnd, a + step - dSlot, 4));
  }

  return {
    outer: dedupeRing(pts),
    slots: n,
    radius: R,
    centre: C,
    pinRadius: rho,
    slotBottom,
    lockRadius: rLock,
    rScallop,
    lockDisc,
    step,
  };
}

/** The Geneva driver: a disc with one pin at the pin-circle radius. */
export function genevaDriver({ discR = 30, pinR = 2.4, pinOffset = 22 }) {
  return { outer: circle(0, 0, discR, 56), holes: [circle(pinOffset, 0, pinR, 24)], pinOffset, pinR, discR };
}
