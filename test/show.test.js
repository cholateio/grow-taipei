// test/show.test.js：createShow 把時間軸、名冊、舞台接起來——整局無頭演完、跳過、RESET、忙碌中擋下
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, ALL, turnSteps, towerCrossings, overviewRig, gameInvariants, blinkLog } from './helpers/show.js';
import { anchorWorld } from '../src/actors/anchors.js';
import * as B from '../src/show/beats.js';
import * as THREE from '../vendor/three/three.module.js';
import { createCameraRig, overviewDistance } from '../src/scene/camera.js';
import { cellCentre } from '../src/actors/anchors.js';
import { finaleStep, EXAMPLE } from './helpers/endings.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 唯一正解（賽博），從求解器取
// 這回合會冒幾個 LEVEL UP：每個 grow 一個，合成的跳級（第二級 jump: true、兩級不都是 ◆）兩個 grow 只冒一個大一號的（2026-11-04 之前是彈兩次）
const isKeyLevel = (id, n) => !!ALL.find(m => m.id === id)?.script?.grow?.[n]?.key;
const expectedLevelUps = events => events.filter(e => e.kind === 'grow').length - events.filter(e => e.kind === 'grow' && e.jump && !(isKeyLevel(e.item, e.to) && isKeyLevel(e.item, e.to - 1))).length;

const allHome = show => { for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k); };
// 舞台與名冊的最終狀態：零件鍵、每個名冊的人數與配件
const snapshot = show => ({
  parts: show.stage.partKeys().sort(),
  roster: Object.fromEntries(show.roster.keys().sort().map(k => [k, show.roster.members(k).map(m => m.walker?.accessory ?? m.kind)])),
  lv: show.stage.lv, flags: show.stage.flags, meta: show.stage.meta,
});
const place = (s, id) => engine.place(s, id, spec);

test('the solution plays through headlessly: every turn ends with stage levels equal to the engine, no pending parts, members home', async () => {
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

// 颱風放下（唯一正解修正輪 1）：每個人走到門口各自藏起來、躲一下就在放下的劇本裡走出來——放下那一段演完之後、回合結束時都沒有人藏著
test('people hidden at their doors during the typhoon placed script are back out before the next event and at the end of the turn', async () => {
  const { show, run } = await headlessShow();
  let s = engine.createState(spec), done = false;
  for (const step of [...SOLUTIONS[0].map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))]) {
    const r = step(s); s = r.state;
    const evs = [...r.events, { kind: 'settle' }];
    if (!r.events.some(engine.landsTyphoon)) { await run(evs, { instant: true }); continue; }
    const hide = show.roster.hide; let hid = 0, after = null, placedSeen = false;
    show.roster.hide = m => { hid++; return hide(m); };
    try {
      await run(evs, { onMark: e => {
        if (placedSeen && after === null && !engine.landsTyphoon(e)) after = show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.hidden).length;
        if (engine.landsTyphoon(e)) placedSeen = true;
      } });
    } finally { show.roster.hide = hide; }
    assert.ok(hid > 0, 'somebody took shelter');
    assert.equal(after, 0, 'nobody hidden once the placed segment ends');
    assert.equal(show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.hidden).length, 0, 'nobody hidden at the end of the turn');
    done = true; break;
  }
  assert.ok(done);
});

// 老鼠撞歪牛奶箱（§8.6「下回合白光扶正」，§13.2 改成零件自己閃白；撞歪珍奶攤車唯一正解 §5.2 拿掉了）。
//   牛奶箱：選擇帶動升級之後鮮奶放下當回合就是 Lv2，老鼠放下時鮮奶一定 ≥ 2（被咬是掉級翻倒、不是撞歪），
//   真的一局走不到「鮮奶 Lv1 被咬」——直接演事件：鮮奶停在 Lv1，老鼠放下咬一口（delta 1 → 1，撞歪）
const biteTurns = () => [
  [{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'settle' }],
  [{ kind: 'placed', item: 'rat', to: 1 }, { kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 1 } }, { kind: 'settle' }],
  [{ kind: 'placed', item: 'chip', to: 1 }, { kind: 'settle' }],
];
for (const [turns, key, rz] of [[biteTurns, 'milk.crate', 0.35]]) {
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

// 2026-10-31 錄影（蓋晶片廠時有人從圍籬中間穿出來）：Lv1 工地（chip.main 黃色圍籬 ±0.8）有 footprint，
// 放下那一刻站在工地裡的人當幀閃白換到外面（roster：footprint 變了、日常的人被新建築蓋到 → relocate）——
// milk、baseball 瞬間演完，第 3 回合放晶片 live（種子 1–20）：工地還是 Lv1 的時候外擴 footprint 裡沒有人超過 1 幀、不變式 walls 空
test('placing the chip site live (milk, baseball, chip; seeds 1–20): nobody stays inside the padded fence for more than a frame, no wall problems', async () => {
  const { PAD } = await import('../src/show/nav.js'), AT = anchorWorld('chip'), H = 1.66 / 2 + PAD;
  const inSite = m => !m.hidden && !m.gone && Math.abs(m.pos.x - AT.x) <= H && Math.abs(m.pos.z - AT.z) <= H;
  let covered = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { show, run } = await headlessShow({ seed });
    let s = engine.createState(spec);
    for (const id of ['milk', 'baseball']) { const r = place(s, id); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
    // 放之前散步幾秒（種子不同，島民走到的地方不同）
    for (let i = 0; i < 30 * (seed % 5); i++) show.update(1 / 30, i / 30);
    // 修正批次 max-skip §E 之後島民只剩 101 格一位（家在 101 西南邊），沒有人會散步到晶片格的工地裡：
    // 每三個種子放一個在工地裡的路人（測試自己的名冊、位置照種子錯開），量的是同一件事——圍籬立起來那一刻在裡面的人被換到外面。
    // 三個裡一個在工地裡散步（修正輪 1 審稿 Minor：走路中的人被圍籬蓋到那條路徑），另外兩個站著
    if (seed % 3 === 0) {
      const p = { x: AT.x + ((seed * 0.37) % 1.2) - 0.6, y: AT.y, z: AT.z + ((seed * 0.53) % 1.2) - 0.6, yaw: 0 };
      const home = seed % 9 === 0 ? { kind: 'wander', at: p, r: 0.4 } : { kind: 'stand', spots: [p], rescue: true };
      show.roster.declare('test.loiterer', { kind: 'roster', at: p, n: 1, home }); show.roster.snap();
    }
    const inv = gameInvariants(show), update = show.update, streak = new Map(), long = [];
    let fenced = false;
    show.update = (dt, t) => {
      const before = !fenced && show.roster.keys().some(k => show.roster.members(k).some(inSite));   // 圍籬立起來那一幀之前就站在工地裡
      update(dt, t);
      if (!fenced && show.stage.partObject('chip.main')) { fenced = true; if (before) covered++; }
      if (!fenced || show.stage.lv.chip !== 1) return;   // Lv2 起是廠房（另一個 footprint）
      for (const k of show.roster.keys()) for (const m of show.roster.members(k)) {
        const n = inSite(m) ? (streak.get(m) ?? 0) + 1 : 0; streak.set(m, n);
        if (n > 1) long.push(`seed ${seed} ${k}#${m.i} ${m.mode} at (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)}) ${n} frames`);
      }
    };
    inv.label(`seed ${seed} chip`);
    const r = place(s, 'chip');
    await run([...r.events, { kind: 'settle' }]);
    for (let i = 0; i < 90; i++) show.update(1 / 30, 100 + i / 30);
    show.update = update;
    assert.ok(fenced, `seed ${seed}: the fence went up`);
    assert.deepEqual(long.slice(0, 10), [], `seed ${seed}: ${long.length} frames inside the fence`);
    assert.deepEqual([...inv.walls].slice(0, 10), [], `seed ${seed}: ${inv.walls.size} inside a building`);
  }
  console.log(`# chip site: ${covered} of 20 seeds had someone inside when the fence went up`);
  assert.ok(covered >= 3, `the seeds do cover someone standing in the site (${covered})`);
});

// 唯一正解修正輪 1：颱風放下那回合不再整回合躲著——躲一下又出來，wait 事件演到時工程師已經回到外面；
// 撲空拿掉了（R10）：wait 不演任何一段；沒有任何圖框泡泡
test('the typhoon placement turn: the engineers are back out by the wait, no miss plays, no icon bubble', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  let s = engine.createState(spec);
  // 晶片、颱風——第二回合就是颱風放下的回合（晶片 Lv2 等燈泡）。修正批次 2：棒球 ≤3 放颱風會淹巨蛋（鎖住、不算在等），改用晶片的工程師
  for (const id of ['chip']) { const r = place(s, id); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  const r = place(s, 'typhoon');
  assert.ok(r.events.some(engine.landsTyphoon), 'placing the typhoon');
  assert.ok(!r.events.some(e => e.lock), 'no lock: nothing to flood');
  const w = r.events.filter(e => e.kind === 'wait').at(-1)?.waits?.[0];
  assert.equal(w?.item, 'chip', 'the chip waits on the placement turn');
  bubblesLog.length = 0;
  const marks = [], owners = () => show.roster.members('chip.engineers');
  await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => { marks.push(info); if (e.kind === 'wait') assert.ok(owners().length && owners().every(m => !m.hidden), 'the engineers are back out'); } });
  assert.ok(!marks.some(i => i?.miss), 'no miss segment');
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

// §14.3 人分散：唯一正解整局 live 演完，最後沒有哪一格主島的格子站了超過所有露出來的人（主島上）的 40%
test('live, the solution: at the end no main cell has more than 40% of all visible members (spread check)', async () => {
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
  // 階段名 2026-11-03 拿掉了：101 的 LEVEL UP 跟別人一樣是「LEVEL UP」——settle 是回合最後一個事件，所以是這回合最後一個 LEVEL UP
  const lit = log.findLastIndex(l => l[0] === 'levelUp');
  assert.ok(lit >= 0 && log[lit][2] === 'LEVEL UP', 'the turn crosses into 點燈 (a bare LEVEL UP)');
  const before = log.slice(0, lit), mid = before.findLastIndex(l => l[0] === 'home');
  assert.ok(mid >= 0, log.map(l => l[0]).join(' '));
  // 唯一正解 2026-10-31：點燈落在第 8 回合（颱風移到巨蛋），不是放下的回合（第 6 回合）——101 的劇本照演：回全景之前先飛去 101。
  // （修正輪 1 之後放下的回合也照演，不再只留套用與 LEVEL UP；這條只釘住正解點燈的回合）
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
  // 找第一個有「不是 ◆」跳級的放置回合（唯一正解修正輪 1：第一個跳級是 ◆ 代幣 4，◆ 劇本套用之後不一定在閃——改看一般的合成跳級，
  // 第 6 回合晶片 2 → 4）；之前的回合瞬間演完（live 與 ref 兩個舞台一樣）
  const keyOf = (id, n) => !!ALL.find(m => m.id === id)?.script?.grow?.[n]?.key, plainJump = e => e.jump && !keyOf(e.item, e.to) && !keyOf(e.item, e.to - 1);
  const live = await headlessShow(), ref = await headlessShow();
  for (const [i, id] of order.entries()) {
    r = place(s, id);
    if (r.events.some(plainJump)) { at = i; break; }
    s = r.state;
    for (const h of [live, ref]) await h.run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.ok(at >= 0, 'a solution turn has a jump');
  const jump = r.events.find(plainJump), events = [...r.events, { kind: 'settle' }];
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

// 回到 GROW 設計 §4.2 的整局探針：唯一正解 live 演完（真的鏡頭 rig），跳級合成之後共用不變式照樣乾淨
// （不穿牆、不瞬移、換位置閃白、每回合回全景、每個 LEVEL UP 字樣至少一半時間在畫面裡）；mark 的 info 不再有 cause（起因提示 2026-10-31 拿掉，R22）；
// 跳級版 LEVEL UP（bubbles.levelUp 收到 big）次數 = 引擎這回合 jump: true 的 grow 個數（2026-11-04 之前是彈兩次的第二個字樣）
test('the solution live with merged jumps: invariants clean, no cause marks, one big LEVEL UP per engine jump', async () => {
  for (const order of SOLUTIONS) {
    const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam });
    let seconds = 0;
    const levelUp = show.bubbles.levelUp;
    show.bubbles.levelUp = (head, opts = {}) => { if (opts.big) seconds++; return levelUp(head, opts); };
    let s = engine.createState(spec);
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state; seconds = 0;
      const what = `${order.join('>')} turn ${i + 1}`;
      inv.label(what);
      await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => { inv.label(`${what} [${e.kind} ${e.item ?? ''}${e.to ?? ''}]`); assert.equal(info?.cause, undefined, `${what}: no cause segment`); } });
      inv.turnEnd();
      // 兩級都是 ◆ 的跳級不合成（Task 6a 修正輪裁決）：各一個 LEVEL UP，不算
      const isKey = e => !!ALL.find(m => m.id === e.item)?.script?.grow?.[e.to]?.key;
      const jumps = r.events.filter(e => e.kind === 'grow' && e.jump && !(isKey(e) && isKey({ ...e, to: e.to - 1 }))).length;
      assert.equal(seconds, jumps, `${what}: one big LEVEL UP per jump (${jumps})`);
      assert.deepEqual(show.stage.lv, s.lv, `${what}: stage levels equal the engine`);
    }
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);
    assert.deepEqual(inv.camera, []);
    assert.deepEqual(inv.labels, []);
  }
});

// 計畫 11 §設計 1／裁決 R15、R20、R22（使用者 2026-10-31「閃一下」：長出來的建築不再亮、起因提示整個拿掉）：唯一正解整局 live（真的鏡頭 rig），
// 舞台零件從頭到尾一次 blink.part 都沒有——建築只長出來（blink.grow）、其餘零件直接出現、拿掉的縮下去（blink.shrink）。
// 名冊的人（模型 holder 換位置／換裝的閃白，計畫 6 裁決 R3）不是零件，不算。量表印在 diagnostic；共用不變式照樣乾淨
test('the solution live: no stage part ever glows; buildings grow without a glow; removals shrink; invariants clean', async t => {
  for (const order of SOLUTIONS) {
    const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam }), log = blinkLog(show);
    let s = engine.createState(spec);
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state;
      const what = `${order.join('>')} turn ${i + 1}`;
      inv.label(what); log.label(`${i + 1}`);
      await run([...r.events, { kind: 'settle' }], { onMark: e => { const ev = `${e.kind} ${e.item ?? ''}${e.to ?? ''}`; inv.label(`${what} [${ev}]`); log.label(`${i + 1} ${ev}`); } });
      inv.turnEnd();
    }
    const row = c => `${c.label} | ${c.fn}${c.dur ? ` ${c.dur}` : ''} | ${c.key ?? '?'} | ${c.member ? 'member' : ''} | ${c.from}`;
    t.diagnostic(`${order.join('>')}: ${log.calls.length} calls\n${log.calls.map(row).join('\n')}`);
    const parts = log.calls.filter(c => c.fn === 'part' && !c.member);
    assert.deepEqual(parts.map(row), [], 'no stage part glows at all (R20／R22: growing buildings only grow; no cause hint)');
    const grows = log.calls.filter(c => c.fn === 'grow');
    assert.ok(grows.length, 'buildings still grow');
    assert.ok(grows.every(c => c.from.startsWith('actors/stage.js')), `grow only from the stage commit: ${grows.filter(c => !c.from.startsWith('actors/stage.js')).map(row)}`);
    assert.ok(log.calls.some(c => c.fn === 'shrink'), 'removed parts shrink');
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);
    assert.deepEqual(inv.camera, []);
    assert.deepEqual(inv.labels, []);
  }
});

// 計畫 11 Review Focus 2：縮到一半的零件，跳過／RESET 時立刻回原大小並拿掉，不留半截（唯一正解第 3 回合棒球 3 收掉壘線與看台）
for (const how of ['skip', 'reset']) {
  test(`${how} mid-shrink: the shrinking part is restored and dropped at once`, async () => {
    const { show, run } = await headlessShow(), steps = turnSteps(SOLUTIONS[0]);
    let s = engine.createState(spec);
    for (const step of steps.slice(0, 2)) { const r = step(s); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
    const r = steps[2](s), shrinking = [], shrinkY = new Map(), shrink = show.blink.shrink;
    show.blink.shrink = (o, ...rest) => { shrinking.push(o); shrinkY.set(o, o.position.y); return shrink(o, ...rest); };
    const p = show.turn([...r.events, { kind: 'settle' }]);
    for (let t = 0; t < 60 && !(shrinking.length && show.blink.has(shrinking[0]) && shrinking[0].scale.y < 0.9); t += 1 / 30) { show.update(1 / 30, t); await Promise.resolve(); }
    assert.ok(shrinking.length && shrinking[0].scale.y < 0.9, 'caught a part mid-shrink');
    if (how === 'skip') { show.skip(); await p; } else { show.reset(); await p.catch(() => {}); }
    for (const o of shrinking) { assert.equal(o.parent, null, 'dropped'); assert.equal(o.scale.y, 1, 'restored first'); assert.equal(o.position.y, shrinkY.get(o), 'position.y restored too'); assert.ok(!show.blink.has(o)); }
    assert.equal(show.blink.count, 0);
  });
}

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
  assert.ok(reached > 700, `${reached} games reach bulb 7`);   // 整份列舉：R25 之後 986 條到燈泡 7；計畫 14（雨中放下的燈泡／代幣被鎖）之後 770 條
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

// 物品 v2：每個演員的 view 認得每一級（過渡期的 clamp.js 已拿掉）；唯一正解 live 演完，每一級都有 LEVEL UP、最後全滿。
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
        const r = step(s); s = r.state; grows += expectedLevelUps(r.events);
        await run([...r.events, { kind: 'settle' }]);
        assert.deepEqual(show.stage.lv, s.lv, `${order.join('>')} step ${i + 1}`);
      }
      assert.deepEqual(show.stage.lv, top, `${quality}: all max`);
      assert.ok(bubblesLog.filter(b => b.text === 'LEVEL UP').length >= grows, `${quality} ${order.join('>')}: a LEVEL UP for every grow (${grows})`);
    }
  }
});

// 唯一正解修正輪 1：拿掉舊的使用者規則（計畫 4 任務 9：颱風登陸之後同一回合只演 [apply, LEVEL UP]）——颱風放下的回合，
// 後面的事件照一般事件建拍：劇本裡的走路／泡泡／小動作照演（起因提示 2026-10-31 拿掉了，R22）
test('after the typhoon is placed the rest of the turn is built like any turn: walks, bubbles and gestures stay', async () => {
  const { buildTurn } = await import('../src/show/turn.js');
  const { B: beats } = await import('../src/show/beats.js');
  const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  let s = engine.createState(spec), events = null, before = null;
  for (const step of [...SOLUTIONS[0].map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))]) {
    const r = step(s);
    if (r.events.some(engine.landsTyphoon)) { events = [...r.events, { kind: 'settle' }]; before = s; break; }
    s = r.state;
  }
  assert.ok(events, 'the solution places the typhoon');
  const ctx = { B: beats, stage: { tilted: new Set() }, roster: { members: () => [], keys: () => [], nearest: () => null } };
  const out = buildTurn(events, { modules: ALL, spec, lv: before.lv, flags: before.flags, meta: { total: 0 } }, ctx);
  const seg = new Map(); let cur = null, i0 = -1;
  for (const b of out) { if (b.kind === 'mark') { b.start({ onMark: e => { cur = e; } }); if (!seg.has(cur)) seg.set(cur, []); } else if (cur) seg.get(cur).push(b); }
  i0 = events.findIndex(engine.landsTyphoon);
  const later = events.slice(i0 + 1).flatMap(e => flat(seg.get(e) ?? [])).map(b => b.kind);
  assert.ok(later.includes('walk') || later.includes('crowd'), `scripts with walks play (${[...new Set(later)]})`);
  assert.ok(later.includes('bubble') || later.includes('gesture'), 'bubbles / gestures play');
});
test('the typhoon placement turn plays live with a LEVEL UP for every grow; nobody is hidden at its end; the next turn starts with everyone out', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  let s = engine.createState(spec);
  const steps = [...SOLUTIONS[0].map(id => st => place(st, id)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const [i, step] of steps.entries()) {
    const r = step(s); s = r.state;
    if (!r.events.some(engine.landsTyphoon)) { await run([...r.events, { kind: 'settle' }], { instant: true }); continue; }
    const n = bubblesLog.length, grows = expectedLevelUps(r.events);
    await run([...r.events, { kind: 'settle' }]);
    assert.ok(bubblesLog.slice(n).filter(b => b.text === 'LEVEL UP').length >= grows, 'LEVEL UP for every grow');
    assert.equal(show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.hidden).length, 0, 'nobody hidden at the end of the turn');
    const next = steps[i + 1](s), p = show.turn([...next.events, { kind: 'settle' }]);
    for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.hidden, false, k);
    show.skip(); await p;
    return;
  }
  assert.fail('no typhoon placement turn');
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

// 計畫 12 Task 1：頂欄跳過鍵照 skippable 顯示——回合演著 true；終局前的 hold（不能跳過）false；閒著 false
test('skippable: true while a turn plays, false during the hold and when idle', async () => {
  const { show } = await headlessShow();
  const frames = secs => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) show.update(1 / 30, t); };
  assert.equal(show.skippable, false, 'idle');
  const p = show.turn([...engine.place(engine.createState(spec), 'milk', spec).events, { kind: 'settle' }]);
  assert.equal(show.busy, true); assert.equal(show.skippable, true, 'a turn is playing');
  show.skip(); await p; assert.equal(show.skippable, false, 'idle after skip');
  const h = show.hold(2); frames(0.5);
  assert.equal(show.busy, true); assert.equal(show.skippable, false, 'the hold before the end cannot be skipped');
  show.abort(); await h; assert.equal(show.skippable, false);
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
// 唯一正解的每一個放置回合都 live 演一次：placed 的 mark 在 grow 2 前面、grow[2] 劇本真的有建（不是預設的 apply + LEVEL UP）、
// 演完沒有人留在劇本手上、舞台等級等於引擎；同一回合再演一次，演到 grow[2] 劇本中途按跳過：一樣沒人留在劇本手上，
// 舞台的等級、零件鍵都跟整回合瞬間演完的一樣（跳過到得了引擎的狀態）
test('placed + grow[2] in the same turn: the placed script then the grow script, roster members not left in script mode, skip reaches the engine state (each item, the solution)', async () => {
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

// 唯一正解 §5.2 老鼠當指標：整局 live，每回合演完、鏡頭回全景後再等老鼠走一會兒（玩家想下一手的時間）——
// Lv1／Lv2 的老鼠都在 meta.trouble 那棟門口（troubleAt 附近 TROUBLE_R），沒有 trouble 就在窩旁；整局 walls／jumps／pops 都是空的（不閃白、不瞬移、不穿牆）。
//   使用者 10-30 的順序（修正批次 2：第 7 回合颱風放下，捷運淹水、巨蛋淹水、攤車被吹走一起來）：第 8 回合放下的老鼠爬上岸直接跑到
//   照 ORDER 第一個被鎖的那棟（車站）門口聞一聞、當回合生窩，一窩在車站前；第 9 回合老鼠等代幣、還是一窩。
//   純照級數的順序：第 6 回合代幣在等鮮奶 → 第 7 回合放下的老鼠爬上岸直接跑到車站門口聞一聞；第 7 回合結算沒有人在等 → trouble null，走回窩旁。
//   （設計原寫「鮮奶等棒球時老鼠在早餐店門口」：那是第 2–4 回合，老鼠還沒放；早餐店那一段在 rat.test 的放置測試）
//   farNest：老鼠第 8 回合放下、當回合生窩，老鼠 0 在遠處那棟門口——窩的 ♥ 要在畫面裡（labels），在門口的老鼠留在原地。
//   typhoon3rd（設計 §6 的錯局；修正批次 2：颱風第 2 個放已經淹不到——棒球還沒放——改成第 3 個放）：第 3 回合大巨蛋淹水（棒球鎖在 2），
//   第 8 回合放下、生窩的老鼠聚在巨蛋前。
test('live: Lv1 / Lv2 rats gather at the trouble building each turn and walk back to the nest when it clears; no pops, jumps or walls', async () => {
  const rat = ALL.find(m => m.id === 'rat'), NEST = anchorWorld('rat'), gap = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const ORDERS = {
    user1030: ['milk', 'baseball', 'chip', 'bulb', 'boba', 'token', 'typhoon', 'rat'], levels: ['milk', 'token', 'chip', 'bulb', 'baseball', 'boba', 'rat', 'typhoon'],
    // 老鼠最後放、當回合就生窩，那時老鼠 0 在遠處出問題的那棟門口：生窩的 ♥ 冒在窩上（鏡頭平移去的那格），不是老鼠 0 頭上（最終修正）
    farNest: ['milk', 'baseball', 'chip', 'token', 'typhoon', 'bulb', 'boba', 'rat'],
    // 颱風第 3 個放（修正批次 2：放下那回合棒球 2 → 大巨蛋淹水，鎖在 2）。計畫 14：颱風之後兩回合還在下雨，放代幣／燈泡會淹水／停電
    // （trouble 換成燈泡），改成雨中放晶片、老鼠（第 5 回合放下的老鼠跑到巨蛋前），放晴後再放燈泡、代幣，第 8 回合放下的珍奶被老鼠咬住
    typhoon3rd: ['milk', 'baseball', 'typhoon', 'chip', 'rat', 'bulb', 'token', 'boba'],
  };
  const placed = rat.script.placed, sniffs = [];
  rat.script.placed = (...a) => placed(...a).map(b => (b.kind !== 'gesture' ? b : { ...b, start(c) { sniffs.push({ ...c.roster.members('rat.pack')[0].pos }); return b.start(c); } }));
  const seen = {};
  try {
    for (const [name, order] of Object.entries(ORDERS)) {
      const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam }), log = seen[name] = [];
      let s = engine.createState(spec), t = 500;
      for (const [i, step] of turnSteps(order).entries()) {
        const r = step(s); s = r.state; const what = `${name} turn ${i + 1}`;
        inv.label(what); sniffs.length = 0;
        await run([...r.events, { kind: 'settle' }]);
        inv.turnEnd();
        const st = show.stage, mode = rat.ratMode(st.lv, st.flags);
        log.push({ turn: i + 1, mode, trouble: st.meta.trouble, troubleAt: st.meta.troubleAt, lv: { ...st.lv }, flags: { ...st.flags }, sniffs: [...sniffs] });
        if (mode !== 'one' && mode !== 'nest') continue;
        const goal = st.meta.troubleAt ?? NEST, r0 = st.meta.troubleAt ? rat.TROUBLE_R : 0.7;
        const rats = () => show.roster.members('rat.pack'), there = () => rats().every(m => m.mode === 'home' && gap(m.pos, goal) <= r0 + 0.35);
        for (let f = 0; f < 30 * 30 && !there(); f++) { show.update(1 / 30, t); t += 1 / 30; }
        assert.ok(there(), `${what}: rats ${rats().map(m => `(${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`).join(' ')} at ${st.meta.trouble ?? 'the nest'} (${goal.x.toFixed(2)}, ${goal.z.toFixed(2)})`);
        assert.equal(rats().length, mode === 'one' ? 1 : 2, `${what}: the rat budget is unchanged`);
        log.at(-1).rats = rats().map(m => ({ ...m.pos }));
      }
      assert.deepEqual([...inv.pops].slice(0, 10), [], `${name}: ${inv.pops.size} pops`);
      assert.deepEqual([...inv.jumps].slice(0, 10), [], `${name}: ${inv.jumps.size} jumps`);
      assert.deepEqual([...inv.walls].slice(0, 10), [], `${name}: ${inv.walls.size} inside a building`);
      assert.deepEqual(inv.labels.slice(0, 10), [], `${name}: labels off screen`);
      assert.deepEqual(inv.camera.slice(0, 10), [], `${name}: camera`);
    }
  } finally { rat.script.placed = placed; }
  const at = (name, turn) => seen[name].find(x => x.turn === turn);
  const u8 = at('user1030', 8);
  assert.deepEqual([u8.mode, u8.trouble], ['nest', 'token'], 'the nest gathers at the flooded station (the first locked item in ORDER)');
  assert.equal(u8.sniffs.length, 1, 'turn 7 settled the flood: the landing rat runs to the station and sniffs once');
  assert.equal(at('user1030', 9).mode, 'nest', 'the rat waits for the token: still a nest');
  const { frontOf } = await import('../src/actors/anchors.js');
  // 放下劇本讀的是上一回合（第 6 回合）結算的 troubleAt：車站照那一刻的代幣級（2026-10-31 Task 5：原本寫死代幣 3）
  // 颱風第 3 個放：第 2 回合棒球放到 2、第 3 回合颱風放下時大巨蛋淹水（鎖在 2，到終局都是 2）；第 8 回合的一窩聚在巨蛋前（鎖住的比被咬的珍奶優先）
  assert.ok(!at('typhoon3rd', 2).flags.domeFlood && at('typhoon3rd', 3).flags.domeFlood, 'the dome floods on turn 3, the placement turn');
  for (let t = 2; t <= 9; t++) assert.equal(at('typhoon3rd', t).lv.baseball, 2, `turn ${t}: baseball locked at 2`);
  const t8 = at('typhoon3rd', 8), bb = ALL.find(m => m.id === 'baseball').visitSpot(2, { lv: t8.lv, flags: t8.flags }), dome = frontOf(bb, bb.r);
  assert.deepEqual([t8.mode, t8.trouble], ['nest', 'baseball']);
  // 計畫 14：第 8 回合放下的珍奶被咬（咬的那隻從攤車跑回來），量到「一走進散步圈」就停——離散步中心（troubleAt，被 troubleSpot 拉回一點點）≤ r + 0.35；
  // 散步中心就是巨蛋正面（差 < 0.1）
  assert.ok(gap(t8.troubleAt, dome) < 0.1, `the loiter centre (${t8.troubleAt.x.toFixed(2)}, ${t8.troubleAt.z.toFixed(2)}) is the dome front`);
  for (const p of t8.rats) assert.ok(gap(p, t8.troubleAt) <= rat.TROUBLE_R + 0.35, `turn 8: rat (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) at the dome front (${dome.x.toFixed(2)}, ${dome.z.toFixed(2)})`);
  const l6 = at('levels', 6), l7 = at('levels', 7), sp = ALL.find(m => m.id === 'token').visitSpot(l6.lv.token, { lv: l6.lv, flags: l6.flags }), front = frontOf(sp, sp.r);
  assert.equal(l6.trouble, 'token');
  assert.deepEqual([l7.mode, l7.trouble], ['nest', null], 'turn 7 clears: back to the nest');
  assert.equal(l7.sniffs.length, 1, 'the landing rat sniffs once (at the station)');
  assert.ok(gap(l7.sniffs[0], front) <= 0.5, `sniffed in front of the station (${l7.sniffs[0].x.toFixed(2)}, ${l7.sniffs[0].z.toFixed(2)})`);
});

// 計畫 15 C：回合預熱——show.turn 一開始 stage.prepare(events)，模型都載好後把預熱的物件交給 ctx.compile（app 的 renderer.compile）；
// 回合結束（照常演完、跳過、中止、RESET）沒用到的預熱零件都丟掉
test('the turn prepares its parts before the beats and hands them to compile once their models are in (not before)', async () => {
  const calls = [], { show, run } = await headlessShow({ compile: objs => calls.push(objs) });
  const prepared = [], prepare = show.stage.prepare;
  show.stage.prepare = ev => { const r = prepare(ev); prepared.push(r); return r; };
  const r = place(engine.createState(spec), 'milk');
  const p = run([...r.events, { kind: 'settle' }]);
  assert.equal(prepared.length, 1, 'prepared at turn start'); assert.equal(calls.length, 0, 'compile waits for the models');
  assert.ok(prepared[0].parts.length > 0);
  await p;
  assert.equal(calls.length, 1, 'compile called once');
  assert.deepEqual(calls[0], prepared[0].parts, 'with the prepared objects');
  assert.ok(calls[0].includes(show.stage.partObject('milk.main')), 'the school is one of them');
});
test('prepared parts the turn did not use are dropped when it ends: normal end, skip, abort, reset', async () => {
  const { show, run, scene } = await headlessShow();
  const group = scene.getObjectByName('stage:parts'), stray = () => show.stage.prepare([{ kind: 'placed', item: 'chip', to: 1 }]).parts;
  const s0 = engine.createState(spec), milk = place(s0, 'milk'), baseball = place(milk.state, 'baseball'), chip = place(baseball.state, 'chip');
  let extra = stray(); assert.ok(extra.length && extra.every(o => o.parent === group));
  await run([...milk.events, { kind: 'settle' }]);
  assert.ok(extra.every(o => !o.parent), 'normal end');
  extra = stray();
  const p1 = show.turn([...baseball.events, { kind: 'settle' }]);
  for (let i = 0; i < 20; i++) show.update(1 / 30, i / 30);
  show.skip(); await p1;
  assert.ok(extra.every(o => !o.parent), 'skip');
  const p2 = show.turn([...chip.events, { kind: 'settle' }]);
  for (let i = 0; i < 20; i++) show.update(1 / 30, i / 30);
  show.abort(); await p2;
  assert.ok(!group.children.some(o => !o.visible && !show.stage.partKeys().some(k => show.stage.partObject(k) === o)), 'abort: no hidden prepared part left');
  extra = stray(); show.reset();
  assert.ok(extra.every(o => !o.parent), 'reset');
});
// 預熱到位：整局（唯一正解 live，兩條壞結局瞬間演到終局）演出途中舞台一個零件都不建——每次加進零件群組都在 prepare 裡
test('with the turn prepared, nothing is built while the beats play: the solution live and EXAMPLE.hit / deflect through the finale; invariants clean', async () => {
  for (const [name, order, live] of [['solution', SOLUTIONS[0], true], ['hit', EXAMPLE.hit, false], ['deflect', EXAMPLE.deflect, false]]) {
    const { show, run, scene } = await headlessShow(), inv = gameInvariants(show), group = scene.getObjectByName('stage:parts');
    let inPrepare = false; const late = [], add = group.add.bind(group), prepare = show.stage.prepare;
    show.stage.prepare = ev => { inPrepare = true; try { return prepare(ev); } finally { inPrepare = false; } };
    group.add = (...os) => { if (!inPrepare) late.push(os.map(o => o.name || o.type).join()); return add(...os); };
    let s = engine.createState(spec);
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state; inv.label(`${name} turn ${i + 1}`);
      await run([...r.events, { kind: 'settle' }], { instant: !live });
      assert.equal(late.length, 0, `${name} turn ${i + 1}: ${late.length} parts built mid-turn`);
    }
    inv.label(`${name} finale`);
    await run(finaleStep(s).events, { finale: true, instant: !live });
    assert.equal(late.length, 0, `${name} finale: ${late.length} parts built mid-turn`);
    assert.ok(group.children.every(o => o.visible || show.stage.partKeys().some(k => show.stage.partObject(k) === o)), `${name}: no hidden prepared part left`);
    for (const k of ['walls', 'jumps', 'pops']) assert.deepEqual([...inv[k]].slice(0, 10), [], `${name} ${k}`);
  }
});

// 計畫 15 最終審稿 M2：預熱照演出的順序——show.turn 交給 stage.prepare 的就是 turn.js playOrder（搬過、拿掉跳級第一級）
test('the turn prepares in play order: groupPlaced order, the first grow of a jump pair left out', async () => {
  const { playOrder } = await import('../src/show/turn.js');
  const { show, run } = await headlessShow();
  const got = [], prepare = show.stage.prepare;
  show.stage.prepare = ev => { got.push(ev); return prepare(ev); };
  let s = engine.createState(spec), dropped = 0;
  for (const [i, step] of turnSteps(SOLUTIONS[0]).entries()) {
    const r = step(s); s = r.state;
    const events = [...r.events, { kind: 'settle' }], want = playOrder(events, { modules: ALL, spec, lv: show.stage.lv, flags: show.stage.flags });
    await run(events, { instant: true });
    assert.deepEqual(got.at(-1), want, `turn ${i + 1}`);
    dropped += events.length - want.length;
  }
  assert.ok(dropped > 0, 'the solution has jump pairs whose first level is not prepared');
});

// 計畫 15 最終審稿 M3：預熱在 try 裡——零件工廠在 prepare 時丟錯，已經建好藏著的零件照樣丟掉
test('a builder that throws while the turn prepares leaves no hidden part behind and the live parts unchanged', async () => {
  const boom = {
    id: 'boom', labelY: 1,
    builders: {
      boomPart(THREE_, s) { if (s.tag === 'bad') throw new Error('boom'); return { object: new THREE.Group(), dispose() {} }; },
    },
    view: lv => (lv.milk ? { 'boom.ok': { kind: 'boomPart', tag: 'ok', at: { x: 0, y: 0.65, z: 0 } }, 'boom.bad': { kind: 'boomPart', tag: 'bad', at: { x: 0, y: 0.65, z: 0 } } } : {}),
  };
  const { show, scene } = await headlessShow({ modules: [...ALL, boom] });
  const group = scene.getObjectByName('stage:parts'), keys = show.stage.partKeys().sort(), count = group.children.length;
  const r = place(engine.createState(spec), 'milk');
  assert.throws(() => show.turn([...r.events, { kind: 'settle' }]), /boom/);
  assert.deepEqual(show.stage.partKeys().sort(), keys, 'live parts unchanged');
  assert.ok(!group.children.some(o => !o.visible && !show.stage.partKeys().some(k => show.stage.partObject(k) === o)), 'no hidden prepared part left');
  assert.equal(group.children.length, count, 'the parts group is back to what it was');
  assert.equal(show.busy, false);
});
