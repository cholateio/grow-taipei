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

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const RUSH = ['milk', 'chip', 'bulb', 'token', 'boba', 'baseball'];
const FRONT_TOL = 0.6;

// 趕工（設計 §5）：hero 走到 frontOf(site, r, nav)——請求的站位要在走路格上（nearestWalkable 拉回來不超過 0.6），site 本身在主島上。
// 查的時機是演到那個 grow 之前（走路與揮鋤頭都在 apply 之前）：照兩條正解一回合一回合瞬間演，每個 grow 先查再演
test('every rushSite point of both solutions lies on the main island and its frontOf(site, r, nav) is walkable (within 0.6 of the request)', async () => {
  for (const id of RUSH) assert.equal(typeof ALL.find(m => m.id === id).rushSite, 'function', `${id} has rushSite`);
  const bad = [], seen = new Set();
  for (const order of SOLUTIONS) {
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
          seen.add(`${e.item} ${e.to}`);
          if (!cellAt(site.x, site.z)) bad.push(`${what}: site (${site.x.toFixed(2)}, ${site.z.toFixed(2)}) off the main island`);
          if (!Number.isFinite(site.y) || !(site.r > 0)) bad.push(`${what}: site needs y and r > 0`);
          if (d > FRONT_TOL) bad.push(`${what}: frontOf pulled ${d.toFixed(2)} > ${FRONT_TOL}`);
        }
        await run([e], { instant: true });
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(seen.size >= 10, `rush sites checked: ${[...seen].join(', ')}`);
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

test('view: alarm 3/2/1 draws finale.flare with pulse 1/2/3 Hz; no alarm or missile set → no flare', () => {
  const lv = {};
  for (const [n, hz] of [[3, 1], [2, 2], [1, 3]]) {
    const f = finale.view(lv, { alarm: n })['finale.flare'];
    assert.ok(f, `alarm ${n}`);
    assert.equal(f.kind, 'flare'); assert.equal(f.hz, hz); assert.deepEqual(f.at, finale.FLARE_AT);
    assert.equal(f.shadow, false); assert.equal(f.footprint, false);
  }
  assert.deepEqual(finale.view(lv, {}), {});
  for (const missile of ['shield', 'deflect', 'hit']) assert.ok(!finale.view(lv, { alarm: 1, missile })['finale.flare'], `missile ${missile} puts the flare out`);
  // 零件：紅橘發光球 r 0.9＋半透明光柱高 6，都不投影；update 依 hz 脈動（週期 1/hz 回到同一個強度）
  const glow = createGlowRegistry();
  const f = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: finale.builders });
  for (const [n, hz] of [[3, 1], [2, 2], [1, 3]]) {
    const part = f.build(finale.view(lv, { alarm: n })['finale.flare']);
    const orb = part.object.getObjectByName('orb'), beam = part.object.getObjectByName('beam');
    orb.geometry.computeBoundingSphere(); assert.ok(Math.abs(orb.geometry.boundingSphere.radius - 0.9) < 0.02, 'orb r 0.9');
    assert.equal(orb.material.color.getHex(), 0xff5a3c); assert.equal(orb.material.emissive.getHex(), 0xff5a3c);
    beam.geometry.computeBoundingBox(); const bb = beam.geometry.boundingBox; assert.ok(Math.abs(bb.max.y - bb.min.y - 6) < 1e-6, 'column 6 high');
    assert.ok(beam.material.transparent && beam.material.opacity < 1 && !beam.material.depthWrite);
    part.object.traverse(o => { if (o.isMesh) assert.ok(!o.castShadow, 'no shadow'); });
    const m = part.materials[0], at = t => { part.update(0.1, t); return m.emissiveIntensity; };
    const a = at(0.1 / hz), b = at(0.6 / hz), c = at(1.1 / hz);
    assert.ok(Math.abs(a - b) > 0.3, `pulses at ${hz} Hz`); assert.ok(Math.abs(a - c) < 1e-9, `period 1/${hz} s`);
    assert.ok(Math.min(a, b) > 0, 'glows in daylight');
    part.dispose();
  }
});

test('countdown n=3 live: flare blinks in, visible islanders look at FLARE_AT and say ！, the digit 3 shows on 101 for 1.2 s real, everyone released; ≤ 5 s real at montage speed', async () => {
  const { show, run, bubblesLog } = await placedShow();
  const at = finale.FLARE_AT, n0 = bubblesLog.length, crowdSize = Math.min(24, (await import('../src/show/crowd.js')).islanders({ roster: show.roster }).length);
  assert.ok(crowdSize >= 6, `islanders on the island (${crowdSize})`);
  let lookers = 0, flareAt = null, digitAt = null;
  const update = show.update.bind(show);
  show.update = (dt, t) => {
    update(dt, t);
    const look = looking(show);
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
  assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'everyone released');
  assert.ok(show.elapsed <= 5, `≤ 5 s real (${show.elapsed.toFixed(2)})`);
});

test('countdown n=2 / n=1: only the digit (≤ 2 s real)', async () => {
  for (const n of [2, 1]) {
    const { show, run, bubblesLog } = await placedShow();
    await run([countdownEvent(3)], { instant: true });
    const n0 = bubblesLog.length;
    let lookers = 0;
    const update = show.update.bind(show);
    show.update = (dt, t) => { update(dt, t); lookers = Math.max(lookers, looking(show).length); };
    await run([countdownEvent(n)], { montage: true });
    show.update = update;
    assert.deepEqual(bubblesLog.slice(n0).map(b => b.kind), [String(n)], `n=${n}: only the digit`);
    assert.equal(lookers, 0);
    assert.equal(show.stage.flags.alarm, n);
    assert.ok(show.stage.partKeys().includes('finale.flare'), 'the flare stays');
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
