/* teardown-bridge.js — bridges our parametric 3D solid parts into the teardown
   skill's TechnicalGeometry & TechnicalProjection engine for hidden-line-removed
   vector technical illustrations, exploded views with assembly trails, part tint
   fills, and callout leader annotations.
*/

import '../../tools/teardown/assets/geometry.js';
import '../../tools/teardown/assets/sheet.js';
import '../../tools/teardown/assets/projection.js';
import { triangulate, signedArea } from './mesh.js';
import { isHardwarePart } from './kit.js';

const G = globalThis.TechnicalGeometry;
const SHEET = globalThis.TechnicalSheet;
const P = globalThis.TechnicalProjection;

export { G as TechnicalGeometry, SHEET as TechnicalSheet, P as TechnicalProjection };

const DEG = Math.PI / 180;

/**
 * Convert a hex color (#rrggbb) to an approximate HSL hue (0..360) and hex tint.
 */
export function mixHex(hexA, hexB = '#fbf8f2', weightA = 0.28) {
  const parse = (h) => {
    const s = String(h || '#cccccc').replace('#', '');
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [
      parseInt(f.slice(0, 2), 16) || 0,
      parseInt(f.slice(2, 4), 16) || 0,
      parseInt(f.slice(4, 6), 16) || 0,
    ];
  };
  const a = parse(hexA), b = parse(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  const ch = (i) => Math.round(a[i] * w + b[i] * (1 - w)).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/**
 * Add an extruded 2D profile (with arbitrary holes) to a TechnicalGeometry part,
 * using our fast scanline triangulator for the caps and shared vertex indices
 * along the boundary rings so TechnicalProjection.contours() extracts clean
 * silhouette outlines on every curved wall.
 */
export function addSolidToTechnicalPart(tgPart, solid, transformPoint, { creaseAngle = 26, zBias = 0 } = {}) {
  const z0 = (solid.z ?? 0) + zBias;
  const z1 = (solid.z ?? 0) + solid.h - zBias;
  if (z1 <= z0) return;

  const role = solid.role || 'edge';
  const capTris = triangulate(solid.outer, solid.holes ?? []);
  if (!capTris.length) return;

  // Deduplicate 3D vertices within this solid so cap and wall triangles share
  // exact vertex indices along every edge.
  const vMap = new Map();
  const vIndex = (x, y, z) => {
    const pt = transformPoint(x, y, z);
    const key = `${Math.round(pt[0] * 2000)},${Math.round(pt[1] * 2000)},${Math.round(pt[2] * 2000)}`;
    let idx = vMap.get(key);
    if (idx === undefined) {
      idx = tgPart.vertices.length;
      tgPart.vertices.push(pt);
      vMap.set(key, idx);
    }
    return idx;
  };

  // Top and bottom caps
  for (const t of capTris) {
    const aTop = vIndex(t[0][0], t[0][1], z1);
    const bTop = vIndex(t[1][0], t[1][1], z1);
    const cTop = vIndex(t[2][0], t[2][1], z1);
    if (aTop !== bTop && bTop !== cTop && cTop !== aTop) {
      tgPart.triangles.push([aTop, bTop, cTop]);
    }
    const aBot = vIndex(t[2][0], t[2][1], z0);
    const bBot = vIndex(t[1][0], t[1][1], z0);
    const cBot = vIndex(t[0][0], t[0][1], z0);
    if (aBot !== bBot && bBot !== cBot && cBot !== aBot) {
      tgPart.triangles.push([aBot, bBot, cBot]);
    }
  }

  // Side walls from the cap boundary edges (matches cap split vertices)
  const key2 = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
  const undirected = (p, q) => {
    const a = `${key2(p)}|${key2(q)}`, b = `${key2(q)}|${key2(p)}`;
    return a < b ? a : b;
  };
  const boundary = new Map();
  for (const t of capTris) {
    for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const u = undirected(p, q);
      if (boundary.has(u)) boundary.delete(u);
      else boundary.set(u, [p, q]);
    }
  }
  for (const [p, q] of boundary.values()) {
    const a = vIndex(p[0], p[1], z0);
    const b = vIndex(q[0], q[1], z0);
    const c = vIndex(q[0], q[1], z1);
    const d = vIndex(p[0], p[1], z1);
    if (a !== b && c !== d) {
      tgPart.triangles.push([a, b, c], [a, c, d]);
    }
  }

  // Feature lines: top & bottom loop rings + sharp vertical creases
  const cosCrease = Math.cos(creaseAngle * DEG);
  const rings = [solid.outer, ...(solid.holes ?? [])];
  for (const rawRing of rings) {
    if (!rawRing || rawRing.length < 3) continue;
    // Remove adjacent duplicates
    const ring = rawRing.filter((pt, i) => {
      const prev = rawRing[(i - 1 + rawRing.length) % rawRing.length];
      return Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-5;
    });
    const m = ring.length;
    if (m < 3) continue;
    for (let k = 0; k < m; k++) {
      const prev = ring[(k - 1 + m) % m];
      const here = ring[k];
      const next = ring[(k + 1) % m];

      const pBot = transformPoint(here[0], here[1], z0);
      const qBot = transformPoint(next[0], next[1], z0);
      const pTop = transformPoint(here[0], here[1], z1);
      const qTop = transformPoint(next[0], next[1], z1);

      G.line(tgPart, pBot, qBot, role);
      G.line(tgPart, pTop, qTop, role);

      const udx = here[0] - prev[0], udy = here[1] - prev[1];
      const vdx = next[0] - here[0], vdy = next[1] - here[1];
      const ul = Math.hypot(udx, udy), vl = Math.hypot(vdx, vdy);
      if (ul > 1e-6 && vl > 1e-6) {
        const cos = (udx * vdx + udy * vdy) / (ul * vl);
        if (cos <= cosCrease) {
          G.line(tgPart, pBot, pTop, role);
        }
      }
    }
  }
}

/**
 * Convert an array of mechanism/motor parts and a pose into TechnicalGeometry
 * parts and assembly trails ready for TechnicalProjection.render().
 */
export function buildTeardownScene(parts, pose = {}, { hardware = true } = {}) {
  const tgParts = [];
  const trails = [];
  const partMap = new Map();

  // Compute explode ranks for parts that don't specify an explicit explosion vector
  const layers = [...new Set(parts.map((p) => p.layer || 0))].sort((a, b) => a - b);

  parts.forEach((part, partIdx) => {
    if (!hardware && isHardwarePart(part)) return;
    const pPose = pose[part.id] || {};
    if (pPose.hide) return;

    const rot = pPose.rot || 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const px = part.pivot?.x ?? 0;
    const py = part.pivot?.y ?? 0;
    const ox = (part.at?.x ?? 0) + (pPose.dx || 0);
    const oy = (part.at?.y ?? 0) + (pPose.dy || 0);
    // Tiny per-part Z offset (0.025 mm) prevents coplanar z-fighting between stacked faces
    const oz = (part.at?.z ?? 0) + (pPose.dz || 0) + partIdx * 0.025;

    const rank = part.role === 'frame' ? 0 : (part.explodeOrder ?? (layers.indexOf(part.layer || 0) + 1));
    const explosion = part.explosion || [0, 0, rank * 16];

    const tgPart = G.part(part.id, part.name, explosion);
    if (part.transparent) tgPart.transparent = true;

    const transformPoint = (x, y, z) => {
      const rx = x - px, ry = y - py;
      return [
        ox + px + rx * cr - ry * sr,
        oy + py + rx * sr + ry * cr,
        oz + z,
      ];
    };

    if (typeof part.buildTechnical === 'function') {
      part.buildTechnical(G, tgPart, transformPoint, pPose);
    } else if (part.solids) {
      part.solids.forEach((solid, sIdx) => {
        // Tiny 0.015 mm step between stacked solids in the same part prevents internal seam z-fighting
        addSolidToTechnicalPart(tgPart, solid, transformPoint, {
          creaseAngle: solid.creaseAngle ?? 26,
          zBias: sIdx * 0.012,
        });
      });
    }

    if (tgPart.vertices.length > 0 || tgPart.lines.length > 0) {
      tgParts.push(tgPart);
      partMap.set(part.id, { part, tgPart, ox, oy, oz });
    }
  });

  // Automatically add coaxial assembly trails for parts that explode along an axis
  const frameEntry = partMap.get('frame') || [...partMap.values()][0];
  if (frameEntry) {
    const axisGroups = new Map();
    for (const [id, entry] of partMap.entries()) {
      if (id === frameEntry.part.id) continue;
      const exp = entry.tgPart.explosion;
      if (Math.hypot(...exp) < 1) continue;
      // Group coaxial parts by their XY center
      const axisKey = `${Math.round(entry.ox)},${Math.round(entry.oy)}`;
      if (!axisGroups.has(axisKey)) axisGroups.set(axisKey, []);
      axisGroups.get(axisKey).push(entry);
    }
    for (const group of axisGroups.values()) {
      group.sort((a, b) => Math.hypot(...a.tgPart.explosion) - Math.hypot(...b.tgPart.explosion));
      const top = group[group.length - 1];
      trails.push({
        a: [top.ox, top.oy, frameEntry.oz + 4],
        b: [top.ox, top.oy, top.oz + 2],
        from: frameEntry.part.id,
        to: top.part.id,
        role: 'axis',
      });
    }
  }

  return { tgParts, trails, partMap };
}

/**
 * Render a standalone Teardown SVG technical illustration from parts + pose.
 */
export function renderTeardownSvg(parts, pose = {}, {
  explosion = 0,
  fitExplosion = explosion,
  isolated = null,
  preset = 'technical',
  fill = true,
  hatch = false,
  prominentLines = true,
  annotate = false,
  hardware = true,
  camera = { azimuth: -128, elevation: 32, roll: 0 },
  background = '#fbf8f2',
  ink = '#1e1c19',
  sample = 0.08,
  title = 'Technical assembly drawing',
  description = 'Assembled and exploded technical projection.',
} = {}) {
  const isHatched = hatch === true || fill === 'hatch';
  const shouldFill = Boolean(fill) || isHatched;

  const { tgParts, trails } = buildTeardownScene(parts, pose, { hardware });
  const res = P.render(tgParts, {
    explosion,
    fitExplosion,
    isolated,
    sample,
    camera,
    trails,
    fill: shouldFill,
    annotate,
  });

  const roleCss = SHEET.css(preset);

  // Build per-part tint or hatch fill rules
  const paperHex = background || '#fbf8f2';
  let movingPartIdx = 0;
  const fillRules = parts.map((p) => {
    const isFrame = p.role === 'frame' || p.id === 'frame';
    if (isFrame) {
      return `[data-fill="${p.id}"] { fill: ${paperHex}; stroke: none; }`;
    }
    if (isHatched) {
      const ptnId = (movingPartIdx % 4) + 1;
      movingPartIdx++;
      return `[data-fill="${p.id}"] { fill: url(#hatch-${ptnId}); stroke: none; }`;
    }
    const tint = mixHex(p.color || '#c8bda9', paperHex, 0.36);
    return `[data-fill="${p.id}"] { fill: ${tint}; stroke: ${tint}; stroke-width: 0.08; }`;
  }).join('\n      ');

  // Prominent line weight overrides for technical drafting clarity, with baseplate hairline thin
  const prominentLineCss = prominentLines ? `
      [data-line-role="outline"] { stroke-width: 0.88px !important; stroke: ${ink} !important; stroke-linecap: round; }
      [data-line-role="edge"] { stroke-width: 0.58px !important; stroke: ${ink} !important; stroke-linecap: round; }
      [data-line-role="detail"] { stroke-width: 0.35px !important; stroke: #2a2622 !important; }
  ` : '';

  // Highlight driver / active parts with subtle colored linework; hairline thin baseplate
  const partStrokeRules = `
      #part-frame [data-line-role], [id^="part-frame"] [data-line-role], [id*="-frame"] [data-line-role] {
        stroke: #92897c !important;
        stroke-opacity: 0.25 !important;
        stroke-width: 0.15px !important;
      }
  ` + parts.map((p) => {
    if (p.highlightInk) {
      return `#part-${p.id}-${SHEET.slug(p.name)} [data-line-role] { stroke: ${p.highlightInk}; }`;
    }
    return '';
  }).filter(Boolean).join('\n      ');

  const pad = annotate ? 14 : 18;
  const vbX = Math.max(0, Math.floor(res.bounds.x - (annotate ? 62 : pad)));
  const vbY = Math.max(0, Math.floor(res.bounds.y - pad));
  const vbW = Math.min(SHEET.width - vbX, Math.ceil(res.bounds.width + (annotate ? 124 : pad * 2)));
  const vbH = Math.min(SHEET.height - vbY, Math.ceil(res.bounds.height + pad * 2));

  const hatchDefs = `
    <pattern id="hatch-1" width="4.2" height="4.2" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="4.2" stroke="${ink}" stroke-width="0.48" stroke-opacity="0.80" />
    </pattern>
    <pattern id="hatch-2" width="4.6" height="4.6" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="4.6" stroke="${ink}" stroke-width="0.48" stroke-opacity="0.80" />
    </pattern>
    <pattern id="hatch-3" width="3.8" height="3.8" patternTransform="rotate(30 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="3.8" stroke="${ink}" stroke-width="0.44" stroke-opacity="0.80" />
    </pattern>
    <pattern id="hatch-4" width="4.8" height="4.8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="4.8" stroke="${ink}" stroke-width="0.38" stroke-opacity="0.75" />
      <line x1="0" y1="0" x2="4.8" y2="0" stroke="${ink}" stroke-width="0.38" stroke-opacity="0.75" />
    </pattern>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="100%" height="100%" role="img" aria-label="${title.replace(/"/g, '&quot;')}">
  <title>${title.replace(/</g, '&lt;')}</title>
  <desc>${description.replace(/</g, '&lt;')}</desc>
  <defs>
    ${hatchDefs}
    <style>
      [data-line-role] {
        fill: none;
        stroke: ${ink};
        stroke-linejoin: round;
      }
      ${roleCss}
      ${prominentLineCss}
      [data-line-role="axis"] {
        stroke: #8a7f70;
        stroke-width: 0.28px;
      }
      [data-ink-fill] {
        fill: ${ink};
      }
      text[data-annotation] {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-weight: 600;
        letter-spacing: 0.05em;
        fill: ${ink};
      }
      ${shouldFill ? fillRules : ''}
      ${partStrokeRules}
    </style>
  </defs>
  ${background ? `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${background}"/>` : ''}
  ${res.markup}
</svg>`;

  return {
    svg,
    markup: res.markup,
    bounds: res.bounds,
    scale: res.scale,
    offset: res.offset,
    viewBox: [vbX, vbY, vbW, vbH],
  };
}
