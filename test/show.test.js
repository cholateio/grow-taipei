// test/show.test.js：createShow 把時間軸、名冊、舞台接起來——整局無頭演完、跳過、RESET、忙碌中擋下
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, ALL } from './helpers/show.js';
import { anchorWorld } from '../src/actors/anchors.js';
import * as B from '../src/show/beats.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星），從求解器取

const allHome = show => { for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k); };
// 舞台與名冊的最終狀態：零件鍵、每個名冊的人數與配件
const snapshot = show => ({
  parts: show.stage.partKeys().sort(),
  roster: Object.fromEntries(show.roster.keys().sort().map(k => [k, show.roster.members(k).map(m => m.walker?.accessory ?? m.kind)])),
  lv: show.stage.lv, flags: show.stage.flags, meta: show.stage.meta,
});
const place = (s, id) => engine.place(s, id, spec);

test('both solutions play through headlessly: every turn ends with stage levels equal to the engine, no pending parts, members home', async () => {
  const { show, run, worldLog } = await headlessShow();
  for (const order of SOLUTIONS) {
    let s = engine.createState(spec);
    for (const id of order) {
      const r = place(s, id); s = r.state;
      const secs = await run([...r.events, { kind: 'settle' }]);
      assert.ok(secs > 0, `${id} took time`);
      assert.deepEqual(show.stage.lv, s.lv, id); assert.equal(show.stage.pendingKeys().length, 0, id); allHome(show);
      assert.equal(show.busy, false);
    }
    for (let i = 0; i < spec.CLOSING_TURNS; i++) {
      const r = engine.advance(s, spec); s = r.state;
      await run([...r.events, { kind: 'settle' }], { montage: true });
      assert.deepEqual(show.stage.lv, s.lv); assert.equal(show.stage.pendingKeys().length, 0); allHome(show);
    }
    // 收尾的 world 拍照最後的舞台狀態瞄準全島效果
    assert.equal(worldLog.at(-1)[1], false, 'live turns aim the world without snapping');
    show.reset();
    assert.deepEqual(show.stage.lv, engine.createState(spec).lv);
  }
});

test('skip mid-turn lands on the same final state as an instant run (review focus 1)', async () => {
  const live = await headlessShow(), ref = await headlessShow();
  let s = engine.createState(spec);
  for (const id of ['milk', 'chip']) { const r = place(s, id); s = r.state; for (const h of [live, ref]) await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  const r = place(s, 'bulb');
  assert.ok(r.events.some(e => e.kind === 'grow'), 'the turn has a grow');
  const events = [...r.events, { kind: 'settle' }];
  await ref.run(events, { instant: true });
  // live：演 0.7 s 後跳過
  const p = live.show.turn(events);
  for (let t = 0; t < 0.7; t += 1 / 30) live.show.update(1 / 30, t);
  assert.ok(live.show.busy, 'still playing at 0.7 s');
  live.show.skip();
  assert.equal(live.show.busy, false);
  await p;
  assert.deepEqual(snapshot(live.show), snapshot(ref.show));
  assert.equal(live.show.stage.pendingKeys().length, 0); allHome(live.show);
  assert.deepEqual(live.rig.log.at(-1), ['home', 0]);
  assert.equal(live.show.bubbles.count, 0); assert.equal(live.show.flash.count, 0);
  // 全島效果貼齊（instant）
  assert.equal(live.worldLog.at(-1)[1], true); assert.deepEqual(live.worldLog.at(-1)[0], ref.worldLog.at(-1)[0]);
  // 下一回合照常演（instant 旗標收回）
  const r2 = place(s = r.state, 'token');
  const secs = await live.run([...r2.events, { kind: 'settle' }]);
  assert.ok(secs > 0); assert.deepEqual(live.show.stage.lv, r2.state.lv);
  assert.equal(live.worldLog.at(-1)[1], false);
});

test('reset mid-turn: the promise resolves, nothing from the old turn applies afterwards, a new turn plays (review focus 2)', async () => {
  const { show, run } = await headlessShow();
  const r = place(engine.createState(spec), 'milk');
  const p = show.turn([...r.events, { kind: 'settle' }]);
  for (let t = 0; t < 0.3; t += 1 / 30) show.update(1 / 30, t);
  show.reset();
  assert.equal(show.busy, false);
  await p;   // 一定有結果，不留懸掛
  const fresh = engine.createState(spec);
  assert.deepEqual(show.stage.lv, fresh.lv); assert.equal(show.bubbles.count, 0); assert.equal(show.flash.count, 0);
  for (let t = 0; t < 2; t += 1 / 30) show.update(1 / 30, t);
  assert.deepEqual(show.stage.lv, fresh.lv, 'the aborted turn does not apply later');
  const r2 = place(fresh, 'chip');
  await run([...r2.events, { kind: 'settle' }], { instant: true });
  assert.deepEqual(show.stage.lv, r2.state.lv);
  assert.equal(show.stage.lv.milk, 0);
});

test('turn while busy throws', async () => {
  const { show } = await headlessShow();
  const r = place(engine.createState(spec), 'milk');
  const p = show.turn([...r.events, { kind: 'settle' }]);
  assert.ok(show.busy);
  assert.throws(() => show.turn([{ kind: 'settle' }]), /show busy/);
  show.skip(); await p;
  assert.equal(show.busy, false);
});

// 吊車的 footprint 擋的是塔架（at + offset），不是已經被主體擋住的 at（審查 Important 1）
test('crane footprints block the mast, so nobody walks through it', async () => {
  const { show, run } = await headlessShow();
  const mast = (id, [dx, , dz]) => { const a = anchorWorld(id); return { x: a.x + dx, z: a.z + dz }; };
  const tower = mast('tower', [0.75, 0, 0.55]), chip = mast('chip', [0.5, 0, -0.4]);
  assert.equal(show.nav.walkable(tower.x, tower.z), false, '101 site crane from the start');
  assert.equal(show.nav.walkable(chip.x, chip.z), true, 'no chip yet');
  const r = place(engine.createState(spec), 'chip');
  await run([...r.events, { kind: 'settle' }], { instant: true });
  assert.ok(show.stage.partKeys().includes('chip.crane'));
  assert.equal(show.nav.walkable(chip.x, chip.z), false, 'chip crane mast');
});

// 某一拍的 end 丟錯：跳過／RESET 照樣收到最終狀態，Promise reject（審查 Minor 3）
test('skip and reset still snap when a beat throws in end', async () => {
  const boom = () => ({ kind: 'boom', dur: 5, end() { throw new Error('boom'); } });
  const milk = ALL.find(m => m.id === 'milk');
  const modules = ALL.map(m => (m === milk ? { ...milk, script: { placed: e => [B.together([boom(), B.apply(e), B.levelUp('milk')])] } } : m));
  const r = place(engine.createState(spec), 'milk'), events = [...r.events, { kind: 'settle' }];
  const a = await headlessShow({ modules });
  const p = a.show.turn(events); const rejected = assert.rejects(p, /boom/);
  for (let t = 0; t < 0.1; t += 1 / 30) a.show.update(1 / 30, t);
  assert.ok(a.show.stage.pendingKeys().length > 0 && a.show.bubbles.count > 0, 'mid-flash with a LEVEL UP up');
  assert.throws(() => a.show.skip(), /boom/);
  await rejected;
  assert.equal(a.show.busy, false); assert.equal(a.show.stage.pendingKeys().length, 0); assert.equal(a.show.bubbles.count, 0); assert.equal(a.show.flash.count, 0);
  assert.deepEqual(a.rig.log.at(-1), ['home', 0]);
  const b = await headlessShow({ modules });
  const q = b.show.turn(events); const rejectedB = assert.rejects(q, /boom/);
  for (let t = 0; t < 0.1; t += 1 / 30) b.show.update(1 / 30, t);
  assert.throws(() => b.show.reset(), /boom/);
  await rejectedB;
  assert.equal(b.show.stage.lv.milk, 0, 'stage reset ran'); assert.equal(b.show.stage.pendingKeys().length, 0); assert.equal(b.show.bubbles.count, 0);
});

// 颱風登陸那回合：每個人走到門口各自藏起來、整回合藏著；下一回合一開始全部露出來（§8.5「登陸後的回合：人在街上」）
test('people hidden at their doors on the landing turn are all back out when the next turn starts', async () => {
  const { show, run } = await headlessShow();
  let s = engine.createState(spec), landed = false;
  for (const id of SOLUTIONS[0]) {
    const r = place(s, id); s = r.state;
    const evs = [...r.events, { kind: 'settle' }];
    if (landed) {
      const p = show.turn(evs);
      for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.hidden, false, k);
      show.skip(); await p; break;
    }
    if (!r.events.some(e => e.kind === 'grow' && e.item === 'typhoon' && e.to === 2)) { await run(evs, { instant: true }); continue; }
    await run(evs); landed = true;
    const hidden = show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.hidden);
    assert.ok(hidden.length > 0, 'somebody is still hidden at the end of the landing turn');
  }
  assert.ok(landed);
});

// 老鼠撞歪攤車（§8.6「下回合白光扶正」）
test('a knocked cart is righted with a flash at the start of the next turn', async () => {
  const { show, run } = await headlessShow();
  let s = engine.createState(spec), knocked = false;
  for (const id of ['boba', 'rat', 'milk', 'chip', 'token']) {
    const r = place(s, id); s = r.state;
    const evs = [...r.events, { kind: 'settle' }];
    if (knocked) {
      const p = show.turn(evs), cart = show.stage.partObject('boba.main');
      assert.ok(Math.abs(cart.rotation.z - 0.25) < 1e-9, 'still askew as the turn starts');
      const at = show.flash.at, flashed = [];
      show.flash.at = (q, o) => { flashed.push(q); return at(q, o); };
      for (let i = 0; i < 30 && Math.abs(cart.rotation.z) > 0; i++) show.update(1 / 30, i / 30);
      assert.equal(cart.rotation.z, 0, 'righted within the first second'); assert.ok(flashed.some(q => Math.hypot(q.x - cart.position.x, q.z - cart.position.z) < 1e-9), 'with a flash on the cart');
      assert.equal(show.stage.partObject('milk.crate').rotation.z, 0, 'the tipped milk crate is righted too');
      show.skip(); await p; break;
    }
    if (!r.events.some(e => e.cause === 'rat' && e.story?.includes('珍奶'))) { await run(evs, { instant: true }); continue; }
    await run(evs); knocked = true;
    assert.ok(Math.abs(show.stage.partObject('boba.main').rotation.z - 0.25) < 1e-9, 'knocked at the end of the rat turn');
  }
  assert.ok(knocked);
});

// 開局：島民一出來就要繞開建築（101 工地的沙地也算），也不留沒演的白光（終審 Important 1）
test('on the opening screen no islander stands inside a building and no flash is pending, for seeds 1–40', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { show } = await headlessShow({ seed });
    for (const m of show.roster.members('landmarks.islanders')) assert.ok(show.nav.walkable(m.pos.x, m.pos.z), `seed ${seed} islander ${m.i} at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
    assert.equal(show.flash.count, 0, `seed ${seed}`);
  }
});

// 颱風登陸那回合大家躲進門裡：等待圖框不能掛在藏起來的人頭上，沒人在外面就掛在建築上（終審 Important 2）
test('the wait hint on a landing turn hangs over the building when its owner is hidden', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  let s = engine.createState(spec);
  for (const id of ['boba', 'typhoon']) { const r = place(s, id); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  const r = place(s, 'milk');
  assert.ok(r.events.some(e => e.kind === 'grow' && e.item === 'typhoon' && e.to === 2), 'milk is the landing turn');
  const w = r.events.filter(e => e.kind === 'wait').at(-1)?.waits?.[0];
  assert.equal(w?.item, 'boba', 'boba waits on the landing turn');
  bubblesLog.length = 0;
  await run([...r.events, { kind: 'settle' }]);
  const hint = bubblesLog.find(b => b.kind?.icon === w.for[0]);
  assert.ok(hint, 'the wait hint showed');
  const head = show.stage.headOf('boba');
  assert.ok(Math.hypot(hint.at.x - head.x, hint.at.z - head.z) < 1e-6 && Math.abs(hint.at.y - head.y) < 1e-6, `hint at (${hint.at.x.toFixed(2)}, ${hint.at.y.toFixed(2)}, ${hint.at.z.toFixed(2)})`);
});
