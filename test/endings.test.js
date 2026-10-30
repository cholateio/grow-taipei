import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS } from '../src/rules/spec.js';
import { missile, satisfied, resolve, ENDINGS } from '../src/rules/endings.js';
import { createState, place } from '../src/rules/engine.js';
import * as spec from '../src/rules/spec.js';

const full = (over = {}, flags = {}) => ({ lv: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])), age: {}, locked: {}, flags, order: ORDER, turn: 8, ...over });
const lv = (o) => ({ ...Object.fromEntries(ORDER.map(id => [id, 1])), ...o });

test('missile: shield when chip max, deflect only when typhoon is exactly Lv2, else hit', () => {
  assert.equal(missile(full(), spec), 'shield');
  assert.equal(missile({ ...full({ lv: lv({ chip: 4, typhoon: 2 }) }) }, spec), 'deflect');
  assert.equal(missile({ ...full({ lv: lv({ chip: 4, typhoon: 1 }) }) }, spec), 'hit', 'typhoon placed last is still Lv1');
  assert.equal(missile({ ...full({ lv: lv({ chip: 4, typhoon: 3 }) }) }, spec), 'hit');
});
test('all max is always a true ending, branch by ratBranch, extras still listed', () => {
  assert.equal(resolve(full({}, { ratBranch: 'cyber', milkExpired: true }), spec).id, 'cyber');
  assert.deepEqual(resolve(full({}, { ratBranch: 'cyber', milkExpired: true }), spec).extras, ['milkExpired']);
  assert.equal(resolve(full({}, { ratBranch: 'alien' }), spec).id, 'alien');
});
test('bad ending priority follows the table', () => {
  const s = full({ lv: lv({ chip: 2, typhoon: 1 }) }, { blackout: true, flooded: true, bobaSugar: true });
  const r = resolve(s, spec);
  assert.equal(r.id, 'blackout'); assert.equal(r.missile, 'hit');
  assert.deepEqual(r.extras, ['flood', 'shieldDown', 'bobaSugar']);
  assert.deepEqual(satisfied(s, spec), ['blackout', 'flood', 'shieldDown', 'bobaSugar']);
});
test('bobaSugar is a flag, so it holds even though milk is placed at the end', () => {
  const r = resolve(full({ lv: lv({ chip: 5, milk: 4, boba: 3 }) }, { bobaSugar: true }), spec);
  assert.ok(r.extras.includes('bobaSugar') || r.id === 'bobaSugar');
});
// 因果設計 2026-10-28 §3：珍奶長人龍要鮮奶 ≥3（學生排隊），所以「鮮奶還沒放珍奶就升滿」不會再發生；
// 糖分超標改成鮮奶被拖下來（大停電 −1）時珍奶剛好到 4——旗標一插就留到最後，鮮奶之後長回來也不撤
test('engine sets bobaSugar when boba reaches Lv4 while milk is ≤ 2, and the flag stays', async () => {
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
    found++; assert.ok(at.milk <= 2, `${order}: milk ${at.milk} when the sugar flag went up`); assert.equal(at.boba, 4);
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
  assert.equal(resolve(full({ lv: lv({ chip: spec.ITEMS.chip.max }) }), spec).id, 'tryAgain');
});
test('ENDINGS has ten entries with Chinese titles', () => {
  assert.equal(Object.keys(ENDINGS).length, 10);
  assert.equal(ENDINGS.shieldDown.title, '矽盾未就緒'); assert.equal(ENDINGS.cyber.kind, 'true');
});
// 選擇帶動升級（2026-10-28 §3）：颱風放下當回合就登陸，第 8 個放也一樣；最後一輪放不放得了晴決定飛彈會不會被吹歪
test('typhoon placed 8th lands in its own turn; the closing turn decides between the rainbow and a deflected missile', async () => {
  const { advance } = await import('../src/rules/engine.js');
  const playTo = order => { let s = createState(spec); for (const id of order) s = place(s, id, spec).state; return s; };
  // 回到 GROW（2026-10-29）重找：「颱風第 8 個放、最後燈泡 ≤ 5、飛彈被吹歪」的一個順序（手挑的，下面的斷言才是守門：登陸當回合 typhoon 2、燈泡 4、停電、倒數後飛彈 deflect）。
  // 燈泡第 6 個才放，颱風登陸時燈泡 4 → 大停電鎖住燈泡，倒數那回合燈泡還是 4（< 6）：抽水站沒電，颱風不走
  const late = playTo(['milk', 'token', 'rat', 'boba', 'chip', 'bulb', 'baseball', 'typhoon']);
  assert.equal(late.lv.typhoon, 2, 'landed in its placement turn'); assert.equal(late.lv.bulb, 4); assert.equal(late.flags.blackout, true);
  const stuck = advance(late, spec).state;
  assert.equal(stuck.lv.typhoon, 2); assert.ok(stuck.lv.bulb <= 5); assert.equal(missile(stuck, spec), 'deflect');
  // 賽博正解：第 8 回合燈泡已經 9（≥ 6）、晶片 8（矽盾測過，大巨蛋的 delay 不成立）→ 倒數那回合就放晴
  const cyberLate = playTo(['milk', 'baseball', 'bulb', 'token', 'chip', 'boba', 'rat', 'typhoon']);
  assert.equal(cyberLate.lv.typhoon, 2); assert.ok(cyberLate.lv.bulb >= 6); assert.equal(cyberLate.lv.chip, 8);
  const cyber = advance(cyberLate, spec).state;
  assert.equal(cyber.lv.typhoon, 3); assert.equal(missile(cyber, spec), 'shield');
});

// 物品 v2 §8（任務 11）：結局讀新的狀態——兩條正解（引擎演完放置 + 倒數三回合）都是晶片 9 矽盾擋下、全 MAX、沒有災難旗標，
// 外星正解（ratBranch alien）是外星結局、另一條是賽博；矽盾只看晶片 9：晶片停在 8（測過、沒待命）的一局是矽盾未就緒
import { enumerate, stats } from '../src/solver/run.js';
import { advance } from '../src/rules/engine.js';
const playOut = order => {
  let s = createState(spec);
  for (const id of order) s = place(s, id, spec).state;
  for (let i = 0; i < spec.CLOSING_TURNS; i++) s = advance(s, spec).state;
  return s;
};
test('the two solutions end with the shield up and the true ending of their rat branch', () => {
  const ends = stats(enumerate(spec), spec).full.map(r => playOut(r.order));
  assert.equal(ends.length, 2);
  for (const s of ends) {
    assert.ok(ORDER.every(id => s.lv[id] === ITEMS[id].max), JSON.stringify(s.lv));
    assert.equal(s.lv.chip, 9); assert.equal(missile(s, spec), 'shield');
    assert.deepEqual(Object.keys(s.flags), ['ratBranch'], 'no disaster flag');
    assert.deepEqual(satisfied(s, spec), []);
    assert.deepEqual(resolve(s, spec), { id: s.flags.ratBranch, title: ENDINGS[s.flags.ratBranch].title, missile: 'shield', extras: [] });
  }
  assert.deepEqual(ends.map(s => s.flags.ratBranch).sort(), ['alien', 'cyber']);
});
test('the shield only holds at chip 9: chip 8 (tested, not on standby) is shieldDown, also in a played-out game', () => {
  assert.equal(missile(full({ lv: { ...full().lv, chip: 8 } }), spec), 'hit');
  assert.equal(resolve(full({ lv: { ...full().lv, chip: 8 } }, { ratBranch: 'cyber' }), spec).id, 'shieldDown', 'one short of MAX is not a true ending');
  const perms = a => a.length ? a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])) : [[]];
  const s = perms(ORDER).map(playOut).find(st => st.lv.chip === 8 && st.lv.typhoon !== 2 && !['blackout', 'flooded', 'domeRats', 'milkExpired', 'bobaSugar'].some(f => st.flags[f]));
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
    hit: ['milk', 'chip', 'bulb', 'rat', 'token', 'typhoon', 'boba', 'baseball'],
    deflect: ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'],
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
