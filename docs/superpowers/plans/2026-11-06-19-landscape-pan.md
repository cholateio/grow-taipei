# 手機橫版側欄與終局自由鏡頭 實作計畫（計畫 19）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手機橫版時物品列變成右側直排側欄、島往左置中；遊戲結束後才開放限在島上的鏡頭平移，跳過鍵變成隱藏／顯示選單鍵。

**Architecture:** 純介面與鏡頭層：`src/ui/ui.css`（橫版媒體查詢）、`src/scene/camera.js`（`setInset` view offset、`setFree` 平移夾住）、`src/app.js`（量側欄寬、結束／重玩時切換）、`src/ui/slots.js`（`setMode`、收合、圓鍵）、`src/ui/icons.js`（隱藏／顯示圖示）、`tools/shot.mjs`＋`package.json`（`land` 尺寸與兩張截圖）。規則、演出劇本、求解器不動。

**Tech Stack:** 純 ES module、three.js OrbitControls（vendor）、node:test＋fakedom、headless Chromium 截圖。

**Spec:** `docs/superpowers/specs/2026-11-06-landscape-pan-design.md`（R42、R43）；上層 `docs/superpowers/specs/2026-10-31-single-path-design.md`。

## Global Constraints

- 畫面上不加任何文字；新按鍵只有圖示＋`aria-label`／`title`。
- 直版、桌機的版面不變（既有 ui.test 的 CSS 斷言要照舊通過）。
- `npm test` 全綠、`npm run check` ok、`npm run pace -- --check` 無 ⚠、`npm run shot` 全部在預算內（手機 ≤ 150、桌機 ≤ 250）。
- 註解繁體中文、標明「使用者 2026-11-06」。
- 每個任務結束時 `npm test` 全綠。

## Review Focus

1. 橫版側欄在 740 × 360 的舊手機不碰頂欄（頂欄底 58 px）也不超出底邊；`safe-area-inset-right` 有值時側欄不貼到瀏海。
2. `setViewOffset` 開著時 LEVEL UP、泡泡、天際線（`setSkyline` 的 NDC y ≤ 0.8）仍對得上；轉回直版時 offset 清掉（`clearViewOffset`）。
3. 平移夾住：注視點被拉回圓內時鏡頭位置同向跟著移（視角不變、不會突然轉向）；結束前 `enablePan` 一定是 false，RESET 後也是。
4. 隱藏選單後的圓鍵在橫版貼右緣、直版／桌機貼下緣，不蓋到 RESET；reduced-motion 不滑動、直接消失／出現。
5. `?auto`／截圖（瞬間演完）的結束狀態：模式切成 hide、RESET 發亮、平移開放——`land-end` 截圖看得到側欄。

---

### Task 1: R42 橫版側欄（CSS）＋截圖尺寸

**Files:**
- Modify: `src/ui/ui.css`（橫版媒體查詢）、`tools/shot.mjs`（`sizeOf` 加 `land` → `844,390`）、`package.json`（`shot` 加 `land-live=…&live=1&warp=…&quality=low`、`land-end=auto=<正解順序>&quality=low`，照 `phone-live`／`phone-end` 的參數）
- Test: `test/ui.test.js`

**Interfaces:**
- Produces: `.slots` 在 `@media (orientation: landscape) and (max-height: 520px)` 下：`right: max(12px, env(safe-area-inset-right))`、`left: auto`、`bottom: auto`、`top: calc(50% + 28px)`、`transform: translateY(-50%)`、`grid-template-columns: repeat(2, 48px)`、`gap: 6px`、`padding: 10px`；`.slot { width: 48px; height: 48px; padding: 4px }`、`.slot svg { width: 28px; height: 28px }`、`.slot .name { display: none }`；`.skip { grid-column: 1 / span 2; grid-row: 5; width: auto; height: 40px }`。
- 寬 122 px、高 ≤ 300 px（4 × 48 + 3 × 6 + 6 + 40 + 20）。

- [ ] **Step 1: 失敗的測試（ui.test.js，照既有「ui.css: the skip cell…」測試的寫法讀 CSS 文字）**

```js
test('ui.css: phone landscape (orientation landscape, max-height 520) turns the item bar into a right-hand rail: two 48px columns, icon-only cells, the skip cell spanning both columns in row 5; top offset clears the top bar', async () => {
  const css = await readFile(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 520px)'));
  for (const rule of ['right: max(12px, env(safe-area-inset-right))', 'left: auto', 'bottom: auto', 'top: calc(50% + 28px)', 'translateY(-50%)', 'repeat(2, 48px)', '.slot .name { display: none; }', 'grid-column: 1 / span 2', 'grid-row: 5']) assert.ok(block.includes(rule), rule);
});
test('npm run shot includes land-live and land-end at 844×390 (phone landscape, quality low)', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')), shot = await readFile(new URL('../tools/shot.mjs', import.meta.url), 'utf8');
  assert.ok(/\bland-live=[^ ]*quality=low/.test(pkg.scripts.shot) && /\bland-end=[^ ]*quality=low/.test(pkg.scripts.shot));
  assert.ok(shot.includes("name.includes('land') ? '844,390'"));
});
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/ui.test.js`　Expected: FAIL（找不到媒體查詢／截圖名）
- [ ] **Step 3: 實作**　CSS 照 Interfaces（放在檔尾、註解說明使用者 2026-11-06 的截圖；`sizeOf` 的 `land` 判斷要放在 `phone` 之前以免名稱互相干擾——名稱不含 phone 即可）。`package.json` 的 warp 數值照 `phone-live` 的。
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠。Run: `node tools/shot.mjs 'land-end=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat&quality=low'`　Expected: 截圖成功、draw call ≤ 150；看 `shots/land-end.png`：側欄在右、兩欄四列、跳過鍵在底。
- [ ] **Step 5: Commit**　`git commit -am "feat(ui): R42 手機橫版物品列改成右側直排側欄；截圖加 land 844×390"`

---

### Task 2: R42 鏡頭 inset（島往左置中）

**Files:**
- Modify: `src/scene/camera.js`（`setInset`）、`src/app.js`（`fit` 量側欄、`rig.setInset`）
- Test: `test/camera.test.js`

**Interfaces:**
- Produces: `rig.setInset({ right = 0 } = {})`：記下 `inset`；`right > 0` → `camera.setViewOffset(w, h, right / 2, 0, w, h)`（w、h 是 `fit(aspect, { width, height })` 傳進來的像素；`fit` 簽名加第二個參數 `{ width, height }`，沒給就用 `inset` 需要的最後一組，單元測試可給 1000 × 500），`right === 0` → `camera.clearViewOffset()`。`fit` 之後重套（換向時 app 會先 `fit` 再 `setInset`，順序無關）。
- Consumes: `app.js fit()`（line ≈107）在 `view.resize()` 後：`const rail = matchMedia('(orientation: landscape) and (max-height: 520px)').matches ? document.querySelector('.slots')?.getBoundingClientRect().width + 12 : 0; rig.fit(innerWidth / innerHeight, { width: innerWidth, height: innerHeight }); rig.setInset({ right: rail })`（`.slots` 可能還沒建：`?? 0`）。

- [ ] **Step 1: 失敗的測試**

```js
test('setInset({ right }) shifts the view by half the rail (camera.setViewOffset(w, h, right/2, 0, w, h)); right 0 clears it; fit keeps it', () => {
  const { camera, rig } = setup();   // 既有 helper；camera 是真的 THREE.PerspectiveCamera
  rig.fit(2, { width: 1000, height: 500 }); rig.setInset({ right: 122 });
  assert.equal(camera.view?.enabled, true); assert.equal(camera.view.offsetX, 61); assert.equal(camera.view.fullWidth, 1000); assert.equal(camera.view.fullHeight, 500);
  rig.fit(2, { width: 800, height: 400 }); assert.equal(camera.view.fullWidth, 800); assert.equal(camera.view.offsetX, 61, 'inset survives a resize');
  rig.setInset({ right: 0 }); assert.ok(!camera.view?.enabled);
  // 側欄開著時島心（home）投影到左側那塊的正中：NDC x ≈ −(61 / 800)·2 = −0.1525（整個畫面的座標），即剩下那塊的中心
  rig.setInset({ right: 122 }); rig.home(0);
  const p = new THREE.Vector3(0.4, 0.6, 0).project(camera); assert.ok(Math.abs(p.x - (-0.1525)) < 0.02, `home NDC x ${p.x.toFixed(3)}`);
});
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/camera.test.js`　Expected: FAIL（setInset 不存在）
- [ ] **Step 3: 實作**（camera.js：`inset` 狀態、`apply()` 在 `fit` 與 `setInset` 都呼叫；app.js：`fit()` 加量測；`orientationchange`／`resize` 已經接 `fit`）
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠。Run: `node tools/shot.mjs 'land-end=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat&quality=low'`　Expected: 島在側欄左邊那塊置中（看截圖）。
- [ ] **Step 5: Commit**　`git commit -am "feat(camera): R42 橫版側欄時鏡頭 view offset，島在剩下的畫面置中"`

---

### Task 3: R43 終局之後開放平移（限在島上）

**Files:**
- Modify: `src/scene/camera.js`（`setFree`、每幀夾住）、`src/app.js`（`onFinished`／`restart` 切換；每幀 `rig.update()` 若還沒有）
- Test: `test/camera.test.js`

**Interfaces:**
- Produces: `rig.setFree(flag, { radius = FREE_RADIUS } = {})`（`export const FREE_RADIUS = 9`）：`controls.enablePan = !!flag`、`controls.screenSpacePanning = false`；`rig.clamp()`（app 每幀在 `controls.update()` 前呼叫，或接在既有的 rig 更新裡）：free 時若 `controls.target` 與 `home` 的水平距離 > radius，把 target 拉回圓周上、`camera.position` 加上同一個位移向量，`target.y = home.y`；非 free 時不做事。`rig.free` getter。
- Consumes: `app.js` `onFinished: () => { topBar.setFinished(true); rig.setFree(true); }`、`restart()` 裡 `rig.setFree(false)` 在 `rig.home(0)` 之前。

- [ ] **Step 1: 失敗的測試**

```js
test('setFree(true) enables ground-plane panning; clamp pulls the target back inside FREE_RADIUS of home moving the camera by the same vector; setFree(false) disables panning and clamp does nothing', () => {
  const { camera, controls, rig } = setup();
  assert.equal(controls.enablePan, false);
  rig.setFree(true); assert.equal(controls.enablePan, true); assert.equal(controls.screenSpacePanning, false); assert.equal(rig.free, true);
  rig.home(0); const before = camera.position.clone().sub(controls.target);
  controls.target.set(0.4 + FREE_RADIUS + 5, 0.6, 0); camera.position.add(new THREE.Vector3(FREE_RADIUS + 5, 0, 0));
  rig.clamp();
  assert.ok(Math.abs(Math.hypot(controls.target.x - 0.4, controls.target.z) - FREE_RADIUS) < 1e-6, 'on the circle');
  assert.equal(controls.target.y, 0.6); assert.ok(camera.position.clone().sub(controls.target).distanceTo(before) < 1e-6, 'viewing vector unchanged');
  rig.setFree(false); assert.equal(controls.enablePan, false);
  controls.target.set(50, 0.6, 0); rig.clamp(); assert.equal(controls.target.x, 50, 'not free: untouched');
});
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/camera.test.js`　Expected: FAIL
- [ ] **Step 3: 實作**（camera.js；app.js 的接線；既有 `pointerdown → rig.cancel()` 照舊）
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠
- [ ] **Step 5: Commit**　`git commit -am "feat(camera): R43 遊戲結束後才開放平移，注視點鎖在島上"`

---

### Task 4: R43 跳過鍵變隱藏／顯示選單鍵

**Files:**
- Modify: `src/ui/slots.js`（`setMode`、`collapsed`、`.menu-tab`）、`src/ui/icons.js`（`HIDE_ICON`：雙箭頭朝下；側欄時 CSS 旋轉成朝右）、`src/ui/ui.css`（`.slots.collapsed`、`.menu-tab`、橫版位置、reduced-motion）、`src/app.js`（`onFinished` → `slots.setMode('hide')`；`restart` → `setMode('skip')`）
- Test: `test/ui.test.js`

**Interfaces:**
- Produces: `slots.setMode(mode)`：`'skip'`（預設）跳過鍵照舊；`'hide'` → 跳過鍵 `innerHTML = HIDE_ICON`、`aria-label`／`title`「隱藏選單」、`disabled = false`、按下 → `nav.classList.add('collapsed')` 並顯示 `.menu-tab`（`button`，`HIDE_ICON` 反向、`aria-label`「顯示選單」），按圓鍵 → 移除 `collapsed`、藏圓鍵。`reset()` 回 `'skip'`、展開。`setSkippable` 在 hide 模式不動按鍵。
- CSS：`.slots.collapsed { transform: translate(-50%, calc(100% + 40px)); }`（橫版：`translate(calc(100% + 40px), -50%)`）、`transition: transform .3s`（`prefers-reduced-motion: reduce` 無 transition）；`.menu-tab { position: fixed; width: 44px; height: 44px; border-radius: 22px; bottom: max(14px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); display: none; }`、`.menu-tab.on { display: grid; place-items: center; }`；橫版：`right: max(12px, env(safe-area-inset-right)); left: auto; top: 50%; transform: translateY(-50%)`、圖示旋轉 −90°。

- [ ] **Step 1: 失敗的測試**（ui.test.js，照既有 skip 測試用 fakedom 建 slots）

```js
test('setMode("hide") turns the skip cell into a hide-menu button; pressing it collapses the bar and shows the menu tab; the tab restores it; reset returns to skip mode', async () => {
  const { nav, skip, slots, root } = await makeSlots();   // 既有 helper 或照 'the skip button is the last cell' 測試建
  slots.setMode('hide');
  assert.equal(skip.getAttribute('aria-label'), '隱藏選單'); assert.equal(skip.disabled, false); assert.ok(skip.innerHTML.includes('<svg'));
  skip.click(); assert.ok(nav.classList.contains('collapsed'));
  const tab = root.querySelector('.menu-tab'); assert.ok(tab && tab.classList.contains('on')); assert.equal(tab.getAttribute('aria-label'), '顯示選單');
  tab.click(); assert.ok(!nav.classList.contains('collapsed')); assert.ok(!tab.classList.contains('on'));
  slots.setSkippable(true); assert.equal(skip.getAttribute('aria-label'), '隱藏選單', 'hide mode ignores setSkippable');
  slots.reset(); assert.equal(skip.getAttribute('aria-label'), '跳過'); assert.ok(!nav.classList.contains('collapsed'));
});
test('ui.css: collapsed bar slides off-screen (down; right in landscape), the menu tab is a 44px round button at the same edge, no slide under reduced motion', async () => { /* 讀 CSS 文字釘上面 Interfaces 的規則 */ });
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/ui.test.js`　Expected: FAIL（setMode 不存在）
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠。Run: `node tools/shot.mjs 'end=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat' 'land-end=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat&quality=low'`　Expected: 結束狀態跳過鍵顯示隱藏圖示。
- [ ] **Step 5: Commit**　`git commit -am "feat(ui): R43 遊戲結束後跳過鍵變隱藏選單鍵，收起後邊緣一顆顯示選單圓鍵"`

---

### Task 5: 文件與最終關卡

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-single-path-design.md`（§8 加 `- R42–R43（2026-11-06）：手機橫版側欄、終局後才可平移——見 2026-11-06-landscape-pan-design.md`）、`docs/superpowers/plans/README.md`（第 19 列）

- [ ] **Step 1: 文件**
- [ ] **Step 2: 關卡**　Run: `npm test`、`npm run check`、`npm run pace -- --check`、`npm run shot`　Expected: 全綠、ok、無 ⚠、全部在預算內（含 `land-live`、`land-end` ≤ 150）
- [ ] **Step 3: Commit**　`git commit -am "docs: 計畫 19 文件——設計 §8 R42–R43、README 第 19 列"`
