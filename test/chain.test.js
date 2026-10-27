// test/chain.test.js：離島鏈（物品 v2 §5）整局 live 演完——代幣 Lv7 通車 → 燈泡 Lv7 風車轉、燈塔亮 → 燈泡 Lv8 海底電纜
// → 晶片 Lv6 通電 → Lv7 天線 → Lv8 測試閃三下 → Lv9 待命，每個零件在對的回合出現（不早、不晚）；結局接點（§8）讀新的狀態。
// 兩條正解各演一次（seed 21、真的鏡頭 rig），同一趟也查共用不變式（gameInvariants：不穿牆、不瞬移、每回合回全景看得到 101 頭頂、
// 每個 LEVEL UP 與泡泡至少一半的時間在畫面裡）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { missile, resolve } from '../src/rules/endings.js';
import { headlessShow, turnSteps, closingEvents, overviewRig, gameInvariants } from './helpers/show.js';
import { finaleStep } from './helpers/endings.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const FLASH = 0.4;   // 測試閃光的峰值 0.55、谷底 0.04；待命的淡輪廓 0.08–0.2 不會越過
const CHAIN = [['token', 7], ['bulb', 7], ['bulb', 8], ['chip', 6], ['chip', 7], ['chip', 8], ['chip', 9]];

// 一條正解 live 演完：每回合記下演完後的等級、零件鍵、風車轉不轉、電纜亮不亮、罩子露不露出來，和這回合罩子閃了幾下；
// 每個事件演完（下一個事件的 mark 拍、或回合結束）再記一次零件鍵與電纜亮不亮（events：{ e: 'bulb8' 之類, keys, cableLit }）——
// 同一回合裡先後發生的兩節（例如燈泡 Lv8 鋪電纜、晶片 Lv6 通電）也分得出是哪個事件帶出來的。
// 倒數回合照 game.js 演（closingEvents：最前面是倒數字 3、2、1）；倒數演完再演終局回合（飛彈＋尾聲，finale: true），
// 終局之前玩家拖了一下鏡頭（cam.rig.cancel()，review focus 5：回合開頭會放開記號，終局照樣回全景）；不變式一路查到終局回合演完。
// finale：{ ending, events（終局回合的合成事件）, secs（終局回合的真實秒數）, countdowns（倒數回合演到的倒數字）, flags, keys, script（演完還在劇本手上的人數）}
async function playChain(order) {
  const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam }), update = show.update;
  let flashes = 0, high = false;
  show.update = (dt, t) => {
    update(dt, t);
    const mesh = show.stage.partObject('tower.shield')?.children[0], op = mesh?.visible ? mesh.material.opacity : 0;
    if (op > FLASH && !high) flashes++;
    high = op > FLASH;
  };
  const blades = () => show.stage.partObject('sat.windmill')?.children[0].rotation.z ?? 0;
  const turns = [], grows = [], events = [], cableLit = () => show.stage.partObject('chip.cable')?.children.length === 2;
  const tag = e => (e.kind === 'grow' ? `${e.item}${e.to}` : e.kind === 'placed' ? `${e.item}1` : e.kind);
  let prev = null;
  const countdowns = [];
  const done = () => { if (prev) events.push({ e: tag(prev), keys: new Set(show.stage.partKeys()), cableLit: cableLit() }); prev = null; };
  let s = engine.createState(spec);
  for (const [i, step] of turnSteps(order).entries()) {
    const r = step(s); s = r.state; flashes = 0;
    const turn = `${order.join('>')} turn ${i + 1}`;
    inv.label(turn);
    grows.push(...r.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`));
    const montage = i >= order.length;
    await run(montage ? closingEvents(i - order.length, r.events) : [...r.events, { kind: 'settle' }], { montage, onMark: e => { done(); prev = e; inv.label(`${turn} [${tag(e)}]`); if (e.kind === 'countdown') countdowns.push(e.n); } });
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
    ending, events: fin, countdowns, secs: show.elapsed, flags: { ...show.stage.flags }, keys: new Set(show.stage.partKeys()), busy: show.busy,
    script: show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.mode === 'script').length,
  };
  return { turns, grows, events, state: s, inv, finale };
}
let played = null;
const playBoth = () => (played ??= (async () => { const out = []; for (const order of SOLUTIONS) out.push(await playChain(order)); return out; })());

test('island chain, both solutions live: token 7 → bulb 7 → bulb 8 → chip 6 → 7 → 8 → 9 in order, each part in its own turn', async () => {
  for (const [n, { turns, grows }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), at = (id, lv) => turns.findIndex(t => t.lv[id] >= lv);
    // 事件順序：鏈上每一節的 grow 都在，照順序
    const idx = CHAIN.map(([id, lv]) => grows.indexOf(`${id}${lv}`));
    assert.ok(idx.every(i => i >= 0), `${name}: every chain level grows (${JSON.stringify(idx)})`);
    assert.deepEqual([...idx].sort((a, b) => a - b), idx, `${name}: chain events in order ${JSON.stringify(idx)}`);
    const before = (k, i) => turns.slice(0, i).every(t => !t.keys.has(k)), from = (k, i) => turns.slice(i).every(t => t.keys.has(k));
    // 代幣 Lv7：支線（風車島、遊樂場島）在代幣到 7 的那一回合長出來
    const t7 = at('token', 7);
    for (const k of ['token.spur.windmill', 'token.spur.playground']) assert.ok(before(k, t7) && from(k, t7), `${name}: ${k} from turn ${t7 + 1}`);
    // 燈泡 Lv7：風車轉、燈塔亮、守塔人都在燈泡到 7 的那一回合（之前沒有颱風的回合風車不轉、燈塔暗）
    const b7 = at('bulb', 7);
    assert.ok(b7 >= t7, `${name}: the electrician rides the spur (bulb 7 turn ${b7 + 1} ≥ token 7 turn ${t7 + 1})`);
    turns.slice(0, b7).forEach((t, i) => { assert.ok(!t.keys.has('sat.lighthouse') && !t.keys.has('sat.beam') && !t.keeper, `${name} turn ${i + 1}: lighthouse dark`); if (t.lv.typhoon !== 2) assert.equal(t.spin, false, `${name} turn ${i + 1}: windmill still`); });
    turns.slice(b7).forEach((t, i) => assert.ok(t.spin && t.keys.has('sat.lighthouse') && t.keys.has('sat.beam') && t.keeper === 1, `${name} turn ${b7 + i + 1}: windmill turns, lighthouse lit, keeper out`));
    // 燈泡 Lv8 鋪電纜（暗）、晶片 Lv6 通電（亮）
    const wired = Math.min(at('bulb', 8), at('chip', 6)), c6 = at('chip', 6);
    assert.ok(before('chip.cable', wired) && from('chip.cable', wired), `${name}: cable from turn ${wired + 1}`);
    turns.forEach((t, i) => assert.equal(!!t.cableLit, i >= c6, `${name} turn ${i + 1}: cable lit only from chip 6 (turn ${c6 + 1})`));
    // 晶片 Lv7 天線；Lv8 那回合測試閃三下（其他回合不閃）、演完收起來；Lv9 起罩子常駐
    const c7 = at('chip', 7), c8 = at('chip', 8), c9 = at('chip', 9);
    assert.ok(before('tower.antenna', c7) && from('tower.antenna', c7), `${name}: antenna from turn ${c7 + 1}`);
    turns.forEach((t, i) => assert.equal(t.flashes, i === c8 ? 3 : 0, `${name} turn ${i + 1}: ${t.flashes} shield flashes`));
    assert.ok(before('tower.shield', c8) && from('tower.shield', c8), `${name}: shield from turn ${c8 + 1}`);
    turns.forEach((t, i) => assert.equal(t.shieldOut, i >= c9, `${name} turn ${i + 1}: standby shield out only from chip 9 (turn ${c9 + 1})`));
    assert.ok(c6 < c7 && c7 < c8 && c8 < c9, `${name}: chip chain in four separate turns`);
  }
});

// 事件層級：每個零件第一次出現在鏈上那一節的事件演完時（不是同一回合別的事件帶出來、也不是回合末才補上），之後一直都在
test('island chain, event by event: each chain part first appears with its own event and stays', async () => {
  const PARTS = [['token.spur.windmill', 'token7'], ['token.spur.playground', 'token7'], ['sat.lighthouse', 'bulb7'], ['sat.beam', 'bulb7'],
    ['chip.cable', 'bulb8'], ['tower.antenna', 'chip7'], ['tower.shield', 'chip8']];
  for (const [n, { events }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>'), first = has => events.findIndex(has), idx = tag => events.findIndex(x => x.e === tag);
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

// 最終章（計畫 5 任務 8，設計 §10）：倒數三回合各演到一個倒數字（3、2、1），終局回合演矽盾擋下＋各自的尾聲，演完回全景（turnEnd 查）、
// 劇本手上沒人；終局前拖過鏡頭也一樣（不丟錯）。不穿牆、不瞬移、字在畫面裡由下面兩個測試查（不變式掛到終局回合演完）
test('both solutions live through the finale: countdown events, finale turn, game invariants clean, ends on the overview; a camera grab before the finale does not break it', async () => {
  for (const [n, { finale, inv }] of (await playBoth()).entries()) {
    const name = SOLUTIONS[n].join('>');
    assert.deepEqual(finale.countdowns, [3, 2, 1], `${name}: one countdown digit per closing turn`);
    assert.deepEqual(finale.events.map(e => e.kind), ['missile', 'epilogue'], `${name}: missile then epilogue`);
    assert.equal(finale.flags.missile, 'shield'); assert.equal(finale.flags.epilogue, finale.ending.id);
    assert.ok(finale.keys.has(finale.ending.id === 'cyber' ? 'finale.car' : 'finale.ufos'), `${name}: the ${finale.ending.id} epilogue parts`);
    assert.ok(!finale.keys.has('finale.flare'), `${name}: the flare is out`);
    assert.ok(finale.secs > 8 && finale.secs <= 22, `${name}: the finale turn played live (${finale.secs.toFixed(1)} s)`);
    assert.equal(finale.busy, false); assert.equal(finale.script, 0, `${name}: everyone back to daily life`);
    assert.deepEqual(inv.camera.filter(c => c.includes('finale')), [], `${name}: the finale ends on the overview`);
  }
});

test('both solutions live: nobody stays inside a building > 1.5 s, no daily member teleports, every turn ends at the overview with the 101 top in frame', async () => {
  for (const { inv } of await playBoth()) {
    assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
    assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual(inv.camera, []);
  }
});

// 審稿（計畫 4 最後一輪）：演出的那一刻要在畫面裡——颱風登陸後的 LEVEL UP、101 頭上的「恭喜畢業」「世界珍奶節」、代幣 Lv8 站上的 LEVEL UP、
// 老鼠撞攤車時老闆的 ！、等待圖框，鏡頭都要跟上（gameInvariants 的 labels：活著的時間至少一半投影在 NDC [-1, 1] 裡）
test('both solutions live: every LEVEL UP label and bubble is on screen for at least half its life', async () => {
  assert.deepEqual((await playBoth()).flatMap(({ inv }) => inv.labels), []);
});
