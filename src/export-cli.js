/* export-cli.js — write a print pack without opening the browser.

   node src/export-cli.js                     every mechanism, default parameters
   node src/export-cli.js crank-slider        one mechanism
   node src/export-cli.js cam-follower lift=12 rise=90 law=parabolic
   node src/export-cli.js --all --out=dist

   One ZIP per mechanism, containing one STL per printed part (already flat on
   the bed), the parameter sheet, and the bill of materials. The exit code is
   non-zero if any part fails its printability checks.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { printPack, zipStore } from './lib/export.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MECH_DIR = path.join(ROOT, 'mechanisms');

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const rest = args.filter((a) => !a.startsWith('--'));
const outDir = path.join(ROOT, flags.find((f) => f.startsWith('--out='))?.slice(6) || 'export');
const all = flags.includes('--all');
const pairs = rest.filter((a) => a.includes('='));
const slugArg = rest.find((a) => !a.includes('='));

async function slugs() {
  const entries = await fs.readdir(MECH_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (await fs.stat(path.join(MECH_DIR, e.name, 'mechanism.js')).catch(() => null)) out.push(e.name);
  }
  return out.sort();
}

function parseValues(mod, pairsIn) {
  const values = Object.fromEntries(mod.params.map((p) => [p.key, p.value]));
  for (const pair of pairsIn) {
    const [k, raw] = pair.split('=');
    const param = mod.params.find((p) => p.key === k);
    if (!param) {
      console.warn(`  ! ${k} is not a parameter of this mechanism (${mod.params.map((p) => p.key).join(', ')})`);
      continue;
    }
    if (param.kind === 'choice') values[k] = raw;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) { console.warn(`  ! ${k}=${raw} is not a number`); continue; }
      values[k] = Math.min(param.max, Math.max(param.min, n));
    }
  }
  return values;
}

async function exportOne(slug) {
  const mod = await import(pathToFileURL(path.join(MECH_DIR, slug, 'mechanism.js')).href);
  const values = parseValues(mod, pairs);
  const out = mod.build(values);
  const pack = printPack({
    meta: mod.meta,
    params: mod.params,
    paramValues: values,
    parts: out.parts,
    hardware: mod.hardware || [],
    assembly: (mod.steps || []).map((s) => `${s.title} — ${s.text}`),
  });

  const broken = pack.stats.filter((s) => !s.closed);
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${slug}-print-pack.zip`);
  await fs.writeFile(file, zipStore(pack.files));

  const summary = `${slug}: ${pack.stats.length} printed parts, ${pack.totals.grams.toFixed(1)} g, ` +
    `${pack.totals.triangles} triangles → ${path.relative(ROOT, file)}`;
  if (broken.length) {
    console.error(`  ✗ ${summary}`);
    for (const b of broken) console.error(`     ${b.part.id}: ${JSON.stringify(b.problems?.slice(0, 3))}`);
    return false;
  }
  const failed = (out.checks || []).filter((c) => !c.ok);
  console.log(`  ✓ ${summary}`);
  for (const f of failed) console.log(`     ! ${f.text}`);
  return true;
}

const list = all || !slugArg ? await slugs() : [slugArg];
if (!all && slugArg && !list.includes(slugArg)) {
  console.error(`no mechanism called "${slugArg}". Available: ${(await slugs()).join(', ')}`);
  process.exit(1);
}
let ok = true;
for (const slug of list) {
  try {
    ok = (await exportOne(slug)) && ok;
  } catch (err) {
    console.error(`  ✗ ${slug}: ${err.message}`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
