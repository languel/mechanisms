/* The print pack has to be a real ZIP with real STLs, and the checks have to
   catch a part that would fail on the printer. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { printPack, partStats, zipStore, fileNameFor } from '../src/lib/export.js';
import { extrude, stlBinary, checkMesh } from '../src/lib/mesh.js';
import { circle, rect, part, slab } from '../src/lib/kit.js';
import * as crank from '../mechanisms/crank-slider/mechanism.js';

const meta = { slug: 'test-kit', title: 'Test kit', question: 'Does it export?', bigIdea: 'It does.' };
const params = [
  { key: 'size', label: 'Size', unit: 'mm', min: 1, max: 10, step: 1, value: 5 },
  { key: 'kind', label: 'Kind', kind: 'choice', value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
];

/** Minimal ZIP reader: walks the central directory and checks every CRC. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50, 'end of central directory record');
  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entries = [];
  let o = cdOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(o, true), 0x02014b50, 'central directory header');
    const crc = view.getUint32(o + 16, true);
    const size = view.getUint32(o + 20, true);
    const nameLen = view.getUint16(o + 28, true);
    const localOffset = view.getUint32(o + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 46, o + 46 + nameLen));
    // local header
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, 'local file header');
    const lNameLen = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + lNameLen;
    const data = bytes.subarray(dataStart, dataStart + size);
    let c = 0xffffffff;
    for (let k = 0; k < data.length; k++) {
      c ^= data[k];
      for (let b = 0; b < 8; b++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    assert.equal((c ^ 0xffffffff) >>> 0, crc, `CRC of ${name}`);
    entries.push({ name, data });
    o += 46 + nameLen + view.getUint16(o + 30, true) + view.getUint16(o + 32, true);
  }
  return entries;
}

test('a pack is a valid ZIP with one STL per printed part', () => {
  const mod = crank;
  const values = Object.fromEntries(mod.params.map((p) => [p.key, p.value]));
  const out = mod.build(values);
  const pack = printPack({
    meta: mod.meta,
    params: mod.params,
    paramValues: values,
    parts: out.parts,
    hardware: mod.hardware,
    assembly: mod.steps.map((s) => s.title),
  });

  const files = readZip(zipStore(pack.files));
  const names = files.map((f) => f.name);
  assert.ok(names.includes('README.md'));
  assert.ok(names.includes('parts.csv'));
  assert.ok(names.filter((n) => n.endsWith('.stl')).length >= 3);

  // every STL parses and is closed
  for (const file of files.filter((f) => f.name.endsWith('.stl'))) {
    const view = new DataView(file.data.buffer, file.data.byteOffset, file.data.byteLength);
    const tris = view.getUint32(80, true);
    assert.equal(file.data.length, 84 + tris * 50, `${file.name}: STL length`);
    assert.ok(tris > 10, `${file.name}: only ${tris} triangles`);
  }

  // the sheet carries the parameter values that made the pack
  const sheet = files.find((f) => f.name === 'README.md').data;
  const text = new TextDecoder().decode(sheet);
  assert.match(text, /Crank and slider/);
  assert.match(text, /Stroke \| 34 mm/);
  assert.match(text, /Watertight/);
  assert.ok(!text.includes('NaN'), 'the sheet must not contain NaN');
  assert.ok(!text.includes('undefined'));
});

test('repeated parts are printed once and counted', () => {
  const values = Object.fromEntries(crank.params.map((p) => [p.key, p.value]));
  const out = crank.build(values);
  const pack = printPack({
    meta: crank.meta, params: crank.params, paramValues: values, parts: out.parts, hardware: [], assembly: [],
  });
  const caps = pack.stats.filter((s) => s.part.printId === 'cap');
  assert.equal(caps.length, 1, 'the three caps must be one file');
  assert.equal(caps[0].part.qty, 3);
});

test('a part with an unclosed solid is reported, not exported quietly', () => {
  // A plate whose hole crosses its outline cannot triangulate; the profile check
  // throws, and partStats lets that surface.
  const broken = part({
    id: 'broken',
    name: 'Broken plate',
    color: '#000000',
    solids: [slab({ outer: rect(0, 0, 10, 10), holes: [circle(9.5, 5, 4, 24)], z: 0, h: 4 })],
  });
  assert.throws(() => partStats(broken), /triangulate|enclosed/);
});

test('a part with overlapping solids is reported', () => {
  const overlapping = part({
    id: 'double',
    name: 'Two bodies in one place',
    color: '#000000',
    solids: [
      slab({ outer: rect(0, 0, 10, 10), z: 0, h: 4 }),
      slab({ outer: rect(2, 2, 6, 6), z: 2, h: 4 }),
    ],
  });
  const s = partStats(overlapping);
  assert.equal(s.closed, false);
  assert.match(JSON.stringify(s.problems), /overlap/);
});

test('a sound part passes every check and reports its mass', () => {
  const good = part({
    id: 'plate', name: 'Plate', color: '#cccccc',
    solids: [slab({ outer: rect(0, 0, 40, 20), holes: [circle(20, 10, 2, 24)], z: 0, h: 4 })],
  });
  const s = partStats(good);
  assert.ok(s.closed);
  const expected = (40 * 20 - Math.PI * 4) * 4;
  assert.ok(Math.abs(s.volume - expected) / expected < 0.01, `volume ${s.volume} vs ${expected}`);
  assert.ok(s.grams > 0 && s.grams < 5);
});

test('file names are ordered, safe and say the quantity', () => {
  const p = part({ id: 'Cap Pin', name: 'Cap', color: '#fff', qty: 3, solids: [slab({ outer: rect(0, 0, 5, 5), z: 0, h: 2 })] });
  const name = fileNameFor('kit', p, 2);
  assert.equal(name, '03-cap-pin-x3.stl');
});

test('STL triangles are wound outwards', () => {
  const tris = extrude({ outer: rect(0, 0, 10, 10), z: 0, h: 2 });
  assert.ok(checkMesh(tris).volume > 0);
  const buf = stlBinary(tris);
  const view = new DataView(buf.buffer);
  assert.equal(view.getUint32(80, true), tris.length);
  // the first normal must be non-zero
  const n = [view.getFloat32(84, true), view.getFloat32(88, true), view.getFloat32(92, true)];
  assert.ok(Math.hypot(...n) > 0.9);
});
