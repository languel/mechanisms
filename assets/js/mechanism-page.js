/* mechanism-page.js — wires one mechanism or motor module into the interactive workbench.

   Supports three live stage views from the exact same parametric geometry:
   1. 3D Stage (real-time 60 FPS WebGL orthographic CAD viewer with orbit, zoom, pan,
      camera presets, feature edges, and exploded assembly trails)
   2. Teardown SVG (hidden-line-removed TechnicalProjection blueprint with linework presets)
   3. Print Bed (220 × 220 mm flat build-plate layout preview)
*/

import { Viewer } from './viewer.js';
import {
  partStats,
  printPack,
  zipStore,
  fileNameFor,
  layoutPartsOnBed,
  buildCombinedBedStl,
  buildLaserCutSvg,
  extractPart2DPaths,
} from '../../src/lib/export.js';
import { stlBinary } from '../../src/lib/mesh.js';
import { KIT, COLOR_THEMES, isHardwarePart, resolvePartColor } from '../../src/lib/kit.js';
import { renderTeardownSvg } from '../../src/lib/teardown-bridge.js';

const body = document.body;
const slug = body.dataset.mechanism;
const moduleUrl = new URL(body.dataset.module || './mechanism.js', document.baseURI);
const mod = await import(moduleUrl.href);

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

/* --------------------------------------------------------------- dark mode */

const MOON_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
const SUN_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

const savedTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme-mode') : null)
  || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

const themeModeBtn = $('#theme-mode-btn');
function updateThemeToggle(isDark) {
  if (themeModeBtn) {
    themeModeBtn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
    themeModeBtn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeModeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}
if (themeModeBtn) {
  updateThemeToggle(document.documentElement.getAttribute('data-theme') === 'dark');
  themeModeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    if (typeof localStorage !== 'undefined') localStorage.setItem('theme-mode', next);
    updateThemeToggle(next === 'dark');
    if (viewer) {
      viewer.setViewState({ isDark: next === 'dark' });
      applyPose();
    }
    if (state.viewMode !== '3d') {
      renderStageOverlay();
    }
  });
}

/* ------------------------------------------------------------------ state */

const params = mod.params;
const values = Object.fromEntries(params.map((p) => [p.key, p.value]));
hydrateFromUrl();

const state = {
  t: mod.startAngle ?? (mod.meta.screenshot?.t ?? 0),
  playing: true,
  speed: 0.14,
  explode: 0,
  ghost: false,
  hideBase: false,
  patent: false,
  hatch: true,
  colorTheme: 'sky-gold',
  hardware: true,
  traceMotion: false,
  selected: null,
  stepIndex: -1,
  viewMode: '3d',         // '3d' | 'blueprint' | 'bed'
  bedMode: 'stl',         // 'stl' | 'laser'
  linework: 'technical',  // 'technical' | 'fine' | 'service'
};

/* ------------------------------------------------------------------- stage */

const viewport = $('#viewport');
const canvas = $('#stage-canvas');
const tooltip = $('#tooltip');
const blueprintView = $('#blueprint-view');
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
  viewer.setViewState({
    showHardware: true,
    isDark: document.documentElement.getAttribute('data-theme') === 'dark',
  });
} catch (err) {
  console.warn('3D stage unavailable, showing the isometric figure:', err);
  live3d = false;
  viewer = {
    setParts() {}, setViewState() {}, applyPose() {}, updateCamera() {}, setCameraPreset() {},
    renderOnce() {}, dispose() {}, zoom: 1, azimuth: -0.62, elevation: 0.78,
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

  const nonFrame = currentParts
    .filter((p) => p.role !== 'frame' && p.id !== 'frame')
    .slice()
    .sort((a, b) => (a.layer || 0) - (b.layer || 0) || (a.at?.z || 0) - (b.at?.z || 0));
  const rankMap = new Map(nonFrame.map((p, idx) => [p.id, idx + 1]));

  currentParts.forEach((p) => {
    p.role = p.role || (p.id === 'frame' ? 'frame' : 'part');
    p.explodeOrder = p.role === 'frame' ? 0 : (rankMap.get(p.id) || 1);
    p.explodeRank = p.explodeOrder;
  });

  viewer.setMotorMount?.(mod.meta.motorMount);
  viewer.setParts(currentParts);
  viewer.setViewState({
    selected: state.selected,
    showHardware: state.hardware,
    explode: state.explode,
    ghost: state.ghost,
    hideBase: state.hideBase,
    patent: state.patent,
    colorTheme: state.colorTheme,
    isDark: document.documentElement.getAttribute('data-theme') === 'dark',
  });
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
  if (state.viewMode !== '3d') renderStageOverlay();
}

function updateTraceBadge(tr) {
  const badge = $('#trace-badge');
  if (!badge) return;
  if (!state.traceMotion || !tr) {
    badge.classList.add('hidden');
    return;
  }
  badge.innerHTML = `<span class="dot"></span><b>TRACER:</b> ${tr.label} <small>— ${tr.desc}</small>`;
  badge.classList.remove('hidden');
}

function getKinematicTrace(m, vals, currentAngle) {
  if (typeof m.tracePoint === 'function') {
    const pts = [];
    for (let deg = 0; deg <= 360; deg += 4) {
      pts.push(m.tracePoint(vals, deg));
    }
    const cur = m.tracePoint(vals, currentAngle);
    return { pts, cur, label: 'Kinematic output point', desc: 'Continuous locus traced through one full cycle' };
  }

  const slug = m.meta?.slug;
  if (slug === 'four-bar') {
    const pts = [];
    const b = vals.coupler || 66;
    for (let deg = 0; deg <= 360; deg += 4) {
      const p = m.pose(vals, deg);
      const ca = p.coupler?.rot || 0;
      const mx = (p.coupler?.dx || 0) + (b / 2) * Math.cos(ca);
      const my = (p.coupler?.dy || 0) + (b / 2) * Math.sin(ca);
      pts.push({ x: mx, y: my, z: 23.8 });
    }
    const curP = m.pose(vals, currentAngle);
    const ca = curP.coupler?.rot || 0;
    const cur = {
      x: (curP.coupler?.dx || 0) + (b / 2) * Math.cos(ca),
      y: (curP.coupler?.dy || 0) + (b / 2) * Math.sin(ca),
      z: 24.2,
    };
    return {
      pts,
      cur,
      label: 'Coupler link midpoint',
      desc: 'Floating link coupler curve between crank and oscillating rocker',
    };
  }

  if (slug === 'crank-slider') {
    const pts = [];
    const r = (vals.stroke || 44) / 2;
    for (let deg = 0; deg <= 360; deg += 4) {
      const p = m.pose(vals, deg);
      const th = deg * (Math.PI / 180);
      const kx = r * Math.cos(th);
      const ky = r * Math.sin(th);
      const sx = (p.slider?.dx || 0) + (p.slider?.x || 0);
      pts.push({ x: (kx + sx) / 2, y: ky / 2, z: 23.8 });
    }
    const curP = m.pose(vals, currentAngle);
    const th = currentAngle * (Math.PI / 180);
    const kx = r * Math.cos(th);
    const ky = r * Math.sin(th);
    const sx = (curP.slider?.dx || 0) + (curP.slider?.x || 0);
    const cur = {
      x: (kx + sx) / 2,
      y: ky / 2,
      z: 24.2,
    };
    return {
      pts,
      cur,
      label: 'Connecting rod center',
      desc: 'Elliptical motion bridging rotation to pure linear oscillation',
    };
  }

  if (slug === 'scotch-yoke') {
    const pts = [];
    const r = (vals.stroke || 40) / 2;
    for (let deg = 0; deg <= 360; deg += 4) {
      const th = deg * (Math.PI / 180);
      pts.push({ x: r * Math.cos(th), y: r * Math.sin(th), z: 21.5 });
    }
    const th = currentAngle * (Math.PI / 180);
    const cur = { x: r * Math.cos(th), y: r * Math.sin(th), z: 22.0 };
    return {
      pts,
      cur,
      label: 'Crank drive pin',
      desc: 'Pure harmonic circular orbit directly converted into sinusoidal stroke',
    };
  }

  if (slug === 'servo-crank') {
    const pts = [];
    const r = vals.arm || 22;
    for (let deg = 0; deg <= 360; deg += 4) {
      const p = m.pose(vals, deg);
      const a = p.arm?.rot || 0;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), z: 32.5 });
    }
    const curP = m.pose(vals, currentAngle);
    const a = curP.arm?.rot || 0;
    const cur = { x: r * Math.cos(a), y: r * Math.sin(a), z: 33.0 };
    return {
      pts,
      cur,
      label: 'Servo horn drive pin',
      desc: 'Angular stroke arc driving the pushrod output link',
    };
  }

  if (slug === 'cam-follower') {
    const pts = [];
    for (let deg = 0; deg <= 360; deg += 4) {
      const p = m.pose(vals, deg);
      const dy = p.follower?.dy || 0;
      pts.push({ x: 0, y: 35 + dy, z: 22.5 });
    }
    const curP = m.pose(vals, currentAngle);
    const cur = { x: 0, y: 35 + (curP.follower?.dy || 0), z: 22.5 };
    return {
      pts,
      cur,
      label: 'Follower roller center',
      desc: 'Linear reciprocating stroke following the cam harmonic profile',
    };
  }

  if (slug === 'geneva-indexer') {
    const pts = [];
    for (let deg = 0; deg <= 360; deg += 4) {
      const p = m.pose(vals, deg);
      const a = p.driver?.rot || (deg * Math.PI / 180);
      const r = vals.crankR || 28;
      const dx = (p.driver?.dx || -35) + r * Math.cos(a);
      const dy = (p.driver?.dy || 0) + r * Math.sin(a);
      pts.push({ x: dx, y: dy, z: 24.5 });
    }
    const curP = m.pose(vals, currentAngle);
    const a = curP.driver?.rot || (currentAngle * Math.PI / 180);
    const r = vals.crankR || 28;
    const cur = {
      x: (curP.driver?.dx || -35) + r * Math.cos(a),
      y: (curP.driver?.dy || 0) + r * Math.sin(a),
      z: 24.5,
    };
    return {
      pts,
      cur,
      label: 'Drive wheel pin',
      desc: 'Continuous circular pin path entering, indexing and exiting the star slots',
    };
  }

  if (slug === 'ratchet-pawl') {
    const pts = [];
    for (let deg = 0; deg <= 360; deg += 4) {
      const p = m.pose(vals, deg);
      const tipX = (p.drivePawl?.dx || 0) + 14 * Math.cos(p.drivePawl?.rot || 0);
      const tipY = (p.drivePawl?.dy || 0) + 14 * Math.sin(p.drivePawl?.rot || 0);
      pts.push({ x: tipX, y: tipY, z: 23.5 });
    }
    const curP = m.pose(vals, currentAngle);
    const tipX = (curP.drivePawl?.dx || 0) + 14 * Math.cos(curP.drivePawl?.rot || 0);
    const tipY = (curP.drivePawl?.dy || 0) + 14 * Math.sin(curP.drivePawl?.rot || 0);
    const cur = { x: tipX, y: tipY, z: 23.5 };
    return {
      pts,
      cur,
      label: 'Drive pawl tip',
      desc: 'Hooking stroke indexing the ratchet wheel tooth by tooth',
    };
  }

  if (slug === 'gear-pair') {
    const d1 = (vals.driver || 18) * (vals.module || 2);
    const d2 = (vals.driven || 36) * (vals.module || 2);
    const pitchR1 = d1 / 2;
    const pitchR2 = d2 / 2;
    const centre = pitchR1 + pitchR2;
    const pitchPointX = -centre / 2 + pitchR1;
    const pts = [];
    for (let dy = -14; dy <= 14; dy += 2) {
      pts.push({ x: pitchPointX, y: dy, z: 12.0 });
    }
    const th = currentAngle * (Math.PI / 180);
    const cur = { x: pitchPointX, y: 6 * Math.sin(th * 3), z: 12.0 };
    return {
      pts,
      cur,
      label: 'Pitch line mesh contact',
      desc: 'Line of action passing through the pitch point at 20° pressure angle',
    };
  }

  return null;
}

function applyPose() {
  const currentPose = mod.pose(values, state.t);
  viewer.applyPose(currentPose);
  if (state.traceMotion) {
    const tr = getKinematicTrace(mod, values, state.t);
    if (tr && tr.cur) viewer.updateTraceCursor(tr.cur);
  }
  updateReadouts();
  if (state.viewMode === 'blueprint' && !state.playing) {
    renderStageOverlay();
  }
}

function setExplode(val) {
  state.explode = Math.max(0, Math.min(1, Number(val) || 0));
  const s1 = $('#explode');
  const s2 = $('#stage-explode');
  const expOut = $('#explode-out');
  const expBtn = $('#explode-btn');
  if (s1 && document.activeElement !== s1) s1.value = String(state.explode);
  if (s2 && document.activeElement !== s2) s2.value = String(state.explode);
  if (expOut) expOut.textContent = `${Math.round(state.explode * 100)}%`;
  if (expBtn) expBtn.setAttribute('aria-pressed', String(state.explode > 0.02));
  viewer.setViewState({ explode: state.explode });
  viewer.updateCamera?.();
  viewer.applyPose(mod.pose(values, state.t));
  if (state.viewMode === 'blueprint') renderStageOverlay();
}

/* --------------------------------------------------- Teardown & Bed Views */

function setViewMode(mode) {
  state.viewMode = mode;
  const m3d = $('#mode-3d');
  const mBp = $('#mode-blueprint');
  const mBed = $('#mode-bed');
  if (m3d) m3d.setAttribute('aria-pressed', String(mode === '3d'));
  if (mBp) mBp.setAttribute('aria-pressed', String(mode === 'blueprint'));
  if (mBed) mBed.setAttribute('aria-pressed', String(mode === 'bed'));

  if (!blueprintView) return;
  if (mode === '3d') {
    blueprintView.classList.add('hidden');
  } else {
    if (mode === 'blueprint' && state.playing) {
      state.playing = false;
      syncPlayButton();
    }
    blueprintView.classList.remove('hidden');
    renderStageOverlay();
  }
}

function renderStageOverlay() {
  if (!blueprintView || state.viewMode === '3d') return;
  blueprintView.innerHTML = '';

  if (state.viewMode === 'blueprint') {
    const pose = mod.pose(values, state.t);
    const visibleParts = (state.hideBase
      ? currentParts.filter((p) => p.role !== 'frame' && p.id !== 'frame')
      : currentParts
    ).map((p) => ({ ...p, color: resolvePartColor(p, state.colorTheme) }));

    const DEG = Math.PI / 180;
    const azRad = viewer.azimuth ?? -0.62;
    const elRad = viewer.elevation ?? 0.78;
    const azDeg = (azRad / DEG) - 90;
    const elDeg = Math.max(-55, Math.min(55, (elRad / DEG) * 0.62));
    const isPatent = state.patent || state.colorTheme === 'patent';
    const isHatch = !isPatent && (state.hatch || state.colorTheme === 'hatches');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const fig = renderTeardownSvg(visibleParts, pose, {
      camera: { azimuth: azDeg, elevation: elDeg, roll: 0 },
      explosion: state.explode * 0.85,
      fitExplosion: Math.max(state.explode * 0.85, 0.25),
      isolated: state.selected || null,
      hardware: state.hardware,
      preset: state.linework,
      fill: isHatch ? 'hatch' : !isPatent,
      hatch: isHatch,
      background: null,
      ink: isDark ? '#dcd6c8' : '#1e1c19',
    });
    const toolbar = el('div', { class: 'bp-bar' },
      el('span', { class: 'bp-title' }, isHatch ? 'HATCHED TECHNICAL PROJECTION' : (isPatent ? 'PATENT INK LINEWORK · PURE HLR WIREFRAME' : 'TEARDOWN HLR PROJECTION · ISO 128 LINEWORK')),
      el('div', { class: 'bp-actions' },
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          'aria-pressed': String(isHatch),
          onclick: () => {
            state.hatch = true;
            state.patent = false;
            renderStageOverlay();
          },
        }, 'Hatched'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          'aria-pressed': String(isPatent),
          onclick: () => {
            state.patent = true;
            state.hatch = false;
            renderStageOverlay();
          },
        }, 'Patent line'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          'aria-pressed': String(!isHatch && !isPatent),
          onclick: () => {
            state.hatch = false;
            state.patent = false;
            renderStageOverlay();
          },
        }, 'Color shaded'),
        el('span', { style: 'border-left: 1px solid var(--line); margin: 0 4px; height: 16px;' }),
        ...['technical', 'fine', 'service'].map((lw) =>
          el('button', {
            type: 'button',
            class: 'chip small-chip',
            'aria-pressed': String(state.linework === lw),
            onclick: () => { state.linework = lw; renderStageOverlay(); },
          }, lw)),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          'aria-pressed': String(state.hideBase),
          onclick: () => {
            state.hideBase = !state.hideBase;
            const hb = $('#hide-base-btn');
            if (hb) hb.setAttribute('aria-pressed', String(state.hideBase));
            viewer.setViewState({ hideBase: state.hideBase });
            viewer.applyPose(mod.pose(values, state.t));
            renderStageOverlay();
          },
        }, 'Hide base'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          onclick: () => downloadBlueprintSvg(),
        }, 'Download .svg'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          style: 'color: var(--accent); font-weight: 600;',
          onclick: () => setViewMode('3d'),
        }, '✕ Return to 3D Stage'),
      ),
    );
    const wrap = el('div', { class: 'bp-svg-wrap', html: fig.svg });
    blueprintView.append(toolbar, wrap);
    return;
  }

  if (state.viewMode === 'bed') {
    const bedSvg = buildPrintBedSvg();
    const isLaser = state.bedMode === 'laser';
    const toolbar = el('div', { class: 'bp-bar' },
      el('span', { class: 'bp-title' }, isLaser
        ? '1:1 MM LASER-CUT SHEET (220×220 MM) · RED = THROUGH-CUT · BLUE = VECTOR ETCH'
        : '220 × 220 MM 3D PRINT BED AUTO-LAYOUT · FLAT ZERO-SUPPORT ORIENTATION'),
      el('div', { class: 'bp-actions' },
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          'aria-pressed': String(!isLaser),
          onclick: () => { state.bedMode = 'stl'; renderStageOverlay(); },
        }, '3D Print Bed (STL)'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          'aria-pressed': String(isLaser),
          onclick: () => { state.bedMode = 'laser'; renderStageOverlay(); },
        }, 'Laser-Cut Sheet (SVG)'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          onclick: downloadAllPartsStl,
        }, 'Download All (.stl)'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          onclick: downloadLaserCutSvg,
        }, 'Download Laser (.svg)'),
        el('button', {
          type: 'button',
          class: 'chip small-chip',
          onclick: downloadPack,
        }, 'Pack (.zip)'),
      ),
    );
    const wrap = el('div', { class: 'bp-svg-wrap', html: bedSvg });
    blueprintView.append(toolbar, wrap);
  }
}

function getBedPlacements() {
  return layoutPartsOnBed(currentParts, stats, {
    bedW: 220,
    bedD: 220,
    margin: 8,
    gap: 5.5,
    expandQty: true,
  });
}

function buildPrintBedSvg() {
  const bedLayout = getBedPlacements();
  const { bedW: BED, placements } = bedLayout;
  const isLaser = state.bedMode === 'laser';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const gridStroke = isDark ? '#332e26' : '#dfd6c5';
  const gridLines = [];
  for (let g = 20; g < BED; g += 20) {
    gridLines.push(`<line x1="${g}" y1="0" x2="${g}" y2="${BED}" stroke="${gridStroke}" stroke-width="0.4"/>`);
    gridLines.push(`<line x1="0" y1="${g}" x2="${BED}" y2="${g}" stroke="${gridStroke}" stroke-width="0.4"/>`);
  }

  const partNodes = placements.map((pl, idx) => {
    const { part, s, x, y, w, h, dx, dy, copyIndex, qty } = pl;
    const { cutPaths, holePaths, etchPaths } = extractPart2DPaths(part, dx, dy);
    const cx = (x + w / 2).toFixed(1);
    const cy = (y + h / 2).toFixed(1);
    const themedColor = resolvePartColor(part, state.colorTheme);

    if (isLaser) {
      const cutD = [...cutPaths, ...holePaths].filter(Boolean).join(' ');
      const etchD = etchPaths.filter(Boolean).join(' ');
      return `<g class="bed-part">
        ${cutD ? `<path d="${cutD}" fill="#e01b24" fill-opacity="${isDark ? '0.12' : '0.06'}" fill-rule="evenodd" stroke="#e01b24" stroke-width="0.7"/>` : ''}
        ${etchD ? `<path d="${etchD}" fill="none" stroke="${isDark ? '#5c9ce6' : '#1c71d8'}" stroke-width="0.55" stroke-dasharray="1.6 1.0"/>` : ''}
        <text x="${cx}" y="${cy}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="3.8" font-weight="600" fill="${isDark ? '#5bb87d' : '#2b7a4b'}">${part.name}${qty > 1 ? ` #${copyIndex}` : ''}</text>
      </g>`;
    }

    const partStroke = isDark ? '#ded8cc' : '#23201c';
    const textFill = isDark ? '#ded8cc' : '#23201c';
    const subTextFill = isDark ? '#9e968a' : '#5b5349';

    const outerD = [...cutPaths, ...holePaths].filter(Boolean).join(' ');
    const bossD = etchPaths.filter(Boolean).join(' ');
    return `<g class="bed-part">
      ${outerD
        ? `<path d="${outerD}" fill="${themedColor}" fill-opacity="${isDark ? '0.72' : '0.55'}" fill-rule="evenodd" stroke="${partStroke}" stroke-width="0.75"/>`
        : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${themedColor}" fill-opacity="${isDark ? '0.62' : '0.45'}" stroke="${partStroke}" stroke-width="0.75"/>`}
      ${bossD ? `<path d="${bossD}" fill="none" stroke="${partStroke}" stroke-width="0.5" stroke-opacity="0.65" stroke-dasharray="1.4 0.9"/>` : ''}
      <text x="${cx}" y="${(Number(cy) - 1.5).toFixed(1)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="4.2" font-weight="600" fill="${textFill}">${idx + 1}. ${part.name}${qty > 1 ? ` #${copyIndex}` : ''}</text>
      <text x="${cx}" y="${(Number(cy) + 3.5).toFixed(1)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="3.4" fill="${subTextFill}">${s.size[0].toFixed(0)}×${s.size[1].toFixed(0)}×${s.size[2].toFixed(1)}mm</text>
    </g>`;
  });

  const footerText = isLaser
    ? `220 × 220 MM LASER-CUT SHEET (1:1 MM) · RED = THROUGH-CUT · BLUE DASHED = SCORE / MULTI-TIER BOSS`
    : `220 × 220 MM 3D PRINT BED (${placements.length} PART INSTANCES NESTED FLAT AT Z = 0 MM)`;

  const bedBg = isDark ? '#23201d' : '#faf6ee';
  const bedBorder = isDark ? '#454037' : '#23201c';
  const footerColor = isDark ? '#9e968a' : '#6b6257';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 240 242" width="540" height="540">
    <rect x="0" y="0" width="${BED}" height="${BED}" rx="5" fill="${bedBg}" stroke="${bedBorder}" stroke-width="1.1"/>
    ${gridLines.join('')}
    ${partNodes.join('')}
    <text x="${BED / 2}" y="${BED + 8.5}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="4.8" fill="${footerColor}">${footerText}</text>
  </svg>`;
}

function downloadBlueprintSvg() {
  const pose = mod.pose(values, state.t);
  const DEG = Math.PI / 180;
  const azDeg = ((viewer.azimuth ?? -0.62) / DEG) - 90;
  const elDeg = Math.max(-55, Math.min(55, ((viewer.elevation ?? 0.78) / DEG) * 0.62));
  const isPatent = state.patent || state.colorTheme === 'patent';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const themedParts = currentParts.map((p) => ({ ...p, color: resolvePartColor(p, state.colorTheme) }));
  const fig = renderTeardownSvg(themedParts, pose, {
    camera: { azimuth: azDeg, elevation: elDeg, roll: 0 },
    explosion: state.explode * 0.85,
    fitExplosion: Math.max(state.explode * 0.85, 0.25),
    hardware: state.hardware,
    preset: state.linework,
    fill: !isPatent,
    background: isDark ? '#1b1917' : '#f6f1e7',
    ink: isDark ? '#dcd6c8' : '#1e1c19',
    title: `${mod.meta.title} — Teardown technical blueprint`,
  });
  download(fig.svg, `${slug}-teardown-blueprint.svg`, 'image/svg+xml');
}

function downloadLaserCutSvg() {
  const bedLayout = getBedPlacements();
  const svgText = buildLaserCutSvg(bedLayout, {
    slug,
    title: mod.meta.title,
    showGrid: false,
    showLabels: true,
  });
  download(svgText, `${slug}-laser-cut-bed.svg`, 'image/svg+xml');
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
  renderPhysicsPanel();
}

/* ------------------------------------------- Motor Physics & Signals Scope */

function renderPhysicsPanel() {
  const card = $('#physics-card');
  const bodyEl = $('#physics-body');
  if (!card || !bodyEl) return;

  if (slug !== 'dc-motor' && slug !== 'stepper-motor' && slug !== 'servo-motor' && slug !== 'gear-motor') {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const deg = ((state.t % 360) + 360) % 360;
  const rad = (deg * Math.PI) / 180;

  if (slug === 'dc-motor') {
    const pwm = Number(values.pwm ?? 75);
    const load = Number(values.load ?? 20);
    const poles = Number(values.poles ?? 3);
    const vSupply = 6.0;
    const vAvg = vSupply * (pwm / 100);
    const speedFactor = Math.max(0.08, (pwm / 100) * (1 - (load / 100) * 0.72));
    const rpm = Math.round(6000 * speedFactor);
    const vBemf = vSupply * speedFactor * 0.8;
    const iMa = Math.round(((vAvg - vBemf) / 2.2) * 1000);
    const rotDeg = (deg * Math.max(0.35, speedFactor * 1.35)) % 360;
    const rotRad = (rotDeg * Math.PI) / 180;
    const activeSeg = (Math.floor(((rotDeg + 30) % 360) / (360 / poles)) % poles) + 1;

    // Build rotor pole arms & Lorentz force vectors
    let poleSvg = '';
    for (let k = 0; k < poles; k++) {
      const a = rotRad + (k * 2 * Math.PI) / poles;
      const px = 110 + 42 * Math.cos(a);
      const py = 95 - 42 * Math.sin(a);
      // Commutation flips current sign as each coil crosses the vertical neutral axis (x = 110)
      const isRightHalf = Math.cos(a) >= 0;
      const sym = isRightHalf ? '⊗' : '⊙';
      const col = isRightHalf ? '#c2571f' : '#2f6999';
      // Tangential Lorentz force vector F = I L x B (always CCW torque!)
      const tx = -Math.sin(a) * 22;
      const ty = -Math.cos(a) * 22;
      poleSvg += `
        <line x1="110" y1="95" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#b08b4a" stroke-width="6" stroke-linecap="round"/>
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="10" fill="#fbf8f2" stroke="${col}" stroke-width="2"/>
        <text x="${px.toFixed(1)}" y="${(py + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${col}">${sym}</text>
        <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${(px + tx).toFixed(1)}" y2="${(py + ty).toFixed(1)}" stroke="#2b7a4b" stroke-width="2.2" marker-end="url(#arr-f)"/>
      `;
    }

    // Build PWM square wave & ripple current trace
    const dutyW = (pwm / 100) * 56;
    let pwmPath = '';
    for (let c = 0; c < 4; c++) {
      const x0 = 42 + c * 56;
      const xOn = x0 + dutyW;
      const xEnd = x0 + 56;
      pwmPath += `M${x0},78 L${x0},32 L${xOn.toFixed(1)},32 L${xOn.toFixed(1)},78 L${xEnd},78 `;
    }
    const bemfY = 78 - (vBemf / 6.0) * 46;
    let curPath = 'M 42 ';
    for (let x = 0; x <= 224; x += 4) {
      const ph = ((x / 224) * 360 + rotDeg) * (Math.PI / 180);
      const ripple = Math.abs(Math.sin(poles * ph)) * 8;
      const cy = 148 - Math.min(42, (iMa / 1500) * 34 + ripple * (pwm / 100));
      curPath += `${x === 0 ? '' : 'L '}${42 + x} ${cy.toFixed(1)} `;
    }
    const cursorX = 42 + ((rotDeg / 360) * 224);

    bodyEl.innerHTML = `
      <div class="physics-grid">
        <div class="physics-pane">
          <div class="physics-sub">1. Magnetic Flux <b>B</b>, Commutation &amp; Lorentz Force <b>F = I·L × B</b></div>
          <svg viewBox="0 0 220 190" class="physics-svg">
            <defs>
              <marker id="arr-b" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,1 L7,4 L0,7 Z" fill="#8c8070"/>
              </marker>
              <marker id="arr-f" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,1 L7,4 L0,7 Z" fill="#2b7a4b"/>
              </marker>
            </defs>
            <!-- Uniform magnetic field lines B from N (left) to S (right) -->
            <line x1="36" y1="55" x2="184" y2="55" stroke="#b8afa0" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#arr-b)"/>
            <line x1="36" y1="95" x2="184" y2="95" stroke="#b8afa0" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#arr-b)"/>
            <line x1="36" y1="135" x2="184" y2="135" stroke="#b8afa0" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#arr-b)"/>
            <text x="110" y="48" text-anchor="middle" font-size="9.5" fill="#786f63" font-family="monospace">MAGNETIC FIELD B (N → S)</text>
            <!-- Neutral commutation axis -->
            <line x1="110" y1="22" x2="110" y2="168" stroke="#c2571f" stroke-width="1" stroke-dasharray="2 3"/>
            <text x="110" y="182" text-anchor="middle" font-size="9" fill="#c2571f" font-family="monospace">NEUTRAL PLANE (CURRENT FLIPS)</text>
            <!-- Stator N and S poles -->
            <path d="M14,42 L38,42 A58,58 0 0,0 38,148 L14,148 Z" fill="#c84b31" opacity="0.88"/>
            <text x="24" y="99" text-anchor="middle" fill="#fff" font-weight="700" font-size="13">N</text>
            <path d="M206,42 L182,42 A58,58 0 0,1 182,148 L206,148 Z" fill="#2f6999" opacity="0.88"/>
            <text x="196" y="99" text-anchor="middle" fill="#fff" font-weight="700" font-size="13">S</text>
            <!-- Rotating armature poles + Lorentz torque vectors -->
            ${poleSvg}
            <!-- Central split-ring commutator & carbon brushes -->
            <circle cx="110" cy="95" r="15" fill="#d97b38" stroke="#221f1b" stroke-width="1.4" stroke-dasharray="24 5"/>
            <rect x="86" y="89" width="9" height="12" rx="2" fill="#221f1b"/>
            <rect x="125" y="89" width="9" height="12" rx="2" fill="#221f1b"/>
            <text x="77" y="98" text-anchor="end" font-size="9.5" font-weight="700" fill="#c2571f" font-family="monospace">+V</text>
            <text x="143" y="98" text-anchor="start" font-size="9.5" font-weight="700" fill="#2f6999" font-family="monospace">GND</text>
          </svg>
          <p class="physics-caption">
            <b>Why it spins continuously:</b> Coils on the left (<b>⊙</b> current out) and right (<b>⊗</b> current in) experience upward/downward <b>Lorentz forces F = I·L × B</b> (green arrows) that sum to a one-way torque. Crossing the vertical neutral line swaps brush contact on segment <b>#${activeSeg}/${poles}</b>.
          </p>
        </div>
        <div class="physics-pane">
          <div class="physics-sub">2. Live PWM Duty (${pwm}%), Back-EMF (${vBemf.toFixed(2)} V) &amp; Current (${iMa} mA)</div>
          <svg viewBox="0 0 280 190" class="physics-svg">
            <!-- Grid boxes -->
            <rect x="42" y="24" width="224" height="60" fill="#f5efe4" stroke="#d4cab8"/>
            <rect x="42" y="102" width="224" height="58" fill="#f5efe4" stroke="#d4cab8"/>
            <text x="36" y="36" text-anchor="end" font-size="9" font-family="monospace" fill="#48423a">6V</text>
            <text x="36" y="80" text-anchor="end" font-size="9" font-family="monospace" fill="#48423a">0V</text>
            <text x="48" y="20" font-size="9.5" font-family="monospace" fill="#c2571f" font-weight="600">V_PWM (orange) vs Back-EMF V_e = k·ω (blue dashed)</text>
            <!-- PWM waveform -->
            <path d="${pwmPath}" fill="none" stroke="#c2571f" stroke-width="2"/>
            <!-- Back-EMF horizontal line -->
            <line x1="42" y1="${bemfY.toFixed(1)}" x2="266" y2="${bemfY.toFixed(1)}" stroke="#2f6999" stroke-width="2" stroke-dasharray="5 3"/>
            <text x="262" y="${(bemfY - 4).toFixed(1)}" text-anchor="end" font-size="9" font-family="monospace" fill="#2f6999">V_bemf = ${vBemf.toFixed(2)}V</text>
            <!-- Current trace -->
            <text x="48" y="98" font-size="9.5" font-family="monospace" fill="#2b7a4b" font-weight="600">Armature Current I_a = (V_avg − V_bemf) / R_a (${iMa} mA)</text>
            <text x="36" y="114" text-anchor="end" font-size="9" font-family="monospace" fill="#48423a">1.5A</text>
            <text x="36" y="156" text-anchor="end" font-size="9" font-family="monospace" fill="#48423a">0A</text>
            <path d="${curPath}" fill="none" stroke="#2b7a4b" stroke-width="2"/>
            <!-- Live rotor phase cursor -->
            <line x1="${cursorX.toFixed(1)}" y1="24" x2="${cursorX.toFixed(1)}" y2="160" stroke="#221f1b" stroke-width="1.2" stroke-dasharray="2 2"/>
            <text x="154" y="178" text-anchor="middle" font-size="9.5" font-family="monospace" fill="#48423a">Speed: ${rpm} RPM · V_avg: ${vAvg.toFixed(2)} V · Net V_coil: ${(vAvg - vBemf).toFixed(2)} V</text>
          </svg>
          <p class="physics-caption">
            <b>Speed &amp; load physics:</b> Spinning the coils through <b>B</b> induces a reverse voltage <b>V<sub>bemf</sub> = k<sub>e</sub>·ω</b>. Increasing mechanical load slows the rotor, dropping <b>V<sub>bemf</sub></b> so more current <b>I<sub>a</sub></b> flows automatically to supply the needed torque.
          </p>
        </div>
      </div>
    `;
    return;
  }

  if (slug === 'stepper-motor') {
    const teeth = Number(values.teeth ?? 8);
    const mode = values.mode || 'full';
    const currentPct = Number(values.current ?? 80);
    const fullStepDeg = 90 / teeth;
    const resDeg = mode === 'half' ? fullStepDeg / 2 : fullStepDeg;
    const rawDeg = deg * (fullStepDeg / 45);
    const snappedDeg = Math.round(rawDeg / resDeg) * resDeg;
    const stepIdx = Math.abs(Math.round(rawDeg / resDeg));

    // Determine active phases A (0°), B (90°), C (180°), D (270°)
    let activePhases = [1, 0, 0, 0];
    let fieldAngleDeg = 0;
    if (mode === 'wave') {
      const s = stepIdx % 4;
      activePhases = [s === 0 ? 1 : 0, s === 1 ? 1 : 0, s === 2 ? 1 : 0, s === 3 ? 1 : 0];
      fieldAngleDeg = s * 90;
    } else if (mode === 'full') {
      const s = stepIdx % 4;
      activePhases = [
        s === 0 || s === 3 ? 1 : 0,
        s === 0 || s === 1 ? 1 : 0,
        s === 1 || s === 2 ? 1 : 0,
        s === 2 || s === 3 ? 1 : 0,
      ];
      fieldAngleDeg = s * 90 + 45;
    } else {
      const s = stepIdx % 8;
      const table = [
        [1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0],
        [0, 0, 1, 0], [0, 0, 1, 1], [0, 0, 0, 1], [1, 0, 0, 1],
      ];
      activePhases = table[s];
      fieldAngleDeg = s * 45;
    }

    const fRad = (fieldAngleDeg * Math.PI) / 180;
    const bx = 110 + 48 * Math.cos(fRad);
    const by = 95 - 48 * Math.sin(fRad);

    // Build 4 stator coil visuals at 0, 90, 180, 270 deg
    const coilCoords = [
      { name: 'A (0°)', x: 174, y: 95, on: activePhases[0] },
      { name: 'B (90°)', x: 110, y: 31, on: activePhases[1] },
      { name: 'A′ (180°)', x: 46, y: 95, on: activePhases[2] },
      { name: 'B′ (270°)', x: 110, y: 159, on: activePhases[3] },
    ];
    const coilsSvg = coilCoords.map((c) => `
      <circle cx="${c.x}" cy="${c.y}" r="16" fill="${c.on ? '#c2571f' : '#e5ddd0'}" stroke="#221f1b" stroke-width="1.5"/>
      <text x="${c.x}" y="${c.y + 3.5}" text-anchor="middle" font-size="9.5" font-family="monospace" font-weight="700" fill="${c.on ? '#fff' : '#48423a'}">${c.name.split(' ')[0]}</text>
    `).join('');

    // Build rotor teeth SVG
    let teethSvg = '';
    for (let k = 0; k < teeth; k++) {
      const a = (snappedDeg * Math.PI) / 180 + (k * 2 * Math.PI) / teeth;
      const x1 = 110 + 22 * Math.cos(a), y1 = 95 - 22 * Math.sin(a);
      const x2 = 110 + 35 * Math.cos(a), y2 = 95 - 35 * Math.sin(a);
      teethSvg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#b08b4a" stroke-width="6" stroke-linecap="butt"/>`;
    }

    // Build 4-channel digital pulse timing waveforms across 8 steps
    const chanNames = ['INA (0°)', 'INB (90°)', 'INC (180°)', 'IND (270°)'];
    let waveSvg = '';
    for (let ch = 0; ch < 4; ch++) {
      const yBase = 42 + ch * 32;
      let dPath = `M 54 ${yBase}`;
      for (let st = 0; st < 8; st++) {
        let on = 0;
        if (mode === 'wave') on = (st % 4) === ch ? 1 : 0;
        else if (mode === 'full') {
          const s4 = st % 4;
          on = ((s4 === ch) || (s4 === (ch + 3) % 4)) ? 1 : 0;
        } else {
          const tbl = [
            [1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0],
            [0, 0, 1, 0], [0, 0, 1, 1], [0, 0, 0, 1], [1, 0, 0, 1],
          ];
          on = tbl[st][ch];
        }
        const x0 = 54 + st * 26;
        const x1 = x0 + 26;
        const yLevel = on ? yBase - 16 : yBase;
        dPath += ` L ${x0} ${yLevel} L ${x1} ${yLevel}`;
      }
      waveSvg += `
        <text x="48" y="${yBase - 4}" text-anchor="end" font-size="9" font-family="monospace" font-weight="600" fill="${activePhases[ch] ? '#c2571f' : '#48423a'}">${chanNames[ch].split(' ')[0]}</text>
        <path d="${dPath}" fill="none" stroke="${activePhases[ch] ? '#c2571f' : '#6e7882'}" stroke-width="2"/>
      `;
    }
    const activeCol = (stepIdx % 8);
    const cursorX = 54 + activeCol * 26 + 13;

    bodyEl.innerHTML = `
      <div class="physics-grid">
        <div class="physics-pane">
          <div class="physics-sub">1. Discrete Stator Field Vector <b>B<sub>net</sub></b> (${fieldAngleDeg}°) &amp; Reluctance Alignment</div>
          <svg viewBox="0 0 220 190" class="physics-svg">
            <defs>
              <marker id="arr-step" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,1 L7,4 L0,7 Z" fill="#c2571f"/>
              </marker>
            </defs>
            <circle cx="110" cy="95" r="64" fill="none" stroke="#d4cab8" stroke-width="1.2" stroke-dasharray="3 3"/>
            ${teethSvg}
            <circle cx="110" cy="95" r="24" fill="#b08b4a" stroke="#221f1b" stroke-width="1.5"/>
            ${coilsSvg}
            <!-- Net magnetic field vector B_net -->
            <line x1="110" y1="95" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#c2571f" stroke-width="3" marker-end="url(#arr-step)"/>
            <circle cx="110" cy="95" r="4" fill="#221f1b"/>
            <text x="110" y="185" text-anchor="middle" font-size="9.5" font-family="monospace" fill="#48423a">Rotor θ = ${snappedDeg.toFixed(2)}° · Step Δθ = ${resDeg.toFixed(2)}°</text>
          </svg>
          <p class="physics-caption">
            <b>Minimum reluctance physics:</b> Energizing stator coils creates a discrete magnetic vector <b>B<sub>net</sub></b> (orange arrow at <b>${fieldAngleDeg}°</b>). The iron rotor teeth experience a restoring torque <b>τ = τ<sub>hold</sub>·sin(N<sub>r</sub>·δ)</b> that snaps the nearest tooth into alignment.
          </p>
        </div>
        <div class="physics-pane">
          <div class="physics-sub">2. Live 4-Phase Driver Sequence (${mode.toUpperCase()} mode · Step #${(stepIdx % 8) + 1}/8)</div>
          <svg viewBox="0 0 280 190" class="physics-svg">
            <rect x="54" y="18" width="208" height="132" fill="#f5efe4" stroke="#d4cab8"/>
            <!-- Highlight active step column -->
            <rect x="${54 + activeCol * 26}" y="18" width="26" height="132" fill="#f2dcd0" opacity="0.65"/>
            ${waveSvg}
            <line x1="${cursorX}" y1="18" x2="${cursorX}" y2="150" stroke="#c2571f" stroke-width="1.5" stroke-dasharray="2 2"/>
            <text x="158" y="168" text-anchor="middle" font-size="9.5" font-family="monospace" fill="#48423a">Active Coils: [${activePhases.map((v, i) => (v ? ['A', 'B', 'C', 'D'][i] : '·')).join(' ')}] · Coil I = ${currentPct}%</text>
          </svg>
          <p class="physics-caption">
            <b>Stepping modes:</b> <b>Wave</b> energizes 1 coil at a time; <b>Full-step</b> energizes 2 adjacent coils for <b>1.41×</b> torque; <b>Half-step</b> alternates 1 and 2 coils to double angular resolution to <b>${(fullStepDeg / 2).toFixed(2)}°</b>.
          </p>
        </div>
      </div>
    `;
    return;
  }

  if (slug === 'servo-motor') {
    const targetAngle = Number(values.target ?? 45);
    const ratio = Number(values.ratio ?? 60);
    const pulseUs = Math.round(1500 + (targetAngle / 90) * 500);
    const u = ((state.t % 360) + 360) % 360;
    const s = u < 220 ? Math.min(1, u / 160) : 1 - Math.min(1, (u - 220) / 120);
    const ease = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
    const currentDeg = targetAngle * ease;
    const errDeg = targetAngle - currentDeg;
    const vCmd = 2.5 + (targetAngle / 90) * 2.0;
    const vPot = 2.5 + (currentDeg / 90) * 2.0;
    const motorDuty = Math.min(100, Math.round(Math.abs(errDeg) * 3.2));

    // Pulse width in the 20 ms frame (mapped to 220 px width, with zoomed 0..3 ms inset)
    const pulsePx = 30 + ((pulseUs - 1000) / 1000) * 60; // 30..90 px
    const targetRad = (targetAngle * Math.PI) / 180;
    const curRad = (currentDeg * Math.PI) / 180;
    const tx = 110 + 54 * Math.sin(targetRad), ty = 115 - 54 * Math.cos(targetRad);
    const cx = 110 + 54 * Math.sin(curRad), cy = 115 - 54 * Math.cos(curRad);

    bodyEl.innerHTML = `
      <div class="physics-grid">
        <div class="physics-pane">
          <div class="physics-sub">1. Closed-Loop Negative Feedback &amp; Error Comparator <b>e(t) = θ<sub>cmd</sub> − θ<sub>actual</sub></b></div>
          <svg viewBox="0 0 220 190" class="physics-svg">
            <!-- Protractor arc -->
            <path d="M 46 115 A 64 64 0 0 1 174 115" fill="none" stroke="#d4cab8" stroke-width="1.5" stroke-dasharray="3 3"/>
            <text x="42" y="128" font-size="8.5" font-family="monospace" fill="#786f63">-90° (1.0ms)</text>
            <text x="110" y="42" text-anchor="middle" font-size="8.5" font-family="monospace" fill="#786f63">0° (1.5ms)</text>
            <text x="178" y="128" text-anchor="end" font-size="8.5" font-family="monospace" fill="#786f63">+90° (2.0ms)</text>
            <!-- Target setpoint vector (dashed orange) -->
            <line x1="110" y1="115" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#c2571f" stroke-width="2.2" stroke-dasharray="4 3"/>
            <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="4.5" fill="#c2571f"/>
            <!-- Actual shaft vector (solid blue) -->
            <line x1="110" y1="115" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#2f6999" stroke-width="3.5" stroke-linecap="round"/>
            <circle cx="110" cy="115" r="7" fill="#b08b4a" stroke="#221f1b" stroke-width="1.5"/>
            <!-- Potentiometer & Error readout -->
            <rect x="18" y="142" width="184" height="36" rx="5" fill="#f5efe4" stroke="#d4cab8"/>
            <text x="110" y="156" text-anchor="middle" font-size="9.2" font-family="monospace" fill="#221f1b">V_cmd: ${vCmd.toFixed(2)}V vs V_pot: ${vPot.toFixed(2)}V → Error: ${errDeg >= 0 ? '+' : ''}${errDeg.toFixed(1)}°</text>
            <text x="110" y="170" text-anchor="middle" font-size="9.2" font-family="monospace" fill="${motorDuty > 3 ? '#c2571f' : '#2b7a4b'}" font-weight="700">H-Bridge Drive: ${motorDuty > 3 ? `${motorDuty}% PWM (${errDeg > 0 ? 'CW' : 'CCW'})` : '0% (LOCKED AT SETPOINT)'}</text>
          </svg>
          <p class="physics-caption">
            <b>Proportional control loop:</b> The potentiometer coupled to the output spline converts shaft angle into voltage <b>V<sub>pot</sub></b>. The comparator drives the internal DC motor proportional to <b>e = V<sub>cmd</sub> − V<sub>pot</sub></b> until error reaches zero.
          </p>
        </div>
        <div class="physics-pane">
          <div class="physics-sub">2. 50 Hz Control Pulse (${pulseUs} µs) &amp; ${ratio}:1 Torque Multiplication</div>
          <svg viewBox="0 0 280 190" class="physics-svg">
            <rect x="38" y="24" width="228" height="62" fill="#f5efe4" stroke="#d4cab8"/>
            <text x="44" y="19" font-size="9.5" font-family="monospace" fill="#c2571f" font-weight="600">50 Hz Servo PWM Signal (20,000 µs period · T_on = ${pulseUs} µs)</text>
            <text x="32" y="38" text-anchor="end" font-size="9" font-family="monospace" fill="#48423a">5V</text>
            <text x="32" y="80" text-anchor="end" font-size="9" font-family="monospace" fill="#48423a">0V</text>
            <!-- 1.0ms to 2.0ms window guide -->
            <rect x="68" y="24" width="60" height="62" fill="#f2dcd0" opacity="0.5"/>
            <!-- Pulse waveform -->
            <path d="M 38 78 L 38 34 L ${(38 + pulsePx).toFixed(1)} 34 L ${(38 + pulsePx).toFixed(1)} 78 L 266 78" fill="none" stroke="#c2571f" stroke-width="2.4"/>
            <text x="${(38 + pulsePx / 2).toFixed(1)}" y="60" text-anchor="middle" font-size="9.5" font-family="monospace" font-weight="700" fill="#c2571f">${(pulseUs / 1000).toFixed(2)} ms</text>
            <!-- Compound Gear Torque Multiplication cascade -->
            <text x="44" y="106" font-size="9.5" font-family="monospace" fill="#2f6999" font-weight="600">Compound Gear Train Torque Cascade (τ_out = ${ratio} × τ_motor)</text>
            <rect x="38" y="114" width="46" height="28" rx="4" fill="#cf5a28" opacity="0.9"/>
            <text x="61" y="131" text-anchor="middle" font-size="9" font-family="monospace" fill="#fff" font-weight="700">Motor 1×</text>
            <text x="92" y="131" text-anchor="middle" font-size="11" fill="#786f63">→</text>
            <rect x="100" y="114" width="52" height="28" rx="4" fill="#b08b4a" opacity="0.9"/>
            <text x="126" y="131" text-anchor="middle" font-size="9" font-family="monospace" fill="#fff" font-weight="700">Stage1 4.5×</text>
            <text x="160" y="131" text-anchor="middle" font-size="11" fill="#786f63">→</text>
            <rect x="168" y="114" width="44" height="28" rx="4" fill="#2f7a54" opacity="0.9"/>
            <text x="190" y="131" text-anchor="middle" font-size="9" font-family="monospace" fill="#fff" font-weight="700">Stage2 19×</text>
            <text x="219" y="131" text-anchor="middle" font-size="11" fill="#786f63">→</text>
            <rect x="226" y="114" width="40" height="28" rx="4" fill="#39699c" opacity="0.95"/>
            <text x="246" y="131" text-anchor="middle" font-size="9" font-family="monospace" fill="#fff" font-weight="700">Out ${ratio}×</text>
            <text x="152" y="164" text-anchor="middle" font-size="9.2" font-family="monospace" fill="#48423a">Target: ${targetAngle}° · Actual: ${currentDeg.toFixed(1)}° · Holding Torque: ${(ratio * 0.03).toFixed(1)} kg·cm</text>
          </svg>
          <p class="physics-caption">
            <b>Why servos pack huge torque in a tiny case:</b> A tiny high-speed DC core spins at ~9000 RPM with low torque; cascading three compound gear reductions multiplies output torque by <b>${ratio}×</b> while dividing speed by <b>${ratio}×</b>.
          </p>
        </div>
      </div>
    `;
    return;
  }

  if (slug === 'gear-motor') {
    const stage3 = Number(values.stage3 ?? 26);
    const pwm = Number(values.pwm ?? 75);
    const load = Number(values.load ?? 25);
    const r1 = 2.4, r2 = 2.4, r3 = stage3 / 10;
    const totalRatio = r1 * r2 * r3;
    const eff = 0.78;
    const torqueMult = totalRatio * eff;
    const speedFactor = Math.max(0.1, (pwm / 100) * (1 - (load / 100) * 0.68));
    const motorRpm = Math.round(9000 * speedFactor);
    const outRpm = (motorRpm / totalRatio).toFixed(0);
    const cpr = Math.round(24 * totalRatio);

    // Build rotating 6-pole encoder disc & Hall sensor A/B quadrature waves
    const encRot = rad * 3.0 * speedFactor;
    let slotsSvg = '';
    for (let k = 0; k < 6; k++) {
      const a = encRot + (k * Math.PI) / 3;
      const sx = 95 + 28 * Math.cos(a);
      const sy = 96 - 28 * Math.sin(a);
      slotsSvg += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6" fill="#fbf8f2" stroke="#221f1b" stroke-width="1.3"/>`;
    }

    // Quadrature CHA and CHB square waves (90 deg electrical offset)
    let pathA = '', pathB = '';
    for (let x = 0; x <= 208; x += 2) {
      const ph = ((x / 208) * 4 * Math.PI) + encRot * 6;
      const chA = Math.sin(ph) >= 0 ? 1 : 0;
      const chB = Math.sin(ph - Math.PI / 2) >= 0 ? 1 : 0;
      const yA = chA ? 36 : 62;
      const yB = chB ? 82 : 108;
      pathA += `${x === 0 ? 'M ' : 'L '}${48 + x} ${yA} `;
      pathB += `${x === 0 ? 'M ' : 'L '}${48 + x} ${yB} `;
    }

    bodyEl.innerHTML = `
      <div class="physics-grid">
        <div class="physics-pane">
          <div class="physics-sub">1. 6-Pole Hall Quadrature Disc (Fast Shaft) &amp; 3-Stage Torque Cascade</div>
          <svg viewBox="0 0 220 190" class="physics-svg">
            <!-- Rotating encoder disc on fast motor shaft -->
            <circle cx="95" cy="96" r="44" fill="#489e8b" fill-opacity="0.85" stroke="#221f1b" stroke-width="1.6"/>
            ${slotsSvg}
            <circle cx="95" cy="96" r="12" fill="#dcb038" stroke="#221f1b" stroke-width="1.5"/>
            <!-- Hall sensors A & B at 90 deg electrical spacing -->
            <rect x="142" y="82" width="16" height="11" rx="2" fill="#dcb038" stroke="#221f1b" stroke-width="1.2"/>
            <text x="163" y="90" font-size="8.5" font-family="monospace" font-weight="700" fill="#b88418">HALL A (0°)</text>
            <rect x="139" y="102" width="16" height="11" rx="2" fill="#5aa2d4" stroke="#221f1b" stroke-width="1.2"/>
            <text x="160" y="110" font-size="8.5" font-family="monospace" font-weight="700" fill="#2f6999">HALL B (90°)</text>
            <text x="110" y="162" text-anchor="middle" font-size="9" font-family="monospace" fill="#221f1b">Fast shaft: ${motorRpm} RPM → Output: ${outRpm} RPM (G = ${totalRatio.toFixed(1)}:1)</text>
            <text x="110" y="177" text-anchor="middle" font-size="9" font-family="monospace" fill="#2b7a4b" font-weight="700">Output Resolution: 24 × ${totalRatio.toFixed(1)} = ${cpr} counts/rev</text>
          </svg>
          <p class="physics-caption">
            <b>Why the encoder sits on the motor tail:</b> Putting a small 6-slot disc on the fast input shaft multiplies its resolution by the gear ratio <b>G = ${totalRatio.toFixed(1)}</b>, giving <b>${cpr} quadrature edges</b> per turn of the slow output shaft!
          </p>
        </div>
        <div class="physics-pane">
          <div class="physics-sub">2. Live 90° Quadrature Signals (CHA / CHB) &amp; Torque Multiplication (${torqueMult.toFixed(1)}×)</div>
          <svg viewBox="0 0 280 190" class="physics-svg">
            <rect x="48" y="24" width="208" height="94" fill="#f5efe4" stroke="#d4cab8"/>
            <text x="42" y="52" text-anchor="end" font-size="9" font-family="monospace" font-weight="700" fill="#b88418">CHA</text>
            <path d="${pathA}" fill="none" stroke="#dcb038" stroke-width="2.2"/>
            <text x="42" y="98" text-anchor="end" font-size="9" font-family="monospace" font-weight="700" fill="#2f6999">CHB</text>
            <path d="${pathB}" fill="none" stroke="#5aa2d4" stroke-width="2.2"/>
            <text x="152" y="18" text-anchor="middle" font-size="9" font-family="monospace" fill="#48423a">CHA leads CHB by +90° (Forward CW) · 4× Edge Counting</text>
            <!-- 3-Stage Compound Torque Cascade -->
            <text x="48" y="133" font-size="9" font-family="monospace" font-weight="600" fill="#221f1b">Compound Torque Cascade: τ_out = η·(R₁·R₂·R₃)·τ_m = ${torqueMult.toFixed(1)} × τ_m</text>
            <rect x="48" y="140" width="46" height="24" rx="4" fill="#dcb038"/>
            <text x="71" y="155" text-anchor="middle" font-size="8.5" font-family="monospace" fill="#221f1b" font-weight="700">M 1.0×</text>
            <text x="100" y="155" text-anchor="middle" font-size="10" fill="#786f63">→</text>
            <rect x="106" y="140" width="46" height="24" rx="4" fill="#5aa2d4"/>
            <text x="129" y="155" text-anchor="middle" font-size="8.5" font-family="monospace" fill="#fff" font-weight="700">S1 2.4×</text>
            <text x="158" y="155" text-anchor="middle" font-size="10" fill="#786f63">→</text>
            <rect x="164" y="140" width="46" height="24" rx="4" fill="#82c0e4"/>
            <text x="187" y="155" text-anchor="middle" font-size="8.5" font-family="monospace" fill="#221f1b" font-weight="700">S2 5.8×</text>
            <text x="216" y="155" text-anchor="middle" font-size="10" fill="#786f63">→</text>
            <rect x="222" y="140" width="46" height="24" rx="4" fill="#489e8b"/>
            <text x="245" y="155" text-anchor="middle" font-size="8.5" font-family="monospace" fill="#fff" font-weight="700">Out ${totalRatio.toFixed(1)}×</text>
            <text x="156" y="180" text-anchor="middle" font-size="9" font-family="monospace" fill="#48423a">PWM: ${pwm}% · Load: ${load}% · Mesh efficiency η ≈ 78%</text>
          </svg>
          <p class="physics-caption">
            <b>Direction decoding:</b> When <b>CHA</b> rises while <b>CHB = LOW</b>, the microcontroller increments position; when <b>CHA</b> rises while <b>CHB = HIGH</b>, it decrements.
          </p>
        </div>
      </div>
    `;
  }
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
    const isHw = isHardwarePart(part);
    const swColor = resolvePartColor(part, state.colorTheme);
    const meta = part.kind === 'hardware'
      ? el('div', { class: 'meta hw' }, `${part.qty || 1}×`, part.material || 'steel')
      : el('div', { class: 'meta' },
        `${(s?.grams ?? 0).toFixed(1)} g${isHw ? ' (retainer/hw)' : ''}`,
        s?.closed === false ? el('span', { style: 'color:var(--warn)' }, 'open mesh') : null);
    const row = el('li', {
      'data-id': part.id,
      'data-on': state.selected === part.id ? 'true' : null,
      'data-hw-hidden': (!state.hardware && isHw) ? 'true' : null,
      onclick: () => selectPart(part.id, true),
      onmouseenter: () => { viewer.setViewState({ hovered: part.id }); },
      onmouseleave: () => { viewer.setViewState({ hovered: null }); },
    },
      el('span', { class: 'sw', style: `background:${swColor}` }),
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
        s?.closed === false ? 'MESH NOT CLOSED' : 'watertight manifold')
      : el('p', { class: 'src' }, `Hardware: ${part.material}`),
  );
  if (part.kind === 'print' && s && !s.error) {
    detail.append(el('button', { class: 'btn small primary', onclick: () => downloadPart(part) }, `Download ${part.name} (.stl)`));
  }
  void fromStage;
}

/* ------------------------------------------------------------------ export */

function renderExport() {
  const printed = currentParts.filter((p) => p.kind === 'print');
  const seen = new Set();
  const uniquePrinted = printed.filter((p) => {
    const k = p.printId || p.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const total = uniquePrinted.reduce((acc, p) => {
    const s = stats.get(p.id);
    if (s && !s.error) { acc.grams += s.grams * (p.qty || 1); acc.volume += s.cm3 * (p.qty || 1); }
    return acc;
  }, { grams: 0, volume: 0 });

  const host = $('#export');
  host.innerHTML = '';
  host.append(el('div', { class: 'totals' },
    el('div', { class: 'total' }, el('div', { class: 'k' }, 'Unique STLs'), el('div', { class: 'v' }, String(uniquePrinted.length))),
    el('div', { class: 'total' }, el('div', { class: 'k' }, 'Filament'), el('div', { class: 'v' }, `${total.grams.toFixed(1)} g`)),
    el('div', { class: 'total' }, el('div', { class: 'k' }, 'Volume'), el('div', { class: 'v' }, `${total.volume.toFixed(1)} cm³`)),
  ));

  host.append(el('div', { class: 'export-actions' },
    el('button', { class: 'btn primary', onclick: downloadAllPartsStl, title: 'Download a single combined binary STL with all printed part instances auto-nested flat on the 220×220 mm print bed' }, 'All Parts Bed (.stl)'),
    el('button', { class: 'btn primary', onclick: downloadLaserCutSvg, title: 'Download a 1:1 millimetre-scale 2D SVG on a 220×220 mm bed for laser cutting (red cut + blue score layers)' }, 'Laser Cut Bed (.svg)'),
    el('button', { class: 'btn primary', onclick: downloadPack, title: 'Download a ZIP archive with individual STL files, combined bed STL, laser-cut SVG, parameter sheet, and BOM' }, 'Print pack (.zip)'),
    el('button', { class: 'btn', onclick: downloadBlueprintSvg, title: 'Download hidden-line-removed Teardown vector drawing' }, 'Blueprint (.svg)'),
    el('button', { class: 'btn', onclick: () => downloadSheet() }, 'Sheet (.md)'),
  ));

  // Individual part STL quick-download list
  const stlList = el('div', { class: 'stl-part-grid' },
    el('div', { class: 'stl-list-head' }, 'Download individual part STLs:'),
    el('div', { class: 'stl-pills' },
      ...uniquePrinted.map((p) =>
        el('button', {
          type: 'button',
          class: 'chip small-chip stl-pill',
          onclick: () => downloadPart(p),
          title: `Download ${p.name} binary STL`,
        },
          el('span', { class: 'sw', style: `background:${resolvePartColor(p, state.colorTheme)};width:8px;height:8px;border-radius:2px;display:inline-block` }),
          `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''} .stl`,
        )),
    ),
  );
  host.append(stlList);

  host.append(el('div', { class: 'settings' },
    el('div', {}, 'Every STL is generated live in your browser, flat on the bed — zero supports required.'),
    el('div', {}, `0.2 mm layers · 3 walls · 25% infill · bores Ø${(KIT.rod + Number(values.clearance ?? KIT.fit)).toFixed(2)} mm.`),
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

/** Combine all printed part instances auto-nested flat on the 220x220 mm print bed into one binary STL! */
function downloadAllPartsStl() {
  const bedLayout = getBedPlacements();
  const bytes = buildCombinedBedStl(bedLayout.placements, `${slug} full print plate`);
  if (!bytes) return;
  download(bytes, `${slug}-all-parts-bed.stl`, 'model/stl');
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
    target = step.t;
  }
  if (step.parts) {
    const first = step.parts[0];
    viewer.setViewState({ selected: first });
    selectPart(first, false);
    state.selected = first;
  }
  if (step.explode !== undefined) {
    setExplode(step.explode);
  }
  viewer.applyPose(mod.pose(values, state.t));
  if (state.viewMode !== '3d') renderStageOverlay();
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
    const delta = ((target - state.t) % 360 + 540) % 360 - 180;
    if (Math.abs(delta) < 0.4) { state.t = target; target = null; }
    else state.t += delta * (1 - Math.exp(-dt / 0.22));
    moved = true;
  }
  if (!moved) return;

  viewer.applyPose(mod.pose(values, state.t));
  if (state.traceMotion) {
    const tr = getKinematicTrace(mod, values, state.t);
    if (tr && tr.cur) viewer.updateTraceCursor(tr.cur);
  }
  readoutClock += dt;
  if (readoutClock > 0.08) { readoutClock = 0; updateReadouts(); }
}

/* ------------------------------------------------------------------- wiring */

function wire() {
  $('#play').addEventListener('click', () => {
    if (state.viewMode === 'blueprint' && !state.playing) setViewMode('3d');
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
  $('#explode').addEventListener('input', (e) => setExplode(e.target.value));
  const stageExplode = $('#stage-explode');
  if (stageExplode) stageExplode.addEventListener('input', (e) => setExplode(e.target.value));
  const explodeBtn = $('#explode-btn');
  if (explodeBtn) {
    explodeBtn.addEventListener('click', () => {
      setExplode(state.explode > 0.1 ? 0 : 0.75);
    });
  }

  const themeSelect = $('#theme-select');
  if (themeSelect) {
    themeSelect.value = state.colorTheme;
    themeSelect.addEventListener('change', (e) => {
      state.colorTheme = e.target.value;
      if (state.colorTheme === 'hatches') {
        state.hatch = true;
        state.patent = false;
        setViewMode('blueprint');
        return;
      }
      if (state.colorTheme === 'patent') {
        state.patent = true;
      } else if (state.patent && $('#patent-btn')?.getAttribute('aria-pressed') === 'true') {
        state.patent = false;
      }
      $('#patent-btn')?.setAttribute('aria-pressed', String(state.patent));
      viewer.setViewState({ colorTheme: state.colorTheme, patent: state.patent });
      renderParts();
      renderExport();
      if (state.viewMode !== '3d') renderStageOverlay();
    });
  }

  const patentBtn = $('#patent-btn');
  if (patentBtn) {
    patentBtn.addEventListener('click', (e) => {
      state.patent = !state.patent;
      e.currentTarget.setAttribute('aria-pressed', String(state.patent));
      viewer.setViewState({ patent: state.patent });
      if (state.viewMode === 'blueprint') renderStageOverlay();
    });
  }
  const hideBaseBtn = $('#hide-base-btn');
  if (hideBaseBtn) {
    hideBaseBtn.addEventListener('click', (e) => {
      state.hideBase = !state.hideBase;
      e.currentTarget.setAttribute('aria-pressed', String(state.hideBase));
      viewer.setViewState({ hideBase: state.hideBase });
      viewer.applyPose(mod.pose(values, state.t));
      if (state.viewMode === 'blueprint') renderStageOverlay();
    });
  }

  const traceBtn = $('#trace-btn');
  if (traceBtn) {
    traceBtn.addEventListener('click', (e) => {
      state.traceMotion = !state.traceMotion;
      e.currentTarget.setAttribute('aria-pressed', String(state.traceMotion));
      if (state.traceMotion) {
        const tr = getKinematicTrace(mod, values, state.t);
        if (tr) {
          viewer.setTrace(tr.pts, tr.cur);
          updateTraceBadge(tr);
        }
      } else {
        viewer.clearTrace();
        updateTraceBadge(null);
      }
    });
  }

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
    const mb = $('#motor-badge');
    if (mb && mod.meta.motorMount) mb.hidden = !state.hardware;
    renderParts();
    if (state.viewMode === 'blueprint') renderStageOverlay();
  });
  $('#reset').addEventListener('click', () => {
    state.t = 0;
    state.playing = true;
    state.patent = false;
    state.hideBase = false;
    state.ghost = false;
    state.hardware = true;
    state.traceMotion = false;
    if (patentBtn) patentBtn.setAttribute('aria-pressed', 'false');
    if (hideBaseBtn) hideBaseBtn.setAttribute('aria-pressed', 'false');
    if (traceBtn) traceBtn.setAttribute('aria-pressed', 'false');
    $('#ghost')?.setAttribute('aria-pressed', 'false');
    $('#hardware')?.setAttribute('aria-pressed', 'true');
    const mb = $('#motor-badge');
    if (mb && mod.meta.motorMount) mb.hidden = false;
    setStep(-1);
    setExplode(0);
    viewer.setViewState({ patent: false, hideBase: false, ghost: false, showHardware: true });
    viewer.setCameraPreset?.('iso');
    renderParts();
    syncPlayButton();
    applyPose();
  });

  // Camera view angle presets (including 'bottom' for peeking from below)
  for (const preset of ['iso', 'top', 'bottom', 'front', 'side']) {
    const btn = $(`#cam-${preset}`);
    if (btn) {
      btn.addEventListener('click', () => {
        if (state.viewMode === 'bed') setViewMode('3d');
        viewer.setCameraPreset?.(preset);
        if (state.viewMode === 'blueprint') renderStageOverlay();
      });
    }
  }

  const m3d = $('#mode-3d');
  const mBp = $('#mode-blueprint');
  const mBed = $('#mode-bed');
  if (m3d) m3d.addEventListener('click', () => setViewMode('3d'));
  if (mBp) mBp.addEventListener('click', () => setViewMode('blueprint'));
  if (mBed) mBed.addEventListener('click', () => setViewMode('bed'));

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
  const kicker = $('#kicker');
  if (kicker) {
    kicker.innerHTML = '';
    kicker.append(document.createTextNode(mod.meta.category));
    const ref507 = (mod.meta.references || []).find((r) => r.url && r.url.includes('507movements.com'));
    if (mod.meta.movement || ref507) {
      kicker.append(
        document.createTextNode(' · '),
        el('a', {
          href: ref507 ? ref507.url : 'https://507movements.com/',
          target: '_blank',
          rel: 'noopener',
          style: 'color:var(--accent);text-decoration:underline;',
        }, `${mod.meta.movement || '507 Movements'} ↗`),
      );
    }
  }
  $('#question').textContent = mod.meta.question;
  $('#bigidea').textContent = mod.meta.bigIdea;

  const motorBadge = $('#motor-badge');
  if (motorBadge && mod.meta.motorMount) {
    motorBadge.hidden = false;
    const mm = mod.meta.motorMount;
    motorBadge.innerHTML = `<span class="motor-dot"></span><b>MOTOR ATTACHED:</b> ${mm.label} (${mm.direction || 'ROT'})`;
    motorBadge.onclick = () => selectPart(mm.partId, true);
  }

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
  const hwCard = $('#hardware-card');
  if (hw && mod.hardware?.length) {
    hw.innerHTML = '';
    for (const h of mod.hardware) {
      const li = el('li', {}, el('b', {}, `${h.qty}× ${h.name}`), ` — ${h.spec}`);
      if (h.url) {
        li.append(' ', el('a', {
          href: h.url,
          target: '_blank',
          rel: 'noopener',
          class: 'hw-spec-link',
          style: 'color:var(--accent);text-decoration:underline;font-size:11.5px;margin-left:4px;',
        }, 'Specs ↗'));
      }
      hw.append(li);
    }
  } else if (hwCard) {
    hwCard.hidden = true;
  }

  const circuitCard = $('#circuit-card');
  if (circuitCard && (mod.meta.wiring || mod.meta.code)) {
    circuitCard.hidden = false;
    const wMeta = $('#wiring-meta');
    const wRows = $('#wiring-rows');
    const codeEl = $('#arduino-code');
    if (wMeta && mod.meta.wiring) {
      wMeta.innerHTML = '';
      wMeta.append(
        el('div', { class: 'wiring-pill' }, el('b', {}, 'Driver: '), mod.meta.wiring.driver),
        el('div', { class: 'wiring-pill' }, el('b', {}, 'Power: '), mod.meta.wiring.supply),
      );
    }
    if (wRows && mod.meta.wiring?.connections) {
      wRows.innerHTML = '';
      for (const c of mod.meta.wiring.connections) {
        wRows.append(el('tr', {},
          el('td', { class: 'mono-td' }, c.from),
          el('td', { class: 'mono-td' }, c.to),
          el('td', {}, c.role),
        ));
      }
    }
    if (codeEl && mod.meta.code) {
      codeEl.textContent = mod.meta.code;
    }
    const copyBtn = $('#copy-code');
    if (copyBtn && mod.meta.code) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(mod.meta.code);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Arduino Sketch'; }, 1800);
      });
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

function renderMath() {
  if (typeof window.renderMathInElement === 'function') {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre'],
      throwOnError: false
    });
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderMath);
} else {
  renderMath();
}
window.addEventListener('load', renderMath);

window.__mechanism = { mod, values, state, viewer, build, setExplode };
