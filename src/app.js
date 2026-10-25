import * as THREE from '../vendor/three/three.module.js';
// 遊戲本體：場景 → 介面 → 導演 → 遊戲。由 main.js 動態載入，任何模組載入失敗都會落到 main.js 的錯誤畫面。
// ?auto=a,b,c 自動依序放（截圖用）、?time=、?quality=、?simulateFail=webgl、?cam=
import { createRenderer, pickQuality, CENTER } from './scene/renderer.js';
import { TIMES } from './scene/daynight.js';
import { createKit } from './scene/kit.js';
import { buildIsland, buildSatellite } from './scene/island.js';
import { SATELLITES } from './scene/hex.js';
import { buildTerrain } from './scene/terrain.js';
import { SimplexNoise } from '../vendor/three/addons/math/SimplexNoise.js';
import { mulberry32 } from './scene/random.js';
import { createPeople, ringPath, WALK_RADIUS } from './scene/people.js';
import { axialToWorld, cellTop, PLATEAU_CELLS, WATER_Y } from './scene/hex.js';
import { createAssets } from './scene/assets.js';
import { createCameraRig } from './scene/camera.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import * as spec from './rules/spec.js';
import * as engine from './rules/engine.js';
import * as endings from './rules/endings.js';
import { ICONS } from './ui/icons.js';
import { createSlots } from './ui/slots.js';
import { showHowTo, showEndCard, createTopBar } from './ui/cards.js';
import { storageGet, storageSet } from './ui/format.js';
import { createDirector } from './director.js';
import { createStage } from './actors/stage.js';
import * as landmarks from './actors/landmarks.js';
import * as tower from './actors/tower.js';
import * as milk from './actors/milk.js';
import * as baseball from './actors/baseball.js';
import * as chip from './actors/chip.js';
import * as rat from './actors/rat.js';
import * as bulb from './actors/bulb.js';
import * as token from './actors/token.js';
import * as boba from './actors/boba.js';
import { anchorWorld } from './actors/anchors.js';
import { createGame } from './game.js';

export async function start({ params, loading }) {

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
  // CC0 模型：台地北半側種樹（中央讓給火山與溫泉，主島其他格留給物品），海上兩艘船繞圈。載入失敗不擋開機。
  const assets = createAssets(THREE);
  const TREES = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_small'], LEAVES = [0x9bbd7e, 0x8aaf70, 0x6f9560];
  const trng = mulberry32(3), decor = new THREE.Group(); view.scene.add(decor);
  const boats = [];
  Promise.all([
    ...PLATEAU_CELLS.flatMap(cell => Array.from({ length: 3 }, (_, i) => {
      const c = axialToWorld(...cell), a = Math.PI * (1.15 + i * 0.35 + trng() * 0.15), d = 1.45 + trng() * 0.25;
      return assets.spawn(`kenney/nature/${TREES[Math.floor(trng() * TREES.length)]}.glb`, { x: c.x + Math.cos(a) * d, y: cellTop(cell), z: c.z + Math.sin(a) * d, h: 0.7 + trng() * 0.4, ry: trng() * 6, parent: decor, tint: { leaf: LEAVES[i % 3], bark: 0x9c7a4e } });
    })),
    ...['Boat', 'BoatWSail'].map((b, i) => assets.spawn(`quat/ships/${b}.glb`, { h: [0.35, 0.8][i], y: WATER_Y - 0.02, parent: decor }).then(m => boats.push({ m, r: 16.5 + i * 2.2, a: i * 2.6, s: 0.05 + i * 0.015 }))),
  ]).catch(e => console.warn('裝飾模型載入失敗', e));
  const setTime = minute => { const s = view.setTime(minute); terrain.setHorizon(s.horizon); return s; };
  setTime(TIMES[params.get('time')] ?? TIMES.day);
  // 鏡頭：OrbitControls（阻尼、禁平移、仰角 25°–70°、距離 3–70）+ 全景／飛行
  const controls = new OrbitControls(view.camera, view.renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, enablePan: false, minPolarAngle: 25 * Math.PI / 180, maxPolarAngle: 70 * Math.PI / 180, minDistance: 3, maxDistance: 70 });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const rig = createCameraRig({ THREE, camera: view.camera, controls, center: CENTER, reducedMotion: motion.matches });
  motion.addEventListener?.('change', e => rig.setReducedMotion(e.matches));
  view.renderer.domElement.addEventListener('pointerdown', () => rig.cancel());
  const fit = () => { view.resize(); rig.fit(innerWidth / innerHeight); };
  fit(); new ResizeObserver(fit).observe(document.body);
  const cam = params.get('cam')?.split(',').map(Number);   // 除錯：?cam=x,y,z,tx,ty,tz 拍特寫
  if (cam?.length === 6) { view.camera.position.set(cam[0], cam[1], cam[2]); controls.target.set(cam[3], cam[4], cam[5]); controls.update(); }

  // 介面、演員、導演、遊戲
  const auto = params.get('auto')?.split(',').filter(Boolean) ?? null;
  const uiRoot = document.getElementById('ui');
  const actors = createStage(THREE, { scene: view.scene, spec, modules: [landmarks, tower, milk, baseball, chip, rat, bulb, token, boba], ctx: { people, assets, glow: view.glow } });
  const director = createDirector({ onFocus: e => rig.focus(anchorWorld(e.delta?.target ?? e.item)), reducedMotion: motion.matches || !!auto });
  if (auto) rig.setReducedMotion(true);
  motion.addEventListener?.('change', e => director.setReducedMotion(e.matches || !!auto));
  const moodFor = lv => lv.bulb >= 4 ? TIMES.night : lv.bulb >= 3 ? TIMES.dusk : TIMES.day;
  let slots;
  const game = createGame({
    spec, engine, endings, director, actors,
    ui: { setLevel: (...a) => slots.setLevel(...a), setPlaced: id => slots.setPlaced(id), setBusy: f => slots.setBusy(f), reset: () => slots.reset() },
    onLevels: (lv, flags) => setTime(moodFor(lv, flags)),
    onFinished: (ending, state) => {
      setTime(TIMES.night);
      showEndCard(uiRoot, {
        title: ending.title, line: endings.ENDINGS[ending.id].line,
        levels: spec.ORDER.map(id => ({ name: spec.ITEMS[id].name, lv: state.lv[id], max: spec.ITEMS[id].max })),
        onRestart: restart,
      });
    },
  });
  function restart() { uiRoot.querySelector('.card.end')?.remove(); game.reset(); setTime(TIMES.day); rig.overview(); }
  const pick = async id => { if (await game.pick(id)) rig.overview(); };
  slots = createSlots(uiRoot, { items: spec.ORDER.map(id => ({ id, name: spec.ITEMS[id].name, icon: ICONS[id], max: spec.ITEMS[id].max })), onPick: pick });
  const howTo = () => showHowTo(uiRoot, { onClose: () => storageSet('grow-taipei:howto', '1') });
  createTopBar(uiRoot, { onReset: restart, onHowTo: howTo });
  // 演出中點畫面 = 跳過
  view.renderer.domElement.addEventListener('click', () => { if (director.busy) director.skip(); });
  if (!auto && !storageGet('grow-taipei:howto')) howTo();

  const clock = new THREE.Clock();
  view.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.08), t = clock.elapsedTime;
    rig.update(dt); view.water.update(t); terrain.update(t); people.update(dt, t, view.camera.position.length()); assets.update(dt); actors.update(dt, t);
    for (const b of boats) { b.a += dt * b.s; b.m.position.set(Math.cos(b.a) * b.r, WATER_Y - 0.02 + Math.sin(t * 2 + b.r) * 0.02, Math.sin(b.a) * b.r); b.m.rotation.y = -b.a; }
    view.render();
  });
  loading.hidden = true;
  if (auto) (async () => { for (const id of auto) await pick(id); })();
}
