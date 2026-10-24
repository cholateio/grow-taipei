# 台北成長 計畫 1：規則引擎與求解器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 8 個物品的連鎖規則引擎、結局判定與全排列求解器，讓 `npm run check` 證明「剛好兩條順序全 MAX，分別通往賽博龐克與外星人結局」。

**Architecture:** 純 JavaScript ES module，Node 與瀏覽器共用。`rules/spec.js` 是唯一的規則資料（純資料，無邏輯）；`rules/conditions.js` 把條件物件編譯成函式；`rules/engine.js` 提供不可變的 `place(state, id)` 回傳新狀態與有序事件列表；`rules/endings.js` 由終局狀態判定結局；`solver/run.js` 跑 8! 全排列做統計與驗收；`solver/tighten.js` 建議要加的條件子句。沒有任何 3D。

**Tech Stack:** Node ≥ 18（本機 v24），`node:test`，無第三方依賴。

**Spec:** `docs/superpowers/specs/2026-10-24-grow-taipei-design.md`（§5 物品、§6 引擎、§8 結局、§6.5 驗收）

## Global Constraints

- ES module（`package.json` `"type": "module"`），無建置工具，無第三方依賴。
- 物品固定順序與 id：`milk 鮮奶, chip 晶片, bulb 燈泡, token 代幣, typhoon 颱風, rat 老鼠, boba 珍奶, baseball 棒球`；最高級 `4, 5, 4, 4, 3, 4, 3, 4`（§5）。
- 引擎掃描上限 64 次，超過就 `throw`（§6.2）。
- `maxLevel[id,n]` 是絕對語意：`lv[id] <= n`，未放置的 0 也成立（§6.4）。
- 全 MAX 一定是真結局；A／B 看 `ratBranch` 旗標（§8.2）。
- 所有輸出文字用繁體中文、台灣用語；事件 `story` 一句話、口語。
- 不接任何追蹤或網路。

## Review Focus

1. 重複放置同一物品：`place` 必須 `throw`，不能默默覆寫等級（Task 3 測試）。
2. 颱風放在第 8 個：Lv2 要 `age ≥ 1`，所以終局時颱風還是 Lv1，飛彈判定必須是 `hit` 而不是 `deflect`（Task 4 測試）。
3. 未放置物品在 `maxLevel` 的絕對語意：珍奶升 MAX 時鮮奶根本沒放也要設 `bobaSugar`（Task 2、Task 4 測試）。
4. 決定性：同一順序跑兩次，事件 JSON 完全相同；求解器統計才可信（Task 3 測試）。
5. 病態規則互相加減造成無限迴圈：引擎要在 64 次掃描後 throw 並指出是哪個物品（Task 3 測試）。

---

### Task 1: 專案骨架與條件語言

**Files:**
- Create: `package.json`
- Create: `src/rules/conditions.js`
- Test: `test/conditions.test.js`

**Interfaces:**
- Produces: `compile(cond, ctx) → (state) => boolean`，其中 `ctx = { max: {id: n} }`；`state` 形狀見 Task 3（這裡只用 `state.lv[id]`、`state.age[id]`、`state.flags[name]`、`state.locked[id]`）。
- 條件物件語法（§6.4）：
  `{always:true}`、`{present:id}`、`{absent:id}`、`{minLevel:[id,n]}`（lv ≥ n）、`{maxLevel:[id,n]}`（lv ≤ n，未放置 0 也算）、`{ltPlus:[a,b,k]}`（lv[a] < lv[b]+k）、`{age:[id,n]}`（已放置且 age ≥ n）、`{flag:name}`、`{locked:id}`、`{and:[...]}`、`{or:[...]}`、`{not:cond}`。
  未知鍵 → `throw new Error('bad cond ' + JSON.stringify(cond))`。

- [ ] **Step 1: 建 `package.json`**

```json
{
  "name": "grow-taipei",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "check": "node src/solver/run.js --check",
    "stats": "node src/solver/run.js",
    "tighten": "node src/solver/tighten.js"
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 2: 寫失敗測試 `test/conditions.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/rules/conditions.js';

const ctx = { max: { milk: 4, chip: 5 } };
const S = (lv = {}, age = {}, flags = {}, locked = {}) => ({ lv: { milk: 0, chip: 0, ...lv }, age: { milk: -1, chip: -1, ...age }, flags, locked });

test('present / absent', () => {
  assert.equal(compile({ present: 'milk' }, ctx)(S({ milk: 1 })), true);
  assert.equal(compile({ present: 'milk' }, ctx)(S()), false);
  assert.equal(compile({ absent: 'milk' }, ctx)(S()), true);
});
test('minLevel / maxLevel absolute semantics', () => {
  assert.equal(compile({ minLevel: ['chip', 3] }, ctx)(S({ chip: 3 })), true);
  assert.equal(compile({ minLevel: ['chip', 3] }, ctx)(S({ chip: 2 })), false);
  assert.equal(compile({ maxLevel: ['milk', 1] }, ctx)(S()), true, 'unplaced counts as <= n');
  assert.equal(compile({ maxLevel: ['milk', 1] }, ctx)(S({ milk: 2 })), false);
});
test('ltPlus', () => {
  assert.equal(compile({ ltPlus: ['milk', 'chip', 2] }, ctx)(S({ milk: 1, chip: 0 })), true);
  assert.equal(compile({ ltPlus: ['milk', 'chip', 0] }, ctx)(S({ milk: 1, chip: 1 })), false);
});
test('age requires placed', () => {
  assert.equal(compile({ age: ['milk', 2] }, ctx)(S({ milk: 1 }, { milk: 2 })), true);
  assert.equal(compile({ age: ['milk', 2] }, ctx)(S({ milk: 1 }, { milk: 1 })), false);
  assert.equal(compile({ age: ['milk', 0] }, ctx)(S()), false);
});
test('flag / locked / and / or / not / always', () => {
  assert.equal(compile({ flag: 'blackout' }, ctx)(S({}, {}, { blackout: true })), true);
  assert.equal(compile({ locked: 'milk' }, ctx)(S({}, {}, {}, { milk: true })), true);
  assert.equal(compile({ and: [{ always: true }, { absent: 'milk' }] }, ctx)(S()), true);
  assert.equal(compile({ or: [{ present: 'milk' }, { present: 'chip' }] }, ctx)(S({ chip: 1 })), true);
  assert.equal(compile({ not: { present: 'milk' } }, ctx)(S()), true);
});
test('unknown condition throws', () => {
  assert.throws(() => compile({ nope: 1 }, ctx), /bad cond/);
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL，`Cannot find module '../src/rules/conditions.js'`

- [ ] **Step 4: 實作 `compile(cond, ctx)` 於 `src/rules/conditions.js`**

照原型 `grow_prototype/solver/solver3_tick_stats.js` 的 `compile` 寫法逐鍵分派，回傳閉包；`age` 要同時檢查 `state.lv[id] > 0`。

- [ ] **Step 5: 跑測試確認通過**

Run: `npm test`
Expected: 6 passing

- [ ] **Step 6: Commit**

```bash
git add package.json src/rules/conditions.js test/conditions.test.js
git commit -m "rules: 條件語言 compile()"
```

---

### Task 2: 規則資料 `spec.js`

**Files:**
- Create: `src/rules/spec.js`
- Test: `test/spec.test.js`

**Interfaces:**
- Produces:
  ```js
  export const ORDER = ['milk','chip','bulb','token','typhoon','rat','boba','baseball'];
  export const ITEMS = { [id]: { name, max, up: { [n]: cond }, fx?: Action[], onLevel?: { [n]: Action[] }, stall?: [{ when: cond, story }] } };
  export const AFTER_TURN = Action[];   // 每回合結束後逐條評估（鮮奶過期用）
  export const STORIES = { placed: { [id]: string }, grow: { [id]: { [n]: string } } };
  ```
  `up[n]` 是「從 n−1 升到 n」的條件，n 從 2 到 max，**每一級都必須明寫**（`spec.test.js` 會檢查）。
  `Action` 形狀（§6.2–6.3 的放置反應、onLevel、afterTurn 共用）：
  ```js
  { when?: cond, story?: string,
    delta?: { target: id, by: number },     // 加減等級，夾在 [1,max]，target 未放置則略過
    lock?: id,                                // locked[id] = true
    flag?: { name, value?: any },             // flags[name] = value ?? true
    branch?: { flag: name, when: cond, then: any, else: any } }
  ```
  一個 Action 可同時含多個欄位，照 `delta → lock → flag → branch` 順序套用，只記**一個**事件。

- [ ] **Step 1: 寫失敗測試 `test/spec.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS, AFTER_TURN, STORIES } from '../src/rules/spec.js';
import { compile } from '../src/rules/conditions.js';

test('eight items in fixed order with spec max levels', () => {
  assert.deepEqual(ORDER, ['milk','chip','bulb','token','typhoon','rat','boba','baseball']);
  assert.deepEqual(ORDER.map(id => ITEMS[id].max), [4,5,4,4,3,4,3,4]);
  assert.deepEqual(ORDER.map(id => ITEMS[id].name), ['鮮奶','晶片','燈泡','代幣','颱風','老鼠','珍奶','棒球']);
});
test('every level 2..max has an explicit up condition that compiles', () => {
  const ctx = { max: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])) };
  for (const id of ORDER) for (let n = 2; n <= ITEMS[id].max; n++) {
    assert.ok(ITEMS[id].up[n], `${id} up[${n}] missing`);
    assert.doesNotThrow(() => compile(ITEMS[id].up[n], ctx));
  }
});
test('every action and stall condition compiles', () => {
  const ctx = { max: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])) };
  const all = [...AFTER_TURN];
  for (const id of ORDER) { all.push(...(ITEMS[id].fx || [])); for (const k in ITEMS[id].onLevel || {}) all.push(...ITEMS[id].onLevel[k]); all.push(...(ITEMS[id].stall || [])); }
  for (const a of all) { if (a.when) assert.doesNotThrow(() => compile(a.when, ctx)); if (a.branch) assert.doesNotThrow(() => compile(a.branch.when, ctx)); }
});
test('typhoon Lv2 check exists with the five spec steps in order', () => {
  const steps = ITEMS.typhoon.onLevel[2];
  assert.equal(steps.length, 5);
  assert.equal(steps[0].lock, 'bulb'); assert.equal(steps[0].flag.name, 'blackout');
  assert.equal(steps[1].lock, 'token'); assert.equal(steps[1].flag.name, 'flooded');
  assert.equal(steps[2].flag.name, 'domeRats');
  assert.equal(steps[4].delta.target, 'boba'); assert.equal(steps[4].delta.by, 1);
});
test('rat Lv4 branches on chip >= 3', () => {
  const b = ITEMS.rat.onLevel[4].find(a => a.branch);
  assert.deepEqual(b.branch, { flag: 'ratBranch', when: { minLevel: ['chip', 3] }, then: 'cyber', else: 'alien' });
});
test('every item has a placed story and a story per level', () => {
  for (const id of ORDER) { assert.ok(STORIES.placed[id]); for (let n = 2; n <= ITEMS[id].max; n++) assert.ok(STORIES.grow[id][n], `${id} story ${n}`); }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL，找不到 `spec.js`

- [ ] **Step 3: 寫 `src/rules/spec.js`**

照設計文件 §5.1 逐項寫。`up` 的**起始數值**（之後由 Task 7 的求解器與收緊器調整，這裡只是第一版）：

| 物品 | up[2] | up[3] | up[4] | up[5] |
|---|---|---|---|---|
| milk | age[milk,1] | and(age[milk,2], present bulb) | minLevel[baseball,2] | — |
| chip | age[chip,1] | minLevel[token,2] | minLevel[bulb,2] | minLevel[milk,3] |
| bulb | age[bulb,1] | minLevel[chip,2] | minLevel[chip,3] | — |
| token | age[token,1] | minLevel[chip,2] | minLevel[chip,3] | — |
| typhoon | age[typhoon,1] | age[typhoon,2] | — | — |
| rat | age[rat,1] | age[rat,2] | age[rat,3] | — |
| boba | age[boba,1] | minLevel[bulb,2] | — | — |
| baseball | age[baseball,1] | minLevel[token,2] | minLevel[bulb,3] | — |

固定要有的 Action（這些是謎題的骨架，不由收緊器改）：
- `typhoon.onLevel[2]`（§6.3，五步照順序）：
  1. `{ when: and(present bulb, maxLevel[bulb,2]), lock:'bulb', flag:{name:'blackout'}, delta:{target:'milk', by:-1}, story:'全島大停電！冰箱裡的鮮奶…' }`
  2. `{ when: and(present token, maxLevel[token,2]), lock:'token', flag:{name:'flooded'}, story:'捷運站變游泳池了' }`
  3. `{ when: and(minLevel[rat,2], minLevel[baseball,2]), flag:{name:'domeRats'}, story:'老鼠被大水沖進大巨蛋！' }`
  4. `{ when: present milk, story:'颱風假！小朋友在家看電視' }`
  5. `{ when: present boba, delta:{target:'boba', by:1}, story:'颱風天珍奶外送爆單' }`
- `rat.onLevel[2]`：`{ when: present milk, delta:{target:'milk', by:-1}, story:'老鼠咬破鮮奶箱' }`、`{ when: present boba, story:'珍奶攤被老鼠撞翻了（明天再開）' }`
- `rat.onLevel[4]`：`{ branch:{ flag:'ratBranch', when:{minLevel:['chip',3]}, then:'cyber', else:'alien' }, story:'老鼠的命運分岔了' }`
- `boba.onLevel[3]`：`{ when: maxLevel[milk,1], flag:{name:'bobaSugar'}, story:'全島糖分超標' }`
- `AFTER_TURN`：`{ when: and(present milk, maxLevel[milk,1], age[milk,4]), flag:{name:'milkExpired'}, story:'鮮奶放到過期了…' }`
- 第一版所有 `stall` 陣列為空（卡住規則留給 Task 7 調整時視需要加）。

`STORIES` 每句 ≤ 20 字、口語、台灣用語（例：「老鼠搭捷運了啦」「101 開始蓋了」）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: 全部通過

- [ ] **Step 5: Commit**

```bash
git add src/rules/spec.js test/spec.test.js
git commit -m "rules: 八物品規則資料第一版"
```

---

### Task 3: 連鎖引擎 `engine.js`

**Files:**
- Create: `src/rules/engine.js`
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: Task 1 `compile`，Task 2 `ORDER/ITEMS/AFTER_TURN/STORIES`。
- Produces:
  ```js
  export function createState(spec = defaultSpec) → State
  export function place(state, id, spec = defaultSpec) → { state: State, events: Event[] }
  export function isPlaced(state, id) → boolean
  export function isComplete(state) → boolean          // 8 個都放了
  export function isAllMax(state, spec = defaultSpec) → boolean
  export const SCAN_LIMIT = 64;
  ```
  `State`（不可變，每次 `place` 回新物件）：
  ```js
  { lv: {id: n}, age: {id: n|-1}, locked: {id: bool}, flags: {}, order: id[], turn: number }
  ```
  `Event`：
  ```js
  { kind: 'placed'|'grow'|'fx'|'stall'|'after', item: id, from?: n, to?: n, cause?: id, story?: string,
    lock?: id, flag?: {name, value}, delta?: {target, from, to} }
  ```
  `fx` 同時用於放置反應與 onLevel 反應（`cause` = 觸發的物品，`item` = 被影響的物品；沒有 `delta` 的純旗標／故事事件 `item` = `cause`）。事件物件**不得含值為 undefined 的鍵**（測試用 deepEqual）。
  `spec` 參數形狀 `{ ORDER, ITEMS, AFTER_TURN, STORIES }`，預設 import 自 `spec.js`；測試用小型假 spec 注入。

- [ ] **Step 1: 寫失敗測試 `test/engine.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, place, isAllMax, isComplete, SCAN_LIMIT } from '../src/rules/engine.js';

// 迷你 spec：a 放了就自己每回合升；b 的 Lv2 需要 a>=2，Lv3 需要 a>=3（同回合連鎖）
const mini = {
  ORDER: ['a','b','c'],
  ITEMS: {
    a: { name:'A', max:3, up:{ 2:{age:['a',1]}, 3:{age:['a',2]} } },
    b: { name:'B', max:3, up:{ 2:{minLevel:['a',2]}, 3:{minLevel:['a',3]} },
         onLevel:{ 3:[{ when:{present:'c'}, delta:{target:'c', by:-1}, story:'b踩到c' }] } },
    c: { name:'C', max:2, up:{ 2:{always:true} }, stall:[{ when:{present:'b'}, story:'c被b擋住' }] },
  },
  AFTER_TURN: [{ when:{and:[{present:'a'},{age:['a',1]}]}, flag:{name:'aOld'}, story:'a老了' }],
  STORIES: { placed:{a:'放a',b:'放b',c:'放c'}, grow:{ a:{2:'a2',3:'a3'}, b:{2:'b2',3:'b3'}, c:{2:'c2'} } },
};

test('placing sets level 1, age 0, records order and a placed event', () => {
  const { state, events } = place(createState(mini), 'a', mini);
  assert.equal(state.lv.a, 1); assert.equal(state.age.a, 0); assert.deepEqual(state.order, ['a']); assert.equal(state.turn, 1);
  assert.deepEqual(events[0], { kind:'placed', item:'a', to:1, story:'放a' });
});
test('ages advance each turn and up conditions fire; cascade can climb several levels in one turn', () => {
  let s = createState(mini);
  s = place(s, 'a', mini).state;          // a1
  s = place(s, 'c', mini).state;          // a2 (age1), c1→? c up always → c2
  assert.equal(s.lv.a, 2); assert.equal(s.lv.c, 2);
  const r = place(s, 'b', mini);          // a3; b1→2 (a>=2) →3 (a>=3) 同回合；b3 onLevel: c -1
  assert.equal(r.state.lv.a, 3); assert.equal(r.state.lv.b, 3); assert.equal(r.state.lv.c, 1);
  const kinds = r.events.map(e => `${e.kind}:${e.item}${e.to ?? ''}`);
  assert.deepEqual(kinds.filter(k => k.startsWith('grow')), ['grow:a3','grow:b2','grow:b3']);
  const fx = r.events.find(e => e.kind === 'fx');
  assert.deepEqual(fx.delta, { target:'c', from:2, to:1 }); assert.equal(fx.cause, 'b');
});
test('stall blocks growth and records one stall event per turn', () => {
  let s = createState(mini);
  s = place(s, 'b', mini).state;
  const r = place(s, 'c', mini);          // c up always, but stalled by b present
  assert.equal(r.state.lv.c, 1);
  assert.equal(r.events.filter(e => e.kind === 'stall' && e.item === 'c').length, 1);
});
test('locked item never grows', () => {
  let s = createState(mini); s = place(s, 'a', mini).state;
  s = { ...s, locked: { ...s.locked, a: true } };
  s = place(s, 'c', mini).state; assert.equal(s.lv.a, 1);
});
test('AFTER_TURN actions evaluate once per turn and set flags', () => {
  let s = createState(mini); s = place(s, 'a', mini).state;
  assert.equal(s.flags.aOld, undefined);
  const r = place(s, 'c', mini); assert.equal(r.state.flags.aOld, true);
  assert.ok(r.events.some(e => e.kind === 'after' && e.story === 'a老了'));
});
test('placing twice throws', () => {
  const s = place(createState(mini), 'a', mini).state;
  assert.throws(() => place(s, 'a', mini), /already placed/);
});
test('state is immutable', () => {
  const s0 = createState(mini); place(s0, 'a', mini); assert.equal(s0.lv.a, 0); assert.deepEqual(s0.order, []);
});
test('deterministic: same order gives identical event JSON', () => {
  const run = () => { let s = createState(mini); const ev = []; for (const id of ['c','a','b']) { const r = place(s, id, mini); s = r.state; ev.push(...r.events); } return JSON.stringify(ev); };
  assert.equal(run(), run());
});
test('pathological spec hits SCAN_LIMIT and throws naming the item', () => {
  const bad = { ORDER:['x','y'], ITEMS:{
    x:{ name:'X', max:3, up:{2:{always:true},3:{always:true}}, onLevel:{3:[{delta:{target:'y', by:-1}}]} },
    y:{ name:'Y', max:3, up:{2:{always:true},3:{always:true}}, onLevel:{3:[{delta:{target:'x', by:-1}}]} } },
    AFTER_TURN:[], STORIES:{placed:{x:'',y:''},grow:{x:{2:'',3:''},y:{2:'',3:''}}} };
  let s = place(createState(bad), 'x', bad).state;
  assert.throws(() => place(s, 'y', bad), new RegExp(`scan limit ${SCAN_LIMIT}`));
});
test('isComplete / isAllMax on the real spec shape', () => {
  const s = createState(mini); assert.equal(isComplete(s), false); assert.equal(isAllMax(s, mini), false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL，找不到 `engine.js`

- [ ] **Step 3: 實作 `src/rules/engine.js`**

演算法照設計文件 §6.2，補充這幾個決定：
- 回合開始：先把所有已放物品 `age += 1`（新放的設 0），再 `lv[id] = 1`，記 `placed` 事件。
- Phase A：`ITEMS[id].fx` 逐條 `applyAction`。
- Phase B：`for (scan = 0; ; scan++) { if (scan >= SCAN_LIMIT) throw new Error(\`scan limit ${SCAN_LIMIT} exceeded while growing ${lastGrown}\`); changed = false; for id of ORDER { …stall 每回合每物品最多記一次（用 Set）… if compile(up[lv+1]) → lv++, 記 grow，套 onLevel[lv] 的 actions（事件 kind 'fx'，`cause` = 該物品）, changed = true } if (!changed) break; }`
- `applyAction(action, cause)`：`when` 不成立就跳過；`delta` 的 target 未放置則整個 action 跳過；夾在 `[1, max]`；只記一個事件，kind 由呼叫處給（fx／check／after），事件帶 `story`、`lock`、`flag`、`delta:{target,from,to}`。
- `branch`：`flags[flag] = compile(when) ? then : else`，事件的 `flag = {name, value}`。
- AFTER_TURN：Phase B 結束後逐條套用，kind `after`。
- 全程操作深拷貝的 state；用 `structuredClone` 起手。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`
Expected: 全部通過

- [ ] **Step 5: Commit**

```bash
git add src/rules/engine.js test/engine.test.js
git commit -m "rules: 連鎖引擎 place() 與事件列表"
```

---

### Task 4: 結局判定 `endings.js`

**Files:**
- Create: `src/rules/endings.js`
- Test: `test/endings.test.js`

**Interfaces:**
- Consumes: Task 3 `State`、`isAllMax`。
- Produces:
  ```js
  export const ENDINGS = { cyber, alien, blackout, flood, domeRats, shieldDown, typhoonDeflect, milkExpired, bobaSugar, tryAgain };
  // 每個：{ id, title: string, kind: 'true'|'bad'|'neutral', line: string }
  export function missile(state, spec) → 'shield'|'deflect'|'hit'
  export function satisfied(state, spec) → id[]         // 所有成立的壞結局 id，照 §8.3 表順序
  export function resolve(state, spec) → { id, title, missile, extras: id[] }
  ```
  規則（§8.1–8.3）：
  - `missile`：`lv.chip === max.chip` → `shield`；否則 `lv.typhoon === 2` → `deflect`；否則 `hit`。
  - `satisfied` 順序：`blackout`（flags.blackout）、`flood`（flags.flooded）、`domeRats`、`shieldDown`（missile === 'hit'）、`typhoonDeflect`（missile === 'deflect'）、`milkExpired`、`bobaSugar`。
  - `resolve`：`isAllMax` → id 為 `flags.ratBranch === 'alien' ? 'alien' : 'cyber'`，`extras = satisfied(...)`；否則 id = `satisfied[0] ?? 'tryAgain'`，`extras` = 其餘。
  - 標題（繁中，§8.3 表）：大停電、捷運淹水、大巨蛋鼠災、矽盾未就緒、颱風擋飛彈、鮮奶過期、珍奶糖分超標、再接再厲；真結局：「賽博龐克台北」「外星人統治台北」。

- [ ] **Step 1: 寫失敗測試 `test/endings.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS } from '../src/rules/spec.js';
import { missile, satisfied, resolve, ENDINGS } from '../src/rules/endings.js';
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
});
test('bobaSugar is a flag, so it holds even though milk is placed at the end', () => {
  const r = resolve(full({ lv: lv({ chip: 5, milk: 4, boba: 3 }) }, { bobaSugar: true }), spec);
  assert.ok(r.extras.includes('bobaSugar') || r.id === 'bobaSugar');
});
test('nothing satisfied and not all max → tryAgain', () => {
  assert.equal(resolve(full({ lv: lv({ chip: 5 }) }), spec).id, 'tryAgain');
});
test('ENDINGS has ten entries with Chinese titles', () => {
  assert.equal(Object.keys(ENDINGS).length, 10);
  assert.equal(ENDINGS.shieldDown.title, '矽盾未就緒'); assert.equal(ENDINGS.cyber.kind, 'true');
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`，Expected: FAIL 找不到 `endings.js`

- [ ] **Step 3: 實作 `src/rules/endings.js`**（照 Interfaces；`line` 用 §8.3 的畫面描述縮成一句）

- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`，Expected: 全部通過

- [ ] **Step 5: Commit**

```bash
git add src/rules/endings.js test/endings.test.js
git commit -m "rules: 結局判定與飛彈"
```

---

### Task 5: 求解器 `run.js`：全排列、統計、驗收

**Files:**
- Create: `src/solver/run.js`
- Test: `test/solver.test.js`

**Interfaces:**
- Consumes: Task 3 `createState/place/isAllMax`，Task 4 `resolve`。
- Produces:
  ```js
  export function playOrder(order, spec) → { state, ending, maxCount, events }
  export function enumerate(spec) → Result[]            // 所有 ORDER 的排列，Result = playOrder 的回傳 + { order }
  export function stats(results, spec) → { total, full: Result[], byEnding: {id: count}, avgMax, maxHist: number[], greedyReachesTrue: boolean }
  export function check(results, spec) → { ok: boolean, failures: string[] }
  export function greedyOrder(spec) → id[]              // 每步選讓「總等級」升最多的物品，平手取 ORDER 前者
  ```
  `check` 的五條（§6.5，失敗訊息用中文，一條一句；第 1 條的訊息固定是 `正解數必須剛好 2，目前 ${n}`）：
  1. `full.length === 2`
  2. `full` 的兩個 `ending.id` 是 `{'cyber','alien'}`
  3. 每個壞結局 id 在至少一個 result 的 `satisfied` 裡出現；且 `missile === 'hit' || 'deflect'`（晶片未 MAX）的比例 ≥ 0.30
  4. `avgMax ≤ 3` 且 `greedyReachesTrue === false`
  5. 無任何順序 throw（捕捉後列為失敗）
  CLI：`node src/solver/run.js` 印統計；`--check` 另印驗收結果，失敗 `process.exit(1)`。

- [ ] **Step 1: 寫失敗測試 `test/solver.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerate, stats, check, greedyOrder, playOrder } from '../src/solver/run.js';
import * as spec from '../src/rules/spec.js';

test('enumerate visits all 40320 orders without throwing', () => {
  const r = enumerate(spec); assert.equal(r.length, 40320);
  assert.ok(r.every(x => x.ending && typeof x.maxCount === 'number'));
});
test('stats shape', () => {
  const s = stats(enumerate(spec), spec);
  assert.equal(s.total, 40320); assert.equal(s.maxHist.length, 9);
  assert.ok(s.avgMax >= 0 && s.avgMax <= 8); assert.ok('cyber' in s.byEnding || 'tryAgain' in s.byEnding);
});
test('check returns ok=false with named failures on a spec that has zero full solutions', () => {
  const never = { ...spec, ITEMS: structuredClone(spec.ITEMS) }; never.ITEMS.milk.up[2] = { minLevel: ['milk', 9] };
  const c = check(enumerate(never), never);
  assert.equal(c.ok, false); assert.ok(c.failures.some(f => /剛好 2/.test(f)));
});
test('greedyOrder is a permutation of ORDER', () => {
  assert.deepEqual([...greedyOrder(spec)].sort(), [...spec.ORDER].sort());
});
test('playOrder of a fixed order is deterministic', () => {
  const a = playOrder(spec.ORDER, spec), b = playOrder(spec.ORDER, spec);
  assert.deepEqual(a.state, b.state); assert.equal(a.ending.id, b.ending.id);
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`，Expected: FAIL 找不到 `run.js`

- [ ] **Step 3: 實作 `src/solver/run.js`**

Heap 排列或遞迴皆可；`structuredClone` 在 40320×8 次 place 會慢，若整體超過 10 秒，改在 engine 內用淺拷貝（`lv/age/locked/flags` 各自 `{...}`）——這是 Task 3 的實作細節，允許回頭改。CLI 區塊用 `if (process.argv[1] === fileURLToPath(import.meta.url))` 守住，避免 import 時執行。

- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`，Expected: 全部通過（含 40320 次模擬 < 10 秒）

- [ ] **Step 5: 跑統計看第一版規則長什麼樣** — Run: `npm run stats`，Expected: 印出 total、full 數、各結局數、avgMax、maxHist；`npm run check` 此時預期 **失敗**（第一版規則不會剛好兩解），這是正常的。

- [ ] **Step 6: Commit**

```bash
git add src/solver/run.js test/solver.test.js
git commit -m "solver: 全排列統計與五條驗收"
```

---

### Task 6: 收緊器 `tighten.js`

**Files:**
- Create: `src/solver/tighten.js`
- Test: `test/tighten.test.js`

**Interfaces:**
- Consumes: Task 5 `enumerate/check/stats`。
- Produces:
  ```js
  export function candidates(spec) → Clause[]   // Clause = { item, level, cond }：可加到 ITEMS[item].up[level] 的 AND 子句
  export function score(spec) → number           // 越小越好，見下；任何順序 throw → Infinity
  export function tighten(spec, { maxSteps = 40, candidateLimit = Infinity, log = () => {} } = {}) → { spec, applied: Clause[], finalScore }
  ```
  `score = |full−2|·100 + 50·[兩解不是 cyber+alien] + 20·[greedy 到真結局] + 10·max(0, avgMax−3) + 30·[每一個「壞結局不可達」或「晶片未 MAX 比例 < 0.30」的失敗]`，所以 **score === 0 ⇔ check().ok**。
  候選子句：對每個物品每一級，`{minLevel:[other, n]}`（other ≠ self，n 1..max[other]）、`{age:[self, n]}`（n 2..4）、`{maxLevel:[other, n]}`（n 0..max−1）。`candidateLimit` 只取前幾個候選（測試用）。貪婪：每步試所有候選，取 `score` 下降最多的加入（平手取先者），`score` 不再下降或 `check().ok` 就停。只改 `up`，不碰 Action（謎題骨架）。
  CLI：`npm run tighten` 印每一步加了什麼與分數，最後印「建議貼進 spec.js 的子句」清單；**不自動改檔**。

- [ ] **Step 1: 寫失敗測試 `test/tighten.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, score, tighten } from '../src/solver/tighten.js';
import { check, enumerate } from '../src/solver/run.js';
import * as spec from '../src/rules/spec.js';

test('candidates only touch up[] and never the typhoon skeleton actions', () => {
  const c = candidates(spec);
  assert.ok(c.length > 100);
  assert.ok(c.every(x => x.level >= 2 && x.level <= spec.ITEMS[x.item].max && x.cond));
});
test('score is 0 iff check passes', () => {
  const s = score(spec); const ok = check(enumerate(spec), spec).ok;
  assert.equal(s === 0, ok);
});
test('tighten never increases score and returns a spec that still compiles', { timeout: 600000 }, () => {
  const before = score(spec);
  const r = tighten(spec, { maxSteps: 3, candidateLimit: 20 });
  assert.ok(r.finalScore <= before);
  assert.doesNotThrow(() => enumerate(r.spec));
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`，Expected: FAIL 找不到 `tighten.js`

- [ ] **Step 3: 實作 `src/solver/tighten.js`**（每步評估候選數 × 40320 次模擬會慢；允許在 `candidates` 裡先用啟發式砍半：只保留 `other` 在 ORDER 中與 `item` 不同的 `minLevel`、`age ≤ 4`）

- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`，Expected: 全部通過

- [ ] **Step 5: Commit**

```bash
git add src/solver/tighten.js test/tighten.test.js
git commit -m "solver: 貪婪收緊器"
```

---

### Task 7: 調規則到 `npm run check` 通過

**Files:**
- Modify: `src/rules/spec.js`（只改 `up` 條件與 story）
- Create: `docs/superpowers/plans/solutions.md`（劇透：兩條正解與統計，給之後的計畫 3、4 做演出測試用）

**Interfaces:**
- Consumes: Task 5 CLI、Task 6 CLI。
- Produces: 通過驗收的 `spec.js`；`solutions.md` 內含兩條正解順序、每回合等級變化表、各壞結局一條代表順序。

- [ ] **Step 1: 跑收緊器** — Run: `npm run tighten`，記下建議子句。

- [ ] **Step 2: 把子句貼進 `spec.js` 的對應 `up[n]`**（用 `and` 合併；若子句讓某級在語意上說不通——例如「鮮奶 Lv2 需棒球 ≥3」——改選分數次佳但說得通的候選，`tighten` 的 log 有列）

- [ ] **Step 3: 驗收** — Run: `npm run check`，Expected: `ok`，五條全過。若未過，回 Step 1 再跑一輪（收緊器從目前 spec 繼續）。最多三輪；三輪還不行就把失敗的那一條（通常是 `avgMax ≤ 3` 或 greedy）貼回對話討論，不要硬塞無意義子句。

- [ ] **Step 4: 用 `npm run stats` 的輸出寫 `docs/superpowers/plans/solutions.md`**：兩條正解順序與逐回合 `lv` 表（可用 `playOrder(order).events` 印）、每個壞結局一條代表順序、maxHist、avgMax、greedyOrder 到幾個 MAX。

- [ ] **Step 5: 跑全部測試** — Run: `npm test && npm run check`，Expected: 全過

- [ ] **Step 6: Commit**

```bash
git add src/rules/spec.js docs/superpowers/plans/solutions.md
git commit -m "rules: 調到剛好兩解，記錄正解與統計（劇透）"
```

---

### Task 8: 瀏覽器可用性煙霧測試

**Files:**
- Create: `test/browser-import.test.js`

**Interfaces:**
- 驗證 `src/rules/*.js` 與 `src/solver/run.js` 沒有用到 Node 專屬 API（計畫 2 要在瀏覽器 import 同一份引擎）。

- [ ] **Step 1: 寫測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const f of ['src/rules/conditions.js','src/rules/spec.js','src/rules/engine.js','src/rules/endings.js']) {
  test(`${f} has no node-only imports`, () => {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /from ['"]node:|require\(|process\./);
  });
}
```

- [ ] **Step 2: 跑測試** — Run: `npm test`，Expected: 通過（若 `engine.js` 用了 `structuredClone` 以外的 Node API，改掉）

- [ ] **Step 3: Commit**

```bash
git add test/browser-import.test.js
git commit -m "test: 規則模組不得依賴 Node API"
```
