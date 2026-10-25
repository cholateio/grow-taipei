// test/beats.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createNav } from '../src/show/nav.js';
import { createTimeline } from '../src/show/timeline.js';
import { axialToWorld, cellTop } from '../src/scene/hex.js';
import { trainPose } from '../src/actors/token.js';
installFakeDom();
const { createFlash } = await import('../src/show/flash.js');
const { B, STATION_A, TRAIN_ARRIVE, TRAIN_STOP, partHead } = await import('../src/show/beats.js');

const c = cell => ({ ...axialToWorld(...cell), y: cellTop(cell) });
const ev = { kind: 'grow', item: 'milk' };

// 假 ctx：真 nav、真 timeline、真 flash；假 roster／stage／bubbles／rig 記錄呼叫。
// tl.update 先推白光再推時間軸（和 show 的每幀順序一樣：這一幀才放的白光下一幀才開始走）
function fake({ pos = c([0, 0]), changed = [], parts = [] } = {}) {
  const nav = createNav(), setFootprints = nav.setFootprints;
  nav.setFootprints = list => { nav.footprintsSet = list; setFootprints(list); };
  const member = { key: 'k', i: 0, kind: 'people', pos: { ...pos }, yaw: 0, speed: 1.6, headY: 0.5, mode: 'home', walking: false, hidden: false, walker: { gesture: null } };
  member.head = () => ({ x: member.pos.x, y: member.pos.y + member.headY, z: member.pos.z });
  const roster = {
    claimed: [], homed: [],
    claim: m => { m.mode = 'script'; roster.claimed.push(m); },
    home: m => { m.mode = 'home'; roster.homed.push(m); },
    setPose: (m, { x, y, z, yaw = m.yaw, walking = false }) => { m.pos = { x, y: y ?? nav.groundY(x, z), z }; m.yaw = yaw; m.walking = walking; },
    spawnHeld: (key, at) => { const m = { ...member, key, pos: { ...at }, mode: 'script' }; m.head = () => ({ ...m.pos }); roster.spawned = m; return m; },
  };
  const objects = new Map(parts.map(k => [k, new THREE.Group()]));
  const stage = {
    calls: [], committed: [], committedAll: false, lv: { token: 2 }, flags: {}, pending: [],
    apply: (e, opts) => {
      stage.calls.push(['apply', e, opts]);
      const list = changed.map(c => (typeof c === 'string' ? { key: c } : c));
      stage.pending = opts.deferred ? list.filter(c => !c.roster).map(c => c.key) : [];   // 名冊的鍵不會 pending
      return { changed: list.map(c => ({ key: c.key, at: c.at ?? { x: 1, y: 0, z: 1 }, kind: 'add' })), rest: [] };
    },
    pendingKeys: () => [...stage.pending],
    commit: key => stage.committed.push(key),
    commitAll: () => { stage.committedAll = true; },
    footprints: () => [],
    headOf: id => ({ item: id, x: 1, y: 2, z: 3 }),
    partObject: key => objects.get(key) ?? null,
  };
  const bubbles = {
    shown: [], levels: [], cancelled: 0,
    show: (head, kind, dur) => { bubbles.shown.push({ head, kind, dur }); return { done: Promise.resolve(), cancel: () => bubbles.cancelled++ }; },
    levelUp: (head, opts) => { bubbles.levels.push({ head, opts }); return { done: Promise.resolve(), cancel: () => bubbles.cancelled++ }; },
  };
  const flashGroup = new THREE.Group(), flash = createFlash(THREE, { group: flashGroup });
  const rig = { calls: [], panTo: (p, ms) => rig.calls.push(['panTo', p, ms]), home: ms => rig.calls.push(['home', ms]) };
  const rail = { offset: 0 }, worlds = [];
  const ctx = { stage, roster, nav, bubbles, flash, rig, rail, world: (e, instant) => worlds.push([e, instant]), montage: false, instant: false, now: 0, B, worlds };
  const inner = createTimeline(), tl = Object.create(inner);
  tl.update = dt => { flash.update(dt); inner.update(dt); };
  return { ctx, tl, member, stage, flash, flashGroup, rail, roster, bubbles, rig, objects };
}

test('walk computes its duration from the route and the walk speed, moves the member along, ends at the target', () => {
  const { ctx, tl, member } = fake({ pos: c([-1, 1]) }); const to = c([-1, 0]);
  tl.play([B.walk(member, to)], ctx); tl.update(0);
  const len = ctx.nav.routeLength(ctx.nav.route(c([-1, 1]), to)); assert.ok(Math.abs(tl.currentDur - len / 1.6) < 1e-6);
  tl.update(0.5); assert.ok(member.walking && ctx.nav.walkable(member.pos.x, member.pos.z));
  tl.skip(); assert.ok(Math.hypot(member.pos.x - to.x, member.pos.z - to.z) < 1e-6 && !member.walking);
});
test('walk at double speed in montage; an empty route takes no time', () => {
  const { ctx, tl, member, roster } = fake({ pos: c([-1, 1]) }); const to = c([-1, 0]);
  const len = ctx.nav.routeLength(ctx.nav.route(c([-1, 1]), to));
  ctx.montage = true; const w = B.walk(() => member, () => to);
  assert.ok(Math.abs(w.estimate(ctx) - len / 3.2) < 1e-6); assert.equal(roster.claimed.length, 0, 'estimate leaves the member alone');
  tl.play([w], ctx); tl.update(0); assert.ok(Math.abs(tl.currentDur - len / 3.2) < 1e-6); assert.equal(member.mode, 'script');
  tl.skip();
  const r = ctx.nav.route(c([-1, 1]), to), [p, q] = r.slice(-2);
  assert.ok(Math.abs(member.yaw - Math.atan2(q.x - p.x, q.z - p.z)) < 1e-9, 'faces along the last segment');
  const still = fake({ pos: c([0, 0]) }); still.tl.play([B.walk(still.member, c([0, 0])), B.wait(0.1)], still.ctx); still.tl.update(0);
  assert.equal(still.tl.currentKind, 'wait'); assert.ok(!still.member.walking);
});
test('apply with flash defers the stage change and commits each key at the flash peak, 0.15 s apart', () => {
  const { ctx, tl, stage, flash } = fake({ changed: ['a', 'b'] });
  tl.play([B.apply(ev)], ctx); tl.update(0); assert.deepEqual(stage.calls[0], ['apply', ev, { deferred: true }]); assert.equal(flash.count, 1);
  tl.update(0.15); assert.equal(flash.count, 2); tl.update(0.1); assert.deepEqual(stage.committed, ['a']); tl.update(0.15); assert.deepEqual(stage.committed, ['a', 'b']);
  tl.update(1); assert.ok(stage.committedAll); assert.ok(ctx.nav.footprintsSet);
});
test('apply with flash, skipped, commits everything at once', () => {
  const { ctx, tl, stage } = fake({ changed: ['a', 'b'] });
  tl.play([B.apply(ev)], ctx); tl.skip(); assert.ok(stage.committedAll); assert.ok(ctx.nav.footprintsSet); assert.ok(!tl.busy);
});
test('apply flashes only the keys the stage holds pending; roster keys flash themselves', () => {
  const { ctx, tl, stage, flash } = fake({ changed: ['a', { key: 'milk.kids', roster: true }] });
  tl.play([B.apply(ev), B.wait(0.1)], ctx); tl.update(0); assert.equal(tl.currentDur, 0.5, 'roster key adds no stagger');
  tl.update(0.15); assert.equal(flash.count, 1, 'no flash for the roster key');
  tl.update(0.35); assert.deepEqual(stage.committed, ['a']); assert.equal(tl.currentKind, 'wait');
  const only = fake({ changed: [{ key: 'milk.kids', roster: true }] });
  only.tl.play([B.apply(ev, { hold: ['milk.kids'] }), B.wait(0.1)], only.ctx); only.tl.update(0);
  assert.equal(only.tl.currentKind, 'wait'); assert.equal(only.flash.count, 0); assert.ok(only.stage.committedAll); assert.ok(only.ctx.nav.footprintsSet);
});
test('a part at the origin flashes over its item, the train over its head car', () => {
  const O = { x: 0, y: 0, z: 0 };
  const { ctx, tl, flashGroup } = fake({ changed: [{ key: 'token.track', at: O }, { key: 'token.train', at: O }] }); ctx.now = 2; ctx.rail.offset = 1;
  tl.play([B.apply(ev)], ctx); tl.update(0); tl.update(0.15);
  const [track, train] = flashGroup.children.map(o => o.position), head = trainPose(3, 0, { speed: 0.35 });
  assert.deepEqual([track.x, track.z], [1, 3], 'stage.headOf(token)');
  assert.ok(Math.abs(train.x - head.x) < 1e-9 && Math.abs(train.z - head.z) < 1e-9, 'train head car');
});
// 不是物品的零件在島心（衛星島的 sat.boats）：沒有頭可以掛白光，就不閃、不算時間，end 照樣 commit（審查 Minor 4）
test('a non-item part at the origin gets no flash and adds no time, but still commits at the end', () => {
  const { ctx, tl, stage, flash } = fake({ changed: [{ key: 'sat.boats', at: { x: 0, y: -0.2, z: 0 } }, 'a'] });
  tl.play([B.apply(ev), B.wait(0.1)], ctx); tl.update(0); assert.equal(tl.currentDur, 0.5, 'only a flashes');
  tl.update(0.15); assert.equal(flash.count, 1);
  tl.update(0.4); assert.deepEqual(stage.committed, ['a']); assert.ok(stage.committedAll); assert.equal(tl.currentKind, 'wait');
  const alone = fake({ changed: [{ key: 'sat.boats', at: { x: 0, y: -0.2, z: 0 } }] });
  alone.tl.play([B.apply(ev), B.wait(0.1)], alone.ctx); alone.tl.update(0);
  assert.equal(alone.tl.currentKind, 'wait'); assert.equal(alone.flash.count, 0); assert.ok(alone.stage.committedAll);
});
// 蒙太奇估長度：閃白光的 apply 至少一道白光（審查 Minor 2）
test('apply estimates one flash when flashing and nothing without', () => {
  const { ctx } = fake();
  assert.equal(B.apply(ev).estimate(ctx), 0.5); assert.equal(B.apply(ev, { flash: false }).estimate(ctx), 0);
});
test('apply without flash is instant; only and hold are passed through', () => {
  const { ctx, tl, stage, flash } = fake({ changed: ['x'] });
  tl.play([B.apply(ev, { flash: false, only: ['x'], hold: ['y'] }), B.wait(0.1)], ctx); tl.update(0);
  assert.deepEqual(stage.calls[0][2], { only: ['x'], hold: ['y'], deferred: false });
  assert.equal(tl.currentKind, 'wait'); assert.equal(flash.count, 0); assert.ok(stage.committedAll); assert.ok(ctx.nav.footprintsSet);
});
test('a who function that returns nothing skips the beat', () => {
  const { ctx, tl, roster, bubbles } = fake(); const none = () => null;
  tl.play([B.walk(none, c([0, 0])), B.bubble(() => undefined, '！'), B.gesture(none, 'wave'), B.jump(none, () => c([0, 0])), B.home([none]), B.levelUp(none), B.wait(0.1)], ctx);
  tl.update(0); assert.equal(tl.currentKind, 'wait');
  assert.equal(roster.claimed.length + roster.homed.length + bubbles.shown.length + bubbles.levels.length, 0);
});
test('levelUp resolves a member, an item id and a head object', () => {
  const { ctx, tl, member, bubbles } = fake({ pos: { x: 5, y: 1, z: 6 } }); const head = { head: () => ({ x: 9, y: 9, z: 9 }) };
  const down = B.levelUp('milk', { down: true }); assert.equal(down.down, true);
  tl.play([B.levelUp(member), down, B.levelUp(head, { text: 'Lv.3' })], ctx);
  tl.update(0); assert.deepEqual(bubbles.levels[0].head(), { x: 5, y: 1.5, z: 6 }); assert.deepEqual(bubbles.levels[0].opts, { text: 'LEVEL UP', down: false });
  tl.update(1); assert.deepEqual(bubbles.levels[1].head(), { item: 'milk', x: 1, y: 2, z: 3 }); assert.deepEqual(bubbles.levels[1].opts, { text: 'LEVEL DOWN', down: true });
  tl.update(1); assert.deepEqual(bubbles.levels[2].head(), { x: 9, y: 9, z: 9 }); assert.equal(bubbles.levels[2].opts.text, 'Lv.3');
  assert.equal(bubbles.levels.length, 3);
});
test('bubble shows over the target and is cancelled when the beat ends; a dotted key resolves to the part', () => {
  const { ctx, tl, bubbles, objects } = fake({ parts: ['typhoon.main'] }); objects.get('typhoon.main').position.set(1, 2, 3);
  tl.play([B.bubble(partHead('typhoon.main', 3.9, ctx), '……'), B.bubble('typhoon.main', '！', 0.5)], ctx); tl.update(0);
  assert.equal(bubbles.shown[0].kind, '……'); assert.equal(bubbles.shown[0].dur, 1.2); assert.deepEqual(bubbles.shown[0].head(), { x: 1, y: 5.9, z: 3 });
  tl.update(1.2); assert.equal(bubbles.cancelled, 1); assert.deepEqual(bubbles.shown[1].head(), { x: 1, y: 2, z: 3 });
  tl.skip(); assert.equal(bubbles.cancelled, 2);
});
test('trainStop speeds the clock up to 3× to arrive within 4 s, holds 3 s, then resumes; no train → skipped', () => {
  const { ctx, tl, rail } = fake({ parts: ['token.train'] }); rail.offset = 0;
  ctx.now = (STATION_A - Math.PI) / 0.35;   // 車頭現在在站的對面（差 π rad，照 0.35 rad/s 要 8.98 s → 加速 2.24× 剛好 4 s 進站）
  tl.play([B.trainStop()], ctx); tl.update(0);
  assert.ok(Math.abs(tl.currentDur - (TRAIN_ARRIVE + TRAIN_STOP)) < 1e-6);
  for (let i = 0; i < 40; i++) { ctx.now += 0.1; tl.update(0.1); }
  const a = ((ctx.now + rail.offset) * 0.35 - STATION_A) % (2 * Math.PI); assert.ok(Math.abs(a) < 0.05 || Math.abs(a - 2 * Math.PI) < 0.05, 'head at the station after 4 s');
  const o = rail.offset; ctx.now += 1; tl.update(1); assert.ok(Math.abs(rail.offset - (o - 1)) < 1e-6, 'held: offset falls as fast as time rises');
  const far = fake({ parts: ['token.train'] }); far.ctx.now = (STATION_A - 1.9 * Math.PI) / 0.35; far.tl.play([B.trainStop()], far.ctx); far.tl.update(0);
  assert.ok(Math.abs(far.tl.currentDur - (1.9 * Math.PI / 0.35 / 3 + 3)) < 1e-6, 'capped at 3×');
  const none = fake({ parts: [] }); none.tl.play([B.trainStop(), B.wait(0.1)], none.ctx); none.tl.update(0); assert.equal(none.tl.currentKind, 'wait');
});
test('trainStop during: beats start at arrival in order; the train still leaves after stop; skip starts and ends them', () => {
  const { ctx, tl, rail } = fake({ parts: ['token.train'] }); rail.offset = 0;
  ctx.now = (STATION_A - 0.35) / 0.35;   // 差 0.35 rad → 1 s 到站
  const log = [], sub = (name, dur) => ({ kind: name, dur, start: () => log.push(`${name}+`), end: () => log.push(`${name}-`) });
  tl.play([B.trainStop({ stop: 1, during: [sub('a', 0.5), sub('b', 2)] })], ctx); tl.update(0);
  assert.ok(Math.abs(tl.currentDur - (1 + 2.5)) < 1e-6, 'lasts until during is done');
  const tick = () => { ctx.now += 0.1; tl.update(0.1); };
  for (let i = 0; i < 9; i++) tick(); assert.deepEqual(log, [], 'nothing before arrival');
  tick(); tick(); assert.deepEqual(log, ['a+']);
  for (let i = 0; i < 5; i++) tick(); assert.deepEqual(log, ['a+', 'a-', 'b+']);
  let o = rail.offset; tick(); assert.ok(Math.abs(rail.offset - (o - 0.1)) < 1e-6, 'held inside stop');
  for (let i = 0; i < 5; i++) tick(); o = rail.offset; tick(); assert.ok(Math.abs(rail.offset - o) < 1e-6, 'running again after stop 1 s');
  const s2 = fake({ parts: ['token.train'] }), log2 = []; s2.ctx.now = 3;
  s2.tl.play([B.trainStop({ during: [{ kind: 'x', dur: 1, start: () => log2.push('x+'), end: () => log2.push('x-') }] })], s2.ctx); s2.tl.skip();
  assert.deepEqual(log2, ['x+', 'x-']);
});
test('trainStop skipped changes nothing; trainDepart puts the head 0.6 rad behind the station', () => {
  const { ctx, tl, rail } = fake({ parts: ['token.train'] }); rail.offset = 2; ctx.now = 10;
  tl.play([B.trainStop()], ctx); tl.skip(); assert.equal(rail.offset, 2);
  tl.play([B.trainDepart()], ctx); tl.update(0);
  assert.ok(Math.abs((ctx.now + rail.offset) * 0.35 - (STATION_A - 0.6)) < 1e-9); assert.ok(!tl.busy);
  const none = fake({ parts: [] }); none.rail.offset = 5; none.tl.play([B.trainDepart()], none.ctx); none.tl.update(0); assert.equal(none.rail.offset, 5);
});
test('jump follows a moving target along a parabola and lands on it', () => {
  const { ctx, tl, member } = fake({ pos: { x: 0, y: 1, z: 0 } });
  let x = 0, seen = null; const target = cx => { seen = cx; x += 0.1; return { x, y: 1, z: 0, yaw: 0.5 }; };
  tl.play([B.jump(member, target)], ctx); tl.update(0); assert.equal(member.mode, 'script');
  tl.update(0.25); assert.equal(seen, ctx, 'target(ctx)'); assert.ok(member.pos.y > 1.5, `mid-air: ${member.pos.y}`); assert.ok(member.pos.x > 0);
  tl.skip(); assert.equal(member.pos.y, 1); assert.ok(Math.abs(member.pos.x - x) < 1e-9, 'lands on the latest target'); assert.equal(member.yaw, 0.5);
});
test('move and scaleIn animate the part object and snap on skip', () => {
  const { ctx, tl, objects } = fake({ parts: ['typhoon.main', 'token.track'] }); const cloud = objects.get('typhoon.main'), track = objects.get('token.track');
  cloud.position.set(1, 2, 3);
  tl.play([B.move('typhoon.main', { from: { dx: -6, dz: -5 }, to: 0, dur: 2 }), B.scaleIn('token.track', { dur: 1 })], ctx);
  tl.update(0); assert.deepEqual(cloud.position.toArray(), [-5, 2, -2]);
  tl.update(1); assert.ok(Math.abs(cloud.position.x - -2) < 1e-9 && Math.abs(cloud.position.z - 0.5) < 1e-9);
  tl.update(1); assert.deepEqual(cloud.position.toArray(), [1, 2, 3]); assert.equal(track.scale.y, 1e-3);
  tl.update(0.5); assert.ok(Math.abs(track.scale.y - 0.5) < 1e-9);
  tl.skip(); assert.equal(track.scale.y, 1);
  tl.play([B.move('typhoon.main', { to: { dy: 1 }, dur: 1 })], ctx); tl.skip(); assert.deepEqual(cloud.position.toArray(), [1, 3, 3]);
  tl.play([B.move('typhoon.main', { from: { dy: 1 }, to: { dx: 2 }, dur: 1 })], ctx); tl.skip(); assert.deepEqual(cloud.position.toArray(), [3, 2, 3], 'offsets compose from the base');
  tl.play([B.move('nope', { to: { dx: 1 }, dur: 1 }), B.wait(0.1)], ctx); tl.update(0); assert.equal(tl.currentKind, 'wait');
});
test('tilt, hideParts and showParts set the part object', () => {
  const { ctx, tl, objects } = fake({ parts: ['boba.cart', 'rat.pack'] });
  tl.play([B.tilt('boba.cart'), B.hideParts(['rat.pack'])], ctx); tl.update(0); tl.update(0.15);
  assert.ok(Math.abs(objects.get('boba.cart').rotation.z - 0.125) < 1e-9);
  tl.update(0.15); assert.equal(objects.get('boba.cart').rotation.z, 0.25); assert.equal(objects.get('rat.pack').visible, false);
  tl.play([B.showParts(['rat.pack', 'missing'])], ctx); tl.update(0); assert.equal(objects.get('rat.pack').visible, true);
});
test('gesture drives the walker gesture for people, the holder for models, the part scale for a puff', () => {
  const { ctx, tl, member, objects, roster } = fake({ pos: { x: 0, y: 0, z: 0 }, parts: ['typhoon.main'] });
  tl.play([B.gesture(member, 'look', { at: { x: 1, y: 0, z: 0 } })], ctx); tl.update(0); tl.update(0.3);
  assert.equal(member.walker.gesture.kind, 'look'); assert.ok(Math.abs(member.walker.gesture.k - 0.5) < 1e-9); assert.ok(Math.abs(member.walker.gesture.yaw - Math.PI / 2) < 1e-9);
  tl.skip(); assert.equal(member.walker.gesture, null); assert.ok(Math.abs(member.yaw - Math.PI / 2) < 1e-9, 'keeps looking that way');
  const rat = { ...member, kind: 'model', walker: undefined, holder: new THREE.Group(), yaw: 1, pos: { x: 0, y: 2, z: 0 } }; rat.head = () => rat.pos;
  tl.play([B.gesture(rat, 'jump', 1)], ctx); tl.update(0); assert.ok(roster.claimed.includes(rat), 'claimed so the idle pose leaves it alone'); tl.update(0.5); assert.ok(Math.abs(rat.holder.position.y - 2.4) < 1e-9); assert.equal(rat.holder.position.x, 0);
  tl.skip(); assert.equal(rat.holder.position.y, 2);
  tl.play([B.gesture(rat, 'sniff')], ctx); tl.update(0); tl.update(1.5 / 8); assert.ok(Math.abs(rat.holder.rotation.y - 1.3) < 1e-9); tl.skip(); assert.equal(rat.holder.rotation.y, 1);
  const cloud = objects.get('typhoon.main');
  tl.play([B.gesture('typhoon.main', 'puff')], ctx); tl.update(0); tl.update(0.4); assert.ok(Math.abs(cloud.scale.x - 1.15) < 1e-9);
  tl.skip(); assert.equal(cloud.scale.x, 1);
  tl.play([B.gesture('typhoon.gone', 'puff'), B.wait(0.1)], ctx); tl.update(0); assert.equal(tl.currentKind, 'wait', 'missing part → skipped');
});
test('camera home/pan and world pass through to rig and ctx.world; instant camera uses 0 ms', () => {
  const { ctx, tl, rig } = fake(); const p = { x: 1, y: 0, z: 2 };
  tl.play([B.camera(p), B.camera('home')], ctx); tl.update(0); assert.equal(tl.currentDur, 1); assert.deepEqual(rig.calls[0], ['panTo', p, 1000]);
  tl.update(1); assert.deepEqual(rig.calls[1], ['home', 1000]); tl.skip();
  ctx.instant = true; tl.play([B.camera(p), B.world({ storm: true })], ctx); tl.skip();
  assert.deepEqual(rig.calls[2], ['panTo', p, 0]); assert.deepEqual(ctx.worlds, [[{ storm: true }, true]]);
});
test('spawn takes a held member out with a flash; home hands members back to the roster', () => {
  const { ctx, tl, member, roster } = fake(); const at = { x: 1, y: 0.6, z: 1 };
  const sp = B.spawn('milk.kids', at); tl.play([sp, B.home([() => sp.member, member])], ctx); tl.update(0);
  assert.equal(tl.currentDur, 0.5); assert.deepEqual(sp.member.pos, at);
  tl.update(0.5); assert.deepEqual(roster.homed, [sp.member, member]); assert.ok(!tl.busy);
});
test('seat and trainHead follow the train clock', () => {
  const { ctx } = fake({ parts: ['token.train'] }); ctx.now = 3; ctx.rail.offset = 1; ctx.stage.lv.token = 3;
  const s = B.seat(1, ctx)(), h = B.trainHead(ctx).head();
  const a = 4 * 0.35, ar = a - 0.6 / 8.3;   // 5 節車的第 1 個座位在第 2 節（SEATS[5][1] = [1, 0]）
  assert.ok(Math.abs(s.x - Math.cos(ar) * 8.3) < 1e-9 && Math.abs(s.z - Math.sin(ar) * 8.3) < 1e-9);
  assert.ok(Math.abs(h.x - Math.cos(a) * 8.3) < 1e-9 && Math.abs(h.z - Math.sin(a) * 8.3) < 1e-9 && h.y > s.y);
});
