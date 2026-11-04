// test/finale.test.js：最終章（計畫 5；選擇帶動升級改版）——隕石警告、隕石（程式識別字沿用 missile）、尾聲。
// 修正批次 trim §C（2026-11-01，協調者裁決）：飛彈從海的那一頭飛來打 101 容易被讀成兩岸軍事威脅（政治風險），換成天外隕石——從天上掉下來、沒有方向、沒有國家
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import * as THREE from '../vendor/three/three.module.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createCameraRig, OVERVIEW_DIR } from '../src/scene/camera.js';
import { WARNING } from '../src/game.js';
import { headlessShow, turnSteps, overviewRig, ALL } from './helpers/show.js';
import { EXAMPLE } from './helpers/endings.js';
import { islanders } from '../src/show/crowd.js';
import * as beatsMod from '../src/show/beats.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
// ── 隕石警告（選擇帶動升級 §4；原本倒數 3 的宣告）──
const finale = ALL.find(m => m.id === 'finale');
const tower = ALL.find(m => m.id === 'tower');
const everyone = show => show.roster.keys().flatMap(k => show.roster.members(k));
// 正在被劇本點名看東西的人（gesture 演完會留在 walker 上一直朝那邊，所以只算被 claim 走的）
const looking = show => everyone(show).filter(m => m.mode === 'script' && m.walker?.gesture?.kind === 'look');
// 第一條正解放完八個（最後一輪之前）：島上有島民
async function placedShow() {
  const h = await headlessShow(), order = SOLUTIONS[0];
  let s = createState(spec);
  for (const step of turnSteps(order).slice(0, order.length)) {
    const r = step(s); s = r.state;
    await h.run([...r.events, { kind: 'settle' }], { instant: true });
  }
  return h;
}

const TOWER0 = anchorWorld('tower');
// 隕石警告（trim §C）：天上一顆越來越亮的橘紅光點（finale.star）——高空 y ≈ 14、101 正上方偏北；發光球＋一條往外（離開 101 那頭）拖長的淡光尾；
// 脈動照舊 FLARE_HZ；海平面的紅光柱（finale.flare、FLARE_AT）拿掉了
test('view: alarm draws finale.star high above 101 (slightly north), a glowing orb with a long faint tail pointing away from 101, brightening and pulsing at FLARE_HZ 2; the meteor puts it out; no sea flare', () => {
  const lv = {}, v = finale.view(lv, { alarm: 1 }), f = v['finale.star'], S = finale.STAR_AT;
  assert.ok(f, 'alarm 1 (WARNING) draws the star'); assert.equal(v['finale.flare'], undefined, 'no sea flare');
  assert.equal('FLARE_AT' in finale, false); assert.equal(f.kind, 'star'); assert.deepEqual(f.at, S);
  assert.equal(f.shadow, false); assert.equal(f.footprint, false);
  assert.ok(S.y >= 13 && S.y <= 15, `high in the sky (y ${S.y})`);
  assert.ok(Math.abs(S.x - TOWER0.x) < 1e-9 && TOWER0.z - S.z >= 2 && TOWER0.z - S.z <= 6, `above 101, a little north (${(TOWER0.z - S.z).toFixed(2)})`);
  assert.deepEqual(finale.view(lv, {}), {});
  for (const missile of ['shield', 'deflect', 'hit']) assert.ok(!finale.view(lv, { alarm: 1, missile })['finale.star'], `meteor ${missile} puts the star out`);
  assert.equal('flareHz' in finale, false, 'no per-countdown frequency any more');
  assert.equal(finale.FLARE_HZ, 2);
  const glow = createGlowRegistry();
  const pf = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders });
  const part = pf.build(f);
  const orb = part.object.getObjectByName('orb'), tail = part.object.getObjectByName('tail');
  assert.ok(orb && tail, 'orb and tail');
  const c = new THREE.Color(finale.STAR_COLOR); assert.ok(c.r > c.g && c.g > c.b && c.r > 0.9, 'orange-red');
  assert.equal(orb.material.color.getHex(), finale.STAR_COLOR); assert.equal(orb.material.emissive.getHex(), finale.STAR_COLOR);
  assert.ok(tail.material.transparent && tail.material.opacity < 1 && !tail.material.depthWrite, 'faint tail');
  part.object.position.set(S.x, S.y, S.z); part.object.updateMatrixWorld(true);
  tail.geometry.computeBoundingBox(); const bb = tail.geometry.boundingBox.clone().applyMatrix4(tail.matrixWorld), mid = bb.getCenter(new THREE.Vector3());
  const away = new THREE.Vector3(S.x - TOWER0.x, S.y - TOWER0.y, S.z - TOWER0.z).normalize(), toMid = mid.clone().sub(new THREE.Vector3(S.x, S.y, S.z));
  assert.ok(toMid.length() >= 1 && toMid.normalize().dot(away) > 0.95, `the tail trails away from 101 (dot ${toMid.normalize().dot(away).toFixed(3)})`);
  assert.ok(bb.getSize(new THREE.Vector3()).length() >= 2.5, 'a long tail');
  part.object.traverse(o => { if (o.isMesh) assert.ok(!o.castShadow, 'no shadow'); });
  // 越來越亮：建好後 STAR_RAMP 秒內亮度往上爬，之後固定 FLARE_HZ 脈動（週期 1/hz 回到同一個強度）
  const m = part.materials[0], hz = finale.FLARE_HZ, at = dt => { part.update(dt, 0); return m.emissiveIntensity; };
  const early = at(0.25 / hz);   // 脈動的波峰
  at(finale.STAR_RAMP + 1 / hz);   // 走到 ramp 之後的同一個相位（波峰）
  const peak = m.emissiveIntensity;
  assert.ok(peak > early * 1.3, `brightens (${early.toFixed(2)} → ${peak.toFixed(2)})`);
  const a = at(0.5 / hz), b = at(0.5 / hz);
  assert.ok(Math.abs(a - peak) > 0.3, `pulses at ${hz} Hz`); assert.ok(Math.abs(b - peak) < 1e-9, `period 1/${hz} s`);
  assert.ok(Math.min(early, a) > 0, 'glows in daylight');
  part.dispose();
});
// 計畫 13 §設計 5（使用者 2026-11-01「飛彈發射過來前的警告請優化呈現方式」）：101 頂上一顆紅色警示燈（finale.beacon）＋一道扁平紅光束繞 y 轉、
// 每秒一圈，亮度跟光點同一個 FLARE_HZ 脈動；alarm 時才有、隕石一落下就熄（同 finale.star）。站在這一階段的塔尖上 0.15
// （計畫寫 headOf + 0.15：headOf 是泡泡的位置、比塔尖高 0.6，燈會飄在半空）
test('view: alarm puts finale.beacon on the 101 spire (a red lamp + a flat red beam sweeping 1 rev/s, pulsing at FLARE_HZ, lit by day); the meteor puts it out', async () => {
  const { body, stageOfView } = await import('../src/actors/tower.js'), { anchorWorld: aw } = await import('../src/actors/anchors.js');
  const LIT = { milk: 10, baseball: 8, token: 10, rat: 4, boba: 6, typhoon: 3, chip: 9, bulb: 9 }, LIT_META = { total: 59 }, TOWER_AT = aw('tower');
  for (const [lv, meta] of [[LIT, LIT_META], [{ milk: 3, chip: 2 }, {}]]) {
    const b = finale.view(lv, { alarm: 1 }, meta)['finale.beacon'], top = body(stageOfView(lv, meta)).top;
    assert.ok(b, 'alarm draws the beacon'); assert.equal(b.kind, 'beacon'); assert.equal(b.footprint, false); assert.equal(b.shadow, false);
    assert.ok(Math.abs(b.at.x - TOWER_AT.x) < 1e-9 && Math.abs(b.at.z - TOWER_AT.z) < 1e-9 && Math.abs(b.at.y - (TOWER_AT.y + top + 0.15)) < 1e-9, 'on the spire');
    for (const missile of ['shield', 'deflect', 'hit']) assert.ok(!finale.view(lv, { alarm: 1, missile }, meta)['finale.beacon'], `missile ${missile} puts it out`);
  }
  assert.ok(!finale.view(LIT, {}, LIT_META)['finale.beacon'], 'no alarm, no beacon');
  const glow = createGlowRegistry(), part = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders }).build(finale.view(LIT, { alarm: 1 }, LIT_META)['finale.beacon']);
  const lamp = part.object.getObjectByName('lamp'), beam = part.object.getObjectByName('beam');
  assert.ok(lamp && beam, 'lamp and beam');
  assert.equal(lamp.material.emissive.getHex(), 0xe8322e); assert.ok(beam.material.transparent && !beam.material.depthWrite);
  part.object.traverse(o => { if (o.isMesh) assert.ok(!o.castShadow, 'no shadow'); });
  // 光束長 3、從球心往外（水平）、扁平
  beam.geometry.computeBoundingBox(); const bb = beam.geometry.boundingBox;
  assert.ok(Math.abs(bb.max.x - 3) < 0.05 && bb.min.x > -0.05, `beam 3 long from the lamp (${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)})`);
  // 修正輪 1（審稿 Important）：球心那端細、往外張開（以前畫反了，靠燈那端比燈球還大，像一面三角旗）
  const halfAt = x0 => { const p = beam.geometry.attributes.position; let w = 0; for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - x0) < 0.05) w = Math.max(w, Math.abs(p.getZ(i))); return w; };
  assert.ok(halfAt(3) > halfAt(0) * 4 && halfAt(0) < 0.05, `narrow at the lamp (${halfAt(0).toFixed(3)}), wide 3 m out (${halfAt(3).toFixed(3)})`);
  assert.ok(bb.max.y - bb.min.y < (bb.max.z - bb.min.z) * 0.6, 'flat');
  const yawAt = t => { part.update(0.1, t); return beam.rotation.y; }, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  assert.ok(Math.abs(wrap(yawAt(0.25) - yawAt(0) - Math.PI / 2)) < 1e-9, 'quarter turn in 0.25 s');
  const hz = finale.FLARE_HZ, op = t => { part.update(0.1, t); return beam.material.opacity; }, li = t => { part.update(0.1, t); return lamp.material.emissiveIntensity; };
  assert.ok(Math.abs(op(0.1 / hz) - op(0.6 / hz)) > 0.15 && Math.abs(op(0.1 / hz) - op(1.1 / hz)) < 1e-9, `beam pulses at ${hz} Hz`);
  assert.ok(Math.min(li(0.1 / hz), li(0.6 / hz)) > 0, 'lamp lit in daylight');
  part.dispose();
});
// 警告（計畫 13 §設計 5；trim §C 改天上的光點）：光點＋警示燈 → 鏡頭抬頭看天（101 頭頂與光點的中點，zoom SKY_ZOOM，FOCUS_BEAT）、停 SKY_HOLD →
// 鏡頭退到 WIDE（島＋101＋上方天空，隕石落下時看得到）同時全島抬頭看光點 1.2 s → 同一批人喊「！」、蹲下護頭（duck）0.8 s → 放人
test('warning beats: apply star + beacon while the camera looks up at the sky over 101, hold, then the wide framing while everyone looks up, ！ + duck 0.8 s, release', () => {
  const { B, GESTURE_DUR } = beatsMod, ctx = { B, roster: { members: () => [], keys: () => [] } };
  const beats = finale.script.warning(WARNING, { lv: {}, flags: {} }, ctx);
  assert.deepEqual(beats.map(b => b.kind), ['together', 'wait', 'together', 'together', 'home']);
  const [lit, toSky] = beats[0].beats;
  assert.equal(lit.kind, 'apply'); assert.deepEqual(lit.only, ['finale.star', 'finale.beacon']);
  const head = { x: 0.6, y: 8.35, z: -0.3 }, S = finale.STAR_AT;
  assert.equal(toSky.kind, 'focus'); assert.deepEqual(toSky.target({ stage: { headOf: id => (id === 'tower' ? head : null) } }), { x: (head.x + S.x) / 2, y: (head.y + S.y) / 2, z: (head.z + S.z) / 2 }, 'aims half way between the 101 head and the star');
  assert.equal(toSky.dur, 0.8); assert.equal(beats[1].dur, finale.SKY_HOLD); assert.ok(finale.SKY_HOLD >= 0.3 && finale.SKY_HOLD <= 0.6);
  const wide = beats[2].beats.find(b => b.kind === 'focus'); assert.deepEqual(wide.target, finale.WIDE);
  const looks = beats[2].beats.filter(b => b.kind === 'gesture');
  assert.ok(looks.length === 24 && looks.every(b => b.dur === 1.2), 'look 1.2 s');
  const duck = beats[3].beats.filter(b => b.kind === 'gesture'), shout = beats[3].beats.filter(b => b.kind === 'bubble');
  assert.equal(duck.length, 24); assert.ok(duck.every(b => b.dur === 0.8), 'duck 0.8 s each'); assert.equal(finale.DUCK, 0.8);
  assert.equal(shout.length, 24); assert.ok(shout.every(b => b.dur === 0.8), '！ 0.8 s each');
  assert.equal(GESTURE_DUR.duck, 1.0);
});
test('warning live: the star and the beacon blink in, the camera looks up at the sky over 101 first, visible islanders look at STAR_AT and say ！, then duck 0.8 s, everyone released; ≤ 4.5 s', async () => {
  const { show, run, bubblesLog, rig } = await placedShow();
  const at = finale.STAR_AT, n0 = bubblesLog.length, crowdSize = Math.min(24, islanders({ roster: show.roster }).length), r0 = rig.log.length;
  assert.ok(crowdSize >= 6, `islanders on the island (${crowdSize})`);
  let lookers = 0, starAt = null, lookFrom = null, lookTo = null, duckers = new Set(), duckFrom = null, duckTo = null, lookedFirst = true;
  const lookedAt = new Set();
  const durs = [], showBubble = show.bubbles.show;
  show.bubbles.show = (head, kind, dur) => { durs.push([kind, dur]); return showBubble(head, kind, dur); };
  const update = show.update.bind(show);
  show.update = (dt, t) => {
    update(dt, t);
    const look = looking(show);
    if (look.length) { lookFrom ??= show.elapsed - dt; lookTo = show.elapsed; }
    for (const m of look) assert.ok(Math.abs(m.walker.gesture.yaw - Math.atan2(at.x - m.pos.x, at.z - m.pos.z)) < 1e-9, 'faces the star');
    lookers = Math.max(lookers, look.length); for (const m of look) lookedAt.add(m);
    const duck = everyone(show).filter(m => m.mode === 'script' && m.walker?.gesture?.kind === 'duck');
    if (duck.length) { duckFrom ??= show.elapsed - dt; duckTo = show.elapsed; }
    for (const m of duck) { duckers.add(m); if (!lookedAt.has(m)) lookedFirst = false; }
    if (starAt === null && show.stage.partKeys().includes('finale.star')) starAt = show.elapsed;
  };
  await run([WARNING], { finale: true });
  show.update = update;
  assert.ok(starAt !== null, 'the star appears'); assert.ok(show.stage.partKeys().includes('finale.star'), 'and stays');
  assert.ok(!show.stage.partKeys().includes('finale.flare'), 'no sea flare');
  assert.ok(show.stage.partKeys().includes('finale.beacon'), 'the beacon on 101');
  const focus = rig.log.slice(r0).filter(x => x[0] === 'focus'), tw = show.stage.headOf('tower');
  const mid = { x: (tw.x + at.x) / 2, y: (tw.y + at.y) / 2, z: (tw.z + at.z) / 2 };
  assert.ok(focus[0] && Math.hypot(focus[0][1].x - mid.x, focus[0][1].y - mid.y, focus[0][1].z - mid.z) < 1e-6 && focus[0][2].zoom === finale.SKY_ZOOM, `the camera looks up first (${JSON.stringify(focus[0]?.[1])})`);
  assert.ok(focus[1] && focus[1][1] === finale.WIDE && focus[1][2].zoom === finale.WIDE_ZOOM, 'then the wide framing');
  assert.equal(duckers.size, crowdSize, 'everyone who looked ducks'); assert.ok(lookedFirst, 'the same people: look first, then duck');
  assert.ok(Math.abs(duckTo - duckFrom - 0.8) <= 2 / 30, `duck 0.8 s (${(duckTo - duckFrom).toFixed(2)})`);
  assert.ok(lookTo <= duckFrom + 1e-9, 'duck after the look');
  assert.equal(show.stage.flags.alarm, 1);
  assert.equal(lookers, crowdSize, 'everyone (≤ 24) looks at the star');
  const said = bubblesLog.slice(n0);
  assert.equal(said.filter(b => b.kind === '！').length, crowdSize, 'each looker says ！');
  assert.deepEqual(said.filter(b => /^\d$/.test(b.kind)), [], 'no countdown digit');
  assert.ok(Math.abs(lookTo - lookFrom - finale.LOOK) <= 2 / 30, `the look lasts ${finale.LOOK} s real (${(lookTo - lookFrom).toFixed(2)})`);
  const shouts = durs.filter(([k]) => k === '！');
  assert.equal(shouts.length, crowdSize);
  for (const [, d] of shouts) assert.ok(Math.abs(d - finale.SHOUT) < 1e-9, `！ ${finale.SHOUT} s real (${d})`);
  assert.equal(finale.LOOK, 1.2); assert.equal(finale.SHOUT, 0.8);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  assert.ok(show.elapsed <= 4.5, `≤ 4.5 s real (${show.elapsed.toFixed(2)})`);
});
// 跳過（instant，reduced motion／玩家按跳過）：警告照樣把旗標、光點套上，沒有人留在劇本手上
test('warning skipped (instant): alarm 1, the star is there, nobody left in script mode', async () => {
  const { show, run } = await placedShow();
  await run([WARNING], { finale: true, instant: true });
  assert.equal(show.stage.flags.alarm, 1);
  assert.ok(show.stage.partKeys().includes('finale.star'), 'the star is there');
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'nobody in script mode');
});

// 全景（16:9）只框到 101 頭頂上一點點、天空整片出畫——光點要等鏡頭抬頭（天空鏡頭）才看得到；隕石落下時鏡頭在 WIDE：
// 島（主島格的四角）、101 全在畫面裡，光點到罩面那條落下的路線大半在畫面裡（直式整條都在）
const framed = (aspect, sky, target, zoom) => {
  const camera = new THREE.PerspectiveCamera(32, aspect, 0.3, 320), controls = { target: new THREE.Vector3(), update() { camera.lookAt(controls.target); } };
  const rig = createCameraRig({ THREE, camera, controls }); rig.fit(aspect); rig.setSkyline(sky); rig.update(5);
  if (target) { rig.focus(target, { zoom, ms: 1 }); for (let i = 0; i < 10; i++) rig.update(0.5); }
  camera.lookAt(controls.target); camera.updateMatrixWorld();
  return p => new THREE.Vector3(p.x, p.y, p.z).project(camera);
};
test('STAR_AT shows inside NDC ±0.9 in the warning sky shot (16:9 and 390×844; lit and site skylines) with the 101 head; the WIDE framing keeps the island in frame and most of the fall', async () => {
  const { MAIN_CELLS, axialToWorld } = await import('../src/scene/hex.js'), S = finale.STAR_AT;
  const lv = { milk: 10, baseball: 8, token: 10, rat: 4, boba: 6, typhoon: 3, chip: 9, bulb: 9 };
  const main = tower.view(lv, {}, { total: 59 })['tower.main'], lit = main.at.y + main.labelY;
  for (const head of [lit, 3]) for (const [name, a] of [['16:9', 16 / 9], ['390×844', 390 / 844]]) {
    const h = { x: TOWER0.x, y: head, z: TOWER0.z }, mid = { x: (h.x + S.x) / 2, y: (h.y + S.y) / 2, z: (h.z + S.z) / 2 };
    const pr = framed(a, head, mid, finale.SKY_ZOOM);
    for (const [what, p] of [['star', S], ['101 head', h]]) { const n = pr(p); assert.ok(Math.abs(n.x) <= 0.9 && Math.abs(n.y) <= 0.9 && n.z < 1, `${name} skyline ${head.toFixed(1)}: ${what} NDC (${n.x.toFixed(2)}, ${n.y.toFixed(2)})`); }
  }
  const corners = MAIN_CELLS.flatMap(c => { const p = axialToWorld(...c); return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, w]) => ({ x: p.x + u * 1.3, y: 1.3, z: p.z + w * 1.3 })); });
  const dome = finale.view(lv, { missile: 'shield' }, { total: 59 })['finale.missile'].at;
  for (const [name, a, part] of [['16:9', 16 / 9, 0.7], ['390×844', 390 / 844, 1]]) {
    const pr = framed(a, lit, finale.WIDE, finale.WIDE_ZOOM);
    for (const p of corners) { const n = pr(p); assert.ok(Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1, `${name} WIDE: island corner (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) NDC (${n.x.toFixed(2)}, ${n.y.toFixed(2)})`); }
    let inside = 0; for (let i = 0; i <= 50; i++) { const k = i / 50, n = pr({ x: S.x + (dome.x - S.x) * k, y: S.y + (dome.y - S.y) * k, z: S.z + (dome.z - S.z) * k }); if (Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) inside++; }
    assert.ok(inside / 51 >= part, `${name} WIDE: ${(inside / 51 * 100).toFixed(0)}% of the fall in frame`);
  }
});
// ── 隕石（設計 §6，任務 5；trim §C 從飛彈換成隕石，識別字沿用 missile）──
import { finaleEvents } from '../src/game.js';
import { resolve, missile as missileOf } from '../src/rules/endings.js';
import { anchorWorld, landmarkWorld } from '../src/actors/anchors.js';
import { SHIELD } from '../src/actors/parts.js';
import { HOLD_END, FLIGHT, DEFLECT } from '../src/actors/finale.js';

// 全 MAX（唯一正解：老鼠 4、珍奶 6；修正批次 2：颱風 3，總等級 59）
const LIT = { milk: 10, baseball: 8, token: 10, rat: 4, boba: 6, typhoon: 3, chip: 9, bulb: 9 }, LIT_META = { total: 59 };
const TOWER_AT = anchorWorld('tower');
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('view: missile flag draws finale.missile (the meteor) with outcome and target (shield → dome surface on the line to STAR_AT; hit → tower bend point; deflect → spring pool) and no star; deflect adds finale.splash', () => {
  const F = finale.STAR_AT;
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const v = finale.view(LIT, { alarm: 1, missile: outcome }, LIT_META), m = v['finale.missile'];
    assert.ok(m, outcome); assert.equal(v['finale.star'], undefined, `${outcome}: the star is out`);
    assert.equal(m.kind, 'missile'); assert.equal(m.outcome, outcome); assert.deepEqual(m.from, F);
    assert.equal(m.footprint, false); assert.equal(m.shadow, false);
    assert.equal(!!v['finale.splash'], outcome === 'deflect');
  }
  // shield：罩面上、在 101 底座中心到光點那條線上（隕石從天上直直落向 101，撞在罩頂偏北；仰角 > 60°）
  const s = finale.view(LIT, { missile: 'shield' }, LIT_META)['finale.missile'].at;
  assert.ok(Math.abs(dist3(s, TOWER_AT) - tower.SHIELD_R) < 1e-6, 'on the dome');
  const el = Math.asin((s.y - TOWER_AT.y) / tower.SHIELD_R) * 180 / Math.PI;
  assert.ok(el > 60, `elevation ${el.toFixed(1)}° (from above, not from the horizon)`);
  const u = { x: (F.x - TOWER_AT.x) / dist3(F, TOWER_AT), y: (F.y - TOWER_AT.y) / dist3(F, TOWER_AT), z: (F.z - TOWER_AT.z) / dist3(F, TOWER_AT) };
  assert.ok(dist3(s, { x: TOWER_AT.x + u.x * tower.SHIELD_R, y: TOWER_AT.y + u.y * tower.SHIELD_R, z: TOWER_AT.z + u.z * tower.SHIELD_R }) < 1e-6, 'on the line to the star');
  // hit：101 在自己這一階段的彎角（工地不彎，打在底座）
  assert.deepEqual(finale.view(LIT, { missile: 'hit' }, LIT_META)['finale.missile'].at, tower.bendPoint('lit'));
  assert.deepEqual(finale.view({}, { missile: 'hit' })['finale.missile'].at, tower.bendPoint('site'));
  assert.deepEqual(finale.view({ ...LIT, chip: 0, bulb: 0, milk: 0 }, { missile: 'hit' }, { total: 10 })['finale.missile'].at, tower.bendPoint('half'));
  assert.ok(tower.bendPoint('half').y < tower.bendPoint('lit').y, 'a half tower is hit lower');
  // deflect：溫泉池中心、池面上 0.1；水花是白煙 4 團
  const spring = landmarkWorld('spring'), d = finale.view(LIT, { missile: 'deflect' }, LIT_META);
  assert.deepEqual(d['finale.missile'].at, { x: spring.x, y: spring.y + 0.1, z: spring.z });
  const sp = d['finale.splash'];
  assert.equal(sp.kind, 'smoke'); assert.equal(sp.n, 4); assert.equal(sp.color, 0xffffff); assert.equal(sp.size, 0.3); assert.equal(sp.rise, 0.6);
  assert.deepEqual({ x: sp.at.x, z: sp.at.z }, { x: spring.x, z: spring.z });
  assert.equal(finale.view(LIT, {}, LIT_META)['finale.missile'], undefined);
});

// 零件（trim §C 隕石）：不規則岩石（ico 低多邊形併成一個黏土 mesh，深灰褐 ROCK_COLOR）＋外面一層半透明發光的橘色外殼（比岩石大 15%）＋
// 拖尾（3–4 顆漸小、漸淡的發光球沿來向排開）；建好即終態；launch() 從光點重飛、由上往下斜斜落下；三種結果的終態
const missileFactory = (quality = 'high') => createPartFactory(THREE, { glow: createGlowRegistry(), people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders, quality });
const worldOf = (part, local) => { part.object.updateMatrixWorld(true); return part.object.getObjectByName('body').localToWorld(new THREE.Vector3(...local)); };
const noseDir = part => worldOf(part, [0, 0, 1]).sub(worldOf(part, [0, 0, 0])).normalize();
const bodyWorld = part => worldOf(part, [0, 0, 0]);
const step = (part, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) part.update(1 / 60, 0); };
const meshCount = o => { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); return n; };

test('meteor look: an irregular dark rock (ico parts, one clay mesh) inside a translucent glowing orange shell 15% larger, and a trail of 3–4 shrinking, fading glow balls behind it; no missile body (no fins, no eyes, no red-white stripes)', () => {
  assert.ok(finale.ROCK_PARTS.length >= 2 && finale.ROCK_PARTS.every(p => p.kind === 'ico' && p.color === finale.ROCK_COLOR && !p.glow), 'ico lumps, rock colour, clay');
  assert.equal(finale.ROCK_COLOR, 0x5a4a42); assert.equal(finale.SHELL_COLOR, 0xff7a3a);
  assert.equal('NOSE_TIP' in finale, false, 'no missile nose');
  const p = missileFactory().build(finale.view(LIT, { missile: 'hit' }, LIT_META)['finale.missile']), body = p.object.getObjectByName('body');
  const rock = body.getObjectByName('rock'), shell = body.getObjectByName('shell'), trail = body.getObjectByName('trail');
  assert.ok(rock && shell && trail, 'rock, shell, trail');
  assert.equal(meshCount(rock), 1, 'the rock is one mesh');
  rock.traverse(o => { if (o.isMesh) assert.equal(o.castShadow, false); });
  assert.equal(shell.material.color.getHex(), finale.SHELL_COLOR); assert.ok(shell.material.transparent && shell.material.opacity < 1 && !shell.material.depthWrite, 'translucent glowing shell');
  shell.geometry.computeBoundingSphere(); assert.ok(Math.abs(shell.geometry.boundingSphere.radius / finale.ROCK_R - 1.15) < 0.02, `shell ${(shell.geometry.boundingSphere.radius / finale.ROCK_R).toFixed(3)} × the rock`);
  const balls = trail.children.filter(o => o.isMesh);
  assert.ok(balls.length >= 3 && balls.length <= 4, `${balls.length} trail balls`);
  for (let k = 0; k < balls.length; k++) {
    const b = balls[k]; assert.ok(b.position.z < -finale.ROCK_R + 1e-9, 'behind the rock (local −z: where it came from)');
    assert.ok(b.material.transparent && !b.material.depthWrite && b.material.color.getHex() === finale.SHELL_COLOR, 'glowing orange');
    if (k) { const a = balls[k - 1]; assert.ok(b.position.z < a.position.z && b.scale.x < a.scale.x && b.material.opacity < a.material.opacity, `ball ${k}: further back, smaller, fainter`); }
  }
  assert.ok(meshCount(body) <= 6, `${meshCount(body)} draw calls in flight`);
  const low = missileFactory('low').build(finale.view(LIT, { missile: 'hit' }, LIT_META)['finale.missile']);
  assert.equal(meshCount(low.object.getObjectByName('rock')), 1, 'low quality: the rock is one mesh too');
  p.dispose(); low.dispose();
});

test('meteor part: built finished (final pose); launch() restarts at STAR_AT and falls steeply (height always dropping), leading with the rock, trail lit; shield → hidden after FLIGHT with one firework; deflect → in the pool after FLIGHT + DEFLECT; hit → lodged at the bend; the trail goes out once it lands', () => {
  const f = missileFactory(), F = finale.STAR_AT, R = finale.ROCK_R;
  const bodyOf = p => p.object.getObjectByName('body'), trailOf = p => bodyOf(p).getObjectByName('trail');
  const finalOf = outcome => { const p = f.build(finale.view(LIT, { missile: outcome }, LIT_META)['finale.missile']); p.object.updateMatrixWorld(true); return p; };
  const sameMatrix = (a, b) => { a.object.updateMatrixWorld(true); b.object.updateMatrixWorld(true); return bodyOf(a).matrixWorld.elements.every((x, i) => Math.abs(x - bodyOf(b).matrixWorld.elements[i]) < 1e-6); };
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const spec = finale.view(LIT, { missile: outcome }, LIT_META)['finale.missile'], p = f.build(spec), body = bodyOf(p), T = spec.at;
    // 終態
    if (outcome === 'shield') {
      assert.equal(body.visible, false, 'shield: gone');
      const fw = p.object.getObjectByName('fireworks'); assert.ok(fw, 'carries a firework'); assert.equal(fw.children[0].visible, false, 'already burst');
    } else {
      assert.ok(body.visible); assert.equal(trailOf(p).visible, false, `${outcome}: landed, the trail is out`);
      const front = worldOf(p, [0, 0, R]), c = bodyWorld(p);
      if (outcome === 'hit') {
        // 修正輪 1（審稿 Important 2）：岩石卡在塔的西側面（101 往 +x 倒，西側不會被蓋住）——中心在西面外、離塔面 < ROCK_R（咬進塔面），
        // 從鏡頭方向（OVERVIEW_DIR 的水平分量）看過去，岩石至少一半在塔身輪廓（方錐台半寬 0.58 的正方形）外
        const face = T.x - 0.58;
        assert.ok(c.x < face && face - c.x < R, `hit: lodged against the west face (centre ${(face - c.x).toFixed(2)} out of it, radius ${R})`);
        assert.ok(Math.abs(c.y - T.y) < 0.5, `hit: at the bend height (${(c.y - T.y).toFixed(2)})`);
        const hz = Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.z), sx = OVERVIEW_DIR.z / hz, sz = -OVERVIEW_DIR.x / hz;   // 畫面上的左右方向
        const half = 0.58 * (Math.abs(sx) + Math.abs(sz)), cs = (c.x - T.x) * sx + (c.z - T.z) * sz;
        const out = Math.max(0, Math.min(cs + R, -half) - (cs - R)) + Math.max(0, (cs + R) - Math.max(cs - R, half));
        assert.ok(out / (2 * R) >= 0.5, `hit: ${(out / (2 * R) * 100).toFixed(0)}% of the rock outside the tower silhouette from the camera`);
      } else {
        assert.ok(dist3(front, T) < 0.5, `deflect: in the pool (${dist3(front, T).toFixed(2)})`);
        assert.ok(c.y > T.y - 0.25, 'deflect: half out of the water');
      }
    }
    // launch：從光點出發，一路往下掉（每一步都比上一步低）、很陡；岩石在前、拖尾亮著
    p.object.userData.launch({ speed: 1 }); p.update(1e-4, 0);
    assert.ok(body.visible); assert.ok(dist3(bodyWorld(p), F) < 0.05, `${outcome}: starts at STAR_AT`);
    assert.equal(trailOf(p).visible, true, 'the trail glows in flight');
    let prev = bodyWorld(p);
    for (let t = 0.1; t < FLIGHT - 0.05; t += 0.1) {
      step(p, 0.1);
      const cur = bodyWorld(p), v = cur.clone().sub(prev), n = v.clone().normalize();
      assert.ok(v.y < 0, `${outcome} t ${t.toFixed(1)}: falling`);
      assert.ok(n.y < -0.8, `${outcome} t ${t.toFixed(1)}: steep, from above (${n.y.toFixed(2)})`);
      assert.ok(noseDir(p).dot(n) > 0.97, `${outcome} t ${t.toFixed(1)}: leading with the rock (${noseDir(p).dot(n).toFixed(3)})`);
      prev = cur;
    }
    if (outcome === 'shield') {
      step(p, 0.1); assert.equal(body.visible, false, 'shield: gone at impact');
      const fw = p.object.getObjectByName('fireworks').children[0]; assert.ok(fw.visible, 'one firework');
      assert.ok(dist3(p.object.getObjectByName('fireworks').getWorldPosition(new THREE.Vector3()), T) < 1e-6, 'bursts at the dome');
      step(p, 1.3); assert.equal(fw.visible, false, 'one burst only'); step(p, 3); assert.equal(fw.visible, false);
    } else if (outcome === 'deflect') {
      step(p, 0.1); assert.ok(!sameMatrix(p, finalOf('deflect')), 'deflect: still falling after FLIGHT');
      step(p, DEFLECT); assert.ok(sameMatrix(p, finalOf('deflect')), 'deflect: in the pool after FLIGHT + DEFLECT'); assert.equal(trailOf(p).visible, false);
    } else {
      step(p, 0.1); assert.ok(sameMatrix(p, finalOf('hit')), 'hit: stuck at the bend after FLIGHT'); assert.equal(trailOf(p).visible, false);
    }
    // 2 倍速
    p.object.userData.launch({ speed: 2 }); step(p, FLIGHT / 2 + 0.05);
    if (outcome === 'hit') assert.ok(sameMatrix(p, finalOf('hit')), 'speed 2 falls twice as fast');
    p.dispose();
  }
});

// 三種結果的局：正解（矽盾）、固定的壞結局局（test/helpers/endings.js 的 EXAMPLE.hit／deflect）
const MISSILE_ORDERS = { shield: SOLUTIONS[0], hit: EXAMPLE.hit, deflect: EXAMPLE.deflect };
async function missileShow(outcome) {
  const h = await headlessShow(), order = MISSILE_ORDERS[outcome];
  let s = createState(spec);
  for (const st of turnSteps(order)) {
    const r = st(s); s = r.state;
    await h.run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.equal(missileOf(s, spec), outcome, `${order.join('>')} → ${outcome}`);
  // 終局回合照 game.js：警告（光點亮起）先瞬間演完，再單獨演隕石
  const [warn, e] = finaleEvents(resolve(s, spec));
  assert.equal(warn.kind, 'warning');
  await h.run([warn], { finale: true, instant: true });
  return { ...h, e };
}

test('meteor script live, each outcome: ≤ 10 s real, ！ from the crowd mid-fall, then ♥+jump (shield) / ？ then ♪ (deflect) / mood lie (hit); the camera watches from the WIDE framing, back on the overview at the end', async () => {
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const { show, run, bubblesLog, worldLog, rig, e, people } = await missileShow(outcome);
    const crowdSize = Math.min(24, islanders({ roster: show.roster }).length);
    assert.ok(crowdSize >= 6, `${outcome}: islanders (${crowdSize})`);
    const n0 = bubblesLog.length, w0 = worldLog.length, r0 = rig.log.length, said = [], main0 = show.stage.partObject('tower.main'), shield0 = show.stage.partObject('tower.shield');
    let launchAt = null, bendAt = null, shieldAt = null, lieAt = null, jumpers = 0, seen = n0, named = null;
    const update = show.update.bind(show);
    show.update = (dt, t) => {
      update(dt, t);
      const now = show.elapsed;
      if (launchAt === null && show.stage.partKeys().includes('finale.missile')) launchAt = now;
      while (seen < bubblesLog.length) said.push({ ...bubblesLog[seen++], t: now });
      // 「！」點名的那一刻主島上的島民（演到才點名：走上橋、走回家的人那一刻不算）
      if (named === null && said.some(b => b.kind === '！')) named = Math.min(24, islanders({ roster: show.roster }).length);
      if (bendAt === null && show.stage.partObject('tower.main') !== main0) bendAt = now;
      if (shieldAt === null && show.stage.partObject('tower.shield') !== shield0) shieldAt = now;
      if (lieAt === null && worldLog.slice(w0).some(([w]) => w.mood === 'lie')) lieAt = now;
      jumpers = Math.max(jumpers, everyone(show).filter(m => m.walker?.gesture?.kind === 'jump').length);
    };
    await run([e], { finale: true });
    show.update = update;
    const secs = show.elapsed, of = k => said.filter(b => b.kind === k);
    assert.ok(secs <= 10, `${outcome}: ≤ 10 s real (${secs.toFixed(2)})`);
    assert.ok(launchAt !== null && launchAt >= 0.8 - 1e-6, `${outcome}: falls after the 0.8 s WIDE framing beat`);
    assert.ok(!show.stage.partKeys().includes('finale.star'), 'the star is out');
    const bang = of('！');
    assert.ok(named >= crowdSize - 2, `${outcome}: about everyone is still on the island (${named}/${crowdSize})`);
    assert.equal(bang.length, named, `${outcome}: everyone (≤ 24) says ！`);
    assert.ok(Math.abs(bang[0].t - launchAt - FLIGHT / 2) < 0.15, `${outcome}: ！ mid-flight (${(bang[0].t - launchAt).toFixed(2)} s after launch)`);
    const impact = launchAt + FLIGHT + (outcome === 'deflect' ? DEFLECT : 0) - 0.05;
    if (outcome === 'shield') {
      assert.ok(shieldAt >= impact, 'the dome lights up at impact');
      const dome = show.stage.partObject('tower.shield').children[0];
      assert.ok(Math.abs(dome.material.opacity - SHIELD.full) < 1e-9, 'the dome stays full');
      assert.equal(of('♥').length, named, 'the same crowd cheers'); assert.ok(of('♥')[0].t >= shieldAt, '♥ after the dome lights up');
      assert.equal(jumpers, named, 'everyone jumps');
    } else if (outcome === 'deflect') {
      assert.ok(show.stage.partKeys().includes('finale.splash'), 'splash');
      const q = of('？'), note = of('♪');
      assert.equal(q.length, named); assert.equal(note.length, named);
      assert.ok(q[0].t >= impact, '？ after the meteor lands'); assert.ok(note[0].t >= q.at(-1).t + 0.9, '♪ after ？');
    } else {
      assert.ok(bendAt !== null && bendAt >= launchAt + FLIGHT - 0.05, '101 bends at impact');
      assert.ok(lieAt !== null && lieAt - bendAt < 1, `everyone lies down right after the bend (${(lieAt - bendAt).toFixed(2)} s)`);
      assert.ok(lieAt <= secs - HOLD_END + 0.05, 'before the final hold');
      for (const k of ['tower.antenna', 'tower.show', 'tower.shield']) assert.ok(!show.stage.partKeys().includes(k), `no ${k}`);
      assert.equal(worldLog.at(-1)[0].mood, 'lie', 'the mood holds to the end of the turn');
    }
    assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, `${outcome}: everyone released`);
    const cam = rig.log.slice(r0);
    assert.ok(cam[0][0] === 'focus' && cam[0][1] === finale.WIDE && cam[0][2].zoom === finale.WIDE_ZOOM, `${outcome}: the fall is watched from WIDE`);
    assert.ok(cam.slice(1).length && cam.slice(1).every(([k]) => k === 'home'), `${outcome}: then the overview (${cam.map(c => c[0]).join(' ')})`);
    if (outcome === 'hit') {
      // 「姿勢持續到標題卡」（設計 §6，最終審稿）：無頭的 world 跟 app 的 showWorld 一樣把 mood 交給 people.setMood；
      // 演完再走 3 秒（標題卡前的 hold、標題卡底下），日常的人一個都不在島上滑
      assert.equal(people.mood, 'lie', 'the islanders lie down (world → people.setMood)');
      const home = everyone(show).filter(m => m.walker && m.mode === 'home' && !m.hidden), p0 = home.map(m => ({ ...m.pos }));
      for (let i = 0; i < 90; i++) show.update(1 / 30, 3000 + i / 30);
      const slid = home.map((m, i) => Math.hypot(m.pos.x - p0[i].x, m.pos.z - p0[i].z)).filter(d => d > 0.01);
      assert.equal(slid.length, 0, `nobody glides on their back after the hit (${slid.map(d => d.toFixed(2)).join(' ')})`);
    }
  }
});

test('meteor script instant (skip): the final state matches the live one for all three outcomes (review focus 2)', async () => {
  const r4 = x => Math.round(x * 1e4) / 1e4 + 0;
  const snap = ({ show, worldLog }) => {
    const o = show.stage.partObject('finale.missile'), body = o.getObjectByName('body'), fw = o.getObjectByName('fireworks');
    o.updateMatrixWorld(true);
    const main = new THREE.Box3().setFromObject(show.stage.partObject('tower.main'));
    return {
      keys: show.stage.partKeys().sort(), flags: { ...show.stage.flags }, body: body.visible, pose: body.matrixWorld.elements.map(r4),
      fw: fw ? fw.children[0].visible : null, main: [...main.min.toArray(), ...main.max.toArray()].map(r4),
      dome: show.stage.partObject('tower.shield')?.children[0].material.opacity ?? null,
      mood: worldLog.at(-1)[0].mood, script: everyone(show).filter(m => m.mode === 'script').length,
    };
  };
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const live = await missileShow(outcome), skip = await missileShow(outcome);
    await live.run([live.e], { finale: true });
    await skip.run([skip.e], { finale: true, instant: true });
    for (let i = 0; i < 90; i++) { live.show.update(1 / 30, i / 30); skip.show.update(1 / 30, i / 30); }   // 閃白收完、煙火演完
    const a = snap(live), b = snap(skip);
    assert.deepEqual(b, a, outcome);
    assert.equal(a.mood, outcome === 'hit' ? 'lie' : 'normal');
    assert.equal(a.body, outcome !== 'shield');
  }
});

// ── 賽博尾聲（設計 §7，任務 6）──
import { CAR_FLIGHT } from '../src/actors/finale.js';
import { ROOF_SPOTS } from '../src/actors/rat.js';
import { orbitPose } from '../src/actors/parts.js';
import { TIMES } from '../src/scene/daynight.js';
import { NEON_BOOST } from '../src/actors/world.js';
import { body as towerBody } from '../src/actors/tower.js';
const CYBER_ORDER = stats(enumerate(spec), spec).full.find(r => r.ending.id === 'cyber').order;

test('view: epilogue cyber draws finale.car (the token Roadster model in red, from the sea, park on the 101 roof side-on, no rest)', async () => {
  const { roadsterParts, CAR_W, CAR_L } = await import('../src/actors/token.js');
  const v = finale.view(LIT, { missile: 'shield', epilogue: 'cyber' }, LIT_META), car = v['finale.car'], dark = towerBody('lit', { dark: true });
  assert.ok(car, 'finale.car');
  assert.equal(car.kind, 'orbit'); assert.equal(car.path, undefined, 'no glb');
  assert.deepEqual(car.model.parts, roadsterParts(C.red), 'the same Roadster as token Lv10, in red'); assert.equal(C.red, 0xe8322e);
  assert.equal(car.squash, 0.03, 'lands on its wheels like the token cars'); assert.equal(car.footprint, false); assert.equal(car.rest, undefined, 'parks for good');
  assert.deepEqual(car.from, { x: 10, y: 3.5, z: 9 }, 'flies in from the sea, camera-right-front');
  assert.deepEqual(car.at, TOWER_AT); assert.equal(car.r, 1.4); assert.equal(car.speed, 2.5); assert.deepEqual(car.legs, [1.2, 0.8]);
  assert.ok(Math.abs(car.h - (towerBody('lit').top + 0.6)) < 1e-9, 'circles just over the 101 top');
  assert.ok(Math.abs(Math.sin(car.phase) - 1) < 1e-9, 'enters and leaves the lap on the camera side');
  assert.ok(Math.abs(car.park.y - (TOWER_AT.y + dark.roof)) < 1e-9 && Math.abs(car.park.x - TOWER_AT.x) < 1e-9 && car.park.z > TOWER_AT.z, 'parks on the front of the roof');
  // 停好側身對鏡頭（車頭朝 −x）：整台車（長 CAR_L 沿 x、寬 CAR_W + 凸出的輪子沿 z）在屋頂上
  const half = dark.parts.find(p => p.name === 'deck').scale[2] / 2;
  assert.ok(Math.abs(car.park.yaw + Math.PI / 2) < 1e-9, 'parked side-on, nose to −x');
  assert.ok(Math.abs(car.park.x - TOWER_AT.x) + CAR_L / 2 <= half && Math.abs(car.park.z - TOWER_AT.z) + CAR_W / 2 + 0.01 <= half, 'the whole car body on the roof');
  assert.deepEqual(orbitPose(car, Infinity), { ...car.park, done: true });
  assert.ok(Math.abs(CAR_FLIGHT - (1.2 + 2 * Math.PI / 2.5 + 0.8)) < 1e-9);
  for (const flags of [{ missile: 'shield' }, { missile: 'shield', epilogue: 'alien' }]) assert.equal(finale.view(LIT, flags, LIT_META)['finale.car'], undefined);
});

// 賽博正解整局瞬間演完（含倒數三回合）、飛彈瞬間演完，尾聲 live（終局回合 1 倍速）：量尾聲自己的秒數
test('cyber epilogue live: night, black tower blinks in, the car flies in and parks within 4 s, no marquee text, the rats appear on the roof, ends on the overview; ≤ 12 s real', async () => {
  const h = await headlessShow(), { show, run, bubblesLog, worldLog, rig } = h;
  let s = createState(spec);
  for (const st of turnSteps(CYBER_ORDER)) {
    const r = st(s); s = r.state;
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  const [warn, missileEvent, epilogueEvent] = finaleEvents(resolve(s, spec));
  assert.equal(epilogueEvent?.ending, 'cyber');
  await run([warn, missileEvent], { finale: true, instant: true });
  const w0 = worldLog.length, n0 = bubblesLog.length, r0 = rig.log.length, main0 = show.stage.partObject('tower.main');
  const park = finale.view(LIT, { missile: 'shield', epilogue: 'cyber' }, LIT_META)['finale.car'].park;
  let darkAt = null, flyAt = null, parkedAt = null, ratsAt = null, maxBubbles = 0;
  const update = show.update.bind(show), dt = 1 / 30;
  const carPos = () => { const o = show.stage.partObject('finale.car'); if (!o?.children[0]) return null; const p = o.children[0].position; return { x: o.position.x + p.x, y: o.position.y + p.y, z: o.position.z + p.z }; };
  const onRoof = () => show.roster.members('rat.pack').every(m => Math.abs(m.pos.y - ROOF_SPOTS[0].y) < 1e-6);
  show.update = (d, t) => {
    update(d, t);
    const now = show.elapsed;
    if (darkAt === null && show.stage.partObject('tower.main') !== main0) darkAt = now;
    const c = carPos();
    if (c && flyAt === null && dist3(c, park) > 1) flyAt = now;
    if (c && flyAt !== null && parkedAt === null && dist3(c, park) < 1e-6) parkedAt = now;
    if (ratsAt === null && onRoof()) ratsAt = now;
  };
  await run([epilogueEvent], { finale: true });
  show.update = update;
  const secs = show.elapsed;
  assert.ok(secs <= 12, `≤ 12 s real (${secs.toFixed(2)})`);
  console.log(`cyber epilogue: ${secs.toFixed(2)} s real (dark ${darkAt?.toFixed(2)}, fly ${flyAt?.toFixed(2)}, parked ${parkedAt?.toFixed(2)}, rats ${ratsAt?.toFixed(2)})`);
  const w = worldLog.slice(w0).map(([x]) => x);
  assert.ok(w.some(x => x.time === TIMES.night && x.glowScale === NEON_BOOST), 'night, neon up');
  assert.ok(darkAt !== null && darkAt < flyAt, 'the black tower first');
  assert.ok(show.stage.partKeys().includes('tower.screen'), 'the screen is up');
  assert.ok(parkedAt !== null && parkedAt - flyAt <= CAR_FLIGHT + 0.05 && CAR_FLIGHT < 4.6, `the car parks ${(parkedAt - flyAt).toFixed(2)} s after take-off`);
  assert.ok(dist3(carPos(), park) < 1e-6, 'the car ends parked on the roof');
  assert.ok(!bubblesLog.slice(n0).some(b => b.kind && typeof b.kind === 'object' && 'text' in b.kind), 'no marquee text（2026-11-03 拿掉）');
  assert.ok(ratsAt !== null && ratsAt >= parkedAt, 'the rats line up after the car parks');
  const rats = show.roster.members('rat.pack');
  assert.equal(rats.length, 10);
  for (const m of rats) assert.ok(dist3(m.pos, ROOF_SPOTS[m.i]) < 1e-6 && m.mode === 'home', `rat ${m.i} on its roof spot`);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  const cam = rig.log.slice(r0);
  assert.ok(cam.length && cam.every(([k]) => k === 'home'), `the camera stays on the overview (${cam.map(c => c[0]).join(' ')})`);
  // 跳過：終態一樣（車停好、10 隻在屋頂、螢幕在）
  const skip = await headlessShow();
  let s2 = createState(spec);
  for (const st of turnSteps(CYBER_ORDER)) { const r = st(s2); s2 = r.state; await skip.run([...r.events, { kind: 'settle' }], { instant: true }); }
  await skip.run(finaleEvents(resolve(s2, spec)), { finale: true, instant: true });
  assert.deepEqual(skip.show.stage.partKeys().sort(), show.stage.partKeys().sort());
  for (const m of skip.show.roster.members('rat.pack')) assert.ok(dist3(m.pos, ROOF_SPOTS[m.i]) < 1e-6, `skip: rat ${m.i} on the roof`);
  const o = skip.show.stage.partObject('finale.car'), p = o.children[0].position;
  assert.ok(dist3({ x: o.position.x + p.x, y: o.position.y + p.y, z: o.position.z + p.z }, park) < 1e-6, 'skip: the car parked');
});

// ── 外星尾聲（設計 §7，任務 7）：唯一正解（2026-10-31 §4.5）之後外星是壞結局「變異鼠稱王」，不演尾聲。
// 尾聲的零件與劇本留著給圖鑑：view 測試照舊（純函數），整局 live 的測試換成「外星是壞結局」──
import { UFO_N, UFO_PARTS_BIG } from '../src/actors/finale.js';
import { SHIP_SPOT, UFO_PARTS } from '../src/actors/rat.js';
import { island } from '../src/actors/satellites.js';
import { C } from '../src/actors/palette.js';
// 外星壞局：列舉裡第一條老鼠 Lv4 分岔成外星、標題是「變異鼠稱王」的放法（修正批次 2：攤車被吹走排在外星前面，第一條外星分岔的標題是它）
const ALIEN_ORDER = enumerate(spec).find(r => r.ending.id === 'alien' && r.state.lv.rat === 4).order;
const meshes = o => { const out = []; o.traverse(x => { if (x.isMesh) out.push(x); }); return out; };

test('view: epilogue alien draws finale.ufos (one compound, three saucers over the rocks island) and finale.aliens (three, bobbing, C.alien glow)', () => {
  const v = finale.view(LIT, { missile: 'shield', epilogue: 'alien' }, LIT_META), u = v['finale.ufos'], a = v['finale.aliens'], rocks = island('rocks');
  assert.ok(u && a, 'ufos and aliens');
  assert.equal(v['finale.car'], undefined);
  assert.equal(u.kind, 'compound'); assert.equal(u.footprint, false);
  assert.ok(dist3(u.at, rocks) < 1e-9, 'at the rocks islet centre');
  // 三個碟：rat.js 小 UFO 的零件放大 2 倍（碟身、碟緣、綠色底光），各三件
  assert.equal(UFO_N, 3); assert.equal(u.parts.length, 3 * UFO_PARTS.length);
  assert.deepEqual(UFO_PARTS_BIG.map(p => p.kind), UFO_PARTS.map(p => p.kind));
  UFO_PARTS_BIG.forEach((p, i) => assert.deepEqual(p.scale, UFO_PARTS[i].scale.map(x => x * 2), `${p.kind} ×2`));
  const centres = [0, 1, 2].map(i => u.parts[i * UFO_PARTS.length + 1].pos);   // 碟緣（cylinder）的中心 = 碟心
  for (const [x, y, z] of centres) {
    assert.ok(Math.abs(Math.hypot(x, z) - 1.2) < 1e-9, `radius 1.2 round the pad (${Math.hypot(x, z).toFixed(2)})`);
    assert.ok(y >= 0.35 && y <= 1.0, `hovers just over the islet (${y})`);
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(centres[i][0] - centres[j][0], centres[i][2] - centres[j][2]) >= 2.0, 'saucers do not overlap');
  assert.ok(u.parts.filter(p => p.glow != null).every(p => p.glow === C.alien) && u.parts.filter(p => p.glow != null).length === 3, 'three green bulbs');
  // 外星生物：aliens builder，三個、不踩走路格、不投影；在島上、在 UFO 和主島之間
  assert.equal(a.kind, 'aliens'); assert.equal(a.footprint, false); assert.equal(a.shadow, false);
  assert.ok(dist3(a.at, rocks) < 2.2, 'on the islet');
  assert.ok(Math.hypot(a.at.x, a.at.z) < Math.hypot(rocks.x, rocks.z), 'on the main-island side');
  for (const flags of [{ missile: 'shield' }, { missile: 'shield', epilogue: 'cyber' }]) { const w = finale.view(LIT, flags, LIT_META); assert.equal(w['finale.ufos'], undefined); assert.equal(w['finale.aliens'], undefined); }
  // 零件：三個生物（綠色發光的頭 r 0.18、身體 r 0.12 高 0.3、三顆墨色眼睛 r 0.03 朝主島），update 上下漂 ±0.08
  const glow = createGlowRegistry();
  const f = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders });
  const part = f.build(a), ms = meshes(part.object);
  assert.ok(ms.length <= 2, `two materials at most (${ms.length})`);
  const lit = ms.find(m => m.material.emissive?.getHex() === C.alien);
  assert.ok(lit, 'C.alien glow');
  part.object.updateMatrixWorld(true);
  const ys = new Set();
  for (let i = 0; i < 30; i++) { part.update(0.1, i * 0.1); part.object.updateMatrixWorld(true); ys.add(new THREE.Box3().setFromObject(part.object).min.y.toFixed(3)); }
  const yv = [...ys].map(Number);
  assert.ok(Math.max(...yv) - Math.min(...yv) > 0.1 && Math.max(...yv) - Math.min(...yv) <= 0.16 + 1e-6, `bobs ±0.08 (${(Math.max(...yv) - Math.min(...yv)).toFixed(3)})`);
  assert.equal(finale.alienParts().filter(p => p.color === C.ink).length, 9, 'three eyes each');
  assert.equal(finale.alienParts().filter(p => p.kind === 'sphere' && Math.abs(p.scale - 0.36) < 1e-9).length, 3, 'three heads r 0.18');
  part.object.traverse(o => { if (o.isMesh) assert.ok(!o.castShadow, 'no shadow'); });
  part.dispose();
});

// 外星是壞結局（唯一正解 §4.5）：結局「變異鼠稱王」；畫面就是老鼠 Lv4 外星型態——戴王冠的變異鼠、頭上的小 UFO、石堆島的綠光圈。
// 計畫 17（2026-11-04）：壞結局也有收尾事件。任務 1 的 script.epilogue 對外星先只套用（舊的 alienEpilogue ≈ 8.8 s 接上去 pace「老鼠跑遠」局終局超過 12 s）；
// 舊劇本留給任務 4 改成災難版——這裡從真的外星局（EXAMPLE.alien）把它 live 演一次：不出錯、≤ 12 s
test('alien is a bad ending (變異鼠稱王) with an epilogue: before it the crowned mutant + the small UFO + the rocks-islet ring; dispatch only applies for now; the old alienEpilogue plays live from a real alien game, ≤ 12 s', async () => {
  const { ENDINGS } = await import('../src/rules/endings.js');
  assert.deepEqual(EXAMPLE.alien, ALIEN_ORDER, 'EXAMPLE.alien is the first alien game (rat Lv4)');
  const h = await headlessShow();
  let s = createState(spec);
  for (const st of turnSteps(EXAMPLE.alien)) { const r = st(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(s.flags.ratBranch, 'alien'); assert.equal(s.lv.rat, 4);
  const ending = resolve(s, spec);
  assert.equal(ending.id, 'alien'); assert.equal(ENDINGS.alien.kind, 'bad'); assert.equal(ending.title, '變異鼠稱王');
  const evs = finaleEvents(ending);
  assert.deepEqual(evs.map(e => e.kind), ['warning', 'missile', 'epilogue']);
  assert.equal(evs[2].ending, 'alien');
  await h.run(evs.slice(0, 2), { finale: true, instant: true });
  const { show } = h, [mutant] = show.roster.members('rat.pack');
  assert.equal(show.roster.members('rat.pack').length, 1);
  assert.ok(mutant.dress.crown && mutant.dress.eye && mutant.dress.h === 0.5, 'the crowned mutant');
  assert.ok(Math.hypot(mutant.pos.x - SHIP_SPOT.x, mutant.pos.z - SHIP_SPOT.z) > 1, 'not on a mothership yet');
  assert.ok(show.stage.partObject('rat.ufo'), 'the small UFO');
  assert.ok(show.stage.partObject('sat.rocksRing'), 'the green ring on the rocks islet');
  assert.ok(!show.stage.partKeys().some(k => k === 'finale.ufos' || k === 'finale.aliens'), 'no landing UFOs, no aliens yet');
  assert.equal(show.stage.flags.epilogue, undefined);
  const B = beatsMod.B;
  assert.deepEqual(finale.script.epilogue(evs[2], show.stage, { B }).map(b => b.kind), [B.apply(evs[2]).kind], 'task 1: the alien epilogue only applies (task 4 wires the script)');
  const dispatch = finale.script.epilogue;
  finale.script.epilogue = (e, st, ctx) => finale.alienEpilogue(e, ctx);
  try { await h.run([evs[2]], { finale: true }); } finally { finale.script.epilogue = dispatch; }
  const secs = show.elapsed;
  console.log(`alien epilogue (plan 17 task 1, old alien()): ${secs.toFixed(2)} s real`);
  assert.ok(secs <= 12, `≤ 12 s real for now (${secs.toFixed(2)})`);
  assert.equal(show.stage.flags.epilogue, 'alien');
  assert.ok(show.stage.partKeys().includes('finale.ufos') && show.stage.partKeys().includes('finale.aliens'), 'the UFOs landed, the aliens are out');
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
});
