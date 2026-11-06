import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS } from '../src/rules/spec.js';
import { missile, satisfied, resolve, ENDINGS, BAD_EPILOGUES } from '../src/rules/endings.js';
import { createState, place } from '../src/rules/engine.js';
import * as spec from '../src/rules/spec.js';

const full = (over = {}, flags = {}) => ({ lv: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])), age: {}, locked: {}, flags, order: ORDER, turn: 8, ...over });
const lv = (o) => ({ ...Object.fromEntries(ORDER.map(id => [id, 1])), ...o });

// 修正批次 trim §C（2026-11-01，協調者裁決：飛彈從海的那一頭打 101 容易被讀成兩岸軍事威脅）：結局的標題、故事句不再有「飛彈」，改說「隕石」
test('ending titles and lines say 隕石 (meteor), never 飛彈 (missile)', () => {
  for (const [id, e] of Object.entries(ENDINGS)) assert.ok(!/飛彈/.test(e.title + e.line), `${id}: ${e.title}／${e.line}`);
  assert.equal(ENDINGS.typhoonDeflect.title, '颱風吹偏隕石'); assert.ok(/隕石/.test(ENDINGS.typhoonDeflect.line) && /隕石/.test(ENDINGS.cyber.line));
});
// 颱風三級（設計 2026-10-31 §4.3，修正批次 2）：矽盾 MAX → 擋下；否則颱風還沒放晴（0 < lv < max：1–2）→ 吹偏；否則命中
test('missile: shield when chip max, deflect while the typhoon has not cleared (1–2), else hit', () => {
  assert.equal(missile(full(), spec), 'shield');
  for (const typhoon of [1, 2]) assert.equal(missile(full({ lv: lv({ chip: 4, typhoon }) }), spec), 'deflect', `typhoon ${typhoon}`);
  assert.equal(missile(full({ lv: lv({ chip: 4, typhoon: 3 }) }), spec), 'hit', 'cleared at Lv3');
  assert.equal(missile(full({ lv: lv({ chip: 9, typhoon: 1 }) }), spec), 'shield', 'the shield beats the clouds');
  assert.equal(missile(full({ lv: lv({ chip: 4, typhoon: 0 }) }), spec), 'hit', 'an unplaced typhoon has no clouds to deflect with');
});
// 設計 §4.5：真結局只有賽博；外星改壞結局「變異鼠稱王」——全 MAX 但 ratBranch alien（求解器下不會發生）就落到外星壞結局
test('all max with the cyber branch is cyber, extras still listed; alien is a bad ending', () => {
  assert.equal(resolve(full({}, { ratBranch: 'cyber', milkExpired: true }), spec).id, 'cyber');
  assert.deepEqual(resolve(full({}, { ratBranch: 'cyber', milkExpired: true }), spec).extras, ['milkExpired']);
  const a = resolve(full({}, { ratBranch: 'alien' }), spec);
  assert.equal(a.id, 'alien'); assert.equal(ENDINGS.alien.kind, 'bad'); assert.equal(ENDINGS.alien.title, '變異鼠稱王');
  // 標題卡那行（2026-10-31 Task 5）：外星壞局不演母艦尾聲，那行講畫面上看得到的——戴王冠的變異鼠、石堆島的綠光圈
  assert.equal(ENDINGS.alien.line, '變異老鼠戴上王冠，石堆島亮起綠光'); assert.doesNotMatch(ENDINGS.alien.line, /母艦/);
  assert.equal(resolve(full({ lv: lv({ chip: 4, typhoon: 3 }) }, { ratBranch: 'alien' }), spec).id, 'alien', 'alien titles before the shield');
});
test('bad ending priority follows design §4.5: concrete disasters first, deflect and shieldDown last', () => {
  const s = full({ lv: lv({ chip: 2, typhoon: 1 }) }, { blackout: true, flooded: true });
  const r = resolve(s, spec);
  assert.equal(r.id, 'blackout'); assert.equal(r.missile, 'deflect');
  assert.deepEqual(r.extras, ['flood', 'typhoonDeflect', 'shieldDown']);
  const every = full({ lv: lv({ chip: 2, typhoon: 1 }) }, { blackout: true, flooded: true, domeFlood: true, cartBlown: true, domeRats: true, ratBranch: 'alien', milkExpired: true, bobaSugar: true });
  assert.deepEqual(satisfied(every, spec), ['blackout', 'flood', 'domeFlood', 'cartBlown', 'domeRats', 'alien', 'milkExpired', 'typhoonDeflect', 'shieldDown']);
});
// 計畫 17（2026-11-04）：糖分超標全枚舉 40,320 種順序一次都當不了結局（前面一定有別的壞結局），是死規則——
// 從結局表、satisfied、珍奶 Lv4 的旗標一起拿掉；舊局面就算帶著這個旗標也不算數
test('bobaSugar is gone: not an ending, satisfied ignores a leftover flag, and no order raises it', () => {
  assert.equal(ENDINGS.bobaSugar, undefined);
  assert.deepEqual(satisfied(full({}, { ratBranch: 'cyber', bobaSugar: true }), spec), []);
  assert.equal(resolve(full({ lv: lv({ chip: 9, typhoon: 3 }) }, { bobaSugar: true }), spec).id, 'tryAgain');
  for (const r of enumerate(spec)) {
    assert.ok(!r.state.flags.bobaSugar, `${r.order}: no sugar flag`);
    assert.ok(!r.satisfied.includes('bobaSugar') && r.ending.id !== 'bobaSugar');
  }
});
test('deflect games light both typhoonDeflect and shieldDown, title card is the deflect', () => {
  const s = full({ lv: lv({ chip: 4, typhoon: 2 }) });
  assert.deepEqual(satisfied(s, spec), ['typhoonDeflect', 'shieldDown']);
  assert.equal(resolve(s, spec).id, 'typhoonDeflect');
});
test('nothing satisfied and not all max → tryAgain', () => {
  assert.equal(resolve(full({ lv: lv({ chip: spec.ITEMS.chip.max, typhoon: 3 }) }), spec).id, 'tryAgain');
});
test('ENDINGS has eleven entries with Chinese titles; cyber is the only true ending; domeFlood and cartBlown are new', () => {
  assert.equal(Object.keys(ENDINGS).length, 11);   // 計畫 17：糖分超標拿掉
  // 修正批次 2：颱風放下時珍奶 ≤3 → 攤車被吹到海邊
  assert.deepEqual(ENDINGS.cartBlown, { id: 'cartBlown', title: '珍奶攤被吹走', kind: 'bad', line: '攤車飛到海上，老闆划船去追' });
  assert.equal(ENDINGS.shieldDown.title, '矽盾未就緒'); assert.equal(ENDINGS.cyber.kind, 'true');
  assert.deepEqual(Object.values(ENDINGS).filter(e => e.kind === 'true').map(e => e.id), ['cyber']);
  assert.deepEqual(ENDINGS.domeFlood, { id: 'domeFlood', title: '大巨蛋淹水', kind: 'bad', line: '球場變游泳池，球員坐在屋頂釣魚' });
});
// 颱風三級（設計 2026-10-31 §4.3，修正批次 2）：第 8 個放的颱風當回合 Lv1，最後一輪到 Lv2——暴風圈還在、還沒放晴，隕石被吹偏
test('typhoon placed 8th is still storming after the closing turn: the missile is deflected; the solution clears it to Lv3', async () => {
  const { advance } = await import('../src/rules/engine.js');
  const playTo = order => { let s = createState(spec); for (const id of order) s = place(s, id, spec).state; return s; };
  const late = playTo(['milk', 'baseball', 'token', 'bulb', 'chip', 'boba', 'rat', 'typhoon']);
  assert.equal(late.lv.typhoon, 1, 'no level-up in its placement turn');
  const after = advance(late, spec).state;
  assert.equal(after.lv.typhoon, 2); assert.ok(after.lv.chip < 9, 'chip 9 needs the typhoon ≥ 3');
  assert.equal(missile(after, spec), 'deflect');
  const sol = advance(playTo(['milk', 'baseball', 'token', 'bulb', 'chip', 'boba', 'typhoon', 'rat']), spec).state;   // 計畫 14 的正解
  assert.equal(sol.lv.typhoon, 3); assert.equal(missile(sol, spec), 'shield');
});

// 物品 v2 §8（任務 11）→ 唯一正解（2026-10-31 §4.5）：結局讀新的狀態——唯一正解（引擎演完放置 + 最後一輪）是晶片 9 矽盾擋下、全 MAX、
// 沒有災難旗標、老鼠分岔 cyber ⇒ 賽博；外星分岔是壞結局「變異鼠稱王」。矽盾只看晶片 9：晶片停在 8（測過、沒待命）的一局是矽盾未就緒
import { enumerate, stats } from '../src/solver/run.js';
import { advance } from '../src/rules/engine.js';
const playOut = order => {
  let s = createState(spec);
  for (const id of order) s = place(s, id, spec).state;
  for (let i = 0; i < spec.CLOSING_TURNS; i++) s = advance(s, spec).state;
  return s;
};
test('the one solution ends with the shield up, all max, no disaster flag, ending cyber', () => {
  const ends = stats(enumerate(spec), spec).full.map(r => playOut(r.order));
  assert.equal(ends.length, 1);
  for (const s of ends) {
    assert.ok(ORDER.every(id => s.lv[id] === ITEMS[id].max), JSON.stringify(s.lv));
    assert.equal(s.lv.chip, 9); assert.equal(missile(s, spec), 'shield');
    assert.deepEqual(Object.keys(s.flags), ['ratBranch'], 'no disaster flag');
    assert.equal(s.flags.ratBranch, 'cyber');
    assert.deepEqual(satisfied(s, spec), []);
    assert.deepEqual(resolve(s, spec), { id: 'cyber', title: ENDINGS.cyber.title, missile: 'shield', extras: [] });
  }
});
test('the shield only holds at chip 9: chip 8 (tested, not on standby) is shieldDown, also in a played-out game', () => {
  assert.equal(missile(full({ lv: { ...full().lv, chip: 8 } }), spec), 'hit');
  assert.equal(resolve(full({ lv: { ...full().lv, chip: 8 } }, { ratBranch: 'cyber' }), spec).id, 'shieldDown', 'one short of MAX is not a true ending');
  const perms = a => a.length ? a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])) : [[]];
  const s = perms(ORDER).map(playOut).find(st => st.lv.chip === 8 && st.lv.typhoon === 3 && st.flags.ratBranch !== 'alien' && !['blackout', 'flooded', 'domeFlood', 'cartBlown', 'domeRats', 'milkExpired'].some(f => st.flags[f]));
  assert.ok(s, 'some order stops the chip at 8 with no disaster');
  assert.equal(missile(s, spec), 'hit');
  assert.deepEqual(resolve(s, spec), { id: 'shieldDown', title: '矽盾未就緒', missile: 'hit', extras: [] });
});

// 最終章（計畫 5 任務 8；選擇帶動升級、因果與離島 2026-10-28 重找）：test/helpers/endings.js 釘住的兩局隕石結果——求解器枚舉裡第一個命中、第一個吹偏的順序；
// 照順序放完、再長 CLOSING_TURNS 輪（最後一輪），終局回合是警告＋隕石；兩局的結局都是捷運淹水，計畫 17 起接它的收尾
test('EXAMPLE.hit / EXAMPLE.deflect recomputed from the enumeration (pinned literals)', async () => {
  const { enumerate } = await import('../src/solver/run.js'), { advance } = await import('../src/rules/engine.js');
  const { EXAMPLE, finaleStep } = await import('./helpers/endings.js'), { finaleEvents } = await import('../src/game.js');
  const all = enumerate(spec);
  // 字面值釘死（規則改了這裡跟 helpers/endings.js 一起換）
  assert.deepEqual(EXAMPLE, {
    hit: ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'],
    deflect: ['milk', 'chip', 'bulb', 'token', 'rat', 'boba', 'baseball', 'typhoon'],
    blackout: ['milk', 'chip', 'bulb', 'typhoon', 'token', 'rat', 'boba', 'baseball'],
    flood: ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'],
    alien: ['milk', 'chip', 'bulb', 'token', 'baseball', 'boba', 'rat', 'typhoon'],
    domeFlood: ['milk', 'chip', 'typhoon', 'rat', 'baseball', 'bulb', 'token', 'boba'],
    cartBlown: ['milk', 'chip', 'bulb', 'baseball', 'token', 'rat', 'typhoon', 'boba'],
    milkExpired: ['milk', 'typhoon', 'chip', 'rat', 'bulb', 'token', 'boba', 'baseball'],
    domeRats: ['milk', 'baseball', 'token', 'bulb', 'chip', 'rat', 'boba', 'typhoon'],
  });
  for (const outcome of ['hit', 'deflect']) {
    const first = all.find(r => !r.error && r.ending.missile === outcome);
    assert.deepEqual(EXAMPLE[outcome], first.order, `${outcome}: the first ${outcome} order in the enumeration`);
    let s = createState(spec);
    for (const id of EXAMPLE[outcome]) s = place(s, id, spec).state;
    for (let i = 0; i < spec.CLOSING_TURNS; i++) s = advance(s, spec).state;
    const { events, ending } = finaleStep(s);
    assert.equal(ending.missile, outcome); assert.deepEqual(ending, resolve(s, spec));
    assert.equal(ending.id, 'flood', `${outcome}: the first ${outcome} game floods the metro`);
    assert.deepEqual(events, finaleEvents(ending));
    assert.deepEqual(events.map(e => [e.kind, e.outcome]), [['warning', undefined], ['missile', outcome], ['epilogue', undefined]], `${outcome}: warning, the missile, then the flood epilogue`);
  }
  // 計畫 17：每個有收尾的壞結局一局——列舉裡第一個 resolve().id 是它的順序；照順序放完＋最後一輪，resolve 就是它
  // R47：大巨蛋鼠災用影片那一局（不是列舉裡第一條；吹偏局），只驗它到得了
  for (const id of BAD_EPILOGUES) {
    const first = all.find(r => !r.error && r.ending.id === id);
    if (id !== 'domeRats') assert.deepEqual(EXAMPLE[id], first.order, `${id}: the first ${id} order in the enumeration`);
    let s = createState(spec);
    for (const k of EXAMPLE[id]) s = place(s, k, spec).state;
    for (let i = 0; i < spec.CLOSING_TURNS; i++) s = advance(s, spec).state;
    assert.equal(resolve(s, spec).id, id, `${EXAMPLE[id].join('>')} → ${id}`);
    const { events } = finaleStep(s);
    assert.deepEqual(events.at(-1), { kind: 'epilogue', ending: id, flag: { name: 'epilogue', value: id } }, `${id}: the finale ends on its epilogue`);
  }
});
// 計畫 17：有收尾的壞結局（finale.js 匯出、規則層 endings.js 定義——game.js 只讀規則層）；每一個都是結局表裡的壞結局
// R47（使用者 2026-11-06：我理想中的鼠災是整島都是老鼠）：大巨蛋鼠災也接收尾，七個
test('BAD_EPILOGUES: seven bad endings with an epilogue (R47 adds domeRats), every one a bad ending in ENDINGS; finale.js re-exports the same list', async () => {
  assert.deepEqual(BAD_EPILOGUES, ['blackout', 'flood', 'alien', 'domeFlood', 'cartBlown', 'milkExpired', 'domeRats']);
  for (const id of BAD_EPILOGUES) assert.equal(ENDINGS[id]?.kind, 'bad', id);
  const finale = await import('../src/actors/finale.js');
  assert.equal(finale.BAD_EPILOGUES, BAD_EPILOGUES);
});
// npm run shot 的 hit／deflect 截圖就是這兩局（package.json 的 shot 清單）
test('the hit / deflect screenshots play the EXAMPLE orders', async () => {
  const { readFileSync } = await import('node:fs'), { EXAMPLE } = await import('./helpers/endings.js');
  const shot = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.shot.split(/\s+/);
  for (const outcome of ['hit', 'deflect']) assert.ok(shot.includes(`${outcome}=auto=${EXAMPLE[outcome].join(',')}`), `${outcome}= in the shot list`);
});
