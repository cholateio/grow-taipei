import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import * as token from '../src/actors/token.js';
import { groundAt, axialToWorld, SATELLITES, cellAt, worldToAxial, RING_R } from '../src/scene/hex.js';
import { createPartFactory, orbitPose } from '../src/actors/parts.js';
const { FLIGHT } = token;
import { createGlowRegistry } from '../src/scene/glow.js';
import { anchorWorld, cellOf } from '../src/actors/anchors.js';
import { offset, C } from '../src/actors/palette.js';
import { diffParts } from '../src/actors/stage.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { B, STATION_A } from '../src/show/beats.js';
import { createTimeline } from '../src/show/timeline.js';
import { headlessShow, playItem, entriesThroughSolutions, solo, overviewRig, SCRIPT_MAX, SCRIPT_EXCEPT, KEY_MAX } from './helpers/show.js';
import { lv as L, entryProblems, focusCell, focusTrail, worldPoints, distToCell } from './helpers/actors.js';
import { createNav, PAD } from '../src/show/nav.js';

const RESULTS = enumerate(spec);
const SOLUTIONS = stats(RESULTS, spec).full.map(r => r.order);   // 唯一正解（賽博），從求解器取
const AT = anchorWorld('token'), TOWER = anchorWorld('tower'), TWO_PI = 2 * Math.PI, CELL = cellOf('token');
const satC = kind => { const s = SATELLITES.find(x => x.kind === kind); return axialToWorld(s.q, s.r); };
const satCell = kind => { const c = satC(kind); return worldToAxial(c.x, c.z); };
// 代幣 Lv7 開往哪座島：燈泡先放（賽博）→ 燈泡 Lv7 先鋪好風車島的支線 → 遊樂場島（裁決 R7）；不然風車島
// 唯一正解（2026-10-31）：舊的「燈泡先放就是遊樂場島」是兩條正解的捷徑——改成照引擎演：代幣升 7 那一刻燈泡已經 ≥ 7 才是遊樂場島
//   （到不了代幣 7 回 null）。正解是代幣先放、代幣 7 比燈泡 7 早 → 風車島
const islandOf7 = order => {
  let s = engine.createState(spec), bulb = 0;
  for (const step of [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))]) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (e.item === 'bulb' && (e.kind === 'grow' || e.kind === 'placed')) bulb = e.kind === 'grow' ? e.to : 1;
      if (e.kind === 'grow' && e.item === 'token' && e.to === 7) return bulb >= 7 ? 'playground' : 'windmill';
    }
  }
  return null;
};
// 遊樂場島那條（燈泡 Lv7 先鋪好風車島支線）不在正解上：列舉裡第一條代幣到得了 7、而且是遊樂場島的放法
const PLAYGROUND7 = RESULTS.map(r => r.order).find(o => islandOf7(o) === 'playground');
const views = Array.from({ length: 11 }, (_, n) => token.view(L({ token: n }), {}));
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));
const PALETTE = new Set(Object.values(C));
const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : b.kind === 'trainStop' ? [b, ...flat(b.during)] : [b]));
const fakeCtx = { B, roster: { members: () => [], nearest: () => null } };

// 一個零件的 draw call：compound／spur = 黏土一個 + 每種發光色一個；glb = 1（有 glow 再 +1）；列車每節一個 glb；
// orbit（飛天車）：model.parts 是一個 compound、不然一個 glb；ramp（屋頂斜坡）一個 compound；deck（懸浮月台）每個 glb 各算；接駁車一個 compound；名冊不算
function drawCalls(v) {
  const glb = m => 1 + (m.glow ? 1 : 0), compound = parts => 1 + new Set(parts.filter(x => x.glow).map(x => x.glow)).size;
  return Object.values(v).reduce((t, p) => t + (
    p.kind === 'compound' || p.kind === 'spur' ? compound(p.parts)
      : p.kind === 'ramp' ? 1
      : p.kind === 'orbit' && p.model ? compound(p.model.parts)
      : p.kind === 'glb' || p.kind === 'orbit' ? glb(p)
        : p.kind === 'train' ? p.models.length
          : p.kind === 'deck' ? p.models.reduce((a, m) => a + glb(m), 0)
          : p.kind === 'shuttle' ? 1 : 0), 0);
}

// ── 列車時鐘與支線行程 ──
test('trainPose: cars trail along the track radius at the right spacing; speed 0 freezes them', () => {
  const { TRACK, trainPose } = token;
  const a = trainPose(5, 0), b = trainPose(5, 1);
  for (const p of [a, b]) { assert.ok(Math.abs(Math.hypot(p.x, p.z) - TRACK.radius) < 1e-9); assert.equal(p.y, TRACK.y); }
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - token.GAP) < 0.01 && Math.abs(token.GAP - 0.6 * token.CAR_H / 0.3) < 1e-9, 'car gap 0.6 × CAR_H / 0.3');
  assert.deepEqual(trainPose(1, 0, { speed: 0 }), trainPose(9, 0, { speed: 0 }));
});
test('trainCars: no train before Lv4, 3 cars at Lv4, 5 from Lv5', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 10].map(token.trainCars), [0, 0, 0, 0, 3, 5, 5, 5]);
});
test('spurPath / spurTrip run from the ring out to the windmill and playground islands; the lighthouse has no spur (R10)', () => {
  assert.deepEqual(token.SPURS, ['windmill', 'playground']);
  assert.throws(() => token.spurPath('lighthouse')); assert.throws(() => token.spurTrip('lighthouse'));
  for (const kind of token.SPURS) {
    const c = satC(kind), p = token.spurPath(kind), trip = token.spurTrip(kind), end = trip.path.at(-1), d = Math.hypot(c.x, c.z);
    assert.ok(Math.abs(Math.hypot(p[0].x, p[0].z) - token.TRACK.radius) < 1e-9, `${kind} shuttle path starts on the ring`);
    assert.ok(Math.hypot(p.at(-1).x - c.x, p.at(-1).z - c.z) < 1.2, `${kind} shuttle path ends on the island`);
    assert.ok(Math.hypot(end.x - c.x, end.z - c.z) < 1.2, `${kind} train trip ends on the island`);
    // 行程從環上（車頭停的角度 a）出發、切線方向接著環走，最後一段沿著徑向上島
    const p0 = trip.path[0];
    assert.ok(Math.abs(Math.hypot(p0.x, p0.z) - token.TRACK.radius) < 1e-9 && Math.abs(Math.atan2(p0.z, p0.x) - trip.a) < 1e-9);
    assert.ok(Math.abs(Math.atan2(end.z, end.x) - Math.atan2(c.z, c.x)) < 1e-6, `${kind} radial into the island`);
    assert.ok(trip.total > 2 && trip.total < 4, `${kind} trip ${trip.total.toFixed(2)}`);
  }
});
test('trainPose with a trip: the head runs out along the spur, cars behind it still on the ring; s = 0 equals the ring at the trip angle', () => {
  const trip = token.spurTrip('windmill'), R = token.TRACK.radius;
  const ring = token.trainPose(trip.a / 0.35, 2), onTrip0 = token.trainPose(123, 2, { trip: { ...trip, s: 0 } });
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(ring[k] - onTrip0[k]) < 1e-9, `s 0 car 2 ${k}`);
  const out = { ...trip, s: trip.total }, head = token.trainPose(0, 0, { trip: out }), end = trip.path.at(-1);
  assert.ok(Math.hypot(head.x - end.x, head.z - end.z) < 1e-9, 'head at the island end');
  const half = { ...trip, s: 0.9 }, c0 = token.trainPose(0, 0, { trip: half }), c3 = token.trainPose(0, 3, { trip: half });
  assert.ok(Math.hypot(c0.x, c0.z) > R - 0.2 && Math.abs(Math.hypot(c3.x, c3.z) - R) < 1e-9, 'car 3 (0.9 − 1.8 < 0) behind on the ring');
});

// ── view：每一級看得到的變化（§4.1）──
test('token view: something new at every level 1–10; one staff from Lv2 (people budget R16: no second staff at Lv8)', () => {
  assert.deepEqual(Object.keys(views[0]), []);
  assert.deepEqual(Object.keys(views[1]), ['token.main'], 'Lv1 sign and a small platform, nobody yet');
  for (let n = 2; n <= 10; n++) assert.ok(diffParts(nonRoster(views[n - 1]), nonRoster(views[n])).add.length, `lv${n}: something new`);
  for (const n of [2, 3, 9]) assert.notEqual(JSON.stringify(views[n]['token.main']), JSON.stringify(views[n - 1]['token.main']), `lv${n} station changes`);
  assert.deepEqual([1, 2, 3, 7, 8, 10].map(n => views[n]['token.staff']?.n ?? 0), [0, 1, 1, 1, 1, 1]);
  for (let n = 2; n <= 10; n++) { const st = views[n]['token.staff']; assert.deepEqual([st.kind, st.accessory, st.home.kind], ['roster', 'uniform', 'stand']); }
  const keys = n => Object.keys(views[n]);
  assert.ok(!keys(3).includes('token.track') && keys(4).includes('token.track'), 'ring line at Lv4');
  assert.ok(!keys(6).some(k => k.startsWith('token.spur')) && keys(7).filter(k => k.startsWith('token.spur')).length === 2, 'two spurs at Lv7');
  assert.ok(!keys(7).includes('token.shuttle') && keys(8).includes('token.shuttle'), 'shuttle at Lv8');
  assert.ok(!keys(8).includes('token.deck') && keys(9).includes('token.deck'), 'floating platform at Lv9');
  assert.ok(!keys(9).some(k => k.startsWith('token.cars')) && keys(10).filter(k => k.startsWith('token.cars')).length === 3, 'three flying cars at Lv10');
});
test('trains: Lv4 subway 3 cars, Lv5 subway 5 cars, Lv6+ bullet train 5 cars (Kenney Train Kit glb, palette tint)', () => {
  const tr = n => views[n]['token.train'];
  for (let n = 1; n <= 3; n++) assert.equal(tr(n), undefined, `lv${n} no train`);
  assert.equal(tr(4).models.length, 3); assert.equal(tr(5).models.length, 5); assert.equal(tr(6).models.length, 5); assert.equal(tr(10).models.length, 5);
  for (const n of [4, 5]) assert.ok(tr(n).models.every(m => m.path.startsWith('kenney/train/train-electric-subway-')), `lv${n} subway`);
  for (const n of [6, 7, 8, 9, 10]) assert.ok(tr(n).models.every(m => m.path.startsWith('kenney/train/train-electric-bullet-')), `lv${n} bullet`);
  // 車頭、中間車、車尾（車尾是車頭轉半圈）：三種車型都用到
  assert.deepEqual(tr(5).models.map(m => m.path.slice(-5)), ['a.glb', 'b.glb', 'c.glb', 'b.glb', 'a.glb']); assert.equal(tr(5).models.at(-1).ry, Math.PI);
  assert.notDeepEqual(tr(5).tint, tr(6).tint, 'the bullet train is repainted (white with orange)');
  for (const n of [4, 6]) {
    for (const c of Object.values(tr(n).tint)) assert.ok(PALETTE.has(c), `lv${n} tint ${c.toString(16)} in the palette`);
    for (const m of tr(n).models) assert.ok(existsSync(new URL(`../assets/${m.path}`, import.meta.url)), m.path);
  }
  assert.equal(tr(4).speed, 0.35); assert.equal(token.view(L({ token: 4 }), { flooded: true })['token.train'].speed, 0, 'flooded stops the train');
});
test('Lv9 cyber station: Cyberpunk Kit platform (hovering), railing and sign with neon glow; the roadsters park on its roof at Lv10', () => {
  const v = views[9], deck = v['token.deck'];
  assert.equal(deck.kind, 'deck'); assert.equal(deck.footprint, false, 'hovers: no footprint');
  assert.deepEqual(deck.models.map(m => m.path), ['quat/cyberpunk/Platform_4x1_Empty.glb', 'quat/cyberpunk/Rail_Long.glb', 'quat/cyberpunk/Sign_1.glb']);
  for (const m of deck.models) {
    assert.ok(m.glow, `${m.path} glows`);
    for (const c of [...Object.values(m.tint ?? {}), ...Object.values(m.glow)]) assert.ok(PALETTE.has(c), `${m.path} ${c.toString(16)}`);
    assert.ok(existsSync(new URL(`../assets/${m.path}`, import.meta.url)), m.path);
  }
  assert.ok(deck.at.y - AT.y >= 0.6, 'the platform floats above head height');
  assert.ok(v['token.main'].parts.some(p => p.glow === C.neonBlue), 'neon station body'); assert.ok(deck.models[1].glow['^Black$'] === C.neonPink && deck.models[2].glow['^Texture_Signs$'] === C.neonPink, 'pink neon railing and sign');
  const roof = token.ROOF_Y, f = v['token.main'].footprint;
  for (let i = 0; i < 3; i++) {
    const car = views[10][`token.cars.${i}`], pk = car.park;
    assert.equal(car.kind, 'orbit');
    assert.ok(Math.abs(pk.y - (AT.y + roof)) < 1e-9, 'parked on the roof');
    assert.ok(Math.abs(pk.x - (AT.x + f.x)) < f.w / 2 && Math.abs(pk.z - (AT.z + f.z)) < f.d / 2, 'within the station');
    assert.ok(Math.hypot(car.at.x - TOWER.x, car.at.z - TOWER.z) < 1e-9, 'orbits 101');
  }
});
test('Lv7 spurs reach the windmill and playground islands (one keyed part each, no footprint); Lv8 shuttle on the playground spur', () => {
  const v = views[8];
  for (const kind of token.SPURS) {
    const s = v[`token.spur.${kind}`], c = satC(kind), pts = worldPoints({ at: s.at, parts: s.parts.map(p => ({ pos: rot(p.pos, s.bearing) })) });
    assert.equal(s.kind, 'spur'); assert.equal(s.footprint, false);
    assert.ok(Math.abs(Math.hypot(s.at.x, s.at.z) - token.TRACK.radius) < 1e-9, `${kind} starts on the ring`);
    assert.ok(pts.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 1.3), `${kind} reaches the island`);
  }
  const sh = v['token.shuttle'], c = satC('playground');
  assert.equal(sh.kind, 'shuttle'); assert.equal(sh.footprint, false); assert.ok(Math.hypot(sh.path[1].x - c.x, sh.path[1].z - c.z) < 1.2);
  for (const k of ['token.track', 'token.train']) assert.equal(v[k].footprint, false, k);
});
// 支線零件的本地座標（沿 +z 往外）轉回世界方向
const rot = ([x, y, z], b) => [x * Math.cos(b) + z * Math.sin(b), y, -x * Math.sin(b) + z * Math.cos(b)];
test('the ring track has 12 pylons standing in the water, heights from groundAt; the ring runs in the channel outside the main island', async () => {
  const { SPACING, R, WATER_Y, TOP } = await import('../src/scene/hex.js');
  const ps = views[4]['token.track'].parts.filter(p => p.kind === 'cylinder');
  assert.equal(ps.length, 12); assert.ok(views[4]['token.track'].parts.some(p => p.kind === 'rail'));
  for (const p of ps) { const base = groundAt(p.pos[0], p.pos[2]); assert.equal(base, WATER_Y); assert.ok(Math.abs(p.pos[1] - p.scale[1] / 2 - base) < 1e-9); assert.ok(Math.abs(p.pos[1] + p.scale[1] / 2 - token.TRACK.y) < 1e-9); }
  const mainReach = Math.sqrt(3) * SPACING + R, satInner = Math.min(...SATELLITES.map(s => Math.hypot(satC(s.kind).x, satC(s.kind).z))) - R;
  assert.ok(token.TRACK.radius > mainReach + 0.5 && token.TRACK.radius < satInner - 0.3);
  assert.ok(token.TRACK.y <= TOP + 0.6);
});
test('flooded (token ≤ 2): the station is a pool with two swimmers (≤ 3), no staff', () => {
  for (const n of [1, 2]) {
    const v = token.view(L({ token: n }), { flooded: true });
    assert.ok(v['token.main'].parts.some(p => p.color === 0xa4d4da)); assert.equal(v['token.staff'], undefined);
    assert.deepEqual([v['token.swimmers'].kind, v['token.swimmers'].n, v['token.swimmers'].from], ['roster', 2, 'token.staff']);
  }
});
// 計畫 8 任務 5：Lv10 多一片屋頂斜坡（token.ramp，一個 compound）、三台 Roadster 各多一個紅色尾燈的發光 mesh → Lv10 上限 24，其餘照舊 ≤ 20
test('token draw calls: ≤ 20 for the station, track, spurs, trains and flying cars at every level (Lv10 with the roof ramp and tail lights ≤ 24)', () => {
  for (let n = 1; n <= 10; n++) for (const flooded of [false, true]) {
    const d = drawCalls(token.view(L({ token: n }), { flooded }));
    assert.ok(d <= (n === 10 ? 24 : 20), `lv${n}${flooded ? ' flooded' : ''}: ${d}`);
  }
});
test('every token station part and every footprint corner stays inside the token cell (track, spurs, trains and flying cars are on the water / in the sky)', () => {
  const OUT = ['token.track', 'token.train', 'token.shuttle'];
  for (let n = 1; n <= 10; n++) for (const flooded of [false, true]) for (const [key, s] of Object.entries(token.view(L({ token: n }), { flooded }))) {
    for (const f of [].concat(s.footprint || [])) {
      const cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : [f.w / 2, f.d / 2];
      for (const [dx, dz] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]]) assert.deepEqual(cellAt(cx + dx, cz + dz), CELL, `lv${n} ${key} footprint corner`);
    }
    if (OUT.includes(key) || key.startsWith('token.spur') || key.startsWith('token.cars') || s.kind === 'roster') continue;
    for (const p of s.kind === 'glb' || s.kind === 'deck' ? [s.at] : worldPoints(s)) assert.ok(distToCell(p, CELL) < RING_R, `lv${n} ${key} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
});

// ── 零件建構：列車（glb 車廂）、支線、飛天車（orbit）──
const factory = (extra = {}) => createPartFactory(THREE, { glow: createGlowRegistry(), builders: token.builders, assets: { spawn: async () => new THREE.Group() }, ...extra });
test('train builder: one glb per car (Train Kit path, tail turned round), cars follow trainPose and the rail trip', () => {
  const rail = { offset: 0 }, spawned = [];
  const f = factory({ rail, assets: { spawn: async (path, o) => { spawned.push([path, o.ry, o.tint]); return new THREE.Group(); } } });
  const spec5 = views[6]['token.train'], p = f.build(spec5); p.update(0.1, 3);
  assert.equal(p.object.children.length, 5);
  assert.deepEqual(spawned.map(s => s[0]), spec5.models.map(m => m.path)); assert.equal(spawned.at(-1)[1], Math.PI); assert.equal(spawned[0][2], spec5.tint);
  const want = token.trainPose(3, 0); assert.ok(Math.abs(p.object.children[0].position.x - want.x) < 1e-9);
  rail.trip = { ...token.spurTrip('windmill'), s: 2 }; p.update(0.1, 3);
  const h = token.trainPose(0, 0, { trip: rail.trip }); assert.ok(Math.abs(p.object.children[0].position.x - h.x) < 1e-9, 'head on the spur');
});
test('shuttle runs back and forth on the playground spur', () => {
  const p = factory().build(views[8]['token.shuttle']); p.update(0.5, 0.5); const a = p.object.children[0].position.clone(); p.update(1.5, 2);
  assert.ok(a.distanceTo(p.object.children[0].position) > 0.3);
});
test('orbitPose: in from the start point, one lap on the circle (tangent yaw, height h), then to the park point; done after', () => {
  const s = { at: { x: 1, y: 0.5, z: -1 }, r: 2, h: 4, speed: 2.5, phase: 0.3, legs: [1.2, 0.8], from: { x: 10, y: 3, z: 10 }, park: { x: 2, y: 1.2, z: 3 } };
  const lap = TWO_PI / s.speed;
  assert.deepEqual(orbitPose(s, 0), { x: 10, y: 3, z: 10, yaw: orbitPose(s, 0).yaw, done: false });
  for (const t of [1.2, 1.2 + lap * 0.25, 1.2 + lap * 0.7]) {
    const p = orbitPose(s, t), a = Math.atan2(p.z - s.at.z, p.x - s.at.x);
    assert.ok(Math.abs(Math.hypot(p.x - s.at.x, p.z - s.at.z) - s.r) < 1e-9 && Math.abs(p.y - (s.at.y + s.h)) < 1e-9, `t ${t} on the circle`);
    if (t > 1.2 + 1) assert.ok(Math.abs(Math.sin(p.yaw) + Math.sin(a)) < 1e-9 && Math.abs(Math.cos(p.yaw) - Math.cos(a)) < 1e-9, `t ${t} tangent yaw (after the turn-in)`);
  }
  // 停好的方向接著最後一段的方向（從圓上那點飛向停車點），不再轉
  const end = orbitPose(s, 1.2 + lap + 0.8 + 0.01), E = { x: s.at.x + Math.cos(0.3) * 2, z: s.at.z + Math.sin(0.3) * 2 };
  assert.deepEqual(end, { x: 2, y: 1.2, z: 3, yaw: Math.atan2(2 - E.x, 3 - E.z), done: true });
  assert.ok(Math.hypot(orbitPose(s, 0, 'park').x - 2, orbitPose(s, 0, 'park').z - 3) < 1e-9, 'a lap from the park point starts there');
  // 計畫 8 任務 5：park 有 yaw（Roadster 停好車頭朝 101）就停成那個方向
  const y = { ...s, park: { ...s.park, yaw: 0.4 } };
  assert.equal(orbitPose(y, Infinity).yaw, 0.4); assert.ok(Math.abs(orbitPose(y, 0, 'park').yaw - 0.4) < 1e-9, 'takes off facing park.yaw');
});
test('orbit part: parked until fly(); takes off from the roof ramp, flies one lap round 101 and parks again; with rest it takes off again by itself', () => {
  const s = views[10]['token.cars.0'], p = factory().build(s), m = () => { const o = p.object.children[0]; return { x: s.at.x + o.position.x, y: s.at.y + o.position.y, z: s.at.z + o.position.z }; };
  const parked = () => Math.hypot(m().x - s.park.x, m().y - s.park.y, m().z - s.park.z) < 1e-9;
  assert.ok(parked(), 'starts parked'); p.update(0.5, 0.5); assert.ok(parked() || s.rest < 0.5);
  p.object.userData.fly(); p.update(0, 0);
  assert.equal(s.from, undefined, 'no sea entry any more');
  assert.ok(parked(), 'fly() starts on the roof'); p.update(0.3, 0.3);
  assert.ok(m().y > s.park.y && Math.hypot(m().x - s.park.x, m().z - s.park.z) < 0.35, 'slides up the ramp first');
  let onCircle = 0;
  for (let i = 0; i < 300; i++) { p.update(1 / 30, i / 30); if (Math.abs(Math.hypot(m().x - TOWER.x, m().z - TOWER.z) - s.r) < 1e-6) onCircle++; }
  assert.ok(onCircle / 30 > 0.8 * TWO_PI / s.speed, 'spends the lap on the circle round 101'); assert.ok(parked(), 'parked after the flight');
  if (s.rest) { let off = 0; for (let t = 0; t < s.rest + 1; t += 1 / 30) { p.update(1 / 30, t); if (!parked()) off++; } assert.ok(off > 0, 'takes off again after rest'); }
  p.object.userData.land(); assert.ok(parked(), 'land() snaps to the roof');
});

// 審稿第 1 輪：每一段交界（斜坡、拉高、上圓、離圓、落地）車頭不瞬間轉向——整趟（劇本叫的、停滿 rest 自己再飛的）每幀轉向 ≤ 0.2 rad
test('orbit headings turn smoothly: ≤ 0.2 rad per frame through ramp → climb → lap → descent → park, both the scripted and the rest flight', () => {
  const s = views[10]['token.cars.2'], p = factory().build(s), yaw = () => p.object.children[0].rotation.y;
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  p.object.userData.fly(); p.update(0, 0);
  let prev = yaw(), worst = 0, frames = 0, retook = false;
  const T = FLIGHT + s.rest + FLIGHT + 2;
  for (let t = 0; t < T; t += 1 / 30) {
    const parked = Math.abs(p.object.children[0].position.y - (s.park.y - s.at.y)) < 1e-9;
    p.update(1 / 30, t); frames++;
    if (parked && Math.abs(p.object.children[0].position.y - (s.park.y - s.at.y)) > 1e-9) retook = true;
    worst = Math.max(worst, turn(prev, yaw())); prev = yaw();
  }
  assert.ok(retook, 'took off again from the roof'); assert.ok(worst <= 0.2, `worst turn ${worst.toFixed(3)} rad in a frame`);
});

// ── 劇本（§6：一級 3–5 秒；◆ Lv7、Lv10 6–10 秒、回全景定格）──
const STAFF = ['token.staff', 'token.swimmers', 'sat.playground'];
// 鏡頭軌跡（含回合最後的 focus('home')）：Lv7 風車島 → 全景定格 → 全景；Lv8 遊樂場島 → 代幣格（LEVEL UP）→ 全景；Lv10 一開始就回全景
const want = (to, order) => (to === 7 ? [String(satCell(islandOf7(order))), 'home', 'home'] : to === 8 ? [String(satCell('playground')), String(CELL), 'home'] : to === 10 ? ['home', 'home', 'home'] : [String(CELL), 'home']);
test('scripts: every token event in the solution plays 3–5 s (◆ Lv7 / Lv10 6–10 s whole), ends with LEVEL UP on token, camera trail, everyone home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h, timing = {};
  let n = 0, r = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) { n = bubblesLog.length; r = h.rig.log.length; } return run(evs, opts); };
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = [];
    await playItem(show, tracked, order, 'token', (e, secs) => {
      const to = e.kind === 'grow' ? e.to : 1, what = `${order.join('>')} ${e.kind} ${to}`; seen.push(to); (timing[to] ??= []).push(+secs.toFixed(1));
      const big = to === 7 || to === 10;
      assert.ok(secs >= 3 && secs <= (big ? KEY_MAX : SCRIPT_EXCEPT[`token ${to}`] ?? SCRIPT_MAX), `${what} took ${secs.toFixed(2)}s`);
      if (big) assert.ok(show.elapsed >= 6 && show.elapsed <= KEY_MAX, `◆ ${what} whole event ${show.elapsed.toFixed(2)}s`);
      if (e.kind === 'grow') {
        const last = bubblesLog.slice(n).at(-1), hd = show.stage.headOf('token');
        assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - hd.x, last.at.y - hd.y, last.at.z - hd.z) < 0.3, `${what} LEVEL UP over token`);
        assert.deepEqual(focusTrail(h.rig.log, r).map(String), want(to, order), `${what} camera trail`);
      }
      for (const k of STAFF) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
      assert.equal(show.roster.members('token.staff').length, to >= 2 ? 1 : 0, `${what} staff count`);
      assert.equal(h.rail.trip ?? null, null, `${what} no trip left on the rail`);
    });
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], `token events seen: ${seen}`);
  }
});
// 審稿（計畫 4 最後一輪）：Lv8 從遊樂場島回代幣格，鏡頭先飛到站上（自己一拍）才打 LEVEL UP（一起演的話字有一半時間在畫面外）
test('Lv8: the camera is back on the token cell before the LEVEL UP (the label never shares a beat with a focus)', () => {
  const beats = token.script.grow[8]({ kind: 'grow', item: 'token', to: 8 }, { lv: L({ token: 8, milk: 5 }), flags: {} }, fakeCtx);
  const i = beats.findIndex(b => b.kind === 'focus' && b.target === 'token');
  assert.ok(i >= 0 && beats[i + 1].kind === 'levelUp' && i + 2 === beats.length, `focus token, then LEVEL UP last (${beats.map(b => b.kind)})`);
  assert.ok(!beats.some(b => b.kind === 'together' && b.beats.some(x => x.kind === 'focus') && b.beats.some(x => x.kind === 'levelUp')), 'no focus + label together');
});
test('scripts: the ◆ levels end on the overview (focus home with a hold) before the LEVEL UP; Lv7 opens on the windmill island at zoom 0.8 (the playground island once the windmill spur is there, R7)', () => {
  for (const n of [7, 10]) {
    const beats = flat(token.script.grow[n]({ kind: 'grow', item: 'token', to: n }, { lv: L({ token: n, milk: 5 }), flags: {} }, fakeCtx));
    const i = beats.findIndex(b => b.kind === 'focus' && b.target === 'home' && b.dur >= 1.0),   // 停 ≥ 1.0（裁決 R17：◆ ≤ 8 s，原 ≥ 1.5）
      j = beats.findIndex(b => b.kind === 'levelUp');
    assert.ok(i > 0 && j > i, `lv${n} holds on the overview before LEVEL UP`);
  }
  const b7 = token.script.grow[7]({ kind: 'grow', item: 'token', to: 7 }, { lv: L({ token: 7 }), flags: {} }, fakeCtx);
  assert.equal(b7[0].kind, 'focus'); assert.equal(b7[0].dur, 0.8); assert.deepEqual(focusCell(b7[0], fakeCtx), satCell('windmill'));
  assert.ok(flat(b7).some(b => b.kind === 'trainStop'), 'the train rides out on the spur');
  // 風車島的支線已經在（燈泡 ≥ 7，裁決 R7）：開在遊樂場島、列車開進遊樂場島的支線、只長那一條
  const prev = { lv: L({ token: 6, bulb: 7 }), flags: {} }, p7 = token.script.grow[7]({ kind: 'grow', item: 'token', to: 7 }, { lv: L({ token: 7, bulb: 7 }), flags: {}, prev }, fakeCtx);
  assert.deepEqual(focusCell(p7[0], fakeCtx), satCell('playground'));
  assert.equal(flat(b7).find(b => b.kind === 'trainStop').spur, 'windmill'); assert.equal(flat(p7).find(b => b.kind === 'trainStop').spur, 'playground');
  assert.deepEqual(flat(p7).filter(b => b.kind === 'scaleIn').length, 1, 'only the playground spur grows');
  // 兩條都要長：遊樂場島那條排在回全景之後（列車島那頭停站的 during 裡）
  const during = flat(b7).find(b => b.kind === 'trainStop').during, iHome = during.findIndex(b => b.kind === 'focus' && b.target === 'home');
  assert.ok(iHome >= 0 && during.slice(iHome + 1).some(b => b.kind === 'scaleIn'), 'the playground spur grows after the camera is back on the overview');
});
// trainStop 支線版：列車進到支線入口（環上 trip.a）→ 開到風車島那頭停住 → 開回環上；skip 不留行程
test('trainStop({ spur }) takes the train out to the island end, holds it there, brings it back; end clears the trip', () => {
  const tl = createTimeline(), rail = { offset: 0 }, trip = token.spurTrip('windmill');
  const ctx = { now: 0, rail, stage: { flags: {}, partObject: k => (k === 'token.train' ? {} : null) } };
  const atEnd = [], log = [], steps = [];   // steps：環上（沒在支線上）每幀車頭轉了多少 rad，與這幀前後在不在支線上
  ctx.now = (trip.a + 0.2) / 0.35;   // 剛過入口：要繞將近一圈，趕路用到上限 4.5 倍
  tl.play([B.trainStop({ spur: 'windmill', stop: 1, during: [{ kind: 'x', dur: 0.2, start: () => log.push('x') }] })], ctx);
  let prevA = (ctx.now + rail.offset) * 0.35, prevTrip = null;
  for (let i = 0; i < 30 * 15 && tl.busy; i++) {
    ctx.now += 1 / 30; tl.update(1 / 30);
    const hd = token.trainPose(ctx.now + rail.offset, 0, { trip: rail.trip }), a = (ctx.now + rail.offset) * 0.35;
    if (Math.hypot(hd.x - trip.path.at(-1).x, hd.z - trip.path.at(-1).z) < 0.05) atEnd.push(ctx.now);
    if (!rail.trip) steps.push({ d: a - prevA, before: !!prevTrip });
    const was = prevTrip; prevTrip = rail.trip; prevA = a;
    if (rail.trip && !was) steps.push({ d: 0, into: steps.at(-1)?.d ?? 0 });
  }
  // 趕路不超過 4.5 倍；開進入口前一幀已經慢到不比原速快（減速停進去），倒回環上後第一幀也是從慢慢開始
  const normal = 0.35 / 30;
  assert.ok(Math.max(...steps.map(x => x.d)) <= 4.5 * normal * 1.001, `boost ≤ 4.5 (max ${(Math.max(...steps.map(x => x.d)) / normal).toFixed(2)}×)`);
  assert.ok(steps.find(x => x.into !== undefined).into <= normal, 'eases into the junction');
  assert.ok(steps.find(x => x.before).d <= normal * 0.2, 'eases out of the junction');
  assert.ok(!tl.busy); assert.equal(rail.trip, null);
  assert.ok(atEnd.length / 30 >= 0.9, `held at the island end ${(atEnd.length / 30).toFixed(2)} s`);
  assert.deepEqual(log, ['x'], 'during plays at the island end');
  const a = (((ctx.now + rail.offset) * 0.35 - trip.a) % TWO_PI + TWO_PI) % TWO_PI;
  assert.ok(a < 0.5 || a > TWO_PI - 0.01, `back on the ring at the junction (${a.toFixed(3)})`);
  const s2 = createTimeline(), r2 = { offset: 3 }; s2.play([B.trainStop({ spur: 'windmill' })], { ...ctx, rail: r2 }); s2.update(0); s2.skip(); assert.equal(r2.trip, null);
});
// 照 order 演到代幣升 to 級那個事件：之前的事件瞬間演，這個事件單獨 live 演（回傳事件，找不到回 null）
async function liveAt(h, order, to) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (e.kind === 'grow' && e.item === 'token' && e.to === to) { await h.run([solo(e)]); return e; }
      await h.run([e], { instant: true });
    }
    await h.run([{ kind: 'settle' }], { instant: true });
  }
  return null;
}
// Lv7 live：列車真的開到新支線那頭（車頭離島心 < 1.3）——風車島的支線已經被燈泡 Lv7 鋪好就開進遊樂場島（裁決 R7），不然風車島。
// 唯一正解（2026-10-31）：正解是風車島；遊樂場島那條改用列舉裡第一條（PLAYGROUND7），兩條都量（舊前提是兩條正解各一條）
test('Lv7 live: the train rides out to the island of the new spur while the camera is there, then the overview', async () => {
  assert.deepEqual(SOLUTIONS.map(islandOf7), ['windmill'], 'the solution: the windmill spur');
  assert.ok(PLAYGROUND7, 'some order grows the playground spur at token 7');
  for (const order of [...SOLUTIONS, PLAYGROUND7]) {
    const h = await headlessShow(), { show } = h, kind = islandOf7(order), c = satC(kind), update = show.update;
    let near = 0;
    show.update = (dt, t) => { update(dt, t); const o = show.stage.partObject('token.train'); if (o && h.rail.trip) { const p = o.children[0].position; if (Math.hypot(p.x - c.x, p.z - c.z) < 1.3) near++; } };
    const done = !!await liveAt(h, order, 7);
    assert.ok(done && near >= 15, `${order.join('>')}: head near the ${kind} island for ${near} frames`);
  }
});
// 審稿（計畫 5b 任務 3，裁決 R7）：燈泡 Lv7 先到的那種局（唯一正解之後是 PLAYGROUND7）、風車島支線已經鋪好；代幣 Lv7 只長遊樂場島那條——鏡頭要在遊樂場島，
// 不能還飛去風車島（新長的支線整段在畫面外）。真的鏡頭 rig（16:9 全景）：支線長出來的每一幀，新長的那條支線的島心投影在 NDC ±0.9 裡
test('Lv7 live, real camera: the island of every newly grown spur is on screen (NDC ±0.9) while the spur grows, in the solution (windmill) and the playground order', async () => {
  for (const order of [...SOLUTIONS, PLAYGROUND7]) {
    const cam = overviewRig(), h = await headlessShow({ rig: cam.rig }), { show } = h, update = show.update, frames = {}, out = [];
    const ndc = p => { cam.camera.lookAt(cam.controls.target); cam.camera.updateMatrixWorld(); cam.camera.updateProjectionMatrix(); return new THREE.Vector3(p.x, p.y, p.z).project(cam.camera); };
    show.update = (dt, t) => {
      update(dt, t);
      for (const kind of token.SPURS) {
        const o = show.stage.partObject(`token.spur.${kind}`), k = o?.scale.z;
        if (!(k > 1e-3 && k < 1)) continue;
        const c = satC(kind), p = ndc({ x: c.x, y: token.spurPath(kind).at(-1).y, z: c.z });
        frames[kind] = (frames[kind] ?? 0) + 1;
        if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) out.push(`${kind} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
      }
    };
    const e = await liveAt(h, order, 7);
    assert.ok(e, `${order.join('>')}: token reaches 7`);
    assert.ok(Object.values(frames).some(n => n >= 10), `${order.join('>')}: a spur grows on screen (${JSON.stringify(frames)})`);
    assert.deepEqual([...new Set(out)].slice(0, 5), [], `${order.join('>')}: ${out.length} frames with a growing spur's island off screen`);
  }
});
test('Lv8 live: the playground kids get off the shuttle at the island end and go home on the island; still one staff (R16)', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, end = token.spurPath('playground').at(-1);
  let first = null;
  show.update = (dt, t) => { update(dt, t); const ks = show.roster.members('sat.playground'); if (!first && ks.length) first = ks.map(k => ({ ...k.pos })); };
  const done = !!await liveAt(h, SOLUTIONS[0], 8);
  assert.ok(done && show.stage.lv.milk >= 3);
  assert.ok(first?.length >= 1 && first.every(p => Math.hypot(p.x - end.x, p.z - end.z) < 0.6), 'kids spawn by the shuttle end');
  const ks = show.roster.members('sat.playground'), c = satC('playground');
  assert.equal(ks.length, 2);
  for (let i = 0; i < 120; i++) show.update(1 / 30, 100 + i / 30);
  for (const k of ks) { assert.equal(cellAt(k.pos.x, k.pos.z), null); assert.ok(Math.hypot(k.pos.x - c.x, k.pos.z - c.z) < 1.5, 'stays on the playground island'); }
  assert.equal(show.roster.members('token.staff').length, 1);
});
test('Lv10 live: the three roadsters take off from the roof ramp, fly a lap round 101 and land on the station roof', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, lap = new Set();
  show.update = (dt, t) => { update(dt, t); for (let i = 0; i < 3; i++) { const o = show.stage.partObject(`token.cars.${i}`); if (!o) continue; const p = o.children[0].position, w = { x: o.position.x + p.x, z: o.position.z + p.z }; if (Math.hypot(w.x - TOWER.x, w.z - TOWER.z) < 3) lap.add(i); } };
  const done = !!await liveAt(h, SOLUTIONS[0], 10);
  assert.ok(done); assert.equal(lap.size, 3, 'all three came round 101');
  for (let i = 0; i < 3; i++) {
    const o = show.stage.partObject(`token.cars.${i}`), p = o.children[0].position, park = token.view(show.stage.lv, show.stage.flags)[`token.cars.${i}`].park;
    assert.ok(Math.hypot(o.position.x + p.x - park.x, o.position.y + p.y - park.y, o.position.z + p.z - park.z) < 1e-6, `car ${i} parked on the roof`);
  }
});
// ── 計畫 8 任務 5：飛天車改 Tesla Roadster（設計 §4.6）──
const RAMP_A = 20 * Math.PI / 180, toTower = p => Math.atan2(TOWER.x - p.x, TOWER.z - p.z);
const angErr = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
test('Lv10 roadsters: three primitive cars (red, white, graphite) — wedge body, 4 wheels r 0.045, one dark canopy, glowing tail bar, 4 cone nozzles, no glb; parked facing 101', () => {
  const cars = [0, 1, 2].map(i => views[10][`token.cars.${i}`]);
  assert.deepEqual(cars.map(c => c.model.parts[1].color), [C.coral, C.white, C.ink], 'red, white, graphite bodies');
  assert.deepEqual(cars[0].model.parts, token.roadsterParts(C.coral), 'built from the shared roadsterParts');
  for (const [i, car] of cars.entries()) {
    assert.equal(car.kind, 'orbit'); assert.equal(car.path, undefined, `car ${i}: no glb`); assert.ok(Array.isArray(car.model?.parts), `car ${i}: model.parts`);
    const ps = car.model.parts, wheels = ps.filter(p => p.kind === 'cylinder' && Math.abs(p.scale[0] - 0.09) < 1e-9);
    assert.equal(wheels.length, 4, 'four wheels of r 0.045'); assert.ok(wheels.every(w => w.color === C.ink && Math.abs(w.rot[2] - Math.PI / 2) < 1e-9), 'dark tyres, axle along x');
    const top = p => p.pos[1] + p.scale[1] / 2, bottom = p => p.pos[1] - p.scale[1] / 2, chassis = ps[0];
    for (const w of wheels) {
      assert.ok(Math.abs(w.pos[0]) + w.scale[1] / 2 >= token.CAR_W / 2 + 0.01 - 1e-9, 'wheels stick out of the body sides');
      assert.ok(w.pos[1] - 0.045 < bottom(chassis) - 0.01, 'and below the chassis');
    }
    const cones = ps.filter(p => p.kind === 'cone');
    assert.equal(cones.length, 4, 'four nozzles'); assert.ok(cones.every(p => p.color === C.curb && bottom(p) < bottom(chassis)), 'curb-grey nozzles peeking below the chassis');
    const canopy = ps.filter(p => p.kind === 'sphere'); assert.equal(canopy.length, 1, 'one canopy'); assert.equal(canopy[0].color, C.navy, 'dark glass');
    const hood = ps.find(p => p.rot && p.rot[0] > 0.1 && p.kind === 'box'); assert.ok(hood && hood.pos[2] > 0 && top(hood) < top(ps[1]), 'a hood pitched down in front of the rear deck (wedge)');
    assert.ok(ps.some(p => p.glow === C.red && p.pos[2] < -token.CAR_L / 2), 'a glowing red tail bar');
    assert.equal(new Set(ps.filter(p => p.glow).map(p => p.glow)).size, 1, 'one glow colour per car (draw calls)');
    assert.equal(ps.filter(p => p.color === C.white && p.pos[2] > token.CAR_L / 2 - 0.01).length, 2, 'two headlights at the nose');
    for (const p of car.model.parts) assert.ok(PALETTE.has(p.color), `car ${i} ${p.kind} ${p.color.toString(16)}`);
    assert.ok(angErr(car.park.yaw, toTower(car.park)) < 0.05, `car ${i} parked facing 101 (${car.park.yaw.toFixed(3)})`);
    assert.ok(angErr(orbitPose(car, Infinity).yaw, toTower(car.park)) < 0.05, `car ${i} lands facing 101`);
    assert.deepEqual(car.ramp, { ...token.LANES[i], points: token.CAR_CONTACTS }, `car ${i} launches from its own lane`);
    assert.ok(angErr(car.ramp.yaw, toTower(car.park)) < 0.05 && car.ramp.len === 0.35 && Math.abs(car.ramp.angle - RAMP_A) < 1e-12, 'lane 0.35 long, 20° up, pointing at 101');
  }
});
// 坡道起飛（fix round 2）：軌跡跟坡道的幾何綁在一起——表面用 token.LANES 的常數自己算（不借 parts.js 的 rampSurface）
const laneFrame = (lane, p) => { const dx = Math.sin(lane.yaw), dz = Math.cos(lane.yaw), rx = p.x - lane.foot.x, rz = p.z - lane.foot.z; return { along: rx * dx + rz * dz, side: rx * dz - rz * dx }; };
const laneTop = lane => lane.len * Math.cos(lane.angle);
const laneY = (lane, along) => lane.foot.y + (along < 0 ? 0 : along * Math.tan(lane.angle));   // 坡腳以前是屋頂
const contactsWorld = p => token.CAR_CONTACTS.map(([a, u]) => {
  const th = p.pitch ?? 0, fa = a * Math.cos(th) - u * Math.sin(th);
  return { x: p.x + Math.sin(p.yaw) * fa, y: p.y + a * Math.sin(th) + u * Math.cos(th), z: p.z + Math.cos(p.yaw) * fa };
});
test('roadster take-off rides its lane: rolls flat on the roof, then while the nose is between lane foot and top the underside sits on the lane (≤ 0.01 above, never below); wheels within the lane width', () => {
  assert.ok(token.CAR_W / 2 + token.WHEEL_OUT - token.WHEEL_W / 2 <= token.LANE_W / 2, 'wheel centres inside the lane width');
  for (let i = 0; i < 3; i++) {
    const car = views[10][`token.cars.${i}`], lane = token.LANES[i], top = laneTop(lane);
    let onLane = 0, flatFrames = 0;
    for (let t = 0; t < 0.6; t += 0.01) {
      const p = orbitPose(car, t, 'park'), cs = contactsWorld(p).map(c => ({ ...c, ...laneFrame(lane, c) })), nose = cs[3];
      for (const c of cs) {
        assert.ok(Math.abs(c.side) < 1e-6, `car ${i}: on the lane centre line`);
        if (c.along <= top) assert.ok(c.y >= laneY(lane, c.along) - 1e-6, `car ${i} t ${t.toFixed(2)}: a contact ${(laneY(lane, c.along) - c.y).toFixed(4)} below the roof/lane`);
      }
      if (nose.along < 0) { flatFrames++; assert.ok(Math.abs(p.y - lane.foot.y) < 1e-6 && !(p.pitch > 0), `car ${i}: flat on the roof before the nose reaches the foot`); }
      if (nose.along >= 0.05 && nose.along <= top) {
        onLane++;
        const under = Math.min(...cs.filter(c => c.along >= 0 && c.along <= top).map(c => c.y - laneY(lane, c.along)));
        assert.ok(under >= -1e-6 && under <= 0.01, `car ${i} t ${t.toFixed(2)}: underside ${under.toFixed(4)} above the lane`);
      }
    }
    assert.ok(flatFrames >= 3 && onLane >= 10, `car ${i}: ${flatFrames} frames rolling on the roof, ${onLane} on the lane`);
    const lift = orbitPose(car, 0.6 - 1e-9, 'park'), front = laneFrame(lane, contactsWorld(lift)[2]);
    assert.ok(Math.abs(front.along - top) < 0.01, `car ${i}: front wheels leave at the lane top (${front.along.toFixed(3)} / ${top.toFixed(3)})`);
    assert.ok(!(orbitPose(car, car.legs[0] + 0.5, 'park').pitch > 0), 'flat on the orbit');
  }
});
test('token.ramp: only at Lv10 — three lanes (one per car, 0.35 at 20°, pointing at 101) in one mesh, clear of each other and of the antenna; no footprint, not on the phone', () => {
  for (let n = 1; n <= 9; n++) assert.equal(views[n]['token.ramp'], undefined, `lv${n}`);
  const r = views[10]['token.ramp'];
  assert.equal(r.kind, 'ramp'); assert.equal(r.footprint, false); assert.equal(r.low, false, 'phone draws no cars, so no ramp either');
  assert.ok(Math.abs(r.at.y - (AT.y + token.ROOF_Y)) < 1e-9, 'on the roof'); assert.equal(r.lanes, token.LANES); assert.equal(r.lanes.length, 3);
  for (const [i, lane] of r.lanes.entries()) {
    const park = views[10][`token.cars.${i}`].park, f = laneFrame(lane, park);
    assert.ok(angErr(lane.yaw, toTower(lane.foot)) < 0.05 && Math.abs(lane.yaw - park.yaw) < 1e-12, `lane ${i} points at 101 along its car`);
    assert.ok(Math.abs(-f.along - (token.CAR_L / 2 + token.LANE_GAP)) < 1e-9 && Math.abs(f.side) < 1e-9, `lane ${i} foot just ahead of its car's nose`);
    assert.ok(Math.abs(lane.foot.y - park.y) < 1e-12, 'foot on the roof');
  }
  const parts = token.laneParts(r.lanes[0]), deck = parts[0];
  assert.equal(deck.kind, 'box'); assert.equal(deck.scale[2], 0.35); assert.ok(Math.abs(deck.rot[0] + RAMP_A) < 1e-9, 'tilted 20° up'); assert.equal(deck.color, C.curb);
  // 坡面頂面＝表面：頂面中線在坡腳高 0、坡頂高 len·sin
  const topAt = s => deck.pos[1] + deck.scale[1] / 2 * Math.cos(RAMP_A) + (s - 0.5) * deck.scale[2] * Math.sin(RAMP_A);
  assert.ok(Math.abs(topAt(0)) < 1e-9 && Math.abs(topAt(1) - 0.35 * Math.sin(RAMP_A)) < 1e-9, 'deck top face is the lane surface');
  // 一個 mesh（一個 draw call）
  let meshes = 0; const p = factory().build(r); p.object.traverse(x => { if (x.isMesh) meshes++; }); assert.equal(meshes, 1, 'three lanes, one mesh'); p.dispose();
  // 水平投影的矩形：彼此不重疊、離天線 ≥ 2 公分
  const rect = l => { const dx = Math.sin(l.yaw), dz = Math.cos(l.yaw), w = l.width / 2, top = laneTop(l); return [[0, -w], [top, -w], [top, w], [0, w]].map(([a, s]) => [l.foot.x + dx * a + dz * s, l.foot.z + dz * a - dx * s]); };
  const gap = (A, Bq) => { let best = -Infinity; for (const P of [A, Bq]) for (let i = 0; i < 4; i++) {
    const p1 = P[i], q = P[(i + 1) % 4], n = [q[1] - p1[1], p1[0] - q[0]], l = Math.hypot(...n), pa = A.map(v => (v[0] * n[0] + v[1] * n[1]) / l), pb = Bq.map(v => (v[0] * n[0] + v[1] * n[1]) / l);
    best = Math.max(best, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb)); } return best; };
  const R = r.lanes.map(rect);
  for (const [i, j] of [[0, 1], [1, 2]]) assert.ok(gap(R[i], R[j]) >= 0, `lanes ${i}/${j} overlap (${gap(R[i], R[j]).toFixed(3)})`);
  const ant = { x: AT.x + token.ANTENNA.x, z: AT.z + token.ANTENNA.z };
  for (const [i, lane] of r.lanes.entries()) {
    const f = laneFrame(lane, ant), a = Math.max(0, Math.min(laneTop(lane), f.along)), d = Math.hypot(f.along - a, Math.max(0, Math.abs(f.side) - lane.width / 2));
    assert.ok(d >= token.ANTENNA.r + 0.02, `lane ${i} ${d.toFixed(3)} from the antenna`);
  }
});
test('parked roadsters do not overlap each other, stay on the roof (token.ROOF) and clear the roof antenna (token.ANTENNA)', () => {
  const cars = [0, 1, 2].map(i => views[10][`token.cars.${i}`]), Lc = token.CAR_L;
  // 車身 CAR_W；連凸出車側 0.01 的輪子算寬 CAR_W + 0.02（保守：當成整條車長都有輪子）
  const rect = (c, W = token.CAR_W) => { const { yaw } = orbitPose(c, Infinity), f = [Math.sin(yaw), Math.cos(yaw)], r = [f[1], -f[0]], p = c.park;
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [p.x + f[0] * a * Lc / 2 + r[0] * b * W / 2 - AT.x, p.z + f[1] * a * Lc / 2 + r[1] * b * W / 2 - AT.z]); };
  const gap = (A, Bq) => { let best = -Infinity; for (const P of [A, Bq]) for (let i = 0; i < 4; i++) {
    const p = P[i], q = P[(i + 1) % 4], n = [q[1] - p[1], p[0] - q[0]], l = Math.hypot(...n), pa = A.map(v => (v[0] * n[0] + v[1] * n[1]) / l), pb = Bq.map(v => (v[0] * n[0] + v[1] * n[1]) / l);
    best = Math.max(best, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb)); } return best; };
  const B = cars.map(c => rect(c)), R = cars.map(c => rect(c, token.CAR_W + 0.02));
  for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) {
    assert.ok(gap(B[i], B[j]) >= 0.02, `cars ${i}/${j} body gap ${gap(B[i], B[j]).toFixed(3)}`);
    assert.ok(gap(R[i], R[j]) >= 0.01, `cars ${i}/${j} wheel gap ${gap(R[i], R[j]).toFixed(3)}`);
  }
  for (const [i, c] of R.entries()) for (const [x, z] of c) assert.ok(Math.abs(x) <= token.ROOF.w / 2 && Math.abs(z) <= token.ROOF.d / 2, `car ${i} corner (${x.toFixed(2)}, ${z.toFixed(2)}) on the roof`);
  const seg = (x, z, [a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  for (const [i, c] of R.entries()) { const d = Math.min(...c.map((p, k) => seg(token.ANTENNA.x, token.ANTENNA.z, [p, c[(k + 1) % 4]]))); assert.ok(d >= 0.05, `car ${i} ${d.toFixed(3)} from the antenna`); }
});
test('quality low: Lv10 live draws no roadsters (empty Groups) and no ramp, and still plays through', async () => {
  const h = await headlessShow({ quality: 'low' }), done = !!await liveAt(h, SOLUTIONS[0], 10);
  assert.ok(done);
  for (let i = 0; i < 3; i++) { const o = h.show.stage.partObject(`token.cars.${i}`); assert.ok(o?.isGroup, `car ${i} part exists`); assert.equal(o.children.length, 0, `car ${i} draws nothing`); }
  let meshes = 0; h.show.stage.partObject('token.ramp')?.traverse(x => { if (x.isMesh) meshes++; }); assert.equal(meshes, 0, 'no ramp on the phone');
});
// ◆ 關鍵節點：Lv4 環狀線（選擇帶動升級裁決 R6）、Lv7 通車到離島、Lv10 飛天車（裁決 R11）
test('the ◆ key nodes are Lv4 (R6), Lv7 and Lv10 (R11)', () => {
  assert.deepEqual(Object.entries(token.script.grow).filter(([, f]) => f.key).map(([n]) => +n), [4, 7, 10]);
});
// 兩個事件以上的回合整段 live 演：Lv4 環狀線的列車從站後面 0.6 rad 駛出
// Lv4 標 ◆（裁決 R6），跳級的第二級照演完整劇本。回到 GROW（2026-10-29 設計 §3.2）的表之後代幣 Lv3、Lv4 各有條件：
// 賽博正解 2 → 4 跳級（Lv4 是跳級的第二級），外星正解 3 → 4 一般升級（4 → 5 才跳）——兩種都要演到列車出發，至少一條是跳級（◆ 跳級那條路真的量到）。
// 照正解演到那回合，整回合原樣 live 演（前面別的事件的劇本與起因段照演，列車的位置跟著時鐘走）
test('grow 4 in a full live turn: the ring line rises and the train departs from behind the station', async () => {
  const h = await headlessShow(), { show, run } = h, is4 = e => e.kind === 'grow' && e.item === 'token' && e.to === 4;
  let jumped = 0;
  for (const order of SOLUTIONS) {
    show.reset();
    let st = engine.createState(spec), evs = null;
    for (const id of order) {
      const r = engine.place(st, id, spec); st = r.state;
      if (r.events.some(is4)) { evs = r.events; break; }
      await run([...r.events, { kind: 'settle' }], { instant: true });
    }
    assert.ok(evs, 'grow 4 happens in a placement turn');
    if (evs.find(is4).jump) jumped++;
    assert.ok(evs.findIndex(is4) > 1, 'other scripts play before it');
    const scripted = token.script.grow[4]; let angle = null;
    token.script.grow[4] = (e, s2, ctx) => {
      const beats = scripted(e, s2, ctx), dep = flat(beats).find(b => b.kind === 'trainDepart'), start = dep.start;
      dep.start = c => { const r = start(c); angle = (c.now + c.rail.offset) * 0.35; return r; };
      return beats;
    };
    token.script.grow[4].key = scripted.key;   // 包一層照樣是 ◆（拿掉旗標的話 turn.js 只演 apply + LEVEL UP，列車不會出發）
    try { await run([...evs, { kind: 'settle' }]); } finally { token.script.grow[4] = scripted; }
    assert.ok(angle != null, `${order.join('>')}: the Lv4 script played (train departed)`);
    const d = ((((angle - (STATION_A - 0.6)) % TWO_PI) + TWO_PI + Math.PI) % TWO_PI) - Math.PI;
    assert.ok(Math.abs(d) < 0.05, `head car at ${angle} vs ${STATION_A - 0.6}`);
    assert.ok(show.stage.partObject('token.train') && show.stage.partObject('token.track'));
  }
  assert.ok(jumped >= 1, 'grow 4 is the second level of a jump (2 → 4) in some solution');
});

// ── 入口點、站體 footprint、站務員不穿過珍奶人龍（計畫 3.8 Task 6、§14.1）──
test('token rosters enter from behind the station, walkable and ≥ 1.5 from every spot; Lv2 spawns the staff there', async () => {
  const nav = createNav(), bad = [];
  for (let n = 1; n <= 10; n++) for (const flooded of [false, true]) {
    const v = token.view(L({ token: n }), { flooded });
    for (const [k, d] of Object.entries(v)) if (d.kind === 'roster') assert.equal(d.home.entry, token.STAFF_ENTRY, `lv${n} ${k} entry`);
    bad.push(...entryProblems(v, nav, `lv${n}${flooded ? ' flooded' : ''}`));
  }
  bad.push(...await entriesThroughSolutions(token, SOLUTIONS));
  assert.deepEqual(bad, []);
  assert.deepEqual(cellAt(token.STAFF_ENTRY.x, token.STAFF_ENTRY.z), CELL);
  const beats = token.script.grow[2]({ kind: 'grow', item: 'token', to: 2 }, { lv: L({ token: 2 }), flags: {} }, fakeCtx);
  const sp = beats.find(b => b.kind === 'spawn'), at = [];
  sp.start({ roster: { spawnHeld: (k, p) => { at.push([k, p]); return null; } } });
  assert.deepEqual(at, [['token.staff', token.STAFF_ENTRY]]);
});
test('the staff entry walk to the post stays clear of the boba queue and the cart front', async () => {
  const BOBA = anchorWorld('boba'), POST = offset(AT, 0.6, 0.55);
  const { queue, SHOP } = await import('../src/actors/boba.js'), Q = queue(BOBA, 6), ROW = queue(BOBA, 1)[0].z;   // 攤車前那排（店北移之後跟著 SHOP 算）
  const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / LL)); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  const front = p => Math.abs(p.x - BOBA.x) < 1.3 && p.z > SHOP.z + 0.15 && p.z < ROW + 0.25;   // 攤車前緣到人龍後面 0.25
  const check = (route, what) => {
    for (let k = 1; k < route.length; k++) {
      for (const q of Q) assert.ok(segD(q, route[k - 1], route[k]) >= 0.25, `${what}: passes ${segD(q, route[k - 1], route[k]).toFixed(2)} from queue spot (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
      for (let u = 0; u <= 1; u += 0.05) { const a = route[k - 1], b = route[k]; assert.ok(!front({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }), `${what}: crosses the cart front`); }
    }
  };
  check([token.STAFF_ENTRY, POST], 'straight');
  const { show, run } = await headlessShow();
  for (const order of SOLUTIONS) {
    show.reset(); let s = engine.createState(spec), seen = 0;
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const [i, step] of steps.entries()) {
      const r = step(s); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true });
      if (show.stage.lv.boba >= 1) { seen++; check(show.nav.route(token.STAFF_ENTRY, POST), `${order.join('>')} step ${i + 1}`); }
    }
    assert.ok(seen >= 3, 'checked with the cart on the island');
  }
});
test('the station has a footprint at every level and staff/swimmer spots are walkable (rescue), outside the padded station', () => {
  for (let n = 1; n <= 10; n++) for (const flooded of [false, true]) {
    const v = token.view(L({ token: n }), { flooded }), what = `lv${n}${flooded ? ' flooded' : ''}`, f = v['token.main'].footprint;
    assert.ok(f && typeof f === 'object' && (f.r > 0 || (f.w > 0 && f.d > 0)), `${what}: station footprint ${JSON.stringify(f)}`);
    const fp = f.r !== undefined ? { x: AT.x, z: AT.z, r: f.r } : { x: AT.x + (f.x ?? 0), z: AT.z + (f.z ?? 0), w: f.w, d: f.d };
    const nav = createNav(); nav.setFootprints([fp]);
    assert.ok(!nav.walkable(AT.x, AT.z), `${what}: nobody stands inside the station`);
    for (const [k, d] of Object.entries(v)) {
      if (d.kind !== 'roster') continue;
      assert.equal(d.home.rescue, true, `${what} ${k} rescue`);
      for (const s of d.home.spots) {
        const p = nav.walkable(s.x, s.z) ? s : nav.nearestWalkable(s);
        assert.ok(Math.hypot(p.x - s.x, p.z - s.z) < 0.8, `${what} ${k} stays by its spot`);
        const out = fp.r !== undefined ? Math.hypot(p.x - fp.x, p.z - fp.z) - fp.r : Math.max(Math.abs(p.x - fp.x) - fp.w / 2, Math.abs(p.z - fp.z) - fp.d / 2);
        assert.ok(out >= PAD - 1e-9, `${what} ${k} outside the padded station (${out.toFixed(2)})`);
      }
    }
  }
});
// 裁決 R15：蒙太奇倍速——fly({ speed: 2 }) 整趟飛行快兩倍（delay 也照演出時間）
test('orbit part fly({ speed: 2 }) flies the lap at double speed and parks in half the time', () => {
  const s = views[10]['token.cars.0'], time = speed => {
    const p = factory().build(s), o = () => p.object.children[0].position, park = () => Math.hypot(s.at.x + o().x - s.park.x, s.at.y + o().y - s.park.y, s.at.z + o().z - s.park.z) < 1e-9;
    p.object.userData.fly({ speed }); let n = 0; p.update(0, 0); while (!park() && n < 900) { p.update(1 / 30, n / 30); n++; } return n / 30;
  };
  const one = time(1), two = time(2); assert.ok(Math.abs(two - one / 2) < 0.1, `×1 ${one.toFixed(2)} s, ×2 ${two.toFixed(2)} s`);
});

// 2026-10-28 錄影修正：列車加大（CAR_H 0.3 → 0.42，車頂座位、車頭泡泡的高度照比例從 CAR_H 推算）。沿環一圈與兩條支線每 0.2 公尺取樣，
// 車廂的包圍盒（載入器實際量 glb，高 CAR_H）不碰任何 footprint（兩條結局的終盤、代幣 Lv7–8）、主島的橋面；在環上時不壓到主島或衛星島的島面；
// 相鄰兩節不重疊（間距 ≥ 車長）
test('the bigger train (CAR_H 0.42) clears every footprint, bridge deck and island edge along the ring and both spurs; cars do not overlap', async () => {
  const { readFileSync } = await import('node:fs'), { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js'), { createAssets } = await import('../src/scene/assets.js');
  const { ALL, inShape } = await import('./helpers/show.js'), { MAIN_CELLS, adjacentPairs, edgeMidpoint } = await import('../src/scene/hex.js'), { BRIDGE_HALF, satelliteAt } = await import('../src/show/nav.js');
  const { RIDE_Y } = token;
  assert.equal(token.CAR_H, 0.42); assert.ok(Math.abs(RIDE_Y - 0.6 * token.CAR_H) < 1e-9, 'roof seats at 0.6 × CAR_H');
  const fakeTexture = () => ({ name: 'fakeTexture', loadTexture: () => { const t = new THREE.Texture({ width: 1, height: 1 }); t.flipY = false; return Promise.resolve(t); } });
  const loader = { load: (url, ok, _, fail) => { const b = readFileSync(url); new GLTFLoader().register(fakeTexture).parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, fail); } };
  const assets = createAssets(THREE, { base: 'assets/', loader, pixels: () => ({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) }) });
  let hw = 0, hl = 0;
  for (const kind of ['subway', 'bullet']) for (const x of ['a', 'b', 'c']) {
    const g = await assets.spawn(`kenney/train/train-electric-${kind}-${x}.glb`, { h: token.CAR_H }), size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.y - token.CAR_H) < 0.01, `${kind}-${x} is ${size.y.toFixed(3)} tall`);
    hw = Math.max(hw, size.x / 2); hl = Math.max(hl, size.z / 2);   // 車頭朝 +z：x 是車寬、z 是車長
  }
  const a = token.trainPose(0, 0), b = token.trainPose(0, 1), gap = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(gap - 2 * hl >= 0.05, `cars ${(gap - 2 * hl).toFixed(3)} apart (gap ${gap.toFixed(2)}, car ${(2 * hl).toFixed(2)})`);
  // 車廂底面的取樣點（每 0.05）
  const body = p => { const ux = Math.sin(p.yaw), uz = Math.cos(p.yaw), out = [];
    for (let u = -hl; u <= hl + 1e-9; u += hl / 6) for (let v = -hw; v <= hw + 1e-9; v += hw / 3) out.push({ x: p.x + ux * u + uz * v, z: p.z + uz * u - ux * v });
    return out; };
  const bridges = adjacentPairs(MAIN_CELLS).map(([A, Bc]) => { const { a: p, b: q } = edgeMidpoint(A, Bc, RING_R * Math.sqrt(3) / 2), len = Math.hypot(q.x - p.x, q.z - p.z); return { p, len, ux: (q.x - p.x) / len, uz: (q.z - p.z) / len }; });
  const onBridge = c => bridges.some(br => { const dx = c.x - br.p.x, dz = c.z - br.p.z, s = dx * br.ux + dz * br.uz; return s >= -0.1 && s <= br.len + 0.1 && Math.abs(dx * br.uz - dz * br.ux) <= BRIDGE_HALF; });
  const max = { milk: 10, chip: 9, bulb: 9, token: 10, typhoon: 3, rat: 5, boba: 7, baseball: 8 };
  const states = [[max, { ratBranch: 'cyber' }], [max, { ratBranch: 'alien' }], [{ ...max, token: 7, bulb: 7 }, {}], [L({ token: 8, bulb: 7, milk: 3 }), {}]];
  const fps = states.flatMap(([lvs, flags]) => ALL.flatMap(m => Object.values(m.view(lvs, flags, {}))).flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: (p.at?.x ?? 0) + (f.x ?? 0), z: (p.at?.z ?? 0) + (f.z ?? 0) }))));
  const bad = new Set();
  const check = (p, where, ring) => { for (const c of body(p)) {
    const f = fps.find(f => inShape(f, c.x, c.z)); if (f) bad.add(`${where}: footprint ${JSON.stringify(f)}`);
    if (onBridge(c)) bad.add(`${where}: bridge deck`);
    if (ring && (cellAt(c.x, c.z) || satelliteAt(c) >= 0)) bad.add(`${where}: on an island at (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
  } };
  const C0 = TWO_PI * token.TRACK.radius;
  for (let s = 0; s < C0; s += 0.2) check(token.trainPose(s / token.TRACK.radius / 0.35, 0), `ring ${s.toFixed(1)}`, true);
  for (const kind of token.SPURS) { const trip = token.spurTrip(kind); for (let s = 0; s <= trip.total; s += 0.2) check(token.trainPose(0, 0, { trip: { ...trip, s } }), `${kind} spur ${s.toFixed(1)}`, false); }
  assert.deepEqual([...bad].slice(0, 10), [], `${bad.size} samples hit something`);
});

// 拜訪點（計畫 6 設計 §4、§5）：唯一正解每一個 token 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof token.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(token, SOLUTIONS, { cells: () => [[0, 1]] });
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 9, 10]);
});
