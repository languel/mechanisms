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

  files.push({ name: 'README.md', data: sheet({ meta, params, paramValues, stats, totals, hardware, assembly }) });
  files.push({ name: 'parts.csv', data: csv({ stats, hardware }) });

  return { files, stats, totals };
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
