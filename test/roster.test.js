import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createPeople } from '../src/scene/people.js';
import { createNav, SEPARATION } from '../src/show/nav.js';
import { createBlink } from '../src/show/blink.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { mulberry32 } from '../src/scene/random.js';
import { axialToWorld, cellTop, cellAt } from '../src/scene/hex.js';
installFakeDom();
const { createRoster, HEAD_Y, WANDER_SPEED } = await import('../src/show/roster.js');

const AT = anchorWorld('milk');
const kids = n => ({ kind: 'roster', at: AT, n, shirt: 0xfcea8b, home: { kind: 'wander', at: AT, r: 1.0 } });
// 出場／退場／分離用：[0, 1] 格的排隊站位與兩個入口（離每個站位 ≥ 1.5）
const centre = cell => { const c = axialToWorld(...cell); return { x: c.x, y: cellTop(cell), z: c.z }; };
const gap = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const Q = centre([0, 1]);
const QSPOTS = [{ x: Q.x - 0.2, y: Q.y, z: Q.z, yaw: 0 }, { x: Q.x + 0.2, y: Q.y, z: Q.z, yaw: 0 }, { x: Q.x + 0.6, y: Q.y, z: Q.z, yaw: 0 }];
const QENTRY = [{ x: Q.x - 1.6, y: Q.y, z: Q.z + 0.8 }, { x: Q.x + 0.6, y: Q.y, z: Q.z - 1.6 }];
const queue = (n, entry = QENTRY) => ({ kind: 'roster', at: Q, n, home: { kind: 'stand', spots: QSPOTS, entry } });
const run = (roster, frames, t0 = 0) => { for (let i = 0; i < frames; i++) roster.update(1 / 30, t0 + i / 30); };

// 真 people、真 nav、真 blink（blink.log 記下每次 walker／part 的對象）；假 assets（holder 帶一個假 mixer，記錄 spawn／release）
function setup() {
  const people = createPeople(THREE, { max: 48 }), spawned = [], released = [];
  const assets = {
    spawned, released,
    spawn: async (path, opts) => { const g = new THREE.Group(); g.userData.mixer = { timeScale: 1 }; g.userData.opts = opts; opts.parent?.add(g); spawned.push(g); return g; },
    release: g => { released.push(g); g.removeFromParent(); },
  };
  const nav = createNav({ rnd: mulberry32(7) }), blink = createBlink(THREE, { people }), rail = { offset: 0 };
  const { walker, part } = blink; blink.log = [];
  blink.walker = (w, dur) => { blink.log.push(['walker', w]); walker(w, dur); };
  blink.part = (o, dur, end) => { blink.log.push(['part', o]); part(o, dur, end); };
  const roster = createRoster(THREE, { people, assets, build: null, nav, blink, rail, rnd: mulberry32(11) });
  return { roster, people, assets, blink, nav, rail };
}

// §13.2：新生的成員不閃
test('declare spawns n members at home without a blink; members wander on the grid', () => {
  const { roster, people, blink, nav } = setup(); roster.declare('milk.kids', kids(3));
  assert.equal(roster.members('milk.kids').length, 3); assert.equal(people.walkers.length, 3); assert.equal(blink.count, 0); assert.deepEqual(blink.log, []);
  assert.ok(roster.members('milk.kids').every(m => m.walker.pose.y > 0), 'standing on the island at once');
  for (let i = 0; i < 60; i++) roster.update(1 / 30, i / 30);
  for (const m of roster.members('milk.kids')) { assert.ok(nav.walkable(m.pos.x, m.pos.z)); assert.ok(Math.hypot(m.pos.x - AT.x, m.pos.z - AT.z) <= 1.0 + 0.3); }
});
test('re-declaring the same key keeps the same members: n up adds, n down removes, accessory swaps in place', () => {
  const { roster } = setup(); roster.declare('k', kids(3)); const first = roster.members('k');
  roster.declare('k', kids(5)); assert.equal(roster.members('k').length, 5); assert.ok(first.every(m => roster.members('k').includes(m)));
  roster.declare('k', { ...kids(2), accessory: 'cap' }); const left = roster.members('k'); assert.equal(left.length, 2); assert.ok(left.every(m => m.walker.accessory === 'cap' && first.includes(m)));
});
test('from transfers a member between keys without respawning; removals wait for flush', () => {
  const { roster, people } = setup(); roster.declare('chip.engineers', kids(4)); const four = [...roster.members('chip.engineers')];
  roster.declare('chip.engineers', kids(3)); roster.declare('chip.detective', { ...kids(1), accessory: 'glass', from: 'chip.engineers' }); roster.flush();
  assert.equal(people.walkers.length, 4, 'nobody left, nobody new');
  assert.equal(roster.members('chip.engineers').length, 3); const det = roster.members('chip.detective'); assert.equal(det.length, 1);
  assert.ok(four.includes(det[0])); assert.equal(det[0].walker.accessory, 'glass'); assert.equal(det[0].key, 'chip.detective');
  roster.snap(); roster.declare('chip.engineers', kids(2)); roster.flush();
  assert.equal(roster.members('chip.engineers').length, 2); assert.equal(people.walkers.length, 4, 'a plain shrink walks one out (R9)');
  roster.snap(); assert.equal(people.walkers.length, 3, 'gone after a skip');
});
test('hold: nothing spawns until spawnHeld/sync; spawnHeld places members where the script wants', () => {
  const { roster, people } = setup(); roster.declare('k', kids(3), { hold: true }); assert.equal(people.walkers.length, 0);
  const m = roster.spawnHeld('k', { x: 1, y: 0.65, z: 1 }); assert.deepEqual(m.pos, { x: 1, y: 0.65, z: 1 }); assert.equal(roster.members('k').length, 1);
  roster.sync('k'); assert.equal(roster.members('k').length, 3); assert.throws(() => roster.spawnHeld('k', AT), /held/);
});
test('claim stops idling; home resumes; snap puts scripted members back home instantly', () => {
  const { roster } = setup(); roster.declare('k', { ...kids(1), home: { kind: 'stand', spots: [{ x: 1, y: 0.65, z: 1, yaw: 0 }] } }); const m = roster.members('k')[0];
  roster.claim(m); roster.setPose(m, { x: 0, y: 0.65, z: 0, walking: true }); for (let i = 0; i < 30; i++) roster.update(1 / 30, i / 30); assert.deepEqual([m.pos.x, m.pos.z], [0, 0]);
  roster.home(m); for (let i = 0; i < 150; i++) roster.update(1 / 30, i / 30); assert.ok(Math.hypot(m.pos.x - 1, m.pos.z - 1) < 0.1, 'walked back to the spot at WANDER_SPEED');
  roster.claim(m); roster.setPose(m, { x: 0, y: 0.65, z: 0 }); roster.snap(); assert.deepEqual([m.pos.x, m.pos.z, m.mode], [1, 1, 'home']);
});
test('model members ride the train roof in seats, idle animation pauses while standing', async () => {
  const { roster, rail, assets } = setup(); rail.offset = 0;
  roster.declare('rat.pack', { kind: 'roster', at: AT, n: 5, model: { path: 'quat/enemies/Rat.glb', h: 0.2, anim: 'Walk' }, home: { kind: 'ride', cars: 3, speed: 0.35 } });
  await new Promise(r => setTimeout(r, 0)); roster.update(1 / 30, 1);
  const ms = roster.members('rat.pack'); assert.equal(ms.length, 5); assert.equal(assets.spawned.length, 5);
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(Math.hypot(ms[i].pos.x - ms[j].pos.x, ms[i].pos.z - ms[j].pos.z) > 0.2, 'no two rats share a seat');
  assert.ok(ms.every(m => Math.abs(Math.hypot(m.pos.x, m.pos.z) - 8.3) < 0.2), 'on the ring');
  assert.equal(ms[0].holder.userData.mixer.timeScale, 0);
});
test('reset releases every walker and model', async () => {
  const { roster, people, assets } = setup(); roster.declare('a', kids(3)); roster.declare('b', { kind: 'roster', at: AT, n: 2, model: { path: 'x.glb', h: 0.2 }, home: { kind: 'wander', at: AT, r: 1 } });
  await new Promise(r => setTimeout(r, 0)); roster.reset(); assert.equal(people.walkers.length, 0); assert.equal(assets.released.length, 2); assert.equal(roster.count, 0);
});
test('a model that arrives after reset or retire is released, never shown', async () => {
  const { roster, assets } = setup(), model = n => ({ kind: 'roster', at: AT, n, model: { path: 'x.glb', h: 0.2 }, home: { kind: 'wander', at: AT, r: 1 } });
  roster.declare('a', model(2)); roster.declare('b', model(1)); roster.retire('b'); roster.flush(); roster.reset();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(assets.spawned.length, 3); assert.equal(assets.released.length, 3); assert.equal(roster.group.children.length, 0); assert.deepEqual(roster.keys(), []);
});

// 審查修正 1：同一個鍵換模型外觀（tint／h／glow／path）→ 同一個成員換一個 holder、頭高重算
test('changing a model look on an existing key swaps the holder for the same member and recomputes headY', async () => {
  const { roster, assets } = setup(), rat = extra => ({ kind: 'roster', at: AT, n: 1, model: { path: 'quat/enemies/Rat.glb', h: 0.2, anim: 'Walk', ...extra }, home: { kind: 'wander', at: AT, r: 1 } });
  roster.declare('rat.pack', rat()); await new Promise(r => setTimeout(r, 0)); const m = roster.members('rat.pack')[0], old = m.holder;
  roster.declare('rat.pack', rat({ h: 0.5, tint: { Grey: 0x5fcf7a } })); await new Promise(r => setTimeout(r, 0));
  assert.equal(roster.members('rat.pack')[0], m, 'same member object');
  assert.notEqual(m.holder, old); assert.ok(assets.released.includes(old)); assert.equal(assets.spawned.length, 2);
  assert.deepEqual([m.holder.userData.opts.h, m.holder.userData.opts.tint], [0.5, { Grey: 0x5fcf7a }]);
  assert.ok(Math.abs(m.headY - 0.75) < 1e-9, 'HEAD_Y.model scaled by h / 0.2');
});
// §13.2：新生的直接看得到、不閃；換配件在小人身上閃白 0.15 s（每人一次）
test('spawns show at once without a blink; an accessory swap blinks each walker once', () => {
  const { roster, blink, people } = setup(); roster.declare('k', kids(3)); const ms = roster.members('k');
  assert.ok(ms.every(m => m.walker.pose.y > 0)); assert.equal(blink.count, 0);
  roster.declare('k', { ...kids(3), accessory: 'cap' }); assert.ok(ms.every(m => m.walker.accessory === 'cap'));
  assert.deepEqual(blink.log, ms.map(m => ['walker', m.walker])); assert.ok(ms.every(m => m.walker.white && m.walker.pose.y > 0), 'white, in place');
  blink.update(0.16); assert.ok(ms.every(m => !m.walker.white)); assert.equal(people.walkers.length, 3);
  roster.accessory(ms[0], 'glass'); assert.deepEqual(blink.log.at(-1), ['walker', ms[0].walker]);
});
// 模型換外觀：新 holder 到了才閃；只換天線／眼睛的當場閃
test('a model swap blinks the new holder when it arrives; a dress change blinks the holder at once', async () => {
  const { roster, blink } = setup(), rat = extra => ({ kind: 'roster', at: AT, n: 1, model: { path: 'x.glb', h: 0.2, ...extra }, home: { kind: 'wander', at: AT, r: 1 } });
  roster.declare('rat.pack', rat()); await new Promise(r => setTimeout(r, 0)); const [m] = roster.members('rat.pack');
  assert.deepEqual(blink.log, [], 'a new model member does not blink');
  roster.declare('rat.pack', rat({ antenna: true })); assert.deepEqual(blink.log, [['part', m.holder]]);
  roster.declare('rat.pack', rat({ antenna: true, tint: { Grey: 1 } })); assert.equal(blink.log.length, 1, 'waits for the new holder');
  await new Promise(r => setTimeout(r, 0)); assert.deepEqual(blink.log.at(-1), ['part', m.holder]); assert.equal(blink.log.length, 2);
  roster.declare('rat.pack', rat({ antenna: true, tint: { Grey: 2 } })); roster.snap();
  await new Promise(r => setTimeout(r, 0)); assert.equal(blink.log.length, 2, 'after a skip the late holder does not blink');
});
// 審查修正 3：跳過＝所有人（不只劇本手上的）瞬間到家、停下、看得到
test('snap puts every member home at once, including home-mode members still walking and unrevealed spawns', () => {
  const { roster } = setup(), spots = [{ x: 1, y: 0.65, z: 1, yaw: 0 }, { x: -1, y: 0.65, z: 1, yaw: 0 }];
  const stand = s => ({ ...kids(2), home: { kind: 'stand', spots: s } });
  roster.declare('k', stand(spots)); roster.snap();
  roster.declare('k', stand([{ x: 1, y: 0.65, z: -1, yaw: 1 }, { x: -1, y: 0.65, z: -1, yaw: 1 }]));
  for (let i = 0; i < 10; i++) roster.update(1 / 30, i / 30); assert.ok(roster.members('k').every(m => m.walking), 'walking to the new spots');
  roster.declare('k', { ...stand([{ x: 1, y: 0.65, z: -1, yaw: 1 }, { x: -1, y: 0.65, z: -1, yaw: 1 }]), n: 3 }); roster.snap();
  const ms = roster.members('k'); assert.equal(ms.length, 3);
  assert.deepEqual(ms.slice(0, 2).map(m => [m.pos.z, m.walking, m.mode, m.yaw]), [[-1, false, 'home', 1], [-1, false, 'home', 1]]);
  assert.ok(ms.every(m => m.walker.pose.y > 0), 'pending reveals applied');
});
// 小問題 2：同一份宣告，hold → 不 hold 也要套用
test('re-declaring a held spec without hold applies it', () => {
  const { roster } = setup(); roster.declare('k', kids(2), { hold: true }); roster.declare('k', kids(2)); assert.equal(roster.members('k').length, 2);
});
// 鮮奶 Lv3 長高：同一群小孩原地變 1.3 倍（原地閃白），頭頂跟著抬高
test('re-declaring with a new scale updates the walker scale and headY in place', () => {
  const { roster, blink } = setup(); roster.declare('k', kids(3)); const ms = roster.members('k');
  roster.declare('k', { ...kids(3), scale: 1.3 });
  const now = roster.members('k'); assert.ok(now.every((m, i) => m === ms[i]), 'same members');
  for (const m of now) { assert.equal(m.walker.scale, 1.3); assert.ok(Math.abs(m.headY - HEAD_Y.people * 1.3) < 1e-9); assert.ok(m.walker.white && m.walker.pose.y > 0, 'blinks in place'); }
  blink.update(1); assert.ok(now.every(m => !m.walker.white));
});

// 晶片工程師通勤：path 日常沿折線來回（開放路徑走到底折返），起點依 i / n 錯開
const ROUTE = [{ x: AT.x - 1, y: AT.y, z: AT.z }, { x: AT.x + 0.2, y: AT.y, z: AT.z }, { x: AT.x + 0.2, y: AT.y, z: AT.z + 0.8 }];   // 總長 2.0
const toRoute = p => Math.min(...ROUTE.slice(1).map((b, k) => {
  const a = ROUTE[k], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}));
test('path home walks back and forth along the polyline', () => {
  const { roster } = setup(); roster.declare('k', { ...kids(2), home: { kind: 'path', path: ROUTE, loop: false, speed: 0.8 } }); roster.snap();   // 走進來另有測試
  const [a, b] = roster.members('k'), end = ROUTE.at(-1);
  assert.ok(Math.hypot(a.pos.x - ROUTE[0].x, a.pos.z - ROUTE[0].z) < 1e-6, 'member 0 starts at phase 0');
  assert.ok(Math.hypot(b.pos.x - AT.x, b.pos.z - AT.z) < 1e-6, 'member 1 starts half way (s = 1.0)');
  let reached = -1, back = false;
  for (let i = 0; i < 30 * 4; i++) {
    roster.update(1 / 30, i / 30);
    for (const m of [a, b]) assert.ok(toRoute(m.pos) < 0.3, `on the route at frame ${i}`);
    const d = Math.hypot(a.pos.x - end.x, a.pos.z - end.z);
    if (reached < 0 && d < 0.05) reached = i; else if (reached >= 0 && d > 0.5) back = true;
  }
  assert.ok(reached > 0 && reached < 30 * 2.7, `member 0 reached the end at ~2.5 s (frame ${reached})`);
  assert.ok(back, 'and turned back'); assert.ok(a.walking);
  roster.claim(a); roster.setPose(a, { x: AT.x - 0.4, y: AT.y, z: AT.z + 0.6 }); roster.home(a);
  for (let i = 0; i < 30 * 3; i++) roster.update(1 / 30, i / 30);
  assert.ok(toRoute(a.pos) < 0.05, 'walks back onto the route after a script');
  roster.snap(); assert.ok(Math.hypot(a.pos.x - ROUTE[0].x, a.pos.z - ROUTE[0].z) < 1e-6, 'snap puts it at its phase point');
});
test('follow home trails the nearest member of another key and stops at dist', () => {
  const { roster } = setup(), P = { x: AT.x - 0.9, y: AT.y, z: AT.z + 0.3 }, R = { x: AT.x + 0.9, y: AT.y, z: AT.z + 0.3 };
  roster.declare('chip.detective', { ...kids(1), at: P, home: { kind: 'follow', key: 'rat.pack', dist: 0.6 } });
  const d = roster.members('chip.detective')[0]; assert.ok(Math.hypot(d.pos.x - P.x, d.pos.z - P.z) >= 1.5, 'walks in from the cell edge');
  for (let i = 0; i < 30 * 8; i++) roster.update(1 / 30, i / 30);
  assert.ok(Math.hypot(d.pos.x - P.x, d.pos.z - P.z) < 0.05 && !d.walking, 'no rats: walks in to spec.at and stands');
  roster.declare('rat.pack', { ...kids(1), home: { kind: 'stand', spots: [{ ...R, yaw: 0 }] } }); roster.snap();   // 老鼠先站好（走進來另有測試）
  const far = () => Math.hypot(d.pos.x - R.x, d.pos.z - R.z);
  for (let i = 0; i < 30 * 4; i++) roster.update(1 / 30, i / 30);
  assert.ok(Math.abs(far() - 0.6) < 0.1, `stops 0.6 from the rat (${far().toFixed(2)})`); assert.equal(d.walking, false);
  const rat = roster.members('rat.pack')[0]; roster.claim(rat); roster.setPose(rat, { x: R.x, y: R.y, z: R.z - 1.0 });
  const R2 = rat.pos, gap = () => Math.hypot(d.pos.x - R2.x, d.pos.z - R2.z);
  for (let i = 0; i < 30 * 4; i++) roster.update(1 / 30, i / 30);
  assert.ok(Math.abs(gap() - 0.6) < 0.1, `follows when the rat moves (${gap().toFixed(2)})`);
});
// 換身分搬走一個人後，原名冊不夠宣告的人數就補人（工程師 2 → 3 的同一刻有一個變成偵防師）
test('from tops the source roster back up to its declared n', () => {
  const { roster } = setup(); roster.declare('chip.engineers', kids(2));
  roster.declare('chip.engineers', kids(3)); roster.declare('chip.detective', { ...kids(1), accessory: 'glass', from: 'chip.engineers' }); roster.flush();
  assert.equal(roster.members('chip.engineers').length, 3); assert.equal(roster.members('chip.detective').length, 1);
});
// 審查修正（Task 12）：來源名冊同一次被退掉時，from 不能在來源補人（不留幽靈、不多閃）；兩種順序都一樣
test('from with a source retired in the same sync leaves no ghosts and spawns nobody extra (both orders)', () => {
  for (const targetFirst of [true, false]) {
    const { roster, people, blink } = setup(); roster.declare('token.staff', kids(1)); roster.flush();
    const [staff] = roster.members('token.staff'), swim = { ...kids(1), accessory: 'glass', from: 'token.staff' };
    const before = blink.log.length;
    if (targetFirst) { roster.declare('token.swimmers', swim); roster.retire('token.staff'); } else { roster.retire('token.staff'); roster.declare('token.swimmers', swim); }
    roster.flush();
    assert.deepEqual(roster.members('token.swimmers'), [staff], `order ${targetFirst}: same person`);
    assert.equal(people.walkers.length, 1, `order ${targetFirst}: no extra walker`);
    assert.ok(!roster.keys().includes('token.staff'), `order ${targetFirst}: source group gone`);
    assert.equal(blink.log.length - before, 1, `order ${targetFirst}: only the swap blink`);
  }
});
// 審查併入（§5.2 同一個小人原地換）：換身分優先搬「這次宣告之前就在」的人，不搬剛補出來的
test('from prefers a member who existed before this declaration', () => {
  const { roster, people } = setup(); roster.declare('chip.engineers', kids(2)); roster.flush();
  const originals = roster.members('chip.engineers'), at = originals.map(m => ({ ...m.pos }));
  roster.declare('chip.engineers', kids(3)); roster.declare('chip.detective', { ...kids(1), accessory: 'glass', from: 'chip.engineers' });
  const [d] = roster.members('chip.detective'); const k = originals.indexOf(d);
  assert.ok(k >= 0, 'detective is one of the two originals'); assert.deepEqual(d.pos, at[k], 'swapped in place');
  assert.equal(people.walkers.length, 3, 'one new engineer so far');
  roster.flush();
  assert.equal(roster.members('chip.engineers').length, 3); assert.equal(people.walkers.length, 4, 'engineers topped up at flush');
  assert.deepEqual(roster.members('chip.engineers').map(m => m.i), [0, 1, 2]);
});
// Task 14：衛星島（不在主島走路格上）的 wander 家：繞 ringPath(at, r) 走，不被 nav 拉回主島
test('a wander home off the main island loops around a ring instead of being pulled back onto the island', async () => {
  const { SATELLITES, axialToWorld, cellAt } = await import('../src/scene/hex.js');
  const s = SATELLITES.find(x => x.kind === 'playground'), c0 = axialToWorld(s.q, s.r), c = { x: c0.x, y: 0.45, z: c0.z };
  const { roster } = setup(); roster.declare('sat.playground', { kind: 'roster', at: c, n: 2, home: { kind: 'wander', at: c, r: 0.5 } });
  const ms = roster.members('sat.playground'), near = m => Math.abs(Math.hypot(m.pos.x - c.x, m.pos.z - c.z) - 0.5) < 0.05;
  for (const m of ms) { assert.ok(near(m), 'spawned on the ring'); assert.equal(m.pos.y, 0.45); }
  const start = ms.map(m => ({ ...m.pos }));
  for (let i = 0; i < 90; i++) { roster.update(1 / 30, i / 30); for (const m of ms) { assert.equal(cellAt(m.pos.x, m.pos.z), null, 'stays off the main island'); assert.ok(Math.hypot(m.pos.x - c.x, m.pos.z - c.z) < 0.6); } }
  ms.forEach((m, i) => { assert.ok(near(m)); assert.ok(Math.hypot(m.pos.x - start[i].x, m.pos.z - start[i].z) > 0.5, 'walks round the ring at WANDER_SPEED'); });
  // 劇本放到島上別處（溜滑梯）再交回日常：直線走回圈上，不經主島
  roster.claim(ms[0]); roster.setPose(ms[0], { x: c.x + 0.3, y: 0.45, z: c.z + 1.1 }); roster.home(ms[0]);
  for (let i = 0; i < 90; i++) { roster.update(1 / 30, i / 30); assert.ok(Math.hypot(ms[0].pos.x - c.x, ms[0].pos.z - c.z) < 1.3); }
  assert.ok(near(ms[0]));
  roster.claim(ms[1]); roster.setPose(ms[1], { x: c.x, y: 0.45, z: c.z + 1 }); roster.snap(); assert.ok(near(ms[1]));
});

// 颱風登陸：每個人在門口各自藏起來，到下一回合開始（或跳過）才一起露出來
test('showAll un-hides every member and puts them back on the ground', () => {
  const { roster } = setup();
  roster.declare('k', kids(3)); roster.flush();
  const ms = roster.members('k'); ms.forEach(m => roster.hide(m));
  assert.ok(ms.every(m => m.walker.pose.y < -1), 'hidden under the sea');
  assert.ok(ms.every(m => m.hidden));
  roster.showAll();
  assert.ok(ms.every(m => !m.hidden));
  for (const m of ms) assert.ok(Math.abs(m.walker.pose.y - m.pos.y) < 1e-9, 'walker back at its pos (not under the sea)');
});
// 計畫 3.8 Task 6：下一回合開頭 showAll({ walk: true })——躲著的人不在門裡亂走，從門口（藏起來的地方）出來走回家、不閃
test('showAll({ walk: true }): hidden members stay put indoors, reappear at their door and walk home without a blink', () => {
  const { roster, blink } = setup();
  roster.declare('k', kids(2)); roster.declare('q', queue(1)); roster.snap(); run(roster, 30);
  const ms = [...roster.members('k'), ...roster.members('q')];
  // 劇本帶到門口藏起來、回合收尾交回日常（同颱風登陸）
  const doorOf = m => (m.key === 'q' ? { x: Q.x, z: Q.z - 1.2 } : { x: AT.x + 1.2, z: AT.z });
  const doors = ms.map(m => { roster.claim(m); roster.setPose(m, doorOf(m)); roster.hide(m); roster.home(m); return { ...m.pos }; });
  run(roster, 30 * 5);
  ms.forEach((m, i) => assert.ok(gap(m.pos, doors[i]) < 1e-9, `${m.key} stays inside the door while hidden`));
  blink.log.length = 0;
  roster.showAll({ walk: true });
  ms.forEach((m, i) => { assert.equal(m.hidden, false); assert.ok(gap(m.pos, doors[i]) < 1e-9, 'reappears at its door'); assert.ok(Math.abs(m.walker.pose.y - m.pos.y) < 1e-9); });
  const walked = new Set();
  for (let i = 0; i < 30 * 4; i++) { roster.update(1 / 30, 10 + i / 30); for (const m of ms) if (m.walking) walked.add(m); }
  assert.equal(walked.size, ms.length, 'everyone walks home');
  assert.ok(gap(roster.members('q')[0].pos, QSPOTS[0]) < 0.3, 'the stand member is back on its spot');
  assert.deepEqual(blink.log, [], 'no blink');
  // 不帶 walk（跳過、snap）：照舊只露出來，不另外出發
  const [a] = roster.members('k'); roster.hide(a); roster.showAll(); assert.equal(a.hidden, false); assert.equal(a.arriving, false);
});
// §13.2／R9：退場不閃；藏起來的人（躲進門裡）直接拿掉，其他人走回入口才拿掉
test('leavers are removed without a blink; a hidden leaver goes at once, the others walk out first', () => {
  const { roster, blink, people } = setup();
  roster.declare('k', kids(2)); roster.snap();
  const [a, b] = roster.members('k'); roster.hide(a);
  roster.declare('k', kids(1)); roster.flush();
  assert.ok(!roster.members('k').includes(b), 'the last member leaves first'); assert.ok(people.walkers.includes(b.walker) && !b.gone, 'walking out');
  roster.retire('k'); roster.flush();
  assert.ok(a.gone, 'hidden: removed at once'); assert.equal(roster.members('k').length, 0); assert.equal(people.walkers.length, 1);
  run(roster, 30 * 10); assert.ok(b.gone); assert.equal(people.walkers.length, 0); assert.deepEqual(blink.log, []);
});
test('stand members with fidget play a short gesture every 3 s and are still between', () => {
  const { roster } = setup(), spot = { ...AT, yaw: 0 };
  roster.declare('k', { kind: 'roster', at: AT, n: 2, home: { kind: 'stand', spots: [spot, { ...spot, x: spot.x + 0.4 }], fidget: 'wave' } }); roster.snap();
  const [a, b] = roster.members('k'), log = [];
  for (let i = 0; i < 180; i++) { const t = i / 30; roster.update(1 / 30, t); log.push([a.walker.gesture?.kind ?? null, b.walker.gesture?.kind ?? null, a.walker.gesture?.k]); }
  const on = j => log.filter(f => f[j] === 'wave').length / 30;
  assert.ok(Math.abs(on(0) - 1.2) < 0.1 && Math.abs(on(1) - 1.2) < 0.1, `0.6 s every 3 s (${on(0)}, ${on(1)})`);
  assert.ok(log.some(f => f[0] && !f[1]) || log.some(f => !f[0] && f[1]), 'phase-shifted per member');
  assert.ok(log.filter(f => f[0]).every(f => f[2] >= 0 && f[2] <= 1));
  // 劇本拿走就停手，日常不再擺
  roster.claim(a); assert.equal(a.walker.gesture, null);
  roster.declare('w', kids(1)); for (let i = 0; i < 90; i++) roster.update(1 / 30, i / 30);
  assert.equal(roster.members('w')[0].walker.gesture, null, 'no fidget without the flag');
});
// §14.3 溫泉客偶爾看一下：fidget 'look' 帶一個瞥過去的朝向（站位朝向 ± 0.6，每次換邊），0.2 秒轉過去、結束前 0.2 秒轉回來
test('a look fidget glances ± 0.6 off the spot yaw, alternating sides, and turns back to the spot yaw afterwards', () => {
  const { roster } = setup(), spot = { ...AT, yaw: 0.5 };
  roster.declare('k', { kind: 'roster', at: AT, n: 1, home: { kind: 'stand', spots: [spot], fidget: 'look' } }); roster.snap();
  const [a] = roster.members('k'), yaws = [];
  for (let i = 0; i < 360; i++) { roster.update(1 / 30, i / 30); const g = a.walker.gesture; yaws.push(g ? (assert.equal(g.kind, 'look'), g.yaw) : null); }
  const off = yaws.filter(y => y !== null).map(y => y - spot.yaw);
  assert.ok(off.some(d => Math.abs(Math.abs(d) - 0.6) < 1e-9), 'reaches a full 0.6 glance');
  assert.ok(off.some(d => d > 0.5) && off.some(d => d < -0.5), 'glances to both sides');
  assert.ok(off.every(d => Math.abs(d) <= 0.6 + 1e-9));
  // 每次小動作的第一幀、最後一幀都貼近站位朝向（0.2 秒轉過去、轉回來），之後沒有 gesture、站回原本朝向
  for (let i = 1; i < yaws.length; i++) {
    if (yaws[i] !== null && yaws[i - 1] === null) assert.ok(Math.abs(yaws[i] - spot.yaw) <= 0.6 / 6 + 1e-9, `starts near the spot yaw (${yaws[i]})`);
    if (yaws[i] === null && yaws[i - 1] !== null) assert.ok(Math.abs(yaws[i - 1] - spot.yaw) <= 0.6 / 6 + 1e-9, `ends near the spot yaw (${yaws[i - 1]})`);
  }
  assert.ok(Math.abs(a.yaw - spot.yaw) < 1e-9, 'stands at the spot yaw');
});
test('a stand home with rescue stands at the nearest walkable point when its spot is inside a footprint', () => {
  const { roster, nav } = setup(), spot = { ...AT, yaw: 0 };
  nav.setFootprints([{ x: AT.x, z: AT.z, r: 0.6 }]);
  roster.declare('k', { kind: 'roster', at: AT, n: 1, home: { kind: 'stand', spots: [spot], rescue: true } });
  const m = roster.members('k')[0], want = nav.nearestWalkable(spot);
  for (let i = 0; i < 300; i++) roster.update(1 / 30, i / 30);
  assert.ok(Math.hypot(m.pos.x - want.x, m.pos.z - want.z) < 0.1 && nav.walkable(m.pos.x, m.pos.z), 'rescued out of the footprint');
  roster.snap(); assert.ok(nav.walkable(m.pos.x, m.pos.z), 'snap rescues too');
});
// §13.4 背景減量：演出中只有焦點格裡的人做日常（wander 挑新目標、stand 小動作），其他人站著；劇本手上的人照樣動；null = 全部
test('setFocus limits idle wandering and fidgets to members whose home cell is in focus; scripted members still move; null frees everyone', () => {
  const { roster } = setup();
  const centre = cell => { const c = axialToWorld(...cell); return { x: c.x, y: cellTop(cell), z: c.z }; };
  roster.declare('w', { kind: 'roster', at: centre([0, 0]), n: 2, home: { kind: 'wander', at: [centre([0, 0]), centre([-1, 0])], r: 1.0 } });
  const spot = { ...centre([0, 1]), yaw: 0 };
  roster.declare('s', { kind: 'roster', at: spot, n: 1, home: { kind: 'stand', spots: [spot], fidget: 'wave' } });
  roster.declare('x', { kind: 'roster', at: centre([1, 0]), n: 1, home: { kind: 'wander', at: centre([1, 0]), r: 1.0 } }); roster.snap();   // 走進來不受焦點限制（另有測試）
  const [a, b] = roster.members('w'), [st] = roster.members('s'), [x] = roster.members('x');
  roster.claim(x);   // 劇本手上：不在焦點格也要動
  roster.setFocus([[0, 0]]);
  const at = m => ({ ...m.pos }), moved = (m, p) => Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 1e-6;
  const pa = at(a), pb = at(b), px = at(x); let fidgeted = false;
  for (let i = 0; i < 180; i++) {
    roster.update(1 / 30, i / 30); fidgeted ||= !!st.walker.gesture;
    if (i < 30) roster.setPose(x, { x: x.pos.x + 0.01, z: x.pos.z, walking: true });
  }
  assert.ok(moved(a, pa), 'the focused cell wanders'); assert.ok(!moved(b, pb), 'outside the focus stands still'); assert.equal(b.walking, false);
  assert.equal(fidgeted, false, 'no fidget outside the focus'); assert.ok(Math.abs(x.pos.x - px.x - 0.3) < 1e-6, 'a scripted member is moved as told');
  roster.setFocus([[0, 1]]); fidgeted = false;
  for (let i = 0; i < 120; i++) { roster.update(1 / 30, 6 + i / 30); fidgeted ||= !!st.walker.gesture; }
  assert.ok(fidgeted, 'the stand member fidgets once its cell is in focus');
  roster.setFocus(null);
  for (let i = 0; i < 180; i++) roster.update(1 / 30, 10 + i / 30);
  assert.ok(moved(b, pb), 'null frees everyone');
});
// 計畫 6（拜訪、撲空）：從別格叫來的人 home(m, { hurry: true }) 回家是有目的的走路——焦點不在他家那一格也照走、用走路速度（不是散步速度）；
// 不帶 hurry 的照舊：焦點外站著不動
test('home(m, { hurry }) walks a member back at walking speed even outside the focus; plain home() still waits for the focus', () => {
  const { roster } = setup();
  const centre = cell => { const c = axialToWorld(...cell); return { x: c.x, y: cellTop(cell), z: c.z }; };
  roster.declare('w', { kind: 'roster', at: centre([-1, 0]), n: 2, home: { kind: 'wander', at: centre([-1, 0]), r: 0.6 } }); roster.snap();
  const [a, b] = roster.members('w'), away = centre([0, 0]);
  for (const m of [a, b]) { roster.claim(m); roster.setPose(m, { ...away, x: away.x + (m === a ? 0 : 0.5), walking: false }); }
  roster.setFocus([[1, 0]]);
  roster.home(a, { hurry: true }); roster.home(b);
  const pb = { ...b.pos }, homeAt = centre([-1, 0]);
  let fastest = 0, prev = { ...a.pos };
  for (let i = 0; i < 120; i++) { roster.update(1 / 30, i / 30); fastest = Math.max(fastest, Math.hypot(a.pos.x - prev.x, a.pos.z - prev.z) * 30); prev = { ...a.pos }; }
  assert.ok(Math.hypot(a.pos.x - homeAt.x, a.pos.z - homeAt.z) < 1.2, `hurried member is home (${Math.hypot(a.pos.x - homeAt.x, a.pos.z - homeAt.z).toFixed(2)} from home)`);
  assert.ok(fastest > 1.0, `at walking speed (${fastest.toFixed(2)} m/s)`);
  assert.ok(Math.hypot(b.pos.x - pb.x, b.pos.z - pb.z) < 1e-6, 'plain home() outside the focus stands still');
});
// 審查（任務 4）：path 成員趕回家走到折線上離他最近的那一點接上去——不是剛走進來那種錯開點（i / n，可能在路的另一頭）
test('home(m, { hurry }) on a path member rejoins the route at its nearest point, not the staggered entry point (n = 1 homes)', async () => {
  const { ENGINEER_ROUTE } = await import('../src/actors/chip.js');
  const { roster } = setup();
  roster.declare('eng', { kind: 'roster', at: ENGINEER_ROUTE[0], n: 1, home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.45 } }); roster.snap();
  const [m] = roster.members('eng'), a = ENGINEER_ROUTE.at(-2), b = ENGINEER_ROUTE.at(-1), k = 0.3 / Math.hypot(b.x - a.x, b.z - a.z);
  const near = { x: b.x + (a.x - b.x) * k, y: b.y, z: b.z + (a.z - b.z) * k };   // 路的終點往回 0.3：最近的點就在腳下，錯開點（起點）在路的另一頭
  roster.claim(m); roster.setPose(m, { ...near, walking: false }); roster.setFocus([[5, 5]]);
  roster.home(m, { hurry: true });
  let joined = null;
  for (let i = 0; i < 300 && !joined; i++) { roster.update(1 / 30, i / 30); if (m.cursor) joined = { ...m.pos }; }
  assert.ok(joined, 'back on the route');
  assert.ok(gap(joined, near) < 0.3, `rejoined ${gap(joined, near).toFixed(2)} from where it stood`);
});
// 計畫 9（2026-10-30 錄影「卡成一坨」）：同一條折線上 ≥ 2 人的名冊，劇本放回來（含 hurry）走回自己錯開的那一點（total × i / n）——
// 三個工程師在通勤路線上擠在一起被叫去看東西、放回來，10 秒後沿線的「相位」兩兩 ≥ 0.25 × total（開放路徑走到底折返：
// 相位 = 往前走時的 s、折返時的 2·total − s，在 2·total 的圈上量；沿線位置本身在折返時會短暫交會，live 測試量多久貼著）
test('path homes with n ≥ 2: members released from a script walk back to their own staggered points, not the nearest one', async () => {
  const { ENGINEER_ROUTE } = await import('../src/actors/chip.js'), { measurePath } = await import('../src/scene/path.js');
  const { roster, nav } = setup(), n = 3, dt = 1 / 30;
  roster.declare('eng', { kind: 'roster', at: ENGINEER_ROUTE[0], n, home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.45 } }); roster.snap();
  const P = nav.ground(ENGINEER_ROUTE, { loop: false }), lens = measurePath(P, false), T = lens.at(-1);
  const sOf = p => { let best = [Infinity, 0]; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2)), d = Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); if (d < best[0]) best = [d, lens[i] + t * (lens[i + 1] - lens[i])]; } return best[1]; };
  const ms = roster.members('eng'), a = P[0], b = P[1];
  ms.forEach((m, i) => { roster.claim(m); roster.setPose(m, { x: a.x + (b.x - a.x) * (0.1 + 0.03 * i), y: a.y, z: a.z + (b.z - a.z) * (0.1 + 0.03 * i), walking: false }); });
  ms.forEach(m => roster.home(m));
  let prev = ms.map(m => sOf(m.pos)), phase = [];
  for (let f = 0; f < 10 / dt; f++) {
    roster.update(dt, f * dt);
    const s = ms.map(m => sOf(m.pos)); phase = s.map((x, i) => (x >= prev[i] ? x : 2 * T - x)); prev = s;
  }
  assert.ok(ms.every(m => m.cursor), 'all back on the route');
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.abs(phase[i] - phase[j]), circ = Math.min(d, 2 * T - d);
    assert.ok(circ >= 0.25 * T, `members ${i}–${j}: ${circ.toFixed(2)} apart along the route (total ${T.toFixed(2)})`);
  }
});
// 計畫 9 任務 3 審稿：閉合折線上的人照舊等速——電工（ROAD，n 1，前面一直有人在走）、守塔人（衛星島繞圈 n 1）、
// 遊樂場小孩（衛星島繞圈 n 2，擠在一起接上圈）10 秒裡每一幀都照自己的速度往前（轉角弦長打八折），不停、不放慢、不互相等
test('loops keep a constant speed: the electrician, the lighthouse keeper and the playground kids never stop or slow down', async () => {
  const { ROAD } = await import('../src/actors/bulb.js'), sat = await import('../src/actors/satellites.js'), { lv } = await import('./helpers/actors.js');
  const { roster } = setup(), dt = 1 / 30, sv = sat.view(lv({ bulb: 9, token: 8, milk: 3 }), {});
  assert.ok(sv['sat.keeper'] && sv['sat.playground'].n === 2);
  roster.declare('elec', { kind: 'roster', at: ROAD[0], n: 1, accessory: 'vest', home: { kind: 'path', path: ROAD, loop: true, speed: 0.5 } });
  roster.declare('crowd', { kind: 'roster', at: ROAD[1], n: 3, home: { kind: 'wander', at: ROAD[1], r: 0.4 } });   // 電工前面一直有人在走
  roster.declare('keeper', sv['sat.keeper']); roster.declare('kids', sv['sat.playground']); roster.snap();
  const [k0, k1] = roster.members('kids'); roster.claim(k1); roster.setPose(k1, { ...k0.pos, x: k0.pos.x + 0.02, walking: false }); roster.home(k1);   // 兩個小孩擠在一起
  const who = [['elec', 0.5], ['keeper', WANDER_SPEED], ['kids', WANDER_SPEED]].flatMap(([k, v]) => roster.members(k).map(m => [k, m, v]));
  const slow = [];
  for (let f = 0; f < 10 / dt; f++) {
    const before = who.map(([, m]) => ({ x: m.pos.x, z: m.pos.z, on: !!m.cursor }));
    roster.update(dt, f * dt);
    who.forEach(([k, m, v], i) => { const b = before[i], d = gap(b, m.pos); if (b.on && m.cursor && d < 0.8 * v * dt) slow.push(`${k}#${m.i} frame ${f} moved ${(d / dt).toFixed(2)} m/s`); });
  }
  assert.ok(who.every(([, m]) => m.cursor), 'everyone on a loop');
  assert.deepEqual(slow.slice(0, 10), [], `${slow.length} slow frames`);
});
// 審查：path 成員看的是整條路經過的格子（不是人現在站哪一格），焦點在路的一端也照樣沿線走，不會停在格子邊上擠成一團
// final review：path 成員不再被一幀推到位（那就是瞬移），沿線來回交會時會短暫靠近；要的是不停在一起——沒有一對在 0.25 內超過 1 秒
test('a path member whose route touches the focus cell keeps walking and never stays within 0.25 of another member; a route off the focus halts', async () => {
  const { ENGINEER_ROUTE } = await import('../src/actors/chip.js');
  for (const cell of [[1, 0], [0, 0]]) {
    const { roster } = setup();
    roster.declare('eng', { kind: 'roster', at: ENGINEER_ROUTE[0], n: 3, home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.45 } }); roster.snap();
    for (let i = 0; i < 60; i++) roster.update(1 / 30, i / 30);
    roster.setFocus([cell]);
    const ms = roster.members('eng'), start = ms.map(m => ({ ...m.pos }));
    const close = new Map(); let longest = 0;
    for (let i = 0; i < 30 * 25; i++) {
      roster.update(1 / 30, 2 + i / 30);
      for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) {
        const k = a * 8 + b, n = gap(ms[a].pos, ms[b].pos) < 0.25 - 1e-6 ? (close.get(k) ?? 0) + 1 : 0;
        close.set(k, n); longest = Math.max(longest, n);
      }
    }
    assert.ok(ms.some((m, i) => Math.hypot(m.pos.x - start[i].x, m.pos.z - start[i].z) > 0.5), `focus ${cell}: still walking`);
    assert.ok(longest <= 30, `focus ${cell}: a pair stayed within 0.25 for ${(longest / 30).toFixed(2)} s`);
  }
  // 整條路都不在焦點格：原地停下
  const { roster } = setup();
  roster.declare('eng', { kind: 'roster', at: ENGINEER_ROUTE[0], n: 1, home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.45 } }); roster.snap();
  for (let i = 0; i < 60; i++) roster.update(1 / 30, i / 30);
  roster.setFocus([[-1, 1]]); roster.update(1 / 30, 2);
  const [m] = roster.members('eng'), p = { ...m.pos };
  for (let i = 0; i < 90; i++) roster.update(1 / 30, 2 + i / 30);
  assert.deepEqual([m.pos.x, m.pos.z, m.walking], [p.x, p.z, false]);
});

// ── §13.2／§13.3：出場從入口點走進來、換站位走過去、退場走回入口、站著也分離 ──
test('new members appear at the entry point and walk to their spot; nobody appears within 1.5 of a spot', () => {
  const { roster, blink, nav } = setup();
  roster.declare('q', queue(1)); const [a] = roster.members('q');
  assert.ok(gap(a.pos, QENTRY[0]) < 1e-9 && gap(a.walker.pose, QENTRY[0]) < 1e-9, 'first member at entry 0');
  roster.declare('q', queue(2)); const b = roster.members('q')[1];
  assert.ok(gap(b.pos, QENTRY[1]) < 1e-9, 'apply() n up: the new member comes from entry 1');
  for (const m of [a, b]) for (const s of QSPOTS) assert.ok(gap(m.pos, s) >= 1.5, 'never appears within 1.5 of a spot');
  assert.deepEqual(blink.log, [], 'walks in, no blink');
  roster.setFocus([[-1, 0]]);   // 焦點在別格：走回站位照樣走
  run(roster, 10); assert.ok(a.walking && b.walking, 'walking in');
  run(roster, 170, 1); assert.ok(gap(a.pos, QSPOTS[0]) < 0.05 && gap(b.pos, QSPOTS[1]) < 0.05 && !a.walking && !b.walking, 'arrived');
  // wander：第一趟也從入口走進來，焦點在別格也照走
  roster.declare('w', { kind: 'roster', at: Q, n: 1, home: { kind: 'wander', at: Q, r: 0.5, entry: QENTRY[1] } });
  const [w] = roster.members('w'); assert.ok(gap(w.pos, QENTRY[1]) < 1e-9);
  run(roster, 180, 7); assert.ok(gap(w.pos, Q) <= 0.5 + 0.05, `wandered in (${gap(w.pos, Q).toFixed(2)})`);
  // 入口被建築擋住：站到最近的可走點
  nav.setFootprints([{ x: QENTRY[0].x, z: QENTRY[0].z, r: 0.4 }]);
  roster.declare('r', queue(1, QENTRY[0])); const [r] = roster.members('r');
  assert.ok(nav.walkable(r.pos.x, r.pos.z) && gap(r.pos, QENTRY[0]) < 0.4 + 0.3, 'blocked entry → nearest walkable point');
});
test('a changed stand layout makes existing members walk, never respawn (same member objects, no blink)', () => {
  const { roster, people, blink } = setup(), A = QSPOTS.slice(0, 2), B = A.map(s => ({ ...s, z: s.z + 0.8 }));
  const stand = spots => ({ kind: 'roster', at: Q, n: 2, home: { kind: 'stand', spots } });
  roster.declare('k', stand(A)); roster.snap(); const ms = roster.members('k'), count = people.walkers.length;
  roster.setFocus([[-1, 0]]);
  roster.declare('k', stand(B)); roster.flush();
  assert.deepEqual(roster.members('k'), ms, 'same member objects'); assert.equal(people.walkers.length, count, 'nobody new'); assert.deepEqual(blink.log, []);
  run(roster, 2); ms.forEach((m, i) => { assert.ok(gap(m.pos, A[i]) <= 1.6 / 30 + 1e-6, 'not teleported (one frame at walking speed)'); assert.ok(m.walking); });
  run(roster, 90, 1); ms.forEach((m, i) => assert.ok(gap(m.pos, B[i]) < 0.05, 'walked to the new spot'));
  // wander 的家搬了：焦點在別格也走過去（同一個人、不閃）
  const W = { x: Q.x + 1.2, y: Q.y, z: Q.z - 0.6 };
  roster.declare('w', { kind: 'roster', at: Q, n: 1, home: { kind: 'wander', at: Q, r: 0.3 } }); roster.snap(); roster.setFocus([[-1, 0]]);
  const [w] = roster.members('w');
  roster.declare('w', { kind: 'roster', at: W, n: 1, home: { kind: 'wander', at: W, r: 0.3 } });
  run(roster, 180, 5); assert.equal(roster.members('w')[0], w); assert.ok(gap(w.pos, W) <= 0.3 + 0.05, `walked to the new home (${gap(w.pos, W).toFixed(2)})`);
  assert.deepEqual(blink.log, []);
});
test('standing members closer than 0.25 are pushed apart along x and stay near their spots', () => {
  const { roster } = setup();
  const spots = [{ x: Q.x, y: Q.y, z: Q.z, yaw: 0 }, { x: Q.x + 0.05, y: Q.y, z: Q.z + 0.02, yaw: 0 }, { x: Q.x + 1, y: Q.y, z: Q.z, yaw: 0 }], copy = JSON.stringify(spots);
  roster.declare('k', { kind: 'roster', at: Q, n: 3, home: { kind: 'stand', spots } }); roster.snap();
  run(roster, 30); const ms = roster.members('k');
  assert.ok(gap(ms[0].pos, ms[1].pos) >= 0.25 - 1e-9, `apart (${gap(ms[0].pos, ms[1].pos).toFixed(3)})`);
  ms.forEach((m, i) => { assert.equal(m.pos.z, spots[i].z, 'only along x'); assert.ok(Math.abs(m.pos.x - spots[i].x) <= 0.25); assert.equal(m.walking, false); assert.equal(m.walker.pose.x, m.pos.x); });
  assert.deepEqual([ms[2].pos.x, ms[2].pos.z], [spots[2].x, spots[2].z], 'nobody near: stays on the spot');
  const p = ms.map(m => ({ ...m.pos }));
  for (let i = 0; i < 90; i++) { roster.update(1 / 30, 1 + i / 30); assert.ok(ms.every(m => !m.walking), 'does not walk back and forth'); }
  ms.forEach((m, i) => assert.deepEqual(m.pos, p[i])); assert.equal(JSON.stringify(spots), copy, 'spots unchanged');
});
test('without an entry the member starts at the cell edge farthest from its spot (nav.edgePoint)', async () => {
  const { SATELLITES } = await import('../src/scene/hex.js');
  const { roster, nav } = setup(), spot = { x: Q.x + 0.5, y: Q.y, z: Q.z - 0.2, yaw: 0 };
  roster.declare('k', { kind: 'roster', at: Q, n: 1, home: { kind: 'stand', spots: [spot] } });
  const [m] = roster.members('k'), e = nav.edgePoint([0, 1], spot);
  assert.deepEqual([m.pos.x, m.pos.z], [e.x, e.z]); assert.ok(gap(m.pos, spot) >= 1.5);
  roster.declare('w', kids(1)); const [w] = roster.members('w'), e2 = nav.edgePoint([-1, 0], AT);
  assert.deepEqual([w.pos.x, w.pos.z], [e2.x, e2.z], 'wander: away from the wander centre');
  // 衛星島（沒有走路格）：照舊在家出現
  const s = SATELLITES.find(x => x.kind === 'forest'), c = axialToWorld(s.q, s.r), far = { x: c.x + 0.3, y: 0.45, z: c.z + 0.2, yaw: 0 };
  roster.declare('sat', { kind: 'roster', at: far, n: 1, home: { kind: 'stand', spots: [far] } });
  assert.deepEqual([roster.members('sat')[0].pos.x, roster.members('sat')[0].pos.z], [far.x, far.z]);
});
// 計畫 3.8 R9：退場的人走回入口、到了才拿掉；跳過立刻拿掉；藏起來的人、被 from 搬走的人不走
test('leavers walk to their entry point and are removed on arrival; snap removes them at once; hidden leavers go at once', () => {
  const { roster, people, blink } = setup();
  roster.declare('k', queue(3, QENTRY[0])); roster.snap(); const [a, b, c] = roster.members('k');
  roster.setFocus([[-1, 0]]);
  roster.declare('k', queue(2, QENTRY[0])); roster.flush();
  assert.deepEqual(roster.members('k'), [a, b]); assert.equal(roster.count, 2); assert.equal(people.walkers.length, 3, 'the leaver is still walking out');
  run(roster, 1); assert.ok(c.walking && gap(c.pos, QSPOTS[2]) <= 1.6 / 30 + 1e-6, 'walks, not teleported');
  run(roster, 240, 1); assert.ok(c.gone && gap(c.pos, QENTRY[0]) < 0.05, 'removed at the entry'); assert.equal(people.walkers.length, 2);
  roster.retire('k'); roster.flush(); assert.ok(!roster.keys().includes('k')); assert.equal(people.walkers.length, 2, 'retired: walking out');
  run(roster, 5, 9); assert.ok(a.walking && !a.gone);
  roster.snap(); assert.ok(a.gone && b.gone); assert.equal(people.walkers.length, 0, 'snap removes walkers-out at once');
  roster.declare('h', queue(1)); roster.snap(); const [h] = roster.members('h'); roster.hide(h); roster.retire('h'); roster.flush();
  assert.ok(h.gone); assert.equal(people.walkers.length, 0); assert.deepEqual(blink.log, []);
});
// 審查修正（Task 4 第 1 輪）
// 1. 走出去的人不再歸劇本：快取著他的劇本 claim／home／setPose 都不算數，他照樣走回入口、到了才拿掉
test('claim, home and setPose on a walking-out leaver are no-ops: it keeps walking out and is removed at the entry', () => {
  for (const act of ['claim', 'home', 'setPose']) {
    const { roster, people } = setup(); roster.declare('k', queue(3, QENTRY[0])); roster.snap(); const [, , m] = roster.members('k');
    roster.declare('k', queue(2, QENTRY[0])); roster.flush(); run(roster, 3);
    const before = { ...m.pos };
    if (act === 'setPose') roster.setPose(m, { x: Q.x, y: Q.y, z: Q.z, walking: true }); else roster[act](m);
    assert.deepEqual(m.pos, before, `${act}: not moved by the script`);
    assert.doesNotThrow(() => run(roster, 2, 1), act);
    assert.ok(m.walking && m.mode === 'exit', `${act}: still walking out`);
    run(roster, 30 * 4, 2); assert.ok(m.gone && gap(m.pos, QENTRY[0]) < 0.05, `${act}: removed at the entry`); assert.equal(people.walkers.length, 2);
  }
});
// 2. 一個站位擠很多人：錯開是滑過去的（每幀不超過走路速度），不會推開又走回來
test('eight members on one spot spread out smoothly: no standing member moves more than walking speed × dt in a frame', () => {
  const { roster } = setup(), spot = QSPOTS[1];
  roster.declare('k', { kind: 'roster', at: Q, n: 8, home: { kind: 'stand', spots: [spot] } }); roster.snap();
  const ms = roster.members('k'); let maxMove = 0, walked = 0;
  for (let i = 0; i < 180; i++) {
    const p = ms.map(m => ({ ...m.pos })); roster.update(1 / 30, i / 30);
    ms.forEach((m, j) => { maxMove = Math.max(maxMove, gap(m.pos, p[j])); if (m.walking) walked++; });
  }
  assert.ok(maxMove <= 1.6 / 30 + 1e-6, `max per-frame move ${maxMove.toFixed(4)}`); assert.equal(walked, 0, 'nobody walks back to the spot');
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) assert.ok(gap(ms[a].pos, ms[b].pos) >= 0.25 - 1e-9, `${a}-${b} apart`);
  assert.ok(ms.every(m => m.pos.z === spot.z));
});
// 3. 進場、退場是有目的的走路：小人 1.6（日常散步才是 0.5）
test('walk-ins and walk-outs use the walking speed (1.6), not the wander speed', () => {
  const { roster } = setup(); roster.declare('k', queue(1, QENTRY[0])); const [m] = roster.members('k'), d = gap(QENTRY[0], QSPOTS[0]);
  run(roster, Math.ceil(30 * (d / 1.6 + 0.3))); assert.ok(gap(m.pos, QSPOTS[0]) < 0.05, `walked in at 1.6 (${gap(m.pos, QSPOTS[0]).toFixed(2)} left)`);
  roster.retire('k'); roster.flush(); run(roster, Math.ceil(30 * (d / 1.6 + 0.3)), 5); assert.ok(m.gone, 'walked out at 1.6');
});
// 4. 退場途中又要回人數：把還在走出去的人叫回來，不從入口生新的
test('a layout that re-adds a member while a leaver of the same key is walking out turns that leaver around', () => {
  const { roster, people } = setup(); roster.declare('k', queue(3, QENTRY[0])); roster.snap(); const [, , m] = roster.members('k');
  roster.declare('k', queue(2, QENTRY[0])); roster.flush(); run(roster, 10);
  roster.declare('k', queue(3, QENTRY[0])); roster.flush();
  assert.equal(roster.members('k')[2], m, 'the same leaver comes back'); assert.equal(people.walkers.length, 3, 'nobody new'); assert.ok(!m.gone && m.mode === 'home');
  roster.setFocus([[-1, 0]]); run(roster, 30 * 3, 1);
  assert.ok(gap(m.pos, QSPOTS[2]) < 0.05 && !m.gone, 'walked back to its spot'); assert.equal(people.walkers.length, 3);
  // 退掉整個名冊再宣告回來也一樣
  roster.retire('k'); roster.flush(); run(roster, 5, 4); roster.declare('k', queue(3, QENTRY[0])); roster.flush();
  assert.equal(people.walkers.length, 3); assert.ok(roster.members('k').every(x => !x.gone));
});

// ── final review（計畫 3.8）──
// 每幀最大位移（只看兩幀都露出來的人）；ok：沒有人超過自己的走路速度 × dt
function maxStep(roster, ms, frames, t0 = 0) {
  let max = 0, who = null, ok = true;
  for (let i = 0; i < frames; i++) {
    const p = ms.map(m => ({ ...m.pos, hidden: m.hidden })); roster.update(1 / 30, t0 + i / 30);
    ms.forEach((m, j) => {
      if (p[j].hidden || m.hidden) return;
      const d = gap(m.pos, p[j]), over = d > m.speed / 30 + 1e-6;
      if ((over && ok) || (over === !ok && d > max)) { max = d; who = m; } ok &&= !over;
    });
  }
  return { max, who, ok };
}
// 1. 焦點在別格時，休息中的 wander 成員跟別人擠在 0.25 內：走開一小段（用走的），不會一直疊著
test('out-of-focus wanderers resting within 0.25 of someone walk apart smoothly, then stand still', () => {
  const { roster } = setup();
  const spot = { x: Q.x + 0.5, y: Q.y, z: Q.z, yaw: 0 };
  roster.declare('w', { kind: 'roster', at: Q, n: 3, home: { kind: 'wander', at: Q, r: 0.6 } });
  roster.declare('s', { kind: 'roster', at: spot, n: 1, home: { kind: 'stand', spots: [spot] } }); roster.snap();
  const [a, b, c] = roster.members('w'), [s] = roster.members('s');
  roster.setPose(a, { x: Q.x, z: Q.z }); roster.setPose(b, { x: Q.x + 0.08, z: Q.z + 0.03 }); roster.setPose(c, { x: spot.x - 0.06, z: spot.z + 0.02 });
  roster.setFocus([[-1, 0]]);
  const step = maxStep(roster, [a, b, c, s], 30 * 6);
  assert.ok(step.ok, `max per-frame move ${step.max.toFixed(3)} (${step.who?.key})`);
  const all = [a, b, c, s];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(gap(all[i].pos, all[j].pos) >= 0.25 - 1e-9, `${all[i].key}#${all[i].i}-${all[j].key}#${all[j].i} ${gap(all[i].pos, all[j].pos).toFixed(3)}`);
  assert.ok(Math.abs(s.pos.x - spot.x) < 1e-9 && s.pos.z === spot.z, 'the stand member keeps its spot');
  const p = all.map(m => ({ ...m.pos })); run(roster, 60, 7);
  all.forEach((m, i) => { assert.equal(m.walking, false); assert.deepEqual(m.pos, p[i], 'then stands still (out of focus)'); });
});
// 焦點在別格時停下來的 path 成員跟站著的人擠在 0.25 內：沿路再走一點才停
test('an out-of-focus path member halted within 0.25 of a standing member walks on along its route until clear', async () => {
  const { ENGINEER_ROUTE } = await import('../src/actors/chip.js');
  const { roster } = setup(), R0 = ENGINEER_ROUTE[0], spot = { x: R0.x + 0.08, y: R0.y, z: R0.z, yaw: 0 };
  roster.declare('eng', { kind: 'roster', at: R0, n: 1, home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.45 } });
  roster.declare('s', { kind: 'roster', at: spot, n: 1, home: { kind: 'stand', spots: [spot] } }); roster.snap();
  roster.setFocus([[-1, 1]]);
  const [e] = roster.members('eng'), [s] = roster.members('s');
  const step = maxStep(roster, [e, s], 30 * 4);
  assert.ok(step.ok, `max per-frame move ${step.max.toFixed(3)}`);
  assert.ok(gap(e.pos, s.pos) >= 0.25 - 1e-9, `apart (${gap(e.pos, s.pos).toFixed(3)})`); assert.equal(e.walking, false, 'then halts');
});
// 3. path 成員被一串人推的時候不閃：每幀不超過自己的走路速度 × dt（小人 1.6、老鼠 2.0）
test('engineers and the rat pack on ENGINEER_ROUTE never move more than walking speed × dt in a frame', async () => {
  const { ENGINEER_ROUTE } = await import('../src/actors/chip.js');
  for (const focus of [null, [[1, 0]]]) {
    const { roster } = setup();
    roster.declare('eng', { kind: 'roster', at: ENGINEER_ROUTE[0], n: 3, home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.45 } });
    roster.declare('rats', { kind: 'roster', at: ENGINEER_ROUTE[0], n: 5, model: { path: 'rat.glb', h: 0.2 }, home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.6 } });
    roster.snap(); roster.setFocus(focus);
    const ms = [...roster.members('eng'), ...roster.members('rats')], step = maxStep(roster, ms, 30 * 30);
    assert.ok(step.ok, `focus ${JSON.stringify(focus)}: ${step.who?.key}#${step.who?.i} moved ${step.max.toFixed(3)} in one frame`);
    assert.ok(ms.every(m => m.cursor), 'still on the route');
  }
});

// ── §14.1／§14.5：兩條正解 live 演完（seed 21），每一幀名冊成員都不在 footprint（含 PAD）裡；走進來的人都走得到 ──
// 「在 footprint 裡」= 主島走路格上、落在 show.nav 當下外擴 PAD 的 footprint 裡（nav.inFootprint）。藏起來（躲進門裡）的人不算。
// 不歸走路格管的不查：劇本手上的人（劇本自己擺位置）、沿手畫折線走的 path 成員、站位本來就畫在 footprint 裡的 stand（沒有 rescue：泡溫泉的老鼠、
// 攤車後的老闆）。已經在裡面才開始查的人（建築長在身上——footprint 換了的那一幀人就在裡面；劇本把人放在門裡再交回日常）
// 要在 CAUGHT_MAX 秒內走出來；本來在外面、自己走進去的就是穿牆。
// 走進來的人回合演完後再給 ARRIVE_MAX 秒在背景走完；還在 arriving 的就是卡住了（PAD 讓 101 與吊車／公園之間、夜市攤位之間、校舍牆邊的走道變窄）。
// 審查修正：每個名冊（最終審查：不再只看幾個名單上的鍵）不論日常、沿折線還是劇本手上，任何一幀都不在建築本身（不含 PAD）裡——
// 只有站位畫在 footprint 裡（泡溫泉）、坐在車頂（ride，不在走路格上）和建築長在身上（CAUGHT_MAX 秒內走出來）例外
// 最終審查修正：同一趟 live 也查（1）橋上的人貼著橋面：|y − groundY| ≤ BRIDGE_TOL，橋頭一閃 ≤ BRIDGE_END、不超過 BRIDGE_BLIP 秒；
// （2）外星結局（closing 起）偵防師離每個露出來的人 ≥ SEPARATION。兩條正解只演一次，幾個測試共用（livePlay）
const DT_LIVE = 1 / 30, BRIDGE_TOL = 0.01, BRIDGE_END = 0.05, BRIDGE_BLIP = 0.1, TAIL = 150;   // TAIL：最後一回合演完再看 5 秒
const SEP_TOL = 0.005;   // 兩個走路的人互推剛好推到 SEPARATION（每幀限速的那一截下一幀才補上），差一點點不算擠
const RAT_TOL = 0.03;   // 老鼠對人：半徑是估的（模型照高度），名冊每幀限速推開時會在半徑和內 1–3 公分徘徊，不算貼著
const BODY = 0.16, PASS_MAX = 0.5, BODY_K = 0.64;   // 兩個小人身體（半徑 0.08）不相碰；走路擦身而過貼近不超過 0.5 秒；BODY_K：老鼠擦身而過時身體不相碰（人對人 0.25 × 0.64 = BODY）
let livePlayed = null;
const livePlay = () => (livePlayed ??= playBoth());
async function playBoth() {
  const spec = await import('../src/rules/spec.js'), engine = await import('../src/rules/engine.js'), { enumerate, stats } = await import('../src/solver/run.js');
  const { headlessShow, ALL, inShape } = await import('./helpers/show.js'), { MAIN_CELLS, adjacentPairs, edgeMidpoint, RING_R } = await import('../src/scene/hex.js'), { BRIDGE_HALF, SEPARATION } = await import('../src/show/nav.js');
  const ARRIVE_MAX = 20, CAUGHT_MAX = 1.5, DT = DT_LIVE, bare = createNav(), bad = new Set(), stuck = [], slow = [], walls = new Set(), sunk = new Set(), crowd = new Set(), ratNear = new Set(), mutantNear = new Set(), nestNear = new Set(), passStand = new Set(), armyNear = new Set();
  let detectiveFrames = 0, bridgeFrames = 0, ratFrames = 0, mutantFrames = 0, nestFrames = 0, passFrames = 0;
  const RAT_AT = anchorWorld('rat'), TOWER_AT = anchorWorld('tower'), homeAt = (h, p) => h?.kind === 'wander' && Math.hypot(h.at.x - p.x, h.at.z - p.z) < 1e-9;
  // 橋面（同 island.js 的橋）：中心線兩側 BRIDGE_HALF 內、兩個橋頭之間
  const bridges = adjacentPairs(MAIN_CELLS).map(([A, B]) => { const { a, b } = edgeMidpoint(A, B, RING_R * Math.sqrt(3) / 2), len = Math.hypot(b.x - a.x, b.z - a.z); return { a, len, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len }; });
  const onBridge = p => bridges.some(br => { const dx = p.x - br.a.x, dz = p.z - br.a.z, s = dx * br.ux + dz * br.uz; return s >= 0 && s <= br.len && Math.abs(dx * br.uz - dz * br.ux) <= BRIDGE_HALF; });
  const results = { bad, slow, stuck, walls, sunk, crowd, ratNear, mutantNear, nestNear, passStand, armyNear, get nestFrames() { return nestFrames; }, get passFrames() { return passFrames; }, walkedIn: {}, get detectiveFrames() { return detectiveFrames; }, get bridgeFrames() { return bridgeFrames; }, get ratFrames() { return ratFrames; }, get mutantFrames() { return mutantFrames; } };
  for (const order of stats(enumerate(spec), spec).full.map(r => r.order)) {
    const { show, run } = await headlessShow(), update = show.update, since = new Map(), caught = new Map(), outside = new WeakSet(), wallIn = new Map(), wallOut = new WeakSet(), off = new Map(), decked = new WeakSet(), stepping = new Map();
    let label = '', t = 0, version = show.nav.version, walkedIn = 0, built = '[]', closing = false;
    const passing = new Map(), ratPass = new Map();   // built：舞台的 footprint（新零件 apply 一開始就算進去，比 nav 早）
    const authored = (h, i) => { if (h?.kind !== 'stand' || h.rescue) return false; const p = h.spots[i % h.spots.length]; return show.nav.inFootprint(p.x, p.z); };
    const check = () => {
      const st = show.stage, view = Object.assign({}, ...ALL.map(mod => mod.view(st.lv, st.flags, st.meta))), changed = show.nav.version !== version;
      version = show.nav.version;
      const fps = st.footprints(), json = JSON.stringify(fps), rebuilt = json !== built; built = json;
      const all = show.roster.keys().flatMap(k => show.roster.members(k)), seen = all.filter(m => !m.hidden && !m.gone);
      // 2026-10-28 錄影修正：老鼠（含變異鼠）和小人在日常裡不疊在一起——貼近（< 兩人半徑相加）只能是擦身而過：身體不相碰
      // （≥ 半徑相加的 BODY_K 倍）、不超過 PASS_MAX 秒。劇本手上的、坐車頂的、沿手畫折線走的（path：路線是畫好的，另案）不算
      const daily = m => m.mode === 'home' && !m.hidden && !m.gone && !['ride', 'path'].includes(view[m.key]?.home?.kind);
      for (const r of seen) if (r.key === 'rat.pack' && daily(r)) for (const o of seen) {
        if (o.kind !== 'people' || !daily(o)) continue;
        ratFrames++; if (r.radius > 0.3) mutantFrames++;
        const rh = view[r.key]?.home, nest = homeAt(rh, RAT_AT), army = homeAt(rh, TOWER_AT), pass = r.walking && !o.walking && view[o.key]?.home?.kind === 'stand' && !!o.settled;
        if (nest) nestFrames++; if (pass) passFrames++;
        const d = Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z), need = r.radius + o.radius, pair = `${r.key}#${r.i}|${o.key}#${o.i}`;
        if (d >= need - RAT_TOL) { ratPass.delete(pair); continue; }
        if (!ratPass.has(pair)) ratPass.set(pair, t);
        const what = `${label} rat#${r.i} (r ${r.radius.toFixed(3)}${r.walking ? ' walking' : ''}) ${d.toFixed(2)} from ${o.key}#${o.i}${o.walking ? ' walking' : ''} at (${r.pos.x.toFixed(2)}, ${r.pos.z.toFixed(2)})`;
        const bad = d < BODY_K * need ? what : t - ratPass.get(pair) > PASS_MAX ? `${what} for > ${PASS_MAX} s` : null;
        if (bad) { ratNear.add(bad); if (r.radius > 0.3) mutantNear.add(bad); if (nest) nestNear.add(bad); if (pass) passStand.add(bad); if (army) armyNear.add(bad); }
      }
      for (const k of show.roster.keys()) for (const m of show.roster.members(k)) {
        if (m.arriving) { if (!since.has(m)) since.set(m, t); } else if (since.has(m)) { walkedIn++; since.delete(m); }
        const h = view[k]?.home, exempt = m.hidden || m.mode === 'script' || h?.kind === 'path' || authored(h, m.i);
        if (!m.hidden && h?.kind !== 'ride' && !authored(h, m.i) && cellAt(m.pos.x, m.pos.z)) {
          const inWall = fps.some(f => inShape(f, m.pos.x, m.pos.z)), what = `${label} ${k}#${m.i} ${m.mode} (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`;
          if (!inWall) { wallIn.delete(m); wallOut.add(m); }
          else if (!wallIn.has(m) && wallOut.has(m) && !changed && !rebuilt) walls.add(`${what} ${JSON.stringify(fps.find(f => inShape(f, m.pos.x, m.pos.z)))}`);
          else { if (!wallIn.has(m)) wallIn.set(m, t); if (t - wallIn.get(m) > CAUGHT_MAX) walls.add(`${what} still inside after ${CAUGHT_MAX} s`); }
        }
        // 橋上：貼著橋面（ride 坐在車頂、藏起來的人不算）。從橋側邊踏上／踏下拱橋的那一幀（上一幀還在橋外、下一幀就到橋外：
        // 格子邊上緊貼著橋身，橋面比格面高到 0.1，這一幀正在跨那一階）只看時間、不看 BRIDGE_END
        const onDeck = !m.hidden && h?.kind !== 'ride' && onBridge(m.pos);
        if (onDeck) {
          bridgeFrames++;
          if (stepping.has(m)) sunk.add(stepping.get(m));   // 上一幀超過 BRIDGE_END，這一幀還在橋上：不是踏下橋的那一步
          stepping.delete(m);
          const dy = m.pos.y - show.nav.groundY(m.pos.x, m.pos.z), what = `${label} ${k}#${m.i} ${m.mode}${m.cursor ? ' path' : ''} (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)}) dy ${dy.toFixed(3)}`;
          if (Math.abs(dy) > BRIDGE_END && decked.has(m)) stepping.set(m, what);
          if (Math.abs(dy) > BRIDGE_TOL) { if (!off.has(m)) off.set(m, t); else if (t - off.get(m) > BRIDGE_BLIP + 1e-9) sunk.add(`${what} for > ${BRIDGE_BLIP} s`); } else off.delete(m);
          decked.add(m);
        } else { off.delete(m); decked.delete(m); stepping.delete(m); }
        // 外星結局：偵防師站著時不貼著任何人；走路經過別人身邊不撞上（≥ BODY）、貼近（< SEPARATION）也不超過 PASS_MAX 秒
        if (closing && k === 'chip.detective' && !m.hidden && !m.gone) {
          detectiveFrames++;
          // 擦身而過：偵防師在走、或別人走過站著的偵防師身邊（物品 v2：倒數回合變異鼠從車頂走去溫泉邊，經過跟著牠的偵防師）
          let near = false;
          for (const o of seen) {
            const d = Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z); if (o === m || d >= SEPARATION - SEP_TOL) continue;
            near = true;
            const what = `${label} ${k}#${m.i} ${m.mode}${m.walking ? ' walking' : ''} ${d.toFixed(2)} from ${o.key}#${o.i}${o.walking ? ' walking' : ''} at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`;
            if (!(m.walking || o.walking) || d < BODY) crowd.add(what);
            else if (passing.has(m) && t - passing.get(m) > PASS_MAX) crowd.add(`${what} for > ${PASS_MAX} s`);
          }
          if (near) { if (!passing.has(m)) passing.set(m, t); } else passing.delete(m);
        }
        const inside = bare.walkable(m.pos.x, m.pos.z) && show.nav.inFootprint(m.pos.x, m.pos.z);
        if (exempt || !inside) { caught.delete(m); if (exempt) outside.delete(m); else outside.add(m); continue; }
        const what = `${label} ${k}#${m.i} ${m.mode}${m.walking ? ' walking' : ''} (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`;
        if (!caught.has(m)) { if (outside.has(m) && !changed) bad.add(what); else caught.set(m, t); }
        if (caught.has(m) && t - caught.get(m) > CAUGHT_MAX) slow.push(`${what} still inside after ${CAUGHT_MAX} s`);
      }
    };
    show.update = (dt, tt) => { update(dt, tt); t += dt; check(); };
    let s = engine.createState(spec);
    const steps = [...order.map(id => ['place', id]), ...Array.from({ length: spec.CLOSING_TURNS }, () => ['advance'])];
    for (const [i, [kind, id]] of steps.entries()) {
      const r = kind === 'place' ? engine.place(s, id, spec) : engine.advance(s, spec); s = r.state;
      label = `${order.join('>')} turn ${i + 1}`; closing = kind === 'advance' && s.flags?.ratBranch === 'alien';
      await run([...r.events, { kind: 'settle' }]);
      const walking = () => [...since.keys()].filter(m => m.arriving && !m.gone);
      for (let f = 0; f < ARRIVE_MAX / DT && walking().length; f++) show.update(DT, 1000 + t);
      for (const m of walking()) stuck.push(`${label} ${m.key}#${m.i} at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
      for (const m of walking()) since.delete(m);
    }
    for (let f = 0; f < TAIL; f++) show.update(DT, 1000 + t);
    results.walkedIn[order.join('>')] = walkedIn;
  }
  return results;
}
test('no roster member is ever inside a padded footprint, and nobody is stuck: every walk-in arrives', async () => {
  const { PAD } = await import('../src/show/nav.js'), { bad, slow, stuck, walls, walkedIn } = await livePlay();
  for (const [order, n] of Object.entries(walkedIn)) assert.ok(n >= 10, `${order}: ${n} walk-ins arrived`);
  assert.equal(Object.keys(walkedIn).length, 2, 'both solutions');
  assert.equal(PAD, 0.12);
  assert.deepEqual([...bad].slice(0, 20), [], `${bad.size} frames inside a footprint`);
  assert.deepEqual(slow.slice(0, 20), [], 'caught by a new building: walks out at once');
  assert.deepEqual(stuck, []);
  assert.deepEqual([...walls].slice(0, 20), [], `${walls.size} frames inside a building`);
});
// 最終審查修正：手畫的折線（工程師通勤 ENGINEER_ROUTE＝routeBetween 接起來的路、老鼠、電工主路 ROAD）兩條正解每一級都在外擴 PAD 的 footprint 外
// （每 0.02 取樣，閉合的折線含最後接回起點那段）——沿折線走的人不檢查走路格，路本身要畫在建築外
test('every hand-drawn path home stays outside every padded footprint at every level of both solutions', async () => {
  const spec = await import('../src/rules/spec.js'), engine = await import('../src/rules/engine.js'), { enumerate, stats } = await import('../src/solver/run.js');
  const { headlessShow, ALL } = await import('./helpers/show.js'), bad = new Set(), seen = new Set();
  for (const order of stats(enumerate(spec), spec).full.map(r => r.order)) {
    const { show, run } = await headlessShow(); let s = engine.createState(spec);
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const step of steps) {
      const r = step(s); s = r.state;
      for (const e of [...r.events, { kind: 'settle' }]) {
        await run([e], { instant: true });
        const st = show.stage, view = Object.assign({}, ...ALL.map(mod => mod.view(st.lv, st.flags, st.meta))), nav = createNav();
        nav.setFootprints(st.footprints());
        for (const [k, v] of Object.entries(view)) {
          const h = v.home; if (h?.kind !== 'path') continue;
          seen.add(k);
          const P = h.path;
          for (let i = 0; i < (h.loop ? P.length : P.length - 1); i++) {
            const a = P[i], b = P[(i + 1) % P.length], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02);
            for (let q = 0; q <= n; q++) {
              const x = a.x + (b.x - a.x) * q / n, z = a.z + (b.z - a.z) * q / n;
              if (nav.inFootprint(x, z)) bad.add(`${k} seg ${i} (${a.x.toFixed(2)}, ${a.z.toFixed(2)})→(${b.x.toFixed(2)}, ${b.z.toFixed(2)}) lv ${JSON.stringify(st.lv)}`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['bulb.electrician', 'chip.engineers', 'rat.pack']);
  assert.deepEqual([...bad].slice(0, 20), [], `${bad.size} path segments cut into a padded footprint`);
});
// 最終審查修正：沿手畫折線（工程師通勤、老鼠、電工主路）、走路、劇本手上的人過拱橋都貼著橋面，不陷進板子
test('live, both solutions: everyone on a bridge stays on the deck (y within 0.01 of nav.groundY; ≤ 0.05 blips at the ends for ≤ 0.1 s)', async () => {
  const { sunk, bridgeFrames } = await livePlay();
  assert.ok(bridgeFrames > 1000, `${bridgeFrames} member-frames on bridges`);
  assert.deepEqual([...sunk].slice(0, 20), [], `${sunk.size} off the deck`);
});
// 最終審查修正：偵防師（follow 老鼠）停下來時不貼著別人（泡湯客）——外星結局 closing 起站著時離每個露出來的人 ≥ 0.25
// （走路經過別人身邊、別人走過他身邊：身體不相碰、貼近不超過 0.5 秒）
// 任務 7–11 隔離過（正面擦身的兩個人分不開，對整局的時間極敏感）；任務 12 補上正面擦身的讓路（nav.yieldOffset：
// 前方 0.5 內有人就往旁邊讓開，roster 的 sidestep）後重新打開——連跑三次都過，不靠調秒數
// 2026-10-28 錄影修正：變異鼠（半徑 0.325）不和任何小人疊在一起——溫泉客站池子北側、偵防師的跟隨站位照兩人半徑相加挑
test('live, alien ending: the mutant rat never overlaps a person (≥ ra + rb, or only brushes past while walking)', async () => {
  const { mutantNear, mutantFrames } = await livePlay();
  assert.ok(mutantFrames > 300, `${mutantFrames} mutant–person frames`);
  assert.deepEqual([...mutantNear].slice(0, 20), [], `${mutantNear.size} frames too close`);
});
// 所有老鼠對小人（簡報 D 的驗收，2026-10-28 第二輪裁決拆三條）：
// (a) 鼠窩的老鼠（老鼠 Lv1–2，繞錨點散步）對任何人——錨點搬到巨蛋正東，離門口觀眾 ≥ 1.09
// Task 6a 修正輪（控制者裁決）：標 todo，門檻不放寬、不刪。回到 GROW 之後兩條正解第 7 回合同時放老鼠（鼠窩 Lv2）、棒球長到 7（第 5 個觀眾進場）：
// 觀眾從捷運站那座橋下來（落點約 (−0.6, 4.3)）直線走到門口西端 (−4.15, 4.73)，路線在 x −1.19 離窩心 (−1.19, 4.14) 只有 0.23 m，
// 穿過老鼠散步圈（r 0.7）——量到 25 幀、最近 0.01 m（要 0.255）。錨點往南移 0.8 試過，改撞草皮觀眾與球員，已還原。留給延後的多輪人群那一輪（R10）
test('live, both solutions: nest rats never overlap a person (≥ ra + rb, or only brush past while walking)', { todo: '回到 GROW 後第 7 回合第 5 個觀眾從捷運站橋下來，路線離鼠窩心 0.23 m（25 幀、最近 0.01 m）——延後的多輪人群那一輪' }, async () => {
  const { nestNear, nestFrames } = await livePlay();
  assert.ok(nestFrames > 300, `${nestFrames} nest-rat–person frames`);
  assert.deepEqual([...nestNear].slice(0, 20), [], `${nestNear.size} frames too close`);
});
// (c) 走路的老鼠經過站定的人（stand 站好了）：nav.separate 讓走路的那個退開整段，不穿過去
test('live, both solutions: a walking rat never runs through a standing person', async () => {
  const { passStand, passFrames } = await livePlay();
  assert.ok(passFrames > 100, `${passFrames} walking-rat–standing-person frames`);
  assert.deepEqual([...passStand].slice(0, 20), [], `${passStand.size} frames too close`);
});
// (b) 賽博 Lv5 機器鼠軍團（10 隻繞 101 r 1.3）對中心格散步的島民：兩邊都在散步、擦身太久——另案，先標 todo
test('live, both solutions: the cyber robot-rat army round 101 never overlaps an islander', { todo: '機器鼠軍團與中心格島民擦身，留待之後處理' }, async () => {
  const { armyNear } = await livePlay();
  assert.deepEqual([...armyNear].slice(0, 20), [], `${armyNear.size} frames too close`);
});
test('live, alien ending: from closing 1 to the end the detective keeps ≥ 0.25 from every other visible member while standing, and only brushes past while walking', async () => {
  const { crowd, detectiveFrames } = await livePlay();
  assert.ok(detectiveFrames > 300, `${detectiveFrames} detective frames in the closing`);
  assert.deepEqual([...crowd].slice(0, 20), [], `${crowd.size} frames too close`);
});
// 物品 v2 任務 5：路線（拉直時用 footprint 真的形狀判斷）會貼著外擴邊走過「夾縫」——離外擴邊不到一格、最近的格點被擋住的點，
// nav.walkable 判成走不到；每幀的防穿牆檢查不能把這種點當成牆，不然走路的人卡在原地、游標自己跑掉（颱風登陸隔回合島民走不出門口）。
// 現場：鮮奶 Lv9 大學右翼（外擴後 z 到 0.102）旁 z 0.115 往東走
test('a walker whose route skims a padded footprint through a grid crevice keeps walking (no freeze at the wall)', () => {
  const { roster, nav } = setup();
  nav.setFootprints([{ x: -5.73, z: 0.85, r: 0.3 }, { x: -4.78, z: -0.35, w: 0.42, d: 0.42 }, { x: -3.98, z: 0.4, r: 0.06 }, { x: -3.38, z: 0.4, r: 0.06 },
    { x: -5.73, z: -0.5, w: 1.3913, d: 0.6956 }, { x: -3.86, z: -0.5, w: 1.5663, d: 0.9646 }]);
  const y = cellTop([-1, 0]), A = { x: -3.987, y, z: 0.115, yaw: 0 }, G = { x: -5.84, y, z: -1.35, yaw: 0 };
  const route = nav.route(A, G);
  assert.ok(route.slice(1, 6).some(p => !nav.walkable(p.x, p.z) && !nav.inFootprint(p.x, p.z)), 'the route really runs through a crevice point');
  const stand = spot => ({ kind: 'roster', at: A, n: 1, home: { kind: 'stand', spots: [spot] } });
  roster.declare('k', stand(A)); roster.snap(); const [m] = roster.members('k');
  roster.declare('k', stand(G)); roster.flush();
  run(roster, 15);
  assert.ok(gap(m.pos, A) > 0.3, `moved ${gap(m.pos, A).toFixed(2)} in 0.5 s`);
  for (let i = 0; i < 150; i++) { roster.update(1 / 30, 1 + i / 30); assert.ok(!nav.inFootprint(m.pos.x, m.pos.z), `frame ${i} inside a padded footprint`); }
});
// §14.1：走到一半，路上長出建築——從現在的位置重新找路繞過去，不照舊路穿過
test('a walker whose route is cut by a new footprint replans around it and still arrives', () => {
  const { roster, nav } = setup(), A = { x: Q.x - 1.0, y: Q.y, z: Q.z, yaw: 0 }, B = { x: Q.x + 1.0, y: Q.y, z: Q.z, yaw: 0 };
  const stand = spot => ({ kind: 'roster', at: Q, n: 1, home: { kind: 'stand', spots: [spot] } });
  roster.declare('k', stand(A)); roster.snap(); const [m] = roster.members('k');
  roster.declare('k', stand(B)); roster.flush();
  run(roster, 6); assert.ok(m.walking && m.pos.x < Q.x - 0.5, 'walking toward B');
  nav.setFootprints([{ x: Q.x, z: Q.z, w: 0.4, d: 0.8 }]);
  for (let i = 0; i < 150; i++) { roster.update(1 / 30, 1 + i / 30); assert.ok(!nav.inFootprint(m.pos.x, m.pos.z), `frame ${i} inside at ${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)}`); }
  assert.ok(gap(m.pos, B) < 0.05, `arrived (${gap(m.pos, B).toFixed(2)})`);
});
// §14.1：建築長在身上（footprint 換了的那一幀人就在裡面）——用走路速度（不是閒晃的 0.5）走出來，走路中、休息中都一樣；出來就恢復閒晃速度
test('a wanderer caught inside a new footprint walks out at walking speed, not the wander dawdle', () => {
  for (const moving of [true, false]) {
    const { roster, nav } = setup(); roster.declare('k', kids(1)); roster.snap(); const [m] = roster.members('k');
    let t = 0; for (let i = 0; i < 600 && m.walking !== moving; i++) { roster.update(1 / 30, t); t += 1 / 30; }
    assert.equal(m.walking, moving);
    nav.setFootprints([{ x: m.pos.x, z: m.pos.z, r: 0.6 }]);   // 外擴 PAD 後 0.72：閒晃速度要 1.44 s，走路速度 0.45 s
    let out = null; for (let i = 0; i < 60 && out === null; i++) { roster.update(1 / 30, t); t += 1 / 30; if (!nav.inFootprint(m.pos.x, m.pos.z)) out = i / 30; }
    assert.ok(out !== null && out < 0.7, `${moving ? 'walking' : 'resting'}: out after ${out} s`);
    roster.update(1 / 30, t);   // 走出來之後這一趟回到閒晃速度
    assert.ok(m.trip, 'still on the trip'); assert.equal(m.trip.speed, WANDER_SPEED, 'boost ends once outside the footprint');
  }
});
// 任務 7 審稿第 1 輪（賽博第 11 回合，機器鼠被拖過廠房）：沿折線過日常的人卡在走不出去的死角（從他到折線上最近一點找不到路）時，
// 不能接上遠處的游標、每幀被限速拉著直線穿過建築——拉過去的那一段照樣不進 footprint（擋住就停在牆外）
test('a path member boxed into a pocket is never dragged through a building toward its far-off path', () => {
  const { roster, nav } = setup(), P = { x: Q.x - 1.0, y: Q.y, z: Q.z };
  // 四面牆圍出一個小口袋（裡面走得到、出不去），折線在口袋東邊 1.5
  nav.setFootprints([{ x: P.x - 0.55, z: P.z, w: 0.2, d: 1.3 }, { x: P.x + 0.55, z: P.z, w: 0.2, d: 1.3 }, { x: P.x, z: P.z - 0.55, w: 1.3, d: 0.2 }, { x: P.x, z: P.z + 0.55, w: 1.3, d: 0.2 }]);
  const path = [{ x: P.x + 1.5, y: P.y, z: P.z - 0.8 }, { x: P.x + 1.5, y: P.y, z: P.z + 0.8 }];
  roster.declare('k', { kind: 'roster', at: P, n: 1, home: { kind: 'stand', spots: [{ ...P, yaw: 0 }] } }); roster.snap(); const [m] = roster.members('k');
  assert.ok(nav.walkable(m.pos.x, m.pos.z) && nav.route(m.pos, path[0]).length <= 1, 'really boxed in');
  roster.declare('k', { kind: 'roster', at: P, n: 1, home: { kind: 'path', path, loop: false, speed: 0.5 } }); roster.flush();
  for (let i = 0; i < 300; i++) { roster.update(1 / 30, i / 30); assert.ok(!nav.inFootprint(m.pos.x, m.pos.z), `frame ${i} inside a padded footprint at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`); }
});
// 同上：走進來的路線擦進外擴 footprint（路線拉直的誤差），人被每幀的防穿牆擋在半路——游標走完了也不跳到終點、之後不被拖過建築
test('a walk-in blocked by a wall mid-trip is not snapped to its trip end nor dragged through the building afterwards', () => {
  const { roster, nav } = setup(), A = { x: Q.x - 1.0, y: Q.y, z: Q.z, yaw: 0 }, G = { x: Q.x + 1.0, y: Q.y, z: Q.z, yaw: 0 };
  const wall = { x: Q.x, z: Q.z, w: 0.3, d: 0.3 }, route = nav.route;
  nav.route = (a, b) => (Math.hypot(b.x - G.x, b.z - G.z) < 1e-6 ? [{ ...a }, { ...G }] : route(a, b));   // 路線直直穿過牆（模擬拉直的誤差）
  roster.declare('k', { kind: 'roster', at: A, n: 1, home: { kind: 'stand', spots: [A] } }); roster.snap(); const [m] = roster.members('k');
  nav.setFootprints([wall]); roster.update(1 / 30, 0);
  // 家換成牆另一邊的折線（沿線過日常的人是「鬆」的：跟著游標可以走出走路格），走進去的那一趟被牆擋住
  roster.declare('k', { kind: 'roster', at: A, n: 1, home: { kind: 'path', path: [G, { ...G, z: G.z + 1 }], loop: false, speed: 0.5 } }); roster.flush();
  for (let i = 0; i < 240; i++) { roster.update(1 / 30, 1 + i / 30); assert.ok(!nav.inFootprint(m.pos.x, m.pos.z), `frame ${i} inside at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`); }
  assert.ok(m.pos.x < Q.x, 'stayed on its side of the wall');
});
// 人數預算（任務 12、裁決 R16）：散步不借道別格——家那格被建築切成兩半時，散步只挑不出這格就走得到的點（不從橋繞去鄰格再回來）
test('wander never routes through another cell: a cell split by a wall keeps its walker on one side', () => {
  const { roster, nav } = setup(), home = centre([-1, 0]);
  nav.setFootprints([{ x: home.x, z: home.z, w: 6, d: 0.2 }]);
  roster.declare('k', { kind: 'roster', at: { ...home, z: home.z + 1 }, n: 1, home: { kind: 'wander', at: home, r: 1.8 } });
  roster.snap();
  const [m] = roster.members('k'), cells = new Set();
  for (let i = 0; i < 30 * 120; i++) { roster.update(1 / 30, i / 30); const c = cellAt(m.pos.x, m.pos.z); cells.add(c ? String(c) : 'bridge'); }
  assert.deepEqual([...cells], ['-1,0'], `visited ${[...cells]}`);
});
// 裁決 R18：?quality=low 一份模型名冊最多載 3 隻 glb（機器鼠軍團 10 隻，其餘不畫；位置、劇本照舊）
test('quality low: a model roster loads at most 3 glb holders; the rest exist without a model', () => {
  const people = createPeople(THREE, { max: 8 }), spawned = [];
  const assets = { spawn: async (path, opts) => { const g = new THREE.Group(); g.userData.mixer = { timeScale: 1 }; opts.parent?.add(g); spawned.push(g); return g; }, release() {} };
  const roster = createRoster(THREE, { people, assets, build: null, nav: createNav({ rnd: mulberry32(7) }), blink: null, rail: { offset: 0 }, rnd: mulberry32(11), quality: 'low' });
  roster.declare('rat.pack', { kind: 'roster', at: AT, n: 10, model: { path: 'rat.glb', h: 0.2 }, home: { kind: 'wander', at: AT, r: 1 } });
  assert.equal(roster.members('rat.pack').length, 10); assert.equal(spawned.length, 3);
});
// 審稿（任務 12 第 1 輪）：正面擦身——兩個人在同一條線上對走、一個人走過站著的人：全程距離 ≥ 0.25 − 0.02，每幀位移不超過走路速度 × dt
function passRun(roster, ms, frames) {
  let min = Infinity, worst = 0; const last = new Map(ms.map(m => [m, { ...m.pos }]));
  for (let f = 0; f < frames; f++) {
    roster.update(1 / 30, f / 30);
    min = Math.min(min, gap(ms[0].pos, ms[1].pos));
    for (const m of ms) { const p = last.get(m); worst = Math.max(worst, gap(m.pos, p) / (m.speed / 30)); last.set(m, { ...m.pos }); }
  }
  return { min, worst };
}
test('head-on pair on the same line pass each other ≥ 0.23 apart, never faster than walking speed', () => {
  const { roster } = setup(), C = centre([-1, 0]), L = { ...C, x: C.x - 1, yaw: 0 }, R = { ...C, x: C.x + 1, yaw: 0 };
  roster.declare('a', { kind: 'roster', at: C, n: 1, home: { kind: 'stand', spots: [R], entry: L } });
  roster.declare('b', { kind: 'roster', at: C, n: 1, home: { kind: 'stand', spots: [L], entry: R } });
  const ms = [roster.members('a')[0], roster.members('b')[0]];
  const { min, worst } = passRun(roster, ms, 120);
  assert.ok(gap(ms[0].pos, R) < 0.1 && gap(ms[1].pos, L) < 0.1, 'both arrived');
  assert.ok(min >= SEPARATION - 0.02, `closest ${min.toFixed(3)}`); assert.ok(worst <= 1 + 1e-6, `fastest frame ${worst.toFixed(2)} × walking speed`);
});
test('walking past someone standing on the line keeps ≥ 0.23 from them, never faster than walking speed', () => {
  const { roster } = setup(), C = centre([-1, 0]), L = { ...C, x: C.x - 1, yaw: 0 }, R = { ...C, x: C.x + 1, yaw: 0 };
  roster.declare('s', { kind: 'roster', at: C, n: 1, home: { kind: 'stand', spots: [{ ...C, yaw: 0 }] } });
  roster.snap();
  roster.declare('w', { kind: 'roster', at: C, n: 1, home: { kind: 'stand', spots: [R], entry: L } });
  const ms = [roster.members('w')[0], roster.members('s')[0]];
  const { min, worst } = passRun(roster, ms, 120);
  assert.ok(gap(ms[0].pos, R) < 0.1, 'arrived');
  assert.ok(min >= SEPARATION - 0.02, `closest ${min.toFixed(3)}`); assert.ok(worst <= 1 + 1e-6, `fastest frame ${worst.toFixed(2)} × walking speed`);
});

// 2026-10-28 第二輪審稿：站位離已經站好的人不到兩人半徑相加（排隊、觀眾擠一個點）——走過去的人不被「退開整段」推在原地空走，
// 照樣走到站位站定，之後由 separateStanding 錯開
test('a stand member whose spot is within ra + rb of a settled stander still arrives and settles (no walking in place)', () => {
  const { roster } = setup(), C = centre([-1, 0]), A = { ...C, yaw: 0 }, Bs = { ...C, x: C.x + 0.05, yaw: 0 }, E = { ...C, x: C.x + 1, z: C.z + 0.3, yaw: 0 };
  roster.declare('a', { kind: 'roster', at: C, n: 1, home: { kind: 'stand', spots: [A] } }); roster.snap();
  roster.declare('b', { kind: 'roster', at: C, n: 1, home: { kind: 'stand', spots: [Bs], entry: E } });
  const [a] = roster.members('a'), [b] = roster.members('b');
  let walking = 0;
  for (let f = 0; f < 300; f++) { roster.update(1 / 30, f / 30); if (f >= 150 && b.walking) walking++; }
  assert.ok(b.settled && !b.walking, `B settled (walking ${walking} of the last 150 frames)`);
  assert.ok(walking < 10, `B walks in place ${walking} frames`);
  assert.ok(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) >= 0.25 - 1e-6, 'separateStanding spreads the pair');
});

// 第三輪審稿：兩個人在橋上迎面相遇（中心格 ↔ 晶片格那座橋）——不能在橋上互相頂住、原地空走；6 秒內各自走到對面的站位
test('two walkers meeting head-on on a bridge pass each other and both reach their spots within 6 s', async () => {
  const { edgeMidpoint, RING_R } = await import('../src/scene/hex.js');
  const { roster } = setup(), { a, b } = edgeMidpoint([0, 0], [1, 0], RING_R * Math.sqrt(3) / 2);
  const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
  const at = (p, s, cell) => ({ x: p.x + ux * s, y: cellTop(cell), z: p.z + uz * s, yaw: 0 });
  const A0 = at(a, -0.6, [0, 0]), A1 = at(b, 0.6, [1, 0]), B0 = at(b, 0.7, [1, 0]), B1 = at(a, -0.7, [0, 0]);
  roster.declare('a', { kind: 'roster', at: A1, n: 1, home: { kind: 'stand', spots: [A1], entry: A0 } });
  roster.declare('b', { kind: 'roster', at: B1, n: 1, home: { kind: 'stand', spots: [B1], entry: B0 } });
  const [ma] = roster.members('a'), [mb] = roster.members('b');
  for (let f = 0; f < 180; f++) roster.update(1 / 30, f / 30);
  for (const [m, spot, k] of [[ma, A1, 'a'], [mb, B1, 'b']]) {
    const d = Math.hypot(m.pos.x - spot.x, m.pos.z - spot.z);
    assert.ok(d < 0.3 && !m.walking, `${k} ${d.toFixed(2)} from its spot, walking ${m.walking}`);
  }
});

// 最終章 §6（最終審稿）：命中後全島躺平「姿勢持續到標題卡」——people.mood 是 'lie' 時名冊不推日常（不散步、不走趟、不被錯開），
// 躺著的人不在島上滑；心情回 normal（RESET 經 app 的 showWorld、或 roster.reset 重來）就接著走
test('people mood lie freezes every home-mode people walker (wander, stand); mood normal resumes the daily walk', () => {
  const { roster, people } = setup();
  roster.declare('k', kids(4)); roster.declare('q', queue(3)); run(roster, 30);
  const ms = [...roster.members('k'), ...roster.members('q')], at = () => ms.map(m => ({ ...m.pos }));
  people.setMood('lie');
  const before = at(); run(roster, 90, 10);
  ms.forEach((m, i) => assert.ok(gap(m.pos, before[i]) <= 0.01, `${m.key}#${m.i} lies still (moved ${gap(m.pos, before[i]).toFixed(3)})`));
  people.setMood('normal');
  const lying = at(); run(roster, 90, 20);
  assert.ok(ms.some((m, i) => gap(m.pos, lying[i]) > 0.05), 'back on their feet, someone walks again');
});
// 2026-10-28 錄影修正：每個成員有自己的半徑——小人 0.125；模型照高度 0.65 × h、夾在 0.12–0.35（老鼠 h 0.2 → 0.13、變異鼠 h 0.5 → 0.325）
test('every member carries a radius: people 0.125, models 0.65 × h clamped to 0.12–0.35', () => {
  const { roster } = setup(), C = centre([-1, 0]);
  roster.declare('p', { kind: 'roster', at: C, n: 1, home: { kind: 'stand', spots: [{ ...C, yaw: 0 }] } });
  for (const [k, h] of [['r', 0.2], ['m', 0.5], ['s', 0.1], ['g', 1.0]]) roster.declare(k, { kind: 'roster', at: C, n: 1, model: { path: 'rat.glb', h }, home: { kind: 'stand', spots: [{ ...C, yaw: 0 }] } });
  const r = k => roster.members(k)[0].radius;
  assert.equal(r('p'), 0.125); assert.ok(Math.abs(r('r') - 0.13) < 1e-9); assert.ok(Math.abs(r('m') - 0.325) < 1e-9); assert.equal(r('s'), 0.12); assert.equal(r('g'), 0.35);
  // 換模型（變異）半徑跟著換
  roster.declare('r', { kind: 'roster', at: C, n: 1, model: { path: 'rat.glb', h: 0.5 }, home: { kind: 'stand', spots: [{ ...C, yaw: 0 }] } });
  assert.ok(Math.abs(r('r') - 0.325) < 1e-9, 'remodelled rat grows its radius');
});
