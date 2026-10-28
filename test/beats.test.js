// test/beats.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createNav } from '../src/show/nav.js';
import { createTimeline } from '../src/show/timeline.js';
import { axialToWorld, cellTop } from '../src/scene/hex.js';
import { createPeople } from '../src/scene/people.js';
import { createBlink, BLINK } from '../src/show/blink.js';
installFakeDom();
const { B, STATION_A, TRAIN_ARRIVE, TRAIN_STOP, TRAIN_MAX_BOOST, FOCUS_BEAT, SPUR_BRAKE, partHead } = await import('../src/show/beats.js');
const { GAP } = await import('../src/actors/token.js');

const c = cell => ({ ...axialToWorld(...cell), y: cellTop(cell) });
const ev = { kind: 'grow', item: 'milk' };

// 假 ctx：真 nav、真 timeline、真 blink；假 roster／stage／bubbles／rig 記錄呼叫（假舞台的 commit 不閃白：閃白是真舞台的事）。
// tl.update 先推閃白再推時間軸（和 show 的每幀順序一樣：這一幀才開始的閃白下一幀才開始走）
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
    focus: [], setFocus: cells => roster.focus.push(cells),
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
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 4 }) });
  const rig = {
    calls: [], grabbed: false, home: ms => rig.calls.push(['home', ms]),
    focus: (p, opts) => rig.calls.push(['focus', p, opts]),
  };
  const rail = { offset: 0 }, worlds = [];
  const ctx = { stage, roster, nav, bubbles, blink, rig, rail, world: (e, instant) => worlds.push([e, instant]), instant: false, now: 0, B, worlds };
  const inner = createTimeline(), tl = Object.create(inner);
  tl.update = dt => { blink.update(dt); inner.update(dt); };
  return { ctx, tl, member, stage, blink, rail, roster, bubbles, rig, objects };
}

test('walk computes its duration from the route and the walk speed, moves the member along, ends at the target', () => {
  const { ctx, tl, member } = fake({ pos: c([-1, 1]) }); const to = c([-1, 0]);
  tl.play([B.walk(member, to)], ctx); tl.update(0);
  const len = ctx.nav.routeLength(ctx.nav.route(c([-1, 1]), to)); assert.ok(Math.abs(tl.currentDur - len / 1.6) < 1e-6);
  tl.update(0.5); assert.ok(member.walking && ctx.nav.walkable(member.pos.x, member.pos.z));
  tl.skip(); assert.ok(Math.hypot(member.pos.x - to.x, member.pos.z - to.z) < 1e-6 && !member.walking);
});
// 裁決 R14：躲進門裡（hidden）的人不被劇本拉出來——walk、gesture、bubble、jump 對藏起來的成員直接跳過（0 秒、不 claim、不動）
test('walk, gesture, bubble and jump skip a hidden member: no time, not claimed, not moved', () => {
  const { ctx, tl, member, roster, bubbles } = fake({ pos: c([-1, 1]) }); const at = { ...member.pos };
  member.hidden = true;
  for (const b of [B.walk(member, c([-1, 0])), B.gesture(member, 'wave'), B.bubble(member, '！'), B.jump(member, () => c([-1, 0]))]) {
    assert.equal(b.start(ctx), false, `${b.kind} skipped`); assert.equal(b.estimate?.(ctx) ?? 0, 0, `${b.kind} estimate`);
  }
  tl.play([B.walk(member, c([-1, 0])), B.bubble(member, '！')], ctx); tl.update(0); tl.update(0.1);
  assert.equal(tl.busy, false, 'nothing to play');
  assert.equal(roster.claimed.length, 0); assert.deepEqual(member.pos, at); assert.equal(bubbles.shown.length, 0);
});
// 裁決 R15：倍速由時間軸統一換算（ctx.speed 2；選擇帶動升級之後演出恆為 1，換算留著）——走路自己不加倍，estimate 是演出時間、真實秒數減半
test('walk at double speed (timeline ctx.speed 2); an empty route takes no time', () => {
  const { ctx, tl, member, roster } = fake({ pos: c([-1, 1]) }); const to = c([-1, 0]);
  const len = ctx.nav.routeLength(ctx.nav.route(c([-1, 1]), to));
  ctx.speed = 2; const w = B.walk(() => member, () => to);
  assert.ok(Math.abs(w.estimate(ctx) - len / 1.6) < 1e-6, 'estimate in show time'); assert.equal(roster.claimed.length, 0, 'estimate leaves the member alone');
  tl.play([w], ctx); tl.update(0); assert.ok(Math.abs(tl.currentDur - len / 3.2) < 1e-6, 'half the real seconds'); assert.equal(member.mode, 'script');
  const p0 = { ...member.pos }; tl.update(0.1); assert.ok(Math.abs(Math.hypot(member.pos.x - p0.x, member.pos.z - p0.z) - 0.1 * 3.2) < 0.05, 'covers 3.2 per real second');
  tl.skip();
  const r = ctx.nav.route(c([-1, 1]), to), [p, q] = r.slice(-2);
  assert.ok(Math.abs(member.yaw - Math.atan2(q.x - p.x, q.z - p.z)) < 1e-9, 'faces along the last segment');
  const still = fake({ pos: c([0, 0]) }); still.tl.play([B.walk(still.member, c([0, 0])), B.wait(0.1)], still.ctx); still.tl.update(0);
  assert.equal(still.tl.currentKind, 'wait'); assert.ok(!still.member.walking);
});
test('walk { delay } stands still (claimed) for the delay, then walks; dur and estimate include the delay', () => {
  const { ctx, tl, member } = fake({ pos: c([-1, 1]) }); const to = c([-1, 0]), p0 = { ...member.pos };
  const len = ctx.nav.routeLength(ctx.nav.route(c([-1, 1]), to)), w = B.walk(member, to, { delay: 0.3 });
  assert.ok(Math.abs(w.estimate(ctx) - (0.3 + len / 1.6)) < 1e-6);
  tl.play([w], ctx); tl.update(0); assert.ok(Math.abs(tl.currentDur - (0.3 + len / 1.6)) < 1e-6); assert.equal(member.mode, 'script');
  tl.update(0.2); assert.deepEqual(member.pos, p0); assert.ok(!member.walking, 'still waiting');
  tl.update(0.3); assert.ok(member.walking && Math.abs(Math.hypot(member.pos.x - p0.x, member.pos.z - p0.z) - 0.2 * 1.6) < 0.05, 'walked only the time past the delay');
  tl.skip(); assert.ok(Math.hypot(member.pos.x - to.x, member.pos.z - to.z) < 1e-6 && !member.walking);
});
// §13.2：apply 不再放白光，舞台 pending 的鍵依序（間隔 0.15 s）commit，commit 由舞台自己閃白 BLINK 秒；拍長 BLINK + 0.15·(n−1)
test('apply defers the stage change and commits each key 0.15 s apart; it lasts BLINK + 0.15·(n−1)', () => {
  const { ctx, tl, stage, blink } = fake({ changed: ['a', 'b', 'c'] });
  tl.play([B.apply(ev)], ctx); tl.update(0); assert.deepEqual(stage.calls[0], ['apply', ev, { deferred: true }]);
  assert.ok(Math.abs(tl.currentDur - (0.15 + 0.15 * 2)) < 1e-9); assert.deepEqual(stage.committed, ['a']);
  tl.update(0.15); assert.deepEqual(stage.committed, ['a', 'b']); tl.update(0.15); assert.deepEqual(stage.committed, ['a', 'b', 'c']);
  assert.ok(!stage.committedAll); assert.equal(blink.count, 0, 'the beat itself blinks nothing');
  tl.update(0.16); assert.ok(stage.committedAll); assert.ok(ctx.nav.footprintsSet); assert.ok(!tl.busy);
  const one = fake({ changed: ['a'] }); one.tl.play([B.apply(ev)], one.ctx); one.tl.update(0); assert.equal(one.tl.currentDur, BLINK);
});
// 大停電（選擇帶動升級）：stagger 0 → 全部同一刻 commit，拍長 BLINK；turn.js 的停電反應用它
test('apply { stagger: 0 } commits every key at once and lasts BLINK; the blackout reaction uses it', async () => {
  const { ctx, tl, stage } = fake({ changed: ['a', 'b', 'c'] });
  tl.play([B.apply(ev, { stagger: 0 })], ctx); tl.update(0);
  assert.equal(tl.currentDur, BLINK); assert.deepEqual(stage.committed, ['a', 'b', 'c']);
  const { buildTurn } = await import('../src/show/turn.js');
  const beats = buildTurn([{ kind: 'fx', item: 'milk', cause: 'typhoon', flag: { name: 'blackout', value: true }, delta: { target: 'milk', from: 5, to: 4 } }], { modules: [], spec: {}, lv: {}, flags: {}, meta: {} }, {});
  const f = fake({ changed: ['a', 'b', 'c'] }), ap = beats.find(b => b.kind === 'apply');
  f.tl.play([ap], f.ctx); f.tl.update(0); assert.equal(f.tl.currentDur, BLINK, 'the blackout blinks out all at once');
});
test('apply, skipped, commits everything at once', () => {
  const { ctx, tl, stage } = fake({ changed: ['a', 'b'] });
  tl.play([B.apply(ev)], ctx); tl.skip(); assert.ok(stage.committedAll); assert.ok(ctx.nav.footprintsSet); assert.ok(!tl.busy);
});
test('apply steps only the keys the stage holds pending; roster keys take no time', () => {
  const { ctx, tl, stage } = fake({ changed: ['a', { key: 'milk.kids', roster: true }] });
  tl.play([B.apply(ev), B.wait(0.1)], ctx); tl.update(0); assert.equal(tl.currentDur, BLINK, 'roster key adds no stagger');
  assert.deepEqual(stage.committed, ['a']); tl.update(0.16); assert.equal(tl.currentKind, 'wait');
  const only = fake({ changed: [{ key: 'milk.kids', roster: true }] });
  only.tl.play([B.apply(ev, { hold: ['milk.kids'] }), B.wait(0.1)], only.ctx); only.tl.update(0);
  assert.equal(only.tl.currentKind, 'wait'); assert.ok(only.stage.committedAll); assert.ok(only.ctx.nav.footprintsSet);
});
// 閃白在零件本身：島心的零件（軌道、列車、衛星島的 sat.boats）跟別的零件一樣依序 commit
test('parts at the island centre are committed in turn like any other', () => {
  const O = { x: 0, y: 0, z: 0 };
  const { ctx, tl, stage } = fake({ changed: [{ key: 'token.track', at: O }, { key: 'sat.boats', at: { x: 0, y: -0.2, z: 0 } }] });
  tl.play([B.apply(ev)], ctx); tl.update(0); assert.ok(Math.abs(tl.currentDur - 0.3) < 1e-9);
  tl.update(0.15); assert.deepEqual(stage.committed, ['token.track', 'sat.boats']);
});
// 估長度（estimateTurn、trainStop 的 during）：閃白的 apply 至少一個零件
test('apply estimates one blink when blinking and nothing without', () => {
  const { ctx } = fake();
  assert.equal(B.apply(ev).estimate(ctx), BLINK); assert.equal(B.apply(ev, { blink: false }).estimate(ctx), 0);
});
test('apply without blink is instant; only and hold are passed through', () => {
  const { ctx, tl, stage } = fake({ changed: ['x'] });
  tl.play([B.apply(ev, { blink: false, only: ['x'], hold: ['y'] }), B.wait(0.1)], ctx); tl.update(0);
  assert.deepEqual(stage.calls[0][2], { only: ['x'], hold: ['y'], deferred: false });
  assert.equal(tl.currentKind, 'wait'); assert.deepEqual(stage.committed, []); assert.ok(stage.committedAll); assert.ok(ctx.nav.footprintsSet);
});
// only 可以是 ctx => 鍵陣列：演到這拍（start）才算（劇本建拍時還不知道角色到時候站哪）
test('apply resolves a lazy only at start, not when the beat is built', () => {
  const { ctx, tl, stage } = fake({ changed: ['x'] });
  let pick = ['a'];
  const beat = B.apply(ev, { blink: false, only: c => (assert.equal(c, ctx), pick) });
  pick = ['x'];
  tl.play([beat, B.wait(0.1)], ctx); tl.update(0);
  assert.deepEqual(stage.calls[0][2], { only: ['x'], deferred: false });
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
// 進站有減速（審稿：晶片 Lv7 一幀停下）：等速趕路後最後 SPUR_BRAKE 秒線性減到 0，所以到站時間多 SPUR_BRAKE / 2
test('trainStop speeds the clock up (at most 4.5×) to arrive within 4 s (+ half the brake), holds 3 s, then resumes; no train → skipped', () => {
  const { ctx, tl, rail } = fake({ parts: ['token.train'] }); rail.offset = 0;
  ctx.now = (STATION_A - Math.PI) / 0.35;   // 車頭現在在站的對面（差 π rad，照 0.35 rad/s 要 8.98 s → 加速 2.24× 剛好 4 s 進站）
  tl.play([B.trainStop()], ctx); tl.update(0);
  assert.ok(Math.abs(tl.currentDur - (TRAIN_ARRIVE + SPUR_BRAKE / 2 + TRAIN_STOP)) < 1e-6);
  for (let i = 0; i < 43; i++) { ctx.now += 0.1; tl.update(0.1); }
  const a = ((ctx.now + rail.offset) * 0.35 - STATION_A) % (2 * Math.PI); assert.ok(Math.abs(a) < 0.05 || Math.abs(a - 2 * Math.PI) < 0.05, 'head at the station after 4.3 s');
  const o = rail.offset; ctx.now += 1; tl.update(1); assert.ok(Math.abs(rail.offset - (o - 1)) < 1e-6, 'held: offset falls as fast as time rises');
  const far = fake({ parts: ['token.train'] }); far.ctx.now = (STATION_A - 1.9 * Math.PI) / 0.35; far.tl.play([B.trainStop()], far.ctx); far.tl.update(0);
  assert.ok(Math.abs(far.tl.currentDur - (TRAIN_ARRIVE + SPUR_BRAKE / 2 + TRAIN_STOP)) < 1e-6, 'just missed the train (1.9π away, 4.26×): still in by 4.3 s');
  assert.ok(TRAIN_MAX_BOOST * TRAIN_ARRIVE >= 2 * Math.PI / 0.35, 'the cap covers a full lap');
  const none = fake({ parts: [] }); none.tl.play([B.trainStop(), B.wait(0.1)], none.ctx); none.tl.update(0); assert.equal(none.tl.currentKind, 'wait');
});
test('trainStop brakes into the station: never above the cap, slows to a stop over the last frames (no one-frame stop), even at 1×', () => {
  for (const away of [1.9 * Math.PI, 0.5]) {   // 剛開走（趕路 4.26×）、快到站（原速）
    const { ctx, tl, rail } = fake({ parts: ['token.train'] }); rail.offset = 0; ctx.now = (STATION_A - away) / 0.35;
    tl.play([B.trainStop()], ctx); tl.update(0);
    const rates = [];
    for (let i = 0; i < 200 && tl.busy; i++) { const o = rail.offset; ctx.now += 1 / 30; tl.update(1 / 30); rates.push(1 + (rail.offset - o) * 30); }
    const held = rates.findIndex(r => Math.abs(r) < 1e-6);
    assert.ok(Math.max(...rates) <= TRAIN_MAX_BOOST + 1e-6, `${away}: max ${Math.max(...rates).toFixed(2)}×`);
    assert.ok(held > 3, `${away}: holds`);
    for (let j = held - 3; j < held; j++) assert.ok(rates[j] < rates[j - 1] + 1e-9 && rates[held - 1] < 0.35, `${away}: decelerating into the stop (${rates.slice(held - 4, held + 1).map(r => r.toFixed(2))})`);
  }
});
test('trainStop during: beats start at arrival in order; the train still leaves after stop; skip starts and ends them', () => {
  const { ctx, tl, rail } = fake({ parts: ['token.train'] }); rail.offset = 0;
  ctx.now = (STATION_A - 0.35) / 0.35;   // 差 0.35 rad → 1 s 的路，減速進站多 SPUR_BRAKE / 2 → 1.3 s 到站
  const log = [], sub = (name, dur) => ({ kind: name, dur, start: () => log.push(`${name}+`), end: () => log.push(`${name}-`) });
  tl.play([B.trainStop({ stop: 1, during: [sub('a', 0.5), sub('b', 2)] })], ctx); tl.update(0);
  assert.ok(Math.abs(tl.currentDur - (1 + SPUR_BRAKE / 2 + 2.5)) < 1e-6, 'lasts until during is done');
  const tick = () => { ctx.now += 0.1; tl.update(0.1); };
  for (let i = 0; i < 12; i++) tick(); assert.deepEqual(log, [], 'nothing before arrival');
  tick(); tick(); assert.deepEqual(log, ['a+']);
  for (let i = 0; i < 5; i++) tick(); assert.deepEqual(log, ['a+', 'a-', 'b+']);
  let o = rail.offset; tick(); assert.ok(Math.abs(rail.offset - (o - 0.1)) < 1e-6, 'held inside stop');
  for (let i = 0; i < 10; i++) tick(); o = rail.offset; tick(); assert.ok(Math.abs(rail.offset - o) < 1e-6, 'running again at full speed after stop 1 s and the pull-away');
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
  // 模型 look：慢慢轉向目標（最短轉角），演完一直朝那邊
  tl.play([B.gesture(rat, 'look', { at: { x: 0, y: 2, z: -1 } })], ctx); tl.update(0); tl.update(0.3);
  assert.ok(Math.abs(rat.holder.rotation.y - (1 + (Math.PI - 1) / 2)) < 1e-9, 'halfway round'); tl.skip(); assert.ok(Math.abs(rat.yaw - Math.PI) < 1e-9);
  const cloud = objects.get('typhoon.main');
  tl.play([B.gesture('typhoon.main', 'puff')], ctx); tl.update(0); tl.update(0.4); assert.ok(Math.abs(cloud.scale.x - 1.15) < 1e-9);
  tl.skip(); assert.equal(cloud.scale.x, 1);
  tl.play([B.gesture('typhoon.gone', 'puff'), B.wait(0.1)], ctx); tl.update(0); assert.equal(tl.currentKind, 'wait', 'missing part → skipped');
});
test('world passes through to ctx.world (instant flag included); the old camera beat is gone', () => {
  const { ctx, tl } = fake();
  ctx.instant = true; tl.play([B.world({ storm: true })], ctx); tl.skip();
  assert.deepEqual(ctx.worlds, [[{ storm: true }, true]]);
  assert.equal(B.camera, undefined, 'camera beat replaced by focus (plan 3.8)');
});
// §13.1 鏡頭跟主線：focus 平移拉近到格子中心 1 秒、名冊只讓那一格的人做日常；拖過鏡頭就跳過（0 秒）；home 一定回全景
test('focus pans to the cell centre at zoom 0.6 (1 s flight, 0.8 s beat) and narrows the roster focus; grabbed skips it; mid-turn home respects it, the final home always runs', () => {
  const { ctx, tl, rig, roster } = fake();
  tl.play([B.focus([1, 0])], ctx); tl.update(0);
  assert.equal(FOCUS_BEAT, 0.8); assert.equal(tl.currentDur, FOCUS_BEAT); assert.deepEqual(rig.calls[0], ['focus', c([1, 0]), { zoom: 0.6, ms: 1000 }]); assert.deepEqual(roster.focus, [[[1, 0]]]);
  tl.skip();
  // 點：格子由點算；zoom 照傳
  const p = { x: c([0, 1]).x + 0.5, y: 0.65, z: c([0, 1]).z };
  tl.play([B.focus(p, { zoom: 0.8 })], ctx); tl.update(0);
  assert.deepEqual(rig.calls[1], ['focus', p, { zoom: 0.8, ms: 1000 }]); assert.deepEqual(roster.focus.at(-1), [[0, 1]]); tl.skip();
  // 物品 id：那個物品的格子
  tl.play([B.focus('baseball')], ctx); tl.update(0); assert.deepEqual(rig.calls[2], ['focus', c([-1, 1]), { zoom: 0.6, ms: 1000 }]); tl.skip();
  // 拖過鏡頭：不動、不佔時間（名冊焦點照樣跟著主線）
  rig.grabbed = true; let ended = false;
  tl.play([B.focus([0, 0])], ctx).then(() => { ended = true; }); tl.update(0);
  assert.equal(rig.calls.length, 3); assert.equal(tl.busy, false); assert.deepEqual(roster.focus.at(-1), [[0, 0]]);
  // 回合中途的 home（R13）：拖過就不動鏡頭（名冊照樣全部恢復）；回合最後的 final home 拖過也照回。都不佔時間
  tl.play([B.focus('home')], ctx); tl.update(0);
  assert.equal(tl.busy, false); assert.equal(rig.calls.length, 3, 'mid-turn home leaves a dragged camera alone'); assert.equal(roster.focus.at(-1), null);
  tl.play([B.focus('home', { final: true })], ctx); tl.update(0);
  assert.equal(tl.busy, false); assert.deepEqual(rig.calls[3], ['home', 1000]); assert.equal(roster.focus.at(-1), null);
  ctx.instant = true; rig.grabbed = false; tl.play([B.focus([0, 0]), B.focus('home')], ctx); tl.skip();
  assert.deepEqual(rig.calls.slice(4), [['focus', c([0, 0]), { zoom: 0.6, ms: 0 }], ['home', 0]], 'instant uses 0 ms');
  return Promise.resolve().then(() => assert.ok(ended));
});
// 計畫 3.8 Task 5：target 可以是 ctx => 目標（演到才算：主角到時候在哪一格）；回 null 這拍跳過、不佔時間
test('focus with a function target resolves it when the beat starts; null skips the beat', () => {
  const { ctx, tl, rig, roster } = fake(); let cell = null; const seen = [];
  const f = B.focus(cx => { seen.push(cx); return cell; });
  assert.equal(f.kind, 'focus');
  tl.play([f], ctx); tl.update(0);
  assert.deepEqual(seen, [ctx]); assert.equal(rig.calls.length, 0); assert.equal(tl.busy, false, 'null → skipped');
  cell = [0, 1]; tl.play([f], ctx); tl.update(0);
  assert.equal(tl.currentDur, FOCUS_BEAT); assert.deepEqual(rig.calls[0], ['focus', c([0, 1]), { zoom: 0.6, ms: 1000 }]); assert.deepEqual(roster.focus.at(-1), [[0, 1]]);
  tl.skip();
});
// trainStop 的 during 長度在 start 前就要估：together 取子拍估計的最長（不估成 0，不然車開走時還沒走完的人被瞬移到終點）
test('trainStop during: a together sub-beat counts as its longest child', () => {
  const { ctx, tl, rail } = fake({ parts: ['token.train'] }); rail.offset = 0;
  ctx.now = (STATION_A - 0.35) / 0.35;   // 1 s 的路（減速進站 1.3 s 到站）
  const sub = dur => ({ kind: 'x', dur });
  tl.play([B.trainStop({ stop: 1, during: [sub(0.5), B.together([sub(2), sub(0.8)])] })], ctx); tl.update(0);
  assert.ok(Math.abs(tl.currentDur - (1 + SPUR_BRAKE / 2 + 2.5)) < 1e-6, `lasts until the together is done (${tl.currentDur})`);
  tl.skip();
});
// §13.2：spawn 不閃、不佔時間（之後由 walk 帶進場）
test('spawn takes a held member out at once without a blink; home hands members back to the roster', () => {
  const { ctx, tl, member, roster, blink } = fake(); const at = { x: 1, y: 0.6, z: 1 };
  const sp = B.spawn('milk.kids', at); assert.equal(sp.dur, 0);
  tl.play([sp, B.home([() => sp.member, member])], ctx); tl.update(0);
  assert.deepEqual(sp.member.pos, at); assert.equal(blink.count, 0);
  assert.deepEqual(roster.homed, [sp.member, member]); assert.ok(!tl.busy);
});
test('seat and trainHead follow the train clock', () => {
  const { ctx } = fake({ parts: ['token.train'] }); ctx.now = 3; ctx.rail.offset = 1; ctx.stage.lv.token = 5;
  const s = B.seat(1, ctx)(), h = B.trainHead(ctx).head();
  const a = 4 * 0.35, ar = a - GAP / 8.3;   // 5 節車的第 1 個座位在第 2 節（SEATS[5][1] = [1, 0]）
  assert.ok(Math.abs(s.x - Math.cos(ar) * 8.3) < 1e-9 && Math.abs(s.z - Math.sin(ar) * 8.3) < 1e-9);
  assert.ok(Math.abs(h.x - Math.cos(a) * 8.3) < 1e-9 && Math.abs(h.z - Math.sin(a) * 8.3) < 1e-9 && h.y > s.y);
});
// 最終審查修正（§14.1）：劇本的走路走到一半，路上長出建築（夜市在電工走最後一段時開張）——從現在的位置重新找路繞過去，
// 拍長不變（照原本的時間走到，繞路那一段走快一點），不照舊路穿過新建築
test('a walk whose route is cut by a new footprint replans around it and still ends on time', () => {
  const o = c([0, 0]), from = { x: o.x - 1.5, y: o.y, z: o.z + 0.4 }, to = { x: o.x + 1.5, y: o.y, z: o.z + 0.4 };
  const { ctx, tl, member } = fake({ pos: from });
  let done = false; tl.play([B.walk(member, to)], ctx).then(() => { done = true; }); tl.update(0);
  const dur = tl.currentDur;
  for (let i = 0; i < 9; i++) tl.update(1 / 30);
  ctx.nav.setFootprints([{ x: o.x, z: o.z + 0.4, w: 0.4, d: 0.8 }]);
  let t = 0.3;
  for (let i = 0; i < 200 && tl.busy; i++) {
    tl.update(1 / 30); t += 1 / 30;
    assert.ok(!ctx.nav.inFootprint(member.pos.x, member.pos.z), `frame ${i} inside at ${member.pos.x.toFixed(2)},${member.pos.z.toFixed(2)}`);
  }
  assert.ok(Math.abs(t - dur) <= 1 / 30 + 1e-6, `ends on time (${t.toFixed(2)} vs ${dur.toFixed(2)})`);
  assert.ok(Math.hypot(member.pos.x - to.x, member.pos.z - to.z) < 1e-6, 'arrives');
});
// 裁決 R15：倍速（ctx.speed 2；演出現在恆為 1，換算留著）——交給真實時間在跑的東西自己換算：泡泡、LEVEL UP、鏡頭飛行縮短；列車照計畫的曲線快兩倍、停站時不動
test('ctx.speed 2: bubble, LEVEL UP and camera flight are handed real-time lengths; trainStop keeps the train still while held', () => {
  const { ctx, tl, bubbles, rig, rail } = fake({ parts: ['token.train'] }); ctx.speed = 2;
  tl.play([B.bubble('milk', '！', 1.2), B.levelUp('milk'), B.focus([1, 0])], ctx); tl.update(0);
  assert.equal(bubbles.shown[0].dur, 0.6); assert.ok(Math.abs(tl.currentDur - 0.6) < 1e-9);
  tl.update(0.6); assert.equal(bubbles.levels[0].opts.dur, 0.5); tl.update(0.5);
  assert.deepEqual(rig.calls.at(-1), ['focus', c([1, 0]), { zoom: 0.6, ms: 500 }]); tl.skip();
  const one = fake(); one.tl.play([B.levelUp('milk')], one.ctx); one.tl.update(0); assert.equal(one.bubbles.levels[0].opts.dur, undefined, '×1 keeps the default');
  rail.offset = 0; ctx.now = (STATION_A - Math.PI) / 0.35;
  tl.play([B.trainStop()], ctx); tl.update(0);
  assert.ok(Math.abs(tl.currentDur - (TRAIN_ARRIVE + SPUR_BRAKE / 2 + TRAIN_STOP) / 2) < 1e-6, 'the whole stop at ×2');
  for (let i = 0; i < 22; i++) { ctx.now += 0.1; tl.update(0.1); }
  const a = ((ctx.now + rail.offset) * 0.35 - STATION_A) % (2 * Math.PI); assert.ok(Math.abs(a) < 0.05 || Math.abs(a - 2 * Math.PI) < 0.05, `head at the station after 2.2 s (${a.toFixed(3)})`);
  const o = rail.offset; ctx.now += 0.5; tl.update(0.5); assert.ok(Math.abs(rail.offset - (o - 0.5)) < 1e-6, 'held: the train stands still in real time');
});
// 失望（計畫 6 設計 §5）：sigh 1.0 秒；小人交給 walker 的 gesture，演完清掉；模型原地慢慢轉一圈，演完回原本的朝向
test('gesture sigh: 1.0 s on a walker (walker gesture set, cleared at the end); a model member turns once round and keeps its yaw', async () => {
  const { GESTURE_DUR } = await import('../src/show/beats.js');
  assert.equal(GESTURE_DUR.sigh, 1.0);
  const { ctx, tl, member } = fake({ pos: { x: 0, y: 0, z: 0 } });
  const beat = B.gesture(member, 'sigh');
  assert.equal(beat.dur, 1.0);
  tl.play([beat], ctx); tl.update(0); tl.update(0.4);
  assert.equal(member.walker.gesture.kind, 'sigh'); assert.ok(Math.abs(member.walker.gesture.k - 0.4) < 1e-9);
  tl.update(0.7); assert.equal(member.walker.gesture, null, 'cleared at the end');
  const rat = { ...member, kind: 'model', walker: undefined, holder: new THREE.Group(), yaw: 1, pos: { x: 0, y: 2, z: 0 } }; rat.head = () => rat.pos;
  tl.play([B.gesture(rat, 'sigh')], ctx); tl.update(0); tl.update(0.25);
  assert.ok(Math.abs(rat.holder.rotation.y - (1 + Math.PI / 2)) < 1e-9, 'a quarter round at a quarter of the way');
  tl.update(0.5); assert.ok(Math.abs(rat.holder.rotation.y - (1 + 1.5 * Math.PI)) < 1e-9);
  tl.update(0.5); assert.equal(rat.holder.rotation.y, 1, 'back to its own yaw');
});
