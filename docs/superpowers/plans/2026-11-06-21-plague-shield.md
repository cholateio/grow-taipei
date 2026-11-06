# 鼠災整島、矽盾只在真結局、溫泉客逃離 實作計畫（計畫 21）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鼠災結局演成整島老鼠；天線與罩子只在晶片 Lv9 出現（Lv7 木箱、Lv8 鷹架）；吹偏的隕石掉進溫泉前溫泉客逃到池邊。

**Architecture:** 規則只動 `BAD_EPILOGUES`。零件：`rat.js`（`rat.plague` InstancedMesh）、`chip.js`（`chip.crates`）、`tower.js`（`tower.scaffold`；天線／罩子門檻 9）、`parts.js`（刪 test／fail 罩子）、`landmarks.js`（溫泉客站位照旗標）。劇本：`chip.js` Lv8、`finale.js`（警告拿掉試升、吹偏隕石的溫泉客、`domeRatsEpilogue`）。節奏：`test/helpers/endings.js` `EXAMPLE.domeRats`、`tools/pace.mjs` 路線。

**Tech Stack:** 純 ES module、three.js（InstancedMesh）、node:test、headless 截圖。

**Spec:** `docs/superpowers/specs/2026-11-06-plague-shield-design.md`（R47–R49）；上層 `docs/superpowers/specs/2026-10-31-single-path-design.md`。

## Global Constraints

- 畫面不加字；泡泡只用既有符號。
- `npm run check` 仍剛好一解（規則表不動）。`npm run pace -- --check` 無 ⚠；壞結局終局 ≤ 16 s；一般劇本 ≤ 3.5 s、◆ ≤ 6 s、下限 2.5／4.5。
- `npm run shot` 在預算內（桌機 ≤ 250、手機 ≤ 150）；鼠群是一個 draw call。
- 註解繁體中文、標明「使用者 2026-11-06」。每個任務結束 `npm test` 全綠。

## Review Focus

1. 跳過／`?auto`／截圖的鼠災終態：老鼠撒滿島、島民躲在門裡、工作人員在巨蛋門口；RESET 後鼠群零件消失（舞台 reset）。
2. 命中（hit）結局的鼠災：101 彎了、老鼠照樣撒島；吹偏結局：池裡有隕石、溫泉客在池緣外、老鼠撒島——兩種都 ≤ 16 s。
3. 晶片 Lv7–8 期間隕石警告：沒有任何罩子（也沒有 `tower.shield` 鍵）；Lv9 的 standby 罩子與擋下照舊。
4. 木箱、鷹架在 101 被撞彎（hit）時：木箱留在原地、鷹架跟天線一樣拿掉（hit 的 view 早 return）。
5. 溫泉客的站位切到池緣後，名冊的「回日常」不會把他們走回池裡；RESET 後回到池裡。

---

### Task 1: R48 矽盾只在 Lv9——Lv7 木箱、Lv8 鷹架、拿掉試升

**Files:**
- Modify: `src/actors/tower.js`（天線／罩子門檻、`tower.scaffold`）、`src/actors/parts.js`（刪 `SHIELD_FAIL`、`failPose`、`shieldPose('test'|'fail')` 分支、`SHIELD_TEST_DUR`）、`src/actors/chip.js`（`chip.crates`、Lv8 劇本、刪 `shieldTest`）、`src/actors/finale.js`（警告刪 `shieldFail`／`FAIL_WAIT`）、`src/rules/spec.js`（`STORIES.grow.chip[7]`、`[8]`）
- Test: `test/tower.test.js`、`test/parts.test.js`、`test/chip.test.js`、`test/finale.test.js`

**Interfaces:**
- `tower.js view`：`tower.antenna` 只在 `lv.chip >= 9`；`tower.shield` 只有 `flags.missile === 'shield'` → `'full'`、否則 `lv.chip >= 9` → `'standby'`；`lv.chip === 8 && !hit` → `v['tower.scaffold'] = { kind: 'compound', at, footprint: false, parts: scaffoldParts(top) }`（塔頂下 0.6 一圈 torus 奶油色 scale 1.3、四根短柱 0.5 高、一支斜 0.9 長的吊臂）。
- `chip.js view`：`lv.chip >= 7 && lv.chip <= 8` → `v['chip.crates'] = { kind: 'compound', at: CRATES_AT（101 底座西南角外 0.3）, parts: 3 個 0.3 見方木箱（兩個並排、一個疊上）, footprint: { w: 0.7, d: 0.4 } }`；Lv9 起沒有（縮下去）。
- `chip.js script.grow[8]`：`[B.focus('home'), B.together([B.apply(e, { only: ['tower.scaffold'] }), B.gesture(eng(0), 'build', 1.0, { at: FOOT }), ...lookUp(B, TOWER, 1.2).look]), up.release, B.apply(e), B.levelUp('chip')]`（整段 ≤ 6 s、≥ 4.5 s 用 `B.focus('home', { hold })` 補）。Lv7 劇本不變（套用的零件多了木箱）。Lv9 劇本不變。
- `finale.js script.warning`：`fail` 永遠是 `[]`——直接刪掉 `shieldFail`、`FAIL_WAIT`、相關 import。
- `parts.js`：`shieldPose(state, t)` 只剩 `standby`／`full`；`shield` builder 的 `test()` 觸發只留給 `full`。
- `spec.js STORIES.grow.chip`：`7: '零件搭列車運到 101 腳下'`、`8: '101 頂上搭起鷹架'`。

- [ ] **Step 1: 失敗的測試**（各檔照既有寫法）

```js
// tower.test
test('R48: no antenna or shield before chip 9; chip 8 shows the scaffold; chip 9 has antenna + standby shield and no scaffold; the hit tower has neither', () => {
  for (const chip of [7, 8]) { const v = tower.view(lvOf(31, { chip, bulb: 5 }), { alarm: 1 }, { total: 31 }); assert.equal(v['tower.antenna'], undefined); assert.equal(v['tower.shield'], undefined); }
  assert.ok(tower.view(lvOf(31, { chip: 8, bulb: 5 }), {}, { total: 31 })['tower.scaffold']); assert.equal(tower.view(lvOf(31, { chip: 7, bulb: 5 }), {}, { total: 31 })['tower.scaffold'], undefined);
  const nine = tower.view(lvOf(31, { chip: 9, bulb: 5 }), {}, { total: 31 }); assert.ok(nine['tower.antenna']); assert.equal(nine['tower.shield'].state, 'standby'); assert.equal(nine['tower.scaffold'], undefined);
  assert.equal(tower.view(lvOf(31, { chip: 8, bulb: 5 }), { missile: 'hit' }, { total: 31 })['tower.scaffold'], undefined);
});
// chip.test
test('R48: chip 7–8 stack three crates at the foot of the 101; chip 9 removes them', () => { for (const n of [7, 8]) assert.equal(chip.view(lv({ chip: n, token: 7 }), {})['chip.crates'].parts.filter(p => p.kind === 'box').length, 3); assert.equal(chip.view(lv({ chip: 9, token: 7, typhoon: 3 }), {})['chip.crates'], undefined); });
// finale.test: the warning at chip 7 / 8 has no shieldFail beat and no tower.shield key in the stage after it; parts.test: shieldPose('test') / ('fail') throw or are gone
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/tower.test.js test/chip.test.js test/finale.test.js test/parts.test.js`　Expected: FAIL
- [ ] **Step 3: 實作**（刪掉的測試：既有的 shield test／fail／antenna-at-7 斷言改成新行為；`SHIELD_TEST_DUR` 的引用一併清掉）
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`、`npm run pace -- --check`　Expected: 全綠、無 ⚠（晶片 7–8 的警告變短）
- [ ] **Step 5: 截圖**　`node tools/shot.mjs 'chip7=auto=milk,baseball,token,bulb,chip,boba,typhoon&cam=chip' 'chip8=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat&cam=tower'`（木箱、鷹架；參數照 tools/shot.mjs 註解）
- [ ] **Step 6: Commit**　`git commit -am "feat(chip,tower,finale): R48 矽盾只在 Lv9——Lv7 木箱、Lv8 鷹架、警告不再試升"`

---

### Task 2: R49 溫泉客在吹偏的隕石前逃到池邊

**Files:**
- Modify: `src/actors/landmarks.js`（`BATHERS_OUT`、站位照 `flags.missile`）、`src/actors/finale.js`（deflect 劇本）
- Test: `test/landmarks.test.js`、`test/finale.test.js`

**Interfaces:**
- `landmarks.js`：`export const BATHER_FLEE = 1.1`；`BATHERS_OUT` = 池心往東（+x）`SOAK_R + BATHER_FLEE` 處兩點（z ±0.35，yaw 面向池心）；`view(lv, flags)` 的 `landmarks.bathers.home.spots` 在 `flags.missile === 'deflect'` 時用 `BATHERS_OUT`（y 是格面 `cellTop`），否則照舊。
- `finale.js` deflect 分支：`fly` 的 together 裡加 `later(FLIGHT, DEFLECT + 0.6, crowd(B, c => bathers(c).map((m, i) => B.together([B.walk(m, BATHERS_OUT[i], { speed: DASH }), B.bubble(m, '！', 0.6)]))))`（`bathers = c => c.roster.members('landmarks.bathers') ?? []`；DASH 4.5 從 beats 或本檔常數）；之後 `B.apply(e)`（套用新站位）再「？」「♪」；`B.home` 把他們放回池緣。整段 live 不超過現在的吹偏秒數 + 0.6。

- [ ] **Step 1: 失敗的測試**　landmarks.test：`view(lv, { missile: 'deflect' })['landmarks.bathers'].home.spots` 兩點離池心 = SOAK_R + BATHER_FLEE（水平）、yaw 面向池心；沒旗標時照舊在池裡。finale.test（吹偏 live，既有 helper）：隕石落進池子那一刻（t = FLIGHT + DEFLECT）兩位溫泉客離池心 ≥ SOAK_R + 0.8；結束時站在 `BATHERS_OUT`；整段 ≤ 既有上限。
- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/landmarks.test.js test/finale.test.js`　Expected: FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`、`npm run pace -- --check`　Expected: 全綠、無 ⚠
- [ ] **Step 5: Commit**　`git commit -am "feat(finale,landmarks): R49 吹偏的隕石掉進溫泉前溫泉客逃到池邊"`

---

### Task 3: R47 鼠災收尾：整島都是老鼠

**Files:**
- Modify: `src/rules/endings.js`（`BAD_EPILOGUES` 加 `'domeRats'`）、`src/actors/rat.js`（`rat.plague` 零件與 builder、`PLAGUE_N`、`plagueSpots`）、`src/actors/finale.js`（`domeRatsEpilogue`、`epilogue` 分派）、`test/helpers/endings.js`（`EXAMPLE.domeRats`）、`tools/pace.mjs`（路線）
- Test: `test/rat.test.js`、`test/finale.test.js`、`test/endings.test.js`、`test/budget.test.js`（若有 draw call 斷言）

**Interfaces:**
- `rat.js`：`export const PLAGUE_N = 48`；`export function plagueSpots(seed = 7)` → `PLAGUE_N` 個 `{ from: 巨蛋門口 GATE 周圍半徑 0.3–0.6 的點, to: 七個主格（MAIN_CELLS）地面的點（每格約 7 隻：半徑 0.6–2.0、固定種子亂數；離 101 底座中心 ≥ 1.2、離球場（棒球格心）≥ 1.0）, yaw, phase }`；`view` 在 `flags.epilogue === 'domeRats'` 時加 `v['rat.plague'] = { kind: 'plague', at: { x: 0, y: 0, z: 0 }, spots: plagueSpots(), footprint: false, shadow: false }`。
- builder `plague(THREE, spec, ctx)`：一個 `InstancedMesh`（幾何：身體橢球 0.16 × 0.1 × 0.22、頭球 0.08、尾巴細圓柱，合併；材質 `0x6b5b53` 黏土）；`object.userData.rush(dur)`：t 從 0 起，每隻位置 = from → to 的 smoothstep(t/dur)、朝向 = 前進方向；到了之後原地抖動（±0.15、各自相位、yaw 微轉）；建好即終態（全部在 to、抖動中）；`update(dt)` 推進；`dispose` 釋放。`?quality=low` 照畫。
- `finale.js`：`export function domeRatsEpilogue(e, ctx)`（≤ 5.5 s）：`[B.together([B.apply(e, { only: [] }), B.worldNow(), B.focus('baseball')]), B.together([B.apply(e, { only: ['rat.plague'] }), plagueRush(RUSH), crowd(B, c => pack(c).map((m, i) => rush(B, m, 門口外的點))), later(0.4, FOCUS_BEAT, B.focus('home')), crowd(B, c => islanders(c).map(m => hideBeat(B, m)))]), B.apply(e), B.focus('home', { hold: 1.0 })]`，其中 `plagueRush(dur)` 照 `spinUp` 的寫法（`start(c) { if (!c.instant) c.stage.partObject('rat.plague')?.userData.rush?.(dur); }`，`end` 跳到終態）。`epilogue(e, s, ctx)` 加 `if (e.ending === 'domeRats') return domeRatsEpilogue(e, ctx)`。
- `endings.js`：`BAD_EPILOGUES = [..., 'domeRats']`。`test/helpers/endings.js`：`domeRats: ['milk', 'baseball', 'token', 'bulb', 'chip', 'rat', 'boba', 'typhoon']`（吹偏）。`tools/pace.mjs`：壞結局路線加 `domeRats`。

- [ ] **Step 1: 失敗的測試**　rat.test：`plagueSpots()` 長度 PLAGUE_N、每個 `to` 在某個主格內（`cellAt`）、離 101 ≥ 1.2、離球場 ≥ 1.0、`from` 在門口附近；view 只在 `flags.epilogue === 'domeRats'` 有 `rat.plague`；builder：建好後 instance 0 在 `to`，`rush(1.2)` 後 0.3 s 在 from→to 之間、1.2 s 後在 `to`，`update` 不丟錯，draw call 1。finale.test：`BAD_EPILOGUES` 含 domeRats；EXAMPLE.domeRats 的 resolve 是 domeRats；live 收尾 ≤ 5.5 s、終局整段 ≤ 16 s、結束時島民 hidden（除了工作人員）、`rat.plague` 在舞台上；跳過（instant）終態相同。
- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/rat.test.js test/finale.test.js test/endings.test.js`　Expected: FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`、`npm run check`、`npm run pace -- --check`　Expected: 全綠、ok、無 ⚠（新路線終局 ≤ 16）
- [ ] **Step 5: 截圖**　`node tools/shot.mjs 'plague=auto=milk,baseball,token,bulb,chip,rat,boba,typhoon' 'phone-plague=auto=milk,baseball,token,bulb,chip,rat,boba,typhoon&quality=low'`　Expected: 整島老鼠、手機 ≤ 150；加進 `package.json` 的 `shot`。
- [ ] **Step 6: Commit**　`git commit -am "feat(rat,finale): R47 鼠災收尾——整島都是老鼠（InstancedMesh 鼠群）、島民躲進門"`

---

### Task 4: 文件與最終關卡

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-single-path-design.md`（§8 加 `- R47–R49（2026-11-06）：鼠災整島、矽盾只在真結局、溫泉客逃離——見 2026-11-06-plague-shield-design.md`）、`docs/superpowers/plans/README.md`（第 21 列）、`docs/superpowers/plans/solutions.md`（`npm run solutions`，結局不變但重產確認）

- [ ] **Step 1: 文件**
- [ ] **Step 2: 關卡**　Run: `npm test`、`npm run check`、`npm run pace -- --check`、`npm run shot`　Expected: 全綠、ok、無 ⚠、全部在預算內
- [ ] **Step 3: Commit**　`git commit -am "docs: 計畫 21 文件——設計 §8 R47–R49、README 第 21 列"`
