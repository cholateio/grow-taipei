import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as boba from '../src/actors/boba.js';
import * as sat from '../src/actors/satellites.js';
import { RING_R, SATELLITES, axialToWorld } from '../src/scene/hex.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { offset } from '../src/actors/palette.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, playItem } from './helpers/show.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星），從求解器取
const AT = anchorWorld('boba');
const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;
const spotsOf = s => s.home?.spots ?? [];

test('boba lv1 is the cart and its owner', () => assert.deepEqual(Object.keys(boba.view(lv({ boba: 1 }), {})), ['boba.main', 'boba.owner']));
test('lv2 queues six tourists with suitcases facing the cart', () => {
  const q = boba.view(lv({ boba: 2 }), {})['boba.queue']; assert.equal(q.n, 6); assert.equal(spotsOf(q).length, 6); assert.equal(q.accessory, 'suitcase');
});
test('lv3 fountain plaza; milk ≥2 makes it ten with a fresh-milk sign', () => {
  const a = boba.view(lv({ boba: 3 }), {}), b = boba.view(lv({ boba: 3, milk: 2 }), {});
  assert.ok(a['boba.main'].parts.some(p => p.kind === 'dome')); assert.equal(a['boba.queue'].n, 6); assert.equal(b['boba.queue'].n, 10);
  const sign = v => v['boba.main'].parts.find(p => p.sign).color; assert.notEqual(sign(a), sign(b));
});
test('boba parts, owner and queue stay in the token cell', () => {
  for (const n of [1, 2, 3]) for (const s of Object.values(boba.view(lv({ boba: n, milk: 2 }), {}))) for (const p of [...worldPoints(s), ...spotsOf(s)]) assert.ok(distToCell(p, [0, 1]) < RING_R, `lv${n}`);
});
test('the queue runs away from the MRT station and everyone faces the cart', () => {
  const q = boba.view(lv({ boba: 3, milk: 2 }), {})['boba.queue'], st = anchorWorld('token');
  for (const p of spotsOf(q)) { assert.ok(Math.hypot(p.x - st.x, p.z - st.z) > 0.9, 'clear of the station'); assert.ok(Math.abs(p.yaw - Math.atan2(AT.x - p.x, AT.z - p.z)) < 1e-9); }
});

// ── Task 17：名冊與劇本（§8.7）──
test('view: the owner is an apron roster standing behind the cart (beside the fountain at Lv3+) and fidgets; the queue is a suitcase roster', () => {
  for (const n of [1, 2]) {
    const v = boba.view(lv({ boba: n }), {}), o = v['boba.owner'];
    assert.deepEqual([o.kind, o.n, o.accessory, o.home.kind, o.home.fidget], ['roster', 1, 'apron', 'stand', 'wave']);
    assert.ok(near(o.home.spots[0], offset(AT, 0, -0.45), 1e-9)); assert.equal(o.home.spots[0].yaw, 0);
    assert.deepEqual(v['boba.main'].footprint, { w: 0.7, d: 0.5 });
  }
  const v3 = boba.view(lv({ boba: 3, milk: 2 }), {});
  assert.ok(near(v3['boba.owner'].home.spots[0], offset(AT, -1.0, -0.6), 1e-9), 'beside the fountain');
  assert.ok(Math.hypot(v3['boba.owner'].home.spots[0].x - AT.x, v3['boba.owner'].home.spots[0].z - AT.z) > 0.95, 'outside the fountain footprint');
  assert.deepEqual(v3['boba.main'].footprint, { r: 0.95 });
  const q = v3['boba.queue'];
  assert.deepEqual([q.kind, q.n, q.accessory, q.home.kind, q.home.spots.length], ['roster', 10, 'suitcase', 'stand', 10]);
  assert.ok(Array.isArray(q.shirt));
  assert.equal(boba.view(lv({ boba: 1 }), {})['boba.queue'], undefined);
  assert.ok(boba.script?.placed && [2, 3, 4].every(n => boba.script.grow[n]) && boba.script.fx && boba.script.rep);
});
test('view: the forest island tourists are a roster that arrives with the branch shop at Lv4', () => {
  assert.equal(sat.view(lv({ boba: 3 }), {})['sat.forest'], undefined);
  const f = sat.view(lv({ boba: 4 }), {})['sat.forest'], s = SATELLITES.find(x => x.kind === 'forest'), c = axialToWorld(s.q, s.r);
  assert.deepEqual([f.kind, f.n, f.accessory, f.home.kind], ['roster', 2, 'suitcase', 'stand']);
  for (const p of f.home.spots) assert.ok(near(p, c, 1.5), 'on the forest island');
});

const KEYS = ['boba.owner', 'boba.queue', 'sat.forest', 'chip.engineers', 'landmarks.islanders'];
const isBoba = to => e => e.kind === 'grow' && e.item === 'boba' && e.to === to;
// 照 order（放完再長 CLOSING_TURNS 回合）瞬間演到 pred 命中的那個事件，單獨 live 演（whole：整回合 live）
async function liveAt({ run, bubblesLog, rig }, order, pred, { whole = false } = {}) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (whole && r.events.some(pred)) { const n = bubblesLog.length, c = rig.log.length; return { events: r.events, secs: await run([...r.events, { kind: 'settle' }]), n, r: c }; }
    for (const e of r.events) {
      if (!whole && pred(e)) { const n = bubblesLog.length, c = rig.log.length; return { e, secs: await run([e]), n, r: c }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const RANGE = { 1: [4, 9], 2: [4, 10], 3: [5, 15], 4: [5, 12] };
function checkBoba({ show, bubblesLog, rig }, e, secs, n, r) {
  const lvl = e.kind === 'grow' ? e.to : 1, what = `${e.kind} ${lvl}`, [lo, hi] = RANGE[lvl];
  assert.ok(secs >= lo && secs <= hi, `${what} took ${secs.toFixed(1)}s (want ${lo}–${hi})`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('boba');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over boba`);
  }
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  const v = boba.view(show.stage.lv, show.stage.flags);
  assert.equal(show.roster.members('boba.owner').length, 1, `${what} owner`);
  assert.equal(show.roster.members('boba.queue').length, v['boba.queue']?.n ?? 0, `${what} queue`);
  // 鏡頭只在 Lv4 平移到小森林島，演完回全景
  const cam = rig.log.slice(r), pans = cam.filter(c => c[0] === 'panTo');
  assert.equal(pans.length, lvl === 4 ? 1 : 0, `${what} pans`);
  if (pans.length) {
    const s = SATELLITES.find(x => x.kind === 'forest'), c = axialToWorld(s.q, s.r);
    assert.ok(near(pans[0][1], c, 1e-6), 'pans to the forest island'); assert.equal(cam.at(-1)[0], 'home', `${what} camera home`);
  }
}
test('scripts: every boba level in both solutions plays in range, ends with LEVEL UP on boba, everyone home; camera pans only at Lv4', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, run, bubblesLog } = h;
    let n = 0, r = 0;
    const tracked = (evs, opts) => { if (!opts?.instant) { n = bubblesLog.length; r = h.rig.log.length; } return run(evs, opts); };
    const seen = new Set();
    await playItem(show, tracked, order, 'boba', (e, secs) => { seen.add(e.kind === 'grow' ? e.to : 1); checkBoba(h, e, secs, n, r); });
    assert.ok(seen.has(1), `boba events seen: ${[...seen]}`);
    // 珍奶是最後放的：Lv2–4 都落在倒數回合，playItem 演不到，自己演
    for (const to of [2, 3, 4].filter(t => !seen.has(t))) {
      show.reset();
      const { e, secs, n: before, r: r0 } = await liveAt(h, order, isBoba(to));
      checkBoba(h, e, secs, before, r0);
    }
  }
});
// 審查 I1／I3／M1：老闆照常速（1.6）從遠處推著攤車走 3–4 s；每一幀攤車都在他面前 0.3–0.6；攤車在出發點白光出現
test('placed: the owner pushes the cart in at walking speed — every frame the cart is just in front of him — and it parks at its anchor; ♪', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, frames = [], flashes = [];
  const at = show.flash.at; show.flash.at = (q, o) => { flashes.push({ x: q.x, z: q.z }); return at(q, o); };
  let cart0 = null;
  show.update = (dt, t) => {
    update(dt, t);
    const o = show.roster.members('boba.owner')[0], cart = show.stage.partObject('boba.main');
    if (cart && cart.visible && !cart0) cart0 = { x: cart.position.x, z: cart.position.z };
    if (o?.walking && cart) frames.push({ o: { ...o.pos }, yaw: o.yaw, speed: o.speed, c: { x: cart.position.x, z: cart.position.z } });
  };
  const { n } = await liveAt(h, SOLUTIONS[0], e => e.kind === 'placed' && e.item === 'boba');
  const secs = frames.length / 30;
  assert.ok(secs >= 2.5 && secs <= 4.5, `push took ${secs.toFixed(2)} s`);
  assert.ok(frames.every(f => f.speed === 1.6), 'walking speed');
  for (const [i, f] of frames.entries()) {
    const dx = f.c.x - f.o.x, dz = f.c.z - f.o.z, d = Math.hypot(dx, dz), dot = Math.sin(f.yaw) * dx + Math.cos(f.yaw) * dz;
    assert.ok(d >= 0.3 && d <= 0.6, `frame ${i}: cart ${d.toFixed(2)} from the owner`); assert.ok(dot > 0, `frame ${i}: cart in front`);
  }
  assert.ok(Math.hypot(frames[0].o.x - AT.x, frames[0].o.z - AT.z) > 3, 'starts far away');
  assert.ok(cart0 && flashes.some(q => near(q, cart0, 0.1)), 'the cart appears with a flash where it starts');
  const cart = show.stage.partObject('boba.main');
  assert.ok(Math.abs(cart.position.x - AT.x) < 1e-9 && Math.abs(cart.position.z - AT.z) < 1e-9 && cart.rotation.z === 0, 'cart parked at its anchor');
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '♪'));
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  assert.ok(near(show.roster.members('boba.owner')[0].pos, offset(AT, 0, -0.45), 0.1), 'owner behind the cart');
});
// 審查 I2：噴泉廣場的人龍排在噴泉外的走路格上
test('Lv3: every queue spot is outside the fountain and walkable once the footprints are set', async () => {
  const h = await headlessShow(), { show } = h;
  await liveAt(h, SOLUTIONS[0], isBoba(3));
  const q = boba.view(show.stage.lv, show.stage.flags)['boba.queue'];
  assert.equal(q.n, 10);
  for (const [i, p] of q.home.spots.entries()) {
    assert.ok(Math.hypot(p.x - AT.x, p.z - AT.z) >= 0.95, `spot ${i} outside the fountain`);
    assert.ok(show.nav.walkable(p.x, p.z), `spot ${i} walkable`);
  }
  for (let i = 0; i < 600; i++) show.update(1 / 30, 100 + i / 30);
  show.roster.members('boba.queue').forEach((m, i) => assert.ok(near(m.pos, q.home.spots[i], 0.1), `tourist ${i} in line`));
});
test('Lv2: six tourists come from the pier side and stand in the queue', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, pier = offset(AT, 1.6, 1.4), firsts = new Map();
  show.update = (dt, t) => { update(dt, t); for (const m of show.roster.members('boba.queue')) if (!firsts.has(m)) firsts.set(m, { ...m.pos }); };
  await liveAt(h, SOLUTIONS[0], isBoba(2));
  assert.equal(firsts.size, 6);
  for (const p of firsts.values()) assert.ok(near(p, show.nav.nearestWalkable(pier), 0.6), 'spawned at the pier');
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  const spots = boba.view(show.stage.lv, show.stage.flags)['boba.queue'].home.spots;
  show.roster.members('boba.queue').forEach((m, i) => assert.ok(near(m.pos, spots[i], 0.1), `tourist ${i} in line`));
});
test('Lv3: two engineers queue up and ♥, the owner ！, then the fountain', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, setPose = show.roster.setPose, walked = new Set();
  show.roster.setPose = (m, p) => { if (m.key === 'chip.engineers' && p.walking) walked.add(m); return setPose(m, p); };
  const { n } = await liveAt(h, SOLUTIONS[0], isBoba(3));
  assert.equal(walked.size, 2, 'two engineers walk over');
  const mine = bubblesLog.slice(n), hearts = mine.filter(b => b.kind === '♥').length, bang = mine.findIndex(b => b.kind === '！');
  assert.ok(hearts >= 2 && bang > 0 && mine.slice(0, bang).filter(b => b.kind === '♥').length === 2, 'two ♥ before the ！');
  assert.ok(show.stage.partObject('boba.main'));
});
test('Lv3 with milk ≤ 1 is the sugar rush: every islander ♥', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let s = engine.createState(spec), e3 = null, rest = [];
  for (const id of ['boba', 'chip', 'rat', 'typhoon', 'token']) {
    const r = engine.place(s, id, spec); s = r.state;
    const i = r.events.findIndex(isBoba(3));
    if (i >= 0) { await run(r.events.slice(0, i), { instant: true }); e3 = r.events[i]; rest = r.events.slice(i + 1); break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.ok(e3, 'boba reaches Lv3'); assert.ok(rest.some(e => e.flag?.name === 'bobaSugar'), 'the sugar flag follows');
  const n = bubblesLog.length, secs = await run([e3, ...rest, { kind: 'settle' }]);
  const islanders = show.roster.members('landmarks.islanders').length, hearts = bubblesLog.slice(n).filter(b => b.kind === '♥').length;
  assert.ok(hearts >= 2 + islanders, `${hearts} ♥ for ${islanders} islanders`);
  assert.ok(secs <= 20, `${secs.toFixed(1)} s`);
  assert.equal(show.stage.flags.bobaSugar, true);
});
test('Lv4: the owner …… and islet, camera to the forest island, shop and two tourists appear there', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { n } = await liveAt(h, SOLUTIONS[1], isBoba(4));
  const kinds = bubblesLog.slice(n).map(b => b.kind ?? b.text);
  assert.ok(kinds.indexOf('……') >= 0 && kinds.findIndex(k => k?.icon === 'islet') > kinds.indexOf('……'));
  assert.ok(show.stage.partObject('sat.forestShop'));
  assert.equal(show.roster.members('sat.forest').length, 2);
});
// 兩個事件以上的回合整段 live：老闆、工程師、島民都是演到才找
test('the Lv3 closing turn plays whole and live: everyone ends at home', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { events, secs, n } = await liveAt(h, SOLUTIONS[0], isBoba(3), { whole: true });
  assert.ok(events.length >= 2, 'a multi-event turn');
  assert.ok(secs > 5, `${secs.toFixed(1)} s`);
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '！'));
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k);
});
// 老鼠撞珍奶（§8.6）：攤車歪了、老闆 ！
test('a rat knocks the cart: it tilts and the owner ！ over his head', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { n } = await liveAt(h, ['boba', 'rat', 'milk', 'chip', 'token'], e => e.kind === 'grow' && e.item === 'rat' && e.to === 2, { whole: true });
  const o = show.roster.members('boba.owner')[0];
  assert.ok(o, 'owner exists');
  assert.ok(Math.abs(show.stage.partObject('boba.main').rotation.z - 0.25) < 1e-9);
  const bang = bubblesLog.slice(n).filter(b => b.kind === '！');
  assert.ok(bang.some(b => Math.abs(b.at.y - (o.pos.y + o.headY)) < 0.05 && near(b.at, o.pos, 1.0)), 'owner ！');
});
