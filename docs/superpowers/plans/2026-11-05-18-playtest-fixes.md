# 試玩修正批次 18 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 老鼠咬過的牛奶停到老鼠搭車為止；電燈 Lv7 不搭車、風車島變風電場；停電的燈改成緩緩呼吸；後期劇本修剪到新上限（一般 ≤ 3.5 s、◆ ≤ 6 s）。

**Architecture:** 規則只動一條（`rat.fx[0]` 加 `bite: true`，引擎 `actionEvent` 立 `bitten_<target>`，之後走既有 `heldBy`）。其餘都在演出層：`satellites.js`（第三支風機、轉子加速）、`bulb.js`（Lv7 劇本重寫、`flickerLevel`）、`token.js`（支線只跟代幣走）、各物品劇本的秒數修剪、`test/helpers/show.js` 的上限。

**Tech Stack:** 純 ES module、node:test、three.js；關卡 `npm test`、`npm run check`、`npm run pace -- --check`、`npm run shot`。

**Spec:** `docs/superpowers/specs/2026-11-05-playtest-fixes-design.md`（R38–R41）；上層設計 `docs/superpowers/specs/2026-10-31-single-path-design.md`。

## Global Constraints

- 畫面上的字只有 LEVEL UP／LEVEL DOWN；不加任何新文字、泡泡只用既有符號。
- 唯一正解不變：`npm run check` 必須仍是「驗收：ok」（剛好一解）。
- `npm run pace -- --check` 無 ⚠；`npm run shot` 44 張都在預算內（桌機 ≤ 250、手機 ≤ 150 draw calls）。
- 每個任務結束時 `npm test` 全綠（1038 起，4 todo 是原本的）。
- 註解用繁體中文、照檔案既有風格（說明為什麼，標明「使用者 2026-11-05」）。
- 修剪劇本只縮停頓、加速走路、疊拍、拿掉重複平移；不砍 LEVEL UP、不砍因果動作本身。

## Review Focus

1. 牛奶被老鼠咬住（R38）之後，老鼠 Lv3 那一回合牛奶就該能長（同回合掃描順序鮮奶在老鼠前面：下一回合才長——引擎 `heldBy` 每次照當下狀態算，測試要釘這一點）。
2. 跳過／瞬間演完（`ctx.instant`、`?auto`、截圖）的風車島：轉子滿速、三支都在、燈塔亮；`spinUp` 只在 live 劇本那拍呼叫。
3. 停電呼吸燈在 `?quality=low`（亮的那份沒有發光材質）不丟錯。
4. 代幣 Lv7 在電燈 Lv7 之前／之後兩種順序都只鋪自己的支線、列車開去風車島（外星正解電燈 7 先到；賽博正解代幣 7 先到）。
5. 修剪後每段劇本的下限：一般 ≥ 2.5 s、◆ ≥ 4.5 s（太短會變成「閃一下就 LEVEL UP」）。

---

### Task 1: R38 老鼠咬過的牛奶停到老鼠搭車（規則）

**Files:**
- Modify: `src/rules/spec.js`（`rat.fx[0]`）、`src/rules/engine.js`（`actionEvent`）
- Modify: `docs/superpowers/plans/solutions.md`（`npm run solutions` 重產）
- Test: `test/engine.test.js`、`test/spec.test.js`、`test/endings.test.js`（若 EXAMPLE 結局變了才動 `test/helpers/endings.js`）

**Interfaces:**
- Produces: fx 事件多帶 `flag: { name: 'bitten_milk', value: 'rat' }`（同一個 delta 事件上）；state.flags.bitten_milk = 'rat'。
- Consumes: 既有 `heldBy(state, id)`（`engine.js:131`）、`rat.bite.while`（老鼠 Lv1–2）。

- [ ] **Step 1: 失敗的測試（engine.test.js）**

```js
test('R38: the rat placed on a crate/shop milk knocks it down AND bites it: milk is held until the rat boards the metro (Lv3)', () => {
  let s = createState(spec); s = place(s, 'milk', spec).state;            // milk 2 (crate → shop)
  const r = place(s, 'rat', spec); s = r.state;
  const fx = r.events.find(e => e.kind === 'fx' && e.cause === 'rat' && e.delta?.target === 'milk');
  assert.deepEqual(fx.delta, { target: 'milk', from: 2, to: 1 }); assert.deepEqual(fx.flag, { name: 'bitten_milk', value: 'rat' });
  assert.equal(s.flags.bitten_milk, 'rat');
  s = advance(s, spec).state; assert.equal(s.lv.milk, 1, 'held: no auto regrow to 2');
  assert.equal(advance(s, spec).events.find(e => e.kind === 'wait')?.waits.find(w => w.item === 'milk')?.for[0], 'rat');
  // 老鼠搭上捷運（Lv3）：下一回合牛奶就長
  s = { ...s, lv: { ...s.lv, rat: 3 } }; s = advance(s, spec).state; assert.equal(s.lv.milk, 2);
});
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/engine.test.js`　Expected: FAIL（`fx.flag` undefined、milk 回到 2）
- [ ] **Step 3: 實作**　`spec.js` `rat.fx[0]` 加 `bite: true`（註解：使用者 2026-11-05「牛奶被老鼠喝過後下回合會自己恢復不合理」）。`engine.js actionEvent`：delta 處理完、`a.lock` 之前加 `if (a.bite && ev.delta) { const name = \`bitten_${ev.delta.target}\`; s.flags[name] = cause; ev.flag = { name, value: cause }; }`。`spec.test.js` 加一行斷言 `ITEMS.rat.fx[0].bite === true`。
- [ ] **Step 4: 跑測試確認通過**　Run: `node --test test/engine.test.js test/spec.test.js`　Expected: PASS
- [ ] **Step 5: 關卡**　Run: `npm run check`　Expected: `驗收：ok`（剛好一解）。Run: `npm run solutions`；`npm test`。若 `test/endings.test.js`／`test/helpers/endings.js` 的 EXAMPLE 某條順序結局變了，用 solutions.md 的代表順序換成仍是該結局的（結局 id 不變，順序可變），並在註解標明 2026-11-05 R38。
- [ ] **Step 6: Commit**　`git add src/rules test docs/superpowers/plans/solutions.md && git commit -m "feat(rules): R38 老鼠咬過的牛奶停到老鼠搭上捷運（使用者：下回合自己恢復不合理）"`

---

### Task 2: R40 停電的燈緩緩呼吸

**Files:**
- Modify: `src/actors/bulb.js`（`flickerOn` → `flickerLevel`、`flicker` builder）
- Test: `test/bulb.test.js`（既有 flickerOn／flicker part 兩個測試改寫）

**Interfaces:**
- Produces: `export function flickerLevel(t, seed = 0)` → 0..1；`FLICKER_PERIOD = 7`、`FLICKER_UP = 0.5`、`FLICKER_DOWN = 0.7`、`FLICKER_GLOW` 不變（2.4）。
- `flicker` 零件：每幀 `level = flickerLevel(t, spec.seed)`；亮的那份 `visible = level > 0`，其每個材質 `emissiveIntensity = FLICKER_GLOW * level`。

- [ ] **Step 1: 失敗的測試**　把 `test('flickerOn: …')` 改成：

```js
test('flickerLevel: one soft breath per FLICKER_PERIOD (0.5 s up to 1, 0.7 s down to 0, smoothstep), off the rest of the time, seeds phase-shifted', () => {
  const { flickerLevel, FLICKER_PERIOD, FLICKER_UP, FLICKER_DOWN } = bulb;
  const samples = seed => Array.from({ length: 700 }, (_, i) => flickerLevel(i * 0.01, seed));
  const a = samples(0);
  assert.ok(a.every(v => v >= 0 && v <= 1)); assert.ok(Math.max(...a) > 0.99, 'peaks at 1'); assert.ok(a.filter(v => v === 0).length / a.length > 0.8, 'off > 80% of the period');
  assert.ok(a.every((v, i) => i === 0 || Math.abs(v - a[i - 1]) < 0.05), 'continuous (no strobe)');
  assert.ok(Math.abs(flickerLevel(FLICKER_UP, 0) - 1) < 1e-6 && flickerLevel(FLICKER_UP + FLICKER_DOWN, 0) < 1e-6);
  assert.notEqual(flickerLevel(0.25, 0), flickerLevel(0.25, 3), 'another seed breathes at another time');
  assert.equal(flickerLevel(FLICKER_PERIOD + 0.25, 0), flickerLevel(0.25, 0), 'periodic');
});
```

`flicker part` 測試：`lit.visible === (level > 0)`、`litMats.every(m => Math.abs(m.emissiveIntensity - bulb.FLICKER_GLOW * level) < 1e-6)` 逐幀（level = `bulb.flickerLevel(t, s.seed)`），「10 s 內至少呼吸一次」照舊。

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/bulb.test.js`　Expected: FAIL（flickerLevel 不存在）
- [ ] **Step 3: 實作**　`flickerLevel`：`u = ((t + seed * 1.3) mod P)`；`u < UP` → smoothstep(u / UP)；`u < UP + DOWN` → 1 − smoothstep((u − UP) / DOWN)；否則 0。builder 的 `update(dt, t)` 照 Interfaces；`?quality=low` 沒有材質時也不丟錯。拿掉 `flickerOn`。註解標明使用者 2026-11-05「畫面不要一直閃…閃現過於快速」。
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠
- [ ] **Step 5: Commit**　`git commit -am "fix(bulb): R40 停電的燈改成每 7 s 緩緩呼吸一次（使用者：閃現過於快速）"`

---

### Task 3: R39 電燈 Lv7 不搭車、風車島風電場

**Files:**
- Modify: `src/actors/satellites.js`（第三支風機、`blades` 的 `twins` 與 `spinUp`）、`src/actors/bulb.js`（Lv7 劇本重寫、刪 `enter`／`board`／`ride`／`trainLikely` 與只有它們用的常數）、`src/actors/token.js`（支線只跟代幣走、Lv7 分支簡化）
- Test: `test/satellites.test.js`、`test/bulb.test.js`（683–756、797、837、864 那幾個搭車測試換掉）、`test/token.test.js`

**Interfaces:**
- `satellites.js`：`export const TWIN2`（第三支的轉子相對主轉子）；`v['sat.windmill']` 從 `twin: TWIN` 改成 `twins: [TWIN, TWIN2]`（Lv bulb ≥ POWERED）；第三支塔身加進 `put('windmill', 0, …)`（東北側，塔高 1.0、轉子縮 0.7；不壓到電工的 wander 環、開關箱、電池屋——既有測試 651 的淨空把第三支塔也算進去）。
- `blades` 零件：`object.userData.spinUp(dur)` 把速率從 0 在 dur 秒內 smoothstep 到 1（`spin -= dt * spec.speed * rate`）；建好時 rate = 1（預熱、跳過、截圖都是滿速）。
- `bulb.js script.grow[7]`（`key: true` 不變）：`[B.focus(WIND, { zoom: ISLAND_ZOOM }), B.apply(e, { only: ['sat.windmill.stage1'] }), B.wait(0.4), B.together([B.apply(e, { only: ['sat.windmill'] }), spinUp(1.2)]), B.apply(e, { only: ['sat.lighthouse', 'sat.beam', 'sat.keeper', 'sat.lighthouse.stage1'] }), B.wait(0.3), B.levelUp('bulb'), B.focus('home')]`，其中 `spinUp(dur)` 是 `{ kind: 'spinUp', dur, start(c) { if (!c.instant) c.stage.partObject('sat.windmill')?.userData.spinUp?.(dur); } }`（照 finale.js `domeUp` 的寫法）。整段 live 4.5–6 s。
- `token.js`：view 裡 `else if (lv.bulb >= 7) v['token.spur.windmill'] = spur('windmill')` 刪掉（`token.spur.*` 只在 token ≥ 7）；Lv7 劇本 `dest` 固定 `'windmill'`、`had[...]` 分支拿掉，遊樂場支線照舊回全景時長。

- [ ] **Step 1: 失敗的測試**　(a) `satellites.test.js`：`sat.windmill` 在 bulb 7 有 `twins` 長度 2、`TWIN2` 在島的東北象限（x > 0、z < 0 相對島心）；建零件後 `object` 有三個轉子 pivot；`spinUp(1.2)` 後 0.3 s 的轉速 < 滿速的一半、1.2 s 後 = 滿速（比較 `rotor.rotation.z` 增量）。(b) `bulb.test.js`：Lv7 live（headless，`playItem`／`solo` 既有 helper）——鏡頭在風車島、沒有 `trainStop`／`board` 拍、`sat.windmill.stage1` 先於 `sat.windmill` 出現、結束時 `sat.lighthouse` 在、LEVEL UP 在電燈格、`show.elapsed` 在 [4.5, KEY_MAX]；電工整段都在島上（名冊成員位置離 `WIND` ≤ 島半徑）。(c) `token.test.js`：`view({ bulb: 7, token: 6 })` 沒有 `token.spur.windmill`；代幣 Lv7 在電燈 7 之後的順序（EXAMPLE.alien 那類）列車仍開去風車島。刪掉 683–756／837／864 的搭車測試。
- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/satellites.test.js test/bulb.test.js test/token.test.js`　Expected: FAIL
- [ ] **Step 3: 實作**（照 Interfaces；bulb.js 刪掉的 helper 與常數一併清掉，不留死碼；`token.js` 的「風車島支線已被電燈鋪好」註解更新）
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠。Run: `npm run pace -- --check`　Expected: ok、無 ⚠（bulb→7／→8 ◆ 在 6 s 內）
- [ ] **Step 5: 截圖**　`node tools/shot.mjs 'wide-windfarm=auto=milk,baseball,token,bulb,chip,boba,typhoon&cam=…'`（風車島拉近；參數照 tools/shot.mjs 註解）看三支風機、燈塔亮。
- [ ] **Step 6: Commit**　`git commit -am "feat(bulb,satellites,token): R39 電燈 Lv7 不搭車，風車島變風電場（三支風機轉起來、燈塔亮）"`

---

### Task 4: R41 新上限與後期劇本修剪

**Files:**
- Modify: `test/helpers/show.js`（`SCRIPT_MAX 3.5`、`KEY_MAX 6`、`SCRIPT_EXCEPT = { 'bulb 2': 4.5 }`）、`tools/pace.mjs`（註解；fx 事件的例外鍵 `${item} fx`）、`src/show/turn.js`（`LOCK_HOLD 1.5`）
- Modify: `src/actors/{milk,chip,bulb,token,baseball,boba,rat}.js`（各段劇本）
- Test: `test/{milk,chip,bulb,token,baseball,boba,rat,typhoon,turn}.test.js`（下限：一般 `>= 2.5`、◆ `elapsed >= 4.5`；chip 7 的公式改成 `KEY_MAX`；`turn.test.js:410` LOCK_HOLD 1.5）

**Interfaces:**
- Consumes: 每段的具體刪法在 `<workspace>/trim-recon.md`（協調者放進工作區；逐段：拍的組成、要改的常數／行、預期秒數）。
- 例外表只剩 `'bulb 2': 4.5`；若 cartBlown 的鎖住 fx 真的塞不進 3.5，加 `'boba fx': 4.0`（pace.mjs 與 test/helpers 的鍵改成 `e.kind === 'fx' ? \`${e.item} fx\` : …`）並在 ledger 記裁決。

- [ ] **Step 1: 先改上限與下限（測試先紅）**　改 `test/helpers/show.js` 與各測試的下限／公式；Run: `npm test`　Expected: 多個 FAIL（超過新上限的劇本）
- [ ] **Step 2: 逐段修剪**　照 trim-recon.md 的「Cut」逐段改；每改完一個物品跑 `node --test test/<item>.test.js`。順序：milk、chip、bulb（2、4）、token（placed、3、5、6、7、9）、baseball（placed、4、5、6、8）、boba（placed）、rat（placed、fx、4）、typhoon 鎖住（LOCK_HOLD）。
- [ ] **Step 3: 量**　Run: `npm run pace -- --verbose > /tmp/pv.log; npm run pace -- --check`　Expected: 節奏 ok、無 ⚠；正解第 8 回合 ≤ 41 s、最後一輪 ≤ 38 s（各省 ≥ 8 s）。超過的再修那一段。
- [ ] **Step 4: 全部關卡**　Run: `npm test`（全綠）、`npm run check`（ok）
- [ ] **Step 5: Commit**　`git commit -am "perf(show): R41 後期劇本修剪——一般 ≤ 3.5 s、◆ ≤ 6 s（使用者：後期動畫偏長）"`

---

### Task 5: 文件與最終關卡

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-single-path-design.md`（§8 加 R38–R41 一行指到本批設計）、`docs/superpowers/plans/README.md`（第 18 列）、`src/actors/finale.js` 頭註（若 R39 影響）

- [ ] **Step 1: 文件**　§8 加：`- R38–R41（2026-11-05）：試玩修正批次——見 2026-11-05-playtest-fixes-design.md`；README 表加第 18 列（計畫檔、內容一句、狀態）。
- [ ] **Step 2: 關卡**　Run: `npm test`、`npm run check`、`npm run pace -- --check`、`npm run shot`　Expected: 全綠、ok、無 ⚠、44 張在預算內（印出最大 draw call）。
- [ ] **Step 3: Commit**　`git commit -am "docs: 計畫 18 文件——設計 §8 R38–R41、README 第 18 列"`
