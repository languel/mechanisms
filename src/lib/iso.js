/* iso.js — the isometric figure: solid parts, back faces culled, faces sorted
   by view depth, four tones from one light.

   This is the drawing the catalogue cards use, and what the page falls back to
   when WebGL is unavailable. It reads the same parts, the same pose and the same
   millimetres as the 3D stage and the STL export — the machine you print is the
   machine you see.

   All maths happens in the assembly frame: x along the plate, y across it, z up.
*/

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** The light: high, front-left. One light, four tones, no gradients. */
const LIGHT = normalize([-0.45, -0.32, 0.83]);

function camera({ azimuth = -0.62, elevation = 0.8 }) {
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth);
  const ce = Math.cos(elevation), se = Math.sin(elevation);
  const dir = [ce * sa, ce * ca, se];       // scene → camera
  const right = [ca, -sa, 0];               // screen +x
  const up = [-se * sa, -se * ca, ce];      // screen +y
  return {
    dir,
    sx: (p) => dot(p, right),
    sy: (p) => -dot(p, up),
    depth: (p) => dot(p, dir),
  };
}

function parseHex(hex) {
  const h = String(hex || '#cccccc').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}

function shade(hex, factor) {
  const c = parseHex(hex);
  const f = clamp(factor, 0, 2.2);
  const ch = (v) => Math.round(clamp(v * f, 0, 255));
  return `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`;
}

const fmt = (v) => (Math.round(v * 100) / 100).toString();

/**
 * Draw the assembled machine.
 *
 * @param {object[]} parts parts from a mechanism's build()
 * @param {object} pose per-part {rot, dx, dy, hide}
 * @param {object} opts azimuth, elevation, width, padding, background, hidden
 */
export function isoFigure(parts, pose = {}, opts = {}) {
  const {
    azimuth = -0.62, elevation = 0.8, padding = 16, width = 640, maxHeight = 520,
    background = null, hidden = [], hardware = true, outline = 'rgba(35,32,28,0.16)',
  } = opts;

  const cam = camera({ azimuth, elevation });
  const faces = [];
  const hiddenSet = new Set(hidden);

  for (const part of parts) {
    if (hiddenSet.has(part.id)) continue;
    if (part.kind === 'hardware' && !hardware) continue;
    const p = pose[part.id] || {};
    if (p.hide) continue;

    const rot = p.rot || 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const px = part.pivot?.x ?? 0;
    const py = part.pivot?.y ?? 0;
    const ox = part.at.x + (p.dx || 0);
    const oy = part.at.y + (p.dy || 0);
    const oz = part.at.z;

    const place = ([x, y]) => {
      const rx = x - px, ry = y - py;
      return [ox + px + rx * cr - ry * sr, oy + py + rx * sr + ry * cr];
    };
    const base = part.color || '#c9c0ae';
    const tone = part.kind === 'hardware' ? 0.92 : 1;
    const priority = part.zOrder ?? (part.role === 'frame' ? 0 : 1);

    for (const solid of part.solids) {
      const z0 = oz + (solid.z || 0);
      const z1 = z0 + solid.h;
      const rings = [solid.outer, ...(solid.holes || [])].map((r) => r.map(place));

      // top face: one path, holes cut by even-odd
      const topPts = [];
      for (const ring of rings) for (const [x, y] of ring) topPts.push([x, y, z1]);
      pushRing(faces, cam, topPts, rings.map((r) => r.length), [0, 0, 1], base, tone, true, priority);

      // side walls, culled when they face away
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        for (let i = 0; i < ring.length; i++) {
          const A = ring[i], B = ring[(i + 1) % ring.length];
          if (Math.abs(A[0] - B[0]) < 1e-9 && Math.abs(A[1] - B[1]) < 1e-9) continue;
          const n = normalize([B[1] - A[1], -(B[0] - A[0]), 0]);
          if (dot(n, cam.dir) <= 0.002) continue;
          pushQuad(faces, cam, [A[0], A[1], z0], [B[0], B[1], z0], [B[0], B[1], z1], [A[0], A[1], z1], n, base, tone * 0.92, priority);
        }
      }
    }
  }

  // Two keys: everything that belongs to the base frame is drawn first (it is
  // the lowest thing in the machine, and its big cap would otherwise cover the
  // parts standing on it), then faces go far-to-near.
  faces.sort((a, b) => (a.priority - b.priority) || (a.depth - b.depth));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const f of faces) for (const p of f.pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  if (!faces.length) { minX = 0; maxX = 1; minY = 0; maxY = 1; }

  const w = Math.max(1e-6, maxX - minX), h = Math.max(1e-6, maxY - minY);
  const scale = Math.min((width - padding * 2) / w, (maxHeight - padding * 2) / h);
  const vw = Math.round(w * scale + padding * 2);
  const vh = Math.round(h * scale + padding * 2);
  const tx = (x) => (x - minX) * scale + padding;
  const ty = (y) => (y - minY) * scale + padding;

  const paths = faces.map((f) => {
    let d = '';
    let i = 0;
    for (const count of f.counts) {
      for (let k = 0; k < count; k++, i++) {
        const p = f.pts[i];
        d += `${k === 0 ? 'M' : 'L'}${fmt(tx(p[0]))} ${fmt(ty(p[1]))}`;
      }
      d += 'Z';
    }
    return `<path d="${d}"${f.counts.length > 1 ? ' fill-rule="evenodd"' : ''} fill="${f.fill}"`
      + `${outline ? ` stroke="${outline}" stroke-width="0.4" stroke-linejoin="round"` : ''}/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">`
    + (background ? `<rect width="${vw}" height="${vh}" fill="${background}"/>` : '')
    + paths
    + '</svg>';

  return { svg, width: vw, height: vh, faces: faces.length };
}

function pushRing(faces, cam, pts3, counts, normal, base, tone, evenOdd, priority = 1) {
  const facing = dot(normal, cam.dir);
  if (facing <= 0.001) return;
  const lit = 0.5 + 0.5 * clamp(dot(normal, LIGHT), 0, 1);
  faces.push({
    pts: pts3.map((p) => [cam.sx(p), cam.sy(p)]),
    counts,
    depth: pts3.reduce((a, p) => a + cam.depth(p), 0) / pts3.length,
    fill: shade(base, tone * lit),
    evenOdd,
    priority,
  });
}

function pushQuad(faces, cam, a, b, c, d, normal, base, tone, priority = 1) {
  const lit = 0.5 + 0.5 * clamp(dot(normal, LIGHT), 0, 1);
  const pts = [a, b, c, d];
  faces.push({
    pts: pts.map((p) => [cam.sx(p), cam.sy(p)]),
    counts: [4],
    depth: pts.reduce((s, p) => s + cam.depth(p), 0) / 4,
    fill: shade(base, tone * lit),
    evenOdd: false,
    priority,
  });
}
