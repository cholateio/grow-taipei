import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createPeople } from '../src/scene/people.js';
import { createNav } from '../src/show/nav.js';
import { createFlash } from '../src/show/flash.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { mulberry32 } from '../src/scene/random.js';
import { FLASH_PEAK } from '../src/show/flash.js';
installFakeDom();
const { createRoster, HEAD_Y } = await import('../src/show/roster.js');

const AT = anchorWorld('milk');
const kids = n => ({ kind: 'roster', at: AT, n, shirt: 0xfcea8b, home: { kind: 'wander', at: AT, r: 1.0 } });

// 真 people、真 nav、真 flash；假 assets（holder 帶一個假 mixer，記錄 spawn／release）
function setup() {
  const people = createPeople(THREE, { max: 48 }), spawned = [], released = [];
  const assets = {
    spawned, released,
    spawn: async (path, opts) => { const g = new THREE.Group(); g.userData.mixer = { timeScale: 1 }; g.userData.opts = opts; opts.parent?.add(g); spawned.push(g); return g; },
    release: g => { released.push(g); g.removeFromParent(); },
  };
  const nav = createNav({ rnd: mulberry32(7) }), flash = createFlash(THREE, { group: new THREE.Group() }), rail = { offset: 0 };
  const roster = createRoster(THREE, { people, assets, build: null, nav, flash, rail, rnd: mulberry32(11) });
  return { roster, people, assets, flash, nav, rail };
}

test('declare spawns n members at home with a flash each; members wander on the grid', () => {
  const { roster, people, flash, nav } = setup(); roster.declare('milk.kids', kids(3));
  assert.equal(roster.members('milk.kids').length, 3); assert.equal(people.walkers.length, 3); assert.equal(flash.count, 3);
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
  roster.declare('chip.engineers', kids(2)); roster.flush(); assert.equal(people.walkers.length, 3, 'a plain shrink removes one at flush');
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
// 審查修正 2：出現／換配件在白光最亮那一刻才看得到；同一次宣告的多個人依序閃，間隔 0.15 s
test('spawns appear at the flash peak, staggered 0.15 s apart; accessory swaps reveal at the peak too', () => {
  const { roster, flash } = setup(); roster.declare('k', kids(3)); const ms = roster.members('k');
  const shown = () => ms.map(m => m.walker.pose.y > 0);
  assert.equal(flash.count, 3); assert.deepEqual(shown(), [false, false, false]);
  flash.update(FLASH_PEAK + 0.01); assert.deepEqual(shown(), [true, false, false]);
  flash.update(0.15); assert.deepEqual(shown(), [true, true, false]);
  flash.update(0.15); assert.deepEqual(shown(), [true, true, true]);
  flash.update(1);
  roster.declare('k', { ...kids(3), accessory: 'cap' }); assert.ok(ms.every(m => m.walker.accessory === 'cap'));
  assert.deepEqual(shown(), [false, false, false], 'hidden behind the flash until its peak');
  flash.update(FLASH_PEAK + 0.31); assert.deepEqual(shown(), [true, true, true]);
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
// 鮮奶 Lv3 長高：同一群小孩原地變 1.3 倍（白光後露出），頭頂跟著抬高
test('re-declaring with a new scale updates the walker scale and headY in place', () => {
  const { roster, flash } = setup(); roster.declare('k', kids(3)); const ms = roster.members('k'); flash.update(1);
  roster.declare('k', { ...kids(3), scale: 1.3 });
  const now = roster.members('k'); assert.ok(now.every((m, i) => m === ms[i]), 'same members');
  for (const m of now) { assert.equal(m.walker.scale, 1.3); assert.ok(Math.abs(m.headY - HEAD_Y.people * 1.3) < 1e-9); assert.ok(m.walker.pose.y < 0, 'veiled until the peak'); }
  flash.update(1); assert.ok(now.every(m => m.walker.pose.y > 0));
});

// 晶片工程師通勤：path 日常沿折線來回（開放路徑走到底折返），起點依 i / n 錯開
const ROUTE = [{ x: AT.x - 1, y: AT.y, z: AT.z }, { x: AT.x + 0.2, y: AT.y, z: AT.z }, { x: AT.x + 0.2, y: AT.y, z: AT.z + 0.8 }];   // 總長 2.0
const toRoute = p => Math.min(...ROUTE.slice(1).map((b, k) => {
  const a = ROUTE[k], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}));
test('path home walks back and forth along the polyline', () => {
  const { roster } = setup(); roster.declare('k', { ...kids(2), home: { kind: 'path', path: ROUTE, loop: false, speed: 0.8 } });
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
  const d = roster.members('chip.detective')[0]; assert.deepEqual([d.pos.x, d.pos.z], [P.x, P.z]);
  for (let i = 0; i < 30; i++) roster.update(1 / 30, i / 30);
  assert.deepEqual([d.pos.x, d.pos.z, d.walking], [P.x, P.z, false], 'no rats: stands');
  roster.declare('rat.pack', { ...kids(1), home: { kind: 'stand', spots: [{ ...R, yaw: 0 }] } });
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
    const { roster, people, flash } = setup(); roster.declare('token.staff', kids(1)); flash.update(1); roster.flush();
    const [staff] = roster.members('token.staff'), swim = { ...kids(1), accessory: 'glass', from: 'token.staff' };
    const before = flash.count;
    if (targetFirst) { roster.declare('token.swimmers', swim); roster.retire('token.staff'); } else { roster.retire('token.staff'); roster.declare('token.swimmers', swim); }
    roster.flush();
    assert.deepEqual(roster.members('token.swimmers'), [staff], `order ${targetFirst}: same person`);
    assert.equal(people.walkers.length, 1, `order ${targetFirst}: no extra walker`);
    assert.ok(!roster.keys().includes('token.staff'), `order ${targetFirst}: source group gone`);
    assert.equal(flash.count - before, 1, `order ${targetFirst}: only the swap flash`);
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
  const { roster, flash } = setup();
  roster.declare('k', kids(3)); roster.flush(); flash.update(1);   // 白光過了：都露出來了
  const ms = roster.members('k'); ms.forEach(m => roster.hide(m));
  assert.ok(ms.every(m => m.walker.pose.y < -1), 'hidden under the sea');
  assert.ok(ms.every(m => m.hidden));
  roster.showAll();
  assert.ok(ms.every(m => !m.hidden));
  for (const m of ms) assert.ok(Math.abs(m.walker.pose.y - m.pos.y) < 1e-9, 'walker back at its pos (not under the sea)');
});
// 藏起來的人（颱風登陸躲進門裡）被退掉：已經在門口消失了，退場不再閃白光
test('a hidden leaver retires without a flash; a visible one still flashes', () => {
  const { roster, flash } = setup();
  roster.declare('k', kids(2)); roster.flush(); flash.update(1); flash.clear();
  const [a, b] = roster.members('k'); roster.hide(a);
  roster.declare('k', kids(1)); roster.flush();
  assert.ok(!roster.members('k').includes(b), 'the last member leaves first');
  assert.equal(flash.count, 1, 'visible leaver flashes');
  flash.clear();
  roster.hide(roster.members('k')[0]); roster.retire('k'); roster.flush();
  assert.equal(roster.members('k').length, 0); assert.equal(flash.count, 0, 'hidden leaver is silent');
});
test('stand members with fidget play a short gesture every 3 s and are still between', () => {
  const { roster } = setup(), spot = { ...AT, yaw: 0 };
  roster.declare('k', { kind: 'roster', at: AT, n: 2, home: { kind: 'stand', spots: [spot, { ...spot, x: spot.x + 0.4 }], fidget: 'wave' } });
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
test('a stand home with rescue stands at the nearest walkable point when its spot is inside a footprint', () => {
  const { roster, nav } = setup(), spot = { ...AT, yaw: 0 };
  nav.setFootprints([{ x: AT.x, z: AT.z, r: 0.6 }]);
  roster.declare('k', { kind: 'roster', at: AT, n: 1, home: { kind: 'stand', spots: [spot], rescue: true } });
  const m = roster.members('k')[0], want = nav.nearestWalkable(spot);
  for (let i = 0; i < 300; i++) roster.update(1 / 30, i / 30);
  assert.ok(Math.hypot(m.pos.x - want.x, m.pos.z - want.z) < 0.1 && nav.walkable(m.pos.x, m.pos.z), 'rescued out of the footprint');
  roster.snap(); assert.ok(nav.walkable(m.pos.x, m.pos.z), 'snap rescues too');
});
