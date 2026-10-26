/* export.js — the print pack: STL per part, a ZIP around them, and the sheet
   that tells you how to put the machine together.

   Runs in the browser (button on each page) and in Node (`src/export.js`), from
   the same part geometry the page draws. All STLs are already laid flat on the
   bed, in millimetres. */

import { extrude, stlBinary, checkMesh, bbox } from './mesh.js';
import { KIT } from './kit.js';

/** All triangles of one part, in the part's own print-flat frame. */
export function partTriangles(part) {
  return part.solids.flatMap((s) => extrude({ outer: s.outer, holes: s.holes ?? [], z: s.z ?? 0, h: s.h }));
}

/**
 * A part is printable when every solid in it is closed, wound outwards, and no
 * two solids overlap — stacked bosses and plates may touch, never interpenetrate
 * (a slicer's even-odd fill would carve the overlap out of the part).
 */
export function partStats(part) {
  const solids = part.solids.map((s) => {
    const tris = extrude({ outer: s.outer, holes: s.holes ?? [], z: s.z ?? 0, h: s.h });
    return { chk: checkMesh(tris), tris, z0: s.z ?? 0, z1: (s.z ?? 0) + s.h, box: bbox(tris) };
  });
  const tris = solids.flatMap((s) => s.tris);
  const volume = solids.reduce((a, s) => a + s.chk.volume, 0);
  const b = bbox(tris);

  const problems = [];
  solids.forEach((s, i) => {
    if (!s.chk.closed) problems.push({ solid: i, why: 'not closed', detail: s.chk.problems });
    if (s.chk.volume <= 0) problems.push({ solid: i, why: 'inside out' });
  });
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b2 = solids[j];
      const overlap = Math.min(a.z1, b2.z1) - Math.max(a.z0, b2.z0);
      const footprint = [0, 1].every((k) => Math.min(a.box.max[k], b2.box.max[k]) - Math.max(a.box.min[k], b2.box.min[k]) > 1e-3);
      if (overlap > 1e-3 && footprint) {
        problems.push({ solid: `${i}/${j}`, why: `solids overlap: ${overlap.toFixed(2)} mm of z and a shared footprint` });
      }
    }
  }

  return {
    triangles: tris.length,
    closed: problems.length === 0,
    problems,
    volume,
    cm3: volume / 1000,
    grams: (volume / 1000) * KIT.density,
    size: b.size,
    min: b.min,
    max: b.max,
    tris,
  };
}

export const fileNameFor = (slug, part, index) => {
  const base = part.id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const qty = part.qty > 1 ? `-x${part.qty}` : '';
  return `${String(index + 1).padStart(2, '0')}-${base}${qty}.stl`;
};

/**
 * Everything a maker needs for one parameter set.
 * @returns {{files: {name: string, data: Uint8Array|string}[], stats: object[], totals: object}}
 */
export function printPack({ meta, params, paramValues, parts, hardware = [], assembly = [] }) {
  const printed = parts.filter((p) => p.kind === 'print');

  // Repeated parts (three identical caps, two identical links) are printed once:
  // group the instances, keep the first for geometry, and count them for the BOM.
  const groups = new Map();
  for (const part of printed) {
    const key = part.printId || part.id;
    if (!groups.has(key)) groups.set(key, { part, instances: 0 });
    groups.get(key).instances++;
  }

  const files = [];
  const stats = [...groups.values()].map(({ part, instances }, i) => {
    const s = partStats(part);
    const qty = part.qty || instances;
    const withQty = { ...part, qty };
    const name = fileNameFor(meta.slug, withQty, i);
    files.push({ name: `stl/${name}`, data: stlBinary(s.tris, `${meta.slug} ${part.id}`) });
    return { part: withQty, name, ...s };
  });

  const totals = stats.reduce((acc, s) => {
    acc.volume += s.volume * (s.part.qty || 1);
    acc.grams += s.grams * (s.part.qty || 1);
    acc.triangles += s.triangles;
    acc.allClosed = acc.allClosed && s.closed;
    return acc;
  }, { volume: 0, grams: 0, triangles: 0, allClosed: true });

  // Build auto-nested 220x220 mm print bed STL & 1:1 mm laser-cut SVG sheet
  const statsMap = new Map(stats.map((s) => [s.part.id, s]));
  const bedLayout = layoutPartsOnBed(
    stats.map((s) => s.part),
    statsMap,
    { bedW: 220, bedD: 220, expandQty: true },
  );
  const bedStl = buildCombinedBedStl(bedLayout.placements, `${meta.slug} full print plate`);
  if (bedStl) {
    files.push({ name: `stl/${meta.slug}-all-parts-bed.stl`, data: bedStl });
  }
  const laserSvg = buildLaserCutSvg(bedLayout, {
    slug: meta.slug,
    title: meta.title,
  });
  files.push({ name: `laser/${meta.slug}-laser-cut-bed.svg`, data: laserSvg });

  files.push({ name: 'README.md', data: sheet({ meta, params, paramValues, stats, totals, hardware, assembly }) });
  files.push({ name: 'parts.csv', data: csv({ stats, hardware }) });

  return { files, stats, totals, bedLayout, laserSvg };
}

/* ------------------------------------------- Print Bed & Laser Auto-Layout */

/** Convert a 2D polygon ring `[[x,y], ...]` shifted by `(dx, dy)` into an SVG path string. */
export function ringToSvgPath(ring, dx = 0, dy = 0) {
  if (!ring || ring.length < 3) return '';
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const x = (ring[i][0] + dx).toFixed(2);
    const y = (ring[i][1] + dy).toFixed(2);
    d += `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }
  return `${d}Z`;
}

/**
 * Auto-layout all printed parts (including repeated quantities when `expandQty`
 * is true) onto a 220 × 220 mm build / laser bed using shelf packing.
 */
export function layoutPartsOnBed(parts, statsMap, {
  bedW = 220,
  bedD = 220,
  margin = 8,
  gap = 5.5,
  expandQty = true,
} = {}) {
  const printed = parts.filter((p) => p.kind === 'print');
  const seen = new Set();
  const uniquePrinted = printed.filter((p) => {
    const k = p.printId || p.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Expand instances for parts with qty > 1 so a single bed print/cut makes the whole kit
  const instances = [];
  for (const part of uniquePrinted) {
    const s = statsMap.get(part.id) || partStats(part);
    if (!s || s.error) continue;
    const qty = expandQty ? Math.max(1, part.qty || 1) : 1;
    for (let copy = 0; copy < qty; copy++) {
      instances.push({
        part,
        s,
        copyIndex: copy + 1,
        qty,
        w: s.size[0],
        h: s.size[1],
        zH: s.size[2],
      });
    }
  }

  // Sort: base frame first, then tallest/largest footprint first for compact shelf packing
  instances.sort((a, b) => {
    if ((a.part.role === 'frame') !== (b.part.role === 'frame')) {
      return a.part.role === 'frame' ? -1 : 1;
    }
    return (b.h - a.h) || (b.w - a.w);
  });

  let curX = margin;
  let curY = margin;
  let rowH = 0;
  const placements = [];
  for (const item of instances) {
    if (curX + item.w + margin > bedW && curX > margin) {
      curX = margin;
      curY += rowH + gap;
      rowH = 0;
    }
    const minPt = item.s.min || item.s.bounds?.min || [0, 0, 0];
    const dx = curX - minPt[0];
    const dy = curY - minPt[1];
    const dz = -minPt[2];
    placements.push({
      ...item,
      x: curX,
      y: curY,
      dx,
      dy,
      dz,
    });
    curX += item.w + gap;
    rowH = Math.max(rowH, item.h);
  }

  return { bedW, bedD, placements, uniqueCount: uniquePrinted.length, totalInstances: placements.length };
}

/** Combine all nested bed placements into one watertight binary STL laid flat at z = 0. */
export function buildCombinedBedStl(placements, headerName = 'mechanisms print bed') {
  const combinedTris = [];
  for (const { s, dx, dy, dz } of placements) {
    if (!s?.tris) continue;
    for (const tri of s.tris) {
      combinedTris.push([
        [tri[0][0] + dx, tri[0][1] + dy, tri[0][2] + dz],
        [tri[1][0] + dx, tri[1][1] + dy, tri[1][2] + dz],
        [tri[2][0] + dx, tri[2][1] + dy, tri[2][2] + dz],
      ]);
    }
  }
  if (!combinedTris.length) return null;
  return stlBinary(combinedTris, headerName);
}

/**
 * Extract the 2D cut paths (primary body outer profile + through-holes) and
 * vector etch/score paths (upper bosses, posts, guide rails) for a placed part.
 */
export function extractPart2DPaths(part, dx = 0, dy = 0) {
  const solids = part.solids || [];
  if (!solids.length) return { cutPaths: [], holePaths: [], etchPaths: [] };

  // Find the primary structural slab: for a frame it's slab[0] (the baseplate);
  // for a spun/tiered part (like a gear with a hub at slab[0] and gear teeth at slab[1]),
  // pick the slab whose outer bounding box area is largest!
  let mainIdx = 0;
  if (part.role !== 'frame' && solids.length > 1) {
    let bestArea = -1;
    solids.forEach((sol, idx) => {
      if (!sol.outer?.length) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of sol.outer) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area > bestArea) {
        bestArea = area;
        mainIdx = idx;
      }
    });
  }

  const cutPaths = [];
  const holePaths = [];
  const etchPaths = [];

  const mainSolid = solids[mainIdx];
  if (mainSolid?.outer) {
    cutPaths.push(ringToSvgPath(mainSolid.outer, dx, dy));
  }
  for (const h of mainSolid?.holes || []) {
    holePaths.push(ringToSvgPath(h, dx, dy));
  }

  solids.forEach((sol, idx) => {
    if (idx === mainIdx) return;
    if (sol.outer) etchPaths.push(ringToSvgPath(sol.outer, dx, dy));
    for (const h of sol.holes || []) {
      etchPaths.push(ringToSvgPath(h, dx, dy));
    }
  });

  return { cutPaths, holePaths, etchPaths };
}

/**
 * Build a 1:1 millimetre-accurate 2D Laser-Cut SVG sheet (`220mm × 220mm`)
 * with Red (`#e01b24`) through-cut paths, Blue (`#1c71d8`) score/etch paths for
 * multi-tier bosses/rails, and Green (`#2b7a4b`) reference part labels.
 */
export function buildLaserCutSvg(bedLayout, {
  slug = 'mechanism',
  title = 'Mechanism',
  showGrid = false,
  showLabels = true,
} = {}) {
  const { bedW = 220, bedD = 220, placements = [] } = bedLayout;
  const cutElements = [];
  const etchElements = [];
  const labelElements = [];

  for (const pl of placements) {
    const { part, dx, dy, x, y, w, h, copyIndex, qty } = pl;
    const { cutPaths, holePaths, etchPaths } = extractPart2DPaths(part, dx, dy);
    const idAttr = `${part.id}${qty > 1 ? `-${copyIndex}` : ''}`;

    const allCuts = [...cutPaths, ...holePaths].filter(Boolean).join(' ');
    if (allCuts) {
      cutElements.push(`    <path id="cut-${idAttr}" data-part="${part.id}" d="${allCuts}" />`);
    }
    const allEtches = etchPaths.filter(Boolean).join(' ');
    if (allEtches) {
      etchElements.push(`    <path id="etch-${idAttr}" data-part="${part.id}" d="${allEtches}" />`);
    }

    if (showLabels) {
      const cx = (x + w / 2).toFixed(1);
      const cy = (y + h / 2).toFixed(1);
      const tag = `${part.name}${qty > 1 ? ` #${copyIndex}` : ''}`;
      const dim = `${w.toFixed(0)}×${h.toFixed(0)}mm`;
      labelElements.push(
        `    <text x="${cx}" y="${cy}" text-anchor="middle" font-size="3.1" font-family="monospace">${tag} (${dim})</text>`,
      );
    }
  }

  let gridMarkup = '';
  if (showGrid) {
    const lines = [];
    for (let g = 0; g <= bedW; g += 20) {
      lines.push(`<line x1="${g}" y1="0" x2="${g}" y2="${bedD}" stroke="#e2d9c8" stroke-width="0.25"/>`);
      lines.push(`<line x1="0" y1="${g}" x2="${bedW}" y2="${g}" stroke="#e2d9c8" stroke-width="0.25"/>`);
    }
    gridMarkup = `  <g id="bed-grid">\n    <rect x="0" y="0" width="${bedW}" height="${bedD}" fill="#fcfaf5" stroke="#b8ae9c" stroke-width="0.5"/>\n    ${lines.join('\n    ')}\n  </g>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bedW}mm" height="${bedD}mm" viewBox="0 0 ${bedW} ${bedD}" data-slug="${slug}">
  <title>${title} — 1:1 mm Laser-Cut &amp; 2D Profile Sheet (${bedW}×${bedD} mm)</title>
  <desc>Red (#e01b24) = Through-cut profiles &amp; bores (3-6 mm acrylic/plywood). Blue (#1c71d8) = Vector etch / alignment bosses &amp; rails. Green (#2b7a4b) = Part labels.</desc>
${gridMarkup}  <g id="cut-layer" fill="none" stroke="#e01b24" stroke-width="0.2" stroke-linejoin="round">
${cutElements.join('\n')}
  </g>
  <g id="etch-layer" fill="none" stroke="#1c71d8" stroke-width="0.18" stroke-dasharray="1.2 0.8" stroke-linejoin="round">
${etchElements.join('\n')}
  </g>
  <g id="label-layer" fill="#2b7a4b" opacity="0.85">
${labelElements.join('\n')}
  </g>
</svg>\n`;
}


export function sheet({ meta, params, paramValues, stats, totals, hardware, assembly }) {
  const lines = [];
  lines.push(`# ${meta.title} — print pack`);
  lines.push('');
  lines.push(`> ${meta.question}`);
  lines.push('');
  lines.push(`**The idea.** ${meta.bigIdea}`);
  lines.push('');
  lines.push(`Generated from https://languel.github.io/mechanisms/mechanisms/${meta.slug}/ — ` +
    `every file here is the same geometry the page draws.`);
  lines.push('');
  lines.push('## Parameters this pack was made with');
  lines.push('');
  lines.push('| Parameter | Value |');
  lines.push('| --- | --- |');
  for (const p of params) {
    const v = paramValues[p.key];
    const unit = p.unit ? ` ${p.unit}` : '';
    const shown = p.kind === 'choice' ? (p.options.find((o) => o.value === v)?.label ?? v) : `${v}${unit}`;
    lines.push(`| ${p.label} | ${shown} |`);
  }
  lines.push('');
  lines.push('## Print settings');
  lines.push('');
  lines.push(`- Orientation: every STL is already flat on the bed — no supports, no rotation.`);
  lines.push(`- Layer: 0.2 mm · walls: 3 perimeters · infill: 25% grid · material: PLA or PETG.`);
  lines.push('- Every turning bore is oversize by the clearance parameter and every press fit is ' +
    '0.3 mm under its post. If your printer runs tight or loose, re-export from the page with the ' +
    'clearance raised or lowered.');
  lines.push(`- Mass estimate: ${totals.grams.toFixed(1)} g PLA for the whole machine ` +
    `(${totals.volume.toFixed(0)} mm³, ${totals.triangles.toLocaleString('en-US')} triangles).`);
  lines.push('');
  lines.push('## Printed parts');
  lines.push('');
  lines.push('| File | Part | Qty | Size (mm) | Volume (cm³) | PLA (g) | Watertight |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of stats) {
    const size = s.size.map((v) => v.toFixed(1)).join(' × ');
    lines.push(`| ${s.name} | ${s.part.name} | ${s.part.qty || 1} | ${size} | ${s.cm3.toFixed(2)} | ` +
      `${s.grams.toFixed(1)} | ${s.closed ? 'yes' : 'NO — check the log'} |`);
  }
  lines.push('');
  if (hardware.length) {
    lines.push('## Hardware (not printed)');
    lines.push('');
    lines.push('| Item | Qty | Spec |');
    lines.push('| --- | --- | --- |');
    for (const h of hardware) lines.push(`| ${h.name} | ${h.qty} | ${h.spec}${h.note ? ` — ${h.note}` : ''} |`);
    lines.push('');
  }
  if (assembly.length) {
    lines.push('## Assembly');
    lines.push('');
    assembly.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  lines.push('## Checks');
  lines.push('');
  lines.push(`- All ${stats.length} meshes closed and consistently wound: ${totals.allClosed ? 'yes' : 'NO'}.`);
  lines.push('- Posts and pins are printed; caps are press fits, so no screws or rods are needed.');
  lines.push('- Press caps on with a small vice or clamp. Add a drop of glue if a cap seats loose.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(meta.attribution || 'Mechanism catalogue — built with the anatomy craft rules.');
  return lines.join('\n');
}

function csv({ stats, hardware }) {
  const rows = [['file', 'part', 'qty', 'size_x_mm', 'size_y_mm', 'size_z_mm', 'volume_cm3', 'grams_pla', 'closed']];
  for (const s of stats) {
    rows.push([s.name, s.part.name, s.part.qty || 1, ...s.size.map((v) => v.toFixed(2)), s.cm3.toFixed(3), s.grams.toFixed(2), s.closed]);
  }
  for (const h of hardware) rows.push([`hardware: ${h.name}`, h.spec, h.qty, '', '', '', '', '', '']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* --------------------------------------------------------------------- ZIP */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const asBytes = (d) => (typeof d === 'string' ? encoder.encode(d) : d);

/** A stored (uncompressed) ZIP. STLs and markdown compress badly anyway. */
export function zipStore(files) {
  const entries = files.map((f) => {
    const name = encoder.encode(f.name);
    const data = asBytes(f.data);
    return { name, data, crc: crc32(data), offset: 0 };
  });

  // local header + name + data, then central header + name, and one
  // end-of-central-directory record at the end
  let size = 22;
  for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let o = 0;

  for (const e of entries) {
    e.offset = o;
    view.setUint32(o, 0x04034b50, true);       // local file header
    view.setUint16(o + 4, 20, true);           // version needed
    view.setUint16(o + 6, 0x0800, true);       // UTF-8 names
    view.setUint16(o + 8, 0, true);            // stored
    view.setUint16(o + 10, 0, true);           // time
    view.setUint16(o + 12, 0x21, true);        // 1980-01-01
    view.setUint32(o + 14, e.crc, true);
    view.setUint32(o + 18, e.data.length, true);
    view.setUint32(o + 22, e.data.length, true);
    view.setUint16(o + 26, e.name.length, true);
    view.setUint16(o + 28, 0, true);
    out.set(e.name, o + 30);
    out.set(e.data, o + 30 + e.name.length);
    o += 30 + e.name.length + e.data.length;
  }

  const centralStart = o;
  for (const e of entries) {
    view.setUint32(o, 0x02014b50, true);       // central directory
    view.setUint16(o + 4, 20, true);
    view.setUint16(o + 6, 20, true);
    view.setUint16(o + 8, 0x0800, true);
    view.setUint16(o + 10, 0, true);
    view.setUint16(o + 12, 0, true);
    view.setUint16(o + 14, 0x21, true);
    view.setUint32(o + 16, e.crc, true);
    view.setUint32(o + 20, e.data.length, true);
    view.setUint32(o + 24, e.data.length, true);
    view.setUint16(o + 28, e.name.length, true);
    view.setUint16(o + 30, 0, true);
    view.setUint16(o + 32, 0, true);
    view.setUint16(o + 34, 0, true);
    view.setUint16(o + 36, 0, true);
    view.setUint32(o + 38, 0, true);
    view.setUint32(o + 42, e.offset, true);
    out.set(e.name, o + 46);
    o += 46 + e.name.length;
  }

  view.setUint32(o, 0x06054b50, true);         // end of central directory
  view.setUint16(o + 4, 0, true);
  view.setUint16(o + 6, 0, true);
  view.setUint16(o + 8, entries.length, true);
  view.setUint16(o + 10, entries.length, true);
  view.setUint32(o + 12, o - centralStart, true);
  view.setUint32(o + 16, centralStart, true);
  view.setUint16(o + 20, 0, true);
  return out;
}
