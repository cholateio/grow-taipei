# GROW-like 謎題原型

致敬 Eyezmaze「GROW」系列的原創習作與量產管線實驗。

## 內容
- `game/grow_world_final.html` — 最終版「小小世界」（10 物品、tick 雙軌引擎、三幕演出）。直接用瀏覽器開啟。
- `game/grow_boss_v1.html` — 第一版「魔王討伐戰」（8 物品、放置觸發模型）。
- `solver/solver1_naive.js` — 每回合成長模型，示範「規則太鬆→2880 組解」。
- `solver/solver2_onplace.js` — 放置觸發＋增益守恆，保證唯一解（8! 暴力驗證）。
- `solver/solver3_tick_stats.js` — tick 雙軌引擎＋全排列難度統計（10! ≈ 9 秒）。
- `solver/solver4_auto_tighten.js` — 自動收緊器：貪婪加入窗口條款直到唯一解（約 14 分鐘）。

執行：`node solver/solver4_auto_tighten.js`（需 Node 18+）

## 管線
主題 → SPEC(items/tick/fx/stall) → 自動收緊器 → 唯一解 → 全排列難度量測
→ 演出規格(cause/medium/move) → 美術圖層(levels × parts) → 組裝

## 唯一解（劇透）
石頭 → 喇叭 → 齒輪 → 箱子 → 黏液 → 球 → 種子 → 水滴 → 繩子 → 磁鐵
