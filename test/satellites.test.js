import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import * as sat from '../src/actors/satellites.js';
import { SATELLITES, axialToWorld, R } from '../src/scene/hex.js';
import { lv } from './helpers/actors.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople } from '../src/scene/people.js';
import { createPartFactory } from '../src/actors/parts.js';
import { enumerate, stats } from '../src/solver/run.js';
installFakeDom();
const { createStage } = await import('../src/actors/stage.js');
const allMax = Object.fromEntries(spec.ORDER.map(id => [id, spec.ITEMS[id].max]));

// 物品 v2 §5（review focus 5）：風車與燈塔開局是暗的、不轉的；燈泡 Lv7 電工去按開關（離岸風電啟動）才轉、才亮。
// 颱風時不管有沒有電，風車都被風吹得狂轉、整座搖（那是風不是電）；大停電時沒有颱風就停
test('windmill blades: still at the opening and below bulb 7, turn at bulb 7; the storm spins them (3 unpowered, 6 powered) and wobbles; blackout stops them', () => {
  for (const bulb of [0, 1, 2, 3, 5, 6]) { const w = sat.view(lv({ bulb }), {})['sat.windmill']; assert.equal(w.speed, 0, `bulb ${bulb}`); assert.ok(!w.wobble); }
  for (const bulb of [7, 8, 9]) assert.equal(sat.view(lv({ bulb }), {})['sat.windmill'].speed, 1, `bulb ${bulb}`);
  for (const bulb of [0, 2, 6, 7, 9]) { const storm = sat.view(lv({ bulb, typhoon: 2 }), {})['sat.windmill']; assert.equal(storm.speed, bulb >= 7 ? 6 : 3, `storm, bulb ${bulb}`); assert.ok(storm.wobble); }
  assert.equal(sat.view(lv({ bulb: 2, typhoon: 2 }), { blackout: true })['sat.windmill'].speed, 3, 'blackout in the storm: the wind still turns it');
  assert.equal(sat.view(lv({ bulb: 2 }), { blackout: true })['sat.windmill'].speed, 0);
  assert.equal(sat.view(lv({ bulb: 7, typhoon: 3 }), {})['sat.windmill'].speed, 1, 'after the storm back to the powered turn');
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: sat.builders });
  const on = f.build(sat.view(lv({ bulb: 7 }), {})['sat.windmill']); on.update(0.5, 0.5); assert.notEqual(on.object.children[0].rotation.z, 0, 'powered blades turn');
  const off = f.build(sat.view(lv({}), {})['sat.windmill']); off.update(0.5, 0.5); assert.equal(off.object.children[0].rotation.z, 0, 'dark blades stand still');
});
test('lighthouse is dark until bulb 7 (no light, no beam), lit and sweeping from bulb 7', () => {
  for (const bulb of [0, 1, 2, 3, 5, 6]) { const v = sat.view(lv({ bulb }), {}); assert.equal(v['sat.lighthouse'], undefined, `bulb ${bulb}`); assert.equal(v['sat.beam'], undefined); }
  for (const bulb of [7, 9]) { const v = sat.view(lv({ bulb }), {}); assert.ok(v['sat.lighthouse'].parts.some(p => p.glow)); assert.equal(v['sat.beam'].kind, 'beam'); }
  assert.equal(sat.view(lv({ bulb: 7 }), { blackout: true })['sat.lighthouse'], undefined);
});
test('playground kids come with the shuttle and need a school; forest tourists and the shop need the chain', () => {
  // 小孩是坐接駁車（物品 v2：代幣 Lv8）來的：代幣 Lv8 的劇本 hold 住名冊、在車旁 spawn
  assert.equal(sat.view(lv({ token: 7, milk: 3 }), {})['sat.playground'], undefined);
  assert.equal(sat.view(lv({ token: 8, milk: 1 }), {})['sat.playground'], undefined);
  assert.equal(sat.view(lv({ token: 8, milk: 2 }), {})['sat.playground'], undefined, 'milk Lv2 is the breakfast shop: no schoolkids yet (items v2)');
  const kids = sat.view(lv({ token: 8, milk: 3 }), {})['sat.playground'], s = SATELLITES.find(x => x.kind === 'playground'), c = axialToWorld(s.q, s.r);
  assert.deepEqual([kids.kind, kids.n, kids.accessory, kids.home.kind, kids.home.r], ['roster', 2, 'none', 'wander', 0.5]);
  assert.ok(Math.hypot(kids.home.at.x - c.x, kids.home.at.z - c.z) < 0.5, 'wanders on the playground island');
  // 配件跟鮮奶格的小孩一樣（物品 v2 §4.2：Lv6 棒球帽、Lv7 學士帽、Lv8 白袍、Lv9 起帽子拋掉了）
  assert.deepEqual([3, 5, 6, 7, 8, 9, 10].map(n => sat.view(lv({ token: 8, milk: n }), {})['sat.playground'].accessory), ['none', 'none', 'cap', 'mortar', 'coat', 'none', 'none']);
  // 物品 v2：珍奶 Lv5 連鎖店（Lv4 是噴泉廣場）
  assert.equal(sat.view(lv({ boba: 4 }), {})['sat.forest'], undefined); assert.equal(sat.view(lv({ boba: 5 }), {})['sat.forest'].n, 2); assert.equal(sat.view(lv({ boba: 4 }), {})['sat.forestShop'], undefined);
  assert.equal(sat.view(lv({ boba: 5 }), {})['sat.forestShop'].kind, 'compound');
});
test('camp at chip 3, rocks get rats at rat 3 (not alongside the cyber army), chest opens only when everything is MAX', () => {
  assert.equal(sat.view(lv({ chip: 2 }), {})['sat.camp'], undefined); assert.ok(sat.view(lv({ chip: 3 }), {})['sat.camp'].parts.some(p => p.glow));
  assert.equal(sat.view(lv({ rat: 3 }), {})['sat.rocks'].kind, 'rats');
  assert.equal(sat.view(lv({ rat: 5 }), { ratBranch: 'cyber' })['sat.rocks'], undefined, 'skeleton budget: 10 army + shiba');
  assert.equal(sat.view(lv({}), {})['sat.chest'].open, false); assert.equal(sat.view(allMax, {})['sat.chest'].open, true);
  assert.ok(sat.view(allMax, {})['sat.chest'].parts.some(p => p.glow));
});
test('boats: 2, 4 with a queue, 6 with the chain, none in the storm', () => {
  assert.equal(sat.view(lv({}), {})['sat.boats'].n, 2); assert.equal(sat.view(lv({ boba: 2 }), {})['sat.boats'].n, 4);
  assert.equal(sat.view(lv({ boba: 4 }), {})['sat.boats'].n, 4); assert.equal(sat.view(lv({ boba: 5 }), {})['sat.boats'].n, 6); assert.equal(sat.view(lv({ boba: 5, typhoon: 2 }), {})['sat.boats'], undefined);
});
test('every satellite part sits on its island (within R of the island centre) except boats', () => {
  const centres = SATELLITES.map(s => axialToWorld(s.q, s.r));
  for (const v of [sat.view(allMax, {}), sat.view(lv({ token: 4, milk: 5, boba: 5, chip: 3, rat: 3, bulb: 7 }), {})]) for (const [k, s] of Object.entries(v)) {
    if (k === 'sat.boats') continue;
    const pts = [s.at, ...(s.parts ?? []).map(p => ({ x: s.at.x + p.pos[0], z: s.at.z + p.pos[2] })), ...(s.stand ?? []), ...(Array.isArray(s.path) ? s.path : []), ...(s.spots ?? []), ...(s.home?.spots ?? [])];
    for (const p of pts) assert.ok(centres.some(c => Math.hypot(p.x - c.x, p.z - c.z) < R), `${k} ${JSON.stringify(p)}`);
  }
});
test('satellites reset to the opening state (review focus 4)', async () => {
  const modules = await Promise.all(['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon', 'satellites'].map(m => import(`../src/actors/${m}.js`)));
  const assets = { spawn: async () => new THREE.Group(), release() {} }, people = createPeople(THREE, { max: 48 });
  const stage = createStage(THREE, { scene: new THREE.Scene(), spec, modules, ctx: { people, assets, glow: createGlowRegistry() } });
  let s = engine.createState(spec);
  for (const id of stats(enumerate(spec), spec).full[0].order) { const r = engine.place(s, id, spec); s = r.state; for (const e of r.events) stage.apply(e); }
  for (let i = 0; i < spec.CLOSING_TURNS; i++) { const r = engine.advance(s, spec); s = r.state; for (const e of r.events) stage.apply(e); }
  assert.ok(stage.partKeys().includes('sat.forestShop'));
  stage.reset();
  assert.deepEqual(stage.partKeys().filter(k => k.startsWith('sat.')).sort(), ['sat.boats', 'sat.chest', 'sat.windmill']);
});

// 計畫 3.8 Task 6：衛星島上的名冊（遊樂場小孩、小森林觀光客）家不在主島走路格上——名冊不從入口走進來（衛星島照舊：
// 小孩由代幣 Lv5 在接駁車旁 spawn、觀光客跟著珍奶分店閃白出現），所以沒有 entry，入口檢查沒有東西要查
import { entryProblems, rosterSpots } from './helpers/actors.js';
import { cellAt } from '../src/scene/hex.js';
import { createNav } from '../src/show/nav.js';
test('satellite rosters live off the main island: no entry declared, nothing for the entry check', () => {
  const nav = createNav();
  for (const extra of [{ token: 8, milk: 3 }, { token: 6, milk: 5, boba: 5 }, allMax]) {
    const v = sat.view(lv(extra), {}), rosters = Object.entries(v).filter(([, d]) => d.kind === 'roster');
    assert.ok(rosters.length, JSON.stringify(extra));
    for (const [k, d] of rosters) {
      assert.equal(d.home.entry, undefined, k);
      assert.ok(rosterSpots(d).every(p => cellAt(p.x, p.z) === null), `${k} lives on its satellite island`);
    }
    assert.deepEqual(entryProblems(v, nav), []);
  }
});

// §14.3：燈塔亮了（物品 v2：燈泡 ≥7）之後有一位守塔人在燈塔島上繞圈（衛星島的 wander 走 ringPath）；燈還沒亮就沒有
test('satellites: lighthouse keeper appears at bulb ≥ 7 and rings the island; absent below', async () => {
  for (const bulb of [1, 2, 6]) assert.equal(sat.view(lv({ bulb }), {})['sat.keeper'], undefined, `bulb ${bulb}`);
  const s = SATELLITES.find(x => x.kind === 'lighthouse'), c = axialToWorld(s.q, s.r);
  for (const bulb of [7, 8, 9]) {
    const k = sat.view(lv({ bulb }), {})['sat.keeper'];
    assert.deepEqual([k.kind, k.n, k.home.kind, k.home.entry], ['roster', 1, 'wander', undefined], `bulb ${bulb}`);
    assert.ok(Math.hypot(k.home.at.x - c.x, k.home.at.z - c.z) < 0.3, 'circles the lighthouse');
    assert.ok(k.home.r > 0.3 && k.home.r < 0.9, `ring r ${k.home.r} clear of the tower, on the island`);
  }
  const { headlessShow } = await import('./helpers/show.js'), { show, run } = await headlessShow();
  let st = engine.createState(spec);
  for (const id of stats(enumerate(spec), spec).full[0].order) {
    const r = engine.place(st, id, spec); st = r.state; await run([...r.events, { kind: 'settle' }], { instant: true });
    if (st.lv.bulb >= 7) break;
    assert.equal(show.roster.members('sat.keeper').length, 0, 'no keeper before the light');
  }
  const [m] = show.roster.members('sat.keeper'), k = sat.view(show.stage.lv, show.stage.flags)['sat.keeper'].home, start = { ...m.pos };
  let far = 0;
  for (let i = 0; i < 120; i++) {
    show.update(1 / 30, 100 + i / 30);
    assert.equal(cellAt(m.pos.x, m.pos.z), null, 'stays on the lighthouse island');
    assert.ok(Math.abs(Math.hypot(m.pos.x - k.at.x, m.pos.z - k.at.z) - k.r) < 0.05, 'on the ring');
    far = Math.max(far, Math.hypot(m.pos.x - start.x, m.pos.z - start.z));
  }
  assert.ok(far > 0.3, 'walks round');
});
// 守塔人跟燈塔的燈同一拍出現（物品 v2：燈泡 Lv7 電工按下開關、風車轉了之後），不是回合末才冒出來（審查）
test('the keeper appears on the same frame as the lighthouse light during bulb Lv7', async () => {
  const { headlessShow } = await import('./helpers/show.js'), { show, run } = await headlessShow(), update = show.update;
  let frame = 0, light = null, keeper = null;
  show.update = (dt, t) => { update(dt, t); frame++; if (light === null && show.stage.partObject('sat.lighthouse')) light = frame; if (keeper === null && show.roster.members('sat.keeper').length) keeper = frame; };
  let st = engine.createState(spec), done = false;
  for (const id of stats(enumerate(spec), spec).full[0].order) {
    const r = engine.place(st, id, spec); st = r.state;
    for (const e of [...r.events, { kind: 'settle' }]) {
      if (!done && e.kind === 'grow' && e.item === 'bulb' && e.to === 7) { await run([e]); done = true; }
      else await run([e], { instant: true });
    }
    if (done) break;
  }
  assert.ok(done && light !== null, 'the light comes on during the live bulb Lv7');
  assert.equal(keeper, light, `keeper on frame ${keeper}, light on frame ${light}`);
});

// 物品 v2 任務 11：衛星島的門檻跟著新的階梯與離島鏈——沒有留下舊門檻（燈塔看燈泡 ≥2、小孩看鮮奶 ≥2、分店看珍奶 ≥4）。
// 小孩坐接駁車來：遊樂場島有小孩的每一個等級，代幣的支線與接駁車都在（代幣 Lv7 支線、Lv8 接駁車），也有小學（鮮奶 ≥3）；
// 燈塔亮、守塔人、風車轉（沒颱風）都在燈泡 ≥7，而引擎保證燈泡到 7 時代幣已 ≥6（高鐵；支線沒通的話燈泡 Lv7 自己鋪）；石堆綠光圈只在外星
test('satellite gates follow the island chain: kids ride the shuttle, the light needs the spur, the ring is alien-only', async () => {
  const token = await import('../src/actors/token.js');
  for (let t = 0; t <= 10; t++) for (let m = 0; m <= 10; m++) {
    const v = sat.view(lv({ token: t, milk: m }), {}), tv = token.view(lv({ token: t, milk: m }), {}, {});
    assert.equal(!!v['sat.playground'], t >= 8 && m >= 3, `token ${t} milk ${m}`);
    if (v['sat.playground']) assert.ok(tv['token.spur.playground'] && tv['token.shuttle'], `token ${t}: kids only where the spur and the shuttle run`);
  }
  for (let b = 0; b <= 9; b++) {
    const v = sat.view(lv({ bulb: b }), {}), on = b >= 7;
    assert.deepEqual([!!v['sat.lighthouse'], !!v['sat.beam'], !!v['sat.keeper'], v['sat.windmill'].speed > 0], [on, on, on, on], `bulb ${b}`);
  }
  // 選擇帶動升級：燈泡 up[7] 代幣 7 → 6（高鐵載電工去）——代幣還沒通車到離島時，風車島那條支線跟著燈泡 Lv7 鋪（token.view 看 lv.bulb）
  assert.deepEqual(spec.ITEMS.bulb.up[7], { minLevel: ['token', 6] }, 'the HSR carries the electrician');
  for (const t of [6, 7]) for (const b of [6, 7]) {
    const tv = token.view(lv({ token: t, bulb: b }), {}, {});
    assert.equal(!!tv['token.spur.windmill'], t >= 7 || b >= 7, `token ${t} bulb ${b}: the windmill spur stands once the electrician rides it`);
    assert.equal(!!tv['token.spur.playground'], t >= 7, `token ${t} bulb ${b}: the playground spur waits for token 7`);
  }
  assert.ok(Object.keys(spec.ITEMS.bulb.jump ?? {}).every(n => +n < 7), 'no jump lands on bulb 7 or later');
  for (let b = 0; b <= 7; b++) { const v = sat.view(lv({ boba: b }), {}); assert.equal(!!v['sat.forest'] && !!v['sat.forestShop'], b >= 5, `boba ${b}`); }
  for (const [r, branch, ring] of [[4, 'alien', false], [5, 'alien', true], [5, 'cyber', false], [5, undefined, false]]) assert.equal(!!sat.view(lv({ rat: r }), { ratBranch: branch })['sat.rocksRing'], ring, `rat ${r} ${branch}`);
});

// 最終章 §7 外星尾聲：石堆島的綠光圈變降落場——圈更亮（更粗、多一圈內環）＋三盞落地燈（sphere r 0.08、C.alien 發光）圍在圈上；
// 石堆上的兩隻老鼠不畫（三台大 UFO 停在這裡）
test('epilogue alien: sat.rocksRing becomes the landing pad (brighter ring + 3 lights), sat.rocks rats gone', () => {
  const L = lv({ rat: 5 }), base = sat.view(L, { ratBranch: 'alien', missile: 'shield' }), v = sat.view(L, { ratBranch: 'alien', missile: 'shield', epilogue: 'alien' });
  const ring0 = base['sat.rocksRing'], pad = v['sat.rocksRing'], rocks = sat.island('rocks');
  assert.ok(pad && Math.hypot(pad.at.x - rocks.x, pad.at.z - rocks.z) < 1e-9, 'on the rocks islet');
  assert.equal(pad.footprint, false); assert.equal(pad.shadow, false);
  const tori = pad.parts.filter(p => p.kind === 'torus'), lights = pad.parts.filter(p => p.kind === 'sphere');
  const vol = p => p.scale[0] * p.scale[1] * p.scale[2];
  assert.ok(tori.length > ring0.parts.length || tori.some(p => vol(p) > vol(ring0.parts[0])), 'a brighter (bigger) ring');
  assert.ok(tori.every(p => p.glow === 0x5fcf7a));
  assert.equal(lights.length, 3, 'three landing lights');
  const R = ring0.parts[0].scale[0] / 2;
  for (const l of lights) {
    assert.ok(Math.abs(l.scale - 0.16) < 1e-9 || (Array.isArray(l.scale) && Math.abs(l.scale[0] - 0.16) < 1e-9), 'r 0.08');
    assert.equal(l.glow, 0x5fcf7a); assert.equal(l.color, 0x5fcf7a);
    assert.ok(Math.abs(Math.hypot(l.pos[0], l.pos[2]) - R) < 0.15, `on the ring (${Math.hypot(l.pos[0], l.pos[2]).toFixed(2)})`);
  }
  assert.ok(base['sat.rocks'], 'the stone rats stay before the epilogue');
  assert.equal(v['sat.rocks'], undefined, 'the stone rats are gone');
});

// 計畫 6 §7 離島三段：每座島 = 空島 → 第一段 → 第二段，觸發固定照表（view 是純函數；兩段各自獨立，第二段可以先出現）。
// 一段一個零件（sat.<島>.stage1／stage2）；石堆島的第二段就是外星的綠光圈（現有 sat.rocksRing），賽博沒有第二段
const STAGES = {
  lighthouse: [['bulb', 7], ['boba', 6]], windmill: [['bulb', 7], ['chip', 6]], rocks: [['rat', 3], null],
  pyramid: [['chip', 3], ['chip', 9]], playground: [['token', 8], ['milk', 10]], forest: [['boba', 5], ['bulb', 9]], chest: [['baseball', 6], 'allMax'],
};
test('each islet: stage-1 and stage-2 parts appear exactly at the design §7 levels, independently (stage 2 alone when its trigger comes first), none before', () => {
  for (const [isl, stages] of Object.entries(STAGES)) stages.forEach((trig, i) => {
    const key = `sat.${isl}.stage${i + 1}`;
    if (!Array.isArray(trig)) return;
    const [item, n] = trig;
    for (let l = 0; l <= spec.ITEMS[item].max; l++) {
      const d = sat.view(lv({ [item]: l }), {})[key];
      assert.equal(!!d, l >= n, `${key} at ${item} ${l}`);
      if (d) { assert.equal(d.kind === 'compound' ? d.footprint : d.footprint, false, `${key} footprint`); assert.ok(Math.hypot(d.at.x - sat.island(isl).x, d.at.z - sat.island(isl).z) < 1e-9, `${key} anchored on its islet`); }
    }
  });
  // 兩段各自獨立：只滿足第二段的觸發時只有第二段
  for (const [isl, extra] of [['lighthouse', { boba: 6 }], ['windmill', { chip: 6 }], ['pyramid', { chip: 9 }], ['playground', { milk: 10 }], ['forest', { bulb: 9 }]]) {
    const v = sat.view(lv(extra), {}), [[i1, n1]] = STAGES[isl];
    if ((extra[i1] ?? 0) >= n1) { assert.ok(v[`sat.${isl}.stage1`]); continue; }   // 同一個物品（階梯丘）：第二段必然在第一段之後
    assert.ok(v[`sat.${isl}.stage2`] && !v[`sat.${isl}.stage1`], `${isl}: stage 2 alone at ${JSON.stringify(extra)}`);
  }
  // 寶箱島：全 MAX 才噴金幣；差一級就沒有
  assert.ok(sat.view(allMax, {})['sat.chest.stage2']);
  for (const id of spec.ORDER) assert.equal(sat.view({ ...allMax, [id]: allMax[id] - 1 }, {})['sat.chest.stage2'], undefined, `${id} one short`);
  // 石堆島：第二段 = 外星綠光圈（老鼠 Lv5 外星），賽博沒有；不另外加零件
  assert.equal(sat.view(lv({ rat: 5 }), { ratBranch: 'cyber' })['sat.rocks.stage2'], undefined);
  assert.ok(sat.view(lv({ rat: 5 }), { ratBranch: 'alien' })['sat.rocksRing']);
  // 空島：開局什麼段都沒有
  assert.deepEqual(Object.keys(sat.view(lv({}), {})).filter(k => /\.stage\d$/.test(k)), []);
});

// 會動的零件：鞦韆會盪、旋轉木馬會轉、第二支風機跟第一支一樣通電才轉、金幣噴泉的金幣會上下
const builtFactory = (quality) => createPartFactory(THREE, { glow: createGlowRegistry(), builders: sat.builders, quality });
const posesOf = o => { const out = []; o.traverse(x => { out.push([x.position.x, x.position.y, x.position.z, x.rotation.x, x.rotation.y, x.rotation.z].map(n => n.toFixed(4)).join()); if (x.isInstancedMesh) out.push(Array.from(x.instanceMatrix.array).map(n => n.toFixed(3)).join()); }); return out.join('|'); };
test('islet stages that move: the swing swings, the carousel turns, the second turbine turns only when powered, the coins bob', () => {
  const f = builtFactory();
  for (const [L, key, moves] of [[lv({ token: 8 }), 'sat.playground.stage1', true], [lv({ milk: 10 }), 'sat.playground.stage2', true], [allMax, 'sat.chest.stage2', true]]) {
    const p = f.build(sat.view(L, {})[key]); assert.equal(typeof p.update, 'function', key);
    const a = posesOf(p.object); p.update(0.4, 0.4); const b = posesOf(p.object); p.update(0.5, 0.9);
    assert.equal(a !== b || b !== posesOf(p.object), moves, key); p.dispose();
  }
  // 第二支風機的轉子是 sat.windmill 的 twin（同一個 speed／wobble；颱風改速度時第一段不重建）：燈泡 Lv7 起才有、通電才轉
  assert.equal(sat.view(lv({ bulb: 6 }), {})['sat.windmill'].twin, undefined);
  const twinOf = p => p.object.children[1].children[0];
  const lit = f.build(sat.view(lv({ bulb: 7 }), {})['sat.windmill']); lit.update(0.5, 0.5); assert.notEqual(twinOf(lit).rotation.z, 0, 'the second rotor turns');
  const dark = f.build(sat.view(lv({ bulb: 7 }), { blackout: true })['sat.windmill']); dark.update(0.5, 0.5); assert.equal(twinOf(dark).rotation.z, 0, 'blackout: the second rotor stands still like the first');
  assert.deepEqual(sat.view(lv({ bulb: 7, typhoon: 2 }), {})['sat.windmill.stage1'], sat.view(lv({ bulb: 7 }), {})['sat.windmill.stage1'], 'the storm does not rebuild the stage-1 tower');
  // 第二個轉子在第一段的塔頂前面
  const w = sat.view(lv({ bulb: 7 }), {})['sat.windmill'], top = sat.view(lv({ bulb: 7 }), {})['sat.windmill.stage1'].parts[0];
  assert.ok(Math.hypot(w.at.x + w.twin[0] - (sat.island('windmill').x + top.pos[0]), w.at.z + w.twin[2] - (sat.island('windmill').z + top.pos[2] + 0.1)) < 1e-9 && Math.abs(w.at.y + w.twin[1] - (sat.island('windmill').y + 1.2)) < 1e-9, 'twin hub on the stage-1 tower');
});

// 位置：每段零件在自己的島上（離島心 ≤ ISLET_R；棧橋伸到岸外一點、仍在 R 以內），離守塔人的圈、觀光客、小孩、老鼠、電工的站位都 ≥ 0.3；
// draw call：每座島上衛星零件（compound 數材質、builders 實際建出來數 mesh；名冊不算、老鼠一隻 1）≤ 6
import { TOURIST_SPOTS, DOCK } from '../src/actors/boba.js';
import { ISLAND_HOME, ISLAND_R } from '../src/actors/bulb.js';
const ISLET_R = 2.2;
test('islet parts stay inside their islet footprint and off the keeper / tourist / kid spots; draw calls per islet ≤ 6', () => {
  const full = { ...allMax }, views = [sat.view(full, {}), sat.view(lv({ bulb: 9, boba: 6, chip: 9, token: 8, milk: 10, rat: 5, baseball: 6 }), { ratBranch: 'alien' })];
  const centreOf = k => sat.island(k.split('.')[1]);
  // 不能壓到的站位：{ x, z, r }（r = 散步圈半徑，量到圈上）
  const keep = v => {
    const out = [];
    for (const d of Object.values(v)) if (d.kind === 'roster') {
      if (d.home.kind === 'wander') for (const c of [].concat(d.home.at)) out.push({ ...c, r: d.home.r });
      for (const s of d.home.spots ?? []) out.push({ ...s, r: 0 });
    } else if (d.kind === 'rats') for (const s of d.spots) out.push({ ...s, r: 0 });
    for (const s of TOURIST_SPOTS) out.push({ ...s, r: 0 });
    out.push({ ...ISLAND_HOME, r: ISLAND_R });
    return out;
  };
  for (const v of views) {
    const spots = keep(v);
    for (const [k, d] of Object.entries(v)) {
      if (!/\.stage\d$/.test(k)) continue;
      const c = centreOf(k), pier = k === 'sat.lighthouse.stage2';
      for (const p of d.parts ?? [d]) {
        const x = d.at.x + (p.pos?.[0] ?? 0), z = d.at.z + (p.pos?.[2] ?? 0), r = Math.hypot(x - c.x, z - c.z);
        assert.ok(r <= (pier ? R - 0.02 : ISLET_R), `${k} part at r ${r.toFixed(2)}`);
        for (const s of spots) { const g = Math.abs(Math.hypot(x - s.x, z - s.z) - s.r); assert.ok(g >= 0.3, `${k} part (${x.toFixed(2)}, ${z.toFixed(2)}) ${g.toFixed(2)} from a spot (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) r ${s.r}`); }
      }
    }
  }
  // 棧橋朝小船停的地方（boba.DOCK）伸出去：最外的板子比最裡的近碼頭
  const pier = views[0]['sat.lighthouse.stage2'], dist = p => Math.hypot(pier.at.x + p.pos[0] - DOCK.x, pier.at.z + p.pos[2] - DOCK.z);
  const near = Math.min(...pier.parts.map(dist)); assert.ok(near < 0.6, `pier end ${near.toFixed(2)} from the dock`);
  // draw call
  for (const quality of [undefined, 'low']) {
    const f = builtFactory(quality);
    for (const v of views) {
      const per = {};
      for (const [k, d] of Object.entries(v)) {
        if (!k.startsWith('sat.') || k === 'sat.boats' || d.kind === 'roster') continue;
        let n = 0;
        if (d.kind === 'rats') n = d.n;
        else { const p = f.build(d); p.object.traverse(o => { if (o.isMesh) n++; }); p.dispose(); }
        const isl = SATELLITES.map(s => s.kind).find(s => { const c = sat.island(s); return Math.hypot(d.at.x - c.x, d.at.z - c.z) < R; });
        per[isl] = (per[isl] ?? 0) + n;
      }
      for (const [isl, n] of Object.entries(per)) assert.ok(n <= 6, `${quality ?? 'high'} ${isl}: ${n} draw calls`);
    }
  }
});

// 離島三段的零件都是 tagAlong：跟同一拍第一個閃的零件一起閃、不多佔一格 stagger（beats.apply）——加了點綴，任何一拍都不變長
import * as B from '../src/show/beats.js';
test('islet stages tag along: an apply beat is no longer with them (they blink with its first key); alone they blink once', () => {
  for (const v of [sat.view(allMax, {}), sat.view(lv({ bulb: 9, boba: 6, chip: 9, token: 8, milk: 10, rat: 3, baseball: 6 }), {})])
    for (const [k, d] of Object.entries(v)) if (/\.stage\d$/.test(k)) { assert.equal(d.tagAlong, true, k); assert.equal(d.low, false, `${k}: not drawn on ?quality=low (phone budget ≤ 150)`); }
  const fake = changed => { const pending = new Set(changed.map(c => c.key)), committed = [];
    return { committed, ctx: { stage: { apply: () => ({ changed }), pendingKeys: () => [...pending], commit: k => { committed.push(k); pending.delete(k); }, commitAll() {}, footprints: () => [] }, nav: { setFootprints() {} } } }; };
  const durOf = changed => { const b = B.apply({ kind: 'grow' }), { ctx, committed } = fake(changed); b.start(ctx); const d = b.dur(); b.step(0, 0.001, ctx); return { d, first: [...committed] }; };
  const plain = durOf([{ key: 'a' }, { key: 'b' }]), withStages = durOf([{ key: 'a' }, { key: 'sat.x.stage1', tagAlong: true }, { key: 'b' }, { key: 'sat.y.stage2', tagAlong: true }]);
  assert.equal(withStages.d, plain.d);
  assert.deepEqual(withStages.first.sort(), ['a', 'sat.x.stage1', 'sat.y.stage2']);
  assert.equal(durOf([{ key: 'sat.x.stage1', tagAlong: true }, { key: 'sat.y.stage1', tagAlong: true }]).d, durOf([{ key: 'a' }]).d, 'only stages: one blink');
});
