# 計畫 6 看得見的因果與離島三段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每一級都有觸發者；有原因的升級先演幫手的拜訪；沒長的物品演撲空（沒有泡泡）；七座離島各加兩段；仍剛好兩條正解。

**Architecture:** 規則：`spec.js` 把 16 個 `auto` 換成有故事的條件、棒球 Lv3 加幫手，求解器重收；引擎的 `via` 改成真的讓條件成立的幫手。演出層：`turn.js` 在有 `via` 的 grow 前插系統性的「拜訪」拍（`src/show/visit.js`），在 wait 事件上演「撲空」（最多兩段）；各模組提供 `visitSpot(n, s)`；小人新姿勢 `sigh`。離島：`satellites.js` 的 view 依表加零件。節奏門檻 50 → 60，拜訪獨立量。

**Tech Stack:** 原生 ES modules、three.js（vendor）、node:test、headless Chromium。

**Spec:** `docs/superpowers/specs/2026-10-28-cause-and-islets-design.md`（本計畫依據）；`2026-10-28-choice-growth-design.md` 的規則骨架照舊。

分支：從 `main`（併入 `recording-fixes` 之後）開 `cause-and-islets`。

## Global Constraints

- 61 級不變；一回合一物品最多 +2；`CLOSING_TURNS` 1；鮮奶 steady；颱風不拜訪也不被拜訪。
- `npm run check` 驗收照舊（剛好兩條正解、一賽博一外星、七個壞結局到得了、晶片未 MAX ≥ 30%、平均 MAX ≤ 3.5、貪婪到不了真結局、PACING——撐不住就記裁決）。
- 節奏（seed 21）：放置回合與最後一輪 4 … **60 + 8 × max(0, ◆ − 1)** 秒；終局 ≤ 22／≤ 12；拜訪每段 ≤ 3.5 秒、撲空每段 ≤ 3 秒、每回合撲空 ≤ 2 段；非關鍵劇本 ≤ 4.5 秒、◆ ≤ 8 秒（拜訪不算在內）。
- 預算：主島名冊 ≤ 30、一格 ≤ 8；draw call ≤ 250／≤ 150；骨架動畫 ≤ 12。
- 沒有任何泡泡式的原因提示；不加旗子；飛彈／尾聲／標題卡不變；views 純函數、零件建好即終態。
- 文件、註解、commit：台灣用語繁體中文。

## Review Focus

1. **跳級第二級的拜訪**：同一回合同一物品 +2 時只在第一級前拜訪一次；第二級落在 ◆ 時照舊演 ◆ 劇本但不再拜訪。Task 3 測試。
2. **幫手代表正在別的劇本手上**（同一回合它自己也在升級）：拜訪要等它空出來或改走——不能把它從自己的劇本裡搶走。Task 3 測試：幫手與被幫者同一回合都升級。
3. **亂放的局撲空點**：缺的幫手還沒放 → 走到錨點附近的可走點；放了但不夠高 → 拜訪點；太遠 → 自己門口。Task 4 測試用 EXAMPLE.hit／deflect 每回合驗。
4. **離島第二段先於第一段**（亂放）：各自獨立出現、不互相遮擋。Task 5 測試。
5. **回合長度**：兩條正解每回合 ≤ 60 + 8 ×（◆ − 1）；超過時依設計 §6 的順序砍。Task 6。

---

## 共用介面

```js
// rules/engine.js
//   grow 事件的 via：這次真的讓條件成立的幫手（or 只算成立的那一支；跳級取兩級的聯集），照 ORDER；滿足者算法 export satisfiedHelpers(cond, s, self)
// actors/<item>.js（八個，颱風回 null）
export function visitSpot(n, s) → { x, y, z, r } | null      // 第 n 級的建築正面（同 5b 之前的 rushSite）；拜訪者站在 frontOf(spot, r, nav)
// show/visit.js
export const VISIT_WALK = 1.5, VISIT_KNOCK = 0.8, VISIT_LOVE = 0.6, VISIT_MAX_PER_HELPER = 3, VISIT_CAP = 3.5
export function visit(e, s, ctx, { helper, target }) → beats   // [focus(target cell) 由 turn.js 補, walk(rep → frontOf(visitSpot)), gesture knock + (target rep wave), bubble ♥ 0.6, home]；rep 找不到／藏著 → []
export const SIGH = 1.0, MISS_CAP = 3, MISS_PER_TURN = 2
export function miss(w, s, ctx) → beats                          // 撲空：[walk(rep → 目標點), gesture sigh, home]
// show/turn.js
//   grow 且 via 非空且不是 jump 第二級、不是 indoors → mark(e, { visit: true }) + lead focus + visit beats，再 mark(e, …) + 原劇本
//   wait 事件 → 前 MISS_PER_TURN 個 waits 各一段 miss（取代舊的等待圖框）
// scene/people.js：gesture 'sigh'（頭低、雙手垂、不走）；GESTURE_DUR.sigh = 1.0
// actors/satellites.js：view 依設計 §7 的表加 'sat.<island>.stage1' / 'sat.<island>.stage2'
// tools/pace.mjs：MAX 60；每回合印「拜訪 n／撲空 n」；拜訪段 ≤ VISIT_CAP、撲空段 ≤ MISS_CAP 用 mark info 量
```

---

### Task 1: 規則與求解器（每一級都有觸發者）

**Files:** Modify `src/rules/spec.js`, `src/rules/engine.js`（`via` 真的成立的幫手）, `src/solver/run.js`（只在 PACING 要調時）, `test/spec.test.js`, `test/engine.test.js`, `test/solver.test.js`, `test/helpers/endings.js`（EXAMPLE 重找）, `test/endings.test.js`, `package.json`（hit=／deflect=）

- [ ] **Step 1: Write the failing tests**

```js
// test/spec.test.js
test('no auto up[] from Lv3 on except typhoon; every condition from Lv3 names at least one helper (minLevel/present)', () => {});
// test/engine.test.js
test('via lists only the helpers that satisfied the condition: or(min chip 3, min token 4) with only token placed → [token]; a jump unions both levels', () => {});
// test/solver.test.js
test('check passes: exactly two full orders, one cyber one alien (snapshot)', () => {});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** 設計 §3 的表（棒球 Lv3 加 `min('milk', 3)`）；`satisfiedHelpers`；求解器收到剛好兩解（`npm run tighten`），改了哪些數字寫回設計 §3 與 spec.js 註解；EXAMPLE 重找並釘住；shot 清單的正解順序更新。
- [ ] **Step 4: Run** `node --test test/spec.test.js test/engine.test.js test/solver.test.js test/endings.test.js`、`npm run check` → 綠（演出測試紅的列在報告）
- [ ] **Step 5: Commit** `feat(rules): 每一級都有觸發者、via 只列真的成立的幫手；求解器剛好兩條正解`

---

### Task 2: 拜訪點與失望姿勢

**Files:** Modify 八個 `src/actors/<item>.js`（`visitSpot`；颱風回 null）, `src/scene/people.js`（`sigh`）, `src/show/beats.js`（GESTURE_DUR.sigh）, `test/<item>.test.js`（每個加一條）, `test/people.test.js`, `test/beats.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// 每個物品測試
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {});
// test/people.test.js
test('gesture sigh: head lowered (head matrix y below the normal pose), arms down, walker does not advance', () => {});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**（離島上的級——珍奶 5／6、燈泡 7／8、代幣 7／8——回 null；其餘回建築正面）
- [ ] **Step 4: Run** 這些測試 → 綠
- [ ] **Step 5: Commit** `feat(show): 八個物品的拜訪點、小人失望姿勢`

---

### Task 3: 拜訪（有原因的升級先演幫手）

**Files:** Create `src/show/visit.js`, `test/visit.test.js`; Modify `src/show/turn.js`, `tools/pace.mjs`（拜訪段量法、MAX 60）, `test/turn.test.js`, `test/chain.test.js`（兩條正解每個有 via 的 grow 都演了拜訪）

- [ ] **Step 1: Write the failing tests**

```js
// test/turn.test.js
test('a grow with via gets a visit before its script: mark {visit}, focus, walk/knock/♥/home; jump second level and indoors events get none; ◆ levels do get one', () => {});
test('the same helper visits at most VISIT_MAX_PER_HELPER times per turn; later caused grows play only their script', () => {});
// test/visit.test.js（headless）
test('visit live: the helper rep reaches frontOf(visitSpot) within VISIT_WALK (or appears at the cell edge), knocks, the target rep waves, ♥, both home; ≤ 3.5 s; nobody left in script mode', async () => {});
test('helper rep busy in its own script this turn: the visit waits for it (plays after) or is skipped — never steals it mid-script (review focus 2)', async () => {});
test('helper without a rep (typhoon; electrician away) → no visit beats', async () => {});
// test/chain.test.js
test('both solutions: every grow with via (not jump-second, not indoors) played a visit; visits ≤ 3.5 s; turns within 60 + 8 × (◆ − 1)', async () => {});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** 設計 §4；pace 每回合印拜訪數
- [ ] **Step 4: Run** `npm test`、`node tools/pace.mjs --check` → 綠（超過上限先砍停頓；仍超過記裁決）
- [ ] **Step 5: Commit** `feat(show): 拜訪——有原因的升級先演幫手走來互動`

---

### Task 4: 撲空（沒長的物品）

**Files:** Modify `src/show/visit.js`（`miss`）, `src/show/turn.js`（wait → miss，拿掉等待圖框）, `src/ui/icons.js`（BUBBLE_ICONS 若只剩等待圖框在用就留著不刪）, `test/visit.test.js`, `test/turn.test.js`, `test/chain.test.js`（EXAMPLE 兩局）

- [ ] **Step 1: Write the failing tests**

```js
test('wait event → up to MISS_PER_TURN miss segments in ORDER; no icon bubble anywhere', () => {});
test('miss live: helper absent → rep walks to a walkable point near the helper anchor; helper too low → its visitSpot; too far → own door; sigh; home; ≤ 3 s', async () => {});
test('EXAMPLE.hit and EXAMPLE.deflect: every turn plays ≤ 2 misses at the right places, invariants clean', async () => {});
```

- [ ] **Step 2–5:** RED → implement → `npm test` → commit `feat(show): 撲空——等不到幫手的物品走去找、失望走回`

---

### Task 5: 離島三段

**Files:** Modify `src/actors/satellites.js`, `test/satellites.test.js`, `docs/assets/manifest.md`

- [ ] **Step 1: Write the failing tests**

```js
test('each islet: stage-1 and stage-2 parts appear exactly at the design §7 levels, independently (stage 2 alone when its trigger comes first), none before', () => {});
test('islet parts stay inside their islet footprint and off the keeper / tourist / kid spots; draw calls per islet ≤ 6', () => {});
```

- [ ] **Step 2–5:** RED → implement（守塔人小屋、棧橋、第二支風機＋電池屋、變電小站、鼠洞與石板、第二頂帳篷、觀測站、鞦韆、旋轉木馬（會轉）、茶屋桌椅、燈籠串（發光）、海鷗、金幣噴泉）→ `npm test` → commit `feat(satellites): 七座離島各加兩段`

---

### Task 6: 節奏、截圖、文件

**Files:** Modify `tools/pace.mjs`, 各物品劇本的停頓（只在超過時）, `package.json`（shot 清單、`warp`）, 設計 §3／§6／§11, `docs/superpowers/plans/README.md`

- [ ] **Step 1:** `node tools/pace.mjs --check --verbose`：超過 60 + 8 ×（◆ − 1）的回合依設計 §6 砍；數字寫進設計 §6。
- [ ] **Step 2:** shot 清單用新正解；加 `islets=auto=<全 MAX 順序>&cam=lighthouse` 之類的離島特寫 2 張；`npm run shot` 預算內。
- [ ] **Step 3:** 文件：設計 §11 裁決、README 第 6 列（完成（已併入 main）——合併緊接著）、items-v2／choice-growth 設計頂部一行「升級演出改由 2026-10-28 因果設計接手」。
- [ ] **Step 4: Run** `npm test`、`npm run check`、`node tools/pace.mjs --check`、`npm run shot` → 全綠
- [ ] **Step 5: Commit** `docs,test(pace): 因果與離島的節奏、截圖與文件`
