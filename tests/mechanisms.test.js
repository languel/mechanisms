/* Every mechanism, at its defaults and at every parameter extreme: the machine
   must build, every printed part must come out as a closed solid, the pose must
   move every part it names, and the readouts must be real numbers.

   These are the same checks the build runs before publishing a page, applied to
   the whole parameter space rather than the defaults. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { partStats } from '../src/lib/export.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MECH = path.join(ROOT, 'mechanisms');

const slugs = fs.readdirSync(MECH, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(MECH, e.name, 'mechanism.js')))
  .map((e) => e.name)
  .sort();

const load = async (slug) => import(pathToFileURL(path.join(MECH, slug, 'mechanism.js')).href);
const defaults = (mod) => Object.fromEntries(mod.params.map((p) => [p.key, p.value]));

/** A few settings per mechanism: defaults, then each numeric parameter at min and max. */
function settings(mod) {
  const base = defaults(mod);
  const out = [{ name: 'defaults', values: base }];
  for (const p of mod.params) {
    if (p.kind === 'choice') {
      for (const o of p.options) out.push({ name: `${p.key}=${o.value}`, values: { ...base, [p.key]: o.value } });
    } else {
      out.push({ name: `${p.key}=min`, values: { ...base, [p.key]: p.min } });
      out.push({ name: `${p.key}=max`, values: { ...base, [p.key]: p.max } });
    }
  }
  return out;
}

test('the catalogue has mechanisms to check', () => {
  assert.ok(slugs.length >= 7, `expected the starter catalogue, found ${slugs.join(', ')}`);
});

for (const slug of slugs) {
  test(`${slug}: builds a printable kit at every parameter extreme`, async () => {
    const mod = await load(slug);
    for (const setting of settings(mod)) {
      let out;
      try {
        out = mod.build(setting.values);
      } catch (err) {
        assert.fail(`${slug} @ ${setting.name}: build threw: ${err.message}`);
      }
      assert.ok(out.parts.length > 0, `${slug} @ ${setting.name}: no parts`);
      assert.ok(Array.isArray(out.checks), `${slug} @ ${setting.name}: no checks`);

      for (const part of out.parts) {
        assert.ok(part.id && part.name, `${slug} @ ${setting.name}: part without id or name`);
        if (part.kind !== 'print') continue;
        const s = partStats(part);
        assert.ok(
          s.closed,
          `${slug} @ ${setting.name}: part "${part.id}" is not printable: ${JSON.stringify(s.problems?.slice(0, 3))}`,
        );
        assert.ok(s.volume > 0.5, `${slug} @ ${setting.name}: part "${part.id}" has no material (${s.volume} mm³)`);
        assert.ok(s.size.every((v) => v > 0 && v < 240), `${slug} @ ${setting.name}: part "${part.id}" does not fit a 220 mm bed: ${s.size}`);
      }
    }
  });

  test(`${slug}: motion and numbers are real at every angle`, async () => {
    const mod = await load(slug);
    const values = defaults(mod);
    const out = mod.build(values);
    const ids = new Set(out.parts.map((p) => p.id));

    for (let t = -180; t <= 540; t += 15) {
      const pose = mod.pose(values, t);
      for (const [id, p] of Object.entries(pose)) {
        assert.ok(ids.has(id), `${slug}: pose names a part that does not exist: ${id}`);
        for (const k of ['rot', 'dx', 'dy']) {
          if (p[k] === undefined) continue;
          assert.ok(Number.isFinite(p[k]), `${slug} @ ${t}°: ${id}.${k} is ${p[k]}`);
        }
      }
      const readouts = mod.readouts(values, t);
      assert.ok(Array.isArray(readouts) && readouts.length >= 1);
      for (const r of readouts) {
        assert.ok(r.label && r.value !== undefined, `${slug}: malformed readout`);
        assert.ok(!String(r.value).includes('NaN'), `${slug} @ ${t}°: ${r.label} reads NaN`);
        assert.ok(!String(r.value).includes('Infinity'), `${slug} @ ${t}°: ${r.label} reads Infinity`);
      }
    }
  });

  test(`${slug}: breakdown steps point at real parts and angles`, async () => {
    const mod = await load(slug);
    const out = mod.build(defaults(mod));
    const ids = new Set(out.parts.map((p) => p.id));
    assert.ok(Array.isArray(mod.steps) && mod.steps.length >= 3, `${slug}: needs at least three steps`);
    for (const step of mod.steps) {
      assert.ok(step.title && step.text, `${slug}: step without title or text`);
      assert.ok(Number.isFinite(step.t), `${slug}: step "${step.title}" has no angle`);
      for (const id of step.parts || []) {
        assert.ok(ids.has(id), `${slug}: step "${step.title}" names a missing part: ${id}`);
      }
      if (step.set) {
        // the step's own parameter changes must still build
        const values = { ...defaults(mod), ...step.set };
        const built = mod.build(values);
        assert.ok(built.parts.length, `${slug}: step "${step.title}" produces no parts`);
      }
    }
  });

  test(`${slug}: page metadata is complete`, async () => {
    const mod = await load(slug);
    const m = mod.meta;
    for (const key of ['slug', 'title', 'tagline', 'category', 'question', 'bigIdea']) {
      assert.ok(m[key] && String(m[key]).length > 3, `${slug}: meta.${key} is missing`);
    }
    assert.equal(m.slug, slug, `${slug}: meta.slug must match the folder`);
    assert.ok(m.notes && m.notes.length >= 3, `${slug}: needs at least three breakdown notes`);
    for (const note of m.notes) {
      assert.ok(note.h && note.p, `${slug}: note without heading or text`);
    }
    assert.ok(mod.params.length >= 2, `${slug}: needs at least two parameters`);
    for (const p of mod.params) {
      assert.ok(p.key && p.label, `${slug}: parameter without key or label`);
      if (p.kind === 'choice') assert.ok(p.options.length >= 2, `${slug}: ${p.key} needs options`);
      else assert.ok(p.min < p.max && p.value >= p.min && p.value <= p.max, `${slug}: ${p.key} range is wrong`);
    }
  });
}

test('geometry facts hold for the mechanisms that teach them', async () => {
  // Crank and slider: the travel really is twice the crank radius.
  const crank = await load('crank-slider');
  for (const stroke of [18, 34, 60]) {
    const v = { ...defaults(crank), stroke };
    const out = crank.build(v);
    const a = out.g.sliderX(0);
    const b = out.g.sliderX(180);
    assert.ok(Math.abs((a - b) - stroke) < 1e-6, `stroke ${stroke}: travel ${a - b}`);
  }

  // Gears: ratio is the tooth counts, and the centre distance is the module sum.
  const gears = await load('gear-pair');
  const gv = { ...defaults(gears), driver: 20, driven: 40, module: 2 };
  const gp = gears.build(gv).g;
  assert.ok(Math.abs(gp.centre - (20 + 40)) < 1e-9, `centre distance ${gp.centre}`);
  const moved = gears.pose(gv, 90);
  assert.ok(Math.abs(moved.driven.rot - (-90 * 20 / 40) * Math.PI / 180) < 1e-9, 'output angle');

  // Rack and pinion: one turn moves the rack π × pitch diameter.
  const rack = await load('rack-pinion');
  const rv = { ...defaults(rack), module: 2, teeth: 18 };
  const rg = rack.build(rv).g;
  assert.ok(Math.abs(Math.PI * 2 * rg.rp - Math.PI * 2 * 18) < 1e-9);

  // Cam: the follower sits on the base circle during the bottom dwell and at
  // full lift during the top dwell.
  const cam = await load('cam-follower');
  const cv = { ...defaults(cam), lift: 8, rise: 120, top: 60 };
  const cg = cam.build(cv).g;
  assert.ok(Math.abs(cg.lift(0) - 0) < 1e-9, 'lift at 0°');
  assert.ok(Math.abs(cg.lift(120 + 20) - 8) < 1e-9, 'lift at top dwell');
  assert.ok(Math.abs(cg.lift(300) - 0) < 1e-9, 'lift at base');

  // Ratchet: one stroke is one tooth.
  const ratchet = await load('ratchet-pawl');
  const rtv = { ...defaults(ratchet), teeth: 12 };
  assert.ok(Math.abs(ratchet.build(rtv).g.step - 30) < 1e-9);

  // Geneva: the step and the drive arc follow from the slot count.
  const geneva = await load('geneva-indexer');
  const gnv = { ...defaults(geneva), slots: 4 };
  const gng = geneva.build(gnv).g;
  assert.ok(Math.abs(gng.stepAngle - 90) < 1e-9);
  assert.ok(Math.abs(gng.driveAngle - 90) < 1e-9);

  // Servo crank: the carriage moves less than a full crank would, because the
  // servo only sweeps half a circle.
  const servo = await load('servo-crank');
  const sv = { ...defaults(servo) };
  const sg = servo.build(sv).g;
  const halfCrank = sg.r;
  const servoStroke = Math.abs(sg.sliderX(0) - sg.sliderX(90));
  assert.ok(servoStroke < 2 * halfCrank, 'servo crank cannot reach a full crank stroke');
});
