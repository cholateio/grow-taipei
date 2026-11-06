// test/chain.test.js：離島鏈（物品 v2 §5）整局 live 演完——燈泡 Lv7 風車轉、燈塔亮 → 燈泡 Lv8 海底電纜
// → 晶片 Lv6 通電 → Lv7 木箱 → Lv8 鷹架 → Lv9 天線＋罩子待命（R48），每個零件在對的回合出現（不早、不晚）；結局接點（§8）讀新的狀態。
// 回到 GROW（2026-10-29）之後晶片 6 是跳級：唯一正解（2026-10-31）第 7 回合晶片 6、第 8 回合燈泡 7、8——電纜跟著晶片那個事件亮著出現（不再先暗著）。
// 代幣 Lv7 通車到離島與燈泡 Lv7 誰先到不一定（正解第 7 回合代幣 7、第 8 回合燈泡 7）——
// 風車島的支線在兩者先到的那個事件長出來（燈泡 Lv7 自己鋪），遊樂場島的支線跟代幣 Lv7。
// 唯一正解演一次（seed 21、真的鏡頭 rig），同一趟也查共用不變式（gameInvariants：不穿牆、不瞬移、每回合回全景看得到 101 頭頂、
// 每個 LEVEL UP 與泡泡至少一半的時間在畫面裡）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { missile, resolve } from '../src/rules/endings.js';
import { headlessShow, turnSteps, overviewRig, gameInvariants, ALL } from './helpers/show.js';
import { finaleStep, EXAMPLE } from './helpers/endings.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const FLASH = 0.4;   // 待命的淡輪廓 0.08–0.2 不會越過（R48 起沒有 Lv8 的閃三下，整局都不該越過）
const CHAIN = [['bulb', 7], ['bulb', 8], ['chip', 6], ['chip', 7], ['chip', 8], ['chip', 9]];

// 一條正解 live 演完：每回合記下演完後的等級、零件鍵、風車轉不轉、電纜亮不亮、罩子露不露出來，和這回合罩子閃了幾下；
// 每個事件演完（下一個事件的 mark 拍、或回合結束）再記一次零件鍵與電纜亮不亮（events：{ e: 'bulb8' 之類, keys, cableLit }）——
// 同一回合裡先後發生的兩節（例如燈泡 Lv8 鋪電纜、晶片 Lv6 通電）也分得出是哪個事件帶出來的。
// 最後一輪照一般回合演（選擇帶動升級 §4：沒有倒數字）；演完再演終局回合（警告＋隕石＋尾聲，finale: true），
// 終局回合演到一半玩家拖了一下鏡頭（cam.rig.cancel()，review focus 5：收尾照樣回全景）；不變式一路查到終局回合演完。
// finale：{ ending, events（終局回合的合成事件）, secs（終局回合的真實秒數）, kinds（整局演到的事件種類）, flags, keys, script（演完還在劇本手上的人數）}
// 每回合記下每個 mark（info、開演那一刻的秒數）：回合秒數與 ◆ 個數給回合上限查（拜訪 2026-10-29、撲空 2026-10-31 拿掉了，查沒有 info.visit／info.miss）
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

// 回到 GROW（2026-10-29 設計 §3.2）：晶片 6 是跳級（變電所：燈泡 ≥6），同一回合照 ORDER 晶片排在燈泡前面——正解晶片 6 在燈泡 7、8
// 之前（第 7 回合；燈泡 7、8 在第 8 回合），電纜跟著晶片那個事件亮著出現。所以不再查「燈泡 8 → 晶片 6」的先後，只查各自照順序
test('island chain, the solution live: bulb 7 → 8 and chip 6 → 7 → 8 → 9 each in order, the spurs with token 7, each part in the turn its level arrives', async () => {
  let jumped8 = false;   // 正解的晶片 Lv8 是跳級的第二級（◆ 照演完整劇本的那個情況真的有量到）
  for (const [n, { turns, grows, jumps }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), at = (id, lv) => turns.findIndex(t => t.lv[id] >= lv);
    // 事件順序：鏈上每一節的 grow 都在，照順序
    const idx = CHAIN.map(([id, lv]) => grows.indexOf(`${id}${lv}`));
    assert.ok(idx.every(i => i >= 0), `${name}: every chain level grows (${JSON.stringify(idx)})`);
    for (const id of ['bulb', 'chip']) {
      const own = idx.filter((_, k) => CHAIN[k][0] === id);
      assert.deepEqual([...own].sort((a, b) => a - b), own, `${name}: ${id} chain events in order ${JSON.stringify(own)}`);
    }
    const before = (k, i) => turns.slice(0, i).every(t => !t.keys.has(k)), from = (k, i) => turns.slice(i).every(t => t.keys.has(k));
    // 代幣 Lv7：兩條支線都在代幣到 7 的那一回合長出來（R39，使用者 2026-11-05：電燈 Lv7 不搭車，不再先鋪風車島那條）
    const t7 = at('token', 7), b7 = at('bulb', 7);
    assert.ok(t7 >= 0 && grows.includes('token7'), `${name}: token reaches 7`);
    for (const k of ['token.spur.playground', 'token.spur.windmill']) assert.ok(before(k, t7) && from(k, t7), `${name}: ${k} from turn ${t7 + 1}`);
    // 燈泡 Lv7：風車轉、燈塔亮、守塔人都在燈泡到 7 的那一回合（之前沒有颱風的回合風車不轉、燈塔暗）
    turns.slice(0, b7).forEach((t, i) => { assert.ok(!t.keys.has('sat.lighthouse') && !t.keys.has('sat.beam') && !t.keeper, `${name} turn ${i + 1}: lighthouse dark`); if (!(t.lv.typhoon >= 1 && t.lv.typhoon <= 2)) assert.equal(t.spin, false, `${name} turn ${i + 1}: windmill still`); });
    turns.slice(b7).forEach((t, i) => assert.ok(t.spin && t.keys.has('sat.lighthouse') && t.keys.has('sat.beam') && t.keeper === 1, `${name} turn ${b7 + i + 1}: windmill turns, lighthouse lit, keeper out`));
    // 燈泡 Lv8 鋪電纜（暗）、晶片 Lv6 通電（亮）
    const wired = Math.min(at('bulb', 8), at('chip', 6)), c6 = at('chip', 6);
    assert.ok(before('chip.cable', wired) && from('chip.cable', wired), `${name}: cable from turn ${wired + 1}`);
    turns.forEach((t, i) => assert.equal(!!t.cableLit, i >= c6, `${name} turn ${i + 1}: cable lit only from chip 6 (turn ${c6 + 1})`));
    // R48（使用者 2026-11-06：矽盾只有在真結局才會長）：晶片 Lv7 木箱運到 101 腳下、Lv8 塔頂鷹架（Lv9 兩樣都拿掉）；
    // 天線與罩子 Lv9 才出現、之後常駐；罩子從來不閃（Lv8 的測試拿掉了）
    const c7 = at('chip', 7), c8 = at('chip', 8), c9 = at('chip', 9);
    const only = (k, i, j) => turns.every((t, n) => t.keys.has(k) === (n >= i && n < j));
    assert.ok(only('chip.crates', c7, c9), `${name}: crates turns ${c7 + 1}–${c9}`);
    assert.ok(only('tower.scaffold', c8, c9), `${name}: scaffold turns ${c8 + 1}–${c9}`);
    // 選擇帶動升級裁決 R6：Lv8 標 ◆。正解的晶片 8 在 ◆ 跟 ◆ 之間的跳級裡（第 8 回合 7 → 8），Task 6a 修正輪裁決：這種跳級不合成，兩級各演自己的 ◆
    if (jumps.has('chip8')) jumped8 = true;
    turns.forEach((t, i) => assert.equal(t.flashes, 0, `${name} turn ${i + 1}: ${t.flashes} shield flashes`));
    for (const k of ['tower.antenna', 'tower.shield']) assert.ok(before(k, c9) && from(k, c9), `${name}: ${k} from turn ${c9 + 1}`);
    turns.forEach((t, i) => assert.equal(t.shieldOut, i >= c9, `${name} turn ${i + 1}: standby shield out only from chip 9 (turn ${c9 + 1})`));
    // 一回合最多 +2：相鄰兩節可以同一回合（跳級），隔一節的一定分在不同回合
    assert.ok(c6 <= c7 && c7 <= c8 && c8 <= c9 && c6 < c8 && c7 < c9, `${name}: chip chain ${c6 + 1} ${c7 + 1} ${c8 + 1} ${c9 + 1}`);
  }
  assert.ok(jumped8, 'chip 8 is the second level of a jump in some solution');
});

// 事件層級：每個零件第一次出現在鏈上那一節的事件演完時（不是同一回合別的事件帶出來、也不是回合末才補上），之後一直都在
// 回到 GROW 設計 §4.2：跳級合成一段——第一級沒有自己的 apply，那一級的零件跟第二級一起出現（own：零件屬於哪個事件演完）
test('island chain, event by event: each chain part first appears with its own event and stays', async () => {
  for (const [n, { events, grows, jumps }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), first = has => events.findIndex(has), idx = tag => events.findIndex(x => x.e === tag);
    // 兩級都是 ◆ 的跳級不合成（Task 6a 修正輪裁決：賽博晶片 7 → 8、外星 8 → 9），第一級照樣有自己的 apply
    const key = (id, n) => !!ALL.find(m => m.id === id)?.script?.grow?.[n]?.key;
    const own = tag => { const [, id, lv] = tag.match(/^([a-z]+)(\d+)$/), n = +lv; return jumps.has(`${id}${n + 1}`) && !(key(id, n) && key(id, n + 1)) ? `${id}${n + 1}` : tag; };
    // 風車島支線只跟代幣 Lv7 走（R39，使用者 2026-11-05：電燈 Lv7 不再先鋪）
    const PARTS = [['token.spur.windmill', 'token7'], ['token.spur.playground', 'token7'], ['sat.lighthouse', 'bulb7'], ['sat.beam', 'bulb7'],
      ['chip.cable', 'chip6'], ['tower.antenna', 'chip9'], ['tower.shield', 'chip9']].map(([key, tag]) => [key, own(tag)]);   // 電纜：晶片 6 在燈泡 8 之前（下面查）
    for (const [key, tag] of PARTS) {
      const i = first(x => x.keys.has(key));
      assert.equal(events[i]?.e, tag, `${name}: ${key} first after ${events[i]?.e} (want ${tag})`);
      assert.ok(events.slice(i).every(x => x.keys.has(key)), `${name}: ${key} stays`);
    }
    // R48：木箱跟晶片 7、鷹架跟晶片 8 一起出現，晶片 9 那個事件演完就拿掉了（縮下去）
    for (const [key, tag] of [['chip.crates', own('chip7')], ['tower.scaffold', own('chip8')]]) {
      const i = first(x => x.keys.has(key)), j = idx(own('chip9'));
      assert.equal(events[i]?.e, tag, `${name}: ${key} first after ${events[i]?.e} (want ${tag})`);
      assert.ok(j > i && events.slice(i, j).every(x => x.keys.has(key)) && events.slice(j).every(x => !x.keys.has(key)), `${name}: ${key} until chip 9`);
    }
    const lit = first(x => x.cableLit);
    assert.equal(events[lit]?.e, own('chip6'), `${name}: cable lit after ${events[lit]?.e}`); assert.ok(events.slice(lit).every(x => x.cableLit));
    // 正解晶片 6 在燈泡 8 之前（見上一個測試）：電纜第一次出現就是亮的，沒有暗著等通電的那段
    assert.ok(lit >= 0 && lit < idx(own('bulb8')), `${name}: chip 6 lights the cable before bulb 8 (${lit}, ${idx(own('bulb8'))})`);
  }
});

// 唯一正解（2026-10-31 §4.5）：真結局只有 cyber（外星改成壞結局「變異鼠稱王」，見 finale.test）
test('the solution ends on the shield: every item MAX, no disaster flag, the cyber ending, satellites at the finale', async () => {
  const branches = [];
  for (const [n, { turns, state }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), end = turns.at(-1);
    assert.ok(spec.ORDER.every(id => state.lv[id] === spec.ITEMS[id].max), `${name}: all MAX ${JSON.stringify(state.lv)}`);
    assert.deepEqual(Object.keys(state.flags), ['ratBranch'], `${name}: no disaster flag ${JSON.stringify(state.flags)}`);
    assert.equal(missile(state, spec), 'shield');
    const r = resolve(state, spec); branches.push(r.id);
    assert.equal(r.id, state.flags.ratBranch, `${name}: ${r.id}`); assert.deepEqual(r.extras, []);
    // 終局的衛星島：寶箱打開、石堆綠光圈（外星才有）不在、石堆的老鼠被軍團收掉
    assert.ok(end.keys.has('sat.chest')); assert.ok(!end.keys.has('sat.rocksRing'), `${name}: no rocks ring`); assert.ok(!end.keys.has('sat.rocks'), `${name}: no rocks rats`);
  }
  assert.deepEqual(branches, ['cyber']);
});

// 最終章（選擇帶動升級 §4）：最後一輪是一般回合（沒有倒數字），終局回合演警告＋矽盾擋下＋各自的尾聲，演完回全景（turnEnd 查）、
// 劇本手上沒人；終局中途拖過鏡頭也一樣（不丟錯）。不穿牆、不瞬移、字在畫面裡由下面兩個測試查（不變式掛到終局回合演完）
test('the solution live through the finale: one plain closing turn, finale turn [warning, missile, epilogue], game invariants clean, ends on the overview; a camera grab during the finale does not break it', async () => {
  for (const [n, { finale, inv, turns }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>');
    assert.equal(turns.length, spec.ORDER.length + spec.CLOSING_TURNS, `${name}: 8 placements + ${spec.CLOSING_TURNS} closing turn`);
    assert.ok(!finale.kinds.has('countdown'), `${name}: no countdown event`);
    assert.deepEqual(finale.events.map(e => e.kind), ['warning', 'missile', 'epilogue'], `${name}: warning, missile, epilogue`);
    assert.equal(finale.flags.missile, 'shield'); assert.equal(finale.flags.epilogue, finale.ending.id);
    assert.ok(finale.keys.has(finale.ending.id === 'cyber' ? 'finale.car' : 'finale.ufos'), `${name}: the ${finale.ending.id} epilogue parts`);
    assert.ok(!finale.keys.has('finale.star') && !finale.keys.has('finale.flare'), `${name}: the star is out (no sea flare at all, trim §C)`);
    assert.ok(finale.secs > 8 && finale.secs <= 22, `${name}: the finale turn played live (${finale.secs.toFixed(1)} s)`);
    assert.equal(finale.busy, false); assert.equal(finale.script, 0, `${name}: everyone back to daily life`);
    assert.deepEqual(inv.camera.filter(c => c.includes('finale')), [], `${name}: the finale ends on the overview`);
  }
});

test('the solution live: nobody stays inside a building > 1.5 s, no daily member teleports, no scripted member relocates without a blink, every turn ends at the overview with the 101 top in frame', async () => {
  for (const { inv } of await playBoth()) {
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);   // 裁決 R3：換位置一定閃白
    assert.deepEqual(inv.camera, []);
  }
});

// 審稿（計畫 4 最後一輪）：演出的那一刻要在畫面裡——颱風登陸後的 LEVEL UP、101 頭上的「恭喜畢業」「世界珍奶節」、代幣 Lv8 站上的 LEVEL UP、
// 老鼠撞攤車時老闆的 ！，鏡頭都要跟上（gameInvariants 的 labels：活著的時間至少一半投影在 NDC [-1, 1] 裡）
test('the solution live: every LEVEL UP label and bubble is on screen for at least half its life', async () => {
  assert.deepEqual((await playBoth()).flatMap(({ inv }) => inv.labels), []);
});

// 拜訪拿掉了（2026-10-29 回到 GROW 設計 §4.2）：唯一正解沒有任何一段拜訪（mark 沒有 info.visit）；撲空也拿掉了（R10，mark 沒有 info.miss）；
// 放置回合與最後一輪 ≤ 60 + 8 × max(0, ◆ − 1)
test('the solution: no grow plays a visit, no wait plays a miss; turns within 60 + 8 × (◆ − 1)', async () => {
  for (const [n, { paced }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>');
    for (const [i, { marks, secs }] of paced.entries()) {
      const what = `${name} turn ${i + 1}`;
      assert.deepEqual(marks.filter(m => m.info?.visit).map(m => `${m.e.item}${m.e.to}`), [], `${what}: no visit marks`);
      assert.deepEqual(marks.filter(m => m.info?.miss).map(m => m.info.item), [], `${what}: no miss marks`);
      const keys = marks.filter(m => m.info?.key).length, cap = 60 + 8 * Math.max(0, keys - 1);
      assert.ok(secs <= cap, `${what}: ${secs.toFixed(1)} s > ${cap} (◆ ${keys})`);
    }
  }
});

// 亂放的兩局（EXAMPLE.hit／deflect）整局 live（真鏡頭、種子 21）：wait 事件不演撲空（R10）、回合 ≤ 60 + 8 × max(0, ◆ − 1)；
// 不變式（不穿牆、不瞬移、不靜靜換位置 pops、每回合回全景、字在畫面裡）照查到終局
async function playExample(order) {
  const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam });
  const turns = [];
  let s = engine.createState(spec);
  for (const [i, step] of turnSteps(order).entries()) {
    const r = step(s); s = r.state;
    const turn = `${order.join('>')} turn ${i + 1}`, misses = [];
    inv.label(turn);
    let keys = 0;
    await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => {
      inv.label(`${turn} [${e.kind}${e.item ? ` ${e.item}` : ''}]`);
      if (info?.key) keys++;
      if (info?.miss) misses.push(info.item);
    } });
    inv.turnEnd();
    turns.push({ events: r.events, misses, secs: show.elapsed, keys });
    assert.deepEqual(show.stage.lv, s.lv, `${turn}: stage levels equal the engine`);
  }
  const { events: fin } = finaleStep(s);
  inv.label(`${order.join('>')} finale`);
  await run(fin, { finale: true });
  inv.turnEnd();
  return { turns, inv, show };
}

for (const outcome of ['hit', 'deflect']) {
  test(`EXAMPLE.${outcome}: no miss plays, every turn within the cap, invariants clean`, async () => {
    const order = EXAMPLE[outcome], { turns, inv } = await playExample(order);
    for (const [i, { misses, secs, keys }] of turns.entries()) {
      const what = `${outcome} turn ${i + 1}`;
      assert.deepEqual(misses, [], `${what}: no miss marks`);
      // 回合上限（設計 §6：60 秒上限在唯一正解與 EXAMPLE 上驗）：60 + 8 × max(0, ◆ − 1)
      assert.ok(secs <= 60 + 8 * Math.max(0, keys - 1), `${what}: ${secs.toFixed(1)} s (◆ ${keys})`);
    }
    assert.ok(turns.some(t => t.events.some(e => e.kind === 'wait')), `${outcome}: the game does have waits`);
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);
    assert.deepEqual(inv.camera, []);
    assert.deepEqual(inv.labels, []);
  });
}
