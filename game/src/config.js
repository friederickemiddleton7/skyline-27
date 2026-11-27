// config.js — every tuning number, the palette and the mission table in one place.
// World units are feet. Headings are degrees clockwise from true north (+Y).

export const DEG = Math.PI / 180;
export const KT_TO_FPS = 1.6878;

export const VIEW = {
  fov: 68 * DEG,
  near: 14,
  far: 14000,
  cell: 180,
  cells: 21,          // 43 x 43 heightfield quads, centred on the aircraft
  chaseBack: 62,
  chaseUp: 19,
  chaseLag: 0.14,     // how slowly the chase camera follows a manoeuvre
};

export const PLANE = {
  stallSpeed: 58,
  cruiseSpeed: 142,
  maxSpeed: 215,
  minSpeed: 32,
  throttleAccel: 27,  // kt per second at full throttle
  dragK: 0.00092,
  gravitySink: 12.5,  // kt of speed traded for climb per second at full pitch
  pitchRate: 27,      // degrees per second of pitch input authority
  pitchDamp: 0.91,
  rollRate: 68,       // degrees per second target bank
  rollDamp: 0.86,
  turnK: 0.38,        // heading degrees/sec per degree of bank at cruise (~18°/s at 47° bank)
  gearDrag: 17,       // kt/s equivalent at full speed
  fuelIdle: 0.115,    // percent per second
  fuelThrottle: 0.30,
  sinkLimit: 9.5,     // ft/s maximum safe touchdown sink
  wingSpan: 38,
  length: 31,
};

// The airfield is at the origin. RWY 27 points west (heading 270).
export const RUNWAY = {
  cx: 0, cy: 0,
  heading: 270,
  length: 6400,
  width: 170,
  elev: 0,
  thresholdFromCentre: 3200,
  tower: { x: 3280, y: 520, h: 165 },
  hangars: [{ x: 2620, y: -620, w: 420, d: 260, h: 110 },
            { x: 3280, y: -760, w: 360, d: 240, h: 95 }],
};

// Five rings lead northeast out of the valley; the first two are used by the strike run.
export const RINGS = [
  { x: 5200, y: 1150, z: 1320, r: 185 },
  { x: 6350, y: 2600, z: 1620, r: 190 },
  { x: 7550, y: 4150, z: 1840, r: 180 },
  { x: 8770, y: 5450, z: 2260, r: 195 },
  { x: 10050, y: 6850, z: 2560, r: 245 },
];

export const LAKE = { x: -2050, y: 2450, r: 980, z: 24 };
export const TOWNS = [
  { x: 1650, y: -1920, r: 420 },
  { x: -2450, y: -1450, r: 360 },
  { x: 4800, y: -1600, r: 300 },
];

export const MISSIONS = [
  {
    id: 'rings', name: 'RING RUN', short: 'RING RUN', target: 5,
    brief: 'Five valley rings before the fuel runs dry.',
    start: { x: 4620, y: 620, z: 1090, hdg: 42, pitch: 2, speed: 138, gear: false, fuel: 100 },
  },
  {
    id: 'landing', name: 'PRECISION LANDING', short: 'LANDING', target: 1,
    brief: 'Gear down. RWY 27. Sink under 9 ft/s.',
    start: { x: 5500, y: 0, z: 940, hdg: 270, pitch: -2, speed: 143, gear: true, fuel: 100 },
  },
  {
    id: 'strike', name: 'STRIKE RUN', short: 'STRIKE RUN', target: 3,
    brief: 'Three rings, then come home to RWY 27.',
    start: { x: 4620, y: 620, z: 1090, hdg: 42, pitch: 2, speed: 145, gear: false, fuel: 100 },
  },
];

export const PALETTE = {
  skyTop: '#1d3f63',
  skyMid: '#4e7f9e',
  skyHaze: '#c9b28d',
  sun: '#ffe0a0',
  mountainFar: '#8196a0',
  mountainNear: '#63737a',
  groundHaze: '#b4a782',
  sand: '#cbb078',
  sandLow: '#b99a63',
  ochre: '#ad7b43',
  olive: '#7f8b55',
  rock: '#938a74',
  high: '#b7ab95',
  water: '#3f7185',
  waterLight: '#79a9b4',
  asphalt: '#333b43',
  asphaltEdge: '#59636a',
  paint: '#efe6cf',
  metal: '#d8d2c0',
  shadow: 'rgba(38,36,31,0.34)',
  hud: '#8ff2d4',
  hudDim: '#4c9e91',
  amber: '#ffbc55',
  danger: '#ff7a63',
  cockpit: '#2b3032',
};
