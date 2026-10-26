/* build.js — turn the mechanism & motor modules into the published site.

   node src/build.js            build every mechanism page, card and the catalogue
   node src/build.js --only=slug

   For each mechanism it proves the print pack (every part closed, correctly
   wound, no overlapping solids), draws the hidden-line-removed Teardown card
   image from the same geometry, writes the page, and refreshes the catalogue
   and manifest.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { printPack } from './lib/export.js';
import { isoFigure } from './lib/iso.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MECH_DIR = path.join(ROOT, 'mechanisms');
const IMG_DIR = path.join(ROOT, 'assets', 'img');
const TPL_DIR = path.join(ROOT, 'src', 'templates');

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const quiet = process.argv.includes('--quiet');

const log = (...a) => { if (!quiet) console.log(...a); };

async function readTemplate(name) {
  return fs.readFile(path.join(TPL_DIR, name), 'utf8');
}

function fill(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function mechanismSlugs() {
  const entries = await fs.readdir(MECH_DIR, { withFileTypes: true });
  const slugs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      await fs.access(path.join(MECH_DIR, e.name, 'mechanism.js'));
      slugs.push(e.name);
    } catch { /* not a mechanism */ }
  }
  return slugs.sort();
}

/** Default values for a mechanism's parameters. */
const defaults = (mod) => Object.fromEntries(mod.params.map((p) => [p.key, p.value]));

async function buildOne(slug) {
  const mod = await import(pathToFileURL(path.join(MECH_DIR, slug, 'mechanism.js')).href);
  const values = defaults(mod);
  const out = mod.build(values);

  // Prove the print pack before anything is written.
  const pack = printPack({
    meta: mod.meta,
    params: mod.params,
    paramValues: values,
    parts: out.parts,
    hardware: mod.hardware || [],
    assembly: (mod.steps || []).map((s) => `${s.title} — ${s.text}`),
  });

  const broken = pack.stats.filter((s) => !s.closed);
  if (broken.length) {
    const detail = broken.map((s) => `${s.part.id}: ${JSON.stringify(s.problems?.slice(0, 3))}`).join('\n');
    throw new Error(`${slug}: ${broken.length} printed part(s) are not printable\n${detail}`);
  }

  const failed = (out.checks || []).filter((c) => !c.ok);
  if (failed.length) {
    if (!quiet) for (const f of failed) console.warn(`  ! ${slug}: ${f.text}`);
  }

  // The card image: rendered with Teardown hidden-line removal at the module's chosen angle.
  // 3 rendering styles: Hatched line (`-hatch.svg`), Patent line (`-line.svg`), and Color (`-color.svg`).
  const svgPath = path.join(IMG_DIR, `${slug}.svg`);
  const hatchSvgPath = path.join(IMG_DIR, `${slug}-hatch.svg`);
  const lineSvgPath = path.join(IMG_DIR, `${slug}-line.svg`);
  const colorSvgPath = path.join(IMG_DIR, `${slug}-color.svg`);
  let svgText;
  if (process.argv.includes('--html-only')) {
    svgText = await fs.readFile(svgPath, 'utf8').catch(() => '');
  }
  if (!svgText) {
    const shot = mod.meta.screenshot || {};
    const angle = shot.t ?? 0;
    const pose = mod.pose(values, angle);
    const figHatch = isoFigure(out.parts, pose, {
      width: 900,
      maxHeight: 680,
      azimuth: shot.azimuth ?? -0.62,
      elevation: shot.elevation ?? 0.82,
      background: '#f7f2e7',
      fill: 'hatch',
      hatch: true,
      prominentLines: true,
      hardware: true,
    });
    svgText = figHatch.svg;
    await fs.writeFile(svgPath, svgText);
    await fs.writeFile(hatchSvgPath, svgText);

    const figLine = isoFigure(out.parts, pose, {
      width: 900,
      maxHeight: 680,
      azimuth: shot.azimuth ?? -0.62,
      elevation: shot.elevation ?? 0.82,
      background: '#f7f2e7',
      fill: false,
      hatch: false,
      prominentLines: true,
      hardware: true,
    });
    await fs.writeFile(lineSvgPath, figLine.svg);

    const figColor = isoFigure(out.parts, pose, {
      width: 900,
      maxHeight: 680,
      azimuth: shot.azimuth ?? -0.62,
      elevation: shot.elevation ?? 0.82,
      background: '#f6f1e7',
      fill: true,
      hatch: false,
      prominentLines: true,
      hardware: true,
    });
    await fs.writeFile(colorSvgPath, figColor.svg);
  }

  const tpl = await readTemplate('mechanism.html');
  const html = fill(tpl, {
    slug,
    title: esc(mod.meta.title),
    description: esc(mod.meta.question),
    category: esc(mod.meta.category),
    tagline: esc(mod.meta.tagline),
    question: esc(mod.meta.question),
    bigIdea: esc(mod.meta.bigIdea),
    rpm: `${Math.round(0.14 * 60)} rpm`,
    fallback: svgText,
  });

  const dir = path.join(MECH_DIR, slug);
  await fs.writeFile(path.join(dir, 'index.html'), html);

  const printed = pack.stats;
  return {
    slug,
    title: mod.meta.title,
    category: mod.meta.category,
    kind: mod.meta.kind || 'mechanism',
    tagline: mod.meta.tagline,
    question: mod.meta.question,
    bigIdea: mod.meta.bigIdea,
    params: mod.params.map((p) => ({
      key: p.key, label: p.label, unit: p.unit || '', min: p.min ?? null, max: p.max ?? null, value: p.value,
    })),
    printedParts: printed.length,
    instances: printed.reduce((a, s) => a + (s.part.qty || 1), 0),
    grams: Number(pack.totals.grams.toFixed(1)),
    triangles: pack.totals.triangles,
    hardware: (mod.hardware || []).filter((h) => h.qty > 0).length,
    bed: printed.reduce((acc, s) => [Math.max(acc[0], s.size[0]), Math.max(acc[1], s.size[1])], [0, 0]),
    order: mod.meta.order ?? 100,
  };
}

const BRIEFS = {
  'gear-pair': 'Transmits continuous rotation between parallel shafts with precise whole-number speed and torque ratios.',
  'rack-pinion': 'Converts rotary shaft motion into straight-line travel for steering racks, CNC gantries, and linear stages.',
  'crank-slider': 'Transforms continuous rotation into reciprocating linear piston motion for engines, pumps, and compressors.',
  'cam-follower': 'Translates steady rotation into custom lift, dwell, and timed motion profiles for automation and valve trains.',
  'ratchet-pawl': 'Allows rotation in only one direction while preventing reverse backdrive for winches, jacks, and ratchets.',
  'geneva-indexer': 'Translates continuous rotation into discrete intermittent stepped dwells for film projectors and rotary tool changers.',
  'servo-crank': 'Translates bounded 180° hobby servo rotation into precise linear positioning for animatronics and robotics.',
  'four-bar': 'Turns continuous rotation into sweeping oscillating arcs for windshield wipers, deployable linkages, and steering geometry.',
  'scotch-yoke': 'Converts rotational motion into pure harmonic linear oscillation without angular connecting-rod distortion.',
  'belt-pulley': 'Transmits smooth, quiet rotary motion across wide shaft spans with zero backlash.',
  'dc-motor': 'High-speed continuous electric motor driven by DC voltage, for wheels, propellers, and centrifugal pumps.',
  'stepper-motor': 'Provides precise open-loop discrete angular positioning in 1.8° increments for 3D printers and CNC machines.',
  'servo-motor': 'Closed-loop geared actuator holding exact angular positions (0–180°) via PWM pulse control.',
  'gear-motor': 'Compound spur reduction gearbox delivering high output torque with integrated quadrature encoder feedback.',
};

function renderCard(m, indexLabel) {
  const brief = m.brief || BRIEFS[m.slug] || m.tagline || m.question;
  return `
      <a class="cardlink" href="mechanisms/${m.slug}/index.html" data-category="${esc(m.category)}">
        <div class="card-plate-head">
          <span class="plate-no">${esc(indexLabel)}</span>
          <span class="plate-cat">${esc(m.category)}</span>
        </div>
        <img class="thumb" src="assets/img/${m.slug}-hatch.svg" data-hatch-src="assets/img/${m.slug}-hatch.svg" data-line-src="assets/img/${m.slug}-line.svg" data-color-src="assets/img/${m.slug}-color.svg" data-patent-src="assets/img/${m.slug}-line.svg" alt="${esc(m.title)} — technical assembly drawing" loading="lazy" width="900" height="680">
        <div class="body">
          <h3>${esc(m.title)}</h3>
          <p class="desc">${esc(brief)}</p>
        </div>
      </a>`;
}

function catalogHtml(items, tpl) {
  const mechanismsOnly = items.filter((i) => i.kind !== 'motor' && i.category !== 'Motors & actuators');
  const motorsOnly = items.filter((i) => i.kind === 'motor' || i.category === 'Motors & actuators');
  const categories = [...new Set(items.map((i) => i.category))];

  const cards = mechanismsOnly.map((m, idx) => renderCard(m, `FIG. ${String(idx + 1).padStart(2, '0')}`)).join('');
  const motorCards = motorsOnly.map((m, idx) => renderCard(m, `ACTUATOR ${String(idx + 1).padStart(2, '0')}`)).join('');

  const chips = ['All', ...categories].map((c, i) => `
        <button class="chip" type="button" data-filter="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`).join('');

  const totalParts = items.reduce((a, m) => a + m.printedParts, 0);
  const totalGrams = items.reduce((a, m) => a + m.grams, 0);

  return fill(tpl, {
    cards,
    motorCards,
    chips,
    count: items.length,
    mechCount: mechanismsOnly.length,
    motorCount: motorsOnly.length,
    totalParts,
    totalGrams: totalGrams.toFixed(0),
    updated: new Date().toISOString().slice(0, 10),
  });
}

async function main() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  const slugs = await mechanismSlugs();
  const targets = only ? slugs.filter((s) => s === only) : slugs;
  if (only && !targets.length) throw new Error(`no mechanism called "${only}"`);

  log(`building ${targets.length} mechanism(s)`);
  const results = [];
  for (const slug of targets) {
    const t0 = performance.now();
    const info = await buildOne(slug);
    results.push(info);
    log(`  ${slug.padEnd(22)} ${info.printedParts} printed parts · ${info.grams} g · `
      + `${info.triangles.toLocaleString('en-US')} triangles · ${(performance.now() - t0).toFixed(0)} ms`);
  }

  const manifestPath = path.join(ROOT, 'manifest.json');
  let all = results;
  if (only) {
    const previous = JSON.parse(await fs.readFile(manifestPath, 'utf8').catch(() => '{"mechanisms":[]}'));
    const map = new Map(previous.mechanisms.map((m) => [m.slug, m]));
    for (const r of results) map.set(r.slug, r);
    all = [...map.values()];
  }
  all.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));

  await fs.writeFile(manifestPath, `${JSON.stringify({
    standard: { rod: 3, fit: 0.3, plateT: 4, bodyT: 6, layerPitch: 8 },
    mechanisms: all,
  }, null, 2)}\n`);

  const tpl = await readTemplate('catalog.html');
  await fs.writeFile(path.join(ROOT, 'index.html'), catalogHtml(all, tpl));
  log(`catalogue: ${all.length} modules`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
