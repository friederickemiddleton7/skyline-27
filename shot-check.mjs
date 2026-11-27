// shot-check.mjs — verify the four screenshot setups place their key subject
// (runway / ring / aircraft) within the camera frustum at 1280x720.

import { buildShot } from './game/src/shots.js';
import { FlightCamera } from './game/src/camera.js';
import { RINGS, RUNWAY } from './game/src/config.js';

for (const name of ['approach', 'cockpit', 'ring', 'landing']) {
  const s = buildShot(name, 3, 0);
  const fc = new FlightCamera();
  fc.mode = s.mode;
  const cam = fc.update(s.ac, 0, 1280, 720, true);
  const inFrame = (p) => p && p.x > -100 && p.x < 1380 && p.y > -100 && p.y < 820;
  // RWY 27 points west: the approach threshold at the east end is x=+3200.
  const runwayNear = cam.project({ x: 3200, y: 0, z: 1 });
  const runwayFar = cam.project({ x: -3200, y: 0, z: 1 });
  const acProj = cam.project({ x: s.ac.x, y: s.ac.y, z: s.ac.z });
  const ring = s.mission.target ? cam.project({ x: s.mission.target.x, y: s.mission.target.y, z: s.mission.target.z }) : null;
  console.log(`${name}: mode=${s.mode} alt=${s.ac.z.toFixed(0)} spd=${s.ac.speed.toFixed(0)} hdg=${s.ac.hdg.toFixed(0)} fuel=${s.ac.fuel.toFixed(0)}% dmg=${s.ac.damage.toFixed(0)}%`);
  console.log(`  runway near ${runwayNear ? `${runwayNear.x.toFixed(0)},${runwayNear.y.toFixed(0)} d=${runwayNear.d.toFixed(0)}` : 'behind'} / far ${runwayFar ? `${runwayFar.x.toFixed(0)},${runwayFar.y.toFixed(0)}` : 'behind'}`);
  console.log(`  aircraft ${acProj ? `${acProj.x.toFixed(0)},${acProj.y.toFixed(0)} d=${acProj.d.toFixed(0)}` : 'behind'} | inFrame=${inFrame(acProj)}`);
  if (ring) console.log(`  target ring ${ring.x.toFixed(0)},${ring.y.toFixed(0)} d=${ring.d.toFixed(0)} inFrame=${inFrame(ring)} r=${s.mission.target.r}`);
}
