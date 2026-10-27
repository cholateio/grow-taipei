// test/finale.test.js：最終章（計畫 5）——倒數回合的趕工地點、宣告、飛彈、尾聲
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { cellAt } from '../src/scene/hex.js';
import { frontOf } from '../src/actors/anchors.js';
import * as THREE from '../vendor/three/three.module.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createCameraRig } from '../src/scene/camera.js';
import { countdownEvent } from '../src/game.js';
import { headlessShow, turnSteps, closingEvents, overviewRig, ALL } from './helpers/show.js';
import { islanders } from '../src/show/crowd.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const RUSH = ['milk', 'chip', 'bulb', 'token', 'boba', 'baseball'];
const FRONT_TOL = 0.6;
// 兩條正解裡 rushSite 回了地點的每一級（「物品 級」；放置回合的 grow 也問，查的是地點本身）：寫死，少查一級、多查一級都要看到
const RUSH_COMMON = ['milk 2', 'milk 3', 'milk 4', 'milk 5', 'milk 6', 'milk 7', 'milk 8', 'milk 9', 'milk 10', 'chip 2', 'chip 3', 'chip 4', 'chip 5',
  'bulb 2', 'bulb 3', 'bulb 4', 'bulb 5', 'bulb 6', 'token 2', 'token 3', 'token 4', 'token 5', 'token 6', 'token 9', 'boba 2', 'boba 3',
  'baseball 2', 'baseball 3', 'baseball 4', 'baseball 5', 'baseball 6', 'baseball 7'];
const RUSH_SEEN = {
  'bulb,token,milk,chip,baseball,rat,boba,typhoon': RUSH_COMMON,                  // 外星（這條沒有珍奶 grow 到 Lv4 的事件）
  'bulb,token,milk,chip,baseball,boba,rat,typhoon': [...RUSH_COMMON, 'boba 4'],   // 賽博
};

// 趕工（設計 §5）：hero 走到 frontOf(site, r, nav)——請求的站位要在走路格上（nearestWalkable 拉回來不超過 0.6），site 本身在主島上。
// 查的時機是演到那個 grow 之前（走路與揮鋤頭都在 apply 之前）：照兩條正解一回合一回合瞬間演，每個 grow 先查再演
test('every rushSite point of both solutions lies on the main island and its frontOf(site, r, nav) is walkable (within 0.6 of the request)', async () => {
  for (const id of RUSH) assert.equal(typeof ALL.find(m => m.id === id).rushSite, 'function', `${id} has rushSite`);
  const bad = [], seen = {};
  for (const order of SOLUTIONS) {
    const mine = seen[order.join(',')] = new Set();
    const { show, run } = await headlessShow();
    let s = createState(spec);
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state;
      const events = i >= order.length ? closingEvents(i - order.length, r.events) : [...r.events, { kind: 'settle' }];
      for (const e of events) {
        const mod = e.kind === 'grow' && ALL.find(m => m.id === e.item);
        const site = mod?.rushSite?.(e.to, { lv: { ...show.stage.lv, [e.item]: e.to }, flags: show.stage.flags });
        if (site) {
          const what = `${order.join('>')} ${e.item} Lv${e.to}`, req = frontOf(site, site.r), got = show.nav.nearestWalkable(req), d = Math.hypot(got.x - req.x, got.z - req.z);
          mine.add(`${e.item} ${e.to}`);
          if (!cellAt(site.x, site.z)) bad.push(`${what}: site (${site.x.toFixed(2)}, ${site.z.toFixed(2)}) off the main island`);
          if (!Number.isFinite(site.y) || !(site.r > 0)) bad.push(`${what}: site needs y and r > 0`);
          if (d > FRONT_TOL) bad.push(`${what}: frontOf pulled ${d.toFixed(2)} > ${FRONT_TOL}`);
        }
        await run([e], { instant: true });
      }
    }
  }
  assert.deepEqual(bad, []);
  for (const order of SOLUTIONS) assert.deepEqual([...seen[order.join(',')]].sort(), RUSH_SEEN[order.join(',')].slice().sort(), `${order.join('>')}: rush sites checked`);
});

// ── 宣告（設計 §4，任務 3）──
const finale = ALL.find(m => m.id === 'finale');
const tower = ALL.find(m => m.id === 'tower');
const everyone = show => show.roster.keys().flatMap(k => show.roster.members(k));
// 正在被劇本點名看東西的人（gesture 演完會留在 walker 上一直朝那邊，所以只算被 claim 走的）
const looking = show => everyone(show).filter(m => m.mode === 'script' && m.walker?.gesture?.kind === 'look');
// 第一條正解放完八個（倒數回合之前）：島上有島民
async function placedShow() {
  const h = await headlessShow(), order = SOLUTIONS[0];
  let s = createState(spec);
  for (const step of turnSteps(order).slice(0, order.length)) {
    const r = step(s); s = r.state;
    await h.run([...r.events, { kind: 'settle' }], { instant: true });
  }
  return h;
}

test('view: alarm 3/2/1 draws the same finale.flare (no replacement, no re-blink); the part pulses 1/2/3 Hz from the stage flags; no alarm or missile set → no flare', () => {
  const lv = {};
  for (const n of [3, 2, 1]) {
    const f = finale.view(lv, { alarm: n })['finale.flare'];
    assert.ok(f, `alarm ${n}`);
    assert.equal(f.kind, 'flare'); assert.deepEqual(f.at, finale.FLARE_AT);
    assert.equal(f.shadow, false); assert.equal(f.footprint, false);
  }
  // 最終審稿：spec 不帶 hz，倒數 2、1 不換零件（換了就是回合末的 apply 再閃白一次）
  assert.deepEqual(finale.view(lv, { alarm: 2 }), finale.view(lv, { alarm: 3 }), 'alarm 2 = alarm 3');
  assert.deepEqual(finale.view(lv, { alarm: 1 }), finale.view(lv, { alarm: 3 }), 'alarm 1 = alarm 3');
  assert.deepEqual(finale.view(lv, {}), {});
  for (const missile of ['shield', 'deflect', 'hit']) assert.ok(!finale.view(lv, { alarm: 1, missile })['finale.flare'], `missile ${missile} puts the flare out`);
  // 零件：紅橘發光球 r 0.9＋半透明光柱高 6，都不投影；update 依舞台旗標（ctx.flags()，stage.js 交給零件工廠）的 alarm 脈動
  // （週期 1/hz 回到同一個強度）——同一個零件，旗標從 3 換到 2、1 就跟著變快
  const glow = createGlowRegistry(), flags = { alarm: 3 };
  const f = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders, flags: () => flags });
  const part = f.build(finale.view(lv, flags)['finale.flare']);
  const orb = part.object.getObjectByName('orb'), beam = part.object.getObjectByName('beam');
  orb.geometry.computeBoundingSphere(); assert.ok(Math.abs(orb.geometry.boundingSphere.radius - 0.9) < 0.02, 'orb r 0.9');
  assert.equal(orb.material.color.getHex(), 0xff5a3c); assert.equal(orb.material.emissive.getHex(), 0xff5a3c);
  beam.geometry.computeBoundingBox(); const bb = beam.geometry.boundingBox; assert.ok(Math.abs(bb.max.y - bb.min.y - 6) < 1e-6, 'column 6 high');
  assert.ok(beam.material.transparent && beam.material.opacity < 1 && !beam.material.depthWrite);
  part.object.traverse(o => { if (o.isMesh) assert.ok(!o.castShadow, 'no shadow'); });
  const m = part.materials[0], at = t => { part.update(0.1, t); return m.emissiveIntensity; };
  for (const [n, hz] of [[3, 1], [2, 2], [1, 3]]) {
    flags.alarm = n;
    assert.equal(finale.flareHz(n), hz);
    const a = at(0.1 / hz), b = at(0.6 / hz), c = at(1.1 / hz);
    assert.ok(Math.abs(a - b) > 0.3, `alarm ${n}: pulses at ${hz} Hz`); assert.ok(Math.abs(a - c) < 1e-9, `alarm ${n}: period 1/${hz} s`);
    assert.ok(Math.min(a, b) > 0, 'glows in daylight');
  }
  // 同一刻換旗標就換頻率（t = 0.25：1 Hz 在波峰，2 Hz 在中線）
  flags.alarm = 3; const slow = at(0.25); flags.alarm = 2; const fast = at(0.25);
  assert.ok(Math.abs(slow - fast) > 0.3, `the pulse speeds up on the same part (${slow.toFixed(2)} → ${fast.toFixed(2)})`);
  part.dispose();
});

test('countdown n=3 live: flare blinks in, visible islanders look at FLARE_AT and say ！, the digit 3 shows on 101 for 1.2 s real, everyone released; ≤ 5 s real at montage speed', async () => {
  const { show, run, bubblesLog } = await placedShow();
  const at = finale.FLARE_AT, n0 = bubblesLog.length, crowdSize = Math.min(24, islanders({ roster: show.roster }).length);
  assert.ok(crowdSize >= 6, `islanders on the island (${crowdSize})`);
  let lookers = 0, flareAt = null, digitAt = null, lookFrom = null, lookTo = null;
  // 泡泡交給 bubbles.show 的秒數就是真實秒數（beats.js 的 bubble 拍已經除掉倍速）
  const durs = [], showBubble = show.bubbles.show;
  show.bubbles.show = (head, kind, dur) => { durs.push([kind, dur]); return showBubble(head, kind, dur); };
  const update = show.update.bind(show);
  show.update = (dt, t) => {
    update(dt, t);
    const look = looking(show);
    if (look.length) { lookFrom ??= show.elapsed - dt; lookTo = show.elapsed; }
    for (const m of look) assert.ok(Math.abs(m.walker.gesture.yaw - Math.atan2(at.x - m.pos.x, at.z - m.pos.z)) < 1e-9, 'faces the flare');
    lookers = Math.max(lookers, look.length);
    if (flareAt === null && show.stage.partKeys().includes('finale.flare')) flareAt = show.elapsed;
    if (digitAt === null && bubblesLog.slice(n0).some(b => b.kind === '3')) digitAt = show.elapsed;
  };
  const secs = await run([countdownEvent(3), { kind: 'settle' }], { montage: true });
  show.update = update;
  assert.ok(flareAt !== null, 'the flare appears'); assert.ok(show.stage.partKeys().includes('finale.flare'), 'and stays');
  assert.equal(lookers, crowdSize, 'everyone (≤ 24) looks at the flare');
  const said = bubblesLog.slice(n0);
  assert.equal(said.filter(b => b.kind === '！').length, crowdSize, 'each looker says ！');
  const digits = said.filter(b => /^\d$/.test(b.kind));
  assert.deepEqual(digits.map(b => b.kind), ['3'], 'one digit');
  const head = show.stage.headOf('tower');
  assert.ok(Math.hypot(digits[0].at.x - head.x, digits[0].at.y - head.y, digits[0].at.z - head.z) < 1e-6, 'over 101');
  assert.ok(digitAt > flareAt, 'the digit comes after the flare');
  assert.ok(secs - digitAt >= 1.2 - 0.05, `the digit reads 1.2 s real (${(secs - digitAt).toFixed(2)})`);
  // 看與「！」各自的真實秒數：抬頭 LOOK 1.2 s（被點名看紅光到放回日常）、「！」SHOUT 0.8 s、數字 DIGIT 1.2 s
  assert.ok(Math.abs(lookTo - lookFrom - finale.LOOK) <= 2 / 30, `the look lasts ${finale.LOOK} s real (${(lookTo - lookFrom).toFixed(2)})`);
  const shouts = durs.filter(([k]) => k === '！');
  assert.equal(shouts.length, crowdSize);
  for (const [, d] of shouts) assert.ok(Math.abs(d - finale.SHOUT) < 1e-9, `！ ${finale.SHOUT} s real (${d})`);
  assert.deepEqual(durs.filter(([k]) => k === '3').map(([, d]) => Math.round(d * 1000) / 1000), [finale.DIGIT], `the digit ${finale.DIGIT} s real`);
  assert.equal(finale.LOOK, 1.2); assert.equal(finale.SHOUT, 0.8); assert.equal(finale.DIGIT, 1.2);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  assert.ok(show.elapsed <= 5, `≤ 5 s real (${show.elapsed.toFixed(2)})`);
});

test('countdown n=2 / n=1: only the digit (≤ 2 s real)', async () => {
  for (const n of [2, 1]) {
    const { show, run, bubblesLog } = await placedShow();
    await run([countdownEvent(3)], { instant: true });
    const n0 = bubblesLog.length, flare0 = show.stage.partObject('finale.flare');
    let lookers = 0;
    const update = show.update.bind(show);
    show.update = (dt, t) => { update(dt, t); lookers = Math.max(lookers, looking(show).length); };
    await run([countdownEvent(n)], { montage: true });
    show.update = update;
    assert.deepEqual(bubblesLog.slice(n0).map(b => b.kind), [String(n)], `n=${n}: only the digit`);
    assert.equal(lookers, 0);
    assert.equal(show.stage.flags.alarm, n);
    assert.ok(show.stage.partKeys().includes('finale.flare'), 'the flare stays');
    assert.equal(show.stage.partObject('finale.flare'), flare0, `n=${n}: the same flare, not replaced (no white re-blink)`);
    assert.ok(show.elapsed <= 2, `≤ 2 s real (${show.elapsed.toFixed(2)})`);
  }
});

test('FLARE_AT projects inside NDC ±0.9 on the 16:9 overview and on the 390×844 portrait overview (lit-stage skyline)', () => {
  const lv = { milk: 10, baseball: 8, token: 10, rat: 5, boba: 7, typhoon: 3, chip: 9, bulb: 9 };
  const main = tower.view(lv, {}, { total: 61 })['tower.main'], skyline = main.at.y + main.labelY;
  assert.ok(skyline > 7, `lit skyline (${skyline})`);
  const portrait = () => {
    const camera = new THREE.PerspectiveCamera(32, 390 / 844, 0.3, 320), controls = { target: new THREE.Vector3(), update() { camera.lookAt(controls.target); } };
    const rig = createCameraRig({ THREE, camera, controls }); rig.fit(390 / 844);
    return { rig, camera, controls };
  };
  // 點燈天際線（必要）＋天際線最低（工地，全景不抬）也要在畫面裡
  for (const sky of [skyline, 3]) for (const [name, r] of [['16:9', overviewRig()], ['390×844', portrait()]]) {
    r.rig.setSkyline(sky); r.camera.lookAt(r.controls.target); r.camera.updateMatrixWorld();
    const p = new THREE.Vector3(finale.FLARE_AT.x, finale.FLARE_AT.y, finale.FLARE_AT.z).project(r.camera);
    assert.ok(Math.abs(p.x) <= 0.9 && Math.abs(p.y) <= 0.9 && p.z < 1, `${name} skyline ${sky}: NDC (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  }
  // 鏡頭對面：在島的 −z 那側、離島心夠遠（背景環山那一圈）
  assert.ok(finale.FLARE_AT.z < -20 && Math.hypot(finale.FLARE_AT.x, finale.FLARE_AT.z) > 25);
});

// ── 飛彈（設計 §6，任務 5）──
import { finaleEvents } from '../src/game.js';
import { resolve, missile as missileOf } from '../src/rules/endings.js';
import { anchorWorld, landmarkWorld } from '../src/actors/anchors.js';
import { SHIELD } from '../src/actors/parts.js';
import { HOLD_END, FLIGHT, DEFLECT } from '../src/actors/finale.js';

const LIT = { milk: 10, baseball: 8, token: 10, rat: 5, boba: 7, typhoon: 3, chip: 9, bulb: 9 }, LIT_META = { total: 61 };
const TOWER_AT = anchorWorld('tower');
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('view: missile flag draws finale.missile with outcome and target (shield → dome surface toward FLARE_AT; hit → tower bend point; deflect → spring pool) and no flare; deflect adds finale.splash', () => {
  const F = finale.FLARE_AT;
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const v = finale.view(LIT, { alarm: 1, missile: outcome }, LIT_META), m = v['finale.missile'];
    assert.ok(m, outcome); assert.equal(v['finale.flare'], undefined, `${outcome}: the flare is out`);
    assert.equal(m.kind, 'missile'); assert.equal(m.outcome, outcome); assert.deepEqual(m.from, F);
    assert.equal(m.footprint, false); assert.equal(m.shadow, false);
    assert.equal(!!v['finale.splash'], outcome === 'deflect');
  }
  // shield：罩面上、朝紅光那一側（xz 同方向）、仰角約 55°
  const s = finale.view(LIT, { missile: 'shield' }, LIT_META)['finale.missile'].at;
  assert.ok(Math.abs(dist3(s, TOWER_AT) - tower.SHIELD_R) < 1e-6, 'on the dome');
  const el = Math.asin((s.y - TOWER_AT.y) / tower.SHIELD_R) * 180 / Math.PI;
  assert.ok(Math.abs(el - 55) < 1, `elevation ${el.toFixed(1)}°`);
  const da = Math.atan2(s.z - TOWER_AT.z, s.x - TOWER_AT.x), df = Math.atan2(F.z - TOWER_AT.z, F.x - TOWER_AT.x);
  assert.ok(Math.abs(da - df) < 1e-6, 'toward the flare');
  // hit：101 彎角（工地也不丟錯）
  assert.deepEqual(finale.view(LIT, { missile: 'hit' }, LIT_META)['finale.missile'].at, tower.bendPoint('lit'));
  assert.deepEqual(finale.view({}, { missile: 'hit' })['finale.missile'].at, tower.bendPoint('full'));
  // deflect：溫泉池中心、池面上 0.1；水花是白煙 4 團
  const spring = landmarkWorld('spring'), d = finale.view(LIT, { missile: 'deflect' }, LIT_META);
  assert.deepEqual(d['finale.missile'].at, { x: spring.x, y: spring.y + 0.1, z: spring.z });
  const sp = d['finale.splash'];
  assert.equal(sp.kind, 'smoke'); assert.equal(sp.n, 4); assert.equal(sp.color, 0xffffff); assert.equal(sp.size, 0.3); assert.equal(sp.rise, 0.6);
  assert.deepEqual({ x: sp.at.x, z: sp.at.z }, { x: spring.x, z: spring.z });
  assert.equal(finale.view(LIT, {}, LIT_META)['finale.missile'], undefined);
});

// 零件：建好即終態；launch() 從紅光重飛；機頭朝前進方向；三種結果的終態
const missileFactory = (quality = 'high') => createPartFactory(THREE, { glow: createGlowRegistry(), people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders, quality });
const worldOf = (part, local) => { part.object.updateMatrixWorld(true); return part.object.getObjectByName('body').localToWorld(new THREE.Vector3(...local)); };
const noseDir = part => worldOf(part, [0, 0, 1]).sub(worldOf(part, [0, 0, 0])).normalize();
const bodyWorld = part => worldOf(part, [0, 0, 0]);
const step = (part, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) part.update(1 / 60, 0); };

test('missile part: built finished (final pose); launch() restarts from FLARE_AT; nose points along the velocity; shield → hidden after FLIGHT with one firework; deflect → nose-down in the pool after FLIGHT + DEFLECT; hit → at the bend point', () => {
  const f = missileFactory(), F = finale.FLARE_AT;
  const bodyOf = p => p.object.getObjectByName('body');
  const finalOf = outcome => { const p = f.build(finale.view(LIT, { missile: outcome }, LIT_META)['finale.missile']); p.object.updateMatrixWorld(true); return p; };
  const sameMatrix = (a, b) => { a.object.updateMatrixWorld(true); b.object.updateMatrixWorld(true); return bodyOf(a).matrixWorld.elements.every((x, i) => Math.abs(x - bodyOf(b).matrixWorld.elements[i]) < 1e-6); };
  for (const outcome of ['shield', 'deflect', 'hit']) {
    const spec = finale.view(LIT, { missile: outcome }, LIT_META)['finale.missile'], p = f.build(spec), body = bodyOf(p), T = spec.at;
    let meshes = 0; body.traverse(o => { if (o.isMesh) { meshes++; assert.equal(o.castShadow, false); } });
    assert.equal(meshes, 1, `${outcome}: the body is one mesh (no glow)`);
    const box = new THREE.Box3().setFromObject(body), size = box.getSize(new THREE.Vector3());
    // 終態
    if (outcome === 'shield') {
      assert.equal(body.visible, false, 'shield: gone');
      const fw = p.object.getObjectByName('fireworks'); assert.ok(fw, 'carries a firework'); assert.equal(fw.children[0].visible, false, 'already burst');
    } else {
      assert.ok(body.visible);
      const tip = worldOf(p, [0, 0, finale.NOSE_TIP]), dir = noseDir(p);
      if (outcome === 'hit') {
        assert.ok(Math.hypot(tip.x - T.x, tip.z - T.z) < 0.58, 'hit: nose inside the tower at the bend');
        assert.ok(Math.abs(tip.y - T.y) < 0.4, `hit: at the bend height (${(tip.y - T.y).toFixed(2)})`);
        const c = bodyWorld(p); assert.ok(Math.hypot(c.x - T.x, c.z - T.z) > 0.7, 'hit: the tail sticks out');
        assert.ok(dir.x * (T.x - c.x) + dir.z * (T.z - c.z) > 0, 'hit: pointing into the tower');
      } else {
        assert.ok(dist3(tip, T) < 0.5, `deflect: nose in the pool (${dist3(tip, T).toFixed(2)})`);
        assert.ok(Math.abs(Math.acos(-dir.y) * 180 / Math.PI - 30) < 2, `deflect: nose-down tilted 30° (${(Math.acos(-dir.y) * 180 / Math.PI).toFixed(1)})`);
        assert.ok(bodyWorld(p).y > T.y + 0.3, 'deflect: the tail is out of the water');
      }
    }
    // launch：從紅光出發，機頭朝前進方向
    p.object.userData.launch({ speed: 1 }); p.update(1e-4, 0);
    assert.ok(body.visible); assert.ok(dist3(bodyWorld(p), F) < 0.05, `${outcome}: starts at FLARE_AT`);
    let prev = bodyWorld(p), top = -Infinity;
    for (let t = 0.1; t < FLIGHT - 0.05; t += 0.1) {
      step(p, 0.1);
      const cur = bodyWorld(p), v = cur.clone().sub(prev).normalize();
      assert.ok(noseDir(p).dot(v) > 0.97, `${outcome} t ${t.toFixed(1)}: nose along the velocity (${noseDir(p).dot(v).toFixed(3)})`);
      top = Math.max(top, cur.y); prev = cur;
    }
    assert.ok(top > (F.y + T.y) / 2 + 1.5, `a lob, not a straight line (top ${top.toFixed(2)})`);
    if (outcome === 'shield') {
      step(p, 0.1); assert.equal(body.visible, false, 'shield: gone at impact');
      const fw = p.object.getObjectByName('fireworks').children[0]; assert.ok(fw.visible, 'one firework');
      assert.ok(dist3(p.object.getObjectByName('fireworks').getWorldPosition(new THREE.Vector3()), T) < 1e-6, 'bursts at the dome');
      step(p, 1.3); assert.equal(fw.visible, false, 'one burst only'); step(p, 3); assert.equal(fw.visible, false);
    } else if (outcome === 'deflect') {
      step(p, 0.1); assert.ok(!sameMatrix(p, finalOf('deflect')), 'deflect: still falling after FLIGHT');
      step(p, DEFLECT); assert.ok(sameMatrix(p, finalOf('deflect')), 'deflect: in the pool after FLIGHT + DEFLECT');
    } else {
      step(p, 0.1); assert.ok(sameMatrix(p, finalOf('hit')), 'hit: stuck at the bend after FLIGHT');
    }
    // 2 倍速
    p.object.userData.launch({ speed: 2 }); step(p, FLIGHT / 2 + 0.05);
    if (outcome === 'hit') assert.ok(sameMatrix(p, finalOf('hit')), 'speed 2 flies twice as fast');
    p.dispose();
  }
  // 手機畫質：同樣一個 mesh
  const low = missileFactory('low').build(finale.view(LIT, { missile: 'hit' }, LIT_META)['finale.missile']);
  let n = 0; low.object.getObjectByName('body').traverse(o => { if (o.isMesh) n++; }); assert.equal(n, 1, 'low quality: one mesh');
});

// 三種結果的局：正解（矽盾）、原始順序（晶片沒滿、颱風 Lv3 → 命中）、颱風第 4 個放（倒數完颱風 Lv2 → 吹歪）
const MISSILE_ORDERS = { shield: SOLUTIONS[0], hit: [...spec.ORDER], deflect: ['milk', 'chip', 'bulb', 'typhoon', 'token', 'rat', 'boba', 'baseball'] };
async function missileShow(outcome) {
  const h = await headlessShow(), order = MISSILE_ORDERS[outcome];
  let s = createState(spec);
  for (const [i, st] of turnSteps(order).entries()) {
    const r = st(s); s = r.state;
    await h.run(i >= order.length ? closingEvents(i - order.length, r.events) : [...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.equal(missileOf(s, spec), outcome, `${order.join('>')} → ${outcome}`);
  return { ...h, e: finaleEvents(resolve(s, spec))[0] };
}

test('missile script live, each outcome: ≤ 10 s real, ！ from the crowd mid-flight, then ♥+jump (shield) / ？ then ♪ (deflect) / mood lie (hit); camera on the overview at the end', async () => {
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
    assert.ok(launchAt !== null && launchAt >= 0.8 - 1e-6, `${outcome}: launched after the 0.8 s overview hold`);
    assert.ok(!show.stage.partKeys().includes('finale.flare'), 'the flare is out');
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
      assert.ok(q[0].t >= impact, '？ after the missile lands'); assert.ok(note[0].t >= q.at(-1).t + 0.9, '♪ after ？');
    } else {
      assert.ok(bendAt !== null && bendAt >= launchAt + FLIGHT - 0.05, '101 bends at impact');
      assert.ok(lieAt !== null && lieAt - bendAt < 1, `everyone lies down right after the bend (${(lieAt - bendAt).toFixed(2)} s)`);
      assert.ok(lieAt <= secs - HOLD_END + 0.05, 'before the final hold');
      for (const k of ['tower.antenna', 'tower.show', 'tower.shield']) assert.ok(!show.stage.partKeys().includes(k), `no ${k}`);
      assert.equal(worldLog.at(-1)[0].mood, 'lie', 'the mood holds to the end of the turn');
    }
    assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, `${outcome}: everyone released`);
    const cam = rig.log.slice(r0);
    assert.ok(cam.length && cam.every(([k]) => k === 'home'), `${outcome}: the camera stays on the overview (${cam.map(c => c[0]).join(' ')})`);
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

test('missile script instant (skip): the final state matches the live one for all three outcomes (review focus 2)', async () => {
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
import { CAR_FLIGHT, MARQUEE } from '../src/actors/finale.js';
import { ROOF_SPOTS } from '../src/actors/rat.js';
import { orbitPose } from '../src/actors/parts.js';
import { TIMES } from '../src/scene/daynight.js';
import { NEON_BOOST } from '../src/actors/world.js';
import { body as towerBody } from '../src/actors/tower.js';
const CYBER_ORDER = stats(enumerate(spec), spec).full.find(r => r.ending.id === 'cyber').order;

test('view: epilogue cyber draws finale.car (orbit, red tint, from the sea, park on the 101 roof, no rest)', () => {
  const v = finale.view(LIT, { missile: 'shield', epilogue: 'cyber' }, LIT_META), car = v['finale.car'], dark = towerBody('lit', { dark: true });
  assert.ok(car, 'finale.car');
  assert.equal(car.kind, 'orbit'); assert.equal(car.path, 'kenney/space/craft_speederA.glb');
  assert.equal(car.tint['^metalRed$'], 0xe8322e); assert.equal(car.footprint, false); assert.equal(car.rest, undefined, 'parks for good');
  assert.deepEqual(car.from, { x: 10, y: 3.5, z: 9 }, 'flies in from the sea, camera-right-front');
  assert.deepEqual(car.at, TOWER_AT); assert.equal(car.r, 1.4); assert.equal(car.speed, 2.5); assert.deepEqual(car.legs, [1.2, 0.8]);
  assert.ok(Math.abs(car.h - (towerBody('lit').top + 0.6)) < 1e-9, 'circles just over the 101 top');
  assert.ok(Math.abs(Math.sin(car.phase) - 1) < 1e-9, 'enters and leaves the lap on the camera side');
  assert.ok(Math.abs(car.size - 0.3 * 0.8 / 2.0) < 1e-9 && car.ry === Math.PI);
  assert.ok(Math.abs(car.park.y - (TOWER_AT.y + dark.roof)) < 1e-9 && Math.abs(car.park.x - TOWER_AT.x) < 1e-9 && car.park.z > TOWER_AT.z, 'parks on the front of the roof');
  assert.ok(Math.abs(car.park.z - TOWER_AT.z) + 0.15 <= dark.parts.find(p => p.name === 'deck').scale[2] / 2, 'the whole car body on the roof');
  assert.deepEqual(orbitPose(car, Infinity), { ...car.park, yaw: orbitPose(car, Infinity).yaw, done: true });
  assert.ok(Math.abs(CAR_FLIGHT - (1.2 + 2 * Math.PI / 2.5 + 0.8)) < 1e-9);
  for (const flags of [{ missile: 'shield' }, { missile: 'shield', epilogue: 'alien' }]) assert.equal(finale.view(LIT, flags, LIT_META)['finale.car'], undefined);
});

// 賽博正解整局瞬間演完（含倒數三回合）、飛彈瞬間演完，尾聲 live（終局回合 1 倍速）：量尾聲自己的秒數
test('cyber epilogue live: night, black tower blinks in, the car flies in and parks within 4 s, the marquee text shows 3 s, the rats appear on the roof, ends on the overview; ≤ 12 s real', async () => {
  const h = await headlessShow(), { show, run, bubblesLog, worldLog, rig } = h;
  let s = createState(spec);
  for (const [i, st] of turnSteps(CYBER_ORDER).entries()) {
    const r = st(s); s = r.state;
    await run(i >= CYBER_ORDER.length ? closingEvents(i - CYBER_ORDER.length, r.events) : [...r.events, { kind: 'settle' }], { instant: true });
  }
  const [missileEvent, epilogueEvent] = finaleEvents(resolve(s, spec));
  assert.equal(epilogueEvent?.ending, 'cyber');
  await run([missileEvent], { finale: true, instant: true });
  const w0 = worldLog.length, n0 = bubblesLog.length, r0 = rig.log.length, main0 = show.stage.partObject('tower.main');
  const park = finale.view(LIT, { missile: 'shield', epilogue: 'cyber' }, LIT_META)['finale.car'].park;
  let darkAt = null, flyAt = null, parkedAt = null, textAt = null, textSeen = 0, ratsAt = null, maxBubbles = 0;
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
    if (textAt === null && bubblesLog.slice(n0).some(b => b.kind?.text === MARQUEE)) textAt = now;
    if (textAt !== null && show.bubbles.count > 0) textSeen += d;
    if (ratsAt === null && onRoof()) ratsAt = now;
  };
  await run([epilogueEvent], { finale: true });
  show.update = update;
  const secs = show.elapsed;
  assert.ok(secs <= 12, `≤ 12 s real (${secs.toFixed(2)})`);
  console.log(`cyber epilogue: ${secs.toFixed(2)} s real (dark ${darkAt?.toFixed(2)}, fly ${flyAt?.toFixed(2)}, parked ${parkedAt?.toFixed(2)}, marquee ${textAt?.toFixed(2)} for ${textSeen.toFixed(2)}, rats ${ratsAt?.toFixed(2)})`);
  const w = worldLog.slice(w0).map(([x]) => x);
  assert.ok(w.some(x => x.time === TIMES.night && x.glowScale === NEON_BOOST), 'night, neon up');
  assert.ok(darkAt !== null && darkAt < flyAt, 'the black tower first');
  assert.ok(show.stage.partKeys().includes('tower.screen'), 'the screen is up');
  assert.ok(parkedAt !== null && parkedAt - flyAt <= CAR_FLIGHT + 0.05 && CAR_FLIGHT < 4.6, `the car parks ${(parkedAt - flyAt).toFixed(2)} s after take-off`);
  assert.ok(dist3(carPos(), park) < 1e-6, 'the car ends parked on the roof');
  const marquee = bubblesLog.slice(n0).filter(b => b.kind?.text === MARQUEE);
  assert.equal(marquee.length, 1, 'one marquee'); assert.equal(MARQUEE, '飛天跑車今日抵台，先付清 755 萬', 'the design text (§7)');
  const sc = show.stage.partObject('tower.screen').position;
  assert.ok(dist3(marquee[0].at, sc) < 1e-6, 'on the screen');
  assert.ok(Math.abs(textSeen - 3) < 0.1, `marquee 3 s (${textSeen.toFixed(2)})`);
  assert.ok(ratsAt !== null && ratsAt >= textAt, 'the rats line up after the marquee starts');
  const rats = show.roster.members('rat.pack');
  assert.equal(rats.length, 10);
  for (const m of rats) assert.ok(dist3(m.pos, ROOF_SPOTS[m.i]) < 1e-6 && m.mode === 'home', `rat ${m.i} on its roof spot`);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  const cam = rig.log.slice(r0);
  assert.ok(cam.length && cam.every(([k]) => k === 'home'), `the camera stays on the overview (${cam.map(c => c[0]).join(' ')})`);
  // 跳過：終態一樣（車停好、10 隻在屋頂、螢幕在）
  const skip = await headlessShow();
  let s2 = createState(spec);
  for (const [i, st] of turnSteps(CYBER_ORDER).entries()) { const r = st(s2); s2 = r.state; await skip.run(i >= CYBER_ORDER.length ? closingEvents(i - CYBER_ORDER.length, r.events) : [...r.events, { kind: 'settle' }], { instant: true }); }
  await skip.run(finaleEvents(resolve(s2, spec)), { finale: true, instant: true });
  assert.deepEqual(skip.show.stage.partKeys().sort(), show.stage.partKeys().sort());
  for (const m of skip.show.roster.members('rat.pack')) assert.ok(dist3(m.pos, ROOF_SPOTS[m.i]) < 1e-6, `skip: rat ${m.i} on the roof`);
  const o = skip.show.stage.partObject('finale.car'), p = o.children[0].position;
  assert.ok(dist3({ x: o.position.x + p.x, y: o.position.y + p.y, z: o.position.z + p.z }, park) < 1e-6, 'skip: the car parked');
});

// ── 外星尾聲（設計 §7，任務 7）──
import { UFO_N, UFO_PARTS_BIG } from '../src/actors/finale.js';
import { SHIP_SPOT, UFO_PARTS } from '../src/actors/rat.js';
import { island } from '../src/actors/satellites.js';
import { shipTop } from '../src/actors/tower.js';
import { C } from '../src/actors/palette.js';
const ALIEN_ORDER = stats(enumerate(spec), spec).full.find(r => r.ending.id === 'alien').order;
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

// 外星正解整局瞬間演完、飛彈瞬間演完，尾聲 live（終局回合 1 倍速）
async function alienFinale(opts = {}) {
  const h = await headlessShow(opts);
  let s = createState(spec);
  for (const [i, st] of turnSteps(ALIEN_ORDER).entries()) {
    const r = st(s); s = r.state;
    await h.run(i >= ALIEN_ORDER.length ? closingEvents(i - ALIEN_ORDER.length, r.events) : [...r.events, { kind: 'settle' }], { instant: true });
  }
  const [missileEvent, epilogueEvent] = finaleEvents(resolve(s, spec));
  assert.equal(epilogueEvent?.ending, 'alien');
  await h.run([missileEvent], { finale: true, instant: true });
  return { ...h, epilogueEvent };
}

test('alien epilogue live: mutant waves + ！, pad blinks in, UFOs descend 2 s, aliens blink in, mothership blinks in, mood alien, king on top + ♥, ends on the overview; ≤ 12 s real', async () => {
  const { show, run, bubblesLog, worldLog, rig, epilogueEvent } = await alienFinale();
  const w0 = worldLog.length, n0 = bubblesLog.length, r0 = rig.log.length, main0 = show.stage.partObject('tower.main'), pad0 = show.stage.partObject('sat.rocksRing');
  assert.ok(pad0, 'the green ring is there before');
  const mutant = show.roster.members('rat.pack')[0];
  const t = {}, mark = (k, cond, now) => { if (t[k] === undefined && cond) t[k] = now; };
  let waving = 0, ufoY = [], seen = n0;
  const said = [];
  const update = show.update.bind(show);
  show.update = (d, tt) => {
    update(d, tt);
    const now = show.elapsed;
    while (seen < bubblesLog.length) said.push({ ...bubblesLog[seen++], t: now });
    if (mutant.waving) waving += d;
    mark('pad', show.stage.partObject('sat.rocksRing') !== pad0, now);
    const u = show.stage.partObject('finale.ufos');
    mark('ufos', !!u, now);
    if (u) ufoY.push([now, u.userData.showOffset?.dy ?? 0]);
    mark('aliens', !!show.stage.partObject('finale.aliens'), now);
    mark('ship', show.stage.partObject('tower.main') !== main0, now);
    mark('mood', worldLog.slice(w0).some(([w]) => w.mood === 'alien'), now);
    mark('top', dist3(mutant.pos, SHIP_SPOT) < 1e-6, now);
  };
  await run([epilogueEvent], { finale: true });
  show.update = update;
  const secs = show.elapsed;
  console.log(`alien epilogue: ${secs.toFixed(2)} s real (${Object.entries(t).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')})`);
  assert.ok(secs <= 12, `≤ 12 s real (${secs.toFixed(2)})`);
  const bang = said.filter(b => b.kind === '！'), heart = said.filter(b => b.kind === '♥');
  assert.equal(bang.length, 1, 'the mutant ！');
  const spring = landmarkWorld('spring');
  assert.ok(Math.hypot(bang[0].at.x - spring.x, bang[0].at.z - spring.z) < 1.5, '！ over the mutant by the spring');
  assert.ok(bang[0].t < t.pad, '！ before the pad');
  assert.ok(waving >= 0.9, `the mutant waves (${waving.toFixed(2)})`);
  assert.ok(t.pad < t.ufos && t.ufos < t.aliens && t.aliens < t.ship && t.ship <= t.mood && t.mood <= t.top, 'pad → ufos → aliens → mothership → mood → king');
  // UFO 從 7 高降下來，2 秒
  const high = ufoY.find(([, dy]) => dy > 6.5), low = ufoY.find(([, dy]) => dy === 0);
  assert.ok(high && low, 'descends from dy 7 to 0');
  assert.ok(Math.abs(low[0] - high[0] - 2.0) < 0.15, `in 2 s (${(low[0] - high[0]).toFixed(2)})`);
  assert.equal(heart.length, 1, '♥');
  assert.ok(heart[0].t >= t.top && heart[0].at.y > shipTop(), '♥ over the king on the ship top');
  assert.ok(show.stage.partKeys().includes('finale.ufos') && show.stage.partKeys().includes('finale.aliens'));
  assert.ok(!show.stage.partKeys().includes('rat.ufo'), 'the small UFO is gone');
  assert.ok(!show.stage.partKeys().includes('sat.rocks'), 'the stone rats are gone');
  assert.ok(dist3(mutant.pos, SHIP_SPOT) < 1e-6 && mutant.mode === 'home', 'the king sits on the ship top');
  assert.equal(worldLog.at(-1)[0].mood, 'alien', 'third eyes to the end');
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  // 鏡頭（裁決 R5）：溫泉 → 石堆島（降落場、UFO、外星生物都在那裡演）→ 全景（母艦、王冠鼠）
  const cam = rig.log.slice(r0), foci = cam.filter(([k]) => k === 'focus').map(([, p]) => p), rocks = island('rocks');
  assert.equal(foci.length, 2, `two focus moves (${cam.map(c => c[0]).join(' ')})`);
  assert.ok(Math.hypot(foci[0].x - spring.x, foci[0].z - spring.z) < 1e-6, 'first the spring');
  assert.ok(Math.hypot(foci[1].x - rocks.x, foci[1].z - rocks.z) < 1e-6, 'then the rocks islet');
  const homeAt = cam.findIndex(([k]) => k === 'home');
  assert.ok(homeAt > cam.findIndex(c => c[1] === foci[1]) && cam.at(-1)[0] === 'home', 'then the overview, to the end');
  // 跳過：終態一樣
  const skip = await alienFinale();
  await skip.run([skip.epilogueEvent], { finale: true, instant: true });
  assert.deepEqual(skip.show.stage.partKeys().sort(), show.stage.partKeys().sort());
  assert.ok(dist3(skip.show.roster.members('rat.pack')[0].pos, SHIP_SPOT) < 1e-6, 'skip: the king on the ship top');
  assert.equal(skip.worldLog.at(-1)[0].mood, 'alien');
  assert.equal(everyone(skip.show).filter(m => m.mode === 'script').length, 0, 'skip: everyone released');
  assert.ok(!skip.show.roster.members('rat.pack')[0].waving, 'skip: the wave is cleared');
  const so = skip.show.stage.partObject('finale.ufos'), lo = show.stage.partObject('finale.ufos');
  assert.ok(dist3(so.position, lo.position) < 1e-9, 'skip: the UFOs landed');
});

test('alien epilogue on low quality draws ufos as one mesh', async () => {
  const { show, run, epilogueEvent } = await alienFinale({ quality: 'low' });
  await run([epilogueEvent], { finale: true, instant: true });
  assert.equal(meshes(show.stage.partObject('finale.ufos')).length, 1, 'one draw call');
  assert.equal(meshes(show.stage.partObject('finale.aliens')).length, 1, 'the aliens too');
  assert.equal(meshes(show.stage.partObject('tower.main')).length, 1, 'the mothership too');
});

// 裁決 R5：真的鏡頭——推到石堆島飛完之後（外星生物出現那一刻），島心、外星生物、三台 UFO 都投影在 NDC ±0.9 裡；
// 母艦換上的時候鏡頭已經在回全景
test('alien epilogue camera (real rig): the rocks islet, the UFOs and the aliens are on screen while focused', async () => {
  const portrait = () => {
    const camera = new THREE.PerspectiveCamera(32, 390 / 844, 0.3, 320), controls = { target: new THREE.Vector3(), update() { camera.lookAt(controls.target); } };
    const rig = createCameraRig({ THREE, camera, controls }); rig.fit(390 / 844);
    return { rig, camera, controls };
  };
  for (const [aspect, r] of [['16:9', overviewRig()], ['390×844', portrait()]]) {
    const { show, run, epilogueEvent } = await alienFinale({ rig: r.rig });
    const rocks = island('rocks'), v = finale.view(LIT, { missile: 'shield', epilogue: 'alien' }, LIT_META), u = v['finale.ufos'];
    const points = [['islet', rocks], ['aliens', v['finale.aliens'].at], ...[1, 4, 7].map(i => [`ufo ${i}`, { x: u.at.x + u.parts[i].pos[0], y: u.at.y + u.parts[i].pos[1], z: u.at.z + u.parts[i].pos[2] }])];
    let seen = null;
    const update = show.update.bind(show);
    show.update = (d, t) => {
      update(d, t);
      if (seen === null && show.stage.partObject('finale.aliens')) {
        assert.ok(!r.rig.flying, `${aspect}: the camera has settled on the islet when the aliens appear`);
        r.camera.lookAt(r.controls.target); r.camera.updateMatrixWorld();
        seen = points.map(([name, p]) => [name, new THREE.Vector3(p.x, p.y, p.z).project(r.camera)]);
      }
    };
    await run([epilogueEvent], { finale: true });
    show.update = update;
    assert.ok(seen, 'the aliens appeared');
    console.log(`alien camera ${aspect}: ${seen.map(([n, p]) => `${n} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`).join(', ')}`);
    for (const [name, p] of seen) assert.ok(Math.abs(p.x) <= 0.9 && Math.abs(p.y) <= 0.9 && p.z < 1, `${aspect} ${name}: NDC (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  }
});
