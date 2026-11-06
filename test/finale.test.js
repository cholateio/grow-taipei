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
  // R48（使用者 2026-11-06：矽盾只有在真結局才會長）：試升失敗整段拿掉，晶片幾級都是 4.5 s
  assert.ok(show.elapsed <= 4.5, `≤ 4.5 s real at chip ${show.stage.lv.chip} (${show.elapsed.toFixed(2)})`);
});
// 跳過（instant，reduced motion／玩家按跳過）：警告照樣把旗標、光點套上，沒有人留在劇本手上
test('warning skipped (instant): alarm 1, the star is there, nobody left in script mode', async () => {
  const { show, run } = await placedShow();
  await run([WARNING], { finale: true, instant: true });
  assert.equal(show.stage.flags.alarm, 1);
  assert.ok(show.stage.partKeys().includes('finale.star'), 'the star is there');
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'nobody in script mode');
});

// R48（使用者 2026-11-06：矽盾只有在真結局才會長；取代計畫 17 任務 2 的試升失敗）：晶片 7–8 的警告跟其他級一樣——沒有 shieldFail 段、
// 罩子與天線都不出現（Lv7 只是木箱、Lv8 只是鷹架，矽盾要到 Lv9 才長）
test('R48: warning beats at chip 7 and 8 are the plain warning (no shieldFail), the same as chip 0, 6 and 9', () => {
  const { B } = beatsMod, ctx = { B, roster: { members: () => [], keys: () => [] } };
  for (const chip of [0, 6, 7, 8, 9]) {
    const beats = finale.script.warning(WARNING, { lv: { chip }, flags: { alarm: 1 } }, ctx);
    assert.equal(beats.findIndex(b => b.name === 'shieldFail'), -1, `chip ${chip}: no shieldFail`);
    assert.deepEqual(beats.map(b => b.kind), ['together', 'wait', 'together', 'together', 'home'], `chip ${chip}`);
  }
  assert.equal(finale.FAIL_WAIT, undefined, 'FAIL_WAIT is gone');
});
// 晶片停在 8 的一局：枚舉裡第一個最後晶片 Lv8 的順序（颱風第 7 個放，晶片等不到 Lv9；cartBlown、隕石命中）
const CHIP8_ORDER = ['milk', 'chip', 'bulb', 'baseball', 'token', 'rat', 'typhoon', 'boba'];
test('R48: a real chip-8 game — no dome and no antenna through the warning and after the meteor; the scaffold goes with the hit, the crates stay; warning ≤ 4.5 s', async () => {
  const h = await headlessShow(), { show } = h;
  let s = createState(spec);
  for (const st of turnSteps(CHIP8_ORDER)) { const r = st(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(s.lv.chip, 8, 'chip stuck at 8');
  assert.ok(show.stage.partKeys().includes('tower.scaffold') && show.stage.partKeys().includes('chip.crates'), 'scaffold and crates before the finale');
  const ending = resolve(s, spec); assert.equal(ending.missile, 'hit');
  const [warn, meteor, ...rest] = finaleEvents(ending);
  assert.equal(warn.kind, 'warning');
  const seen = new Set(), update = show.update;
  show.update = (dt, t) => { update(dt, t); for (const k of show.stage.partKeys()) seen.add(k); };
  const t0 = show.elapsed;
  await h.run([warn], { finale: true });
  const secs = show.elapsed - t0;
  console.log(`warning at chip 8 (R48): ${secs.toFixed(2)} s real`);
  assert.ok(secs <= 4.5, `warning ≤ 4.5 s (${secs.toFixed(2)})`);
  assert.ok(everyone(show).filter(m => m.mode === 'script').length === 0, 'everyone released');
  await h.run([meteor, ...rest], { finale: true });
  show.update = update;
  for (const k of ['tower.shield', 'tower.antenna']) assert.ok(!seen.has(k), `no ${k} at any frame`);
  assert.equal(show.stage.flags.missile, 'hit');
  assert.ok(!show.stage.partKeys().includes('tower.scaffold'), 'the scaffold goes with the hit');
  assert.ok(show.stage.partKeys().includes('chip.crates'), 'the crates stay at the foot (the parts never made it up)');
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
import { HOLD_END, FLIGHT, DEFLECT, HIT_HANG, HIT_DROP } from '../src/actors/finale.js';

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
    assert.equal(m.footprint, false);  // 命中掉到地上的那顆也不擋路（在夜市和 101 之間的走道上） assert.equal(m.shadow, false);
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

test('meteor part: built finished (final pose); launch() restarts at STAR_AT and falls steeply (height always dropping), leading with the rock, trail lit; shield → hidden after FLIGHT with one firework; deflect → in the pool after FLIGHT + DEFLECT; hit → against the west face at the bend, then drops to the ground beside the plinth; the trail goes out once it lands', () => {
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
        // 2026-11-05 使用者「隕石位置怪怪的」（卡在塔的西面、浮在半空）：撞彎之後掉到 101 底座西邊的地上、半埋著——
        // 中心在底座（1.6 見方）西緣外、離它 < ROCK_R；比地面高、但不到一顆石頭高（一半埋進地裡）；從鏡頭看過去不被塔擋住
        const G = finale.METEOR_REST, base = TOWER_AT.y, edge = TOWER_AT.x - 0.8;
        assert.ok(c.x < edge && edge - c.x < R, `hit: on the ground just west of the plinth (centre ${(edge - c.x).toFixed(2)} out of it)`);
        assert.ok(c.y > base && c.y < base + R, `hit: half buried (centre ${(c.y - base).toFixed(2)} above the ground)`);
        assert.ok(Math.abs(c.z - TOWER_AT.z) < 0.5, 'hit: beside the tower, not in front of or behind it');
        assert.ok(dist3(c, G) < 1e-6, 'hit: at METEOR_REST');
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
      // 撞上那一刻卡在塔的西面、彎角高度（停 HIT_HANG 秒，塔在這時折下去），再 HIT_DROP 秒掉到地上
      step(p, 0.1); const c = bodyWorld(p), face = T.x - 0.58;
      assert.ok(c.x < face && face - c.x < R, `hit: against the west face at impact (centre ${(face - c.x).toFixed(2)} out of it)`);
      assert.ok(Math.abs(c.y - T.y) < 0.5, `hit: at the bend height at impact (${(c.y - T.y).toFixed(2)})`);
      assert.equal(trailOf(p).visible, false, 'the trail goes out at impact');
      assert.ok(!sameMatrix(p, finalOf('hit')), 'hit: not on the ground yet');
      let last = c.y;
      for (let u = 0; u < HIT_HANG + HIT_DROP - 0.15; u += 0.1) { step(p, 0.1); const y = bodyWorld(p).y; assert.ok(y <= last + 1e-9, 'hit: only ever falls after the impact'); last = y; }
      step(p, 0.2); assert.ok(sameMatrix(p, finalOf('hit')), 'hit: on the ground after FLIGHT + HIT_HANG + HIT_DROP'); assert.equal(trailOf(p).visible, false);
    }
    // 2 倍速
    p.object.userData.launch({ speed: 2 }); step(p, (FLIGHT + HIT_HANG + HIT_DROP) / 2 + 0.05);
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
  const [warn, full] = finaleEvents(resolve(s, spec)), { epilogue, ...e } = full;   // 這幾局後面都接收尾（計畫 17）：隕石本身的測試照沒有收尾的版本演（最後回全景停 HOLD_END）
  assert.equal(warn.kind, 'warning');
  await h.run([warn], { finale: true, instant: true });
  return { ...h, e, epilogue };
}

test('meteor script live, each outcome: ≤ 10 s real, ！ from the crowd mid-fall, then ♥+jump (shield) / ？ then ♪ (deflect) / mood lie (hit); the camera watches from the WIDE framing, back on the overview at the end', async () => {
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const { show, run, bubblesLog, worldLog, rig, e, people } = await missileShow(outcome);
    const crowdSize = Math.min(24, islanders({ roster: show.roster }).length);
    assert.ok(crowdSize >= 6, `${outcome}: islanders (${crowdSize})`);
    const n0 = bubblesLog.length, w0 = worldLog.length, r0 = rig.log.length, said = [], main0 = show.stage.partObject('tower.main'), shield0 = show.stage.partObject('tower.shield');
    let launchAt = null, bendAt = null, shieldAt = null, lieAt = null, jumpers = 0, seen = n0, named = null;
    const domeSeen = [];   // 罩子亮起之後每幀的 [距撞上的秒數, 看得見, 不透明度]（擋完隕石就淡掉藏起來，使用者 2026-11-04）
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
      if (shieldAt !== null) { const d = show.stage.partObject('tower.shield')?.children[0]; domeSeen.push([now - shieldAt, !!d?.visible, d?.material.opacity ?? 0]); }
      if (lieAt === null && worldLog.slice(w0).some(([w]) => w.mood === 'lie')) lieAt = now;
      jumpers = Math.max(jumpers, everyone(show).filter(m => m.walker?.gesture?.kind === 'jump').length);
    };
    await run([e], { finale: true });
    show.update = update;
    const secs = show.elapsed, of = k => said.filter(b => b.kind === k);
    assert.ok(secs <= 10, `${outcome}: ≤ 10 s real (${secs.toFixed(2)})`);
    assert.ok(launchAt !== null && launchAt >= 0.8 - 1e-6, `${outcome}: falls after the 0.8 s WIDE framing beat`);
    assert.ok(!show.stage.partKeys().includes('finale.star'), 'the star is out');
    const bang = of('！').filter(b => b.t < launchAt + FLIGHT - 0.05);   // R49：吹偏時溫泉客逃出池子另外冒的「！」（FLIGHT 之後）不算全島那一聲
    assert.ok(named >= crowdSize - 2, `${outcome}: about everyone is still on the island (${named}/${crowdSize})`);
    assert.equal(bang.length, named, `${outcome}: everyone (≤ 24) says ！`);
    assert.ok(Math.abs(bang[0].t - launchAt - FLIGHT / 2) < 0.15, `${outcome}: ！ mid-flight (${(bang[0].t - launchAt).toFixed(2)} s after launch)`);
    const impact = launchAt + FLIGHT + (outcome === 'deflect' ? DEFLECT : 0) - 0.05;
    if (outcome === 'shield') {
      assert.ok(shieldAt >= impact, 'the dome lights up at impact');
      // 煙火（撞上之後 1.2 s 內放完）那段罩子全亮看得見；撞上 SHIELD.fade[1]（1.6 s）之後藏起來
      const during = domeSeen.filter(([t]) => t < SHIELD.fade[0] - 0.05), after = domeSeen.filter(([t]) => t >= SHIELD.fade[1] + 0.05);
      assert.ok(during.length && during.every(([, v, op]) => v && Math.abs(op - SHIELD.full) < 1e-9), 'the dome is full during the fireworks');
      assert.ok(after.length && after.every(([, v]) => !v), `the dome is gone ≥ ${SHIELD.fade[1]} s after impact`);
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

// R49（使用者 2026-11-06：隕石砸到溫泉裡時裡面還有人很奇怪）：吹偏的隕石撞到塔頂被風吹偏那一刻（FLIGHT）起，兩位溫泉客從池裡爬出來、
// 小跑（DASH）到池子東側池緣外（landmarks.BATHERS_OUT）——隕石掉進池子（FLIGHT + DEFLECT）之前 0.2 s 已經離池心 ≥ SOAK_R + 0.8；
// 吹偏之前還泡在池裡；跑的時候兩人 ≥ 0.25；頭上「！」；演完放回日常、站在 BATHERS_OUT（新站位，不走回池子）；跳過的終態一樣；整段 live 不變長（≤ 舊秒數 + 0.6）
import * as landmarksMod from '../src/actors/landmarks.js';
test('R49 deflect: the bathers climb out when the meteor glances off 101 and reach the east rim (≥ SOAK_R + 0.8 from the pool centre) before it lands, saying ！; released at BATHERS_OUT; skip ends the same; no longer than before', async () => {
  const SPRING = landmarkWorld('spring'), off = m => Math.hypot(m.pos.x - SPRING.x, m.pos.z - SPRING.z);
  const { BATHERS_OUT, SOAK_R } = landmarksMod;
  const { show, run, e, bubblesLog } = await missileShow('deflect');
  const bathers = () => show.roster.members('landmarks.bathers');
  assert.equal(bathers().length, 2);
  for (const m of bathers()) assert.ok(off(m) < SOAK_R + 0.05, 'soaking before the meteor');
  const b0 = bubblesLog.length, heads = new Set(bathers().map(m => m.walker));
  let launchAt = null, apart = Infinity; const track = [];
  const update = show.update.bind(show);
  show.update = (dt, t) => {
    update(dt, t);
    if (launchAt === null && show.stage.partKeys().includes('finale.missile')) launchAt = show.elapsed;
    if (launchAt === null) return;
    const [a, b] = bathers();
    track.push([show.elapsed - launchAt, off(a), off(b)]); apart = Math.min(apart, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z));
  };
  await run([e], { finale: true });
  show.update = update;
  const secs = show.elapsed;
  assert.ok(secs <= 7.97 + 0.6, `no more than 0.6 s longer than before R49 (7.97 s; ${secs.toFixed(2)})`);
  const at = t => track.findLast(([tt]) => tt <= t);
  assert.ok(at(FLIGHT - 0.05).slice(1).every(d => d < SOAK_R + 0.05), `still soaking until the meteor glances off 101 (${at(FLIGHT - 0.05).slice(1).map(d => d.toFixed(2))})`);
  const before = at(FLIGHT + DEFLECT - 0.2);
  assert.ok(before.slice(1).every(d => d >= SOAK_R + 0.8), `out of the pool 0.2 s before the meteor lands (${before.slice(1).map(d => d.toFixed(2))})`);
  assert.ok(apart >= 0.25, `the two keep apart while running (${apart.toFixed(2)})`);
  assert.ok(track.every(([, a, b], i) => i === 0 || (Math.abs(a - track[i - 1][1]) < 0.4 && Math.abs(b - track[i - 1][2]) < 0.4)), 'no teleport');
  const bang = bubblesLog.slice(b0).filter(b => b.kind === '！').length;
  assert.ok(bang >= 1, '！ bubbles');
  bathers().forEach((m, i) => {
    const p = BATHERS_OUT[i];
    assert.ok(Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 0.1 && Math.abs(m.pos.y - p.y) < 0.02, `bather ${i} ends at BATHERS_OUT (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
    assert.equal(m.mode, 'home', `bather ${i} released`);
  });
  // 放回日常之後不走回池子
  for (let i = 0; i < 90; i++) show.update(1 / 30, 3000 + i / 30);
  bathers().forEach((m, i) => {
    assert.ok(Math.hypot(m.pos.x - BATHERS_OUT[i].x, m.pos.z - BATHERS_OUT[i].z) < 0.1, `bather ${i} stays at the rim`);
    const dy = Math.atan2(Math.sin(m.yaw - BATHERS_OUT[i].yaw), Math.cos(m.yaw - BATHERS_OUT[i].yaw));
    assert.ok(Math.abs(dy) < 0.6, `bather ${i} faces the pool (${dy.toFixed(2)} rad off)`);
  });
  // 跳過：終態一樣
  const skip = await missileShow('deflect');
  await skip.run([skip.e], { finale: true, instant: true });
  for (let i = 0; i < 30; i++) skip.show.update(1 / 30, i / 30);
  skip.show.roster.members('landmarks.bathers').forEach((m, i) => assert.ok(Math.hypot(m.pos.x - BATHERS_OUT[i].x, m.pos.z - BATHERS_OUT[i].z) < 0.1 && m.mode === 'home', `skip: bather ${i} at BATHERS_OUT`));
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
// 計畫 17 任務 3 修正輪 1：終局三個事件照 game.js 演成同一個 live 回合（隕石後面接收尾時不回全景停，收尾第一拍自己回全景）——
// 收尾從 WIDE 開始，第一拍 focus home 把鏡頭帶回全景，整段都在全景演；收尾 ≤ 12 s、終局 ≤ 22 s
test('cyber epilogue live (warning + meteor + epilogue in one live turn): night, black tower blinks in, the car flies in and parks within 4 s, no marquee text, the rats appear on the roof, all on the overview; ≤ 12 s real, finale ≤ 22 s', async () => {
  const h = await headlessShow(), { show, run, bubblesLog, worldLog, rig } = h;
  let s = createState(spec);
  for (const st of turnSteps(CYBER_ORDER)) {
    const r = st(s); s = r.state;
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  const evs = finaleEvents(resolve(s, spec)), epilogueEvent = evs[2];
  assert.equal(epilogueEvent?.ending, 'cyber'); assert.equal(evs[1].epilogue, 'cyber', 'the meteor knows an epilogue follows');
  let w0 = null, n0 = null, r0 = null, main0 = null, epi = null;
  const park = finale.view(LIT, { missile: 'shield', epilogue: 'cyber' }, LIT_META)['finale.car'].park;
  let darkAt = null, flyAt = null, parkedAt = null, ratsAt = null, maxBubbles = 0, homeAt = null;
  const update = show.update.bind(show), dt = 1 / 30;
  const carPos = () => { const o = show.stage.partObject('finale.car'); if (!o?.children[0]) return null; const p = o.children[0].position; return { x: o.position.x + p.x, y: o.position.y + p.y, z: o.position.z + p.z }; };
  const onRoof = () => show.roster.members('rat.pack').every(m => Math.abs(m.pos.y - ROOF_SPOTS[0].y) < 1e-6);
  show.update = (d, t) => {
    update(d, t);
    if (epi === null) return;
    const now = show.elapsed - epi;
    if (homeAt === null && rig.log.length > r0) homeAt = now;
    if (darkAt === null && show.stage.partObject('tower.main') !== main0) darkAt = now;
    const c = carPos();
    if (c && flyAt === null && dist3(c, park) > 1) flyAt = now;
    if (c && flyAt !== null && parkedAt === null && dist3(c, park) < 1e-6) parkedAt = now;
    if (ratsAt === null && onRoof()) ratsAt = now;
  };
  await run(evs, { finale: true, onMark: e => {
    if (e !== epilogueEvent) return;
    epi = show.elapsed; w0 = worldLog.length; n0 = bubblesLog.length; r0 = rig.log.length; main0 = show.stage.partObject('tower.main');
  } });
  show.update = update;
  const total = show.elapsed, secs = total - epi;
  assert.ok(secs <= 12, `≤ 12 s real (${secs.toFixed(2)})`);
  assert.ok(total <= 22, `finale ≤ 22 s real (${total.toFixed(2)})`);
  console.log(`cyber epilogue: ${secs.toFixed(2)} s real, finale ${total.toFixed(2)} s (dark ${darkAt?.toFixed(2)}, fly ${flyAt?.toFixed(2)}, parked ${parkedAt?.toFixed(2)}, rats ${ratsAt?.toFixed(2)})`);
  const w = worldLog.slice(w0).map(([x]) => x);
  assert.ok(w.some(x => x.time === TIMES.night && x.glowScale === NEON_BOOST), 'night, neon up');
  assert.ok(darkAt !== null && darkAt < flyAt, 'the black tower first');
  assert.ok(show.stage.partKeys().includes('tower.screen'), 'the screen is up');
  assert.ok(parkedAt !== null && parkedAt - flyAt <= CAR_FLIGHT + 0.05 && CAR_FLIGHT < 4.6, `the car parks ${(parkedAt - flyAt).toFixed(2)} s after take-off`);
  assert.ok(dist3(carPos(), park) < 1e-6, 'the car ends parked on the roof');
  assert.ok(!bubblesLog.slice(n0).some(b => b.kind && typeof b.kind === 'object' && 'text' in b.kind), 'no marquee text（2026-11-03 拿掉）');
  assert.ok(ratsAt !== null && ratsAt >= parkedAt, 'the rats line up after the car parks');
  const rats = show.roster.members('rat.pack');
  assert.equal(rats.length, 5, 'the army of five (user 2026-11-04)');
  for (const m of rats) assert.ok(dist3(m.pos, ROOF_SPOTS[m.i]) < 1e-6 && m.mode === 'home', `rat ${m.i} on its roof spot`);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  const cam = rig.log.slice(r0);
  assert.ok(cam.length && cam.every(([k]) => k === 'home'), `the camera stays on the overview (${cam.map(c => c[0]).join(' ')})`);
  // 隕石停在 WIDE、不回全景停（後面接收尾）：收尾第一拍就回全景，等 FOCUS_BEAT 鏡頭飛到才換黑塔
  assert.ok(homeAt !== null && homeAt <= 1 / 30 + 1e-6, `back to the overview right away (${homeAt?.toFixed(2)})`);
  assert.ok(darkAt - homeAt >= beatsMod.FOCUS_BEAT - 1e-6, `the black tower after the camera is home (${(darkAt - homeAt).toFixed(2)} s)`);
  // 跳過：終態一樣（車停好、5 隻在屋頂、螢幕在）
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
// 計畫 17（2026-11-04）：壞結局也有收尾事件；收尾劇本（災難版，任務 4）見下面「計畫 17 任務 4」那幾個測試
test('alien is a bad ending (變異鼠稱王) with an epilogue: before it the crowned mutant + the small UFO + the rocks-islet ring, no swarm, no landing UFOs', async () => {
  const { ENDINGS } = await import('../src/rules/endings.js');
  assert.deepEqual(EXAMPLE.alien, ALIEN_ORDER, 'EXAMPLE.alien is the first alien game (rat Lv4)');
  const h = await headlessShow();
  let s = createState(spec);
  for (const st of turnSteps(EXAMPLE.alien)) { const r = st(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(s.flags.ratBranch, 'alien'); assert.equal(s.lv.rat, 4);
  const ending = resolve(s, spec);
  assert.equal(ending.id, 'alien'); assert.equal(ENDINGS.alien.kind, 'bad'); assert.equal(ending.title, '變異鼠稱王');
  assert.equal(ending.missile, 'deflect', 'EXAMPLE.alien is a deflect game');
  const evs = finaleEvents(ending);
  assert.deepEqual(evs.map(e => e.kind), ['warning', 'missile', 'epilogue']);
  assert.equal(evs[2].ending, 'alien');
  await h.run(evs.slice(0, 2), { finale: true, instant: true });
  const { show } = h, [mutant] = show.roster.members('rat.pack');
  assert.equal(show.roster.members('rat.pack').length, 1);
  assert.ok(mutant.dress.crown && mutant.dress.eye && mutant.dress.h === 0.5, 'the crowned mutant');
  assert.ok(Math.hypot(mutant.pos.x - SHIP_SPOT.x, mutant.pos.z - SHIP_SPOT.z) > 1, 'not on a mothership yet');
  assert.equal(show.roster.members('rat.swarm').length, 0, 'no swarm yet');
  assert.ok(show.stage.partObject('rat.ufo'), 'the small UFO');
  assert.ok(show.stage.partObject('sat.rocksRing'), 'the green ring on the rocks islet');
  assert.ok(!show.stage.partKeys().some(k => k === 'finale.ufos' || k === 'finale.aliens'), 'no landing UFOs, no aliens yet');
  assert.equal(show.stage.flags.epilogue, undefined);
});

// ── 計畫 17 任務 3：大停電、捷運淹水收尾（設計 §4；終局回合 1 倍速，每段 ≤ 7.0 s 真實秒數，最後回全景停 END_HOLD）──
import * as tokenMod from '../src/actors/token.js';
import * as bobaMod from '../src/actors/boba.js';
import { gameInvariants } from './helpers/show.js';
import { cellTop as hexTop } from '../src/scene/hex.js';
const kinds = beats => beats.map(b => b.kind);
const fakeRoster = { members: () => [], keys: () => [], nearest: () => null };
// 從 EXAMPLE 的那一局把前面的回合瞬間演完，回 { h, show, evs }（終局三個事件：警告、隕石、收尾）
async function badGame(ending, order = EXAMPLE[ending]) {
  const h = await headlessShow();
  let s = createState(spec);
  for (const st of turnSteps(order)) { const r = st(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  const res = resolve(s, spec);
  assert.equal(res.id, ending, `${order.join(',')} reaches ${ending}`);
  const evs = finaleEvents(res);
  assert.deepEqual(evs.map(e => e.kind), ['warning', 'missile', 'epilogue']); assert.equal(evs[2].ending, ending);
  return { h, show: h.show, evs, state: s };
}
// 終局整段 live（警告＋隕石＋收尾），量收尾自己的秒數；每幀交給 sample(t)（t：收尾開始後幾秒，收尾之前是 null）
async function liveFinale(g, sample = () => {}) {
  const { h, show, evs } = g, inv = gameInvariants(show);
  inv.label(`${evs[2].ending} finale`);
  let epi = null;
  const update = show.update;
  show.update = (dt, t) => { update(dt, t); sample(epi === null ? null : show.elapsed - epi); };
  const t0 = show.elapsed;
  await h.run(evs, { finale: true, onMark: e => { if (e === evs[2]) epi = show.elapsed; } });
  show.update = update;
  const total = show.elapsed - t0, secs = show.elapsed - epi;
  for (const k of ['walls', 'jumps', 'pops']) assert.deepEqual([...inv[k]].slice(0, 10), [], `${evs[2].ending}: ${k}`);
  return { total, secs };
}

test('view: the blackout epilogue lights finale.beacon again on the 101 tip (the end of the fallen top after a hit), rate 1; other epilogues do not', () => {
  const { body, bendPoint: bend } = tower, lv0 = { milk: 4, chip: 2, bulb: 2, token: 1, typhoon: 3, rat: 2, boba: 1, baseball: 3 }, meta = { total: 18 };
  const b = finale.view(lv0, { alarm: 1, missile: 'hit', blackout: true, epilogue: 'blackout' }, meta)['finale.beacon'];
  assert.ok(b, 'the beacon'); assert.equal(b.kind, 'beacon'); assert.equal(b.rate, 1); assert.equal(b.footprint, false); assert.equal(b.shadow, false);
  const by = bend('half').y, tip = body('half').top;
  assert.ok(dist3(b.at, { x: TOWER0.x + (tip - (by - TOWER0.y)) + finale.BEACON_UP, y: by, z: TOWER0.z }) < 1e-9, `at the end of the fallen top (${b.at.x.toFixed(2)}, ${b.at.y.toFixed(2)})`);
  assert.ok(dist3(finale.beaconAt(lv0, { missile: 'hit' }, meta), b.at) < 1e-9);
  // 沒命中（大停電也可能被擋下、吹偏）：塔尖照舊
  const up = finale.view(lv0, { alarm: 1, missile: 'deflect', epilogue: 'blackout' }, meta)['finale.beacon'];
  assert.ok(dist3(up.at, { x: TOWER0.x, y: TOWER0.y + body('half').top + finale.BEACON_UP, z: TOWER0.z }) < 1e-9, 'on the spire when the tower stands');
  for (const epilogue of [undefined, 'flood', 'cyber', 'alien']) assert.equal(finale.view(lv0, { alarm: 1, missile: 'hit', epilogue }, meta)['finale.beacon'], undefined, `${epilogue}: no beacon after the meteor`);
});
test('beacon part: userData.setRate(2) doubles the pulse and the sweep from that moment on, without a jump in phase', () => {
  const spec0 = finale.view({ milk: 3, chip: 2 }, { alarm: 1 }, {})['finale.beacon'];
  const part = createPartFactory(THREE, { glow: createGlowRegistry(), people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders }).build(spec0);
  const beam = part.object.getObjectByName('beam'), yaw = t => { part.update(1 / 30, t); return beam.rotation.y; };
  assert.equal(part.object.userData.rate, 1);
  const a = yaw(1.0); part.object.userData.setRate(2); assert.equal(part.object.userData.rate, 2);
  const b = yaw(1.0); assert.ok(Math.abs(b - a) < 1e-9, 'no jump when the rate changes');
  const c = yaw(1.25);
  assert.ok(Math.abs(c - b - 2 * Math.PI * finale.BEACON_REV * 0.25 * 2) < 1e-9, 'twice the sweep');
  const hz = finale.FLARE_HZ, op = t => { part.update(1 / 30, t); return beam.material.opacity; };
  assert.ok(Math.abs(op(2 + 0.1 / hz) - op(2 + 0.1 / hz + 0.5 / hz)) < 1e-9, 'the pulse period is halved');
  part.dispose();
});
test('blackout epilogue beats: beacon back on (fold the flag), worldNow (pitch dark, everyone up), the camera close on the 101 tip (TIP_ZOOM), the beacon speeds up ×2 for 1.5 s, apply the rest, the overview hold', () => {
  const B = beatsMod.B, e = { kind: 'epilogue', ending: 'blackout', flag: { name: 'epilogue', value: 'blackout' } };
  const beats = finale.script.epilogue(e, { lv: {}, flags: {} }, { B, roster: fakeRoster });
  assert.deepEqual(kinds(beats), ['apply', 'world', 'focus', 'replay', 'apply', 'focus']);
  assert.deepEqual(beats[0].only, ['finale.beacon']);
  assert.equal(beats[1].effects, undefined, 'worldNow (world.js decides: pitch + normal mood)');
  assert.equal(typeof beats[2].target, 'function'); assert.equal(beats[2].kind, 'focus');
  assert.ok(finale.TIP_ZOOM < 0.6, `the tip is the subject: closer than a cell focus (zoom ${finale.TIP_ZOOM} × the overview distance)`);
  assert.equal(beats[3].dur, finale.SPEED_UP); assert.equal(finale.SPEED_UP, 1.5); assert.equal(finale.BEACON_FAST, 2);
  assert.equal(beats[4].only, undefined);
  assert.equal(beats[5].target, 'home'); assert.equal(beats[5].dur, 1.5);
});
test('flood epilogue beats (≈ 5.25 s): fold + worldNow, the camera pans to the token cell while the sheet rises 1.0 s, the boat blinks in at the door with two riders, rows 2.5 s while the boba owner jumps onto the roof in the last 0.5 s, homes, the overview hold', async () => {
  const B = beatsMod.B, e = { kind: 'epilogue', ending: 'flood', flag: { name: 'epilogue', value: 'flood' } };
  const beats = finale.script.epilogue(e, { lv: {}, flags: {} }, { B, roster: fakeRoster });
  assert.deepEqual(kinds(beats), ['apply', 'world', 'together', 'together', 'together', 'apply', 'home', 'apply', 'focus']);
  assert.deepEqual(beats[0].only, [], 'fold the flag first (nothing shows yet)');
  const [pan, sheet, rise] = beats[2].beats;
  assert.deepEqual([pan.kind, pan.target], ['focus', 'token']);
  assert.deepEqual(sheet.only, ['token.floodSheet']); assert.equal(sheet.blink, false);
  assert.deepEqual([rise.kind, rise.dur], ['move', 1.0]);
  assert.deepEqual(kinds(beats[3].beats), ['apply', 'move', 'board']); assert.deepEqual(beats[3].beats[0].only, ['token.boat']);
  const [row, jump] = beats[4].beats;
  assert.deepEqual([row.kind, row.dur], ['row', 2.5]);
  assert.deepEqual([jump.kind, jump.dur], ['later', 2.5], 'the owner lands as the boat stops'); assert.equal(finale.OWNER_JUMP, 0.5);
  assert.deepEqual(beats[5].only, ['token.swimmers', 'boba.owner']);
  assert.equal(beats[8].target, 'home'); assert.equal(beats[8].dur, 1.5);
  // 拍長加起來（平移與水升起同時、老闆在划船裡）：FLOOD_RISE ＋ BLINK ＋ BOAT_ROW ＋ END_HOLD ≈ 5.15 s
  const { BLINK: blink } = await import('../src/show/blink.js');
  const total = finale.FLOOD_RISE + blink + finale.BOAT_ROW + beats[8].dur;
  assert.ok(total <= 5.3, `≈ 5.25 s (${total.toFixed(2)})`);
});

test('blackout live from EXAMPLE.blackout (whole finale): pitch dark to the end, the beacon on the bent tip blinks twice as fast, nobody lying in the epilogue, invariants clean; epilogue ≤ 7.0 s, finale ≤ 16 s', async () => {
  const g = await badGame('blackout'), { show, h } = g, { people, worldLog, rig } = h;
  const lying = [];
  let w0 = null, r0 = null;
  const res = await liveFinale(g, t => {
    if (t === null) return;
    w0 ??= worldLog.length; r0 ??= rig.log.length;
    if (t > 0.3 && people.mood === 'lie') lying.push(t);
  });
  console.log(`blackout epilogue: ${res.secs.toFixed(2)} s, finale ${res.total.toFixed(2)} s (plan 17 task 3)`);
  assert.ok(res.secs <= 7.0, `epilogue ≤ 7.0 s (${res.secs.toFixed(2)})`);
  assert.ok(res.total <= 16, `finale ≤ 16 s (${res.total.toFixed(2)})`);
  assert.equal(show.stage.flags.epilogue, 'blackout');
  assert.deepEqual(lying, [], 'nobody lies during the epilogue');
  assert.equal(people.mood, 'normal');
  const w = worldLog.slice(w0).map(([x]) => x);
  assert.ok(w.length && w.every(x => x.time === TIMES.pitch), 'pitch dark from the epilogue on');
  assert.equal(worldLog.at(-1)[0].time, TIMES.pitch, 'still pitch dark at the end of the turn');
  const o = show.stage.partObject('finale.beacon');
  assert.ok(o, 'the beacon is on'); assert.equal(o.userData.rate, 2, 'blinking twice as fast');
  const spot = finale.beaconAt(show.stage.lv, show.stage.flags, show.stage.meta);
  assert.ok(dist3(o.position, spot) < 1e-9, 'on the bent tip');
  const cam = rig.log.slice(r0), tip = cam.find(([k]) => k === 'focus');
  assert.ok(tip && dist3(tip[1], spot) < 1e-9 && tip[2].zoom === finale.TIP_ZOOM, 'the camera goes to the 101 tip at TIP_ZOOM');
  assert.equal(cam.at(-1)[0], 'home');
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
});

test('flood live from EXAMPLE.flood (whole finale): the sheet rises over the cell, the boat rows from the door to the shore with the two swimmers seated, the boba owner on his (blown) cart, nobody lying; invariants clean; epilogue ≤ 7.0 s, finale ≤ 16 s', async () => {
  const g = await badGame('flood'), { show, h } = g, { people } = h;
  assert.ok(g.state.flags.flooded && g.state.flags.cartBlown, 'EXAMPLE.flood: flooded, and the cart was blown away');
  const lying = [], sheetY = [], boat = [], seatErr = [];
  let rowing = false;
  const res = await liveFinale(g, t => {
    if (t === null) return;
    if (t > 0.1 && people.mood === 'lie') lying.push(t);
    const s = show.stage.partObject('token.floodSheet'); if (s) sheetY.push(s.position.y);
    const b = show.stage.partObject('token.boat');
    if (b?.visible) boat.push({ ...b.position });
    const riders = show.roster.members('token.swimmers');
    if (b?.visible && riders.every(m => m.mode === 'script')) {
      rowing = true;
      riders.forEach((m, i) => { const q = tokenMod.boatSeat(i, b.position); seatErr.push(Math.hypot(m.pos.x - q.x, m.pos.y - q.y, m.pos.z - q.z)); });
    }
  });
  console.log(`flood epilogue: ${res.secs.toFixed(2)} s, finale ${res.total.toFixed(2)} s (plan 17 task 3)`);
  assert.ok(res.secs <= 7.0, `epilogue ≤ 7.0 s (${res.secs.toFixed(2)})`);
  assert.ok(res.total <= 16, `finale ≤ 16 s (${res.total.toFixed(2)})`);
  assert.deepEqual(lying, [], 'nobody lies during the epilogue'); assert.equal(people.mood, 'normal');
  const spec0 = tokenMod.view(show.stage.lv, show.stage.flags)['token.floodSheet'];
  assert.ok(Math.min(...sheetY) < hexTop([0, 1]) - 0.02, 'the sheet starts under the ground');
  assert.ok(Math.abs(sheetY.at(-1) - spec0.at.y) < 1e-9, 'and ends risen (top 0.08 over the ground)');
  assert.ok(sheetY.every((y, i) => !i || y >= sheetY[i - 1] - 1e-9), 'rising only');
  assert.ok(boat.length && Math.hypot(boat[0].x - tokenMod.BOAT_FROM.x, boat[0].z - tokenMod.BOAT_FROM.z) < 1e-6, 'the boat shows up at the station door');
  assert.ok(dist3(boat.at(-1), tokenMod.BOAT_TO) < 1e-9, 'and ends at the south-east shore');
  assert.ok(rowing && Math.max(...seatErr) < 1e-6, `the two riders sit on the boat while it rows (${Math.max(...seatErr).toExponential(1)})`);
  const riders = show.roster.members('token.swimmers');
  assert.equal(riders.length, 2);
  riders.forEach((m, i) => { assert.ok(dist3(m.pos, tokenMod.boatSeat(i)) < 1e-6, `rider ${i} stays seated`); assert.equal(m.mode, 'home'); });
  const [owner] = show.roster.members('boba.owner'), perch = bobaMod.floodPerch(show.stage.lv, show.stage.flags);
  assert.ok(dist3(owner.pos, perch) < 1e-6 && owner.mode === 'home', `the boba owner on his cart (${owner.pos.x.toFixed(2)}, ${owner.pos.y.toFixed(2)}, ${owner.pos.z.toFixed(2)})`);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  // 標題卡底下再走 3 秒：船上的人、攤車上的老闆都不動
  const p0 = [...riders, owner].map(m => ({ ...m.pos }));
  for (let i = 0; i < 90; i++) show.update(1 / 30, 5000 + i / 30);
  [...riders, owner].forEach((m, i) => assert.ok(dist3(m.pos, p0[i]) < 1e-6, `${m.key} stays put`));
});

test('skip mid-epilogue (blackout, flood): the final state at once — beacon fast and pitch dark; sheet up, boat at the shore, riders seated, owner on the cart; nobody in script mode', async () => {
  for (const ending of ['blackout', 'flood']) {
    for (const frames of [10, 60, 120]) {
      const g = await badGame(ending), { show, h } = g;
      await h.run(g.evs.slice(0, 2), { finale: true, instant: true });
      const p = show.turn([g.evs[2]], { finale: true });
      for (let i = 0; i < frames; i++) { show.update(1 / 30, i / 30); await Promise.resolve(); }
      show.skip(); await p;
      const what = `${ending} skipped after ${frames} frames`;
      assert.equal(show.stage.flags.epilogue, ending, what);
      assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, `${what}: nobody in script mode`);
      assert.equal(h.worldLog.at(-1)[0].mood, 'normal', `${what}: standing`);
      if (ending === 'blackout') {
        assert.equal(h.worldLog.at(-1)[0].time, TIMES.pitch, `${what}: pitch dark`);
        assert.equal(show.stage.partObject('finale.beacon')?.userData.rate, 2, `${what}: beacon fast`);
      } else {
        const sheet = show.stage.partObject('token.floodSheet'), spec0 = tokenMod.view(show.stage.lv, show.stage.flags)['token.floodSheet'];
        assert.ok(sheet && Math.abs(sheet.position.y - spec0.at.y) < 1e-9, `${what}: sheet up`);
        assert.ok(dist3(show.stage.partObject('token.boat').position, tokenMod.BOAT_TO) < 1e-9, `${what}: boat at the shore`);
        show.roster.members('token.swimmers').forEach((m, i) => assert.ok(dist3(m.pos, tokenMod.boatSeat(i)) < 1e-6, `${what}: rider ${i} seated`));
        const [owner] = show.roster.members('boba.owner');
        assert.ok(dist3(owner.pos, bobaMod.floodPerch(show.stage.lv, show.stage.flags)) < 1e-6, `${what}: owner on the cart`);
      }
    }
  }
});

// 計畫 17 任務 3 裁決：隕石事件帶 epilogue（後面接收尾）時，最後不回全景停 HOLD_END（收尾第一拍自己接手鏡頭）；人照樣放回日常、剩下的照樣套用
test('meteor beats: with an epilogue following (e.epilogue) the tail drops the overview hold; without, it ends on focus home + HOLD_END', () => {
  const B = beatsMod.B, ctx = { B, roster: fakeRoster };
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const e = { kind: 'missile', outcome, flag: { name: 'missile', value: outcome } };
    const plain = finale.script.missile(e, { lv: {}, flags: {} }, ctx), chained = finale.script.missile({ ...e, epilogue: 'flood' }, { lv: {}, flags: {} }, ctx);
    assert.deepEqual(plain.slice(-3).map(b => [b.kind, b.target, b.dur]).slice(-1), [['focus', 'home', finale.HOLD_END]], `${outcome}: overview hold`);
    assert.deepEqual(kinds(chained), kinds(plain).slice(0, -1), `${outcome}: the same beats minus the hold`);
    assert.deepEqual(kinds(chained).slice(-2), ['apply', 'home']);
  }
});

// ── 計畫 17 任務 4：變異鼠稱王（災難版）收尾（設計 §4 alien；協調者裁決：整段 ≤ 5.5 s 真實秒數——外星局也可能是吹偏局，
//   警告＋吹偏的隕石已經 10.2 s，壞結局終局上限 16 s）──
import * as ratMod from '../src/actors/rat.js';
const ROCKS0 = island('rocks');
// 外星的命中局：列舉裡第一條結局是外星、隕石命中的放法（EXAMPLE.alien 是吹偏局）；pace 的「老鼠跑遠」局也是外星命中局
const ALIEN_HIT = enumerate(spec).find(r => r.ending.id === 'alien' && missileOf(r.state, spec) === 'hit').order;
const swarmOf = show => show.roster.members('rat.swarm');
test('alien epilogue beats (≤ 5.5 s): the spring shot + the king waves ！ (fold, stand up), then one segment — rats from the park rush 101 while everyone hides, the camera goes to the rocks islet, UFOs land, aliens out — then home: mothership + rats and king blink onto the saucer, third eyes + come out + ♥, the rest, the overview hold', async () => {
  const B = beatsMod.B, e = { kind: 'epilogue', ending: 'alien', flag: { name: 'epilogue', value: 'alien' } };
  const beats = finale.script.epilogue(e, { lv: {}, flags: {} }, { B, roster: fakeRoster });
  assert.deepEqual(kinds(beats), ['together', 'together', 'together', 'home', 'together', 'apply', 'focus']);
  const [open, swarm, ship, , out, rest, hold] = beats;
  assert.deepEqual(kinds(open.beats), ['apply', 'world', 'focus', 'gesture', 'bubble']);
  assert.deepEqual(open.beats[0].only, [], 'fold the flag first');
  assert.deepEqual(open.beats[1].effects, { mood: 'normal' }, 'stand up (after a hit) — the third eyes come at the end');
  assert.ok(dist3(open.beats[2].target, landmarkWorld('spring')) < 1e-9, 'the spring');
  assert.equal(open.beats[3].dur, finale.WAVE); assert.equal(open.beats[4].dur, finale.WAVE);
  assert.equal(swarm.beats[0].target, 'home');
  assert.deepEqual(swarm.beats[1].only, ['rat.pack', 'rat.swarm', 'rat.ufo', 'sat.rocks'], 'the small UFO and the two islet rats go as the swarm comes (skeletons ≤ 12)');
  assert.ok(swarm.beats.some(b => b.kind === 'later' && b.dur === finale.RUSH + beatsMod.FOCUS_BEAT), 'the rocks shot after the rush');
  assert.ok(swarm.beats.some(b => b.kind === 'later' && Math.abs(b.dur - (finale.RUSH + finale.UFO_FALL)) < 1e-9), 'the UFOs land in UFO_FALL');
  assert.equal(ship.beats[0].target, 'home');
  assert.deepEqual(kinds(out.beats), ['world', 'home', 'bubble']); assert.equal(out.beats[0].effects, undefined, 'worldNow: mood alien');
  assert.equal(out.beats[2].dur, finale.LOVE);
  assert.equal(rest.only, undefined);
  assert.equal(hold.target, 'home'); assert.equal(hold.dur, finale.ALIEN_END);
  assert.deepEqual(ship.beats[1].beat.only, ['tower.main', 'tower.antenna', 'tower.show', 'tower.shield', 'tower.scaffold', 'typhoon.main', 'typhoon.rain', 'typhoon.scooter'], 'the storm shrinks away as the mothership blinks in');
  const { BLINK: blink } = await import('../src/show/blink.js');
  const total = finale.WAVE + finale.RUSH + finale.UFO_FALL + finale.SHIP_WAIT + blink + finale.LOVE + finale.ALIEN_END;
  console.log(`alien epilogue nominal: ${total.toFixed(2)} s`);
  assert.ok(total <= 5.3, `nominal ≤ 5.3 s, frame rounding inside 5.5 (${total.toFixed(2)})`);
});

// 外星收尾 live（警告＋隕石＋收尾同一個 live 回合，同 game.js）：吹偏局（EXAMPLE.alien）與命中局（ALIEN_HIT）
async function alienLive(order) {
  const g = await badGame('alien', order), { show, h } = g, { people } = h;
  const hidden = [], lying = [], running = [];
  let r0 = null;
  const res = await liveFinale(g, t => {
    if (t === null) { r0 = h.rig.log.length; return; }   // 收尾開始前最後一幀的鏡頭紀錄長度（收尾第一拍的平移跟 mark 同一幀）
    if (t > 0.1 && people.mood === 'lie') lying.push(t);
    hidden.push(everyone(show).filter(m => m.hidden).length);
    running.push(swarmOf(show).filter(m => m.mode === 'script' && m.walking).length);
  });
  return { ...g, ...res, hidden, lying, running, cam: h.rig.log.slice(r0) };
}
const alienEnd = (show, h, what) => {
  const sw = swarmOf(show);
  assert.equal(sw.length, 5, `${what}: 5 mutants (user 2026-11-04)`);
  sw.forEach((m, i) => { assert.ok(dist3(m.pos, ratMod.SAUCER_SPOTS[i]) < 1e-6, `${what}: mutant ${i} on the saucer rim (${m.pos.x.toFixed(2)}, ${m.pos.y.toFixed(2)}, ${m.pos.z.toFixed(2)})`); assert.ok(m.dress.eye && !m.dress.crown, 'a mutant'); });
  const [king] = show.roster.members('rat.pack');
  assert.ok(dist3(king.pos, SHIP_SPOT) < 1e-6 && king.dress.crown, `${what}: the crowned king on the saucer top`);
  const main = show.stage.partObject('tower.main'); main.updateMatrixWorld(true);
  assert.ok(new THREE.Box3().setFromObject(main).min.y > TOWER0.y + 0.4, `${what}: 101 is the mothership (floating)`);
  const ufos = show.stage.partObject('finale.ufos');
  assert.ok(ufos && dist3(ufos.position, ROCKS0) < 1e-9, `${what}: three UFOs landed on the rocks islet`);
  assert.ok(show.stage.partObject('finale.aliens'), `${what}: the aliens are out`);
  assert.equal(show.stage.partObject('rat.ufo'), null, `${what}: no small UFO`);
  assert.equal(h.worldLog.at(-1)[0].mood, 'alien', `${what}: third eyes`);
  assert.equal(h.worldLog.at(-1)[0].storm, 0, `${what}: the storm cleared`);
  assert.ok(!show.stage.partKeys().some(k => k.startsWith('typhoon.') && ['typhoon.main', 'typhoon.rain', 'typhoon.scooter'].includes(k)), `${what}: no storm cloud, rain or scooter`);
  assert.equal(everyone(show).filter(m => m.hidden).length, 0, `${what}: nobody hidden`);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, `${what}: nobody in script mode`);
};
test('alien live from EXAMPLE.alien (deflect) and the first alien hit game (whole finale as one live turn): the swarm rushes 101 while the islanders hide, all come out with the third eye; mothership, king and 5 mutants on the saucer, UFOs landed; invariants clean; epilogue ≤ 5.5 s, finale ≤ 16 s', async () => {
  for (const [what, order, outcome] of [['deflect', EXAMPLE.alien, 'deflect'], ['hit', ALIEN_HIT, 'hit']]) {
    const r = await alienLive(order), { show, h } = r;
    assert.equal(show.stage.flags.missile, outcome, `${what}: meteor ${outcome}`);
    console.log(`alien epilogue (${what}): ${r.secs.toFixed(2)} s, finale ${r.total.toFixed(2)} s (plan 17 task 4)`);
    assert.ok(r.secs <= 5.5, `${what}: epilogue ≤ 5.5 s (${r.secs.toFixed(2)})`);
    assert.ok(r.total <= 16, `${what}: finale ≤ 16 s (${r.total.toFixed(2)})`);
    assert.deepEqual(r.lying, [], `${what}: nobody lies during the epilogue`);
    assert.ok(Math.max(...r.hidden) >= 10, `${what}: the islanders hide (${Math.max(...r.hidden)} at once)`);
    assert.ok(Math.max(...r.running) >= 5, `${what}: the mutants rush (${Math.max(...r.running)} running at once)`);
    alienEnd(show, h, what);
    // 鏡頭：溫泉 → 全景 → 石堆島 → 全景（最後一拍）
    const shots = r.cam.filter(([k]) => k === 'focus' || k === 'home').map(([k, p]) => (k === 'home' ? 'home' : dist3(p, landmarkWorld('spring')) < 1e-6 ? 'spring' : dist3(p, ROCKS0) < 1e-6 ? 'rocks' : 'other'));
    assert.deepEqual(shots.filter((x, i) => x !== shots[i - 1]), ['spring', 'home', 'rocks', 'home'], `${what}: camera ${shots.join(' ')}`);
  }
});
test('skip mid-epilogue (alien): the final state at once — nobody hidden, nobody in script mode, king + mutants on the saucer, UFOs landed, third eyes', async () => {
  for (const frames of [10, 40, 80, 120, 150]) {
    const g = await badGame('alien'), { show, h } = g;
    await h.run(g.evs.slice(0, 2), { finale: true, instant: true });
    const p = show.turn([g.evs[2]], { finale: true });
    for (let i = 0; i < frames; i++) { show.update(1 / 30, i / 30); await Promise.resolve(); }
    show.skip(); await p;
    alienEnd(show, h, `alien skipped after ${frames} frames`);
  }
});

// 審稿：躲進門的那一拍有上限（RUSH ＋ UFO_FALL）——離門很遠的人到時候就在原地藏起來，第二段不會被拉長（吹偏局的終局只剩 0.43 s）
test('alien hide beat is capped at RUSH + UFO_FALL: a far-away islander hides when the cap runs out (segment 2 never stretches)', () => {
  const B = beatsMod.B, far = { x: 40, y: 0, z: 0 };
  const m = { pos: { x: 0, y: 0, z: 0 }, head: () => ({ x: 0, y: 0.5, z: 0 }), hidden: false, speed: 1.6, mode: 'home' };
  const ctx = {
    B, stage: { footprints: () => [{ x: TOWER0.x, z: TOWER0.z, w: 1.6, d: 1.6 }] },
    nav: { nearestWalkable: () => far, route: (a, b) => [{ ...a }, { ...b }], routeLength: r => Math.hypot(r[1].x - r[0].x, r[1].z - r[0].z), version: 0 },
    roster: { claim() {}, setPose(mm, p) { mm.pos = { x: p.x, y: p.y ?? 0, z: p.z }; }, hide(mm) { mm.hidden = true; } },
  };
  const beat = finale.hideBeat(B, m);
  assert.notEqual(beat.start(ctx), false);
  const cap = finale.RUSH + finale.UFO_FALL, d = typeof beat.dur === 'function' ? beat.dur(ctx) : beat.dur;
  assert.ok(d <= cap + 1e-9, `capped (${d.toFixed(2)} ≤ ${cap}) though the door is 40 m away (${(40 / 2).toFixed(1)} s at HURRY)`);
  for (let t = 0; t < d; t += 1 / 30) beat.step(Math.min(1, t / d), 1 / 30, ctx);
  beat.end(ctx);
  assert.ok(m.hidden, 'hidden when the cap runs out');
});

// ── 計畫 17 任務 5：大巨蛋淹水、珍奶攤被吹走、鮮奶過期收尾（設計 §4；終局回合 1 倍速，真實秒數）──
// 三個結局在全枚舉裡都沒有吹偏局（domeFlood、milkExpired 全是命中；cartBlown 命中 1414 局、擋下 4 局），所以每段 ≤ 7.0 s；
// cartBlown 的擋下局也整段量一次（終局 ≤ 16 s）
import * as baseballMod from '../src/actors/baseball.js';
import * as milkMod from '../src/actors/milk.js';
const flatten = bs => bs.flatMap(b => (b.kind === 'together' ? flatten(b.beats) : b.kind === 'later' ? [b, ...flatten([b.beat])] : [b]));
test('endings reachability: domeFlood and milkExpired only after a hit, cartBlown after a hit or (4 games) a shield — never a deflect', () => {
  const all = enumerate(spec), by = id => new Set(all.filter(r => r.ending.id === id).map(r => missileOf(r.state, spec)));
  assert.deepEqual([...by('domeFlood')], ['hit']); assert.deepEqual([...by('milkExpired')], ['hit']);
  assert.deepEqual([...by('cartBlown')].sort(), ['hit', 'shield']);
});
test('domeFlood epilogue beats (≈ 4 s): fold + worldNow, the camera to the ballpark while the first player pulls the rod (knock) and the fish leaps 0.8 s, ♪ + ！, the rest, the overview hold', () => {
  const B = beatsMod.B, e = { kind: 'epilogue', ending: 'domeFlood', flag: { name: 'epilogue', value: 'domeFlood' } };
  const beats = finale.script.epilogue(e, { lv: {}, flags: {} }, { B, roster: fakeRoster });
  assert.deepEqual(kinds(beats), ['apply', 'world', 'together', 'together', 'apply', 'focus']);
  assert.deepEqual(beats[0].only, []); assert.equal(beats[1].effects, undefined, 'worldNow');
  const [pan, knock, leap] = beats[2].beats;
  assert.deepEqual([pan.kind, pan.target], ['focus', 'baseball']);
  assert.deepEqual([knock.kind, knock.dur], ['gesture', 1.0]);
  assert.equal(leap.kind, 'later'); assert.equal(leap.dur, finale.KNOCK_LEAD + finale.FISH_LEAP); assert.equal(finale.FISH_LEAP, 0.8);
  const inner = flatten([leap.beat]);
  assert.deepEqual(inner.find(b => b.kind === 'apply').only, ['baseball.fish']); assert.equal(inner.find(b => b.kind === 'apply').blink, false);
  assert.deepEqual([inner.find(b => b.kind === 'leap').dur], [0.8]);
  assert.deepEqual(kinds(beats[3].beats), ['bubble', 'bubble']);
  assert.equal(beats[5].target, 'home'); assert.equal(beats[5].dur, 1.5);
});
test('cartBlown epilogue beats (≈ 5 s): fold + worldNow, the camera to the sea off the east shore while the boat blinks in and the owner walks to the quay, he hops aboard, the boat rows 2.0 s while the cart drifts 1.2 out (2.0 s) and the owner ！, home, the overview hold', () => {
  const B = beatsMod.B, e = { kind: 'epilogue', ending: 'cartBlown', flag: { name: 'epilogue', value: 'cartBlown' } };
  const beats = finale.script.epilogue(e, { lv: {}, flags: {} }, { B, roster: fakeRoster });
  assert.deepEqual(kinds(beats), ['apply', 'world', 'together', 'jump', 'together', 'apply', 'home', 'apply', 'focus']);
  assert.deepEqual(beats[0].only, []);
  assert.deepEqual(kinds(beats[2].beats), ['focus', 'apply', 'move', 'walk']); assert.deepEqual(beats[2].beats[1].only, ['boba.boat']); assert.equal(beats[2].beats[2].dur, 0);
  assert.equal(beats[3].dur, finale.BOAT_HOP);
  const [row, cart, drift, shout] = beats[4].beats;
  assert.deepEqual([row.kind, row.dur], ['row', 2.0]);
  assert.deepEqual(cart.only, ['boba.main']); assert.equal(cart.blink, false);
  assert.deepEqual([drift.kind, drift.dur], ['move', 2.0]);
  assert.equal(shout.kind, 'later'); assert.equal(shout.beat.kind, 'bubble'); assert.ok(shout.dur <= 2.0);
  assert.deepEqual(beats[5].only, ['boba.owner']);
  assert.equal(beats[8].target, 'home'); assert.equal(beats[8].dur, 1.5);
});
test('milkExpired epilogue beats (≈ 4.5 s): fold + worldNow, the camera to the milk cell while the expired crate blinks in (no pupils: R38), it waddles to the west shore 1.5 s, falls 0.5 s with a splash, the rest, the overview hold', () => {
  const B = beatsMod.B, e = { kind: 'epilogue', ending: 'milkExpired', flag: { name: 'epilogue', value: 'milkExpired' } };
  const beats = finale.script.epilogue(e, { lv: {}, flags: {} }, { B, roster: fakeRoster });
  assert.deepEqual(kinds(beats), ['apply', 'world', 'together', 'waddle', 'together', 'apply', 'focus']);
  const [pan, crate, put] = beats[2].beats;
  assert.deepEqual([pan.kind, pan.target], ['focus', 'milk']);
  assert.deepEqual(crate.only, ['milk.crate']); assert.notEqual(crate.blink, false, 'the crate blinks');
  assert.deepEqual([put.kind, put.dur], ['move', 0]);
  assert.equal(beats[2].beats.length, 3, 'no pupil stare (R38, 使用者 2026-11-05: milkExpired always has milk 1, no school)');
  assert.equal(beats[3].dur, 1.5);
  const [fall, splash] = beats[4].beats;
  assert.deepEqual([fall.kind, fall.dur], ['fall', 0.5]);
  assert.deepEqual(splash.beat.only, ['finale.crateSplash']);
  assert.equal(beats[6].target, 'home'); assert.equal(beats[6].dur, 1.5);
});
test('view: the milkExpired epilogue puts a second splash (finale.crateSplash, white smoke) on the water where the crate falls; finale.splash stays at the pool (deflect only)', () => {
  const lv0 = { milk: 4, chip: 4, bulb: 4, token: 3, typhoon: 3, rat: 2, boba: 1, baseball: 3 };
  const v = finale.view(lv0, { alarm: 1, missile: 'hit', epilogue: 'milkExpired' }, {});
  const s = v['finale.crateSplash'];
  assert.ok(s); assert.equal(s.kind, 'smoke'); assert.equal(s.footprint, false);
  assert.ok(Math.hypot(s.at.x - milkMod.CRATE_SEA.x, s.at.z - milkMod.CRATE_SEA.z) < 1e-9 && Math.abs(s.at.y - hexWaterY) < 1e-9, 'at the crate, on the water');
  assert.equal(v['finale.splash'], undefined);
  for (const epilogue of [undefined, 'flood', 'domeFlood', 'cartBlown']) assert.equal(finale.view(lv0, { alarm: 1, missile: 'hit', epilogue }, {})['finale.crateSplash'], undefined);
});
import { WATER_Y as hexWaterY } from '../src/scene/hex.js';

const flat2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const released = show => assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
const DOME_LV3 = enumerate(spec).find(r => r.ending.id === 'domeFlood' && r.state.lv.baseball === 3).order;
const CART_SHIELD = enumerate(spec).find(r => r.ending.id === 'cartBlown' && missileOf(r.state, spec) === 'shield').order;
test('domeFlood live from EXAMPLE.domeFlood (Lv1, a player in the pool) and the first dome game (Lv3, two on the roof): the fish leaps 0.9 high, 0.5 toward the player and lands; ♪ (and ！ from someone else); nobody lying; invariants clean; epilogue ≤ 7.0 s, finale ≤ 16 s', async () => {
  for (const [what, order] of [['Lv1', EXAMPLE.domeFlood], ['Lv3', DOME_LV3]]) {
    const g = await badGame('domeFlood', order), { show, h } = g, { people, bubblesLog } = h;
    const lying = [], fish = [];
    let b0 = null;
    const res = await liveFinale(g, t => {
      if (t === null) { b0 = bubblesLog.length; return; }
      if (t > 0.3 && people.mood === 'lie') lying.push(t);
      const o = show.stage.partObject('baseball.fish'); if (o?.visible) fish.push({ ...o.position });
    });
    console.log(`domeFlood epilogue (${what}): ${res.secs.toFixed(2)} s, finale ${res.total.toFixed(2)} s (plan 17 task 5)`);
    assert.ok(res.secs <= 7.0, `${what}: epilogue ≤ 7.0 s (${res.secs.toFixed(2)})`); assert.ok(res.total <= 16, `${what}: finale ≤ 16 s (${res.total.toFixed(2)})`);
    assert.deepEqual(lying, [], `${what}: nobody lies`); assert.equal(people.mood, 'normal');
    const arc = baseballMod.fishArc(show.stage.lv.baseball);
    assert.ok(fish.length > 10, `${what}: the fish is seen`);
    assert.ok(flat2(fish[0], arc.from) < 0.05 && Math.abs(fish[0].y - arc.from.y) < 0.1, `${what}: jumps out of the water at the take-off spot`);
    assert.ok(Math.max(...fish.map(p => p.y)) > arc.to.y + 0.85, `${what}: an arc 0.9 high`);
    assert.ok(dist3(fish.at(-1), arc.to) < 1e-9, `${what}: lands on the water at the landing spot`);
    assert.equal(show.stage.partObject('baseball.fish').quaternion.w, 1, `${what}: lies flat at the end`);
    const said = bubblesLog.slice(b0).map(b => b.kind);
    assert.ok(said.includes('♪'), `${what}: ♪ (${said.join(' ')})`);
    if (what === 'Lv3') assert.ok(said.includes('！'), `${what}: the other player ！`);
    if (what === 'Lv3') show.roster.members('baseball.players').forEach(m => assert.ok(m.pos.y > anchorWorld('baseball').y + 0.9, 'still on the dome roof'));
    released(show);
  }
});
async function cartLive(order) {
  const g = await badGame('cartBlown', order), { show, h } = g, { people } = h;
  const lying = [], boat = [], cart = [], seatErr = [];
  const res = await liveFinale(g, t => {
    if (t === null) return;
    if (t > 0.3 && people.mood === 'lie') lying.push(t);
    const b = show.stage.partObject('boba.boat'), c = show.stage.partObject('boba.main');
    if (b?.visible) boat.push({ ...b.position });
    if (c) cart.push({ ...c.position });
    const [o] = show.roster.members('boba.owner');
    if (b?.visible && o.mode === 'script' && flat2(b.position, bobaMod.BOAT_START) > 0.05) { const q = bobaMod.boatSeat(b.position); seatErr.push(dist3(o.pos, q)); }
  });
  return { ...g, ...res, lying, boat, cart, seatErr };
}
const cartEnd = (show, what) => {
  assert.ok(dist3(show.stage.partObject('boba.boat').position, bobaMod.BOAT_END) < 1e-9, `${what}: the boat at BOAT_END`);
  assert.ok(dist3(show.stage.partObject('boba.main').position, bobaMod.CART_END) < 1e-9, `${what}: the cart drifted to CART_END`);
  const [o] = show.roster.members('boba.owner');
  assert.ok(dist3(o.pos, bobaMod.boatSeat()) < 1e-6, `${what}: the owner on the boat (${o.pos.x.toFixed(2)}, ${o.pos.y.toFixed(2)}, ${o.pos.z.toFixed(2)})`);
  released(show);
};
test('cartBlown live from EXAMPLE.cartBlown (hit) and the first shield game: the boat blinks in off the shore, the owner walks to the quay, hops on and rides it east while the cart drifts ≥ 1.0 further out toward it; ！; nobody lying; invariants clean; epilogue ≤ 7.0 s, finale ≤ 16 s', async () => {
  for (const [what, order, outcome] of [['hit', EXAMPLE.cartBlown, 'hit'], ['shield', CART_SHIELD, 'shield']]) {
    const r = await cartLive(order), { show, h } = r;
    assert.equal(show.stage.flags.missile, outcome);
    console.log(`cartBlown epilogue (${what}): ${r.secs.toFixed(2)} s, finale ${r.total.toFixed(2)} s (plan 17 task 5)`);
    assert.ok(r.secs <= 7.0, `${what}: epilogue ≤ 7.0 s (${r.secs.toFixed(2)})`); assert.ok(r.total <= 16, `${what}: finale ≤ 16 s (${r.total.toFixed(2)})`);
    assert.deepEqual(r.lying, [], `${what}: nobody lies`); assert.equal(h.people.mood, 'normal');
    assert.ok(r.boat.length && dist3(r.boat[0], bobaMod.BOAT_START) < 1e-6, `${what}: the boat shows up at the shore (BOAT_START)`);
    assert.ok(flat2(r.boat.at(-1), r.boat[0]) > 0.8, `${what}: the boat rowed toward the cart`);
    assert.ok(r.seatErr.length > 20 && Math.max(...r.seatErr) < 1e-6, `${what}: the owner rides aboard while it rows (${r.seatErr.length} frames)`);
    assert.ok(flat2(r.cart[0], bobaMod.BLOWN) < 1e-6, `${what}: the cart starts where it was blown`);
    assert.ok(flat2(r.cart.at(-1), r.cart[0]) >= 1.0, `${what}: drifted ≥ 1.0 further out`);
    assert.ok(h.bubblesLog.some(b => b.kind === '！'), `${what}: ！`);
    cartEnd(show, what);
    // 標題卡底下：老闆照樣站在船上
    const p0 = { ...show.roster.members('boba.owner')[0].pos };
    for (let i = 0; i < 90; i++) show.update(1 / 30, 5000 + i / 30);
    assert.ok(dist3(show.roster.members('boba.owner')[0].pos, p0) < 1e-6, `${what}: stays aboard`);
  }
});
const milkEnd = (show, what) => {
  const crate = show.stage.partObject('milk.crate');
  assert.ok(dist3(crate.position, milkMod.CRATE_SEA) < 1e-9, `${what}: the crate in the sea`);
  const spec0 = milkMod.view(show.stage.lv, show.stage.flags)['milk.crate'];
  assert.equal(spec0.parts.filter(p => p.kind === 'cylinder').length, 2, `${what}: the expired crate (legs)`);
  const s = show.stage.partObject('finale.crateSplash');
  assert.ok(s && flat2(s.position, milkMod.CRATE_SEA) < 1e-9, `${what}: splash where it fell`);
  released(show);
};
test('milkExpired live from EXAMPLE.milkExpired: the expired crate blinks in at CRATE, it waddles to the west shore, then drops 0.8 into the sea with a splash; nobody lying; invariants clean; epilogue ≤ 7.0 s, finale ≤ 16 s', async () => {
  const g = await badGame('milkExpired'), { show, h } = g, { people, bubblesLog } = h;
  const lying = [], crate = [];
  let b0 = null, firstSplash = null, swapped = false;
  const res = await liveFinale(g, t => {
    if (t === null) { b0 = bubblesLog.length; return; }
    if (t > 0.3 && people.mood === 'lie') lying.push(t);
    swapped ||= !!show.stage.flags.epilogue && show.stage.partObject('milk.crate')?.userData.showOffset !== undefined;
    const o = show.stage.partObject('milk.crate'); if (swapped && o) crate.push({ ...o.position, t });
    if (firstSplash === null && show.stage.partObject('finale.crateSplash')) firstSplash = crate.at(-1);
  });
  console.log(`milkExpired epilogue: ${res.secs.toFixed(2)} s, finale ${res.total.toFixed(2)} s (plan 17 task 5)`);
  assert.ok(res.secs <= 7.0, `epilogue ≤ 7.0 s (${res.secs.toFixed(2)})`); assert.ok(res.total <= 16, `finale ≤ 16 s (${res.total.toFixed(2)})`);
  assert.deepEqual(lying, [], 'nobody lies'); assert.equal(people.mood, 'normal');
  assert.ok(crate.length && dist3(crate[0], milkMod.CRATE) < 1e-6, 'the expired crate shows up where the crate was');
  const brink = crate.findIndex(p => dist3(p, milkMod.CRATE_BRINK) < 1e-6);
  assert.ok(brink > 0, 'walks to the west shore (CRATE_BRINK)');
  assert.ok(crate.slice(0, brink).every(p => Math.abs(p.z - milkMod.CRATE.z) < 1e-9 && p.y >= milkMod.CRATE.y - 1e-9), 'along x, on the ground (waddling)');
  assert.ok(crate.slice(1, brink).some(p => p.y > milkMod.CRATE.y + 0.01), 'with a waddle bob');
  assert.ok(crate.slice(brink).every((p, i, a) => !i || p.y <= a[i - 1].y + 1e-9), 'then only falls');
  assert.ok(firstSplash && firstSplash.y < milkMod.CRATE.y - 0.5, 'the splash when it reaches the water');
  // R38（使用者 2026-11-05）：鮮奶過期現在一定是被老鼠咬住的鮮奶 1（箱子，還沒有學校）——沒有學生，也沒有 ……
  assert.equal(show.roster.members('milk.kids').length, 0);
  assert.equal(bubblesLog.slice(b0).filter(b => b.kind === '……').length, 0, 'nobody ……');
  milkEnd(show, 'live');
});
test('skip mid-epilogue (domeFlood, cartBlown, milkExpired): the final state at once — fish landed, boat + owner + drifted cart, crate in the sea with the splash; nobody in script mode, nobody lying', async () => {
  for (const ending of ['domeFlood', 'cartBlown', 'milkExpired']) {
    for (const frames of [10, 40, 80, 120]) {
      const g = await badGame(ending), { show, h } = g;
      await h.run(g.evs.slice(0, 2), { finale: true, instant: true });
      const p = show.turn([g.evs[2]], { finale: true });
      for (let i = 0; i < frames; i++) { show.update(1 / 30, i / 30); await Promise.resolve(); }
      show.skip(); await p;
      const what = `${ending} skipped after ${frames} frames`;
      assert.equal(show.stage.flags.epilogue, ending, what);
      assert.equal(h.worldLog.at(-1)[0].mood, 'normal', `${what}: standing`);
      if (ending === 'domeFlood') {
        const o = show.stage.partObject('baseball.fish');
        assert.ok(o && dist3(o.position, baseballMod.fishArc(show.stage.lv.baseball).to) < 1e-9 && o.quaternion.w === 1, `${what}: the fish landed`);
        released(show);
      } else if (ending === 'cartBlown') cartEnd(show, what);
      else milkEnd(show, what);
    }
  }
});

// ── R47 大巨蛋鼠災收尾：整島都是老鼠（使用者 2026-11-06：我理想中的鼠災是整島都是老鼠）──
// 鏡頭到大巨蛋 → rat.plague（一個 InstancedMesh、PLAGUE_N 隻）閃白、RUSH 秒從門口撒滿七格；門口那兩隻名冊老鼠也往外跑、
// 鏡頭回全景；全島的人躲進門（hideBeat），拿水桶的工作人員（baseball.staff）留在門口追 → 全景停 PLAGUE_END。吹偏局：終局 ≤ 16 s
import { cellAt as hexCellAt } from '../src/scene/hex.js';
const staffOf = show => show.roster.members('baseball.staff') ?? [];
test('R47 domeRats epilogue beats (≤ 5.5 s): fold + worldNow + the ballpark; one segment — rat.plague blinks in and rushes RUSH while the gate rats run out, the camera home after 0.4 s, the islanders (not the staff) hide; they stay hidden; the rest; the overview hold', () => {
  const B = beatsMod.B, e = { kind: 'epilogue', ending: 'domeRats', flag: { name: 'epilogue', value: 'domeRats' } };
  const beats = finale.script.epilogue(e, { lv: {}, flags: {} }, { B, roster: fakeRoster });
  assert.deepEqual(kinds(beats), ['together', 'together', 'shelter', 'home', 'apply', 'focus']);
  const [open, plague, , , rest, hold] = beats;
  assert.deepEqual(kinds(open.beats), ['apply', 'world', 'focus']);
  assert.deepEqual(open.beats[0].only, [], 'fold the flag first');
  assert.equal(open.beats[1].effects, undefined, 'worldNow');
  assert.equal(open.beats[2].target, 'baseball');
  assert.deepEqual(plague.beats[0].only, ['rat.plague']);
  assert.equal(plague.beats[1].kind, 'plagueRush'); assert.equal(plague.beats[1].dur, finale.RUSH);
  assert.ok(plague.beats.some(b => b.kind === 'later' && b.beat.kind === 'blinkPart' && b.beat.key === 'rat.plague'), 'the plague blinks');
  assert.ok(plague.beats.some(b => b.kind === 'later' && b.beat.kind === 'focus' && b.beat.target === 'home' && Math.abs(b.dur - (0.4 + beatsMod.FOCUS_BEAT)) < 1e-9), 'back to the overview after 0.4 s');
  assert.equal(plague.beats.filter(b => b.kind === 'crowd').length, 3, 'the gate rats run out, the staff chase them; the islanders hide');
  assert.equal(rest.only, undefined);
  assert.equal(hold.target, 'home'); assert.equal(hold.dur, finale.PLAGUE_END);
  const total = beatsMod.FOCUS_BEAT + finale.RUSH + finale.UFO_FALL + finale.PLAGUE_END;
  console.log(`domeRats epilogue nominal: ${total.toFixed(2)} s`);
  assert.ok(total <= 5.0, `nominal ≤ 5.0 s (${total.toFixed(2)})`);
});
test('R47 EXAMPLE.domeRats (the video game) is a deflect game ending in 大巨蛋鼠災, now with an epilogue', async () => {
  const g = await badGame('domeRats');
  assert.equal(g.state.flags.domeRats, true);
  assert.equal(resolve(g.state, spec).missile, 'deflect');
  assert.deepEqual(g.evs.at(-1), { kind: 'epilogue', ending: 'domeRats', flag: { name: 'epilogue', value: 'domeRats' } });
});
// 終態：鼠群撒在七格、島民藏著（工作人員除外）、沒人在劇本手上、沒人躺著
const plagueEnd = (show, h, what) => {
  assert.equal(show.stage.flags.epilogue, 'domeRats', what);
  const o = show.stage.partObject('rat.plague'), meshes = [];
  o?.traverse(x => { if (x.isMesh) meshes.push(x); });
  assert.ok(o && o.visible && meshes.length === 1 && meshes[0].count === ratMod.PLAGUE_N, `${what}: the plague on the stage`);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), cells = new Set();
  for (let i = 0; i < meshes[0].count; i++) { meshes[0].getMatrixAt(i, m4); v.setFromMatrixPosition(m4); cells.add(String(hexCellAt(v.x, v.z))); }
  assert.equal(cells.size, 7, `${what}: rats all over the seven cells (${[...cells].join(' ')})`);
  const staff = staffOf(show);
  assert.equal(staff.length, 2, `${what}: two staff`); assert.ok(staff.every(m => !m.hidden), `${what}: the staff stay out`);
  // 工作人員在門口追老鼠（不是疊在一起、不在巨蛋後面）
  for (const m of staff) assert.ok(Math.hypot(m.pos.x - ratMod.GATE.x, m.pos.z - ratMod.GATE.z) < 1.2, `${what}: staff ${m.i} at the gate (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
  assert.ok(Math.hypot(staff[0].pos.x - staff[1].pos.x, staff[0].pos.z - staff[1].pos.z) > 0.3, `${what}: the two staff apart`);
  const out = everyone(show).filter(m => m.walker && !m.hidden && m.key !== 'baseball.staff' && hexCellAt(m.pos.x, m.pos.z));
  assert.deepEqual(out.map(m => `${m.key}#${m.i}`), [], `${what}: every islander indoors`);
  assert.ok(everyone(show).filter(m => m.hidden).length >= 10, `${what}: ${everyone(show).filter(m => m.hidden).length} hidden`);
  assert.deepEqual(everyone(show).filter(m => m.mode === 'script').map(m => `${m.key}#${m.i}`), [], `${what}: nobody in script mode`);
  assert.equal(h.worldLog.at(-1)[0].mood, 'normal', `${what}: nobody lying`);
};
test('R47 domeRats live from EXAMPLE.domeRats (deflect, whole finale as one live turn): the plague pours out of the gate onto all seven cells, the islanders hide, the staff stay with the rats; invariants clean; epilogue ≤ 5.5 s, finale ≤ 16 s', async () => {
  const g = await badGame('domeRats'), { show, h } = g, { people } = h;
  const lying = [], hidden = [];
  let firstRats = null;
  const res = await liveFinale(g, t => {
    if (t === null) return;
    if (t > 0.1 && people.mood === 'lie') lying.push(t);
    hidden.push(everyone(show).filter(m => m.hidden).length);
    const o = show.stage.partObject('rat.plague');
    if (!firstRats && o?.visible) { const m4 = new THREE.Matrix4(), v = new THREE.Vector3(); let mesh = null; o.traverse(x => { if (x.isMesh) mesh = x; }); mesh.getMatrixAt(0, m4); firstRats = v.setFromMatrixPosition(m4).clone(); }
  });
  console.log(`domeRats epilogue: ${res.secs.toFixed(2)} s, finale ${res.total.toFixed(2)} s (R47)`);
  assert.equal(show.stage.flags.missile, 'deflect');
  assert.ok(res.secs <= 5.5, `epilogue ≤ 5.5 s (${res.secs.toFixed(2)})`);
  assert.ok(res.total <= 16, `finale ≤ 16 s (${res.total.toFixed(2)})`);
  assert.deepEqual(lying, [], 'nobody lies');
  assert.ok(firstRats && Math.hypot(firstRats.x - ratMod.GATE.x, firstRats.z - ratMod.GATE.z) < 0.8, 'the plague shows up at the dome gate');
  assert.ok(Math.max(...hidden) >= 10, `the islanders hide (${Math.max(...hidden)})`);
  plagueEnd(show, h, 'live');
});
test('skip mid-epilogue (domeRats): the same final state at once — the plague all over, the islanders indoors, the staff out, nobody in script mode', async () => {
  for (const frames of [0, 10, 40, 80, 120]) {
    const g = await badGame('domeRats'), { show, h } = g;
    await h.run(g.evs.slice(0, 2), { finale: true, instant: true });
    const p = show.turn([g.evs[2]], { finale: true });
    for (let i = 0; i < frames; i++) { show.update(1 / 30, i / 30); await Promise.resolve(); }
    show.skip(); await p;
    plagueEnd(show, h, `domeRats skipped after ${frames} frames`);
  }
});
