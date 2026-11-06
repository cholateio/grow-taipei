# 放置順序編號、結局圖鑑、側欄小瑕疵 實作計畫（計畫 20）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 物品格顯示這局的放置順序 1–8；「怎麼玩」卡片下方多一塊結局圖鑑（看過的點亮、記在 localStorage）；側欄只在收合時才滑動、隱藏選單鍵改奶油色。

**Architecture:** 純介面層：`src/ui/slots.js`（編號、`sliding`）、`src/ui/icons.js`（11 個結局圖示＋問號）、`src/ui/cards.js`（圖鑑）、`src/ui/ui.css`、`src/app.js`（記錄看過的結局、把表交給卡片）。規則、演出、鏡頭不動。

**Tech Stack:** 純 ES module、node:test＋fakedom、headless 截圖。

**Spec:** `docs/superpowers/specs/2026-11-06-order-gallery-design.md`（R44–R46）。

## Global Constraints

- 場景裡不加字；新文字只在卡片內（結局名稱、計數）與格子上的數字。
- 直版、桌機、橫版三種版面都要放得下（側欄 48 與 36 格的編號各自縮小）。
- `npm test` 全綠、`npm run check` ok、`npm run pace -- --check` 無 ⚠、`npm run shot` 在預算內。
- 註解繁體中文、標明「使用者 2026-11-06」。每個任務結束 `npm test` 全綠。

## Review Focus

1. `reset()` 之後編號全部消失、下一局從 1 重新數；`?auto` 瞬間放完也有 1–8。
2. 圖鑑在 360 寬直版手機放得下（卡片 `max-height: calc(100vh - 32px)`、內容可捲動），「開始」鍵仍看得到。
3. localStorage 被封鎖（隱私模式）時：圖鑑全是問號、記錄不丟例外、遊戲照常。
4. 看過的結局 id 不在 `ENDINGS` 裡（舊版本的鍵、手改的值）→ 忽略，不畫壞磚。
5. `sliding` 類別在 `transitionend` 沒來（reduced-motion、fakedom）時也會被 350 ms 的保險拿掉；旋轉時沒有 transition。

---

### Task 1: R44 放置順序編號

**Files:**
- Modify: `src/ui/slots.js`、`src/ui/ui.css`
- Test: `test/ui.test.js`

**Interfaces:**
- Produces: 每格多一個 `<i class="n"></i>`（空的不顯示：`.n:empty { display: none }`）；`setPlaced(id)` 第 k 次呼叫把那格的 `.n` 設成 `String(k)`（從 1 起）；`reset()` 清空所有 `.n` 並把計數歸零。
- CSS：`.slot .n { position: absolute; top: -6px; left: -6px; width: 18px; height: 18px; border-radius: 9px; background: var(--ink); color: #fff; font: 900 11px/18px sans-serif; text-align: center; font-style: normal; }`；橫版 520 區塊 `16px`／字 10px、340 區塊 `14px`／字 9px。

- [ ] **Step 1: 失敗的測試（ui.test.js，用既有的 slots 建法）**

```js
test('setPlaced numbers the cell with the order it was placed (1…8); reset clears the numbers and restarts the count', async () => {
  const { slots, nav } = await makeSlots();   // 既有 helper（Task 4 計畫 19 建的）或照 skip 測試建
  const n = id => nav.querySelector(`[data-id=${id}] .n`).textContent;
  slots.setPlaced('milk'); slots.setPlaced('rat'); assert.equal(n('milk'), '1'); assert.equal(n('rat'), '2'); assert.equal(n('chip'), '');
  slots.reset(); assert.equal(n('milk'), ''); slots.setPlaced('chip'); assert.equal(n('chip'), '1');
});
test('ui.css: the order badge is an 18px ink circle top-left of the cell, 16px in the landscape rail and 14px in the short rail; empty badges are hidden', async () => { /* 讀 CSS 文字釘 Interfaces 的規則 */ });
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/ui.test.js`　Expected: FAIL（`.n` 不存在）
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠。Run: `node tools/shot.mjs 'end=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat' 'land-end=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat&quality=low'`　Expected: 格子左上有 1–8。
- [ ] **Step 5: Commit**　`git commit -am "feat(ui): R44 物品格顯示這局的放置順序 1–8"`

---

### Task 2: R45 結局圖鑑

**Files:**
- Modify: `src/ui/icons.js`（`ENDING_ICONS`、`UNKNOWN_ICON`）、`src/ui/cards.js`（`showHowTo` 的圖鑑）、`src/ui/ui.css`（`.endings`、`.ending`、`.unknown`、`.true`、卡片可捲動）、`src/app.js`（記錄、傳表）
- Test: `test/ui.test.js`

**Interfaces:**
- `icons.js`：`export const ENDING_ICONS = { cyber, alien, blackout, flood, domeFlood, cartBlown, domeRats, shieldDown, typhoonDeflect, milkExpired, tryAgain }`（鍵 = `Object.keys(ENDINGS)`，每個都是 `svg(...)` 的 64 viewBox 線條圖示，題材照設計 R45）；`export const UNKNOWN_ICON`（圓圈裡一個問號，同風格）。
- `cards.js`：`showHowTo(root, { onClose, endings, seen = [] })`——`endings` 有給才畫 `.endings`：`<div class="endings"><p class="eyebrow"><span class="seen">k</span> / <span class="total">n</span></p><div class="grid">…</div></div>`，磚 `<div class="ending" data-id="…">` 含 `<span class="icon">svg</span><span class="title">名稱</span>`；看過 → 圖示＋名稱；沒看過 → 加 `.unknown`、圖示 `UNKNOWN_ICON`、名稱空；`cyber` 磚加 `.true`。順序：`cyber` 第一、其餘照 `endings` 物件順序、`tryAgain` 最後。`seen` 裡不在 `endings` 的 id 忽略。
- `app.js`：`const SEEN_KEY = 'grow-taipei:endings'`；`seenEndings()` 讀 `storageGet` → JSON 陣列（壞 JSON → `[]`）；`onFinished(ending)` → `storageSet(SEEN_KEY, JSON.stringify([...new Set([...seenEndings(), ending.id])]))`；`howTo()` 傳 `{ endings: ENDINGS, seen: seenEndings() }`（`ENDINGS` 從 `./rules/endings.js` 匯入）。
- CSS：`.card { max-height: calc(100vh - 32px); overflow: auto; }`；`.endings { border-top: 1.5px solid var(--line); padding-top: 12px; margin-bottom: 14px; }`；`.endings .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }`；`.ending { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; border-radius: 10px; background: #fff; box-shadow: inset 0 0 0 1.5px var(--line); }`；`.ending svg { width: 32px; height: 32px; }`；`.ending .title { font-size: 11px; font-weight: 700; min-height: 1.4em; }`；`.ending.unknown { background: #f1e9e2; }`；`.ending.true { box-shadow: inset 0 0 0 2px var(--yellow); }`。

- [ ] **Step 1: 失敗的測試**

```js
test('ENDING_ICONS has one shared-style icon per ending id, plus UNKNOWN_ICON', async () => {
  const { ENDINGS } = await import('../src/rules/endings.js'); const { ENDING_ICONS, UNKNOWN_ICON } = await import('../src/ui/icons.js');
  assert.deepEqual(Object.keys(ENDING_ICONS).sort(), Object.keys(ENDINGS).sort());
  for (const s of [...Object.values(ENDING_ICONS), UNKNOWN_ICON]) assert.ok(s.startsWith('<svg viewBox="0 0 64 64"') && s.includes('stroke="#211d1d"'));
});
test('the how-to card draws the ending gallery: cyber first (true ring), tryAgain last, seen endings get their icon and title, unseen are unknown tiles without a title; the count reads seen / total; unknown ids are ignored; no endings → no gallery', async () => {
  installFakeDom(); const { showHowTo } = await import('../src/ui/cards.js'); const { ENDINGS } = await import('../src/rules/endings.js');
  const root = document.createElement('div');
  const el = showHowTo(root, { onClose() {}, endings: ENDINGS, seen: ['flood', 'bogus'] });
  const tiles = [...el.querySelectorAll('.ending')]; assert.equal(tiles.length, Object.keys(ENDINGS).length);
  assert.equal(tiles[0].dataset.id, 'cyber'); assert.ok(tiles[0].classList.contains('true')); assert.equal(tiles.at(-1).dataset.id, 'tryAgain');
  const flood = tiles.find(t => t.dataset.id === 'flood'); assert.ok(!flood.classList.contains('unknown')); assert.equal(flood.querySelector('.title').textContent, '捷運淹水');
  assert.ok(tiles[0].classList.contains('unknown')); assert.equal(tiles[0].querySelector('.title').textContent, '');
  assert.equal(el.querySelector('.seen').textContent, '1'); assert.equal(el.querySelector('.total').textContent, String(tiles.length));
  assert.equal(showHowTo(root, { onClose() {} }).querySelector('.endings'), null);
});
```

（app.js 的記錄：`test/boot.test.js` 以正則釘 `onFinished` 裡有 `storageSet(SEEN_KEY` 與 `howTo` 傳 `seen: seenEndings()`。）

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/ui.test.js test/boot.test.js`　Expected: FAIL
- [ ] **Step 3: 實作**（圖示由實作者畫，題材照設計；fakedom 的 `querySelectorAll`／`dataset`／`classList` 若缺就補最小實作）
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠。截圖：`node tools/shot.mjs 'howto=&card=howto'`——若 shot.mjs 沒有打開卡片的參數，加一個除錯參數 `?card=howto`（app.js：有這個參數就 `howTo()`，忽略 localStorage）並寫進 shot.mjs 註解；看圖鑑版面；再拍 `phone360-howto=card=howto`（360 寬直版放得下、可捲動）。
- [ ] **Step 5: Commit**　`git commit -am "feat(ui): R45 結局圖鑑——怎麼玩卡片下方，看過的點亮、記在 localStorage"`

---

### Task 3: R46 側欄只在收合時滑動、隱藏鍵改奶油色

**Files:**
- Modify: `src/ui/slots.js`、`src/ui/ui.css`
- Test: `test/ui.test.js`

**Interfaces:**
- `slots.js`：`collapse()`／`expand()` 在切換 `collapsed` 之前 `nav.classList.add('sliding')`，`transitionend`（一次）或 350 ms 的 `setTimeout` 保險後移除。
- CSS：`.slots` 本身沒有 `transition`；`.slots.sliding { transition: transform .3s; }`；`@media (prefers-reduced-motion: reduce) { .slots.sliding { transition: none; } }`；`.skip.hide:not(:disabled) { background: var(--cream); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line); }`（圖示墨黑）。

- [ ] **Step 1: 失敗的測試**

```js
test('collapse/expand add .sliding for the slide and drop it after transitionend or 350 ms; the bar itself has no permanent transition; the hide cell is cream, not coral', async () => {
  const css = await readFile(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
  assert.ok(!/\.slots\s*\{[^}]*transition/.test(css)); assert.ok(css.includes('.slots.sliding { transition: transform .3s; }'));
  assert.ok(css.includes('.skip.hide:not(:disabled) { background: var(--cream)'));
  const { slots, nav, skip } = await makeSlots(); slots.setMode('hide'); skip.listeners.click();
  assert.ok(nav.classList.contains('sliding') && nav.classList.contains('collapsed'));
  await new Promise(r => setTimeout(r, 400)); assert.ok(!nav.classList.contains('sliding'), 'safety timer');
});
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `node --test test/ui.test.js`　Expected: FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑測試確認通過**　Run: `npm test`　Expected: 全綠
- [ ] **Step 5: Commit**　`git commit -am "fix(ui): R46 側欄只在收合時滑動；隱藏選單鍵改奶油色"`

---

### Task 4: 文件與最終關卡

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-single-path-design.md`（§8 加 `- R44–R46（2026-11-06）：放置順序編號、結局圖鑑、側欄小瑕疵——見 2026-11-06-order-gallery-design.md`）、`docs/superpowers/plans/README.md`（第 20 列）、`package.json`（`shot` 加 `howto=card=howto`、`phone360-howto=card=howto`）

- [ ] **Step 1: 文件與截圖清單**
- [ ] **Step 2: 關卡**　Run: `npm test`、`npm run check`、`npm run pace -- --check`、`npm run shot`　Expected: 全綠、ok、無 ⚠、全部在預算內
- [ ] **Step 3: Commit**　`git commit -am "docs: 計畫 20 文件——設計 §8 R44–R46、README 第 20 列、截圖加 howto"`
