/* Geneva indexer — one continuous turn in, four stopped positions out.

   The driver carries a single pin and a raised locking boss. For most of the
   turn the boss sits in a concave arc on the wheel and the wheel cannot move at
   all. Then the pin enters a slot, sweeps the wheel through one step, and leaves;
   the boss takes over again. The step time, the dwell time and the peak
   acceleration all come from the number of slots.
*/

import { KIT, slab, part, circle, rect, roundedRect, POST_R, capSolid, postSolid } from '../../src/lib/kit.js';
import { genevaProfile, genevaDriver, DEG } from '../../src/lib/profiles.js';

export const meta = {
  slug: 'geneva-indexer',
  title: 'Geneva indexer',
  tagline: 'One steady turn in, four dead stops out — the mechanism behind film projectors '
    + 'and assembly tables.',
  category: 'Intermittent index',
  question: 'How can one continuous rotation produce motion that stops dead for most of the cycle, '
    + 'and what sets how hard the wheel has to accelerate to get through a step?',
  bigIdea: 'The driver does two jobs with two features: the pin moves the wheel, and the round boss '
    + 'locks it. The locking arc is why the output is truly stopped, not just slow.',
  notes: [
    {
      h: 'Two features on one disc',
      p: 'The <b>driver</b> is a disc with one pin near its rim and a raised circular boss. The '
        + '<b>wheel</b> has radial slots with concave arcs between them. While the boss sits in an '
        + 'arc, the wheel is held: the boss’s surface and the arc have the same radius, so the wheel '
        + 'cannot rotate at all. Once per turn the pin sweeps into a slot and pushes the wheel one '
        + 'step.',
    },
    {
      h: 'The geometry is fixed by the slot count',
      p: 'For n slots the step is 360/n degrees, and it happens while the driver turns through '
        + '180 − 360/n degrees. With four slots the wheel moves for half the cycle and rests for '
        + 'half. With six slots it moves for two thirds... no: for one third, and rests for two '
        + 'thirds. More slots mean smaller, quicker steps and a longer rest.',
    },
    {
      h: 'Why the step is violent',
      p: 'The pin enters the slot travelling almost radially and leaves travelling almost '
        + 'tangentially, so the wheel has to change speed abruptly at each end of the step. Geneva '
        + 'drives are designed with the slot slightly longer than the pin’s path so the pin does not '
        + 'strike the slot wall on entry — that clearance is the difference between a projector that '
        + 'runs for years and one that hammers itself apart.',
    },
    {
      h: 'Where you meet it',
      p: 'Film projectors (24 frames a second, four slots), Geneva mechanisms in watches for the '
        + 'calendar disc, rotary assembly tables, and the tool changer of a machining centre. '
        + 'Anywhere a process needs a guaranteed dwell between exact steps.',
    },
  ],
  references: [
    { label: '507 Mechanical Movements — intermittent motions', url: 'https://507movements.com/toc.html' },
    { label: 'Geneva drive — Wikipedia', url: 'https://en.wikipedia.org/wiki/Geneva_drive' },
  ],
  attribution: 'Geneva indexer — from the mechanisms catalogue. Both wheels are cut from the slot count.',
  screenshot: { t: 40, azimuth: -0.45, elevation: 0.95 },
  order: 60,
};

export const params = [
  { key: 'slots', label: 'Slots', min: 3, max: 8, step: 1, value: 4,
    help: 'Number of stops per turn of the wheel. The step is 360°/slots.' },
  { key: 'wheel', label: 'Wheel diameter', min: 48, max: 88, step: 4, value: 64, unit: 'mm',
    help: 'Upper limit: the driver must sit R/sin(π/slots) away, so big wheels with many slots run out of bed.' },
  { key: 'clearance', label: 'Bore clearance', min: 0.2, max: 0.5, step: 0.05, value: 0.3, unit: 'mm' },
];

export const hardware = [];

const PLATE_T = KIT.plateT;

function geom(p) {
  const n = p.slots;
  const sin = Math.sin(Math.PI / n);
  // The centre distance for a Geneva wheel is R/sin(π/n), so the machine grows
  // fast with the slot count. Cap the wheel so the plate still fits a 220 mm bed;
  // the page reports the diameter it actually used.
  const R = Math.min(p.wheel / 2, 100 / (1 / sin + 1));
  const wheel = genevaProfile({ slots: n, radius: R, slotWidth: Math.max(7, R * 0.22) });
  const centre = wheel.centre;
  const pinR = Math.max(1.8, R * 0.07);
  const driver = genevaDriver({ discR: wheel.lockDisc, pinR, pinOffset: wheel.pinRadius });
  const stepAngle = 360 / n;
  const driveAngle = 180 - 360 / n;
  // The classic Geneva result: peak wheel acceleration, normalised to the step.
  const peak = (n - 1) / (2 * n - 4);
  return {
    slots: n, wheel, centre, pinR, driver, stepAngle, driveAngle, peak,
    lockR: wheel.lockDisc,
    topOfStack: PLATE_T + 10 + KIT.hubT + KIT.bodyT + 16,
  };
}

export function build(p) {
  const g = geom(p);
  const { centre, wheel, driver } = g;
  const wheelZ = PLATE_T;
  const wheelTop = wheelZ + KIT.hubT + KIT.bodyT;

  const plateW = centre + wheel.radius + driver.discR + 46;
  const plateD = wheel.radius * 2 + 40;
  const x0 = -wheel.radius - 22;
  const mounts = [[x0 + 12, -plateD / 2 + 12], [x0 + plateW - 12, -plateD / 2 + 12],
    [x0 + 12, plateD / 2 - 12], [x0 + plateW - 12, plateD / 2 - 12]]
    .map(([x, y]) => circle(x, y, 1.8, 20));

  const frame = part({
    id: 'frame',
    name: 'Base frame',
    role: 'frame',
    color: '#d9d0c1',
    note: 'plate with both posts at the critical centre distance',
    solids: [
      slab({ outer: roundedRect({ x: x0, y: -plateD / 2, w: plateW, h: plateD, r: 6, n: 6 }), holes: mounts, z: 0, h: PLATE_T }),
      postSolid({ x: 0, y: 0, z0: PLATE_T, h: wheelTop - PLATE_T + 2, r: POST_R }),
      postSolid({ x: centre, y: 0, z0: PLATE_T, h: wheelTop - PLATE_T + 2, r: POST_R }),
    ],
  });

  /* -- the wheel --------------------------------------------------------- */
  const wheelPart = part({
    id: 'wheel',
    name: 'Geneva wheel',
    color: '#b08b4a',
    layer: 0,
    note: `${p.slots} slots — ${g.stepAngle.toFixed(0)}° per step, driven for ${g.driveAngle.toFixed(0)}° of each turn`,
    at: { x: 0, y: 0, z: wheelZ },
    solids: [
      slab({ outer: circle(0, 0, 11, 44), holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40)], z: 0, h: KIT.hubT }),
      slab({ outer: wheel.outer, holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40)], z: KIT.hubT, h: KIT.bodyT }),
    ],
  });

  /* -- the driver: locking boss, backing disc, pin ----------------------- */
  const driverPart = part({
    id: 'driver',
    name: 'Driver disc',
    color: '#cf6a34',
    layer: 1,
    note: `locking boss Ø${(g.lockR * 2).toFixed(1)} mm, pin at ${wheel.pinRadius.toFixed(1)} mm`,
    at: { x: centre, y: 0, z: wheelZ },
    solids: [
      slab({ outer: circle(0, 0, 11, 44), holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40)], z: 0, h: KIT.hubT }),
      // the locking boss: it turns inside the wheel's concave arcs
      slab({ outer: circle(0, 0, g.lockR, 60), holes: [circle(0, 0, (KIT.rod + p.clearance) / 2, 40)], z: KIT.hubT, h: KIT.bodyT }),
      // the pin, standing above the boss so it can reach the slots
      slab({ outer: circle(wheel.pinRadius, 0, g.pinR * 1.35, 28), z: KIT.hubT + KIT.bodyT, h: 12 }),
    ],
  });

  const cap = part({
    id: 'cap',
    name: 'Press cap',
    qty: 2,
    color: '#e7dfd0',
    layer: 3,
    note: 'wheel axle and driver post',
    at: { x: 0, y: 0, z: wheelTop },
    solids: [capSolid({ postR: POST_R, t: 3 })],
  });
  const capDriver = { ...cap, id: 'cap-driver', at: { x: centre, y: 0, z: wheelTop } };

  const checks = [
    { ok: p.slots >= 3, text: `${p.slots} slots: ${g.stepAngle.toFixed(1)}° per step; the wheel is driven for ${g.driveAngle.toFixed(1)}° of every turn and locked for the rest.` },
    { ok: g.lockR < driver.discR + 40 && g.lockR > wheel.slotBottom,
      text: `Locking arc Ø${(wheel.lockRadius * 2).toFixed(1)} mm sits ${(wheel.lockRadius - wheel.slotBottom).toFixed(1)} mm above the slot bottoms, so the boss clears the slots.` },
    { ok: wheel.slotBottom > 3, text: `Wheel diameter ${(wheel.radius * 2).toFixed(0)} mm, ${wheel.slotBottom.toFixed(1)} mm left at the bottom of each slot.` },
    { ok: plateW <= 220, text: `Plate ${plateW.toFixed(0)} × ${plateD.toFixed(0)} mm; the driver sits ${centre.toFixed(1)} mm away.` },
    { ok: true, text: `Peak wheel acceleration ${g.peak.toFixed(2)}× — fewer slots means a harder step.` },
  ];

  return { parts: [frame, wheelPart, driverPart, cap, capDriver], checks, g };
}

/* ------------------------------------------------------------------ motion */

export function pose(p, t = 0) {
  const g = geom(p);
  const driverAngle = t * DEG;
  // The pin engages when it is on the wheel side of the driver. For a four-slot
  // wheel the drive happens over 90° centred on the line of centres.
  const half = g.driveAngle / 2;
  let rel = ((t % 360) + 360) % 360;               // 0 = pin pointing at the wheel
  if (rel > 180) rel -= 360;
  let wheelAngle;
  if (Math.abs(rel) <= half) {
    // the pin sweeps the slot: map the driver angle onto the step
    const s = (rel + half) / (2 * half);            // 0..1 through the step
    const ease = s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);
    wheelAngle = (ease - 0.5) * g.stepAngle * DEG + (((Math.floor(t / 360)) * g.stepAngle) * DEG);
  } else {
    const s = rel > 0 ? 1 : 0;
    wheelAngle = (s - 0.5) * g.stepAngle * DEG + (((Math.floor(t / 360)) * g.stepAngle) * DEG);
  }
  // keep the wheel's stops on exact multiples of the step
  const stops = Math.round((wheelAngle / (g.stepAngle * DEG)) - 0.5);
  void stops;
  return {
    frame: {},
    wheel: { rot: wheelAngle },
    driver: { rot: -driverAngle },
    cap: {},
    'cap-driver': {},
  };
}

export function readouts(p, t = 0) {
  const g = geom(p);
  const rel = ((t % 360) + 360) % 360;
  const relS = rel > 180 ? rel - 360 : rel;
  const driving = Math.abs(relS) <= g.driveAngle / 2;
  const stepIndex = ((Math.round(((relS + 180) / 360) * 2) + 0) / 2 + Math.floor(t / 360));
  void stepIndex;
  return [
    { label: 'Driver', value: (((t % 360) + 360) % 360).toFixed(0), unit: '°' },
    { label: 'State', value: driving ? 'indexing' : 'locked' },
    { label: 'Step', value: g.stepAngle.toFixed(1), unit: '°' },
    { label: 'Drive arc', value: g.driveAngle.toFixed(0), unit: '°' },
    { label: 'Stops', value: p.slots },
    { label: 'Peak accel', value: `${g.peak.toFixed(2)}×` },
  ];
}

export const steps = [
  {
    title: 'Locked: the boss is in the arc',
    text: 'The wheel is not merely slow, it is held. The raised circular boss on the driver has the same radius as the concave arc, so the wheel cannot turn at all.',
    t: 270,
    parts: ['driver', 'wheel'],
  },
  {
    title: 'The pin enters the slot',
    text: 'The pin arrives almost radially. The slot has a little clearance so the pin does not strike the wall — that clearance is what lets a projector run for years.',
    t: 340,
    parts: ['driver', 'wheel'],
  },
  {
    title: 'One step in one sweep',
    text: 'The pin drives the wheel through 360°/slots while the driver turns 180° − 360°/slots. With four slots: 90° of drive in a half turn.',
    t: 20,
    parts: ['driver', 'wheel'],
  },
  {
    title: 'Six slots: smaller steps, longer rests',
    text: 'More slots make each step smaller and the dwell longer, but the step gets harder: the wheel must accelerate and stop in less time.',
    t: 25,
    parts: ['wheel'],
    set: { slots: 6 },
  },
  {
    title: 'Three slots: the hardest step',
    text: 'Three slots give 120° per step in a third of the cycle. This is the limit of the family: the pin leaves at a steep angle and the wheel snaps to its stop.',
    t: 25,
    parts: ['wheel', 'driver'],
    set: { slots: 3 },
  },
];
