# 壞掉會連鎖、閃白改亮一下、工程師繞園區 實作計畫（計畫 9）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 靠捷運／電網的七級加回依賴，壞結局會連鎖拖垮靠它的東西；零件出現與起因提示從塗純白改成亮一下＋小彈一下；工程師 Lv3 起真的騎車繞園區；一窩老鼠 3 隻。

**Architecture:** 規則只動 `src/rules/spec.js` 七格（設計 §3，試作全枚舉過仍剛好兩解）；亮一下只動 `src/show/blink.js`（材質複本＋emissive 曲線）與 `src/actors/stage.js` 的 commit（新零件 scale 彈一下）；工程師在 `src/actors/chip.js` 換成繞園區的環形 `path`（`loop: true`）；老鼠在 `src/actors/rat.js` 改數量。

**Tech Stack:** 原生 ES modules、three.js（vendor）、`node --test`、無頭演出 `test/helpers/show.js`、`npm run check`／`pace`／`shot`。

**Spec:** `docs/superpowers/specs/2026-10-30-cascade-and-glow-design.md`

## Global Constraints

- 兩條正解不變：`milk,baseball,bulb,token,chip,boba,rat,typhoon` → cyber；`milk,baseball,token,bulb,chip,boba,rat,typhoon` → alien。`npm run check` 必須過。
- 61 級、9 回合、+2 上限、掃描順序、`delay`／`fx`／`onLevel`：不變。規則表只動設計 §3 的七格（附錄一字不差）。
- 沒有文字／泡泡提示。`BLINK` 0.15 秒、拍的長度、`SCRIPT_MAX` 4.5／`KEY_MAX` 8／回合上限：不變。走路速度不加快。
- `blink` 的介面（`part`、`walker`、`has`、`stop`、`clear`、`count`）不變。
- 註解、文件、commit 訊息用台灣用語的繁體中文；`git add <檔案>`；每個任務至少一個 commit；commit 結尾加 `Co-Authored-By`（自己的模型名）與 `Claude-Session: https://claude.ai/code/session_019cBsH8oPNC297jN6re2WUJ`。

## Review Focus

1. 淹水局之後靠捷運的級停下來時，撲空要演得出來（工程師／電工／店員走向車站嘆氣），而不是靜靜不長——Task 1 的 `visit.test` 新題。
2. 亮一下：材質複本在 `stop()`／`clear()`／零件被拿掉時都要 dispose、換回原材質，不能留下 emissive 殘留或記憶體洩漏——Task 2 的 blink.test。
3. 共用材質（`island.js` 的 `solid()` 快取、kit 的 glb 材質）被複製時不能改到原物：亮完別棟不能跟著亮——Task 2 測「同一材質兩個 mesh，只亮一個」。
4. 工程師環形路線不穿廠房、不走進變電站 footprint、四台起步等距——Task 3 的 `chip.test` 用 `nav.inFootprint` 驗每個頂點與線段中點。
5. 老鼠窩 3 隻之後，老鼠相關劇本（偵防師追老鼠、溫泉、列車）的人數假設（`ids`、`FOLLOW`）仍成立——Task 3 跑 `test/rat.test.js test/chip.test.js test/chain.test.js`。

---

### Task 1: 規則連鎖

**Files:**
- Modify: `src/rules/spec.js`（晶片 up 6/7/8、燈泡 up 7/9 與 jump 8、珍奶 up 6、棒球 up 8；檔頭註解加「2026-10-30 連鎖」一段）
- Test: `test/spec.test.js`、`test/solver.test.js`、`test/visit.test.js`

**Interfaces:**
- Produces: 新規則表；grow／wait 事件形狀不變。

- [ ] **Step 1: 改 `test/spec.test.js` 的阻擋表**：`blockers` 多七格（照設計 §3）；跳級表改驗 `bulb.jump[8] = { and: [minL('chip', 4), minL('token', 5)] }`、`chip.jump[7] = { and: [minL('token', 7), minL('bulb', 6)] }`，測試名改「exactly the fifteen of design 2026-10-30 §3」。
- [ ] **Step 2: `test/solver.test.js` 加快照**：

```js
test('cascade: the 2026-10-30 recorded order ends with five low items, all pointing at the flooded metro', () => {
  const r = playOrder(['milk', 'baseball', 'chip', 'bulb', 'boba', 'token', 'typhoon', 'rat'], spec);
  assert.deepEqual(spec.ORDER.map(id => r.state.lv[id]), [10, 6, 6, 4, 3, 4, 5, 7]);
  assert.equal(r.ending.id, 'flood');
});
```

並把 `LV` 逐回合表照舊（兩條正解的逐回合級數不變——試作確認過；若有一格變了，把差異寫進報告而不是改表）。
- [ ] **Step 3: `test/visit.test.js` 加撲空題**：淹水局（上面那條順序）第 8 回合的 wait 事件含 `chip←token`；live 演那一段：工程師代表走向代幣站的門口（`goal.kind` 為 `'spot'` 或 `'door'`，`look` 是代幣的 visitSpot），sigh，整段 ≤ MISS_CAP。
- [ ] **Step 4: 跑確認失敗**：`node --test test/spec.test.js test/solver.test.js test/visit.test.js` → FAIL。
- [ ] **Step 5: 改 `src/rules/spec.js`**（七格＋註解）。
- [ ] **Step 6: 跑**：`npm run check`（剛好兩解）、三個測試檔 → PASS；`npm test` 一次，記下壞掉的演出測試（事件變了的）。
- [ ] **Step 7: Commit**

```bash
git add src/rules/spec.js test/spec.test.js test/solver.test.js test/visit.test.js
git commit -m "feat(rules): 連鎖——靠捷運／電網的七級加回依賴，捷運淹水會拖垮離島鏈"
```

---

### Task 2: 亮一下取代閃白

**Files:**
- Modify: `src/show/blink.js`（`part()` 改材質複本＋emissive 曲線；`walker()` 不變）
- Modify: `src/actors/stage.js:81-99`（`commit` 新零件 scale 0.94 → 1）
- Test: `test/blink.test.js`、`test/show.test.js`（既有整局探針照跑）

**Interfaces:**
- Produces: `blink.part(object, dur = BLINK, onEnd)` 行為：每個 mesh 的 `material` 換成 `material.clone()`，有 `emissive` 的設 `emissive = 白`、`emissiveIntensity = GLOW × easeOut(1 − t/dur)`（`GLOW = 0.35`）；沒有 `emissive` 的把 `color` 往白 lerp `GLOW × easeOut`；結束換回原材質並 `dispose()` 複本。`blink.pop(object, dur = BLINK)`：記下呼叫時的 `scale`，乘上 0.94 → 1 的 ease-out，結束乘回原值（新匯出；stage 的 commit 對新零件呼叫）。
- `has()`／`stop()`／`clear()`／`count` 語意不變。

- [ ] **Step 1: 改 `test/blink.test.js`**：
  - 「part glows」：`part(g)` 後每個 mesh 的材質 `!== 原材質`、是複本（`uuid` 不同）、`emissiveIntensity` 在 t=0 約 0.35、t=0.1 介於 0 與 0.35、t=0.15 換回原材質（`deepEqual([m1.material, m2.material], [a, b])`）且複本已 dispose（監看 `dispose` 被呼叫）。
  - 「MeshBasicMaterial（沒有 emissive）走 color lerp」：t=0 的 `color` 比原色亮、結束回原色物件。
  - 「shared material: two meshes sharing one material, only the blinked object glows」：另一個 mesh 的材質物件不變。
  - 「pop scales 0.94× → 1× of the starting scale and ends exactly at the starting scale (also for a part whose scale.y is 0.8)」。
  - 既有 onEnd／restart／stop／clear／walker 測試照舊通過。
- [ ] **Step 2: 跑確認失敗**：`node --test test/blink.test.js` → FAIL。
- [ ] **Step 3: 實作 `blink.js`**；`stage.js` 的 `commit` 對新零件（不是 dying 的舊零件）加 `blink.pop(object)`。
- [ ] **Step 4: 跑**：`node --test test/blink.test.js test/show.test.js test/turn.test.js` → PASS（整局探針的 pops／walls／camera 仍乾淨；`has()` 仍在亮的期間為真，名冊換位置的不變量靠它）。
- [ ] **Step 5: 截圖目視**：`npm run shot milk-3 chip-6`，再用 `?auto=milk,baseball&live=1&warp=<小學蓋好那一刻>` 拍一張 live（warp 用 `npm run pace` 的秒數），確認沒有純白塊。
- [ ] **Step 6: Commit**

```bash
git add src/show/blink.js src/actors/stage.js test/blink.test.js
git commit -m "feat(show): 零件出現與起因提示改成亮一下＋小彈一下，不再塗純白"
```

---

### Task 3: 工程師繞園區、一窩老鼠 3 隻

**Files:**
- Modify: `src/actors/chip.js:42,178`（`PARK_LOOP`；Lv3 起的 `chip.engineers` home）
- Modify: `src/actors/rat.js:76`（nest 5 → 3）
- Test: `test/chip.test.js:59,84`、`test/rat.test.js:48,57`

**Interfaces:**
- Produces: `export const PARK_LOOP`（八個貼地的點，繞 `AT` 半徑約 0.95，`loop: true`）；`ENGINEER_ROUTE` 不變。

- [ ] **Step 1: 改測試**：`chip.test` 59 行：Lv3 起 `chip.engineers.home` 為 `{ kind: 'path', loop: true, speed: 0.8 }`、`path === PARK_LOOP`；新題「PARK_LOOP 的每個頂點與線段中點都在晶片格內、不在任何 footprint 裡（Lv3–9 的 view）」；新題「四台起步點（`i/n` 等距）兩兩距離 ≥ 0.3」。`rat.test` 48／57 行的 nest 數量改 3。
- [ ] **Step 2: 跑確認失敗**：`node --test test/chip.test.js test/rat.test.js` → FAIL。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: 跑**：`node --test test/chip.test.js test/rat.test.js test/chain.test.js test/roster.test.js test/budget.test.js` → PASS。
- [ ] **Step 5: 截圖**：`npm run shot chip-6 turn5` 看四台在環上分開。
- [ ] **Step 6: Commit**

```bash
git add src/actors/chip.js src/actors/rat.js test/chip.test.js test/rat.test.js
git commit -m "fix(actors): 工程師 Lv3 起繞園區的環、四台等距；一窩老鼠 3 隻"
```

---

### Task 4: 門檻、截圖、文件

**Files:**
- Modify: `docs/superpowers/plans/README.md`（第 9 列）、設計 §8
- Test: 全套

- [ ] **Step 1: `npm test && npm run check && npm run pace -- --check`** 全過；Task 1 Step 6 記下的演出測試若因事件變了而壞，改前提並寫明原因（不放寬門檻）。
- [ ] **Step 2: `npm run shot`** 全部，37 張都在預算內；`EXAMPLE` 若因規則變了而換局（`test/endings.test.js` 重算會失敗）就重釘三處（helpers/endings.js、endings.test.js、package.json）。
- [ ] **Step 3: 文件**：README 第 9 列；設計 §8 補執行時的裁決。
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/README.md docs/superpowers/specs/2026-10-30-cascade-and-glow-design.md package.json test/helpers/endings.js test/endings.test.js
git commit -m "docs,chore: 計畫 9 收尾——門檻、截圖、索引第 9 列"
```
