// test/show.test.js：createShow 把時間軸、名冊、舞台接起來——整局無頭演完、跳過、RESET、忙碌中擋下
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, ALL, turnSteps, towerCrossings, overviewRig, gameInvariants } from './helpers/show.js';
import { anchorWorld } from '../src/actors/anchors.js';
import * as B from '../src/show/beats.js';
import * as THREE from '../vendor/three/three.module.js';
import { createCameraRig, overviewDistance } from '../src/scene/camera.js';
import { cellCentre } from '../src/actors/anchors.js';
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
      await run([...r.events, { kind: 'settle' }]);   // 最後一輪：一般回合（同 game.js）
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
  assert.equal(live.show.bubbles.count, 0); assert.equal(live.show.blink.count, 0);
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
  assert.deepEqual(show.stage.lv, fresh.lv); assert.equal(show.bubbles.count, 0); assert.equal(show.blink.count, 0);
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
  // 選擇帶動升級：晶片放下當回合就長到 Lv2（工地吊車只在 Lv1），所以直接演一個放置事件停在 Lv1
  await run([{ kind: 'placed', item: 'chip', to: 1 }, { kind: 'settle' }], { instant: true });
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
  for (let t = 0; t < 0.9; t += 1 / 30) a.show.update(1 / 30, t);   // 前 0.8 秒是鏡頭平移到鮮奶那一格的拍
  assert.ok((a.show.stage.pendingKeys().length > 0 || a.show.blink.count > 0) && a.show.bubbles.count > 0, 'mid-blink with a LEVEL UP up');
  assert.throws(() => a.show.skip(), /boom/);
  await rejected;
  assert.equal(a.show.busy, false); assert.equal(a.show.stage.pendingKeys().length, 0); assert.equal(a.show.bubbles.count, 0); assert.equal(a.show.blink.count, 0);
  assert.deepEqual(a.rig.log.at(-1), ['home', 0]);
  const b = await headlessShow({ modules });
  const q = b.show.turn(events); const rejectedB = assert.rejects(q, /boom/);
  for (let t = 0; t < 0.9; t += 1 / 30) b.show.update(1 / 30, t);
  assert.throws(() => b.show.reset(), /boom/);
  await rejectedB;
  assert.equal(b.show.stage.lv.milk, 0, 'stage reset ran'); assert.equal(b.show.stage.pendingKeys().length, 0); assert.equal(b.show.bubbles.count, 0);
});

// 颱風放下（登陸）那回合：每個人走到門口各自藏起來、整回合藏著；下一回合一開始全部露出來（§8.5「登陸後的回合：人在街上」）
// 唯一正解 2026-10-31 §5.1：颱風到了＝放下事件（landsTyphoon），正解第 6 回合
test('people hidden at their doors on the landing turn are all back out when the next turn starts', async () => {
  const { show, run } = await headlessShow();
  let s = engine.createState(spec), landed = false;
  for (const step of [...SOLUTIONS[0].map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))]) {
    const r = step(s); s = r.state;
    const evs = [...r.events, { kind: 'settle' }];
    if (landed) {
      const p = show.turn(evs);
      for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.hidden, false, k);
      show.skip(); await p; break;
    }
    if (!r.events.some(engine.landsTyphoon)) { await run(evs, { instant: true }); continue; }
    await run(evs); landed = true;
    const hidden = show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.hidden);
    assert.ok(hidden.length > 0, 'somebody is still hidden at the end of the landing turn');
  }
  assert.ok(landed);
});

// 老鼠撞歪攤車、牛奶箱（§8.6「下回合白光扶正」，§13.2 改成零件自己閃白）。
//   珍奶、燈泡、老鼠：珍奶 Lv3 在老鼠那回合等晶片（不重建），攤車歪到回合結束。
//   牛奶箱：選擇帶動升級之後鮮奶放下當回合就是 Lv2，老鼠放下時鮮奶一定 ≥ 2（被咬是掉級翻倒、不是撞歪），
//   真的一局走不到「鮮奶 Lv1 被咬」——直接演事件：鮮奶停在 Lv1，老鼠放下咬一口（delta 1 → 1，撞歪）
const engineTurns = order => { let s = engine.createState(spec); return order.map(id => { const r = place(s, id); s = r.state; return [...r.events, { kind: 'settle' }]; }); };
const biteTurns = () => [
  [{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'settle' }],
  [{ kind: 'placed', item: 'rat', to: 1 }, { kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 1 } }, { kind: 'settle' }],
  [{ kind: 'placed', item: 'chip', to: 1 }, { kind: 'settle' }],
];
for (const [turns, key, rz] of [[() => engineTurns(['boba', 'bulb', 'rat', 'milk', 'token']), 'boba.main', 0.25], [biteTurns, 'milk.crate', 0.35]]) {
  test(`a knocked part is righted with a blink at the start of the next turn (${key})`, async () => {
    const { show, run } = await headlessShow();
    let knocked = false;
    for (const evs of turns()) {
      if (knocked) {
        const p = show.turn(evs), obj = show.stage.partObject(key);
        assert.ok(Math.abs(obj.rotation.z - rz) < 1e-9, 'still askew as the turn starts');
        const part = show.blink.part, blinked = [];
        show.blink.part = (o, ...rest) => { blinked.push(o); return part(o, ...rest); };
        for (let i = 0; i < 30 && Math.abs(obj.rotation.z) > 0; i++) show.update(1 / 30, i / 30);
        assert.equal(obj.rotation.z, 0, 'righted within the first second'); assert.ok(blinked.includes(obj), 'the part itself blinks');
        show.skip(); await p; break;
      }
      if (!evs.some(e => e.kind === 'fx' && e.cause === 'rat')) { await run(evs, { instant: true }); continue; }
      await run(evs); knocked = true;
      assert.ok(Math.abs(show.stage.partObject(key).rotation.z - rz) < 1e-9, 'knocked at the end of the rat turn');
    }
    assert.ok(knocked);
  });
}

// 開局：島民一出來就要繞開建築（101 工地的沙地也算），也不留沒收掉的閃白（終審 Important 1）
test('on the opening screen no islander stands inside a building and no blink is pending, for seeds 1–40', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { show } = await headlessShow({ seed });
    for (const m of show.roster.members('landmarks.islanders')) assert.ok(show.nav.walkable(m.pos.x, m.pos.z), `seed ${seed} islander ${m.i} at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
    assert.equal(show.blink.count, 0, `seed ${seed}`);
  }
});

// 颱風登陸那回合大家躲進門裡：撲空不演（計畫 6 設計 §5 取代舊的等待圖框）——沒有撲空段、沒有任何圖框泡泡，躲著的人不被拉出來
test('a landing turn plays no miss and no icon bubble; hidden owners stay hidden', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  let s = engine.createState(spec);
  // 唯一正解 2026-10-31 §5.1：颱風放下當回合就到 101 上空（landsTyphoon）。
  // 棒球、颱風——第二回合就是登陸回合（棒球 Lv1 等鮮奶，球員是代表）
  for (const id of ['baseball']) { const r = place(s, id); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  const r = place(s, 'typhoon');
  assert.ok(r.events.some(engine.landsTyphoon), 'placing the typhoon is the landing turn');
  const w = r.events.filter(e => e.kind === 'wait').at(-1)?.waits?.[0];
  assert.equal(w?.item, 'baseball', 'baseball waits on the landing turn');
  bubblesLog.length = 0;
  const marks = [], owners = () => show.roster.members('baseball.players');
  await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => { marks.push(info); if (e.kind === 'wait') assert.ok(owners().length && owners().every(m => m.hidden), 'the players are indoors'); } });
  assert.ok(!marks.some(i => i?.miss), 'no miss segment after the landing');
  assert.deepEqual(bubblesLog.filter(b => typeof b.kind === 'object'), [], 'no icon bubble');
});

// 真的鏡頭 rig（16:9 全景），記下每次 focus／home；step 一幀推演出層與鏡頭
function realRig() {
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 320), controls = { target: new THREE.Vector3(), update() {} };
  const rig = createCameraRig({ THREE, camera, controls }), calls = [];
  rig.fit(16 / 9);
  const { focus, home } = rig;
  rig.focus = (t, o) => { calls.push(['focus', t, o]); return focus(t, o); };
  rig.home = ms => { calls.push(['home', ms]); return home(ms); };
  const atHome = () => controls.target.distanceTo(new THREE.Vector3(0.4, 0.6, 0)) < 1e-6 && Math.abs(camera.position.distanceTo(controls.target) - overviewDistance(16 / 9)) < 1e-6;
  return { rig, camera, controls, calls, atHome };
}
const near = (v, p) => Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) < 1e-6;

test('skip during a focus pan ends with the rig at home and the next turn pans again (review focus 1)', async () => {
  const cam = realRig(), { show, run } = await headlessShow({ rig: cam.rig });
  const r = place(engine.createState(spec), 'milk');
  const p = show.turn([...r.events, { kind: 'settle' }]);
  let t = 0;
  for (; t < 5 && !(cam.rig.flying && cam.calls.some(c => c[0] === 'focus')); t += 1 / 30) { show.update(1 / 30, t); cam.rig.update(1 / 30); }
  assert.ok(cam.rig.flying, 'mid-pan'); assert.deepEqual(cam.calls[0][2], { zoom: 0.6, ms: 1000 });
  show.skip(); await p;
  cam.rig.update(1 / 30);
  assert.equal(cam.rig.flying, false); assert.ok(cam.atHome(), 'back at the overview at once');
  // 下一回合照常平移拉近（晶片那一格）
  const before = cam.calls.length, r2 = place(r.state, 'chip'), chip = cellCentre([1, 0]);
  const q = show.turn([...r2.events, { kind: 'settle' }]);
  let reached = false;
  for (t = 0; t < 60 && show.busy; t += 1 / 30) { show.update(1 / 30, t); cam.rig.update(1 / 30); reached ||= near(cam.controls.target, chip); await Promise.resolve(); }
  await q;
  assert.ok(cam.calls.slice(before).some(c => c[0] === 'focus' && c[2].ms === 1000), 'the next turn pans');
  assert.ok(reached, 'the camera reached the chip cell'); assert.deepEqual(cam.calls.at(-1), ['home', 1000]);
});

// final review 2：turn() resolve 時鏡頭還在飛回全景（最後那拍 0 秒）；這時點一下（app.js 的 pointerdown → cancel）要落在全景，不停在半路
test('a click during the fly-home after turn() resolves leaves the rig at the overview', async () => {
  for (const at of [0, 0.2, 0.5, 0.9]) {
    const cam = realRig(), { show } = await headlessShow({ rig: cam.rig });
    const r = place(engine.createState(spec), 'milk');
    const p = show.turn([...r.events, { kind: 'settle' }]);
    let t = 0, done = false; p.then(() => { done = true; });
    while (!done && t < 60) { show.update(1 / 30, t); cam.rig.update(1 / 30); t += 1 / 30; await Promise.resolve(); }
    assert.ok(done && cam.rig.flying, 'turn resolved while the camera is still flying home');
    for (let k = 0; k < at; k += 1 / 30) { show.update(1 / 30, t); cam.rig.update(1 / 30); t += 1 / 30; }
    cam.rig.cancel();
    for (let i = 0; i < 40; i++) { show.update(1 / 30, t); cam.rig.update(1 / 30); t += 1 / 30; }
    assert.ok(cam.atHome(), `click ${at} s after the turn: camera at the overview (target ${cam.controls.target.distanceTo(new THREE.Vector3(0.4, 0.6, 0)).toFixed(2)} off)`);
  }
});
test('after the player grabs the camera, no focus moves the rig for the rest of the turn (review focus 2)', async () => {
  // 鮮奶、晶片之後放燈泡：這回合有好幾個物品的事件（不拖的話鏡頭會平移好幾次）
  const setup = async () => {
    const cam = realRig(), h = await headlessShow({ rig: cam.rig });
    let s = engine.createState(spec);
    for (const id of ['milk', 'chip']) { const r = place(s, id); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
    const r = place(s, 'bulb');
    cam.calls.length = 0;
    return { cam, ...h, events: [...r.events, { kind: 'settle' }], state: r.state };
  };
  const ref = await setup();
  await ref.run(ref.events);
  assert.ok(ref.cam.calls.filter(c => c[0] === 'focus').length >= 2, 'without a grab the turn pans more than once');
  const { cam, show, run, events, state } = await setup();
  const p = show.turn(events);
  let t = 0;
  for (; t < 5 && !cam.calls.some(c => c[0] === 'focus'); t += 1 / 30) { show.update(1 / 30, t); cam.rig.update(1 / 30); }
  for (let i = 0; i < 6; i++) { show.update(1 / 30, t); cam.rig.update(1 / 30); t += 1 / 30; }
  cam.rig.cancel();   // 玩家按下滑鼠：停在半路
  const held = cam.controls.target.clone(), pos = cam.camera.position.clone();
  let homed = false;
  while (show.busy && t < 60) {
    show.update(1 / 30, t); cam.rig.update(1 / 30); t += 1 / 30;
    homed ||= cam.calls.at(-1)[0] === 'home';
    if (!homed) assert.ok(cam.controls.target.distanceTo(held) < 1e-9 && cam.camera.position.distanceTo(pos) < 1e-9, `the camera stays where the player left it (${t.toFixed(2)} s)`);
    await Promise.resolve();
  }
  await p;
  assert.equal(cam.calls.filter(c => c[0] === 'focus').length, 1, 'no focus after the grab');
  assert.deepEqual(cam.calls.at(-1), ['home', 1000], 'the turn still ends at the overview'); assert.equal(cam.rig.grabbed, false);
  // 回合之間拖一下：下一回合照樣跟著主線（R4）
  for (let i = 0; i < 40; i++) cam.rig.update(1 / 30);
  cam.rig.cancel(); cam.calls.length = 0;
  const r2 = place(state, 'token');
  await run([...r2.events, { kind: 'settle' }]);
  assert.ok(cam.calls.some(c => c[0] === 'focus'), 'a grab between turns does not stop the next turn');
});

// §14.3 人分散：兩條正解整局 live 演完，最後沒有哪一格主島的格子站了超過所有露出來的人（主島上）的 40%
test('live both solutions: at the end no main cell has more than 40% of all visible members (spread check)', async () => {
  const { cellAt } = await import('../src/scene/hex.js');
  for (const order of SOLUTIONS) {
    const { show, run } = await headlessShow();
    let s = engine.createState(spec);
    const steps = [...order.map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const [i, step] of steps.entries()) { const r = step(s); s = r.state; await run([...r.events, { kind: 'settle' }]); }
    for (let i = 0; i < 300; i++) show.update(1 / 30, 1000 + i / 30);
    const per = new Map(); let total = 0;
    for (const k of show.roster.keys()) for (const m of show.roster.members(k)) {
      const c = !m.hidden && cellAt(m.pos.x, m.pos.z); if (!c) continue;
      per.set(String(c), (per.get(String(c)) ?? 0) + 1); total++;
    }
    const counts = JSON.stringify(Object.fromEntries(per));
    assert.ok(total >= 20, `${order.join('>')}: ${total} on the island`);
    for (const [c, n] of per) assert.ok(n <= 0.4 * total, `${order.join('>')}: cell ${c} holds ${n}/${total} ${counts}`);
    assert.ok(per.size >= 5, `${order.join('>')}: people on ≥ 5 main cells ${counts}`);
  }
});

// §14.4 全景跟 101 高度：真的 rig（helpers/show.js 的 overviewRig），量 101 頭頂在畫面上的 NDC y
const skylineRig = () => { const r = overviewRig(); return { ...r, topNdc: show => r.topNdc(show).y }; };
// 第一條正解 instant 演到跨進 101 完工（頭頂 7.75）的前一回合，回傳跨進那一回合的事件（回合數從總等級曲線找）
async function beforeTurn(h, n) {
  const steps = turnSteps(SOLUTIONS[0]); let s = engine.createState(spec);
  for (const step of steps.slice(0, n - 1)) { const r = step(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  return [...steps[n - 1](s).events, { kind: 'settle' }];
}
const beforeFull = h => beforeTurn(h, towerCrossings(SOLUTIONS[0]).at.full);
test('after a turn in which the tower top rose above 3, the final home framing includes the top (NDC y ≤ 0.8); skip during that turn also updates the skyline (review focus 5)', async () => {
  // 照常演完：回合最後回全景之前更新天際線，飛完頭頂在上緣 10% 以內
  const a = skylineRig(), ha = await headlessShow({ rig: a.rig }), events = await beforeFull(ha);
  assert.ok(ha.show.stage.headOf('tower').y < 5, 'the tower is half built before the turn');
  await ha.run(events);
  for (let i = 0; i < 60; i++) a.rig.update(1 / 30);
  assert.equal(a.rig.flying, false); assert.ok(ha.show.stage.headOf('tower').y > 7, 'the tower rose');
  assert.ok(a.topNdc(ha.show) <= 0.8, `live: top at NDC ${a.topNdc(ha.show).toFixed(3)}`);
  // RESET：101 回到工地，全景回到原本的框景
  ha.show.reset(); assert.ok(a.controls.target.distanceTo(new THREE.Vector3(0.4, 0.6, 0)) < 1e-9 && Math.abs(a.camera.position.distanceTo(a.controls.target) - overviewDistance(16 / 9)) < 1e-9, 'reset restores the overview');
  // 演到一半跳過：snap 先更新天際線再回全景
  const b = skylineRig(), hb = await headlessShow({ rig: b.rig }), ev = await beforeFull(hb);
  const p = hb.show.turn(ev);
  for (let t = 0; t < 1; t += 1 / 30) { hb.show.update(1 / 30, t); b.rig.update(1 / 30); }
  assert.ok(hb.show.busy, 'still playing'); hb.show.skip(); await p;
  assert.equal(b.rig.flying, false); assert.ok(b.topNdc(hb.show) <= 0.8, `skip: top at NDC ${b.topNdc(hb.show).toFixed(3)}`);
  // reduced-motion（instant）回合一樣
  const c = skylineRig(), hc = await headlessShow({ rig: c.rig }), ec = await beforeFull(hc);
  await hc.run(ec, { instant: true });
  assert.ok(c.topNdc(hc.show) <= 0.8, `instant: top at NDC ${c.topNdc(hc.show).toFixed(3)}`);
});

// 跨進 101 點燈的回合：劇本中途先飛去 101、回全景 focus('home') 停 0.8 s，才冒 LEVEL UP。
// 點燈落在哪一回合從總等級曲線找（放置回合或最後一輪都一樣演，選擇帶動升級 §4）
test('a turn with a stage crossing into 點燈 holds the mid-script focus(home) before the LEVEL UP', async () => {
  const h = await headlessShow(), { show, rig } = h, log = [], { at } = towerCrossings(SOLUTIONS[0]);
  assert.ok(at.lit >= 1, `點燈 is reached (turn ${at.lit})`);
  const events = await beforeTurn(h, at.lit);
  let now = 0;
  const update = show.update; show.update = (dt, t) => { now = t; update(dt, t); };
  const { focus, home } = rig;
  rig.focus = (t, o) => { log.push(['focus', now, t]); return focus(t, o); };
  rig.home = ms => { log.push(['home', now, ms]); return home(ms); };
  const levelUp = show.bubbles.levelUp;
  show.bubbles.levelUp = (head, o = {}) => { log.push(['levelUp', now, o.text]); return levelUp(head, o); };
  await h.run(events);
  const lit = log.findIndex(l => l[0] === 'levelUp' && l[2] === '101 點燈');
  assert.ok(lit >= 0, 'the turn crosses into 點燈');
  const before = log.slice(0, lit), mid = before.findLastIndex(l => l[0] === 'home');
  assert.ok(mid >= 0, log.map(l => l[0]).join(' '));
  // 唯一正解 2026-10-31：點燈落在第 8 回合（颱風移到巨蛋），不是放下的回合（第 6 回合，indoors 的 settle 只留套用、LEVEL UP 與回全景）——
  // 101 的劇本照演：回全景之前先飛去 101（釘住前提：點燈哪天又落進放下的回合，這裡會失敗）
  assert.ok(!events.some(engine.landsTyphoon), `點燈 is not in the typhoon placement turn (turn ${at.lit})`);
  assert.ok(before.slice(0, mid).some(l => l[0] === 'focus'), 'the 101 script flies to 101 before the mid-script home');
  // 停 0.8 s（1 倍速：演出時間就是真實秒數）
  assert.ok(log[lit][1] - log[mid][1] >= 0.8 - 1e-6, `the home holds 0.8 s before the LEVEL UP (${(log[lit][1] - log[mid][1]).toFixed(2)} s)`);
  assert.equal(log.at(-1)[0], 'home', 'the turn still ends with the final home');
});

// 物品 v2（§3、§6）：跳級時跳過，兩級都要落地。回到 GROW 設計 §4.2：跳級合成一段——第一級沒有自己的 apply，
// 舞台從 n−2 一次套到 n（中間從來不停在 n−1）；套上之後閃白、LEVEL UP 演到一半跳過，兩級都在
test('skip during a jump lands both levels', async () => {
  const order = SOLUTIONS[0];
  let s = engine.createState(spec), at = -1, r = null;
  // 找第一個有跳級的放置回合；之前的回合瞬間演完（live 與 ref 兩個舞台一樣）
  const live = await headlessShow(), ref = await headlessShow();
  for (const [i, id] of order.entries()) {
    r = place(s, id);
    if (r.events.some(e => e.jump)) { at = i; break; }
    s = r.state;
    for (const h of [live, ref]) await h.run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.ok(at >= 0, 'a solution turn has a jump');
  const jump = r.events.find(e => e.jump), events = [...r.events, { kind: 'settle' }];
  await ref.run(events, { instant: true });
  // live：演到跳級合成的那一段把舞台套到 n，再 0.1 s（閃白中）跳過
  let started = null, before = null;
  const seen = new Set();
  const p = live.show.turn(events, { onMark: e => { if (e === jump) { started = live.show.elapsed; before = live.show.stage.lv[jump.item]; } } });
  for (let t = 0; started === null || live.show.stage.lv[jump.item] !== jump.to; t += 1 / 30) {
    live.show.update(1 / 30, t); assert.ok(t < 60, 'reaches the jump');
    if (started !== null) seen.add(live.show.stage.lv[jump.item]);
  }
  for (let k = 0; k < 3; k++) live.show.update(1 / 30, 100 + k / 30);
  assert.equal(before, jump.from - 1, 'the first level never applied on its own: n − 2 when the merged event starts');
  assert.ok(!seen.has(jump.from), 'the stage goes from n − 2 straight to n');
  assert.ok(live.show.busy && live.show.blink.count + live.show.bubbles.count > 0, 'mid-jump: the merged level is still showing');
  live.show.skip(); await p;
  assert.equal(live.show.stage.lv[jump.item], jump.to);
  assert.deepEqual(live.show.stage.lv, r.state.lv);
  assert.equal(live.show.stage.pendingKeys().length, 0);
  assert.deepEqual(snapshot(live.show), snapshot(ref.show));
});

// 回到 GROW 設計 §4.2 的整局探針：兩條正解 live 演完（真的鏡頭 rig），跳級合成、起因閃一下之後共用不變式照樣乾淨
// （不穿牆、不瞬移、換位置閃白、每回合回全景、每個 LEVEL UP 字樣至少一半時間在畫面裡）；
// 每回合起因閃一下 ≤ 4 段（mark 的 info.cause；真的閃了的看 blink.part 收到 CAUSE_FLASH 秒），
// LEVEL UP 彈兩次的第二個字樣（bubbles.levelUp 收到 dy）次數 = 引擎這回合 jump: true 的 grow 個數
test('both solutions live with merged jumps and cause flashes: invariants clean, ≤ 4 cause flashes per turn, one twice LEVEL UP per engine jump', async () => {
  const { CAUSE_FLASH } = await import('../src/show/turn.js');
  for (const order of SOLUTIONS) {
    const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam });
    let flashed = 0, seconds = 0, causes = 0, total = 0, lit = 0;
    const part = show.blink.part, levelUp = show.bubbles.levelUp;
    show.blink.part = (o, dur, ...rest) => { if (dur === CAUSE_FLASH) flashed++; return part(o, dur, ...rest); };
    show.bubbles.levelUp = (head, opts = {}) => { if (opts.dy > 0) seconds++; return levelUp(head, opts); };
    let s = engine.createState(spec);
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state; flashed = 0; seconds = 0; causes = 0;
      const what = `${order.join('>')} turn ${i + 1}`;
      inv.label(what);
      await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => { inv.label(`${what} [${e.kind} ${e.item ?? ''}${e.to ?? ''}]`); if (info?.cause) causes++; } });
      inv.turnEnd();
      // 兩級都是 ◆ 的跳級不合成（Task 6a 修正輪裁決）：各一個 LEVEL UP，不算
      const isKey = e => !!ALL.find(m => m.id === e.item)?.script?.grow?.[e.to]?.key;
      const jumps = r.events.filter(e => e.kind === 'grow' && e.jump && !(isKey(e) && isKey({ ...e, to: e.to - 1 }))).length;
      assert.ok(causes <= 4 && flashed <= causes, `${what}: ${causes} cause segments, ${flashed} flashes`);
      assert.equal(seconds, jumps, `${what}: one twice LEVEL UP per jump (${jumps})`);
      total += causes; lit += flashed;
      assert.deepEqual(show.stage.lv, s.lv, `${what}: stage levels equal the engine`);
    }
    assert.ok(total > 0 && lit > 0, `${order.join('>')}: some cause flashes play (${lit}/${total})`);
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);
    assert.deepEqual(inv.camera, []);
    assert.deepEqual(inv.labels, []);
  }
});

// Task 3 裁決 B（Task 6 落實）：起因段（mark 的 info.cause：空拍、平移到幫手、閃白、平移回目標）自己一個 mark、單獨量——
// 有起因的升級，劇本秒數（不含 focus 拍、扣掉空拍）跟同一回合把 via 拿掉（沒有起因段）演出來的一樣（差 ≤ 0.2 s：日常的人位置不同）；
// run() 回的整回合劇本秒數也不含閃白；起因段扣掉空拍 ≥ CAUSE_FLASH、≤ CAUSE_CAP（多 0.2 s 是每拍接下一拍的幀取整）；playLive 把它掛在事件的 cause 上
test('a caused grow\'s script seconds exclude the cause segment, which is measured on its own (≤ CAUSE_CAP)', async () => {
  const { CAUSE_FLASH, CAUSE_CAP } = await import('../src/show/turn.js'), { playLive } = await import('./helpers/show.js');
  const order = SOLUTIONS[0], steps = turnSteps(order);
  // 第一個有起因段的回合（grow 的 via 不是颱風）
  let s0 = engine.createState(spec), at = -1;
  for (const [i, step] of steps.entries()) { const r = step(s0); s0 = r.state; if (r.events.some(e => e.kind === 'grow' && e.via?.length && e.via[0] !== 'typhoon' && !e.jump)) { at = i; break; } }
  assert.ok(at >= 0, 'a solution turn has a caused grow');
  const playTurn = async strip => {
    const { show, run, scriptElapsed } = await headlessShow();
    let s = engine.createState(spec), out = null;
    for (const [i, step] of steps.slice(0, at + 1).entries()) {
      const r = step(s); s = r.state;
      const evs = [...r.events.map(e => (strip && e.via ? { ...e, via: [] } : e)), { kind: 'settle' }], marks = [];
      const secs = await run(evs, { instant: i < at, onMark: (e, info) => marks.push({ e, at: show.elapsed, sc: scriptElapsed(), info }) });
      if (i === at) out = { secs, marks, endSc: scriptElapsed() };
    }
    return out;
  };
  const caused = await playTurn(false), plain = await playTurn(true);
  // 每個事件劇本那一段（不是起因段的 mark）的劇本秒數；拿掉 via 的那次事件是複本，用「種類 物品 級」對（一回合裡不重複）
  const id = e => `${e.kind} ${e.item} ${e.to}`;
  const scripts = t => new Map(t.marks.flatMap((m, j) => (m.info?.cause ? [] : [[id(m.e), (t.marks[j + 1]?.sc ?? t.endSc) - m.sc - (m.info?.gap ?? 0)]])));
  const a = scripts(caused), b = scripts(plain);
  const segs = caused.marks.flatMap((m, j) => (m.info?.cause ? [[m, caused.marks[j + 1]]] : []));
  assert.ok(segs.length > 0, 'the turn plays a cause segment');
  for (const [m, next] of segs) {
    assert.equal(next.e, m.e, 'the cause segment is followed by its own event\'s mark'); assert.equal(next.info.cause, undefined); assert.equal(next.info.gap, 0);
    const live = next.at - m.at - (m.info.gap ?? 0), k = id(m.e);
    assert.ok(live >= CAUSE_FLASH && live <= CAUSE_CAP + 0.2, `${m.e.item} ${m.e.to} cause segment ${live.toFixed(2)} s`);
    assert.ok(Math.abs(a.get(k) - b.get(k)) <= 0.2, `${m.e.item} ${m.e.to}: script ${a.get(k).toFixed(2)} s with the cause segment, ${b.get(k).toFixed(2)} s without`);
  }
  assert.ok(Math.abs(caused.secs - plain.secs) <= 0.3, `run() script seconds ${caused.secs.toFixed(2)} vs ${plain.secs.toFixed(2)} without causes`);
  // playLive：起因段不另成一筆，掛在事件的 cause 上；事件自己的 live 不含它
  const ev = (await playLive(order)).filter(x => x.turn === at + 1 && x.cause);
  assert.ok(ev.length === segs.length && ev.every(x => x.cause.live >= CAUSE_FLASH && x.cause.live <= CAUSE_CAP + 0.2 && x.cause.helper === x.e.via[0]), JSON.stringify(ev.map(x => x.cause)));
});

// Task 6a 修正輪（控制者裁決）：劇本永遠不丟錯——沒法照原樣演就演退路（燈泡 Lv7 沒列車那種）。修正輪 2：列舉的前 20 個太像（都是鮮奶、晶片、燈泡開頭），
// 改成整份列舉每隔 STRIDE 個取一個，加上兩局固定的壞結局。
// 每回合（放置、最後一輪、終局回合）都瞬間演完（instant：每拍照樣 start → end），沒有一個劇本丟錯，舞台等級跟引擎一樣。
// 計畫 9 連鎖（2026-10-30，設計 §8 R3）：燈泡 7 要代幣 ≥5，「沒列車就到燈泡 7」在規則下到不了——原本的明確沒車放法
//   （燈泡、鮮奶、晶片、珍奶、老鼠、棒球、颱風、代幣）與「取樣裡有沒車的局」兩條斷言拿掉，改成整份列舉（引擎層，不演）裡
//   燈泡到 7 的那一刻（舞台的鏡像：回合開頭疊到那個事件）hasTrain 一定為真；退路程式留著當防呆，由 bulb.test 用合成狀態直接呼叫劇本驗
test('no script throws: an even stride over the enumeration and EXAMPLE.hit/deflect play every turn (instant) without an error; bulb reaches 7 only with a train running', async () => {
  const { EXAMPLE, finaleStep } = await import('./helpers/endings.js');
  const { hasTrain } = await import('../src/actors/token.js');
  const all = enumerate(spec), STRIDE = 2000,   // 列舉是 8! = 40320 局，每 2000 個取一個 ≈ 21 局：每局 9 回合都要瞬間演完、跑得完；又散在整份列舉裡（不像前 20 個全是同一種開頭）
   strided = all.filter((_, k) => k % STRIDE === 0).map(r => r.order);
  // 整份列舉：燈泡 6 → 7（跳級 6 → 8 的第一級也是這個事件；合成的第二級演同一段 ◆，代幣與旗標在兩個事件之間不變）時有列車在跑
  const noTrain = [];
  let reached = 0;
  for (const { order } of all) {
    let s = engine.createState(spec);
    for (const [i, step] of turnSteps(order).entries()) {
      let view = { lv: s.lv, flags: s.flags };
      const r = step(s); s = r.state;
      for (const e of r.events) {
        view = engine.foldEvent(view, e);
        if (e.kind === 'grow' && e.item === 'bulb' && e.from < 7 && e.to >= 7) { reached++; if (!hasTrain(view.lv, view.flags)) noTrain.push(`${order.join('>')} turn ${i + 1}: token ${view.lv.token}${view.flags.flooded ? ' flooded' : ''}`); }
      }
    }
  }
  assert.ok(reached > 1000, `${reached} games reach bulb 7`);
  assert.deepEqual(noTrain.slice(0, 5), [], `${noTrain.length} games reach bulb 7 with no train`);
  const orders = [...strided, EXAMPLE.hit, EXAMPLE.deflect];
  const { show, run } = await headlessShow(), bad = [];
  for (const order of orders) {
    show.reset();
    let s = engine.createState(spec), at = '';
    try {
      for (const [i, step] of turnSteps(order).entries()) {
        at = `turn ${i + 1}`; const r = step(s); s = r.state;
        await run([...r.events, { kind: 'settle' }], { instant: true });
        if (JSON.stringify(show.stage.lv) !== JSON.stringify(s.lv)) bad.push(`${order.join('>')} ${at}: stage ${JSON.stringify(show.stage.lv)}`);
      }
      at = 'finale'; await run(finaleStep(s).events, { finale: true, instant: true });
    } catch (err) { bad.push(`${order.join('>')} ${at}: ${err.message}`); }
  }
  assert.ok(strided.length >= 20, `${strided.length} strided orders`);
  assert.deepEqual(bad, []);
});

// 物品 v2：每個演員的 view 認得每一級（過渡期的 clamp.js 已拿掉）；兩條正解 live 演完，每一級都有 LEVEL UP、最後全滿。
// 手機畫質（quality 'low'，裁決 R18：名冊少載模型、零件省 draw call）也演一次——少掉的模型不能讓劇本出錯或卡住
test('both new solutions play to the end without a script error at every level (high and low quality)', async () => {
  const top = Object.fromEntries(spec.ORDER.map(id => [id, spec.ITEMS[id].max]));
  for (const mod of ALL) for (const id of spec.ORDER) for (let n = 0; n <= top[id]; n++) assert.doesNotThrow(() => mod.view({ ...top, [id]: n }, {}, {}), `${mod.id} with ${id} ${n}`);
  for (const quality of ['high', 'low']) {
    const { show, run, bubblesLog } = await headlessShow({ quality });
    for (const order of SOLUTIONS) {
      show.reset(); bubblesLog.length = 0;
      let s = engine.createState(spec), grows = 0;
      const steps = [...order.map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
      for (const [i, step] of steps.entries()) {
        const r = step(s); s = r.state; grows += r.events.filter(e => e.kind === 'grow').length;
        await run([...r.events, { kind: 'settle' }]);
        assert.deepEqual(show.stage.lv, s.lv, `${order.join('>')} step ${i + 1}`);
      }
      assert.deepEqual(show.stage.lv, top, `${quality}: all max`);
      assert.ok(bubblesLog.filter(b => b.text === 'LEVEL UP').length >= grows, `${quality} ${order.join('>')}: a LEVEL UP for every grow (${grows})`);
    }
  }
});

// 使用者規則（計畫 4 任務 9）：颱風登陸（landsTyphoon）之後，同一回合的事件只演 [apply, LEVEL UP]——大家躲在屋裡，沒有人走路；
// 不補鏡頭平移、不空拍。閃白照常（apply 不關 blink）；撲空不演（計畫 6：大家躲著）。
// 裁決 R14：◆ 關鍵級（script.grow[n].key）照演劇本（老鼠不躲雨、霓虹不用人；藏起來的人由拍自己跳過）
const isKey = e => e.kind === 'grow' && !!ALL.find(m => m.id === e.item)?.script?.grow?.[e.to]?.key;
test('after the typhoon lands, the rest of the turn plays only apply + LEVEL UP (◆ key levels excepted): no walk, gesture, bubble or lead focus except one back home after a key script moved the camera; blinks still happen', async () => {
  const { buildTurn } = await import('../src/show/turn.js');
  const { B: beats } = await import('../src/show/beats.js');
  const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  for (const order of SOLUTIONS) {
    let s = engine.createState(spec), events = null, before = null;
    for (const step of [...order.map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))]) {
      const r = step(s);
      if (r.events.some(engine.landsTyphoon)) { events = [...r.events, { kind: 'settle' }]; before = s; break; }
      s = r.state;
    }
    assert.ok(events, `${order.join('>')} has a landing turn`);
    const i0 = events.findIndex(engine.landsTyphoon);
    assert.ok(events.slice(i0 + 1).some(e => e.kind === 'grow' && !isKey(e)), 'a plain level grows after the landing');
    assert.ok(events.slice(i0 + 1).some(isKey), 'a key level grows after the landing (bulb 9; alien: rat 4)');
    {
      const ctx = { B: beats, stage: { tilted: new Set() }, roster: { members: () => [], keys: () => [], nearest: () => null } };
      const out = buildTurn(events, { modules: ALL, spec, lv: before.lv, flags: before.flags, meta: { total: 0 } }, ctx);
      // 把拍依 mark 切成每個事件的一段
      const seg = new Map(); let cur = null;
      for (const b of out) { if (b.kind === 'mark') { b.start({ onMark: e => { cur = e; } }); seg.set(cur, []); } else if (cur) seg.get(cur).push(b); }
      assert.ok(flat(seg.get(events[i0])).some(b => b.kind === 'crowd' || b.kind === 'walk'), 'the landing itself still sends people to the doors');
      // 鏡頭：登陸回全景；◆ 關鍵劇本把鏡頭帶走（最後一個 focus 不是全景）之後，下一個 indoors 事件前面補一拍回全景（審稿：外星倒數 1
      // 老鼠 Lv4 對著溫泉，之後珍奶 5、棒球 6 的 LEVEL UP 在畫面外），其他 indoors 事件不平移
      // 跳級合成一段（回到 GROW 設計 §4.2）：第一級只有 mark（這一段沒有拍），第二級的 LEVEL UP 彈兩次
      const firstOfJump = e => e.kind === 'grow' && events.some((x, k) => k > events.indexOf(e) && x.jump && x.item === e.item && x.from === e.to);
      let away = false, homed = 0, merged = 0;
      for (const e of events.slice(i0 + 1)) {
        const kinds = flat(seg.get(e)).map(b => b.kind), what = `${e.kind} ${e.item ?? ''} ${e.to ?? e.flag?.name ?? e.story ?? ''}`;
        if (e.kind === 'wait') continue;
        if (firstOfJump(e)) { assert.deepEqual(kinds, [], `${what}: the first level of a jump is a mark only`); continue; }
        if (e.jump) { assert.ok(flat(seg.get(e)).filter(b => b.kind === 'levelUp').every(b => b.twice), `${what}: LEVEL UP twice`); merged++; }
        assert.ok(!kinds.includes('flash'), `${what}: no cause flash after the landing`);
        if (isKey(e)) {
          assert.ok(kinds.some(k => k !== 'apply' && k !== 'levelUp'), `${what}: the key script plays (${kinds})`); assert.ok(kinds.includes('levelUp'), what);
          const focuses = flat(seg.get(e)).filter(b => b.kind === 'focus');
          if (focuses.length) away = focuses.at(-1).target !== 'home';
          continue;
        }
        for (const k of ['walk', 'gesture', 'bubble', 'jump', 'spawn', 'crowd', 'trainStop', 'wait']) assert.ok(!kinds.includes(k), `${what}: no ${k} (${kinds})`);
        if (e.kind === 'settle') continue;
        let rest = flat(seg.get(e));
        if (away) { assert.equal(rest[0]?.kind, 'focus', `${what}: back to the overview first (${kinds})`); assert.equal(rest[0].target, 'home', what); rest = rest.slice(1); away = false; homed++; }
        assert.ok(!rest.some(b => b.kind === 'focus'), `${what}: no lead focus (${kinds})`);
        assert.ok(rest.some(b => b.kind === 'apply' && b.blink !== false), `${what}: blinks`);
        if (e.kind === 'grow') assert.deepEqual(rest.map(b => b.kind), ['apply', 'levelUp', 'apply'], what);
      }
      if (order.indexOf('rat') < order.indexOf('boba')) assert.equal(homed, 1, `${order.join('>')}: one lead home after rat 4 (alien)`);
      assert.ok(merged >= 1, `${order.join('>')}: a jump lands after the landing (rat 2 → 4)`);
    }
  }
});
test('the landing turn plays live with a LEVEL UP for every grow after the landing; the next turn people walk out of their doors', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  let s = engine.createState(spec);
  const steps = [...SOLUTIONS[0].map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  // 最後一輪照 game.js 演：跟放置回合一樣補 settle
  const turnEvents = (i, events) => [...events, { kind: 'settle' }];
  for (const [i, step] of steps.entries()) {
    const r = step(s); s = r.state;
    if (!r.events.some(engine.landsTyphoon)) { await run(turnEvents(i, r.events), { instant: true }); continue; }
    const n = bubblesLog.length, after = r.events.slice(r.events.findIndex(engine.landsTyphoon) + 1).filter(e => e.kind === 'grow').length;
    await run(turnEvents(i, r.events));
    // 放下事件沒有 LEVEL UP（唯一正解：颱風到了＝放下）；之後每個 grow 都有（跳級第一級的那一個由第二級彈兩次補上）
    assert.ok(bubblesLog.slice(n).filter(b => b.text === 'LEVEL UP').length >= after, 'LEVEL UP for every grow after the landing');
    const hidden = show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.hidden);
    assert.ok(hidden.length > 0, 'people indoors at the end of the landing turn');
    const next = steps[i + 1](s), p = show.turn(turnEvents(i + 1, next.events));
    let walked = false;
    for (let t = 0; t < 0.5; t += 1 / 30) { show.update(1 / 30, t); walked ||= hidden.some(m => m.walking); }
    assert.ok(hidden.every(m => !m.hidden), 'everyone out as the next turn starts');
    assert.ok(walked, 'they walk home');
    show.skip(); await p;
    return;
  }
  assert.fail('no landing turn');
});
// 裁決 R14：正解的放下回合（唯一正解第 6 回合，颱風放下當回合就到 101 上空）——◆ 鮮奶 Lv7 在放下之後照演劇本；
// 躲進門裡的人沒被劇本拉出來（劇本手上沒有藏著的人）。（舊的外星那條 ◆ 老鼠 Lv4 分岔：外星改成壞結局，正解裡沒有了）
test('the solution landing turn live: the ◆ milk Lv7 still plays its script after the landing; hidden people stay hidden', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  let s = engine.createState(spec);
  const steps = [...SOLUTIONS[0].map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  const turnEvents = (i, events) => [...events, { kind: 'settle' }];   // 同 game.js
  for (const [i, step] of steps.entries()) {
    const r = step(s); s = r.state;
    if (!r.events.some(engine.landsTyphoon)) { await run(turnEvents(i, r.events), { instant: true }); continue; }
    const i0 = r.events.findIndex(engine.landsTyphoon), after = r.events.slice(i0 + 1);
    const keyed = after.filter(isKey);
    assert.ok(keyed.some(e => e.item === 'milk' && e.to === 7), `milk 7 comes after the landing (${keyed.map(e => e.item + e.to)})`);
    const marks = [];
    await run(turnEvents(i, r.events), { onMark: e => marks.push([e, show.elapsed, bubblesLog.length]) });
    const seg = e => { const k = marks.findIndex(([x]) => x === e); return { secs: (marks[k + 1]?.[1] ?? show.elapsed) - marks[k][1], bubbles: bubblesLog.slice(marks[k][2], marks[k + 1]?.[2]) }; };
    for (const e of keyed) assert.ok(seg(e).secs > 2.5, `◆ ${e.item} ${e.to} script played (${seg(e).secs.toFixed(1)} s)`);
    const hidden = show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.hidden);
    assert.ok(hidden.length > 0 && hidden.every(m => m.mode !== 'script'), 'people indoors stay indoors');
    // 非關鍵級只有 apply + LEVEL UP、沒有人走路：1 倍速下閃白（零件多的話依序錯開）＋LEVEL UP 1.0 s，2 s 以內
    for (const e of after.filter(x => x.kind === 'grow' && !isKey(x))) if (seg(e).secs) assert.ok(seg(e).secs <= 2, `${e.item} ${e.to} ${seg(e).secs.toFixed(2)} s`);
    return;
  }
  assert.fail('no landing turn');
});

// ── 最終章（計畫 5 任務 1，設計 §7、§9）──
test('hold(s) plays s seconds, ignores skip, ends on abort; reduced-motion resolves at once', async () => {
  const { show } = await headlessShow();
  const frames = (secs, t0 = 0) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) show.update(1 / 30, t0 + t); };
  // 照常：2 秒；中間點畫面（skip）不作用
  let done = false;
  const p = show.hold(2); p.then(() => { done = true; });
  assert.equal(show.busy, true, 'busy during the hold');
  frames(0.5); show.skip(); await Promise.resolve();
  assert.equal(done, false, 'skip does not end the hold'); assert.equal(show.busy, true);
  frames(1.4); await Promise.resolve(); assert.equal(done, false, 'still holding at 1.9 s');
  frames(0.2); await p;
  assert.ok(Math.abs(show.elapsed - 2) < 0.05, `held ${show.elapsed.toFixed(2)} s`); assert.equal(show.busy, false);
  // 中止（RESET）：立刻結束
  done = false;
  const q = show.hold(2); q.then(() => { done = true; });
  frames(0.3); show.abort(); await q;
  assert.equal(done, true); assert.equal(show.busy, false);
  done = false; const r = show.hold(2); r.then(() => { done = true; });
  frames(0.3); show.reset(); await r; assert.equal(done, true, 'reset ends it too');
  // hold 之後 skip 照常能跳過回合
  const turn = show.turn([{ kind: 'settle' }]); show.skip(); await turn; assert.equal(show.busy, false);
  // reduced-motion：0 秒
  const reduced = await headlessShow({ reducedMotion: true });
  let fast = false; const z = reduced.show.hold(2); z.then(() => { fast = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(fast, true, 'resolves at once'); assert.equal(reduced.show.busy, false);
  // 演到一半打開 reduced-motion：也立刻結束
  const mid = await headlessShow(); const m = mid.show.hold(2);
  for (let t = 0; t < 0.3; t += 1 / 30) mid.show.update(1 / 30, t);
  mid.show.setReducedMotion(true); await m; assert.equal(mid.show.busy, false);
});

// 審稿：中止過的舊 hold 收尾（Promise 的 then 晚一步才跑）不能清掉下一個 hold 的記號——不然新的 hold 被 skip 跳掉
test('a stale aborted hold does not clear the next hold: skip still cannot end it', async () => {
  const { show } = await headlessShow();
  const first = show.hold(2); show.abort();
  const second = show.hold(2); await first;
  for (let t = 0; t < 0.3 - 1e-9; t += 1 / 30) show.update(1 / 30, t);
  show.skip(); await Promise.resolve();
  assert.equal(show.busy, true, 'the second hold ignores skip');
  show.abort(); await second; assert.equal(show.busy, false);
});

test('turn(events, { finale: true }) runs at speed 1 and ends on the overview with everyone home', async () => {
  const { finaleEvents } = await import('../src/game.js');
  const endings = await import('../src/rules/endings.js');
  const speeds = [];
  // 假 finale 劇本：missile 等 1 秒（演出時間）——1 倍速就是真實 1 秒。
  // 等完不閃白地套上事件：101 照 flags.missile 換零件（矽盾擋下 → 罩子 full，任務 5），回合補的 apply 才不會再閃白多佔時間；
  // 尾聲也不閃白地套上（外星尾聲會換 101 母艦、降落場、老鼠，任務 7——預設劇本 [apply] 會閃白多佔時間）
  // 警告也不閃白（假的 finale 沒有紅光零件，只記速度）
  const fin = { id: 'finale', view: () => ({}), script: {
    warning: (e, s, c) => { speeds.push(c.speed); return [c.B.apply(e, { blink: false })]; },
    missile: (e, s, c) => { speeds.push(c.speed); return [c.B.wait(1), c.B.apply(e, { blink: false })]; },
    epilogue: (e, s, c) => [c.B.apply(e, { blink: false })],
  } };
  const modules = [...ALL.filter(m => m.id !== 'finale'), fin];
  assert.ok(ALL.some(m => m.id === 'finale'), 'the helper loads the finale module');
  const { show, run, rig } = await headlessShow({ modules });
  let s = engine.createState(spec);
  for (const step of turnSteps(SOLUTIONS[0])) { const r = step(s); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  const events = finaleEvents(endings.resolve(s, spec));
  assert.deepEqual(events.map(e => e.kind), ['warning', 'missile', 'epilogue']);
  rig.log.length = 0;
  await run(events, { finale: true });
  assert.deepEqual(speeds, [1, 1]);
  assert.ok(Math.abs(show.elapsed - 1) < 0.1, `finale turn took ${show.elapsed.toFixed(2)} s at speed 1`);
  assert.equal(show.stage.flags.alarm, 1); assert.equal(show.stage.flags.missile, 'shield'); assert.equal(show.stage.flags.epilogue, endings.resolve(s, spec).id);
  assert.deepEqual(show.stage.lv, s.lv, 'the engine levels are untouched'); assert.equal(s.flags.missile, undefined, 'the engine state carries no finale flag');
  allHome(show); assert.equal(show.busy, false);
  assert.ok(!rig.log.some(l => l[0] === 'focus'), 'no lead focus in finale mode');
  assert.equal(rig.log.at(-1)[0], 'home', 'ends on the overview');
});

// 選擇帶動升級 §4（計畫 5b 任務 3）：放下的物品當回合就長到 Lv2——一般回合裡先演 placed 劇本、再演它自己的 grow[2] 劇本（同一回合）。
// 兩條正解的每一個放置回合都 live 演一次：placed 的 mark 在 grow 2 前面、grow[2] 劇本真的有建（不是預設的 apply + LEVEL UP）、
// 演完沒有人留在劇本手上、舞台等級等於引擎；同一回合再演一次，演到 grow[2] 劇本中途按跳過：一樣沒人留在劇本手上，
// 舞台的等級、零件鍵都跟整回合瞬間演完的一樣（跳過到得了引擎的狀態）
test('placed + grow[2] in the same turn: the placed script then the grow script, roster members not left in script mode, skip reaches the engine state (each item, both solutions)', async () => {
  const scripted = m => m.roster.keys().flatMap(k => m.roster.members(k).filter(x => x.mode === 'script').map(() => k));
  for (const order of SOLUTIONS) for (let n = 0; n < order.length; n++) {
    const id = order[n], what = `${order.join('>')} turn ${n + 1} (${id})`, steps = turnSteps(order).slice(0, n + 1);
    const isPlaced = e => e.kind === 'placed' && e.item === id, isGrow2 = e => e.kind === 'grow' && e.item === id && e.to === 2;
    // 照 order 瞬間演到第 n 回合之前，回傳這一回合的事件與引擎狀態
    const upTo = async h => {
      let s = engine.createState(spec), evs = null;
      for (const [i, step] of steps.entries()) {
        const r = step(s); s = r.state;
        if (i === n) { evs = [...r.events, { kind: 'settle' }]; break; }
        await h.run([...r.events, { kind: 'settle' }], { instant: true });
      }
      return { evs, s };
    };
    // 整回合 live：mark 的順序、grow[2] 劇本有沒有建
    const h = await headlessShow(), { evs, s } = await upTo(h), mod = ALL.find(m => m.id === id), grow2 = mod.script.grow[2];
    // 颱風例外（唯一正解 §4.3）：放下那回合停在 101 上空（up[2] 要 age ≥ 1），下一回合才移到車站
    if (id === 'typhoon') { assert.ok(evs.some(isPlaced) && !evs.some(isGrow2), `${what}: the typhoon stays at Lv1 on its placement turn`); continue; }
    // 正解第 7 回合珍奶放下的同一回合颱風移到車站（§4.3 外送爆單 +1）：珍奶 1 → 2 是颱風的 fx（delta），不是珍奶自己的 grow 2
    if (evs.some(e => e.kind === 'fx' && e.delta?.target === id && e.delta.to === 2)) { assert.ok(!evs.some(isGrow2), `${what}: Lv2 comes from a reaction`); continue; }
    assert.ok(evs.some(isPlaced) && evs.some(isGrow2), `${what}: placed and grow 2 in the same turn`);
    let built = 0; mod.script.grow[2] = (...a) => { built++; return grow2(...a); };
    const marks = [];
    try { await h.run(evs, { onMark: e => marks.push(e) }); } finally { mod.script.grow[2] = grow2; }
    assert.ok(marks.findIndex(isPlaced) >= 0 && marks.findIndex(isPlaced) < marks.findIndex(isGrow2), `${what}: placed script before the grow 2 script`);
    assert.equal(built, 1, `${what}: the grow[2] script itself plays`);
    assert.deepEqual(scripted(h.show), [], `${what}: nobody left in script mode`);
    assert.deepEqual(h.show.stage.lv, s.lv, `${what}: stage levels equal the engine`);
    // 同一回合瞬間演完的樣子（跳過要到的狀態）
    const ref = await headlessShow(); await upTo(ref); await ref.run(evs, { instant: true });
    // 再演一次，grow[2] 劇本開演 0.5 s 後跳過
    const k = await headlessShow(), again = await upTo(k);
    let at = null, t = 0;
    const p = k.show.turn(again.evs, { onMark: e => { if (isGrow2(e)) at = t; } });
    while (at === null || t < at + 0.5) { k.show.update(1 / 30, t); t += 1 / 30; await Promise.resolve(); assert.ok(t < 120, `${what}: grow 2 reached`); }
    assert.ok(k.show.busy, `${what}: still playing when skipped`);
    k.show.skip(); await p;
    assert.deepEqual(scripted(k.show), [], `${what}: skip leaves nobody in script mode`);
    assert.deepEqual(k.show.stage.lv, again.s.lv, `${what}: skip reaches the engine levels`);
    assert.deepEqual(new Set(k.show.stage.partKeys()), new Set(ref.show.stage.partKeys()), `${what}: skip reaches the same parts as an instant turn`);
    assert.deepEqual(k.show.stage.flags, ref.show.stage.flags, `${what}: same flags`);
  }
});
