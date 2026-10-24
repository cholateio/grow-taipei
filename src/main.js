// 開機：之後各任務逐步把場景、介面、遊戲接上來。
import { createRenderer, pickQuality, CENTER } from './scene/renderer.js';
import { TIMES } from './scene/daynight.js';
import { createKit } from './scene/kit.js';
import { buildIsland, buildSatellite } from './scene/island.js';
import { SATELLITES } from './scene/hex.js';
import { buildTerrain } from './scene/terrain.js';
import { SimplexNoise } from '../vendor/three/addons/math/SimplexNoise.js';
import { mulberry32 } from './scene/random.js';
import { createPeople, ringPath, WALK_RADIUS } from './scene/people.js';
import { axialToWorld, cellTop } from './scene/hex.js';

const loading = document.getElementById('loading');
const params = new URLSearchParams(location.search);
try {
  if (params.get('simulateFail') === 'vendor') throw new Error('模擬 vendor 失敗');
  const THREE = await import('three');
  if (params.get('simulateFail') === 'webgl') throw new Error('瀏覽器不支援 WebGL');
  const quality = pickQuality(params.get('quality'), { width: innerWidth, mobile: /Mobi|Android/i.test(navigator.userAgent) });
  const view = createRenderer(THREE, { canvas: document.getElementById('c'), labelsEl: document.getElementById('labels'), quality });
  const kit = createKit(THREE);
  const island = buildIsland(THREE, kit);
  view.scene.add(island.group);
  for (const sat of SATELLITES) view.scene.add(buildSatellite(THREE, kit, sat, island.mats));
  view.scene.add(kit.build()); view.addGlow(kit.glowMaterials);
  const simplex = new SimplexNoise({ random: mulberry32(99) });
  const terrain = buildTerrain(THREE, { noise2: (x, z) => simplex.noise(x, z), quality });
  view.scene.add(terrain.group);
  const people = createPeople(THREE);
  view.scene.add(people.group);
  for (const cell of [[0, 0], [-1, 1], [1, 0]]) for (let k = 0; k < 2; k++) {
    const path = ringPath(axialToWorld(...cell), WALK_RADIUS, cellTop(cell));
    people.spawn({ path: k ? [...path].reverse() : path, speed: 0.32 + k * 0.06, accessory: k ? 'cap' : 'none' });
  }
  const setTime = minute => { const s = view.setTime(minute); terrain.setHorizon(s.horizon); return s; };
  setTime(TIMES[params.get('time')] ?? TIMES.day);
  view.resize(); addEventListener('resize', view.resize);
  view.camera.position.set(CENTER.x + 0.24 * 30, CENTER.y + 0.33 * 30, CENTER.z + 0.87 * 30);
  view.camera.lookAt(CENTER.x, CENTER.y, CENTER.z);
  const cam = params.get('cam')?.split(',').map(Number);   // 除錯：?cam=x,y,z,tx,ty,tz 拍特寫
  if (cam?.length === 6) { view.camera.position.set(cam[0], cam[1], cam[2]); view.camera.lookAt(cam[3], cam[4], cam[5]); }

  const clock = new THREE.Clock();
  view.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.08), t = clock.elapsedTime;
    view.water.update(t); terrain.update(t); people.update(dt, t, view.camera.position.length());
    view.render();
  });
  loading.hidden = true;
} catch (e) {
  loading.hidden = false;
  loading.textContent = `無法啟動 3D 畫面：${e.message}`;
  console.warn(e);
}
