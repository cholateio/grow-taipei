import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as tower from '../src/actors/tower.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { B } from '../src/show/beats.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, turnSteps, towerCrossings, overviewRig, gameInvariants } from './helpers/show.js';
import { EXAMPLE } from './helpers/endings.js';
import { createCameraRig } from '../src/scene/camera.js';
import { existsSync } from 'node:fs';
import { C } from '../src/actors/palette.js';
import { MAIN_CELLS, axialToWorld, hexCorners, R } from '../src/scene/hex.js';
const PALETTE = new Set(Object.values(C));
const zero = { milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0 };
const lvOf = (total, extra = {}) => { const caps = { milk: 10, baseball: 8, token: 10, rat: 5, boba: 7, typhoon: 3, chip: 9, bulb: 9 }, out = { ...zero }; let left = total; for (const id in caps) { out[id] = Math.min(caps[id], left); left -= out[id]; } return { ...out, ...extra }; };
const tiers = v => v['tower.main'].parts.filter(p => p.kind === 'frustum4').length;

test('stageOf thresholds (§5.2)', () => {
  // 選擇帶動升級的 61 級：0–6 工地、7–28 半成品、29–50 完工、51+ 點燈
  assert.equal(tower.stageOf(0), 'site'); assert.equal(tower.stageOf(6), 'site'); assert.equal(tower.stageOf(7), 'half');
  assert.equal(tower.stageOf(28), 'half'); assert.equal(tower.stageOf(29), 'full'); assert.equal(tower.stageOf(50), 'full'); assert.equal(tower.stageOf(51), 'lit');
  assert.equal(tower.stageOf(61), 'lit');
});
// 唯一正解的總等級曲線上，四個階段各在不同回合跨過、散在整局（9 回合裡約第 3／6／8 回合），結束前都點燈
test('the solution crosses the four stages in four different turns, spread through the game, lit by the end', () => {
  for (const order of SOLUTIONS) {
    const { totals, at } = towerCrossings(order), turns = [at.site, at.half, at.full, at.lit], why = `${order.join('>')} totals ${totals.join(' ')} at ${JSON.stringify(at)}`;
    assert.equal(at.site, 1, why);
    for (let i = 1; i < 4; i++) assert.ok(turns[i] > turns[i - 1], why);
    assert.equal(new Set(turns).size, 4, why);
    assert.equal(totals.length, spec.ORDER.length + spec.CLOSING_TURNS, why);
    assert.ok(at.half >= 2 && at.half <= 4, why); assert.ok(at.full >= 5 && at.full <= 7, why); assert.ok(at.lit >= 8 && at.lit <= totals.length, why);
    assert.equal(tower.stageOf(totals.at(-1)), 'lit', why);
  }
});
test('view: site has a crane and cones, half 4 tiers + crane, full 8 tiers + cap and no crane, lit glows', () => {
  const site = tower.view(zero, {}), half = tower.view(lvOf(10), {}), full = tower.view(lvOf(31), {}), lit = tower.view(lvOf(55), {});
  assert.equal(tiers(site), 1); assert.ok(site['tower.crane']); assert.ok(site['tower.main'].parts.some(p => p.kind === 'cone'));
  assert.equal(tiers(half), 5); assert.ok(half['tower.crane']);
  assert.equal(tiers(full), 10); assert.equal(full['tower.crane'], undefined);
  assert.ok(!full['tower.main'].parts.some(p => p.glow)); assert.ok(lit['tower.main'].parts.some(p => p.glow));
});
// 物品 v2 §4.3：晶片 Lv7 天線（Cyberpunk Kit glb，零件搭列車來）、Lv8 矽盾測試、Lv9 待命（天線每 3 秒閃一圈、罩子淡淡常駐）
test('antenna (Cyberpunk Kit glb + ring) appears at chip 7 and pulses from chip 9; shield: test at chip 8, standby from 9; light show needs bulb 5', () => {
  assert.equal(tower.view({ ...zero, chip: 6 }, {})['tower.antenna'], undefined);
  const a7 = tower.view({ ...zero, chip: 7 }, {})['tower.antenna'], a9 = tower.view({ ...zero, chip: 9 }, {})['tower.antenna'];
  assert.equal(a7.kind, 'antenna'); assert.equal(a7.pulse, false); assert.equal(a9.pulse, true);
  assert.deepEqual(a7.models.map(m => m.path).sort(), ['quat/cyberpunk/Antenna_1.glb', 'quat/cyberpunk/Antenna_2.glb']);
  for (const m of a7.models) { assert.ok(existsSync(new URL(`../assets/${m.path}`, import.meta.url)), m.path); for (const c of Object.values(m.tint)) assert.ok(PALETTE.has(c), `${m.path} tint ${c.toString(16)}`); }
  assert.ok(!a7.parts.some(p => p.glow) && a9.parts.every(p => p.glow === 0x3fe0ff), 'the ring glows (one colour) once on standby');
  assert.equal(tower.view({ ...zero, chip: 7 }, {})['tower.shield'], undefined);
  assert.equal(tower.view({ ...zero, chip: 8 }, {})['tower.shield'].state, 'test');
  assert.equal(tower.view({ ...zero, chip: 9 }, {})['tower.shield'].state, 'standby');
  assert.deepEqual(tower.shieldSpec('full'), { ...tower.view({ ...zero, chip: 9 }, {})['tower.shield'], state: 'full' }, 'the ending (plan 5) uses the same dome, fully lit');
  assert.equal(tower.view({ ...zero, bulb: 4 }, {})['tower.show'], undefined);
  assert.equal(tower.view({ ...zero, bulb: 5 }, {})['tower.show'].kind, 'lightshow');
});
test('the antenna sits on the spire top of whatever stage the tower is in', () => {
  for (const total of [0, 10, 27, 55]) {
    const v = tower.view(lvOf(total, { chip: 7 }), {}, { total }), top = Math.max(...v['tower.main'].parts.map(p => p.pos[1] + (Array.isArray(p.scale) ? p.scale[1] : p.scale) / 2));
    const a = v['tower.antenna'];
    assert.ok(Math.abs(a.parts[0].pos[1] - top) < 0.6, `ring at the top (${total})`);
    for (const m of a.models) assert.ok(m.pos[1] > top - 0.7 && m.pos[1] <= top + 0.01, `${m.path} on the spire (${total})`);
  }
});
test('the shield is a hemisphere centred on the 101 base that covers every corner of all seven main cells', () => {
  const s = tower.view({ ...zero, chip: 9 }, {})['tower.shield'], a = anchorWorld('tower');
  assert.equal(s.kind, 'shield'); assert.deepEqual(s.at, a); assert.equal(s.footprint, false);
  assert.ok(s.r >= 7 && s.r <= 8, `r ${s.r}`);
  for (const cell of MAIN_CELLS) { const c = axialToWorld(...cell); for (const p of hexCorners(c.x, c.z, R)) assert.ok(Math.hypot(p.x - a.x, p.z - a.z) < s.r, `corner of ${cell} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`); }
});
// 最終章 §6：飛彈命中 → 101 在自己這一階段的高度像吸管一樣彎成 L（彎角以上的零件繞 z 轉 π/2、往 +x 倒），天線、燈光秀、罩子、吊車拿掉。
// 2026-10-31 唯一正解最終修正：命中局的 101 66% 停在蓋一半（命中局最少總等級 20）——蓋一半照自己的四節彎（彎角在第 2 節頂），
// 工地不彎（底座留著、吊車拿掉），完工／點燈照舊在八節的一半彎。頭頂（labelY）＝彎過的形狀的頂＋LABEL_UP。站位不變：footprint 照底座
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
// 零件的頂（相對 101 的 at）：倒下的零件（rot z ≈ ±π/2）在 y 方向佔 scale x 的一半
const partTop = p => { const s = Array.isArray(p.scale) ? p.scale : [p.scale, p.scale, p.scale], laid = near(Math.abs(Math.sin(p.rot?.[2] ?? 0)), 1, 1e-6); return p.pos[1] + (laid ? s[0] : s[1]) / 2; };
const shapeTop = parts => Math.max(...parts.map(partTop));
const BEND_AT = { half: 0.3 + 1.1 + 2 * 0.45, full: 0.3 + 1.1 + 4 * 0.45, lit: 0.3 + 1.1 + 4 * 0.45 };
test('view with missile hit: half / full / lit bend at their own height — the parts above rotated about z by π/2; no antenna/lightshow/shield/crane', () => {
  for (const [total, moves] of [[10, 2 * 2], [31, 2 * 4 + 2], [55, 2 * 4 + 2]]) {
    const lv = lvOf(total, { chip: 8, bulb: 5 }), plain = tower.view(lv, {}, { total }), v = tower.view(lv, { missile: 'hit' }, { total });
    assert.ok(plain['tower.antenna'] && plain['tower.show'] && plain['tower.shield'], 'normally drawn');
    for (const k of ['tower.antenna', 'tower.show', 'tower.shield', 'tower.crane']) assert.equal(v[k], undefined, `${total}: no ${k}`);
    const stage = tower.stageOf(total), bend = tower.bendPoint(stage), by = bend.y - anchorWorld('tower').y;
    assert.deepEqual({ x: bend.x, z: bend.z }, { x: anchorWorld('tower').x, z: anchorWorld('tower').z }, 'bend point on the tower axis');
    assert.ok(near(by, BEND_AT[stage]), `${stage}: bend at ${by}`);
    const a = plain['tower.main'].parts, b = v['tower.main'].parts;
    assert.deepEqual(b, tower.body(stage, { bent: true }).parts);
    assert.equal(b.length, a.length, `${stage}: the same parts, no extra tiers`);
    assert.equal(tiers(v), tiers(plain), `${stage}: same tier count as unbent`);
    let moved = 0;
    a.forEach((p, i) => {
      const q = b[i], [x, y, z] = p.pos, rot = p.rot ?? [0, 0, 0];
      if (y <= by) { assert.deepEqual(q, p, `part ${i} below the bend stays`); return; }
      moved++;
      // 繞 (0, by) 轉 −π/2：(x, y − by) → (y − by, −x)
      assert.ok(near(q.pos[0], y - by) && near(q.pos[1], by - x) && q.pos[2] === z, `part ${i} rotated about the bend`);
      assert.ok(q.pos[0] > 0, 'laid toward +x');
      assert.ok(near(Math.abs(q.rot[2] - rot[2]), Math.PI / 2) && q.rot[0] === rot[0] && q.rot[1] === rot[1], `part ${i} turned by π/2 about z`);
    });
    assert.equal(moved, moves, `${stage}: the parts above the bend (${moved})`);
    if (stage === 'half') assert.ok(!b.some(p => p.kind === 'cylinder'), 'a half tower has no spire to bend');
    const top = tower.body(stage, { bent: true }).top;
    assert.ok(near(top, shapeTop(b), 0.05), `${stage}: body top ${top} is the bent shape's top ${shapeTop(b)}`);
    assert.ok(near(v['tower.main'].labelY, top + 0.6), `${stage}: head over the bent shape`);
    assert.ok(v['tower.main'].labelY < plain['tower.main'].labelY, `${stage}: the bent tower is lower`);
    assert.deepEqual(v['tower.main'].footprint, { x: 0, z: 0, w: 1.6, d: 1.6 }, 'stands on the same base');
  }
  assert.deepEqual(tower.body('lit'), tower.body('lit', { bent: false }), 'not bent by default');
});
// 工地被命中不彎（沒有塔身可彎）：底座與三角錐留著、吊車拿掉；頭頂照工地；飛彈打在底座中段
test('view with missile hit at site: nothing bends, the crane is removed, the head stays the site head', () => {
  const lv = lvOf(0, { chip: 7 }), plain = tower.view(lv, {}, { total: 0 }), v = tower.view(lv, { missile: 'hit' }, { total: 0 });
  assert.ok(plain['tower.crane']);
  for (const k of ['tower.antenna', 'tower.crane']) assert.equal(v[k], undefined, `no ${k}`);
  assert.deepEqual(v['tower.main'].parts, plain['tower.main'].parts, 'the site is drawn as is');
  assert.deepEqual(tower.body('site', { bent: true }), tower.body('site'));
  assert.equal(v['tower.main'].labelY, plain['tower.main'].labelY);
  assert.ok(near(v['tower.main'].labelY, shapeTop(v['tower.main'].parts) + 0.6, 0.05), 'head over the site base');
  const by = tower.bendPoint('site').y - anchorWorld('tower').y;
  assert.ok(by > 0.3 && by < shapeTop(plain['tower.main'].parts), `the missile hits the site base (${by})`);
});
// 頭頂（天際線）照彎過的形狀：EXAMPLE.hit 的 101 停在蓋一半，整局 live 演完再演終局回合（真的鏡頭 rig），
// 命中之後 headOf(tower) 是彎過的半塔頂、共用不變式（鏡頭不跳、回全景看得到 101 頭頂、字樣在畫面裡）照樣乾淨
test('headless live: EXAMPLE.hit (half) through the finale — headOf(tower) is the bent half tower top, invariants clean', async () => {
  const { finaleStep } = await import('./helpers/endings.js'), { missile } = await import('../src/rules/endings.js');
  const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam });
  let s = engine.createState(spec);
  for (const [i, step] of turnSteps(EXAMPLE.hit).entries()) {
    const r = step(s); s = r.state; inv.label(`hit turn ${i + 1}`);
    await run([...r.events, { kind: 'settle' }]);
    inv.turnEnd();
  }
  assert.equal(missile(s, spec), 'hit');
  const stage = tower.stageOfView(show.stage.lv, show.stage.meta);
  assert.equal(stage, 'half', 'the pinned hit game ends half built');
  inv.label('hit finale');
  await run(finaleStep(s).events, { finale: true });
  inv.turnEnd();
  assert.equal(show.stage.flags.missile, 'hit');
  assert.ok(show.stage.partObject('tower.main'), 'bent tower in place');
  const AT = anchorWorld('tower');
  assert.ok(near(show.stage.headOf('tower').y, AT.y + tower.body('half', { bent: true }).top + 0.6), `head ${show.stage.headOf('tower').y}`);
  assert.deepEqual([...inv.walls].slice(0, 10), []); assert.deepEqual([...inv.jumps].slice(0, 10), []); assert.deepEqual([...inv.pops].slice(0, 10), []);
  assert.deepEqual(inv.camera, []);
  assert.deepEqual(inv.labels, []);
});
test('view with missile shield: tower.shield state full', () => {
  const lv = { ...zero, chip: 9 }, v = tower.view(lv, { missile: 'shield' });
  assert.deepEqual(v['tower.shield'], tower.shieldSpec('full'));
  assert.equal(v['tower.antenna'].pulse, true, 'the antenna keeps pulsing');
  assert.deepEqual(v['tower.main'], tower.view(lv, {})['tower.main'], 'the tower is not bent');
  for (const missile of ['deflect', 'hit']) assert.notEqual(tower.view(lv, { missile })['tower.shield']?.state, 'full');
});
// 最終章 §7 賽博：101 閃白換成黑色高塔——塔身黑（DARK）、白邊換霓虹藍發光；頂帽與尖塔換成一片平屋頂（停車、機器鼠排隊），
// 天線桅杆退到屋頂後緣，桅杆頂上一面朝鏡頭（+z）的發光螢幕 tower.screen（跑馬燈泡泡掛在它身上）；天線照樣脈動、矽盾照樣全亮
test('view with epilogue cyber: body colours are ink, trims neon blue, tower.screen is a glowing box above the spire facing +z', () => {
  const lv = lvOf(61), flags = { missile: 'shield', epilogue: 'cyber' }, v = tower.view(lv, flags, { total: 61 }), plain = tower.view(lv, { missile: 'shield' }, { total: 61 });
  const at = anchorWorld('tower'), b = tower.body('lit', { dark: true });
  assert.deepEqual(v['tower.main'].parts, b.parts);
  const glass = b.parts.filter(p => p.kind === 'frustum4');
  assert.ok(glass.length >= 9 && glass.every(p => p.color === tower.DARK), 'the glass is ink-dark');
  const trims = b.parts.filter(p => p.glow != null);
  assert.ok(trims.length >= 8 && trims.every(p => p.glow === tower.NEON_BLUE && p.color === tower.NEON_BLUE), 'the trims glow neon blue');
  assert.ok(b.parts.every(p => p.color === tower.DARK || p.color === tower.NEON_BLUE), 'nothing cream, sand or glass-green is left');
  // 平屋頂：roof 是屋頂面高度（相對 at），寬 ≥ 1.4（10 隻機器鼠＋一台車站得下），桅杆在屋頂後緣、尖頂 = top
  const deck = b.parts.find(p => p.name === 'deck');
  assert.ok(deck && deck.scale[0] >= 1.4 && deck.scale[2] >= 1.4, 'a flat roof deck');
  assert.ok(Math.abs(deck.pos[1] + deck.scale[1] / 2 - b.roof) < 1e-9, 'roof = the deck top face');
  assert.ok(b.mast.z < -0.4 && b.mast.x === 0, `mast at the back of the roof (${b.mast.z})`);
  assert.ok(b.top > b.roof + 0.5, 'the mast stands above the roof');
  assert.equal(v['tower.main'].labelY, plain['tower.main'].labelY, 'the head (skyline) stays: no camera jump');
  const sc = v['tower.screen'];
  assert.ok(sc, 'tower.screen');
  assert.equal(sc.kind, 'compound'); assert.equal(sc.footprint, false); assert.equal(sc.shadow, false);
  assert.ok(Math.abs(sc.at.x - (at.x + b.mast.x)) < 1e-9 && Math.abs(sc.at.z - (at.z + b.mast.z)) < 1e-9, 'over the mast');
  const frame = sc.parts[0], lowest = Math.min(...sc.parts.map(p => p.pos[1] - p.scale[1] / 2));
  assert.ok(sc.at.y + lowest > at.y + b.top + 0.5, `above the mast tip and the antenna rod (${(sc.at.y + lowest - at.y - b.top).toFixed(2)})`);
  assert.ok(Math.abs(frame.scale[0] - 1.1) < 1e-9 && Math.abs(frame.scale[1] - 0.6) < 1e-9 && frame.scale[2] <= 0.1, 'a 1.1 × 0.6 panel, thin along z');
  const face = sc.parts.find(p => p.glow != null);
  assert.ok(face && face.pos[2] > frame.pos[2], 'the glowing face is on the +z (camera) side');
  assert.ok(sc.at.y + Math.max(...sc.parts.map(p => p.pos[1] + p.scale[1] / 2)) <= at.y + v['tower.main'].labelY + 0.15, 'inside the overview skyline');
  // 天線照舊（脈動、在桅杆頂），罩子照舊全亮，燈光秀照舊
  assert.equal(v['tower.antenna'].pulse, true);
  assert.deepEqual(v['tower.antenna'].models[0].pos, [b.mast.x, b.top, b.mast.z], 'the antenna rod on the mast tip');
  assert.deepEqual(v['tower.shield'], tower.shieldSpec('full'));
  assert.ok(v['tower.show']);
  // 屋頂的霓虹邊條（1.64）比底座寬：站位照底座 1.6 見方，跟點燈的塔一樣（走路格不變）
  assert.deepEqual(v['tower.main'].footprint, { x: 0, z: 0, w: 1.6, d: 1.6 }, 'stands on the same base as the lit tower');
  // 沒有尾聲就是平常的塔，沒有螢幕（外星尾聲是母艦，下一個測試）
  assert.equal(plain['tower.screen'], undefined);
  assert.equal(tower.view(lv, { missile: 'shield', epilogue: 'alien' }, { total: 61 })['tower.screen'], undefined);
});
// 最終章 §7 外星：101 閃白變母艦——整座塔身抬離地面 1.0（底座懸浮），底下一片綠光盤（C.alien 發光、y 0.5），
// 頂帽尖塔換成倒扣的碟（dome 繞 x 翻 π）＋碟緣，變異鼠王坐在碟頂中心（shipTop）；天線退到碟緣後側、跟著抬高，罩子照樣全亮、燈光秀照樣
test('view with epilogue alien: base lifted by 1.0 with a green glow disc beneath, top is an inverted dome; antenna kept', () => {
  const lv = lvOf(61), flags = { missile: 'shield', epilogue: 'alien' }, v = tower.view(lv, flags, { total: 61 }), plain = tower.view(lv, { missile: 'shield' }, { total: 61 });
  const at = anchorWorld('tower'), lit = tower.body('lit'), b = tower.body('lit', { ship: true });
  assert.deepEqual(v['tower.main'].parts, b.parts);
  // 塔身：點燈的塔拿掉頂帽與尖塔，其餘每個零件 y + 1.0
  const kept = lit.parts.slice(0, -2);
  for (const p of kept) assert.ok(b.parts.some(q => q.kind === p.kind && q.pos[0] === p.pos[0] && Math.abs(q.pos[1] - p.pos[1] - 1.0) < 1e-9 && q.pos[2] === p.pos[2]), `${p.kind} at ${p.pos[1]} lifted by 1.0`);
  const base = b.parts.find(p => p.kind === 'box' && p.scale[0] === 1.6);
  assert.ok(Math.abs(base.pos[1] - base.scale[1] / 2 - 1.0) < 1e-9, 'the base floats 1.0 off the ground');
  const disc = b.parts.find(p => p.name === 'disc');
  assert.ok(disc && disc.kind === 'cylinder' && Math.abs(disc.pos[1] - 0.5) < 1e-9 && Math.abs(disc.scale[0] / 2 - 1.2) < 1e-9 && disc.scale[1] <= 0.1, 'green disc r 1.2 at y 0.5');
  assert.equal(disc.color, C.alien); assert.equal(disc.glow, C.alien);
  const saucer = b.parts.find(p => p.kind === 'dome');
  assert.ok(saucer && Math.abs(saucer.rot[0] - Math.PI) < 1e-9, 'an inverted dome on top');
  const tiersTop = 0.3 + 1.1 + 8 * 0.45 + 1.0;
  assert.ok(saucer.pos[1] > tiersTop, 'the bowl rim is above the top tier');
  assert.ok(!b.parts.some(p => p.kind === 'cylinder' && p.scale[0] === 0.08), 'no spire');
  assert.ok(Math.abs(at.y + b.deck - tower.shipTop()) < 1e-9 && b.deck >= saucer.pos[1], 'shipTop = world y of the saucer top');
  // dome 的單位幾何是上半球（y 0 … 0.5）：翻過來的碗從 pos 往下 scale·0.5；其他零件以 pos 為中心
  assert.ok(b.parts.every(p => (p.kind === 'dome' ? p.pos[1] : p.pos[1] + (Array.isArray(p.scale) ? p.scale[1] : p.scale) / 2) <= b.deck + 1e-9), 'nothing pokes above the saucer deck');
  assert.ok(saucer.pos[1] - saucer.scale[1] / 2 < tiersTop, 'the bowl bottom dips into the top tier (no gap)');
  // 頭頂（天際線）照點燈的塔：收尾的 focus home 不跳鏡頭；王冠鼠坐在碟頂也在頭頂下
  assert.equal(v['tower.main'].labelY, plain['tower.main'].labelY);
  assert.ok(v['tower.main'].labelY >= b.deck + 0.6, 'the head is over the saucer top (room for the crowned mutant)');
  assert.deepEqual(v['tower.main'].footprint, { x: 0, z: 0, w: 1.6, d: 1.6 }, 'stands on the same base (the disc is wider)');
  // 天線照舊（脈動），細桿立在碟緣後側、碟頂高度；罩子全亮；燈光秀跟著抬高
  assert.equal(v['tower.antenna'].pulse, true);
  assert.deepEqual(v['tower.antenna'].models[0].pos, [b.mast.x, b.top, b.mast.z]);
  // 碟子（Antenna_2，高 0.3）掛在碟頂下 0.6——最上一節塔身（方錐台寬 1.16，半寬 0.58）的高度：要在塔身外面，不埋進去
  const dish = v['tower.antenna'].models[1], topTier = { from: tiersTop - 0.45, to: tiersTop };
  assert.ok(dish.pos[1] > topTier.from && dish.pos[1] < topTier.to, `the dish hangs beside the top tier (y ${dish.pos[1].toFixed(2)})`);
  assert.ok(Math.max(Math.abs(dish.pos[0]), Math.abs(dish.pos[2])) - dish.h / 2 > 1.16 / 2, `the dish is outside the top tier (${dish.pos[0]}, ${dish.pos[2].toFixed(2)})`);
  assert.ok(Math.abs(b.top - b.deck) < 1e-9 && b.mast.z < -0.4, 'antenna on the back of the saucer');
  assert.deepEqual(v['tower.shield'], tower.shieldSpec('full'));
  assert.ok(v['tower.show'] && v['tower.show'].parts.every(p => p.pos[1] >= 1.0 + 1.0 - 1e-9), 'the lightshow lifted with the body');
  assert.equal(v['tower.screen'], undefined);
  assert.deepEqual(tower.body('lit', { ship: false }), lit);
});
test('all tower parts stand on the tower anchor', () => {
  const a = anchorWorld('tower');
  for (const v of [tower.view(zero, {}), tower.view(lvOf(55, { chip: 9, bulb: 5 }), {})]) for (const k in v) assert.deepEqual(v[k].at, a, k);
});
test('crane, antenna pulse and lightshow builders animate', () => {
  const glow = createGlowRegistry(); glow.setNight(1);
  const f = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: tower.builders });
  const crane = f.build(tower.view(zero, {})['tower.crane']); const jib = crane.object.getObjectByName('jib');
  crane.update(0.1, 1); const r1 = jib.rotation.y; crane.update(0.1, 3); assert.notEqual(jib.rotation.y, r1);
  const pulse = f.build(tower.view({ ...zero, chip: 9 }, {})['tower.antenna']); const m = pulse.materials[0];
  pulse.update(0.1, 0.75); const a = m.emissiveIntensity; pulse.update(0.1, 2.25); assert.notEqual(m.emissiveIntensity, a);
  pulse.update(0.1, 3.75); assert.ok(Math.abs(m.emissiveIntensity - a) < 1e-9, 'every 3 s');
  const still = f.build(tower.view({ ...zero, chip: 7 }, {})['tower.antenna']); assert.equal(still.update, undefined, 'Lv7 antenna does not pulse');
  const show = f.build(tower.view({ ...zero, bulb: 5 }, {})['tower.show']); const c0 = show.materials[0].emissive.getHex();
  show.update(0.1, 1); assert.notEqual(show.materials[0].emissive.getHex(), c0);
  for (const p of [crane, pulse, still, show]) p.dispose?.(); assert.equal(glow.size, 0);
});

// 101 跳階只在回合最後的 settle 發生（計畫 3.6）：view 用 meta.total，沒給才自己加總
test('view uses meta.total when given; stage names for the float', () => {
  assert.equal(tiers(tower.view(lvOf(31), {}, { total: 0 })), 1, 'meta.total wins');
  assert.equal(tiers(tower.view(lvOf(31), {})), 10);
  assert.deepEqual(tower.STAGE_NAMES, { site: '101 工地', half: null, full: '101 完工', lit: '101 點燈' });
  assert.ok(tower.view(zero, {}, { total: 0 })['tower.main'].labelY > 1);
});

// ── settle 劇本（§8.9；計畫 11 §設計 4）：跨門檻才演——回全景、換零件（長出來）、頭上寫階段名；沒有人走過去揮鋤頭 ──
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const labelOf = beats => {
  let text = null; const ctx = { stage: { headOf: () => ({ x: 0, y: 0, z: 0 }) }, bubbles: { levelUp: (h, o) => { text = o.text; return { cancel() {} }; } } };
  beats.find(b => b.kind === 'levelUp').start(ctx); return text;
};

test('settle crossing 6→7 yields focus(home) + apply + levelUp (bare LEVEL UP) — no walk, no build gesture, no home; 6→6 and 7→28 yield nothing', () => {
  const ctx = { B, roster: { members: () => { throw new Error('settle does not look anyone up'); } } }, e = { kind: 'settle' };
  const beats = tower.script.settle(e, { total: 7, prevTotal: 6 }, ctx);
  assert.deepEqual(beats.map(b => b.kind), ['focus', 'apply', 'levelUp']);
  // 換零件前回全景（不是回合最後那拍：照樣尊重拖過），停 0.8 s 讓鏡頭飛到
  assert.equal(beats[0].target, 'home'); assert.equal(beats[0].final, false); assert.equal(beats[0].dur, 0.8);
  assert.equal(labelOf(beats), 'LEVEL UP');
  assert.deepEqual(tower.script.settle(e, { total: 6, prevTotal: 6 }, ctx), []);
  assert.deepEqual(tower.script.settle(e, { total: 28, prevTotal: 7 }, ctx), []);
  assert.equal(labelOf(tower.script.settle(e, { total: 30, prevTotal: 21 }, ctx)), '101 完工');
  assert.equal(labelOf(tower.script.settle(e, { total: 57, prevTotal: 50 }, ctx)), '101 點燈');
});

// 照正解演到第 n 回合（放置回合之後接最後一輪）：只有第 n 回合 live，之前的 instant；回傳 settle 那段的秒數與這回合新增的泡泡。
async function liveTurn(h, order, n) {
  let s = engine.createState(spec);
  const turns = turnSteps(order).slice(0, n);
  for (let i = 0; i < turns.length; i++) {
    const r = turns[i](s); s = r.state; const events = [...r.events, { kind: 'settle' }];
    if (i + 1 < turns.length) { await h.run(events, { instant: true }); continue; }
    const n0 = h.bubblesLog.length; let mark = null;
    // 劇本秒數（不含鏡頭 focus 拍）：settle 那一段 = 回合結束 − settle 開始
    const secs = await h.run(events, { onMark: e => { if (e.kind === 'settle') mark = h.scriptElapsed(); } });
    return { settleSecs: secs - mark, bubbles: h.bubblesLog.slice(n0) };
  }
}
const allHome = show => { for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k); };
const nearHead = (show, at) => { const h = show.stage.headOf('tower'); assert.ok(Math.hypot(at.x - h.x, at.z - h.z) < 0.5, 'label over the tower'); };

// 跨進「蓋一半」的那一回合（從總等級曲線找，不寫死回合數）；前一回合不跨
test('headless: the turn crossing into 蓋一半 ends with the bare LEVEL UP label over the tower, everyone home, settle 1.5–3.5 s; a non-crossing settle takes 0 s', async () => {
  const h = await headlessShow(), order = SOLUTIONS[0], { totals, at } = towerCrossings(order);
  const before = await liveTurn(h, order, at.half - 1);
  assert.ok(before.settleSecs < 0.05, `no crossing → no time (${before.settleSecs})`);
  h.show.reset();
  const t = await liveTurn(h, order, at.half);
  assert.equal(t.bubbles.at(-1).text, 'LEVEL UP'); nearHead(h.show, t.bubbles.at(-1).at);
  assert.ok(t.settleSecs >= 1.5 && t.settleSecs <= 3.5, `settle ${t.settleSecs.toFixed(2)} s`);   // 回全景 0.8 + 長出來 + LEVEL UP 1.0
  allHome(h.show); assert.equal(h.show.stage.meta.total, totals[at.half - 1]);
});

// 跨進點燈的那一回合（從總等級曲線找；放置回合或最後一輪都一樣演）：看得到階段名
test('headless: the turn crossing into 點燈 shows the label', async () => {
  const order = SOLUTIONS[0], { at } = towerCrossings(order);
  assert.ok(at.lit >= 1, `點燈 is reached (turn ${at.lit})`);
  const h = await headlessShow(), t = await liveTurn(h, order, at.lit);
  assert.equal(t.bubbles.at(-1).text, '101 點燈'); nearHead(h.show, t.bubbles.at(-1).at); allHome(h.show);
});

// 計畫 11 §設計 4：101 跨階沒有人揮鋤頭——跨進「蓋一半」那一段 settle 裡沒有人在演 build、也沒有人被叫去走路
test('the 101 stage upgrade: nobody walks over or plays build during the crossing settle', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, builds = [];
  let settling = false;
  show.update = (dt, t) => {
    update(dt, t);
    if (!settling) return;
    for (const k of show.roster.keys()) for (const m of show.roster.members(k)) if (m.walker?.gesture?.kind === 'build') builds.push(`${k} ${t.toFixed(2)}`);
  };
  const { totals, at: into } = towerCrossings(SOLUTIONS[0]), crossed = totals[into.half - 1];
  let s = engine.createState(spec);
  const turns = turnSteps(SOLUTIONS[0]).slice(0, into.half);
  for (let i = 0; i < turns.length; i++) {
    const r = turns[i](s); s = r.state;
    await h.run([...r.events, { kind: 'settle' }], i + 1 < turns.length ? { instant: true } : { onMark: e => { if (e.kind === 'settle') settling = true; } });
  }
  assert.ok(settling, 'the settle played');
  assert.deepEqual(builds.slice(0, 5), [], `${builds.length} build frames during the settle`);
  assert.equal(show.stage.meta.total, crossed);
});

// §14.4 大升級回全景：回全景（換零件之前）→ 長出來、LEVEL UP 在全景裡演，頭頂不出框（計畫 11 §設計 4：不再先飛去 101 那一格看人揮鋤頭）
test('a stage crossing: focus(home) runs before apply and LEVEL UP, nobody builds; the rig is at the overview when the LEVEL UP appears', async () => {
  // 真的 rig；controls.update 像 OrbitControls 一樣讓鏡頭看著注視點（飛行中也是）
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 320), controls = { target: new THREE.Vector3(), update() { camera.lookAt(controls.target); } };
  const rig = createCameraRig({ THREE, camera, controls }); rig.fit(16 / 9);
  const h = await headlessShow({ rig }), { show } = h, log = [];
  let now = 0, settling = false;
  const update = show.update; show.update = (dt, t) => {
    now = t; update(dt, t);
    if (settling && [...show.roster.members('chip.worker'), ...show.roster.members('landmarks.islanders')].some(m => m.walker?.gesture?.kind === 'build')) log.push(['build', now]);
  };
  const { focus, home } = rig;
  rig.focus = (p, o) => { if (settling) log.push(['focus', now, p]); return focus(p, o); };
  rig.home = ms => { if (settling) log.push(['home', now, show.stage.meta.total]); return home(ms); };
  const levelUp = show.bubbles.levelUp;
  show.bubbles.levelUp = (head, opts) => {
    if (!settling) return levelUp(head, opts);
    camera.updateMatrixWorld();
    const p = head(); log.push(['levelUp', now, { flying: rig.flying, target: controls.target.clone(), top: new THREE.Vector3(p.x, p.y, p.z).project(camera).y }]);
    return levelUp(head, opts);
  };
  // 跨進「101 完工」的那一回合（頭頂 7.75，舊的全景會出框）：唯一正解的完工落在第 6 回合＝颱風放下的回合。
  // 修正輪 1 之後放下回合不再只留套用與 LEVEL UP（indoorSettle 拿掉了），101 的完整劇本照演——改回正解（2026-10-31 Task 5）
  const ORDER = ['milk', 'baseball', 'token', 'bulb', 'chip', 'typhoon', 'boba', 'rat'];
  const steps = turnSteps(ORDER).slice(0, towerCrossings(ORDER).at.full), events = [];
  let s = engine.createState(spec);
  for (const [i, step] of steps.entries()) {
    const r = step(s); s = r.state;
    if (i + 1 < steps.length) { await h.run([...r.events, { kind: 'settle' }], { instant: true }); continue; }
    events.push(...r.events, { kind: 'settle' });
  }
  const before = show.stage.meta.total;
  await h.run(events, { onMark: e => { if (e.kind === 'settle') settling = true; } });
  assert.equal(tower.stageOf(show.stage.meta.total), 'full'); assert.notEqual(tower.stageOf(before), 'full');
  const at = kind => log.findIndex(l => l[0] === kind);
  const hm = log[at('home')], lu = log[at('levelUp')];
  assert.equal(at('build'), -1, 'nobody builds');
  assert.equal(at('focus'), -1, 'no pan to the tower cell first');
  assert.ok(at('home') >= 0 && at('home') < at('levelUp'), log.map(l => l[0]).join(' '));
  assert.equal(hm[2], before, 'back to the overview before the parts change');
  // LEVEL UP 出現時鏡頭已經停在（抬高的）全景，頭頂在畫面上緣 10% 以內
  const probe = { target: new THREE.Vector3(), update() {} }, pc = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 320);
  const pr = createCameraRig({ THREE, camera: pc, controls: probe }); pr.fit(16 / 9); pr.setSkyline(show.stage.headOf('tower').y); pr.update(1.1);   // 停在全景時天際線變了是飛過去的（最終審稿 2）：飛完才是抬高的全景
  assert.equal(lu[2].flying, false, 'the rig has landed');
  assert.ok(lu[2].target.distanceTo(probe.target) < 1e-6, `at the raised overview (target y ${lu[2].target.y.toFixed(2)} vs ${probe.target.y.toFixed(2)})`);
  assert.ok(lu[2].top <= 0.8, `tower top at NDC ${lu[2].top.toFixed(3)}`);
});
