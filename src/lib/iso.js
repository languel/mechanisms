/* iso.js — renders crisp hidden-line-removed technical illustrations using the
   teardown skill's TechnicalGeometry & TechnicalProjection engine.

   Used for catalogue card thumbnails, blueprint previews, and the no-WebGL
   fallback. Reads the exact same parts, pose and millimetres as the 3D stage
   and the STL export.
*/

import { renderTeardownSvg } from './teardown-bridge.js';

const DEG = Math.PI / 180;

/**
 * Draw the assembled (or exploded) machine as a Teardown technical SVG.
 *
 * @param {object[]} parts parts from a mechanism's build()
 * @param {object} pose per-part {rot, dx, dy, dz, hide}
 * @param {object} opts azimuth, elevation, width, maxHeight, background, hidden, hardware, explode, annotate, preset
 */
export function isoFigure(parts, pose = {}, opts = {}) {
  const {
    azimuth = -0.62,
    elevation = 0.72,
    width = 900,
    maxHeight = 700,
    background = '#fbf8f2',
    hidden = [],
    hardware = true,
    explode = 0,
    annotate = false,
    fill = true,
    hatch = false,
    prominentLines = true,
    preset = 'technical',
    sample = 0.09,
    title = 'Technical mechanism illustration',
  } = opts;

  const hiddenSet = new Set(hidden);
  const filteredParts = parts.filter((p) => !hiddenSet.has(p.id));

  // Convert radians camera angles (if small) to Teardown degrees camera
  const azDeg = Math.abs(azimuth) <= Math.PI * 2 ? (azimuth / DEG) - 90 : azimuth;
  const elDeg = Math.abs(elevation) <= Math.PI ? Math.max(-55, Math.min(55, (elevation / DEG) * 0.62)) : elevation;

  const res = renderTeardownSvg(filteredParts, pose, {
    explosion: explode,
    fitExplosion: explode,
    preset,
    fill,
    hatch,
    prominentLines,
    annotate,
    hardware,
    camera: { azimuth: azDeg, elevation: elDeg, roll: 0 },
    background,
    sample,
    title,
  });

  const [, , vbW, vbH] = res.viewBox;
  const scale = Math.min(width / (vbW || 1), maxHeight / (vbH || 1));
  const vw = Math.round(vbW * scale);
  const vh = Math.round(vbH * scale);

  const svg = res.svg.replace(
    'width="100%" height="100%"',
    `width="${vw}" height="${vh}"`,
  );

  return {
    svg,
    width: vw,
    height: vh,
    faces: filteredParts.reduce((a, p) => a + (p.solids?.length || 1), 0),
  };
}
