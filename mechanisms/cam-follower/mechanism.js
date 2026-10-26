/* Cam and roller follower — the mechanism that turns steady rotation into a
   prescribed lift-dwell-fall motion law (507 Mechanical Movements #95).

   The cam outline is generated from the chosen motion law (Cycloidal, Harmonic,
   or Parabolic) by offsetting the pitch curve inward along its normal by the
   follower shoe radius. Both cam and follower sit in the same Z plane so the
   follower nose rides tangentially on the cam flank at every shaft angle.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid, boreOn } from '../../src/lib/kit.js';
import { camProfile, camLift, capsule, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'cam-follower',
  title: 'Cam and roller follower',
  movement: '507 Movements #95',
  motorMount: { partId: 'cam', label: 'Geared DC / stepper input shaft', direction: 'CW' },
  tagline: 'A cam is a motion law you can hold: its outline is the timing diagram wrapped around a shaft.',
  category: 'Rotary → timed lift',
  question: 'How can one steady rotation make a follower rise smoothly, dwell dead-still at the top, '
    + 'and return without a jolt — and what sets the limit on how steep that climb can be?',
  bigIdea: 'You do not draw a cam’s shape directly; you specify its timing law s(θ). Wrapping that law '
    + 'around a base circle gives the pitch curve, and pulling it inward by the follower radius gives the physical cam.',
  notes: [
    {
      h: 'Polar timing diagram',
      p: 'The <b>cam</b> rotates at constant speed ω while the <b>follower</b> is constrained by linear '
        + 'guides to translate along the <i>y</i>-axis. At any shaft angle θ, the follower shoe centre '
        + 'sits at height <i>y</i>(θ) = <i>R<sub>b</sub></i> + <i>s</i>(θ), where <i>R<sub>b</sub></i> '
        + 'is the base circle radius and <i>s</i>(θ) is the programmed lift.',
    },
    {
      h: 'Choosing the motion law: Cycloidal vs Harmonic vs Parabolic',
      p: 'To avoid infinite acceleration spikes (<i>jerk</i>) that cause vibration and wear, the transition '
        + 'from dwell to rise must be smooth. <b>Cycloidal</b> motion <i>s</i> = <i>L</i>(θ/β − sin(2πθ/β)/2π) '
        + 'has zero velocity and zero acceleration at both ends of the rise. <b>Harmonic</b> (cosine) '
        + 'has smooth velocity but a finite acceleration step at the dwell boundaries. <b>Parabolic</b> '
        + 'minimizes peak acceleration but reverses acceleration abruptly at mid-stroke.',
    },
    {
      h: 'Roller radius & undercutting',
      p: 'The physical cam contour is the envelope of circles of radius <i>r<sub>f</sub></i> centred on '
        + 'the pitch curve. Where the pitch curve is concave (near the start of a steep rise), if '
        + '<i>r<sub>f</sub></i> exceeds the minimum radius of curvature ρ<sub>min</sub>, the offset '
        + 'curve self-intersects (<i>undercutting</i>) and the follower can no longer track the law.',
    },
    {
      h: 'Form-closed vs force-closed followers',
      p: 'Because a cam can only push outward, keeping the follower in contact during the fall requires '
        + 'a return force — gravity, a return spring, or a grooved (form-closed) track. This kit uses '
        + 'an inline guided stem, a captive bridge keeper, and a compliant bow return spring.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — Cam and follower (#95)', url: 'https://507movements.com/mm_095.html' },
    { label: 'Cam follower motion laws — Wikipedia', url: 'https://en.wikipedia.org/wiki/Cam' },
  ],
  attribution: 'Cam and roller follower — co-planar cam and inline guided follower generated from true normal offset curves.',
  screenshot: { t: 75, azimuth: -0.58, elevation: 0.74 },
  order: 40,
};

export const params = [
  { key: 'lift', label: 'Lift (h)', min: 4, max: 14, step: 0.5, value: 8, unit: 'mm',
    help: 'Total vertical stroke of the follower above the base circle.' },
  { key: 'rise', label: 'Rise angle (β₁)', min: 60, max: 200, step: 10, value: 120, unit: '°',
    help: 'Shaft rotation spent climbing from base circle to full lift.' },
  { key: 'top', label: 'Top dwell (β₂)', min: 0, max: 140, step: 10, value: 60, unit: '°',
    help: 'Shaft angle during which the follower holds stationary at maximum lift.' },
  { key: 'roller', label: 'Follower nose Ø', min: 6, max: 16, step: 0.5, value: 10, unit: 'mm',
    help: 'Diameter of the rounded follower shoe. Larger noses reduce contact stress but risk undercutting.' },
  { key: 'law', label: 'Motion law', kind: 'choice', value: 'cycloidal',
    options: [
      { value: 'cycloidal', label: 'Cycloidal — zero end accel' },
      { value: 'harmonic', label: 'Harmonic — cosine curve' },
      { value: 'parabolic', label: 'Parabolic — constant accel' },
    ],
    help: 'Mathematical profile governing follower climb and descent.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const BASE_R = 18;
const CAM_T = KIT.bodyT;
const CAM_Y = -20; // shift cam toward -y so the whole machine is balanced around (0,0)

function geom(p) {
  const bottomDwell = 60;
  const fall = Math.max(40, 360 - p.rise - p.top - bottomDwell);
  const bottom = 360 - p.rise - p.top - fall;
  const lawParams = {
    lift: p.lift, rise: p.rise, top: p.top, fall, bottom, law: p.law,
  };
  const cam = camProfile({
    baseRadius: BASE_R,
    rollerRadius: p.roller / 2,
    ...lawParams,
    samples: 2,
  });

  const bore = boreOn(p.clearance);
  const shoeR = p.roller / 2;

  return {
    cam,
    lawParams,
    fall,
    bottom,
    bore,
    shoeR,
    camY: CAM_Y,
    pitch: (deg) => BASE_R + camLift(lawParams, deg),
    lift: (deg) => camLift(lawParams, deg),
  };
}

function followerOutline(shoeR, stemW = 9.2, stemLen = 46) {
  // Smooth stem along +y with a rounded shoe of radius shoeR at (0,0)
  // and a pointer cross-bar at y = 26 so lift is easy to read against the scale
  const hw = Math.min(shoeR, stemW / 2);
  const pts = [];
  const nArc = 24;
  // Bottom nose arc from +x around -y to -x
  for (let i = 0; i <= nArc; i++) {
    const a = -Math.PI * (i / nArc);
    pts.push([shoeR * Math.cos(a), shoeR * Math.sin(a)]);
  }
  // Left side up to top of stem, with a small pointer barb at y = 24..28
  pts.push([-shoeR, 2]);
  pts.push([-hw, 6]);
  pts.push([-hw, 23]);
  pts.push([-hw - 4.5, 25]);
  pts.push([-hw - 4.5, 27.5]);
  pts.push([-hw, 29.5]);
  pts.push([-hw, stemLen]);
  // Top flat
  pts.push([hw, stemLen]);
  // Right side down
  pts.push([hw, 29.5]);
  pts.push([hw + 4.5, 27.5]);
  pts.push([hw + 4.5, 25]);
  pts.push([hw, 23]);
  pts.push([hw, 6]);
  pts.push([shoeR, 2]);
  return pts;
}

function bowSpringOutline() {
  // Center shoe at y = 0..5.2 sits flush against the top of the follower stem (at y = 0),
  // while the two compliant bow arms curve out to x = ±24 mm to press against the guide cheeks.
  return [
    [-6.0, 0],
    [6.0, 0],
    [6.5, 2.2],
    [23.5, -3.5],
    [23.5, -0.5],
    [7.2, 5.8],
    [6.2, 9.8],
    [-6.2, 9.8],
    [-7.2, 5.8],
    [-23.5, -0.5],
    [-23.5, -3.5],
    [-6.5, 2.2],
  ];
}

export function build(p) {
  const g = geom(p);
  const plateT = KIT.plateT;
  const activeZ = plateT + KIT.hubT; // 5.6 mm: cam, follower & spring live in z = 5.6..11.6 mm
  const activeTop = activeZ + CAM_T;  // 11.6 mm

  const plateW = 148;
  const plateD = 168;
  const mounts = [
    [-plateW / 2 + 12, -plateD / 2 + 12],
    [plateW / 2 - 12, -plateD / 2 + 12],
    [-plateW / 2 + 12, plateD / 2 - 12],
    [plateW / 2 - 12, plateD / 2 - 12],
  ].map(([x, y]) => circle(x, y, 1.8, 20));

  // Lift ruler ticks beside the follower pointer
  const ticks = [];
  const pointerBaseY = CAM_Y + BASE_R + 26.25;
  for (let mm = 0; mm <= 16; mm += 2) {
    const major = mm % 4 === 0;
    ticks.push(rect(15, pointerBaseY + mm - 0.5, major ? 5.2 : 3.0, 1.0));
  }

  const stemHalf = Math.min(g.shoeR, 4.6);
  const cheekGap = stemHalf + 0.4;
  const cheekW = 6.5;
  const cheekY0 = CAM_Y + BASE_R + p.lift + 8;
  const cheekH = 30;
  // Base y of the top of the follower stem (when lift = 0): CAM_Y (-20) + BASE_R (18) + stemLen (46) = 44 mm
  const springBaseY = CAM_Y + BASE_R + 46;
  const springAnchorY = springBaseY + p.lift + 9.5;

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#ece6da',
    explosion: [0, 0, 0],
    note: 'baseplate with cam axle post, inline follower guide cheeks, spring stop and lift scale',
    solids: [
      slab({
        outer: roundedRect({ x: -plateW / 2, y: -plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }),
        holes: [...mounts, ...ticks],
        z: 0,
        h: plateT,
      }),
      // Left and right guide cheeks straddling the inline follower stem
      slab({
        outer: roundedRect({ x: -(cheekGap + cheekW), y: cheekY0, w: cheekW, h: cheekH, r: 2, n: 4 }),
        z: plateT,
        h: KIT.hubT + CAM_T + 1.2,
      }),
      slab({
        outer: roundedRect({ x: cheekGap, y: cheekY0, w: cheekW, h: cheekH, r: 2, n: 4 }),
        z: plateT,
        h: KIT.hubT + CAM_T + 1.2,
      }),
      // Cam shaft post at (0, CAM_Y)
      postSolid({ x: 0, y: CAM_Y, z0: plateT, h: activeTop - plateT + 2.2, r: POST_R }),
      // Top guide post for the return bow spring
      postSolid({ x: 0, y: springAnchorY, z0: plateT, h: activeTop - plateT + 2.2, r: 3.2 }),
    ],
  });

  // Cam with integral finger turning knob on the base-circle side
  const camPart = part({
    id: 'cam',
    name: 'Cam lobe',
    color: '#dcb038',
    layer: 1,
    explosion: [0, 0, 22],
    note: `base Ø${BASE_R * 2} mm, lift ${p.lift} mm, ${p.law} profile`,
    at: { x: 0, y: CAM_Y, z: plateT },
    solids: [
      slab({ outer: circle(0, 0, 9.8, 40), holes: [circle(0, 0, g.bore, 40)], z: 0, h: KIT.hubT }),
      slab({ outer: g.cam.outer, holes: [circle(0, 0, g.bore, 40)], z: KIT.hubT, h: CAM_T }),
    ],
  });

  // Co-planar inline follower: sits at activeZ = plateT + hubT so its nose rides directly on the cam flank
  const follower = part({
    id: 'follower',
    name: 'Inline follower',
    color: '#5aa2d4',
    layer: 1,
    explosion: [0, 12, 22],
    note: `Ø${p.roller} mm rounded nose + guided stem + lift pointer`,
    at: { x: 0, y: CAM_Y, z: plateT },
    solids: [
      // Sliding support pad under the stem
      slab({
        outer: roundedRect({ x: -stemHalf + 0.8, y: 12, w: (stemHalf - 0.8) * 2, h: 32, r: 1.8, n: 4 }),
        z: 0,
        h: KIT.hubT,
      }),
      slab({
        outer: followerOutline(g.shoeR, stemHalf * 2, 46),
        holes: [circle(0, 18, 2.0, 18), circle(0, 36, 2.0, 18)],
        z: KIT.hubT,
        h: CAM_T,
      }),
    ],
  });

  // Compliant bow return spring resting directly on top of the follower stem at y = springBaseY
  const spring = part({
    id: 'spring',
    name: 'Return bow spring',
    color: '#489e8b',
    layer: 1,
    explosion: [0, 22, 22],
    note: 'compliant flexure bow resting directly on the follower stem top to keep the nose pressed on the cam',
    at: { x: 0, y: springBaseY, z: plateT },
    solids: [
      slab({
        outer: roundedRect({ x: -5.2, y: 0.4, w: 10.4, h: 8.8, r: 2.0, n: 4 }),
        z: 0,
        h: KIT.hubT,
      }),
      slab({
        outer: bowSpringOutline(),
        holes: [circle(0, 5.2, 2.2, 20)],
        z: KIT.hubT,
        h: CAM_T,
      }),
    ],
  });

  const camCap = part({
    id: 'cam-cap',
    printId: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 2,
    explosion: [0, 0, 48],
    note: 'retains cam and return spring stop on their posts',
    at: { x: 0, y: CAM_Y, z: activeTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const springCap = part({
    id: 'spring-cap',
    printId: 'cap',
    name: 'Spring cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 2,
    explosion: [0, 0, 48],
    at: { x: 0, y: springAnchorY, z: activeTop },
    solids: [capSolid({ postR: 3.2, t: 3 })],
  });

  const minWall = g.cam.minRadius - g.bore;
  const checks = [
    {
      ok: !g.cam.undercut,
      text: g.cam.undercut
        ? `Undercut warning: Ø${p.roller} mm follower nose exceeds minimum concave curvature (${g.cam.tightest.toFixed(1)} mm). Reduce lift or widen rise angle.`
        : `Zero undercut — tightest pitch curvature ρ_min = ${g.cam.tightest.toFixed(1)} mm > ${(p.roller / 2).toFixed(1)} mm nose radius.`,
    },
    { ok: minWall > 4, text: `${minWall.toFixed(1)} mm minimum hub wall thickness between bore and cam flank.` },
    { ok: p.rise + p.top <= 290, text: `Rise ${p.rise}° + top dwell ${p.top}° leaves ${(360 - p.rise - p.top).toFixed(0)}° for return fall and base dwell.` },
    { ok: g.fall >= 60, text: `Return fall angle ${g.fall.toFixed(0)}° (≥ 60° prevents follower bounce on descent).` },
  ];

  return { parts: [frame, camPart, follower, spring, camCap, springCap], checks, g };
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  // Rotate cam by (90 - t)° so the cam profile at angle t points straight up (+y) at the inline follower
  const th = (90 - t) * DEG;
  const y = g.pitch(t);
  return {
    frame: {},
    cam: { rot: th },
    follower: { dx: 0, dy: y },
    'cam-cap': {},
    'spring-cap': {},
    spring: { dy: g.lift(t) },
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const deg = ((t % 360) + 360) % 360;
  const lift = g.lift(deg);
  const slope = (g.lift(deg + 1) - g.lift(deg - 1)) / 2;
  const curve = g.lift(deg + 1) - 2 * g.lift(deg) + g.lift(deg - 1);
  const lp = g.lawParams;
  const face = deg < lp.rise ? 'rise'
    : deg < lp.rise + lp.top ? 'top dwell'
      : deg < lp.rise + lp.top + lp.fall ? 'fall' : 'base dwell';
  return [
    { label: 'Shaft θ', value: Math.round(deg), unit: '°' },
    { label: 'Lift s(θ)', value: lift.toFixed(2), unit: 'mm' },
    { label: 'Phase', value: face },
    { label: 'Pitch R', value: (BASE_R + lift).toFixed(1), unit: 'mm' },
    { label: 'Velocity', value: slope.toFixed(2), unit: 'mm/°' },
    { label: 'Accel', value: curve.toFixed(3), unit: 'mm/°²' },
  ];
}

export const steps = [
  {
    title: 'Base dwell: zero lift on a constant radius',
    text: 'Over the bottom dwell arc, the cam presents its constant base radius R_b = 18 mm to the follower nose. The shaft turns freely while the follower remains completely stationary.',
    t: 320,
    parts: ['cam', 'follower'],
  },
  {
    title: 'The rise flank: converting angle into height',
    text: 'As the rise sector rotates under the nose, the cam radius grows according to the chosen motion law s(θ), pushing the inline follower upward between the guide cheeks.',
    t: 60,
    parts: ['cam', 'follower', 'frame'],
  },
  {
    title: 'Top dwell: holding full lift with zero motor effort',
    text: 'On the top dwell arc, the radius stays fixed at R_b + h. Because the normal force passes straight through the cam axle centre, the load exerts zero back-driving torque on the shaft.',
    t: 150,
    parts: ['follower', 'cam'],
  },
  {
    title: 'Compare Cycloidal vs Parabolic motion laws',
    text: 'Switch to the Parabolic law. Constant acceleration gives straighter flanks, but acceleration flips sign instantaneously at mid-lift, creating a mechanical jerk.',
    t: 60,
    parts: ['cam'],
    set: { law: 'parabolic' },
  },
  {
    title: 'Undercutting when the nose is too wide for the rise',
    text: 'Set follower nose Ø to 16 mm and shorten the rise to 60°. The concave flank radius drops below the nose radius and the audit flags an undercut.',
    t: 60,
    parts: ['follower', 'cam'],
    set: { roller: 16, rise: 60 },
  },
];
