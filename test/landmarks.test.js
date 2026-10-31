import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as landmarks from '../src/actors/landmarks.js';
import { PLATEAU_TOP, axialToWorld, cellTop } from '../src/scene/hex.js';
const zero = { milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0 };
test('volcano and hot spring are on the plateau from the start, both steaming', () => {
  const v = landmarks.view(zero, {});
  assert.deepEqual(Object.keys(v).sort(), ['landmarks.bathers', 'landmarks.islanders', 'landmarks.spring', 'landmarks.springSteam', 'landmarks.volcano', 'landmarks.volcanoSmoke']);
  for (const k in v) if (v[k].kind !== 'roster') assert.equal(v[k].at.y, PLATEAU_TOP, k);
  assert.equal(v['landmarks.volcanoSmoke'].kind, 'smoke'); assert.equal(v['landmarks.springSteam'].kind, 'smoke');
  assert.ok(v['landmarks.volcano'].parts.some(p => p.glow), 'crater glows');
});
// §14.3 人分散：島民 5 人一個名冊，散步的家是溫泉格以外的六格（第 i 人用 home.at[i % 6]）；
// 另外兩位溫泉客（landmarks.bathers）泡在池子裡（計畫 13 §設計 3：池心半徑 0.3、水淹到胸口、不帶 rescue），偶爾看一下池子
import { MAIN_CELLS, cellAt } from '../src/scene/hex.js';
import { landmarkWorld } from '../src/actors/anchors.js';
import { createNav, PAD } from '../src/show/nav.js';
const SPRING = landmarkWorld('spring');
// 人數預算（裁決 R16）：島民 4 人、一人一格；最擠的球場格（-1,1）與珍奶格（0,1）不住島民，溫泉格（1,-1）是溫泉客的
test('islanders: n 4, one wander home per cell on the four main cells that are not baseball/boba/spring; two bathers soak in the pool (radius 0.3, chest-deep, facing the centre, no rescue) with fidget look', () => {
  const v = landmarks.view(zero, {}), r = v['landmarks.islanders'];
  assert.equal(r.kind, 'roster'); assert.equal(r.n, 4); assert.deepEqual(r.accessory, ['none', 'cap']);
  assert.equal(r.home.kind, 'wander'); assert.equal(r.home.r, 1.8); assert.equal(r.home.at.length, r.n);
  const cells = r.home.at.map(p => String(cellAt(p.x, p.z)));
  assert.deepEqual([...cells].sort(), MAIN_CELLS.filter(c => !['1,-1', '-1,1', '0,1'].includes(String(c))).map(String).sort(), 'not the spring, baseball or boba cell');
  r.home.at.forEach((p, i) => { const c = axialToWorld(...cellAt(p.x, p.z)); assert.deepEqual(p, { x: c.x, y: cellTop(cellAt(p.x, p.z)), z: c.z }, `home ${i} is the cell centre`); });
  const b = v['landmarks.bathers'];
  assert.deepEqual([b.kind, b.n, b.home.kind, b.home.fidget, !!b.home.rescue, b.home.spots.length], ['roster', 2, 'stand', 'look', false, 2]);
  const fp = [].concat(v['landmarks.spring'].footprint), nav = createNav();
  nav.setFootprints(fp.map(f => ({ ...f, x: SPRING.x + (f.x ?? 0), z: SPRING.z + (f.z ?? 0) })));
  for (const [i, p] of b.home.spots.entries()) {
    assert.deepEqual(cellAt(p.x, p.z), [1, -1], `bather ${i} in the spring cell`);
    const d = Math.hypot(p.x - SPRING.x, p.z - SPRING.z);
    assert.ok(Math.abs(d - 0.3) < 1e-9, `bather ${i} in the pool, 0.3 from the centre (${d.toFixed(2)})`);
    // 計畫寫 − 0.22；截圖量到只露出頭（肩膀、手臂都在水下），改 − 0.15：頭、肩、手臂露出水面
    assert.ok(Math.abs(p.y - (SPRING.y + 0.13 - 0.15)) < 1e-9, `bather ${i} chest-deep: y = water surface − 0.15`);
    assert.ok(nav.inFootprint(p.x, p.z), `bather ${i} inside the pool footprint (an authored spot: roster / invariants let it be)`);
    assert.ok(Math.abs(Math.atan2(Math.sin(p.yaw - Math.atan2(SPRING.x - p.x, SPRING.z - p.z)), Math.cos(p.yaw - Math.atan2(SPRING.x - p.x, SPRING.z - p.z)))) < 1e-9, `bather ${i} faces the pool`);
    assert.ok(p.z > SPRING.z, `bather ${i} on the camera side`);
  }
});
// 審查重點 4：老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時，溫泉客站池邊、老鼠在池裡，10 秒內每一對都 ≥ 0.25。
// 唯一正解（其實所有放置順序）都到不了泡溫泉（老鼠 3 時代幣都已 ≥2），所以用合成的老鼠事件直接演到那一刻
test('spring bathers vs soaking rats (rat ≥ 3, token < 2): every pair stays ≥ 0.25 apart over 10 s (review focus 4)', async () => {
  const { headlessShow } = await import('./helpers/show.js'), { ratMode } = await import('../src/actors/rat.js');
  const { show, run } = await headlessShow();
  for (const e of [{ kind: 'placed', item: 'rat' }, { kind: 'grow', item: 'rat', to: 2 }, { kind: 'grow', item: 'rat', to: 3 }]) await run([e, { kind: 'settle' }], { instant: true });
  assert.equal(ratMode(show.stage.lv, show.stage.flags), 'spring');
  const rats = () => show.roster.members('rat.pack'), bathers = () => show.roster.members('landmarks.bathers');
  assert.equal(rats().length, 5); assert.equal(bathers().length, 2);
  let min = Infinity;
  for (let i = 0; i < 300; i++) {
    show.update(1 / 30, 100 + i / 30);
    for (const b of bathers()) for (const r of rats()) min = Math.min(min, Math.hypot(b.pos.x - r.pos.x, b.pos.z - r.pos.z));
  }
  assert.ok(min >= 0.25, `closest bather–rat ${min.toFixed(2)}`);
  bathers().forEach((b, i) => { const s = landmarks.view(show.stage.lv, show.stage.flags)['landmarks.bathers'].home.spots[i]; assert.ok(Math.hypot(b.pos.x - s.x, b.pos.z - s.z) < 0.1 && Math.abs(b.pos.y - s.y) < 1e-6, `bather ${i} soaking in the pool`); });
});
// 計畫 13 §設計 3：溫泉客（池心半徑 0.3）離泡湯老鼠（rat.js SPRING_SPOTS：池心半徑 0.62、5 隻）的站位每一對都 ≥ 0.25（實測最近 0.37）
test('the soaking bathers\' spots keep ≥ 0.25 from every soaking rat spot', async () => {
  const rat = await import('../src/actors/rat.js');
  const rats = rat.view({ ...zero, rat: 3 }, {}, {})['rat.pack'].home.spots, bathers = landmarks.view({ ...zero, rat: 3 }, {})['landmarks.bathers'].home.spots;
  assert.equal(rats.length, 5);
  const min = Math.min(...bathers.flatMap(b => rats.map(r => Math.hypot(b.x - r.x, b.z - r.z))));
  assert.ok(min >= 0.25, `closest ${min.toFixed(3)}`);
});
// 島民、溫泉客的入口（預設：家那格邊上離家最遠的可走點）唯一正解每一刻都走得到、離站位 ≥ 1.5
test('islander and bather entries are walkable and ≥ 1.5 from their homes through the solution', async () => {
  const spec = await import('../src/rules/spec.js'), { enumerate, stats } = await import('../src/solver/run.js'), { entriesThroughSolutions } = await import('./helpers/show.js');
  assert.deepEqual(await entriesThroughSolutions(landmarks, stats(enumerate(spec), spec).full.map(r => r.order)), []);
});
// 變異鼠（外星 Lv4 起）站在池子正前方（rat.js MUTANT）：計畫 13 起溫泉客泡在池裡（池心半徑 0.3），離牠 ≥ 0.6，不用換位置——
// 計畫寫的「改用 BATHERS_NORTH 的角度」要從池裡走出來繞一圈（nav 從 footprint 裡先逃到最近的可走點，就在池子前緣、變異鼠旁邊），
// 所以溫泉客在池裡不動：每一級、每個分岔的站位都一樣
test('with the mutant rat at the spring (rat ≥ 4, alien) the bathers stay put in the pool, ≥ 0.6 from the mutant', async () => {
  const { MUTANT } = await import('../src/actors/rat.js');
  const spots = (lv, flags) => landmarks.view({ ...zero, ...lv }, flags)['landmarks.bathers'].home.spots;
  for (const rat of [4, 5]) for (const p of spots({ rat }, { ratBranch: 'alien' })) {
    assert.ok(Math.hypot(p.x - MUTANT.x, p.z - MUTANT.z) >= 0.6, `rat ${rat}: ${Math.hypot(p.x - MUTANT.x, p.z - MUTANT.z).toFixed(2)} from the mutant`);
  }
  for (const [lv, flags] of [[{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 5 }, { ratBranch: 'alien' }], [{ rat: 4 }, { ratBranch: 'cyber' }], [{ rat: 3 }, {}]]) assert.deepEqual(spots(lv, flags), spots({}, {}), `${JSON.stringify(lv)} ${JSON.stringify(flags)}: unchanged`);
  const [a, b] = spots({}, {}); assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 0.25, 'the two bathers apart');
});
// 計畫 13 §設計 1：島民只被站長轉走一個（代幣 ≥2）；鮮奶不再借島民
test('islanderCount: HOMES.length minus one for the station master only (milk never takes an islander, plan 13)', () => {
  const all = landmarks.HOMES.length;
  assert.equal(landmarks.islanderCount({}), all);
  for (const milk of [0, 3, 10]) assert.equal(landmarks.islanderCount({ milk }), all, `milk ${milk}`);
  assert.equal(landmarks.islanderCount({ token: 1 }), all); assert.equal(landmarks.islanderCount({ token: 2 }), all - 1);
  assert.equal(landmarks.islanderCount({ milk: 10, token: 10 }), all - 1);
});
