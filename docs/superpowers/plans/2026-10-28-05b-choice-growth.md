# 計畫 5b 選擇帶動升級（拿掉最後大升級）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升級發生在放置的那一回合：放下的物品當回合可以長一級、任何一級都能跳（+2，一回合最多 +2）、鮮奶不連跳；放完第 8 個只剩一輪照一般回合演的最後成長，接著飛彈警告與飛彈；仍剛好兩條全 MAX 正解。

**Architecture:** 引擎改三處（放下的物品參加當回合的升級掃描；`rulesOf` 給每級 n ≥ 3 補預設跳級 `up[n−1] ∧ up[n]`，`steady` 物品不補；`CLOSING_TURNS` 1），收緊器重收條件。遊戲層拿掉倒數數字與蒙太奇：最後一輪是普通回合，終局回合多一個 `warning` 事件在飛彈前。演出層拿掉趕工與蒙太奇。其餘是連鎖效應：依回合寫死的測試、101 門檻、截圖的 `auto=`／`warp=`。

**Tech Stack:** 原生 ES modules、three.js（vendor）、node:test、headless Chromium。

**Spec:** `docs/superpowers/specs/2026-10-28-choice-growth-design.md`（本計畫依據）；最終章 `2026-10-27-final-chapter-design.md` §6–§7（飛彈、尾聲照舊）；物品 v2 `2026-10-26-items-v2-design.md` §3–§4（級數與條件的出發點）。

分支：從 `main`（`e6d4a8e`）開 `choice-growth`。

## Global Constraints

- 61 級照舊（鮮奶 10、代幣 10、晶片 9、燈泡 9、棒球 8、珍奶 7、老鼠 5、颱風 3）；一回合一物品最多比回合開始高 2 級（含 delta）；`CLOSING_TURNS` = 1；鮮奶 `steady: true`。
- `npm run check` 全部驗收照舊（剛好 2 條正解、一賽博一外星、七個壞結局到得了、晶片未 MAX ≥ 30%、平均 MAX ≤ 3.5、貪婪到不了真結局、PACING）。
- 節奏（`node tools/pace.mjs --check`，seed 21）：放置回合與最後一輪 4 秒起、上限 50 + 8 × max(0, ◆ − 1)；終局真結局 ≤ 22 s、壞結局 ≤ 12 s；非關鍵劇本 ≤ 4.5 s、◆ ≤ 8 s 只印 ⚠。
- 預算：主島名冊 ≤ 30、一格 ≤ 8；draw call ≤ 250／手機 ≤ 150；骨架動畫 ≤ 12。
- 飛彈三結果、尾聲、標題卡前 hold 2 秒、跳過／reduced-motion／RESET 的終態規則不變。
- 文件、註解、commit 訊息：台灣用語繁體中文。

## Review Focus

1. **放下當回合長到 Lv2 的物品**：placed 劇本之後同一回合接 grow[2] 劇本——兩段劇本對同一批名冊成員（hold／spawn）不能打架；跳過時終態等於引擎狀態。Task 3 的整局測試（兩條正解每回合 `stage.lv` = 引擎）。
2. **預設跳級跨過有 onLevel 的那一級**（老鼠 Lv4 分岔、颱風 Lv2 檢查）：跳過去時反應照樣發生。Task 1 引擎測試。
3. **跳級的第二級是關鍵級以外、但劇本很重的級**：只演 [套用, LEVEL UP]，零件與名冊照樣到位（不卡人在劇本模式）。Task 3 整局不變式。
4. **RESET 在最後一輪或終局警告途中**：新局可玩、不出標題卡。Task 2 測試。
5. **一回合十幾個升級**：節奏上限內；超過時的處理記成裁決。Task 4。

---

## 檔案

修改：`src/rules/{engine,spec}.js`、`src/solver/run.js`（若 PACING 要調）、`src/game.js`、`src/show/{turn,index}.js`、`src/actors/finale.js`、六個建築模組（拿掉 `rushSite`）、`src/actors/tower.js`（門檻）、`tools/pace.mjs`、`package.json`（shot 清單）、`test/helpers/{show,endings}.js`、相關測試、規格與計畫 README。

## 共用介面

```js
// rules/spec.js
ITEMS.milk.steady = true
export const CLOSING_TURNS = 1
// rules/engine.js
//   rulesOf：每個物品 n = 3..max，steady 以外 jump[n] = spec.jump[n] ? or(spec.jump[n], and(up[n−1], up[n])) : and(up[n−1], up[n])；
//            jumpDeps[n] 照編譯後的條件算
//   turn()：放下的物品（id）不再預先放進 grown；回合開始它是 0 級，所以 room = 2（當回合最多 Lv2）
// game.js
export const WARNING = { kind: 'warning', flag: { name: 'alarm', value: 1 } }
export function finaleEvents(ending) → [WARNING, missile, ...(真結局 ? [epilogue] : [])]
//   pick()：第 8 個放完 → for CLOSING_TURNS：play([...advance.events])（一般回合，不帶 montage）→ show.turn(finaleEvents(ending), { finale: true }) → hold(2) → onFinished
//   移除 countdownEvent
// show/turn.js：移除 montage 參數與 MONTAGE_*、趕工（RUSH_*、rushHero）；kind 'warning' 查 finale 劇本
// actors/finale.js
//   view：flags.alarm && !flags.missile → 'finale.flare'（脈動固定 FLARE_HZ = 2）
//   script.warning(e, s, ctx)：[apply(only flare), together([crowd ！, ...lookUp(FLARE_AT).look]), release]（原本 countdown n=3 去掉數字）
//   移除 script.countdown、flareHz
// test/helpers/show.js：移除 closingEvents；turnSteps 照舊（CLOSING_TURNS 從 spec 來）
// test/helpers/endings.js：EXAMPLE.hit／deflect 重找、釘死
```

---

### Task 1: 規則與求解器

**Files:** Modify `src/rules/engine.js`, `src/rules/spec.js`, `src/solver/run.js`（只在 PACING 必須放寬時）, `src/solver/tighten.js`（候選也能加在 jump 上時才動）, `test/engine.test.js`, `test/spec.test.js`, `test/solver.test.js`, `test/tighten.test.js`, `test/conditions.test.js`（若用到）

**Interfaces:** Produces 共用介面的引擎語意、`steady`、`CLOSING_TURNS` 1、新的兩條正解。

- [ ] **Step 1: Write the failing tests**

```js
// test/engine.test.js
test('a placed item joins the growth scan in its placement turn: up[2] holds → it ends the turn at Lv2 (never Lv3)', () => {});
test('default jump: at n−2 with up[n−1] and up[n] both true the item rises +2 in one turn; an explicit jump[n] is an alternative (either holds)', () => {});
test('steady items get no default jumps: milk rises one level per turn except its explicit jump[7]', () => {});
test('a default jump across a level with onLevel fires that reaction (rat Lv3 → 5 crosses the Lv4 branch; typhoon 1 → 3 crosses the Lv2 check)', () => {});
test('the +2 per turn cap still includes deltas', () => {});
// test/spec.test.js
test('CLOSING_TURNS is 1 and milk is steady', () => {});
// test/solver.test.js
test('check passes on the shipped spec: exactly two full orders, one cyber one alien (snapshot the two orders)', () => {});
```

- [ ] **Step 2: Run** `node --test test/engine.test.js test/spec.test.js test/solver.test.js` → FAIL
- [ ] **Step 3: Implement** 引擎三處；spec 的 `steady`、`CLOSING_TURNS`；`node src/solver/run.js` 看解數（只改三處時約 24 條，賽博 2），用 `npm run tighten` 的建議收到剛好 2 條（一賽博一外星），條件改動逐條寫進 spec 註解；PACING 若必須放寬就改 `run.js` 的 `PACING` 並在報告寫明數字。設計文件 §3 的數字（解數、改了哪些條件）寫回。
- [ ] **Step 4: Run** `node --test test/engine.test.js test/spec.test.js test/solver.test.js test/tighten.test.js test/conditions.test.js test/endings.test.js`、`npm run check` → 綠。其餘演出測試預期紅（Task 2–3），把紅的清單寫進報告。
- [ ] **Step 5: Commit** `feat(rules): 放下當回合可長、每級可跳（鮮奶不連跳）、最後只長一輪；求解器剛好兩條正解`

---

### Task 2: 遊戲流程與終局警告（拿掉倒數、蒙太奇、趕工）

**Files:** Modify `src/game.js`, `src/show/turn.js`, `src/show/index.js`（`turn` 的 `montage` 參數拿掉）, `src/actors/finale.js`, `src/actors/{milk,chip,bulb,token,boba,baseball}.js`（拿掉 `rushSite`）, `tools/pace.mjs`, `test/helpers/show.js`, `test/helpers/endings.js`, `test/{game,turn,show,finale,endings}.test.js`

**Interfaces:** Consumes Task 1 的 `CLOSING_TURNS` 1。Produces `WARNING`、`finaleEvents` 新形狀、`script.warning`、`FLARE_HZ`。

- [ ] **Step 1: Write the failing tests**

```js
// test/game.test.js
test('after the 8th placement: one plain closing turn (no montage option, no countdown event), then the finale turn [warning, missile, epilogue?], hold 2, onFinished', async () => {});
test('reset during the closing turn or the warning: no onFinished, new game playable', async () => {});
// test/finale.test.js
test('warning live: the flare blinks in, visible islanders look at FLARE_AT and say ！, everyone released; ≤ 3 s', async () => {});
test('view: alarm draws finale.flare pulsing at FLARE_HZ 2; missile puts it out', () => {});
// test/turn.test.js
test('no montage path remains: buildTurn has no montage/rush branches; a warning event plays finale.script.warning', () => {});
// test/endings.test.js
test('EXAMPLE.hit / EXAMPLE.deflect recomputed from the enumeration (pinned literals)', () => {});
```

- [ ] **Step 2: Run** the listed tests → FAIL
- [ ] **Step 3: Implement** 照共用介面。`pace.mjs`：最後一輪用放置回合的門檻、列名「最後一輪」；終局列（真 ≤ 22、壞 ≤ 12）；合計列印「最後一輪＋終局」與舊值 70.9／67.0 對照。拿掉 `rushSite` 與它的測試、`closingEvents`、`countdownEvent`、`MONTAGE_*`、`RUSH_*`、`script.countdown`、`flareHz`；`crowd.js` 留著。
- [ ] **Step 4: Run** `node --test test/game.test.js test/turn.test.js test/show.test.js test/finale.test.js test/endings.test.js` → 綠
- [ ] **Step 5: Commit** `feat(finale): 最後一輪照一般回合演、飛彈警告移到終局開頭；拿掉倒數、蒙太奇、趕工`

---

### Task 3: 整局連鎖效應（放下當回合長、跳級變多、101 門檻、依回合寫死的測試）

**Files:** Modify `src/actors/tower.js`（`stageOf` 門檻）, 各物品模組（只在劇本因「放下後同回合 grow[2]」或新跳級組合出錯時）, `test/*.test.js` 裡依舊正解回合寫死的斷言, `test/chain.test.js`, `test/budget.test.js`, `test/stage-real.test.js`

**Interfaces:** Consumes Task 1–2。

- [ ] **Step 1: Write the failing tests**

```js
// test/tower.test.js（改）
test('both solutions cross the four stages in four different turns, spread through the game, lit by the end', () => {});   // 新門檻
// test/chain.test.js（改）：兩條正解 live 演完（9 回合＋終局）——離島鏈順序、零件在對的回合、gameInvariants 乾淨、每回合 stage.lv = 引擎
// test/budget.test.js（改）：兩條正解每回合結束主島 ≤ 30、一格 ≤ 8
test('placed + grow[2] in the same turn: the placed script then the grow script, roster members not left in script mode, skip reaches the engine state (each item, both solutions)', async () => {});
```

- [ ] **Step 2: Run** `npm test` → 列出全部紅燈
- [ ] **Step 3: Implement** 逐一修：101 門檻取在兩條正解總等級曲線的空檔中間（四階段不同回合）；依回合寫死的測試改成從求解器的正解推（不寫死回合號碼）；劇本若因同回合 placed→grow[2] 出錯就修劇本（同一批成員用 `once`／`hold` 銜接）。
- [ ] **Step 4: Run** `npm test` → 全綠
- [ ] **Step 5: Commit** `fix(show): 放下當回合長、跳級變多之後的整局修正；101 門檻重取`

---

### Task 4: 節奏、截圖、文件

**Files:** Modify `tools/pace.mjs`（只在需要時）, 各物品劇本的停頓秒數（只在超過上限時）, `package.json`（shot 清單的 `auto=`／`warp=`）, `docs/superpowers/specs/2026-10-28-choice-growth-design.md` §6–§8, `docs/superpowers/plans/README.md`, `docs/superpowers/plans/solutions.md`（若有）, `tools/solutions.mjs`（若依舊流程）

- [ ] **Step 1:** `node tools/pace.mjs --check --verbose`：任何回合超過上限 → 先砍那回合非關鍵劇本的停頓與泡泡（不加快走路），仍超過再記裁決放寬，數字寫進設計 §6。
- [ ] **Step 2:** shot 清單：`end`／`alien`／`wide-end`／`night-end`／`phone-end`／`phone-alien`／物品特寫改用新正解；`warp` 值重找到拍得到那一級；`hit`／`deflect` 用 `EXAMPLE`。`npm run shot` 全部 ✔、預算內。
- [ ] **Step 3:** 文件：設計 §6 實測表、§8 裁決；README 加第 5b 列（完成）；物品 v2 §3、最終章 §4–§5 開頭加一行「被 2026-10-28 選擇帶動升級取代」。
- [ ] **Step 4: Run** `npm test`、`npm run check`、`node tools/pace.mjs --check`、`npm run shot` → 全綠
- [ ] **Step 5: Commit** `docs,test(pace): 選擇帶動升級的節奏、截圖與文件`
