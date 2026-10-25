/* viewer.js — the stage. An orthographic isometric camera, two soft lights, a
   shadow on the table, and one mesh per part built from the part's own
   extruded triangles.

   The geometry here is the geometry the STL export writes: same profiles, same
   millimetres, same z stack. Nothing is drawn twice from two sources.
*/

import * as THREE from '../vendor/three/three.module.js';
import { extrude } from '../../src/lib/mesh.js';

export class Viewer {
  constructor(canvas, { onPick, onHover } = {}) {
    this.canvas = canvas;
    this.onPick = onPick || (() => {});
    this.onHover = onHover || (() => {});

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -1200, 1200);

    this.azimuth = -0.62;
    this.elevation = 0.92;
    this.zoom = 1;
    this.explode = 0;
    this.ghost = false;
    this.showHardware = true;
    this.selected = null;
    this.hovered = null;

    this.root = new THREE.Group();
    this.root.rotation.x = -Math.PI / 2; // mechanism z becomes world up
    this.scene.add(this.root);

    this.buildLights();
    this.buildTable();

    this.parts = [];
    this.meshes = new Map();
    this.pickables = [];

    this.bindPointer();
    this.bindKeys();

    this.visible = true;
    this.running = false;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement || canvas);
    } else {
      window.addEventListener('resize', () => this.resize());
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting;
        if (this.visible) this.start();
      }, { rootMargin: '120px 0px' });
      this.io.observe(canvas);
    }
    this.start();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbbfae, 1.15);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff6ea, 1.45);
    key.position.set(-90, 180, 120);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = 170;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 600;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.6;
    this.scene.add(key);
    this.key = key;

    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    fill.position.set(140, 90, -110);
    this.scene.add(fill);
  }

  buildTable() {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.ShadowMaterial({ opacity: 0.14, color: 0x5b4a33 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.35;
    plane.receiveShadow = true;
    this.scene.add(plane);
  }

  /* ------------------------------------------------------------- geometry */

  setParts(parts) {
    this.clearParts();
    this.parts = parts;
    let box = new THREE.Box3();

    for (const part of parts) {
      const geo = geometryFor(part);
      if (!geo) continue;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(part.color || '#c8bda9'),
        roughness: part.kind === 'hardware' ? 0.35 : 0.72,
        metalness: part.kind === 'hardware' ? 0.75 : 0.02,
        flatShading: true,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.partId = part.id;
      mesh.renderOrder = part.zOrder ?? (part.role === 'frame' ? 0 : 1);
      mesh.position.set(part.at.x, part.at.y, part.at.z);
      this.root.add(mesh);
      this.meshes.set(part.id, { mesh, part, material });
      this.pickables.push(mesh);
      geo.computeBoundingBox();
      box.union(geo.boundingBox.clone().translate(new THREE.Vector3(part.at.x, part.at.y, part.at.z)));
    }

    // Frame in world space: the root group turns the mechanism's z into world up.
    this.root.updateMatrixWorld(true);
    const world = new THREE.Box3().setFromObject(this.root);
    this.homeBox = world.isEmpty() ? new THREE.Box3(new THREE.Vector3(-60, 0, -40), new THREE.Vector3(60, 40, 40)) : world;
    this.target = world.getCenter(new THREE.Vector3());
    this.radius = Math.max(45, world.getSize(new THREE.Vector3()).length() / 2);
    this.applyPose({});
    this.setViewState({});
    this.updateCamera();
  }

  clearParts() {
    for (const { mesh, material } of this.meshes.values()) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
    }
    this.meshes.clear();
    this.pickables = [];
  }

  /** Apply a mechanism pose: {partId: {rot, dx, dy, hide, lift}}. */
  applyPose(pose = {}) {
    for (const [id, { mesh, part }] of this.meshes) {
      const p = pose[id] || {};
      const px = part.pivot?.x ?? 0;
      const py = part.pivot?.y ?? 0;
      mesh.position.set(part.at.x + (p.dx || 0), part.at.y + (p.dy || 0), part.at.z);
      mesh.rotation.z = p.rot || 0;
      mesh.visible = p.hide ? false : !(part.kind === 'hardware' && !this.showHardware);
      // rotate about the part's own pivot in its local frame
      if (px || py) {
        const c = Math.cos(mesh.rotation.z), s = Math.sin(mesh.rotation.z);
        mesh.position.x += px - (px * c - py * s);
        mesh.position.y += py - (px * s + py * c);
      }
      if (this.explode > 0) {
        const index = (part.layer || 0) + (part.explodeRank || 0);
        mesh.position.z += this.explode * (index * 5.5 + 2);
      }
    }
  }

  setViewState({ explode, ghost, showHardware, selected, hovered }) {
    if (typeof explode === 'number') this.explode = explode;
    if (typeof ghost === 'boolean') this.ghost = ghost;
    if (typeof showHardware === 'boolean') this.showHardware = showHardware;
    if (selected !== undefined) this.selected = selected;
    if (hovered !== undefined) this.hovered = hovered;

    for (const [id, { part, material, mesh }] of this.meshes) {
      const isHi = id === this.selected || id === this.hovered;
      const isFrame = part.role === 'frame';
      if (id === this.hovered && id !== this.selected) {
        material.emissive = new THREE.Color('#ffb27a');
        material.emissiveIntensity = 0.35;
      } else if (id === this.selected) {
        material.emissive = new THREE.Color('#ff8a3d');
        material.emissiveIntensity = 0.5;
      } else {
        material.emissive = new THREE.Color('#000000');
        material.emissiveIntensity = 0;
      }
      if (this.ghost && isFrame && !isHi) {
        material.opacity = 0.16;
        material.transparent = true;
        material.depthWrite = false;
      } else {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      }
      material.needsUpdate = true;
      if (mesh.visible && part.kind === 'hardware') mesh.visible = this.showHardware;
    }
  }

  /* ---------------------------------------------------------------- camera */

  updateCamera() {
    const w = Math.max(1, this.canvas.clientWidth || 800);
    const h = Math.max(1, this.canvas.clientHeight || 600);
    const aspect = w / h;
    const fit = (this.radius * 1.55) / this.zoom;
    this.camera.left = -fit * aspect;
    this.camera.right = fit * aspect;
    this.camera.top = fit;
    this.camera.bottom = -fit;
    this.camera.zoom = 1;
    this.camera.near = -1200;
    this.camera.far = 1200;
    this.camera.updateProjectionMatrix();

    const dist = 700;
    const ce = Math.cos(this.elevation);
    this.camera.position.set(
      this.target.x + dist * ce * Math.sin(this.azimuth),
      this.target.y + dist * Math.sin(this.elevation),
      this.target.z + dist * ce * Math.cos(this.azimuth),
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
    this.dirty = true;
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 800;
    const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.updateCamera();
    this.renderOnce();
  }

  /* --------------------------------------------------------------- pointer */

  bindPointer() {
    const el = this.canvas;
    let dragging = false;
    let lx = 0, ly = 0, moved = 0;
    const pointers = new Map();

    el.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true;
        moved = 0;
        lx = e.clientX; ly = e.clientY;
        el.setPointerCapture(e.pointerId);
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinch) this.zoom = clamp(this.zoom * (d / this._pinch), 0.5, 3);
        this._pinch = d;
        this.updateCamera();
        return;
      }
      if (dragging) {
        const dx = e.clientX - lx, dy = e.clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        lx = e.clientX; ly = e.clientY;
        this.azimuth -= dx * 0.006;
        this.elevation = clamp(this.elevation + dy * 0.005, 0.16, 1.44);
        this.updateCamera();
        this.renderOnce();
      } else {
        this.pick(e, true);
      }
    });

    const end = (e) => {
      pointers.delete(e.pointerId);
      this._pinch = null;
      if (pointers.size === 0) {
        if (dragging && moved < 6) this.pick(e, false);
        dragging = false;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => { this.onHover(null, null); });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0012), 0.5, 3);
      this.updateCamera();
      this.renderOnce();
    }, { passive: false });
    el.addEventListener('dblclick', () => { this.zoom = 1; this.azimuth = -0.62; this.elevation = 0.92; this.updateCamera(); this.renderOnce(); });
  }

  pick(event, hover) {
    const rect = this.canvas.getBoundingClientRect();
    const pt = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pt, this.camera);
    const hits = ray.intersectObjects(this.pickables.filter((m) => m.visible), false);
    const id = hits.length ? hits[0].object.userData.partId : null;
    if (hover) {
      if (id !== this.hovered) {
        this.setViewState({ hovered: id });
        this.onHover(id, event);
      } else if (id) {
        this.onHover(id, event);
      }
    } else {
      this.onPick(id);
    }
  }

  bindKeys() {
    this.canvas.addEventListener('keydown', (e) => {
      const step = 0.12;
      if (e.key === 'ArrowLeft') { this.azimuth += step; this.updateCamera(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { this.azimuth -= step; this.updateCamera(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { this.elevation = clamp(this.elevation + step, 0.16, 1.44); this.updateCamera(); e.preventDefault(); }
      if (e.key === 'ArrowDown') { this.elevation = clamp(this.elevation - step, 0.16, 1.44); this.updateCamera(); e.preventDefault(); }
      if (e.key === '+' || e.key === '=') { this.zoom = clamp(this.zoom * 1.1, 0.5, 3); this.updateCamera(); }
      if (e.key === '-') { this.zoom = clamp(this.zoom / 1.1, 0.5, 3); this.updateCamera(); }
      if (e.key === '0') { this.zoom = 1; this.updateCamera(); }
      this.renderOnce();
    });
  }

  /* ------------------------------------------------------------------ loop */

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(loop);
      if (this.visible) this.renderer.render(this.scene, this.camera);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  renderOnce() {
    if (this.visible) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    this.clearParts();
    this.ro?.disconnect();
    this.io?.disconnect();
    this.renderer.dispose();
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** One BufferGeometry per part from its extruded solids (print frame, mm). */
function geometryFor(part) {
  const positions = [];
  for (const s of part.solids) {
    const tris = extrudeSolid(s);
    for (const t of tris) {
      for (const v of t) positions.push(v[0], v[1], v[2]);
    }
  }
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

const extrudeSolid = (s) => extrude({ outer: s.outer, holes: s.holes ?? [], z: s.z ?? 0, h: s.h });
