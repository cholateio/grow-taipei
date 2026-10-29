// test/chain.test.js：離島鏈（物品 v2 §5）整局 live 演完——燈泡 Lv7 風車轉、燈塔亮 → 燈泡 Lv8 海底電纜
// → 晶片 Lv6 通電 → Lv7 天線 → Lv8 測試閃三下 → Lv9 待命，每個零件在對的回合出現（不早、不晚）；結局接點（§8）讀新的狀態。
// 選擇帶動升級：燈泡 up[7] 要高鐵（代幣 ≥6），代幣 Lv7 通車到離島不一定在前面（賽博正解第 6 回合燈泡 7、第 7 回合代幣 7）——
// 風車島的支線在兩者先到的那個事件長出來（燈泡 Lv7 自己鋪），遊樂場島的支線跟代幣 Lv7。
// 兩條正解各演一次（seed 21、真的鏡頭 rig），同一趟也查共用不變式（gameInvariants：不穿牆、不瞬移、每回合回全景看得到 101 頭頂、
// 每個 LEVEL UP 與泡泡至少一半的時間在畫面裡）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { missile, resolve } from '../src/rules/endings.js';
import { headlessShow, turnSteps, overviewRig, gameInvariants, ALL } from './helpers/show.js';
import { finaleStep, EXAMPLE } from './helpers/endings.js';
import { MISS_CAP, MISS_WALK, MISS_PER_TURN, SIGH } from '../src/show/visit.js';
import { cellAt, NEIGHBORS } from '../src/scene/hex.js';
import { anchorWorld, frontOf, cellOf } from '../src/actors/anchors.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const FLASH = 0.4;   // 測試閃光的峰值 0.55、谷底 0.04；待命的淡輪廓 0.08–0.2 不會越過
const CHAIN = [['bulb', 7], ['bulb', 8], ['chip', 6], ['chip', 7], ['chip', 8], ['chip', 9]];

// 一條正解 live 演完：每回合記下演完後的等級、零件鍵、風車轉不轉、電纜亮不亮、罩子露不露出來，和這回合罩子閃了幾下；
// 每個事件演完（下一個事件的 mark 拍、或回合結束）再記一次零件鍵與電纜亮不亮（events：{ e: 'bulb8' 之類, keys, cableLit }）——
// 同一回合裡先後發生的兩節（例如燈泡 Lv8 鋪電纜、晶片 Lv6 通電）也分得出是哪個事件帶出來的。
// 最後一輪照一般回合演（選擇帶動升級 §4：沒有倒數字）；演完再演終局回合（警告＋飛彈＋尾聲，finale: true），
// 終局回合演到一半玩家拖了一下鏡頭（cam.rig.cancel()，review focus 5：收尾照樣回全景）；不變式一路查到終局回合演完。
// finale：{ ending, events（終局回合的合成事件）, secs（終局回合的真實秒數）, kinds（整局演到的事件種類）, flags, keys, script（演完還在劇本手上的人數）}
// 每回合記下每個 mark（info、開演那一刻的秒數）：撲空段的秒數、回合秒數與 ◆ 個數給回合上限查（拜訪 2026-10-29 拿掉了，查沒有 info.visit）
async function playChain(order) {
  const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam }), update = show.update;
  const paced = [];   // paced：每回合 { events, marks, secs }
  let flashes = 0, high = false;
  show.update = (dt, t) => {
    update(dt, t);
    const mesh = show.stage.partObject('tower.shield')?.children[0], op = mesh?.visible ? mesh.material.opacity : 0;
    if (op > FLASH && !high) flashes++;
    high = op > FLASH;
  };
  const blades = () => show.stage.partObject('sat.windmill')?.children[0].rotation.z ?? 0;
  const turns = [], grows = [], jumps = new Set(), events = [], cableLit = () => show.stage.partObject('chip.cable')?.children.length === 2;
  const tag = e => (e.kind === 'grow' ? `${e.item}${e.to}` : e.kind === 'placed' ? `${e.item}1` : e.kind);
  let prev = null;
  const kinds = new Set();
  const done = () => { if (prev) events.push({ e: tag(prev), keys: new Set(show.stage.partKeys()), cableLit: cableLit() }); prev = null; };
  let s = engine.createState(spec);
  for (const [i, step] of turnSteps(order).entries()) {
    const r = step(s); s = r.state; flashes = 0;
    const turn = `${order.join('>')} turn ${i + 1}`;
    inv.label(turn);
    grows.push(...r.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`));
    for (const e of r.events) if (e.kind === 'grow' && e.jump) jumps.add(`${e.item}${e.to}`);
    const marks = [];
    await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => {
      done(); prev = e; inv.label(`${turn} [${tag(e)}]`); kinds.add(e.kind);
      marks.push({ e, info, t: show.elapsed });
    } });
    paced.push({ events: r.events, marks, secs: show.elapsed });
    done(); inv.turnEnd();
    const z0 = blades(); for (let f = 0; f < 6; f++) show.update(1 / 30, 2000 + f / 30);
    const shield = show.stage.partObject('tower.shield')?.children[0];
    turns.push({
      lv: { ...show.stage.lv }, keys: new Set(show.stage.partKeys()), flashes,
      spin: Math.abs(blades() - z0) > 1e-6, cableLit: cableLit(),
      shieldOut: !!shield?.visible, keeper: show.roster.members('sat.keeper').length,
    });
    assert.deepEqual(show.stage.lv, s.lv, `turn ${i + 1}: stage levels equal the engine`);
  }
  const { events: fin, ending } = finaleStep(s), label = `${order.join('>')} finale`;
  inv.label(label);
  // 拖鏡頭放在終局回合演到一半（尾聲開演那一刻）：回合開頭的 release 已經過了，才真的測到「拖過之後 focus 跳過、收尾照回全景」（最終審稿）
  await run(fin, { finale: true, onMark: e => { inv.label(`${label} [${e.kind}]`); if (e.kind === 'epilogue') cam.rig.cancel(); } });
  inv.turnEnd();
  const finale = {
    ending, events: fin, kinds, secs: show.elapsed, flags: { ...show.stage.flags }, keys: new Set(show.stage.partKeys()), busy: show.busy,
    script: show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.mode === 'script').length,
  };
  return { turns, grows, jumps, events, state: s, inv, finale, paced };
}
let played = null;
const playBoth = () => (played ??= (async () => { const out = []; for (const order of SOLUTIONS) out.push(await playChain(order)); return out; })());

test('island chain, both solutions live: bulb 7 → bulb 8 → chip 6 → 7 → 8 → 9 in order, the spurs with token 7 (windmill with bulb 7 if earlier), each part in the turn its level arrives', async () => {
  let jumped8 = false;   // 至少一條正解的晶片 Lv8 是跳級的第二級（◆ 照演完整劇本的那個情況真的有量到）
  for (const [n, { turns, grows, jumps }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), at = (id, lv) => turns.findIndex(t => t.lv[id] >= lv);
    // 事件順序：鏈上每一節的 grow 都在，照順序
    const idx = CHAIN.map(([id, lv]) => grows.indexOf(`${id}${lv}`));
    assert.ok(idx.every(i => i >= 0), `${name}: every chain level grows (${JSON.stringify(idx)})`);
    assert.deepEqual([...idx].sort((a, b) => a - b), idx, `${name}: chain events in order ${JSON.stringify(idx)}`);
    const before = (k, i) => turns.slice(0, i).every(t => !t.keys.has(k)), from = (k, i) => turns.slice(i).every(t => t.keys.has(k));
    // 代幣 Lv7：遊樂場島的支線在代幣到 7 的那一回合長出來；風車島的支線在代幣 7、燈泡 7 先到的那一回合（電工搭高鐵過去，支線一定在）
    const t7 = at('token', 7), b7 = at('bulb', 7), w7 = Math.min(t7, b7);
    assert.ok(t7 >= 0 && grows.includes('token7'), `${name}: token reaches 7`);
    assert.ok(before('token.spur.playground', t7) && from('token.spur.playground', t7), `${name}: playground spur from turn ${t7 + 1}`);
    assert.ok(before('token.spur.windmill', w7) && from('token.spur.windmill', w7), `${name}: windmill spur from turn ${w7 + 1}`);
    assert.ok(turns[b7].lv.token >= 6, `${name}: the HSR carries the electrician (token ${turns[b7].lv.token} at bulb 7)`);
    // 燈泡 Lv7：風車轉、燈塔亮、守塔人都在燈泡到 7 的那一回合（之前沒有颱風的回合風車不轉、燈塔暗）
    turns.slice(0, b7).forEach((t, i) => { assert.ok(!t.keys.has('sat.lighthouse') && !t.keys.has('sat.beam') && !t.keeper, `${name} turn ${i + 1}: lighthouse dark`); if (t.lv.typhoon !== 2) assert.equal(t.spin, false, `${name} turn ${i + 1}: windmill still`); });
    turns.slice(b7).forEach((t, i) => assert.ok(t.spin && t.keys.has('sat.lighthouse') && t.keys.has('sat.beam') && t.keeper === 1, `${name} turn ${b7 + i + 1}: windmill turns, lighthouse lit, keeper out`));
    // 燈泡 Lv8 鋪電纜（暗）、晶片 Lv6 通電（亮）
    const wired = Math.min(at('bulb', 8), at('chip', 6)), c6 = at('chip', 6);
    assert.ok(before('chip.cable', wired) && from('chip.cable', wired), `${name}: cable from turn ${wired + 1}`);
    turns.forEach((t, i) => assert.equal(!!t.cableLit, i >= c6, `${name} turn ${i + 1}: cable lit only from chip 6 (turn ${c6 + 1})`));
    // 晶片 Lv7 天線；Lv8 那回合測試閃三下（其他回合不閃）、演完收起來；Lv9 起罩子常駐
    const c7 = at('chip', 7), c8 = at('chip', 8), c9 = at('chip', 9);
    assert.ok(before('tower.antenna', c7) && from('tower.antenna', c7), `${name}: antenna from turn ${c7 + 1}`);
    // 選擇帶動升級裁決 R6：Lv8 標 ◆，是跳級的第二級時（賽博：晶片 6 → 8）也演完整的測試、閃三下；其他回合都不閃
    if (jumps.has('chip8')) jumped8 = true;
    turns.forEach((t, i) => assert.equal(t.flashes, i === c8 ? 3 : 0, `${name} turn ${i + 1}: ${t.flashes} shield flashes`));
    assert.ok(before('tower.shield', c8) && from('tower.shield', c8), `${name}: shield from turn ${c8 + 1}`);
    turns.forEach((t, i) => assert.equal(t.shieldOut, i >= c9, `${name} turn ${i + 1}: standby shield out only from chip 9 (turn ${c9 + 1})`));
    // 一回合最多 +2：相鄰兩節可以同一回合（跳級），隔一節的一定分在不同回合
    assert.ok(c6 <= c7 && c7 <= c8 && c8 <= c9 && c6 < c8 && c7 < c9, `${name}: chip chain ${c6 + 1} ${c7 + 1} ${c8 + 1} ${c9 + 1}`);
  }
  assert.ok(jumped8, 'chip 8 is the second level of a jump in some solution');
});

// 事件層級：每個零件第一次出現在鏈上那一節的事件演完時（不是同一回合別的事件帶出來、也不是回合末才補上），之後一直都在
test('island chain, event by event: each chain part first appears with its own event and stays', async () => {
  for (const [n, { events, grows }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), first = has => events.findIndex(has), idx = tag => events.findIndex(x => x.e === tag);
    const windmill = grows.indexOf('bulb7') < grows.indexOf('token7') ? 'bulb7' : 'token7';   // 風車島支線：燈泡 Lv7 先到就自己鋪
    const PARTS = [['token.spur.windmill', windmill], ['token.spur.playground', 'token7'], ['sat.lighthouse', 'bulb7'], ['sat.beam', 'bulb7'],
      ['chip.cable', 'bulb8'], ['tower.antenna', 'chip7'], ['tower.shield', 'chip8']];
    for (const [key, tag] of PARTS) {
      const i = first(x => x.keys.has(key));
      assert.equal(events[i]?.e, tag, `${name}: ${key} first after ${events[i]?.e} (want ${tag})`);
      assert.ok(events.slice(i).every(x => x.keys.has(key)), `${name}: ${key} stays`);
    }
    const lit = first(x => x.cableLit);
    assert.equal(events[lit]?.e, 'chip6', `${name}: cable lit after ${events[lit]?.e}`); assert.ok(events.slice(lit).every(x => x.cableLit));
    assert.ok(idx('bulb8') < lit, `${name}: the cable lies dark between bulb 8 and chip 6`);
  }
});

test('both solutions end on the shield: every item MAX, no disaster flag, cyber / alien ending, satellites at the finale', async () => {
  const branches = [];
  for (const [n, { turns, state }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), end = turns.at(-1);
    assert.ok(spec.ORDER.every(id => state.lv[id] === spec.ITEMS[id].max), `${name}: all MAX ${JSON.stringify(state.lv)}`);
    assert.deepEqual(Object.keys(state.flags), ['ratBranch'], `${name}: no disaster flag ${JSON.stringify(state.flags)}`);
    assert.equal(missile(state, spec), 'shield');
    const r = resolve(state, spec); branches.push(r.id);
    assert.equal(r.id, state.flags.ratBranch, `${name}: ${r.id}`); assert.deepEqual(r.extras, []);
    // 終局的衛星島：寶箱打開、石堆綠光圈只在外星
    assert.ok(end.keys.has('sat.chest')); assert.equal(end.keys.has('sat.rocksRing'), state.flags.ratBranch === 'alien', `${name}: rocks ring`);
  }
  assert.deepEqual(branches.sort(), ['alien', 'cyber']);
});

// 最終章（選擇帶動升級 §4）：最後一輪是一般回合（沒有倒數字），終局回合演警告＋矽盾擋下＋各自的尾聲，演完回全景（turnEnd 查）、
// 劇本手上沒人；終局中途拖過鏡頭也一樣（不丟錯）。不穿牆、不瞬移、字在畫面裡由下面兩個測試查（不變式掛到終局回合演完）
test('both solutions live through the finale: one plain closing turn, finale turn [warning, missile, epilogue], game invariants clean, ends on the overview; a camera grab during the finale does not break it', async () => {
  for (const [n, { finale, inv, turns }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>');
    assert.equal(turns.length, spec.ORDER.length + spec.CLOSING_TURNS, `${name}: 8 placements + ${spec.CLOSING_TURNS} closing turn`);
    assert.ok(!finale.kinds.has('countdown'), `${name}: no countdown event`);
    assert.deepEqual(finale.events.map(e => e.kind), ['warning', 'missile', 'epilogue'], `${name}: warning, missile, epilogue`);
    assert.equal(finale.flags.missile, 'shield'); assert.equal(finale.flags.epilogue, finale.ending.id);
    assert.ok(finale.keys.has(finale.ending.id === 'cyber' ? 'finale.car' : 'finale.ufos'), `${name}: the ${finale.ending.id} epilogue parts`);
    assert.ok(!finale.keys.has('finale.flare'), `${name}: the flare is out`);
    assert.ok(finale.secs > 8 && finale.secs <= 22, `${name}: the finale turn played live (${finale.secs.toFixed(1)} s)`);
    assert.equal(finale.busy, false); assert.equal(finale.script, 0, `${name}: everyone back to daily life`);
    assert.deepEqual(inv.camera.filter(c => c.includes('finale')), [], `${name}: the finale ends on the overview`);
  }
});

test('both solutions live: nobody stays inside a building > 1.5 s, no daily member teleports, no scripted member relocates without a blink, every turn ends at the overview with the 101 top in frame', async () => {
  for (const { inv } of await playBoth()) {
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);   // 裁決 R3：換位置一定閃白
    assert.deepEqual(inv.camera, []);
  }
});

// 審稿（計畫 4 最後一輪）：演出的那一刻要在畫面裡——颱風登陸後的 LEVEL UP、101 頭上的「恭喜畢業」「世界珍奶節」、代幣 Lv8 站上的 LEVEL UP、
// 老鼠撞攤車時老闆的 ！，鏡頭都要跟上（gameInvariants 的 labels：活著的時間至少一半投影在 NDC [-1, 1] 裡）
test('both solutions live: every LEVEL UP label and bubble is on screen for at least half its life', async () => {
  assert.deepEqual((await playBoth()).flatMap(({ inv }) => inv.labels), []);
});

// 拜訪拿掉了（2026-10-29 回到 GROW 設計 §4.2）：兩條正解沒有任何一段拜訪（mark 沒有 info.visit）；
// 撲空（設計 §5）：正解幾乎沒有 wait，一樣每回合 ≤ MISS_PER_TURN 段、每段 ≤ MISS_CAP（事件秒數扣掉物品之間的空拍）；
// 放置回合與最後一輪 ≤ 60 + 8 × max(0, ◆ − 1)
test('both solutions: no grow plays a visit; misses ≤ 2 per turn and ≤ 3 s; turns within 60 + 8 × (◆ − 1)', async () => {
  for (const [n, { paced }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>');
    for (const [i, { marks, secs }] of paced.entries()) {
      const what = `${name} turn ${i + 1}`;
      assert.deepEqual(marks.filter(m => m.info?.visit).map(m => `${m.e.item}${m.e.to}`), [], `${what}: no visit marks`);
      const keys = marks.filter(m => m.info?.key).length, cap = 60 + 8 * Math.max(0, keys - 1);
      assert.ok(secs <= cap, `${what}: ${secs.toFixed(1)} s > ${cap} (◆ ${keys})`);
      const misses = marks.map((m, j) => ({ ...m, next: marks[j + 1] })).filter(m => m.info?.miss);
      assert.ok(misses.length <= MISS_PER_TURN, `${what}: ${misses.length} misses`);
      for (const m of misses) assert.ok((m.next?.t ?? secs) - m.t - m.info.gap <= MISS_CAP, `${what}: miss ${m.info.item} ${((m.next?.t ?? secs) - m.t - m.info.gap).toFixed(2)} s`);
    }
  }
});

// 撲空（計畫 6 設計 §5、§8）：亂放的兩局（EXAMPLE.hit／deflect）整局 live（真鏡頭、種子 21）——每回合撲空 ≤ MISS_PER_TURN 段、是 wait 事件裡前兩個這一級叫得到代表的（照 ORDER；最終審稿 3）、
// 每段 ≤ MISS_CAP；演了的那幾段代表走到對的地方：缺的幫手那一格跟他同格或相鄰、走得到又在 MISS_WALK 秒內 → 幫手的空地（錨點旁）或拜訪點正面；
// 否則自己門口（門口超過 MISS_WALK 秒：往門口走了 MISS_WALK 秒那麼遠）；回合 ≤ 60 + 8 × max(0, ◆ − 1)；
// 不變式（不穿牆、不瞬移、不靜靜換位置 pops、每回合回全景、字在畫面裡）照查到終局
const near = (a, b) => !!a && !!b && ((a[0] === b[0] && a[1] === b[1]) || NEIGHBORS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]));
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
async function playMisses(order) {
  const cam = overviewRig(), { show, run, bubblesLog } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam });
  const mod = id => ALL.find(m => m.id === id), turns = [];
  let s = engine.createState(spec);
  for (const [i, step] of turnSteps(order).entries()) {
    const prev = s, r = step(s); s = r.state;
    const turn = `${order.join('>')} turn ${i + 1}`, segs = [];
    // wait 事件那一刻的等級（撲空排位子看的就是它：script.hasRep(lv)）
    let view = { lv: prev.lv, flags: prev.flags };
    for (const e of r.events) { if (e.kind === 'wait') break; view = engine.foldEvent(view, e); }
    inv.label(turn);
    let cur = null, keys = 0;
    const close = () => { if (!cur) return; cur.end = cur.rep && { ...cur.rep.pos }; cur.secs = show.elapsed - cur.t - cur.info.gap; cur.bubbles = bubblesLog.length - cur.from; cur = null; };
    await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => {
      close(); inv.label(`${turn} [${e.kind}${e.item ? ` ${e.item}` : ''}]`);
      if (info?.key) keys++;
      if (!info?.miss) return;
      const sv = { lv: { ...show.stage.lv }, flags: show.stage.flags }, rep = mod(info.item).script.rep(sv, { roster: show.roster, nav: show.nav });
      const usable = !!rep && !rep.hidden && !rep.gone && rep.mode === 'home' && (!!cellAt(rep.pos.x, rep.pos.z) || show.nav.walkable(rep.pos.x, rep.pos.z));
      cur = { e, info, w: e.waits.find(w => w.item === info.item), sv, rep: usable ? rep : null, start: usable ? { ...rep.pos } : null, t: show.elapsed, from: bubblesLog.length };
      segs.push(cur);
    } });
    close(); inv.turnEnd();
    turns.push({ events: r.events, segs, secs: show.elapsed, keys, waitLv: view.lv });
    assert.deepEqual(show.stage.lv, s.lv, `${turn}: stage levels equal the engine`);
  }
  const { events: fin } = finaleStep(s);
  inv.label(`${order.join('>')} finale`);
  await run(fin, { finale: true });
  inv.turnEnd();
  return { turns, inv, show, mod };
}

for (const outcome of ['hit', 'deflect']) {
  test(`EXAMPLE.${outcome}: every turn plays ≤ 2 misses at the right places, invariants clean`, async () => {
    const order = EXAMPLE[outcome], { turns, inv, show, mod } = await playMisses(order), nav = show.nav;
    let shown = 0;
    const kinds = new Set();
    for (const [i, { events, segs, secs, keys, waitLv }] of turns.entries()) {
      const what = `${outcome} turn ${i + 1}`, wait = events.find(e => e.kind === 'wait');
      const landed = wait && events.slice(0, events.indexOf(wait)).some(e => engine.landsTyphoon(e));
      // 最終審稿 3：位子只給這一級叫得到代表的（script.hasRep），照 ORDER 往後補
      const want = !wait || landed ? [] : wait.waits.filter(w => mod(w.item)?.script?.rep && mod(w.item).script.hasRep(waitLv[w.item])).slice(0, MISS_PER_TURN).map(w => w.item);
      assert.deepEqual(segs.map(g => g.w.item), want, `${what}: misses = the first ${MISS_PER_TURN} waits in ORDER that have a rep at their level`);
      assert.ok(segs.length <= MISS_PER_TURN);
      for (const g of segs) {
        const label = `${what} ${g.w.item}<${g.w.for[0]}`;
        assert.equal(g.bubbles, 0, `${label}: no bubble`);
        assert.ok(g.secs <= MISS_CAP, `${label}: ${g.secs.toFixed(2)} s`);
        if (!g.rep) { assert.ok(g.secs < 0.05, `${label}: nobody to send, 0 s (${g.secs.toFixed(2)})`); continue; }
        shown++;
        assert.ok(g.secs >= SIGH - 0.05, `${label}: played (${g.secs.toFixed(2)} s)`);
        // 對的地方：幫手那邊（同格或相鄰、MISS_WALK 秒內走得到）優先，否則自己門口
        const cap = MISS_WALK * g.rep.speed, h = g.w.for[0], hl = g.sv.lv[h], here = cellAt(g.start.x, g.start.z) ?? cellOf(g.w.item);
        const len = to => { const r = nav.route(g.start, to); return flat(r.at(-1), to) <= 0.3 ? nav.routeLength(r) : Infinity; };
        const spotOf = (id, n) => { const sp = n > 0 ? mod(id).visitSpot(n, g.sv) : null; return sp && cellAt(sp.x, sp.z) ? frontOf(sp, sp.r, nav) : null; };
        const helperAt = h === 'typhoon' ? null : hl === 0 ? null : spotOf(h, hl), lot = h !== 'typhoon' && hl === 0 ? anchorWorld(h) : null;
        const door = spotOf(g.w.item, g.sv.lv[g.w.item]);
        let kind;
        if (lot && flat(g.end, lot) <= 1.3 && near(cellAt(g.end.x, g.end.z), here)) kind = 'lot';
        else if (helperAt && flat(g.end, helperAt) < 0.2) kind = 'spot';
        else if (door && flat(g.end, door) < 0.2) kind = 'door';
        else if (door && len(door) > cap && flat(g.end, door) < flat(g.start, door) - Math.min(1, cap / 2)) kind = 'toward door';
        else if (!door) kind = 'here';
        assert.ok(kind, `${label}: ended at (${g.end.x.toFixed(2)}, ${g.end.z.toFixed(2)}) — not the helper, not its door (start ${g.start.x.toFixed(2)}, ${g.start.z.toFixed(2)})`);
        // 幫手那邊走得到又近（同格／相鄰、MISS_WALK 秒內）就一定是去幫手那邊
        if (helperAt && near(cellAt(helperAt.x, helperAt.z), here) && len(helperAt) <= cap - 0.05) assert.equal(kind, 'spot', `${label}: the helper's stand was within reach`);
        if (kind === 'lot' || kind === 'spot') assert.ok(near(cellAt(g.end.x, g.end.z), here), `${label}: helper side only when same / adjacent cell`);
        kinds.add(kind);
      }
      // 回合上限（設計 §6：60 秒上限在兩條正解與 EXAMPLE 上驗）：60 + 8 × max(0, ◆ − 1)
      assert.ok(secs <= 60 + 8 * Math.max(0, keys - 1), `${what}: ${secs.toFixed(1)} s (◆ ${keys})`);
    }
    console.log(`# EXAMPLE.${outcome}: ${shown} misses played (${[...kinds].join(', ')})`);
    assert.ok(shown >= 3, `${outcome}: misses actually play (${shown})`);
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);
    assert.deepEqual(inv.camera, []);
    assert.deepEqual(inv.labels, []);
  });
}
