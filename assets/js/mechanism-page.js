/* mechanism-page.js — wires one mechanism module into the page.

   A mechanism module (mechanisms/<slug>/mechanism.js) is a pure ES module:

     meta       title, tagline, question, bigIdea, notes, references
     params     the print parameters, with ranges and defaults
     hardware   the parts you buy, not print
     steps      the breakdown, each pinned to a shaft angle
     build(p)   parts of the assembled machine (print-flat geometry + heights)
     pose(p,t)  how each part moves at shaft angle t
     readouts(p,t) the live numbers, all read from the same model

   Nothing here knows anything about a particular mechanism.
*/

import { Viewer } from './viewer.js';
import { partStats, printPack, zipStore, fileNameFor } from '../../src/lib/export.js';
import { stlBinary } from '../../src/lib/mesh.js';
import { KIT } from '../../src/lib/kit.js';

const body = document.body;
const slug = body.dataset.mechanism;
const moduleUrl = new URL(body.dataset.module || './mechanism.js', document.baseURI);
const mod = await import(moduleUrl.href);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

/* ------------------------------------------------------------------ state */

const params = mod.params;
const values = Object.fromEntries(params.map((p) => [p.key, p.value]));
hydrateFromUrl();

const state = {
  t: mod.startAngle ?? 0,
  playing: !reduced,
  speed: 0.14,
  explode: 0,
  ghost: false,
  hardware: true,
  selected: null,
  stepIndex: -1,
};

/* ------------------------------------------------------------------- stage */

const viewport = $('#viewport');
const canvas = $('#stage-canvas');
const tooltip = $('#tooltip');
canvas.tabIndex = 0;
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', `${mod.meta.title}: an interactive, printable mechanism. Drag to orbit, scroll to zoom.`);

let viewer;
let live3d = true;
try {
  viewer = new Viewer(canvas, {
    onPick: (id) => selectPart(id, true),
    onHover: (id, event) => {
    if (!event || !id) { tooltip.classList.remove('on'); return; }
    const part = currentParts.find((p) => p.id === id);
    if (!part) return;
    tooltip.innerHTML = '';
    tooltip.append(el('div', {}, part.name));
    if (part.note) tooltip.append(el('small', {}, part.note));
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
      tooltip.classList.add('on');
    },
  });
  viewer.setViewState({ showHardware: true });
} catch (err) {
  // No WebGL: the page keeps working. The isometric figure stays on screen, the
  // parameters, the numbers, the breakdown and the print pack do not depend on it.
  console.warn('3D stage unavailable, showing the isometric figure:', err);
  live3d = false;
  viewer = {
    setParts() {}, setViewState() {}, applyPose() {}, renderOnce() {},
    dispose() {}, zoom: 1, azimuth: 0, elevation: 0,
  };
  const note = document.createElement('div');
  note.className = 'stage-note';
  note.textContent = 'WebGL is off in this browser — showing the isometric figure. '
    + 'The model, numbers and print pack are live.';
  viewport.append(note);
}
if (live3d) {
  const fb = document.getElementById('fallback');
  if (fb) fb.classList.add('hidden');
}

let currentParts = [];
let stats = new Map();
let pack = null;

/* ------------------------------------------------------------------- build */

function build() {
  const out = mod.build(values);
  currentParts = out.parts;

  // explode order: frames stay put, layers lift in sequence
  const layers = [...new Set(currentParts.map((p) => p.layer || 0))].sort((a, b) => a - b);
  currentParts.forEach((p) => {
    p.explodeRank = p.role === 'frame' ? 0 : layers.indexOf(p.layer || 0) + 1;
    p.role = p.role || (p.id === 'frame' ? 'frame' : 'part');
  });

  viewer.setParts(currentParts);
  viewer.setViewState({ selected: state.selected, showHardware: state.hardware, explode: state.explode, ghost: state.ghost });
  viewer.applyPose(mod.pose(values, state.t));

  stats = new Map();
  for (const part of currentParts) {
    if (part.kind !== 'print') continue;
    try {
      stats.set(part.id, partStats(part));
    } catch (err) {
      stats.set(part.id, { error: String(err && err.message || err) });
    }
  }
  pack = null;

  renderChecks(out.checks || []);
  renderParts();
  renderExport();
  applyPose();
}

function applyPose() {
  viewer.applyPose(mod.pose(values, state.t));
  updateReadouts();
}

/* ------------------------------------------------------------------ params */

function renderParams() {
  const host = $('#params');
  host.innerHTML = '';
  for (const p of params) {
    const id = `p-${p.key}`;
    const out = el('output', { for: id }, valueLabel(p, values[p.key]));
    const label = el('label', { for: id }, p.label, el('span', { class: 'unit' }, p.unit ? ` (${p.unit})` : ''));
    let input;
    if (p.kind === 'choice') {
      input = el('select', { id, onchange: (e) => setParam(p, e.target.value) },
        ...p.options.map((o) => el('option', { value: o.value, selected: o.value === values[p.key] ? 'selected' : null }, o.label)));
    } else {
      input = el('input', {
        id, type: 'range', min: p.min, max: p.max, step: p.step, value: values[p.key],
        oninput: (e) => setParam(p, Number(e.target.value)),
      });
    }
    host.append(el('div', { class: 'param' }, label, out, input,
      p.help ? el('div', { class: 'help' }, p.help) : null));
  }
}

function valueLabel(p, v) {
  if (p.kind === 'choice') return p.options.find((o) => String(o.value) === String(v))?.label ?? v;
  return `${v}${p.unit ? ` ${p.unit}` : ''}`;
}

let rebuildQueued = false;
function setParam(p, v) {
  values[p.key] = v;
  const out = document.querySelector(`output[for="p-${p.key}"]`);
  if (out) out.textContent = valueLabel(p, v);
  if (p.key === 'clearance') state.hardware = state.hardware;
  syncUrl();
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    build();
    if (state.stepIndex >= 0) setStep(-1);
  });
}

function hydrateFromUrl() {
  const url = new URL(window.location.href);
  for (const p of mod.params) {
    const raw = url.searchParams.get(p.key);
    if (raw == null) continue;
    if (p.kind === 'choice') {
      if (p.options.some((o) => String(o.value) === raw)) values[p.key] = raw;
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) values[p.key] = Math.min(p.max, Math.max(p.min, n));
    }
  }
}

let urlTimer = 0;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const url = new URL(window.location.href);
    for (const p of params) {
      if (String(values[p.key]) === String(p.value)) url.searchParams.delete(p.key);
      else url.searchParams.set(p.key, values[p.key]);
    }
    window.history.replaceState(null, '', url);
  }, 240);
}

/* ---------------------------------------------------------------- readouts */

function updateReadouts() {
  const list = mod.readouts(values, state.t) || [];
  const host = $('#readouts');
  if (host.childElementCount !== list.length) {
    host.innerHTML = '';
    for (const r of list) {
      host.append(el('div', { class: 'readout' },
        el('div', { class: 'k' }, r.label),
        el('div', { class: 'v', 'data-k': r.label }, String(r.value), r.unit ? el('span', {}, r.unit) : null)));
    }
  } else {
    list.forEach((r, i) => {
      const node = host.children[i].querySelector('.v');
      node.childNodes[0].nodeValue = String(r.value);
    });
  }
  const scrub = $('#scrub');
  if (scrub && !scrub.matches(':active')) scrub.value = String(Math.round(((state.t % 360) + 360) % 360));
  const angle = $('#angle');
  if (angle) angle.textContent = `${Math.round(((state.t % 360) + 360) % 360)}°`;
}

function renderChecks(checks) {
  const host = $('#checks');
  host.innerHTML = '';
  if (!checks.length) return;
  for (const c of checks) {
    host.append(el('div', { class: `check${c.ok ? '' : ' bad'}` },
      el('span', { class: 'dot' }), el('span', {}, c.text)));
  }
}

/* ------------------------------------------------------------------- parts */

function renderParts() {
  const host = $('#parts');
  host.innerHTML = '';
  for (const part of currentParts) {
    const s = stats.get(part.id);
    const meta = part.kind === 'hardware'
      ? el('div', { class: 'meta hw' }, `${part.qty || 1}×`, part.material || 'steel')
      : el('div', { class: 'meta' },
        `${(s?.grams ?? 0).toFixed(1)} g`,
        s?.closed === false ? el('span', { style: 'color:var(--warn)' }, 'open mesh') : null);
    const row = el('li', {
      'data-id': part.id,
      'data-on': state.selected === part.id ? 'true' : null,
      onclick: () => selectPart(part.id, true),
      onmouseenter: () => { viewer.setViewState({ hovered: part.id }); },
      onmouseleave: () => { viewer.setViewState({ hovered: null }); },
    },
      el('span', { class: 'sw', style: `background:${part.color}` }),
      el('div', { class: 'nm' }, part.name, part.note ? el('small', {}, part.note) : null),
      meta);
    host.append(row);
  }
}

function selectPart(id, fromStage) {
  state.selected = id;
  viewer.setViewState({ selected: id });
  for (const row of document.querySelectorAll('.parts li')) {
    row.dataset.on = row.dataset.id === id ? 'true' : 'false';
  }
  const detail = $('#part-detail');
  const part = currentParts.find((p) => p.id === id);
  if (!part) { detail.hidden = true; return; }
  const s = stats.get(part.id);
  detail.hidden = false;
  detail.innerHTML = '';
  detail.append(
    el('h3', {}, part.name),
    el('p', {}, part.note || ''),
    part.kind === 'print'
      ? el('p', { class: 'src' },
        `${s && !s.error ? `${s.size.map((v) => v.toFixed(1)).join(' × ')} mm · ${s.cm3.toFixed(2)} cm³ · ${s.grams.toFixed(1)} g PLA · ` : ''}`,
        s?.closed === false ? 'MESH NOT CLOSED' : 'watertight')
      : el('p', { class: 'src' }, `Hardware: ${part.material}`),
  );
  if (part.kind === 'print' && s && !s.error) {
    detail.append(el('button', { class: 'btn small', onclick: () => downloadPart(part) }, 'Download STL'));
  }
  void fromStage;
}

/* ------------------------------------------------------------------ export */

function renderExport() {
  const printed = currentParts.filter((p) => p.kind === 'print');
  const total = printed.reduce((acc, p) => {
    const s = stats.get(p.id);
    if (s && !s.error) { acc.grams += s.grams * (p.qty || 1); acc.volume += s.cm3 * (p.qty || 1); }
    return acc;
  }, { grams: 0, volume: 0 });

  const host = $('#export');
  host.innerHTML = '';
  host.append(el('div', { class: 'totals' },
    el('div', { class: 'total' }, el('div', { class: 'k' }, 'Printed parts'), el('div', { class: 'v' }, String(printed.length))),
    el('div', { class: 'total' }, el('div', { class: 'k' }, 'Filament'), el('div', { class: 'v' }, `${total.grams.toFixed(1)} g`)),
    el('div', { class: 'total' }, el('div', { class: 'k' }, 'Volume'), el('div', { class: 'v' }, `${total.volume.toFixed(1)} cm³`)),
  ));

  host.append(el('div', { class: 'export-actions' },
    el('button', { class: 'btn primary', onclick: downloadPack }, 'Print pack (.zip)'),
    el('button', { class: 'btn', onclick: () => downloadSheet() }, 'Sheet (.md)'),
  ));

  host.append(el('div', { class: 'settings' },
    el('div', {}, 'Every STL is already flat on the bed — no supports. '),
    el('div', {}, `0.2 mm layers · 3 walls · 25% infill · bores Ø${(KIT.rod + Number(values.clearance ?? KIT.fit)).toFixed(2)} mm for Ø${KIT.rod} rod.`),
    el('div', {}, 'Files: ', el('code', {}, 'stl/…'), ' ', el('code', {}, 'README.md'), ' ', el('code', {}, 'parts.csv')),
  ));
}

function makePack() {
  if (pack) return pack;
  pack = printPack({
    meta: mod.meta,
    params,
    paramValues: values,
    parts: currentParts,
    hardware: mod.hardware || [],
    assembly: (mod.steps || []).map((s) => `${s.title} — ${s.text}`),
  });
  return pack;
}

function download(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadPack() {
  const p = makePack();
  download(zipStore(p.files), `${slug}-print-pack.zip`, 'application/zip');
}

function downloadSheet() {
  const p = makePack();
  const text = p.files.find((f) => f.name === 'README.md').data;
  download(text, `${slug}-print-sheet.md`, 'text/markdown');
}

function downloadPart(part) {
  const s = stats.get(part.id);
  if (!s || s.error) return;
  const index = currentParts.filter((p) => p.kind === 'print').findIndex((p) => p.id === part.id);
  download(stlBinary(s.tris, `${slug} ${part.id}`), fileNameFor(slug, part, Math.max(0, index)), 'model/stl');
}

/* ------------------------------------------------------------------- steps */

function renderSteps() {
  const host = $('#steps');
  host.innerHTML = '';
  (mod.steps || []).forEach((s, i) => {
    host.append(el('li', {},
      el('button', {
        type: 'button',
        'aria-current': 'false',
        onclick: () => setStep(i),
      },
        el('span', {},
          el('span', { class: 't' }, s.title),
          el('span', { class: 'd', style: 'display:block' }, s.text)))));
  });
}

function setStep(i) {
  state.stepIndex = i;
  const buttons = document.querySelectorAll('.steps button');
  buttons.forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
  if (i < 0) return;
  const step = mod.steps[i];
  state.playing = false;
  syncPlayButton();

  // A step may change parameters to make its point. Apply them, move the
  // sliders to match, and rebuild — the point of the step is the difference.
  if (step.set) {
    let changed = false;
    for (const [key, value] of Object.entries(step.set)) {
      if (String(values[key]) === String(value)) continue;
      const param = params.find((p) => p.key === key);
      if (!param) continue;
      values[key] = value;
      changed = true;
      const input = document.getElementById(`p-${key}`);
      if (input) input.value = value;
      const out = document.querySelector(`output[for="p-${key}"]`);
      if (out) out.textContent = valueLabel(param, value);
    }
    if (changed) {
      syncUrl();
      build();
      for (const row of document.querySelectorAll('.steps button')) {
        row.setAttribute('aria-current', 'false');
      }
      buttons[i]?.setAttribute('aria-current', 'true');
    }
  }
  if (typeof step.t === 'number') {
    // ease to the step's angle rather than snapping
    target = step.t;
  }
  if (step.parts) {
    const first = step.parts[0];
    viewer.setViewState({ selected: first });
    selectPart(first, false);
    state.selected = first;
  }
  if (step.explode !== undefined) {
    state.explode = step.explode;
    const slider = $('#explode');
    if (slider) slider.value = String(step.explode);
    viewer.setViewState({ explode: state.explode });
  }
  viewer.applyPose(mod.pose(values, state.t));
}

/* -------------------------------------------------------------- transport */

let target = null;
let last = 0;
let readoutClock = 0;

function syncPlayButton() {
  const b = $('#play');
  if (!b) return;
  const label = $('#play-label');
  if (label) label.textContent = state.playing ? 'Pause' : 'Run';
  b.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;

  let moved = false;
  if (state.playing) {
    state.t += dt * state.speed * 360;
    moved = true;
  } else if (target !== null) {
    // ease toward the step's angle along the shortest path
    let delta = ((target - state.t) % 360 + 540) % 360 - 180;
    if (Math.abs(delta) < 0.4) { state.t = target; target = null; }
    else state.t += delta * (1 - Math.exp(-dt / 0.22));
    moved = true;
  }
  if (!moved) return;

  viewer.applyPose(mod.pose(values, state.t));
  readoutClock += dt;
  if (readoutClock > 0.08) { readoutClock = 0; updateReadouts(); }
}

/* ------------------------------------------------------------------- wiring */

function wire() {
  $('#play').addEventListener('click', () => {
    state.playing = !state.playing;
    if (state.playing) target = null;
    syncPlayButton();
  });
  $('#scrub').addEventListener('input', (e) => {
    state.playing = false;
    target = null;
    syncPlayButton();
    state.t = Number(e.target.value);
    applyPose();
  });
  $('#speed').addEventListener('input', (e) => {
    state.speed = Number(e.target.value);
    const out = $('#speed-out');
    if (out) out.textContent = `${(state.speed * 60).toFixed(0)} rpm`;
  });
  $('#explode').addEventListener('input', (e) => {
    state.explode = Number(e.target.value);
    viewer.setViewState({ explode: state.explode });
    viewer.applyPose(mod.pose(values, state.t));
  });
  $('#ghost').addEventListener('click', (e) => {
    state.ghost = !state.ghost;
    e.currentTarget.setAttribute('aria-pressed', String(state.ghost));
    viewer.setViewState({ ghost: state.ghost });
  });
  $('#hardware').addEventListener('click', (e) => {
    state.hardware = !state.hardware;
    e.currentTarget.setAttribute('aria-pressed', String(state.hardware));
    viewer.setViewState({ showHardware: state.hardware });
    viewer.applyPose(mod.pose(values, state.t));
  });
  $('#reset').addEventListener('click', () => {
    state.t = 0;
    state.explode = 0;
    state.playing = !reduced;
    setStep(-1);
    $('#explode').value = '0';
    viewer.setViewState({ explode: 0 });
    syncPlayButton();
    applyPose();
  });
  viewport.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      state.playing = !state.playing;
      target = null;
      syncPlayButton();
    }
    if (e.key === 'ArrowRight' && !state.playing) { state.t += 5; applyPose(); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && !state.playing) { state.t -= 5; applyPose(); e.preventDefault(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, button, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); state.playing = !state.playing; syncPlayButton(); }
  });
}

/* ------------------------------------------------------------------- start */

function renderText() {
  document.title = `${mod.meta.title} · Mechanisms`;
  $('#title').textContent = mod.meta.title;
  $('#tagline').textContent = mod.meta.tagline;
  $('#kicker').textContent = mod.meta.category;
  $('#question').textContent = mod.meta.question;
  $('#bigidea').textContent = mod.meta.bigIdea;

  const notes = $('#notes');
  notes.innerHTML = '';
  for (const n of mod.meta.notes || []) {
    notes.append(el('h3', {}, n.h), el('p', { html: n.p }));
  }
  if (mod.meta.references?.length) {
    const src = el('div', { class: 'src' }, 'Sources');
    for (const r of mod.meta.references) {
      src.append(el('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.label));
    }
    notes.append(src);
  }
  const hw = $('#hardware-list');
  if (hw && mod.hardware) {
    hw.innerHTML = '';
    for (const h of mod.hardware) {
      hw.append(el('li', {}, el('b', {}, `${h.qty}× ${h.name}`), ` — ${h.spec}`));
    }
  }
}

renderText();
renderParams();
renderSteps();
wire();
build();
syncPlayButton();
updateReadouts();
requestAnimationFrame(tick);

// expose a little for debugging and for the build's screenshot pass
window.__mechanism = { mod, values, state, viewer, build };
