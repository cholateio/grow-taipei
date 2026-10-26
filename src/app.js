import * as THREE from '../vendor/three/three.module.js';
// 遊戲本體：場景 → 介面 → 演出層 → 遊戲。由 main.js 動態載入，任何模組載入失敗都會落到 main.js 的錯誤畫面。
// ?auto=a,b,c 自動依序放（截圖用；&live=1&warp=N 最後一個物品照常演 N 秒）、?time=、?quality=、?simulateFail=webgl、?cam=
import { createRenderer, pickQuality, CENTER } from './scene/renderer.js';
import { TIMES } from './scene/daynight.js';
import { createKit } from './scene/kit.js';
import { buildIsland } from './scene/island.js';
import { SATELLITES } from './scene/hex.js';
import { buildTerrain } from './scene/terrain.js';
import { SimplexNoise } from '../vendor/three/addons/math/SimplexNoise.js';
import { mulberry32 } from './scene/random.js';
import { createPeople, ringPath } from './scene/people.js';
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
import { createShow } from './show/index.js';
import * as landmarks from './actors/landmarks.js';
import * as tower from './actors/tower.js';
import * as milk from './actors/milk.js';
import * as baseball from './actors/baseball.js';
import * as chip from './actors/chip.js';
import * as rat from './actors/rat.js';
import * as bulb from './actors/bulb.js';
import * as token from './actors/token.js';
import * as boba from './actors/boba.js';
import * as typhoon from './actors/typhoon.js';
import * as satellites from './actors/satellites.js';
import { worldEffects, stepWorld } from './actors/world.js';
import { createGame } from './game.js';
import { createPathCursor } from './scene/path.js';

const zeroLevels = () => Object.fromEntries(spec.ORDER.map(id => [id, 0]));

export async function start({ params, loading }) {

  if (params.get('simulateFail') === 'webgl') throw new Error('瀏覽器不支援 WebGL');
  const quality = pickQuality(params.get('quality'), { width: innerWidth, mobile: /Mobi|Android/i.test(navigator.userAgent) });
  const view = createRenderer(THREE, { canvas: document.getElementById('c'), labelsEl: document.getElementById('labels'), quality });
  const kit = createKit(THREE);
  const island = buildIsland(THREE, kit, { satellites: SATELLITES });
  view.scene.add(island.group);
  view.scene.add(kit.build()); view.addGlow(kit.glowMaterials);
  const simplex = new SimplexNoise({ random: mulberry32(99) });
  const terrain = buildTerrain(THREE, { noise2: (x, z) => simplex.noise(x, z), quality });
  view.scene.add(terrain.group);
  const people = createPeople(THREE);
  view.scene.add(people.group);   // 島民六人是 landmarks.js 的名冊（演出層管）
  // CC0 模型：台地北半側種樹（中央讓給火山與溫泉，主島其他格留給物品）。海上的船是演員（satellites.js）。載入失敗不擋開機。
  const assets = createAssets(THREE);
  const TREES = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_small'], LEAVES = [0x9bbd7e, 0x8aaf70, 0x6f9560];
  const trng = mulberry32(3), decor = new THREE.Group(); view.scene.add(decor);
  Promise.all([
    ...PLATEAU_CELLS.flatMap(cell => Array.from({ length: 3 }, (_, i) => {
      const c = axialToWorld(...cell), a = Math.PI * (1.15 + i * 0.35 + trng() * 0.15), d = 1.45 + trng() * 0.25;
      return assets.spawn(`kenney/nature/${TREES[Math.floor(trng() * TREES.length)]}.glb`, { x: c.x + Math.cos(a) * d, y: cellTop(cell), z: c.z + Math.sin(a) * d, h: 0.7 + trng() * 0.4, ry: trng() * 6, parent: decor, tint: { leaf: LEAVES[i % 3], bark: 0x9c7a4e } });
    })),
  ]).catch(e => console.warn('裝飾模型載入失敗', e));
  // 一隻柴犬沿中心格的步道反向散步（純裝飾，§7.3）
  let shiba = null;
  const shibaPath = createPathCursor([...ringPath(axialToWorld(0, 0), 1.8, cellTop([0, 0]))].reverse());
  assets.spawn('quat/animals/ShibaInu.glb', { h: 0.22, anim: 'Walk', parent: decor }).then(m => { shiba = m; }).catch(e => console.warn('柴犬載入失敗', e));
  const setTime = minute => { const s = view.setTime(minute); terrain.setHorizon(s.horizon); return s; };
  setTime(TIMES[params.get('time')] ?? TIMES.day);
  // 鏡頭：OrbitControls（阻尼、禁平移、仰角 25°–70°、距離 3–70）+ 全景／飛行
  const controls = new OrbitControls(view.camera, view.renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, enablePan: false, minPolarAngle: 25 * Math.PI / 180, maxPolarAngle: 70 * Math.PI / 180, minDistance: 3, maxDistance: 70 });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const rig = createCameraRig({ THREE, camera: view.camera, controls, center: CENTER, reducedMotion: motion.matches });
  motion.addEventListener?.('change', e => rig.setReducedMotion(e.matches));
  view.renderer.domElement.addEventListener('pointerdown', () => rig.cancel()); // 停掉飛行（回全景的直接落地）並標記 grabbed：這回合不再自動 focus
  const fit = () => { view.resize(); rig.fit(innerWidth / innerHeight); };
  fit(); new ResizeObserver(fit).observe(document.body);
  const cam = params.get('cam')?.split(',').map(Number);   // 除錯：?cam=x,y,z,tx,ty,tz 拍特寫
  if (cam?.length === 6) { view.camera.position.set(cam[0], cam[1], cam[2]); controls.target.set(cam[3], cam[4], cam[5]); controls.update(); }

  // 介面、演出層、遊戲
  // ?auto 預設瞬間套用（截圖用）；加 &live=1 保留演出：前面的物品瞬間放好，最後一個照常演，&warp=N 先同步快轉 N 秒（每秒 30 格）
  const auto = params.get('auto')?.split(',').filter(Boolean) ?? null;
  const live = params.has('live');
  const instantAuto = () => !!auto && !live;
  const uiRoot = document.getElementById('ui');
  const weather = { rain: 0 }, rail = { offset: 0 };   // 雨的濃度（typhoon.js 的 rain 讀它）；列車時鐘偏移（讓列車從站出發）
  // 全島效果：燈泡推動時間、颱風登陸小人躲進室內、大停電熄燈。演出層的 world 拍設目標，每幀約 1 秒淡過去；
  // 跳過、reduced-motion、截圖、RESET 直接貼齊
  const showWorld = w => { setTime(w.time); people.group.visible = w.peopleVisible; view.glow.setScale(w.glowScale); view.water.setStorm(w.storm); weather.rain = w.rain; };
  let world = { ...worldEffects(zeroLevels(), {}), time: TIMES[params.get('time')] ?? TIMES.day }, worldTarget = world;
  const aimWorld = (w, instant) => { worldTarget = w; if (instant || motion.matches || instantAuto()) { world = w; showWorld(w); } };
  const show = createShow(THREE, {
    scene: view.scene, spec, modules: [landmarks, tower, milk, baseball, chip, rat, bulb, token, boba, typhoon, satellites],
    ctx: { people, assets, glow: view.glow, weather, rail }, rig,
    world: (effects, instant) => aimWorld({ ...worldTarget, ...effects }, instant),
    reducedMotion: motion.matches || instantAuto(),
    rnd: live ? mulberry32(21) : Math.random,   // ?live 截圖：散步點、停頓用固定種子，同一個 warp 每次拍到同一刻
  });
  if (auto) rig.setReducedMotion(true);
  motion.addEventListener?.('change', e => show.setReducedMotion(e.matches || instantAuto()));
  const applyWorld = (lv, flags, { instant = false } = {}) => aimWorld(worldEffects(lv, flags, show.stage.meta), instant);
  let slots;
  const game = createGame({
    spec, engine, endings, show,
    ui: { setLevel: (...a) => slots.setLevel(...a), setPlaced: id => slots.setPlaced(id), setBusy: f => slots.setBusy(f), reset: () => slots.reset() },
    onLevels: applyWorld,
    onFinished: (ending, state) => {
      aimWorld({ ...worldTarget, time: TIMES.night });
      showEndCard(uiRoot, { title: ending.title, line: endings.ENDINGS[ending.id].line, onRestart: restart });
    },
  });
  function restart() { uiRoot.querySelector('.card.end')?.remove(); game.reset(); applyWorld(game.state.lv, game.state.flags, { instant: true }); rig.home(0); }
  const pick = id => game.pick(id);
  slots = createSlots(uiRoot, { items: spec.ORDER.map(id => ({ id, name: spec.ITEMS[id].name, icon: ICONS[id], max: spec.ITEMS[id].max })), onPick: pick });
  const howTo = () => showHowTo(uiRoot, { onClose: () => storageSet('grow-taipei:howto', '1') });
  createTopBar(uiRoot, { onReset: restart, onHowTo: howTo });
  // 演出中點畫面 = 跳過
  view.renderer.domElement.addEventListener('click', () => { if (show.busy) show.skip(); });
  if (!auto && !storageGet('grow-taipei:howto')) howTo();

  const clock = new THREE.Clock();
  let autoDone = false, reported = false, elapsed = 0;
  const frame = dt => {
    const t = (elapsed += dt);
    const w = stepWorld(world, worldTarget, dt); if (w !== world) { world = w; showWorld(w); }
    rig.update(dt); view.water.update(t); terrain.update(t); people.update(dt, t, view.camera.position.length()); assets.update(dt); show.update(dt, t);
    if (shiba) { shibaPath.advance(dt * 0.3); const p = shibaPath.locate(); shiba.position.set(p.x, p.y, p.z); shiba.rotation.y = p.yaw; }
  };
  view.renderer.setAnimationLoop(() => {
    frame(Math.min(clock.getDelta(), 0.08));
    view.render();
    // 自動播放（截圖）演完後的第一幀回報 draw call，tools/shot.mjs 會印出來（§10 目標 ≤ 150）
    if (autoDone && !reported) { reported = true; console.warn(`[grow] calls=${view.renderer.info.render.calls} tris=${view.renderer.info.render.triangles}`); }
  });
  loading.hidden = true;
  if (auto) (async () => {
    if (live && auto.length) {
      // 前面的物品瞬間放好；最後一個照常演，同步快轉 warp 秒（截圖拍演出中的那一刻）
      show.setReducedMotion(true);
      for (const id of auto.slice(0, -1)) await pick(id);
      show.setReducedMotion(motion.matches);
      pick(auto.at(-1));
      for (let i = 0, n = Math.round((+params.get('warp') || 0) * 30); i < n; i++) frame(1 / 30);
    } else for (const id of auto) await pick(id);
    autoDone = true;
  })();
}
