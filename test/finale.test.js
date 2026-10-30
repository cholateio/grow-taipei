// test/finale.test.js：最終章（計畫 5；選擇帶動升級改版）——飛彈警告、飛彈、尾聲
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import * as THREE from '../vendor/three/three.module.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createCameraRig } from '../src/scene/camera.js';
import { WARNING } from '../src/game.js';
import { headlessShow, turnSteps, overviewRig, ALL } from './helpers/show.js';
import { EXAMPLE } from './helpers/endings.js';
import { islanders } from '../src/show/crowd.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
// ── 飛彈警告（選擇帶動升級 §4；原本倒數 3 的宣告）──
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

test('view: alarm draws finale.flare pulsing at FLARE_HZ 2; missile puts it out', () => {
  const lv = {};
  const f = finale.view(lv, { alarm: 1 })['finale.flare'];
  assert.ok(f, 'alarm 1 (WARNING) draws the flare');
  assert.equal(f.kind, 'flare'); assert.deepEqual(f.at, finale.FLARE_AT);
  assert.equal(f.shadow, false); assert.equal(f.footprint, false);
  assert.deepEqual(finale.view(lv, {}), {});
  for (const missile of ['shield', 'deflect', 'hit']) assert.ok(!finale.view(lv, { alarm: 1, missile })['finale.flare'], `missile ${missile} puts the flare out`);
  assert.equal('flareHz' in finale, false, 'no per-countdown frequency any more');
  // 零件：紅橘發光球 r 0.9＋半透明光柱高 6，都不投影；固定 FLARE_HZ 脈動（週期 1/hz 回到同一個強度）
  assert.equal(finale.FLARE_HZ, 2);
  const glow = createGlowRegistry();
  const pf = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders });
  const part = pf.build(f);
  const orb = part.object.getObjectByName('orb'), beam = part.object.getObjectByName('beam');
  orb.geometry.computeBoundingSphere(); assert.ok(Math.abs(orb.geometry.boundingSphere.radius - 0.9) < 0.02, 'orb r 0.9');
  assert.equal(orb.material.color.getHex(), 0xff5a3c); assert.equal(orb.material.emissive.getHex(), 0xff5a3c);
  beam.geometry.computeBoundingBox(); const bb = beam.geometry.boundingBox; assert.ok(Math.abs(bb.max.y - bb.min.y - 6) < 1e-6, 'column 6 high');
  assert.ok(beam.material.transparent && beam.material.opacity < 1 && !beam.material.depthWrite);
  part.object.traverse(o => { if (o.isMesh) assert.ok(!o.castShadow, 'no shadow'); });
  const m = part.materials[0], at = t => { part.update(0.1, t); return m.emissiveIntensity; }, hz = finale.FLARE_HZ;
  const a = at(0.1 / hz), b = at(0.6 / hz), c = at(1.1 / hz);
  assert.ok(Math.abs(a - b) > 0.3, `pulses at ${hz} Hz`); assert.ok(Math.abs(a - c) < 1e-9, `period 1/${hz} s`);
  assert.ok(Math.min(a, b) > 0, 'glows in daylight');
  part.dispose();
});

test('warning live: the flare blinks in, visible islanders look at FLARE_AT and say ！, everyone released; ≤ 3 s', async () => {
  const { show, run, bubblesLog } = await placedShow();
  const at = finale.FLARE_AT, n0 = bubblesLog.length, crowdSize = Math.min(24, islanders({ roster: show.roster }).length);
  assert.ok(crowdSize >= 6, `islanders on the island (${crowdSize})`);
  let lookers = 0, flareAt = null, lookFrom = null, lookTo = null;
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
  };
  await run([WARNING], { finale: true });
  show.update = update;
  assert.ok(flareAt !== null, 'the flare appears'); assert.ok(show.stage.partKeys().includes('finale.flare'), 'and stays');
  assert.equal(show.stage.flags.alarm, 1);
  assert.equal(lookers, crowdSize, 'everyone (≤ 24) looks at the flare');
  const said = bubblesLog.slice(n0);
  assert.equal(said.filter(b => b.kind === '！').length, crowdSize, 'each looker says ！');
  assert.deepEqual(said.filter(b => /^\d$/.test(b.kind)), [], 'no countdown digit');
  // 看與「！」各自的真實秒數：抬頭 LOOK 1.2 s（被點名看紅光到放回日常）、「！」SHOUT 0.8 s
  assert.ok(Math.abs(lookTo - lookFrom - finale.LOOK) <= 2 / 30, `the look lasts ${finale.LOOK} s real (${(lookTo - lookFrom).toFixed(2)})`);
  const shouts = durs.filter(([k]) => k === '！');
  assert.equal(shouts.length, crowdSize);
  for (const [, d] of shouts) assert.ok(Math.abs(d - finale.SHOUT) < 1e-9, `！ ${finale.SHOUT} s real (${d})`);
  assert.equal(finale.LOOK, 1.2); assert.equal(finale.SHOUT, 0.8);
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  assert.ok(show.elapsed <= 3, `≤ 3 s real (${show.elapsed.toFixed(2)})`);
});
// 跳過（instant，reduced motion／玩家按跳過）：警告照樣把旗標、紅光套上，沒有人留在劇本手上
test('warning skipped (instant): alarm 1, the flare is there, nobody left in script mode', async () => {
  const { show, run } = await placedShow();
  await run([WARNING], { finale: true, instant: true });
  assert.equal(show.stage.flags.alarm, 1);
  assert.ok(show.stage.partKeys().includes('finale.flare'), 'the flare is there');
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'nobody in script mode');
});

test('FLARE_AT projects inside NDC ±0.9 on the 16:9 overview and on the 390×844 portrait overview (lit-stage skyline)', () => {
  const lv = { milk: 10, baseball: 8, token: 10, rat: 4, boba: 6, typhoon: 4, chip: 9, bulb: 9 };
  const main = tower.view(lv, {}, { total: 60 })['tower.main'], skyline = main.at.y + main.labelY;
  assert.ok(skyline > 7, `lit skyline (${skyline})`);
  const portrait = () => {
    const camera = new THREE.PerspectiveCamera(32, 390 / 844, 0.3, 320), controls = { target: new THREE.Vector3(), update() { camera.lookAt(controls.target); } };
    const rig = createCameraRig({ THREE, camera, controls }); rig.fit(390 / 844);
    return { rig, camera, controls };
  };
  // 點燈天際線（必要）＋天際線最低（工地，全景不抬）也要在畫面裡
  for (const sky of [skyline, 3]) for (const [name, r] of [['16:9', overviewRig()], ['390×844', portrait()]]) {
    r.rig.setSkyline(sky); r.rig.update(1.1); r.camera.lookAt(r.controls.target); r.camera.updateMatrixWorld();
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

// 全 MAX（唯一正解：老鼠 4、珍奶 6、颱風 4，總等級 60）
const LIT = { milk: 10, baseball: 8, token: 10, rat: 4, boba: 6, typhoon: 4, chip: 9, bulb: 9 }, LIT_META = { total: 60 };
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
  // 終局回合照 game.js：警告（紅光亮起）先瞬間演完，再單獨演飛彈
  const [warn, e] = finaleEvents(resolve(s, spec));
  assert.equal(warn.kind, 'warning');
  await h.run([warn], { finale: true, instant: true });
  return { ...h, e };
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
test('cyber epilogue live: night, black tower blinks in, the car flies in and parks within 4 s, the marquee text shows 3 s, the rats appear on the roof, ends on the overview; ≤ 12 s real', async () => {
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
// 外星壞局：列舉裡第一條老鼠 Lv4 分岔成外星的放法
const ALIEN_ORDER = enumerate(spec).find(r => r.state.flags.ratBranch === 'alien' && r.state.lv.rat === 4).order;
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

// 外星是壞結局（唯一正解 §4.5）：結局「變異鼠稱王」、終局只有警告＋飛彈、沒有尾聲；畫面就是老鼠 Lv4 外星型態——
// 戴王冠的變異鼠、頭上的小 UFO、石堆島的綠光圈（整局演完、終局回合也演完之後都還在）
test('alien is a bad ending (變異鼠稱王): finaleEvents has no epilogue; the rat Lv4 alien view shows the crowned mutant + the small UFO and the rocks-islet ring', async () => {
  const { ENDINGS } = await import('../src/rules/endings.js');
  const h = await headlessShow();
  let s = createState(spec);
  for (const st of turnSteps(ALIEN_ORDER)) { const r = st(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(s.flags.ratBranch, 'alien'); assert.equal(s.lv.rat, 4);
  const ending = resolve(s, spec);
  assert.equal(ending.id, 'alien'); assert.equal(ENDINGS.alien.kind, 'bad'); assert.equal(ending.title, '變異鼠稱王');
  const evs = finaleEvents(ending);
  assert.deepEqual(evs.map(e => e.kind), ['warning', 'missile'], 'no epilogue');
  await h.run(evs, { finale: true, instant: true });
  const { show } = h, [mutant] = show.roster.members('rat.pack');
  assert.equal(show.roster.members('rat.pack').length, 1);
  assert.ok(mutant.dress.crown && mutant.dress.eye && mutant.dress.h === 0.5, 'the crowned mutant');
  assert.ok(Math.hypot(mutant.pos.x - SHIP_SPOT.x, mutant.pos.z - SHIP_SPOT.z) > 1, 'not on a mothership');
  assert.ok(show.stage.partObject('rat.ufo'), 'the small UFO');
  assert.ok(show.stage.partObject('sat.rocksRing'), 'the green ring on the rocks islet');
  assert.ok(!show.stage.partKeys().some(k => k === 'finale.ufos' || k === 'finale.aliens'), 'no landing UFOs, no aliens');
  assert.equal(show.stage.flags.epilogue, undefined);
});
