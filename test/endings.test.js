import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS } from '../src/rules/spec.js';
import { missile, satisfied, resolve, ENDINGS } from '../src/rules/endings.js';
import { createState, place } from '../src/rules/engine.js';
import * as spec from '../src/rules/spec.js';

const full = (over = {}, flags = {}) => ({ lv: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])), age: {}, locked: {}, flags, order: ORDER, turn: 8, ...over });
const lv = (o) => ({ ...Object.fromEntries(ORDER.map(id => [id, 1])), ...o });

// 颱風三級（設計 2026-10-31 §4.3，修正批次 2）：矽盾 MAX → 擋下；否則颱風還沒放晴（0 < lv < max：1–2）→ 吹歪；否則命中
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
  const s = full({ lv: lv({ chip: 2, typhoon: 1 }) }, { blackout: true, flooded: true, bobaSugar: true });
  const r = resolve(s, spec);
  assert.equal(r.id, 'blackout'); assert.equal(r.missile, 'deflect');
  assert.deepEqual(r.extras, ['flood', 'bobaSugar', 'typhoonDeflect', 'shieldDown']);
  const every = full({ lv: lv({ chip: 2, typhoon: 1 }) }, { blackout: true, flooded: true, domeFlood: true, cartBlown: true, domeRats: true, ratBranch: 'alien', milkExpired: true, bobaSugar: true });
  assert.deepEqual(satisfied(every, spec), ['blackout', 'flood', 'domeFlood', 'cartBlown', 'domeRats', 'alien', 'milkExpired', 'bobaSugar', 'typhoonDeflect', 'shieldDown']);
});
test('bobaSugar is a flag, so it holds even though milk is placed at the end', () => {
  const r = resolve(full({ lv: lv({ chip: 5, milk: 4, boba: 3 }) }, { bobaSugar: true }), spec);
  assert.ok(r.extras.includes('bobaSugar') || r.id === 'bobaSugar');
});
// 因果設計 2026-10-28 §3：珍奶長人龍要鮮奶 ≥3（學生排隊），所以「鮮奶還沒放珍奶就升滿」不會再發生；
// 糖分超標：珍奶到 4 時鮮奶還 ≤4（唯一正解 2026-10-31 裁決，原本 ≤2 照新表到不了）——旗標一插就留到最後，鮮奶之後長上去也不撤
test('engine sets bobaSugar when boba reaches Lv4 while milk is ≤ 4, and the flag stays', async () => {
  const { foldEvent } = await import('../src/rules/engine.js');
  const perms = a => a.length ? a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])) : [[]];
  let found = 0;
  for (const order of perms(ORDER)) {
    let s = createState(spec), view = { lv: s.lv, flags: {} }, at = null;
    for (const id of order) {
      const r = place(s, id, spec); s = r.state;
      for (const e of r.events) { view = foldEvent(view, e); if (e.flag?.name === 'bobaSugar' && at === null) at = { milk: view.lv.milk, boba: view.lv.boba }; }
    }
    if (at === null) { assert.ok(!s.flags.bobaSugar); continue; }
    found++; assert.ok(at.milk <= 4, `${order}: milk ${at.milk} when the sugar flag went up`); assert.equal(at.boba, 4);
    assert.equal(s.flags.bobaSugar, true, 'the flag stays to the end');
    if (found >= 200) break;
  }
  assert.ok(found > 0, 'no order raises bobaSugar');
});
test('deflect games light both typhoonDeflect and shieldDown, title card is the deflect', () => {
  const s = full({ lv: lv({ chip: 4, typhoon: 2 }) });
  assert.deepEqual(satisfied(s, spec), ['typhoonDeflect', 'shieldDown']);
  assert.equal(resolve(s, spec).id, 'typhoonDeflect');
});
test('nothing satisfied and not all max → tryAgain', () => {
  assert.equal(resolve(full({ lv: lv({ chip: spec.ITEMS.chip.max, typhoon: 3 }) }), spec).id, 'tryAgain');
});
test('ENDINGS has twelve entries with Chinese titles; cyber is the only true ending; domeFlood and cartBlown are new', () => {
  assert.equal(Object.keys(ENDINGS).length, 12);
  // 修正批次 2：颱風放下時珍奶 ≤3 → 攤車被吹到海邊
  assert.deepEqual(ENDINGS.cartBlown, { id: 'cartBlown', title: '珍奶攤被吹走', kind: 'bad', line: '攤車飛到海上，老闆划船去追' });
  assert.equal(ENDINGS.shieldDown.title, '矽盾未就緒'); assert.equal(ENDINGS.cyber.kind, 'true');
  assert.deepEqual(Object.values(ENDINGS).filter(e => e.kind === 'true').map(e => e.id), ['cyber']);
  assert.deepEqual(ENDINGS.domeFlood, { id: 'domeFlood', title: '大巨蛋淹水', kind: 'bad', line: '球場變游泳池，球員坐在屋頂釣魚' });
});
// 颱風三級（設計 2026-10-31 §4.3，修正批次 2）：第 8 個放的颱風當回合 Lv1，最後一輪到 Lv2——暴風圈還在、還沒放晴，飛彈被吹歪
test('typhoon placed 8th is still storming after the closing turn: the missile is deflected; the solution clears it to Lv3', async () => {
  const { advance } = await import('../src/rules/engine.js');
  const playTo = order => { let s = createState(spec); for (const id of order) s = place(s, id, spec).state; return s; };
  const late = playTo(['milk', 'baseball', 'token', 'bulb', 'chip', 'boba', 'rat', 'typhoon']);
  assert.equal(late.lv.typhoon, 1, 'no level-up in its placement turn');
  const after = advance(late, spec).state;
  assert.equal(after.lv.typhoon, 2); assert.ok(after.lv.chip < 9, 'chip 9 needs the typhoon ≥ 3');
  assert.equal(missile(after, spec), 'deflect');
  const sol = advance(playTo(['milk', 'baseball', 'token', 'bulb', 'chip', 'typhoon', 'boba', 'rat']), spec).state;
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
  const s = perms(ORDER).map(playOut).find(st => st.lv.chip === 8 && st.lv.typhoon === 3 && st.flags.ratBranch !== 'alien' && !['blackout', 'flooded', 'domeFlood', 'cartBlown', 'domeRats', 'milkExpired', 'bobaSugar'].some(f => st.flags[f]));
  assert.ok(s, 'some order stops the chip at 8 with no disaster');
  assert.equal(missile(s, spec), 'hit');
  assert.deepEqual(resolve(s, spec), { id: 'shieldDown', title: '矽盾未就緒', missile: 'hit', extras: [] });
});

// 最終章（計畫 5 任務 8；選擇帶動升級、因果與離島 2026-10-28 重找）：test/helpers/endings.js 釘住的兩局壞結局——求解器枚舉裡第一個命中、第一個吹歪的順序；
// 照順序放完、再長 CLOSING_TURNS 輪（最後一輪），終局回合是警告＋飛彈（壞結局沒有尾聲）
test('EXAMPLE.hit / EXAMPLE.deflect recomputed from the enumeration (pinned literals)', async () => {
  const { enumerate } = await import('../src/solver/run.js'), { advance } = await import('../src/rules/engine.js');
  const { EXAMPLE, finaleStep } = await import('./helpers/endings.js'), { finaleEvents } = await import('../src/game.js');
  const all = enumerate(spec);
  // 字面值釘死（規則改了這裡跟 helpers/endings.js 一起換）
  assert.deepEqual(EXAMPLE, {
    hit: ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'],
    deflect: ['milk', 'chip', 'bulb', 'token', 'rat', 'boba', 'baseball', 'typhoon'],
  });
  for (const outcome of ['hit', 'deflect']) {
    const first = all.find(r => !r.error && r.ending.missile === outcome);
    assert.deepEqual(EXAMPLE[outcome], first.order, `${outcome}: the first ${outcome} order in the enumeration`);
    let s = createState(spec);
    for (const id of EXAMPLE[outcome]) s = place(s, id, spec).state;
    for (let i = 0; i < spec.CLOSING_TURNS; i++) s = advance(s, spec).state;
    const { events, ending } = finaleStep(s);
    assert.equal(ending.missile, outcome); assert.deepEqual(ending, resolve(s, spec));
    assert.deepEqual(events, finaleEvents(ending));
    assert.deepEqual(events.map(e => [e.kind, e.outcome]), [['warning', undefined], ['missile', outcome]], `${outcome}: warning, then the missile; a bad ending has no epilogue`);
  }
});
// npm run shot 的 hit／deflect 截圖就是這兩局（package.json 的 shot 清單）
test('the hit / deflect screenshots play the EXAMPLE orders', async () => {
  const { readFileSync } = await import('node:fs'), { EXAMPLE } = await import('./helpers/endings.js');
  const shot = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.shot.split(/\s+/);
  for (const outcome of ['hit', 'deflect']) assert.ok(shot.includes(`${outcome}=auto=${EXAMPLE[outcome].join(',')}`), `${outcome}= in the shot list`);
});
