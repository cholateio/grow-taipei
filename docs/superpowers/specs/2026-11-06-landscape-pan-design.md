# 手機橫版側欄與終局自由鏡頭（2026-11-06）設計

使用者 2026-11-06 試玩手機版截圖：「手機橫版的畫面下方選單列會壓縮到畫面空間，有好的改法嗎？並且手機只能定點縮放？」
決定：橫版改成右側直排側欄、鏡頭把島往左偏；鏡頭平移開放但限在島上、而且只有最終回合全部動畫演完後才可以（這時選單的跳過鍵改成隱藏選單鍵）。

接在 `2026-10-31-single-path-design.md` §8 R41 之後，記成 R42、R43。純介面與鏡頭，規則、演出劇本不動。

## 現況

- 物品列 `.slots` 固定在畫面下方正中（桌機一排 8 格＋跳過鍵；≤ 660 px 寬兩排 4 格、跳過鍵跨兩排）。手機橫版（例 844 × 390）是一排，高約 100 px，蓋掉下排格子的四分之一。
- 鏡頭 `OrbitControls`：`enablePan: false`，單指繞島轉、雙指向注視點縮放；每回合自動對鏡（全景 ↔ 物品格），玩家拖過就標記 `grabbed`、這回合不再搶鏡頭。全景距離只看長寬比（`overviewDistance`），不知道介面佔了哪裡。
- 遊戲結束（`game.finished`，`onFinished`）：RESET 發亮；物品列全部放完、跳過鍵停用，留在畫面上。

## R42 手機橫版：右側直排側欄＋島往左偏

- 觸發條件：`@media (orientation: landscape) and (max-height: 520px)`（手機橫過來；平板橫版高度超過就照桌機）。
- 側欄：`.slots` 貼右邊（`right: max(12px, env(safe-area-inset-right))`），垂直置中但往下讓出頂欄（`top: calc(50% + 28px)`、`translateY(-50%)`），兩欄四列：格子只放圖示 48 × 48（名稱隱藏、`aria-label` 仍是物品名；等級徽章照舊貼在格底），跳過鍵在最下一列跨兩欄 48 × 40。側欄寬 2 × 48 + 6 + 20 = 122 px、高約 290 px——740 × 360 的舊手機也放得下、不碰頂欄（頂欄底 58 px）。
- 鏡頭：島要在「側欄左邊那塊」置中。`rig.setInset({ right: px })` → `camera.setViewOffset(w, h, right / 2, 0, w, h)`（畫面往右推半個側欄，島就往左偏；LEVEL UP、泡泡都走投影矩陣，自動跟著）。`fit()` 時從 `.slots` 的實際寬度量（`getBoundingClientRect`），非橫版時 `right: 0` 清掉 view offset。全景距離仍照長寬比（實作者可視情況把 aspect 換成 (w − right) / h，讓島填滿剩下的寬）。
- 直版、桌機不動。
- 截圖：`tools/shot.mjs` 名稱含 `land` → 844 × 390（手機橫版，`quality=low` 預算 ≤ 150）；`npm run shot` 加 `land-live`、`land-end`。

## R43 終局之後才可平移、跳過鍵變隱藏選單鍵

- 平移只在遊戲結束後開放（`onFinished` → `rig.setFree(true)`；RESET → `setFree(false)` 再 `home(0)`）。開放時 `controls.enablePan = true`、`screenSpacePanning = false`（沿地面平移）；雙指拖曳（手機）／右鍵拖曳（桌機）平移，注視點每幀鎖在島的範圍內：`controls.target` 與 `home` 的水平距離 ≤ `FREE_RADIUS` 9、`y` 固定 `home.y`（超出就拉回圓內，鏡頭位置同向跟著移，視角不變）。演出中（結束前）一律不能平移，行為同現在。
- 跳過鍵：結束後變成「隱藏選單」鍵（圖示換成往下／往右的雙箭頭，`aria-label`「隱藏選單」；`slots.setMode('hide')`）。按下：整條物品列收起（`.slots.collapsed`：往畫面外滑、不佔位），同時在原本的邊緣出現一顆 44 × 44 的圓鍵（`.menu-tab`，同一個圖示反向，`aria-label`「顯示選單」）；再按就展開。RESET 時回到 `skip` 模式、展開。
- 不加任何文字（最小文字原則）；圖示沿用 `icons.js` 的線條風格。

## 驗收

- `npm test` 全綠（ui.test 釘 CSS 規則與模式切換、camera.test 釘 inset／setFree／夾住）；`npm run check`；`npm run pace -- --check`；`npm run shot` 含兩張 `land-*` 在預算內。
- 使用者眼看：844 × 390 橫版側欄不壓到島、島置中於左側區域；終局後雙指平移到島邊會被擋住；隱藏選單後圓鍵在邊緣、按了回來。
