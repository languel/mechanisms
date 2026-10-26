/* viewer.js — the 3D workbench stage.
   An orthographic CAD camera, studio lights, a contact shadow on the drafting
   table, and one mesh per part built from the part's own extruded triangles
   plus crisp CAD feature-edge linework (`EdgesGeometry`) and exploded assembly trails.

   The geometry here is the exact geometry the STL export writes: same profiles, same
   millimetres, same z stack. Everything runs in the browser at 60 fps.
*/

import * as THREE from '../vendor/three/three.module.js';
import { extrude } from '../../src/lib/mesh.js';
import { isHardwarePart, resolvePartColor, COLOR_THEMES } from '../../src/lib/kit.js';

export class Viewer {
  constructor(canvas, { onPick, onHover, onCameraChange, onFrame } = {}) {
    this.canvas = canvas;
    this.onPick = onPick || (() => {});
    this.onHover = onHover || (() => {});
    this.onCameraChange = onCameraChange || (() => {});
    this.onFrame = onFrame || (() => {});

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -1200, 1200);

    // Initialize target & radius BEFORE first resize() call!
    this.target = new THREE.Vector3(0, 8, 0);
    this.panOffset = new THREE.Vector3(0, 0, 0);
    this.radius = 75;

    this.azimuth = -0.62;
    this.elevation = 0.76;
    this.zoom = 1;
    this.explode = 0;
    this.ghost = false;
    this.hideBase = false;
    this.patent = false;
    this.colorTheme = 'sky-gold';
    this.showHardware = true;
    this.isDark = (typeof document !== 'undefined') && document.documentElement.getAttribute('data-theme') === 'dark';
    this.selected = null;
    this.hovered = null;
    this.motorMount = null;

    this.root = new THREE.Group();
    this.root.rotation.x = -Math.PI / 2; // mechanism z becomes world up (Y)
    this.scene.add(this.root);

    this.trailsGroup = new THREE.Group();
    this.root.add(this.trailsGroup);

    this.traceGroup = new THREE.Group();
    this.root.add(this.traceGroup);

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
    this.hemi = new THREE.HemisphereLight(0xfffcf5, 0xcbbfae, 1.18);
    this.scene.add(this.hemi);

    const key = new THREE.DirectionalLight(0xfff6ea, 1.48);
    key.position.set(-95, 190, 130);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = 175;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 600;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.6;
    this.scene.add(key);
    this.keyLight = key;

    this.fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.55);
    this.fillLight.position.set(140, 95, -110);
    this.scene.add(this.fillLight);

    // Underside fill light so bottom faces are clearly lit when peeking from below
    this.underLight = new THREE.DirectionalLight(0xfff5e4, 0.62);
    this.underLight.position.set(45, -190, -85);
    this.scene.add(this.underLight);
    this.updateLights();
  }

  updateLights() {
    if (this.isDark) {
      if (this.hemi) { this.hemi.color.setHex(0xe8e2d8); this.hemi.groundColor.setHex(0x322e28); this.hemi.intensity = 1.05; }
      if (this.keyLight) { this.keyLight.color.setHex(0xfff6eb); this.keyLight.intensity = 1.38; }
      if (this.fillLight) { this.fillLight.color.setHex(0x8fa2b5); this.fillLight.intensity = 0.52; }
      if (this.underLight) { this.underLight.intensity = 0.45; }
      if (this.tablePlane) { this.tablePlane.material.opacity = 0.35; this.tablePlane.material.color.setHex(0x020202); }
    } else {
      if (this.hemi) { this.hemi.color.setHex(0xfffcf5); this.hemi.groundColor.setHex(0xcbbfae); this.hemi.intensity = 1.18; }
      if (this.keyLight) { this.keyLight.color.setHex(0xfff6ea); this.keyLight.intensity = 1.48; }
      if (this.fillLight) { this.fillLight.color.setHex(0xdfe8ff); this.fillLight.intensity = 0.55; }
      if (this.underLight) { this.underLight.intensity = 0.62; }
      if (this.tablePlane) { this.tablePlane.material.opacity = 0.13; this.tablePlane.material.color.setHex(0x4a3b28); }
    }
  }

  buildTable() {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.ShadowMaterial({ opacity: this.isDark ? 0.35 : 0.13, color: this.isDark ? 0x020202 : 0x4a3b28 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.35;
    plane.receiveShadow = true;
    this.tablePlane = plane;
    this.scene.add(plane);
  }

  /* ------------------------------------------------------------- geometry */

  setMotorMount(motorMount) {
    this.motorMount = motorMount || null;
  }

  setParts(parts) {
    this.clearParts();
    this.parts = parts;
    const box = new THREE.Box3();

    for (const part of parts) {
      const geo = geometryFor(part);
      if (!geo) continue;
      const isFrame = part.role === 'frame' || part.id === 'frame';
      const baseColor = isFrame ? (this.isDark ? '#262420' : '#eee8dc') : (part.color || '#c8bda9');
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor),
        roughness: part.kind === 'hardware' ? 0.35 : (isFrame ? 0.88 : 0.65),
        metalness: part.kind === 'hardware' ? 0.72 : 0.04,
        flatShading: true,
        transparent: true,
        opacity: 1,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = !isFrame;
      mesh.receiveShadow = true;
      mesh.userData.partId = part.id;
      mesh.renderOrder = part.zOrder ?? (isFrame ? 0 : 1);
      mesh.position.set(part.at.x, part.at.y, part.at.z);

      // Crisp technical drafting feature edges on every 3D part
      const edgesGeo = new THREE.EdgesGeometry(geo, 22);
      const edgeMat = new THREE.LineBasicMaterial({
        color: this.isDark ? (isFrame ? 0x484236 : 0x181614) : 0x231f1b,
        transparent: true,
        opacity: isFrame ? (this.isDark ? 0.28 : 0.22) : 0.44,
      });
      const edgeLines = new THREE.LineSegments(edgesGeo, edgeMat);
      mesh.add(edgeLines);

      this.root.add(mesh);
      geo.computeBoundingBox();
      const localCenter = geo.boundingBox
        ? geo.boundingBox.getCenter(new THREE.Vector3())
        : new THREE.Vector3();
      this.meshes.set(part.id, { mesh, part, material, baseColor, edgeLines, edgeMat, localCenter });
      this.pickables.push(mesh);
      if (geo.boundingBox) {
        box.union(geo.boundingBox.clone().translate(new THREE.Vector3(part.at.x, part.at.y, part.at.z)));
      }
    }

    this.root.updateMatrixWorld(true);
    const world = new THREE.Box3().setFromObject(this.root);
    this.homeBox = world.isEmpty()
      ? new THREE.Box3(new THREE.Vector3(-60, 0, -40), new THREE.Vector3(60, 40, 40))
      : world;
    this.target = this.homeBox.getCenter(new THREE.Vector3());
    this.radius = Math.max(42, this.homeBox.getSize(new THREE.Vector3()).length() / 2);
    this.maxExplodeZ = Math.max(1, ...parts.map((p) => (p.explodeOrder || 0) * 14));
    this.applyPose({});
    this.setViewState({});
    this.updateCamera();
  }

  clearParts() {
    for (const { mesh, material, edgeLines, edgeMat } of this.meshes.values()) {
      this.root.remove(mesh);
      if (edgeLines) edgeLines.geometry.dispose();
      if (edgeMat) edgeMat.dispose();
      mesh.geometry.dispose();
      material.dispose();
    }
    this.clearTrails();
    this.meshes.clear();
    this.pickables = [];
  }

  clearTrace() {
    this.traceLine = null;
    this.traceCursor = null;
    while (this.traceGroup.children.length) {
      const child = this.traceGroup.children[0];
      this.traceGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  setTrace(points = null, currentPoint = null) {
    this.clearTrace();
    if (!points || points.length < 2) return;

    const threePts = points.map((p) => new THREE.Vector3(p.x ?? p[0], p.y ?? p[1], (p.z ?? p[2] ?? 18) + (this.explode * 14)));
    const geo = new THREE.BufferGeometry().setFromPoints(threePts);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const mat = new THREE.LineBasicMaterial({
      color: isDark ? 0x64b5f6 : 0xdcb038,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    });
    this.traceLine = new THREE.Line(geo, mat);
    this.traceLine.renderOrder = 999;
    this.traceGroup.add(this.traceLine);

    // Dynamic Kinematic Tracer beacon + physical stylus contact pin
    const cursorGroup = new THREE.Group();
    // Luminous beacon ring
    const ringGeo = new THREE.RingGeometry(2.4, 3.6, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isDark ? 0xffb74d : 0xc2571f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    cursorGroup.add(ringMesh);

    // Glowing core sphere
    const dotGeo = new THREE.SphereGeometry(2.0, 16, 16);
    const dotMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0xffca28 : 0xd84315,
      emissive: isDark ? 0xff8f00 : 0xbf360c,
      emissiveIntensity: 0.65,
      roughness: 0.35,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    cursorGroup.add(dot);

    // Stylus pin dropping down to touch the part surface
    const stylusGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -3.8),
    ]);
    const stylusMat = new THREE.LineBasicMaterial({
      color: isDark ? 0xffffff : 0x221f1b,
      transparent: true,
      opacity: 0.75,
    });
    cursorGroup.add(new THREE.Line(stylusGeo, stylusMat));

    cursorGroup.renderOrder = 1000;
    this.traceCursor = cursorGroup;
    this.traceGroup.add(cursorGroup);

    if (currentPoint) {
      this.updateTraceCursor(currentPoint);
    }
  }

  updateTraceCursor(currentPoint) {
    if (!this.traceCursor || !currentPoint) return;
    const cx = currentPoint.x ?? currentPoint[0];
    const cy = currentPoint.y ?? currentPoint[1];
    const cz = (currentPoint.z ?? currentPoint[2] ?? 18) + (this.explode * 14);
    this.traceCursor.position.set(cx, cy, cz);
    this.traceCursor.visible = true;
  }

  clearTrails() {
    while (this.trailsGroup.children.length) {
      const child = this.trailsGroup.children[0];
      this.trailsGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  /** Apply a mechanism pose: {partId: {rot, dx, dy, dz, hide}}. */
  applyPose(pose = {}) {
    this.clearTrails();
    for (const [id, { mesh, part, localCenter }] of this.meshes) {
      const p = pose[id] || {};
      const isFrame = part.role === 'frame' || part.id === 'frame';
      const px = part.pivot?.x ?? 0;
      const py = part.pivot?.y ?? 0;
      const baseX = part.at.x + (p.dx || 0);
      const baseY = part.at.y + (p.dy || 0);
      const baseZ = part.at.z + (p.dz || 0);
      mesh.position.set(baseX, baseY, baseZ);
      mesh.rotation.z = p.rot || 0;
      mesh.visible = (p.hide || (isFrame && this.hideBase))
        ? false
        : !(isHardwarePart(part) && !this.showHardware);

      if (px || py) {
        const c = Math.cos(mesh.rotation.z), s = Math.sin(mesh.rotation.z);
        mesh.position.x += px - (px * c - py * s);
        mesh.position.y += py - (px * s + py * c);
      }
      if (this.explode > 0 && !isFrame) {
        const order = part.explodeOrder ?? ((part.layer || 0) + (part.explodeRank || 1));
        const dz = this.explode * (order * 14 + 4);
        mesh.position.z += dz;

        if (mesh.visible && dz > 1.5) {
          const trailX = mesh.position.x + (localCenter?.x || 0) * 0.25;
          const trailY = mesh.position.y + (localCenter?.y || 0) * 0.25;
          const pts = [
            new THREE.Vector3(trailX, trailY, baseZ + (localCenter?.z || 0)),
            new THREE.Vector3(trailX, trailY, baseZ + (localCenter?.z || 0) + dz),
          ];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
          const lineMat = new THREE.LineBasicMaterial({
            color: 0xc2571f,
            transparent: true,
            opacity: 0.72,
          });
          this.trailsGroup.add(new THREE.Line(lineGeo, lineMat));
        }
      }
    }

    // Draw 3D Motor Input Axis & Directional Arrow on the driven input shaft (gated on showHardware)
    if (this.showHardware && this.motorMount && this.motorMount.partId) {
      const entry = this.meshes.get(this.motorMount.partId);
      if (entry && entry.mesh.visible) {
        const mx = entry.part.at.x + (entry.part.pivot?.x || 0);
        const my = entry.part.at.y + (entry.part.pivot?.y || 0);
        const topZ = entry.mesh.position.z + (entry.localCenter?.z || 4) * 2 + 10;
        const axisPts = [
          new THREE.Vector3(mx, my, -14),
          new THREE.Vector3(mx, my, topZ + 12),
        ];
        const axisMat = new THREE.LineBasicMaterial({ color: 0xc2571f, transparent: true, opacity: 0.85 });
        this.trailsGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(axisPts), axisMat));

        // Circular direction arrow arc around the motor shaft axis at z = topZ + 8
        const arcR = 11.5;
        const dir = this.motorMount.direction === 'CW' ? -1 : 1;
        const arcPts = [];
        const a0 = -0.35 * Math.PI;
        const a1 = dir > 0 ? 0.95 * Math.PI : -1.65 * Math.PI;
        for (let i = 0; i <= 24; i++) {
          const a = a0 + ((a1 - a0) * i) / 24;
          arcPts.push(new THREE.Vector3(mx + arcR * Math.cos(a), my + arcR * Math.sin(a), topZ + 8));
        }
        this.trailsGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), axisMat));
        // Arrowhead at the end of the arc
        const tip = arcPts[arcPts.length - 1];
        const prev = arcPts[arcPts.length - 2];
        const tx = tip.x - prev.x, ty = tip.y - prev.y;
        const tl = Math.hypot(tx, ty) || 1;
        const ux = tx / tl, uy = ty / tl;
        const nx = -uy, ny = ux;
        const headPts = [
          new THREE.Vector3(tip.x - ux * 3.4 + nx * 2.2, tip.y - uy * 3.4 + ny * 2.2, topZ + 8),
          tip,
          new THREE.Vector3(tip.x - ux * 3.4 - nx * 2.2, tip.y - uy * 3.4 - ny * 2.2, topZ + 8),
        ];
        this.trailsGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(headPts), axisMat));
      }
    }
  }

  setViewState({ explode, ghost, hideBase, patent, colorTheme, showHardware, selected, hovered, isDark }) {
    if (typeof isDark === 'boolean') {
      this.isDark = isDark;
      this.updateLights();
    }
    if (typeof explode === 'number') this.explode = explode;
    if (typeof ghost === 'boolean') this.ghost = ghost;
    if (typeof hideBase === 'boolean') this.hideBase = hideBase;
    if (typeof patent === 'boolean') this.patent = patent;
    if (typeof colorTheme === 'string' && COLOR_THEMES[colorTheme]) {
      this.colorTheme = colorTheme;
    }
    if (typeof showHardware === 'boolean') this.showHardware = showHardware;
    if (selected !== undefined) this.selected = selected;
    if (hovered !== undefined) this.hovered = hovered;

    const effectivePatent = this.patent || this.colorTheme === 'patent';

    for (const [id, { part, material, mesh, edgeMat }] of this.meshes) {
      const isHi = id === this.selected || id === this.hovered;
      const isFrame = part.role === 'frame' || part.id === 'frame';
      let themedColor = resolvePartColor(part, this.colorTheme);
      if (isFrame && this.isDark && !effectivePatent) {
        themedColor = '#262420';
      }

      if (effectivePatent) {
        // Patent Line-Drawing Mode: flat warm fills + crisp ink edges
        if (this.isDark) {
          material.color.set(isHi ? '#3a2e26' : '#22201d');
          material.emissive.set(isHi ? '#e8834a' : '#1c1a17');
          material.emissiveIntensity = isHi ? 0.35 : 0.45;
          if (edgeMat) {
            edgeMat.color.setHex(isHi ? 0xff9d5c : 0xd8d2c4);
            edgeMat.opacity = (this.ghost && isFrame) ? 0.18 : (isFrame ? 0.55 : 0.95);
          }
        } else {
          material.color.set(isHi ? '#f5e1d3' : '#faf6ee');
          material.emissive.set(isHi ? '#e8834a' : '#faf6ee');
          material.emissiveIntensity = isHi ? 0.28 : 0.62;
          if (edgeMat) {
            edgeMat.color.setHex(isHi ? 0xc2571f : 0x1a1714);
            edgeMat.opacity = (this.ghost && isFrame) ? 0.18 : (isFrame ? 0.55 : 0.95);
          }
        }
      } else {
        material.color.set(themedColor);
        if (id === this.hovered && id !== this.selected) {
          material.emissive = new THREE.Color('#ffb27a');
          material.emissiveIntensity = 0.35;
          if (edgeMat) { edgeMat.color.setHex(0xc2571f); edgeMat.opacity = 0.85; }
        } else if (id === this.selected) {
          material.emissive = new THREE.Color('#ff8a3d');
          material.emissiveIntensity = 0.48;
          if (edgeMat) { edgeMat.color.setHex(0xc2571f); edgeMat.opacity = 0.95; }
        } else {
          material.emissive = new THREE.Color('#000000');
          material.emissiveIntensity = 0;
          if (edgeMat) {
            edgeMat.color.setHex(this.isDark ? (isFrame ? 0x484236 : 0x181614) : 0x231f1b);
            edgeMat.opacity = this.ghost && isFrame ? 0.10 : (isFrame ? (this.isDark ? 0.28 : 0.22) : 0.44);
          }
        }
      }

      const underPeek = this.elevation < -0.12;
      if ((this.ghost || underPeek) && isFrame && !isHi) {
        material.opacity = underPeek && !this.ghost ? 0.24 : 0.14;
        material.transparent = true;
        material.depthWrite = false;
      } else {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      }
      material.needsUpdate = true;
      if (isFrame && this.hideBase) {
        mesh.visible = false;
      } else if (isHardwarePart(part)) {
        mesh.visible = this.showHardware;
      }
    }
  }

  /** Project a part's 3D centroid to 2D viewport pixel coordinates for callout leaders. */
  getPartScreenPos(partId) {
    const entry = this.meshes.get(partId);
    if (!entry || !entry.mesh.visible) return null;
    this.root.updateMatrixWorld(true);
    const worldPt = entry.localCenter.clone().applyMatrix4(entry.mesh.matrixWorld);
    const ndc = worldPt.project(this.camera);
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    return {
      x: (ndc.x * 0.5 + 0.5) * w,
      y: (-ndc.y * 0.5 + 0.5) * h,
    };
  }

  /** Set a named camera view preset ('iso' | 'top' | 'bottom' | 'front' | 'side'). */
  setCameraPreset(preset) {
    this.panOffset.set(0, 0, 0);
    if (preset === 'top') {
      this.azimuth = 0;
      this.elevation = 1.52;
    } else if (preset === 'bottom') {
      this.azimuth = -0.62;
      this.elevation = -0.95;
    } else if (preset === 'front') {
      this.azimuth = 0;
      this.elevation = 0.12;
    } else if (preset === 'side') {
      this.azimuth = -Math.PI / 2;
      this.elevation = 0.14;
    } else {
      this.azimuth = -0.62;
      this.elevation = 0.76;
      this.zoom = 1;
    }
    this.updateCamera();
    this.renderOnce();
  }

  /* ---------------------------------------------------------------- camera */

  updateCamera() {
    if (!this.target) return;
    if (this.tablePlane) {
      this.tablePlane.visible = !this.hideBase && this.elevation >= -0.02;
    }
    const nowUnder = this.elevation < -0.12;
    if (nowUnder !== this._wasUnder) {
      this._wasUnder = nowUnder;
      this.setViewState({});
    }
    const w = Math.max(1, this.canvas.clientWidth || 800);
    const h = Math.max(1, this.canvas.clientHeight || 600);
    const aspect = w / h;
    const explodeLift = (this.maxExplodeZ || 50) * this.explode;
    const fit = ((this.radius * 0.96 + explodeLift * 0.48)) / this.zoom;
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
    const lookX = this.target.x + this.panOffset.x;
    const lookY = this.target.y + this.panOffset.y + explodeLift * 0.42;
    const lookZ = this.target.z + this.panOffset.z;

    this.camera.position.set(
      lookX + dist * ce * Math.sin(this.azimuth),
      lookY + dist * Math.sin(this.elevation),
      lookZ + dist * ce * Math.cos(this.azimuth),
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(lookX, lookY, lookZ);
    this.dirty = true;
    this.onCameraChange(this.azimuth, this.elevation);
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
    let panning = false;
    let lx = 0, ly = 0, moved = 0;
    const pointers = new Map();

    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true;
        panning = e.button === 2 || e.shiftKey;
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
        if (this._pinch) this.zoom = clamp(this.zoom * (d / this._pinch), 0.45, 3.5);
        this._pinch = d;
        this.updateCamera();
        return;
      }
      if (dragging) {
        const dx = e.clientX - lx, dy = e.clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        lx = e.clientX; ly = e.clientY;
        if (panning) {
          const scale = (this.radius * 2) / ((el.clientHeight || 500) * this.zoom);
          const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
          this.panOffset.addScaledVector(right, -dx * scale);
          this.panOffset.y += dy * scale;
        } else {
          this.azimuth -= dx * 0.007;
          this.elevation = clamp(this.elevation + dy * 0.006, -1.53, 1.53);
        }
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
        if (dragging && moved < 6 && !panning) this.pick(e, false);
        dragging = false;
        panning = false;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => { this.onHover(null, null); });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 3.5);
      this.updateCamera();
      this.renderOnce();
    }, { passive: false });
    el.addEventListener('dblclick', () => {
      this.setCameraPreset('iso');
    });
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
      if (e.key === 'ArrowUp') { this.elevation = clamp(this.elevation + step, -1.53, 1.53); this.updateCamera(); e.preventDefault(); }
      if (e.key === 'ArrowDown') { this.elevation = clamp(this.elevation - step, -1.53, 1.53); this.updateCamera(); e.preventDefault(); }
      if (e.key === '+' || e.key === '=') { this.zoom = clamp(this.zoom * 1.1, 0.45, 3.5); this.updateCamera(); }
      if (e.key === '-') { this.zoom = clamp(this.zoom / 1.1, 0.45, 3.5); this.updateCamera(); }
      if (e.key === '0') { this.setCameraPreset('iso'); }
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
      if (this.visible) {
        this.renderer.render(this.scene, this.camera);
        this.onFrame();
      }
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  renderOnce() {
    if (this.visible) {
      this.renderer.render(this.scene, this.camera);
      this.onFrame();
    }
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
