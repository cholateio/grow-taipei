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
// 人數預算（裁決 R16）：最擠的球場格（-1,1）與珍奶格（0,1）不住島民，溫泉格（1,-1）是溫泉客的；
// 修正批次 max-skip §E（使用者 2026-11-01 開局截圖「開局時的左側上的人和右側的人可以移除，只留 101 區塊和泡溫泉的人」）：島民只剩 101 格一位
test('islanders: one, wandering the 101 cell; two bathers soak in the pool (radius 0.3, chest-deep, facing the centre, no rescue) with fidget look', () => {
  const v = landmarks.view(zero, {}), r = v['landmarks.islanders'];
  assert.equal(r.kind, 'roster'); assert.equal(r.n, 1); assert.equal(r.accessory, 'none');
  assert.equal(r.home.kind, 'wander'); assert.equal(r.home.r, landmarks.ISLANDER_R); assert.equal(r.home.at.length, r.n);
  const cells = r.home.at.map(p => String(cellAt(p.x, p.z)));
  assert.deepEqual(cells, ['0,0'], 'the 101 cell only');
  assert.deepEqual(landmarks.HOMES.map(p => String(cellAt(p.x, p.z))), ['0,0']);
  // 家在 101 西南邊（鏡頭那側、往捷運站那邊）：散步圈整個在 101 格裡
  const [h] = r.home.at, c = axialToWorld(0, 0);
  assert.ok(h.x < c.x && h.z > c.z && Math.abs(h.y - cellTop([0, 0])) < 1e-9, 'south-west of the cell centre');
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; assert.deepEqual(cellAt(h.x + Math.cos(a) * r.home.r, h.z + Math.sin(a) * r.home.r), [0, 0], 'the walk stays in the 101 cell'); }
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
// R49（使用者 2026-11-06：隕石砸到溫泉裡時裡面還有人很奇怪）：隕石吹偏（flags.missile 'deflect'）之後溫泉客站在池子東側的池緣外——
// 離池心 SOAK_R + BATHER_FLEE（水平）、z ±0.35、站在格面上、面向池心；在走路格上（不在任何外擴 footprint 裡）、兩人 ≥ 0.25；沒旗標（或命中、擋下）照舊泡在池裡
test('R49: after a deflected meteor (flags.missile deflect) the bathers stand outside the pool on its east rim (SOAK_R + BATHER_FLEE from the centre, z ±0.35, on the cell top, facing the pool, walkable); otherwise they still soak', () => {
  const spots = flags => landmarks.view(zero, flags)['landmarks.bathers'].home.spots;
  const out = spots({ missile: 'deflect' }), R = landmarks.SOAK_R + landmarks.BATHER_FLEE;
  assert.equal(landmarks.BATHER_FLEE, 1.1);
  assert.equal(out.length, 2);
  const fp = [].concat(landmarks.view(zero, {})['landmarks.spring'].footprint), nav = createNav();
  nav.setFootprints(fp.map(f => ({ ...f, x: SPRING.x + (f.x ?? 0), z: SPRING.z + (f.z ?? 0) })));
  for (const [i, p] of out.entries()) {
    const dx = p.x - SPRING.x, dz = p.z - SPRING.z;
    assert.ok(Math.abs(Math.hypot(dx, dz) - R) < 1e-9, `bather ${i} ${R} from the pool centre (${Math.hypot(dx, dz).toFixed(3)})`);
    assert.ok(dx > 1.3, `bather ${i} east of the pool`);
    assert.ok(Math.abs(Math.abs(dz) - 0.35) < 1e-9, `bather ${i} z ±0.35`);
    assert.ok(Math.abs(p.y - cellTop(cellAt(p.x, p.z))) < 1e-9, `bather ${i} on the cell top`);
    assert.deepEqual(cellAt(p.x, p.z), [1, -1], `bather ${i} still in the spring cell`);
    const face = Math.atan2(SPRING.x - p.x, SPRING.z - p.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(p.yaw - face), Math.cos(p.yaw - face))) < 1e-9, `bather ${i} faces the pool`);
    assert.ok(nav.walkable(p.x, p.z) && !nav.inFootprint(p.x, p.z), `bather ${i} on walkable ground (out of the pool and the bathhouse)`);
  }
  assert.ok(Math.hypot(out[0].x - out[1].x, out[0].z - out[1].z) >= 0.25, 'the two apart');
  assert.deepEqual(out, landmarks.BATHERS_OUT, 'the view uses BATHERS_OUT (world points; finale.js walks them there)');
  for (const flags of [{}, { missile: 'hit' }, { missile: 'shield' }, { alarm: 1 }]) assert.deepEqual(spots(flags), spots({}), `${JSON.stringify(flags)}: still soaking`);
  for (const p of spots({})) assert.ok(Math.hypot(p.x - SPRING.x, p.z - SPRING.z) < 0.31, 'soaking in the pool');
});
// 審查重點 4：老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時，溫泉客站池邊、老鼠在池裡，10 秒內每一對都 ≥ 0.25。
// 唯一正解（其實所有放置順序）都到不了泡溫泉（老鼠 3 時代幣都已 ≥2），所以用合成的老鼠事件直接演到那一刻
test('spring bathers vs soaking rats (rat ≥ 3, token < 2): every pair stays ≥ 0.25 apart over 10 s (review focus 4)', async () => {
  const { headlessShow } = await import('./helpers/show.js'), { ratMode } = await import('../src/actors/rat.js');
  const { show, run } = await headlessShow();
  for (const e of [{ kind: 'placed', item: 'rat' }, { kind: 'grow', item: 'rat', to: 2 }, { kind: 'grow', item: 'rat', to: 3 }]) await run([e, { kind: 'settle' }], { instant: true });
  assert.equal(ratMode(show.stage.lv, show.stage.flags), 'spring');
  const rats = () => show.roster.members('rat.pack'), bathers = () => show.roster.members('landmarks.bathers');
  assert.equal(rats().length, 2); assert.equal(bathers().length, 2);
  let min = Infinity;
  for (let i = 0; i < 300; i++) {
    show.update(1 / 30, 100 + i / 30);
    for (const b of bathers()) for (const r of rats()) min = Math.min(min, Math.hypot(b.pos.x - r.pos.x, b.pos.z - r.pos.z));
  }
  assert.ok(min >= 0.25, `closest bather–rat ${min.toFixed(2)}`);
  bathers().forEach((b, i) => { const s = landmarks.view(show.stage.lv, show.stage.flags)['landmarks.bathers'].home.spots[i]; assert.ok(Math.hypot(b.pos.x - s.x, b.pos.z - s.z) < 0.1 && Math.abs(b.pos.y - s.y) < 1e-6, `bather ${i} soaking in the pool`); });
});
// 計畫 13 §設計 3：溫泉客（池心半徑 0.3）離泡湯老鼠（rat.js SPRING_SPOTS：池心半徑 0.62、2 隻，2026-11-04 起）的站位每一對都 ≥ 0.25
test('the soaking bathers\' spots keep ≥ 0.25 from every soaking rat spot', async () => {
  const rat = await import('../src/actors/rat.js');
  const rats = rat.view({ ...zero, rat: 3 }, {}, {})['rat.pack'].home.spots, bathers = landmarks.view({ ...zero, rat: 3 }, {})['landmarks.bathers'].home.spots;
  assert.equal(rats.length, 2);
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
// 計畫 13 §設計 1：島民只被站長轉走一個（代幣 ≥2）；鮮奶不再借島民。§E 之後只有一位：代幣 ≥2 之後島上沒有島民（最小 0）
test('islanderCount: 1 minus one for the station master only (milk never takes an islander, plan 13), never below 0', () => {
  const all = landmarks.HOMES.length;
  assert.equal(all, 1); assert.equal(landmarks.islanderCount({ token: 10 }), 0);
  assert.equal(landmarks.islanderCount({}), all);
  for (const milk of [0, 3, 10]) assert.equal(landmarks.islanderCount({ milk }), all, `milk ${milk}`);
  assert.equal(landmarks.islanderCount({ token: 1 }), all); assert.equal(landmarks.islanderCount({ token: 2 }), all - 1);
  assert.equal(landmarks.islanderCount({ milk: 10, token: 10 }), all - 1);
});
// 計畫 13 §設計 4（使用者 2026-11-01「火山太醜請重新設計」）：火山換成自己的 builder——有稜角的低多邊形錐（12 邊 6 段、每個頂點決定性抖動、
// 平面著色、頂點色三層：沙色、深棕、口緣更深），頂上凹一個碗、碗底一片熔岩、三條熔岩痕從口緣流到高度 0.6；石頭四顆照舊。
// draw call 不比現在多：一個黏土 mesh（錐、碗、石頭）＋一個發光 mesh（熔岩，走 ctx.glow：白天／大停電歸零）；手機一個 mesh
test('volcano builder: one faceted clay mesh with three vertex-colour bands and lava streaks painted on its faces + one glow mesh for the crater pool; deterministic; low quality merges to one', async () => {
  const THREE = await import('../vendor/three/three.module.js'), { createPartFactory } = await import('../src/actors/parts.js'), { createGlowRegistry } = await import('../src/scene/glow.js');
  const spec = landmarks.view(zero, {})['landmarks.volcano'];
  assert.equal(spec.kind, 'volcano'); assert.ok(landmarks.builders?.volcano, 'landmarks.builders.volcano');
  assert.equal(spec.parts.filter(p => p.kind === 'ico').length, 4, 'the four rocks'); assert.ok(!spec.parts.some(p => p.kind === 'frustum'), 'no more frustum cone');
  const make = (quality = 'high') => { const glow = createGlowRegistry(); return { glow, part: createPartFactory(THREE, { glow, quality, builders: landmarks.builders }).build(spec) }; };
  const { glow, part } = make(), meshes = part.object.children.filter(o => o.isMesh);
  assert.equal(meshes.length, 2, 'one clay + one glow mesh'); assert.equal(glow.size, 1, 'lava registered with ctx.glow');
  assert.deepEqual(part.object.position.toArray(), [spec.at.x, spec.at.y, spec.at.z]);
  const lava = meshes.find(m => m.material.emissive?.getHex() === 0xdb6a41), clay = meshes.find(m => m !== lava);
  assert.ok(lava && clay, 'lava glows orange');
  // 修正輪 0：熔岩痕不是獨立零件（凸出山體的直棒），畫在錐身上——發光的只剩碗底那池熔岩（口緣 1.5 下 0.18 左右）
  lava.geometry.computeBoundingBox(); const lb = lava.geometry.boundingBox;
  assert.ok(lb.min.y >= 1.25 && lb.max.y <= 1.4, `only the crater pool glows (${lb.min.y.toFixed(2)}..${lb.max.y.toFixed(2)})`);
  assert.ok(!spec.parts.some(p => p.kind === 'box'), 'no separate streak parts');
  // 錐：頂點色三層（沙色在下、口緣最深），平面著色（非索引、每個三角形三個法線一樣）
  const g = clay.geometry, pos = g.attributes.position, col = g.attributes.color, nor = g.attributes.normal;
  assert.equal(g.index, null, 'non-indexed');
  const hex = i => new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).getHex(), tol = (a, b) => Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)) <= 6;
  const bands = [0xd2b48c, 0x8a7563, 0x4a3f38], seen = new Set(), STREAK = 0xc85a33;
  let low = 0, lowSand = 0, top = 0, topDark = 0, streak = 0, streakLow = Infinity;
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, r = Math.hypot(pos.getX(i), pos.getZ(i)), c = hex(i);
    bands.forEach((b, k) => { if (tol(c, b)) seen.add(k); });
    if (tol(c, 0xb8a892)) continue;   // 石頭（ico，自己的平滑法線）
    if (tol(c, STREAK)) { for (let j = 0; j < 3; j++) { streak++; streakLow = Math.min(streakLow, pos.getY(i + j)); } continue; }   // 熔岩痕：錐身的面塗熔岩橘
    if (r > 0.7 && y < 0.5) { low++; if (tol(c, bands[0])) lowSand++; }
    if (r > 0.6 && r < 1.1 && y > 1.42) { top++; if (tol(c, bands[2])) topDark++; }
    const n0 = [nor.getX(i), nor.getY(i), nor.getZ(i)];
    if (bands.some(b => tol(c, b))) for (const j of [1, 2]) assert.ok(Math.abs(nor.getX(i + j) - n0[0]) + Math.abs(nor.getY(i + j) - n0[1]) + Math.abs(nor.getZ(i + j) - n0[2]) < 1e-5, 'flat-shaded face');
  }
  assert.equal(seen.size, 3, 'three colour bands');
  // 修正輪 0b：三道細熔岩剛從口緣溢出來（各一面寬、兩段、暗一階的橘），不流到山腰
  assert.ok(streak === 18 && streakLow >= 0.95, `lava streaks painted on the cone: ${streak} vertices, lowest ${streakLow.toFixed(2)}`);
  assert.ok(streak <= 3 * 2 * 3, `thin streaks: one face per segment (${streak} vertices)`);
  assert.ok(low > 20 && lowSand / low > 0.95, `lower slope sand (${lowSand}/${low})`);
  assert.ok(top > 10 && topDark / top > 0.9, `crater rim darkest (${topDark}/${top})`);
  // 抖動過：錐腳那一圈頂點離中心不一樣遠（不是正 12 邊形），每次建出來一模一樣
  const foot = new Set(); for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i)) < 1e-6) foot.add(Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(3));
  assert.ok(foot.size >= 6, `jittered foot ring (${foot.size} radii)`);
  const again = make().part.object.children.find(o => o.isMesh && !o.material.emissive?.getHex()).geometry.attributes.position.array;
  assert.deepEqual([...again], [...pos.array], 'deterministic');
  part.dispose(); assert.equal(glow.size, 0, 'dispose unregisters the lava');
  assert.equal(make('low').part.object.children.filter(o => o.isMesh).length, 1, 'phone: one mesh');
});
// 平台上的東西不出格：火山錐腳（1.45＋抖動）與四顆石頭都在火山格裡
test('the volcano foot and rocks stay inside the volcano cell', () => {
  const spec = landmarks.view(zero, {})['landmarks.volcano'], c = axialToWorld(0, -1), hexIn = 2.5 * Math.sqrt(3) / 2;
  const edge = p => hexIn - Math.max(...[0, 1, 2, 3, 4, 5].map(k => (p.x - c.x) * Math.cos(k * Math.PI / 3 + Math.PI / 6) + (p.z - c.z) * Math.sin(k * Math.PI / 3 + Math.PI / 6)));
  for (let k = 0; k < 24; k++) { const a = k / 24 * 2 * Math.PI, p = { x: spec.at.x + Math.cos(a) * 1.55, z: spec.at.z + Math.sin(a) * 1.55 }; assert.ok(cellAt(p.x, p.z)?.join() === '0,-1', `foot ${k}`); }
  for (const r of spec.parts.filter(p => p.kind === 'ico')) assert.ok(cellAt(spec.at.x + r.pos[0], spec.at.z + r.pos[2])?.join() === '0,-1');
  assert.ok(edge(spec.at) > 1.55, 'room for the foot');
});

// §E 開局：主島露出來的人只有 101 格的島民一位＋兩位溫泉客
test('opening: the only people on the main island are the 101-cell islander and the two bathers', async () => {
  const { headlessShow } = await import('./helpers/show.js'), { show } = await headlessShow();
  for (let i = 0; i < 60; i++) show.update(1 / 30, i / 30);
  const shown = show.roster.keys().flatMap(k => show.roster.members(k).filter(m => m.walker && !m.hidden && cellAt(m.pos.x, m.pos.z)).map(m => [k, String(cellAt(m.pos.x, m.pos.z))]));
  assert.deepEqual(shown.map(([k]) => k).sort(), ['landmarks.bathers', 'landmarks.bathers', 'landmarks.islanders']);
  assert.equal(shown.find(([k]) => k === 'landmarks.islanders')[1], '0,0', 'the islander is on the 101 cell');
});
