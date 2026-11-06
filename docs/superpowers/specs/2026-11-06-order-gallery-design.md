# 放置順序編號、結局圖鑑、側欄小瑕疵（2026-11-06）設計

使用者 2026-11-06：「不錯喔，那 uiux 還有什麼要改進的嗎？」→ 從建議清單選了「放置順序編號＋結局圖鑑」與「小瑕疵：旋轉滑動、隱藏鍵顏色」。
接在 `2026-10-31-single-path-design.md` §8 R43 之後，記成 R44–R46。純介面；規則、演出、鏡頭不動。畫面上的字照最小文字原則：只多數字（順序 1–8、圖鑑計數）與圖鑑裡已看過結局的名稱（選單內的 UI，不是場景裡的字）。

## R44 放置順序編號

- 物品放下（`slots.setPlaced(id)`）時，那一格左上角出現一顆小圓徽章 `.n`（墨黑底、白色數字，直徑 18 px；側欄 48 格 16 px、36 格 14 px），數字是這局第幾個放的（1–8，`setPlaced` 自己計數）。
- `reset()` 清掉。等級徽章 `.lv` 照舊在格底。
- 用途：結局出來後玩家看一眼就知道這局的順序，下一局才調得動。

## R45 結局圖鑑

- 「怎麼玩」卡片（`showHowTo`）下半部多一塊 `.endings`：三行說明之下一條細線，然後一格格的結局磚（`.ending[data-id]`，4 欄，每磚 56 × 64：圖示 32 px＋名稱 11 px），右上角一行小字 `已看過數 / 總數`（`.eyebrow` 風格，兩個數字）。
- 磚的順序：`cyber` 第一（真結局，磚加 `.true`：黃色外框 `var(--yellow)`），其餘照 `ENDINGS` 的順序，`tryAgain` 最後。
- 沒看過：`.unknown`——灰磚、問號圖示（`UNKNOWN_ICON`）、沒有名稱。看過：結局圖示（`ENDING_ICONS[id]`，`icons.js` 同一套 64 viewBox 線條風格，每個結局一個：賽博＝101 與飛車、變異鼠稱王＝戴王冠的老鼠、大停電＝劃掉的燈泡、捷運淹水＝車站與波浪、大巨蛋淹水＝巨蛋與波浪、珍奶攤被吹走＝攤車與風線、大巨蛋鼠災＝巨蛋與老鼠、矽盾未就緒＝彎掉的 101、颱風吹偏隕石＝颱風漩渦與石頭、鮮奶過期＝長腳的牛奶箱、再接再厲＝發芽的種子）＋名稱。
- 紀錄：`localStorage` 鍵 `grow-taipei:endings`，JSON 陣列的結局 id；`game.onFinished(ending)` 時把 `ending.id` 併進去（`storageSet`，永不丟例外）。只記最後判定的結局（`resolve().id`），`extras` 不算。
- `showHowTo(root, { onClose, endings, seen })`：`endings` 是 `ENDINGS` 表、`seen` 是已看過的 id 陣列；舊的呼叫（沒給）就不畫圖鑑（測試方便）。按「開始」關卡片照舊。
- 結束後想看圖鑑：按頂欄「?」（卡片已經有）。不另加按鈕、不自動彈出。

## R46 側欄小瑕疵

- 旋轉手機時側欄從錯的位置滑 0.3 s：`.slots` 不再常駐 `transition`；只有收合／展開那一刻才有（`slots.js` 在切換 `collapsed` 前加 `.sliding`，`transitionend` 或 350 ms 後拿掉；`.slots.sliding { transition: transform .3s }`；reduced-motion 照舊無 transition）。
- 隱藏選單鍵（`.skip.hide`）不用珊瑚色：奶油底 `var(--cream)`、墨黑圖示、`inset` 線框同其他格；RESET 仍是唯一發亮的鍵。

## 驗收

- `npm test` 全綠（ui.test：編號、圖鑑磚數與順序、未看過／看過兩種磚、計數、storage 併入、`sliding`、隱藏鍵顏色）；`npm run check`、`npm run pace -- --check`；`npm run shot` 全部在預算內。
- 截圖：`end`（格子有 1–8 編號）、「怎麼玩」卡片（圖鑑：一個看過、其餘問號）。
- 使用者眼看：編號在手機側欄看不看得清；圖鑑圖示認不認得出；卡片在手機直版放不放得下（卡片 `max-height` 捲動）。
