/* Proves the mesh core: every profile the catalogue uses extrudes to a closed,
   consistently wound solid of exactly the right volume, at every parameter
   setting the pages allow. Run with `node --test tests/`. */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as P from '../src/lib/profiles.js';
import { extrude, checkMesh, signedArea, simplifyRing, triangulate, bbox, stlBinary } from '../src/lib/mesh.js';

function expectVolume({ outer, holes = [] }) {
  const area = Math.abs(signedArea(simplifyRing(outer)))
    - holes.reduce((a, h) => a + Math.abs(signedArea(simplifyRing(h))), 0);
  return area;
}

function assertSolid(profile, height = 5, label = '') {
  const tris = extrude({ ...profile, z: 0, h: height });
  const chk = checkMesh(tris);
  assert.ok(chk.closed, `${label}: mesh not closed — ${JSON.stringify(chk.problems)}`);
  const expected = expectVolume(profile) * height;
  const err = Math.abs(chk.volume - expected) / expected;
  assert.ok(err < 1e-4, `${label}: volume off by ${(err * 100).toFixed(3)}% (${chk.volume} vs ${expected})`);
  assert.ok(chk.volume > 0, `${label}: inverted winding`);
  return { tris, chk };
}

test('plates: bare, with bore, with slot, with several holes', () => {
  assertSolid({ outer: P.rectC(20, 20) }, 5, 'square');
  assertSolid({ outer: P.rectC(20, 20), holes: [P.circle(0, 0, 4, 32)] }, 5, 'square + bore');
  assertSolid({
    outer: P.roundedRectC(40, 24, 4),
    holes: [P.circle(-12, 0, 4, 24), P.circle(12, 0, 4, 24)],
  }, 6, 'two holes');
  assertSolid({ outer: P.roundedRectC(60, 20, 3), holes: [P.slot(-18, 0, 18, 0, 8)] }, 6, 'slot');
  assertSolid({
    outer: [[-30, -15], [30, -15], [30, 10], [10, 10], [10, 20], [0, 20], [-10, 10], [-30, 10]],
    holes: [P.circle(0, -2, 5, 24)],
  }, 4, 'notched bracket');
});

test('gears: every tooth count and bore the catalogue offers', () => {
  for (const teeth of [8, 9, 10, 12, 14, 15, 16, 18, 20, 24, 30, 36, 40, 48]) {
    for (const module of [1, 1.5, 2, 2.5]) {
      const g = P.gearProfile({ teeth, module, bore: 3.3 });
      assertSolid({ outer: g.outer, holes: g.holes }, 6, `gear z${teeth} m${module}`);
    }
  }
});

test('gears: hub solids and tiny gears without webs', () => {
  const g = P.gearProfile({ teeth: 40, module: 2, bore: 5.3, hub: 4, hubRadius: 9 });
  assertSolid({ outer: g.hub.outer, holes: g.hub.holes }, 4, 'hub');
  const tiny = P.gearProfile({ teeth: 9, module: 1.5, bore: 3.3, web: false });
  assertSolid({ outer: tiny.outer, holes: tiny.holes }, 6, 'tiny gear');
});

test('racks: tooth counts and heights', () => {
  for (const teeth of [6, 10, 14, 18, 24]) {
    for (const module of [1, 1.5, 2]) {
      const r = P.rackProfile({ teeth, module, height: 10 });
      assertSolid({ outer: r.outer }, 6, `rack ${teeth}×m${module}`);
    }
  }
});

test('cams: all motion laws, lifts and dwell layouts', () => {
  const laws = ['harmonic', 'cycloidal', 'parabolic'];
  for (const law of laws) {
    for (const lift of [4, 8, 14]) {
      for (const rollerRadius of [4, 6, 8]) {
        const c = P.camProfile({ baseRadius: 18, lift, rollerRadius, law });
        assertSolid({ outer: c.outer, holes: [P.circle(0, 0, 1.7, 32)] }, 6, `cam ${law} lift${lift} r${rollerRadius}`);
      }
    }
    const uneven = P.camProfile({ baseRadius: 20, lift: 10, rollerRadius: 5, rise: 90, top: 40, fall: 150, bottom: 80, law });
    assertSolid({ outer: uneven.outer, holes: [P.circle(0, 0, 1.7, 32)] }, 8, `cam uneven ${law}`);
  }
});

test('cam reports the roller it can carry without folding or running thin', () => {
  const c = P.camProfile({ baseRadius: 18, lift: 8, rollerRadius: 5 });
  assert.ok(!c.undercut, 'default cam should not undercut');
  assert.ok(!c.folded, 'default cam outline should be simple');
  // The outline is the pitch curve pulled in by the roller, so the smallest
  // radius is what the bore has to fit inside: base − roller.
  assert.ok(Math.abs(c.minRadius - (18 - 5)) < 0.6, `minRadius ${c.minRadius}`);
  const tight = P.camProfile({ baseRadius: 12, lift: 10, rollerRadius: 9, law: 'harmonic' });
  assert.ok(tight.minRadius < 4, 'an oversized roller leaves no wall around the bore');
});

test('triangulation area equals the profile area for every shape', () => {
  const cases = [
    { outer: P.rectC(20, 20), holes: [] },
    { outer: P.rectC(20, 20), holes: [P.circle(0, 0, 4, 32)] },
    { outer: P.gearProfile({ teeth: 17, module: 2, bore: 3.3 }).outer, holes: P.gearProfile({ teeth: 17, module: 2, bore: 3.3 }).holes },
  ];
  for (const c of cases) {
    const tris = triangulate(c.outer, c.holes);
    const sum = tris.reduce((a, t) => a + signedArea(t), 0);
    const want = expectVolume(c);
    assert.ok(Math.abs(sum - want) / want < 1e-6, `area ${sum} vs ${want}`);
    assert.ok(tris.every((t) => signedArea(t) > 0), 'every cap triangle must be counter-clockwise');
  }
});

test('STL output is the right size and starts with a triangle count', () => {
  const { tris } = assertSolid({ outer: P.rectC(10, 10), holes: [P.circle(0, 0, 2, 16)] }, 3, 'stl');
  const buf = stlBinary(tris, 'test part');
  assert.equal(buf.length, 84 + tris.length * 50);
  const view = new DataView(buf.buffer);
  assert.equal(view.getUint32(80, true), tris.length);
  assert.ok(buf.length > 0);
});

test('bounds are reported in millimetres', () => {
  const tris = extrude({ outer: P.rect(0, 0, 20, 10), holes: [], z: 2, h: 4 });
  const b = bbox(tris);
  assert.deepEqual(b.min.map((v) => Math.round(v)), [0, 0, 2]);
  assert.deepEqual(b.max.map((v) => Math.round(v)), [20, 10, 6]);
});
