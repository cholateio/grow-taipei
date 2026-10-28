# 台北成長 — 選擇帶動升級：拿掉最後大升級（設計）

日期：2026-10-28。使用者看了 2026-10-27 的錄影（`螢幕錄製 2026-10-27 232355.mp4`）後說：
「建議就拿掉最後的大升級了，太奇怪了，飛彈警告後突然就大家都 level up，動畫還超快。GROW 系列的主旨是選擇導致的 level up，
目前各階段來看完全感受不出選擇的先後順序導致的影響。我的建議是將 level up 併入一般的批次升級。但請注意有些如學校一下升太多級很突兀。」
使用者對下面的方向說「走這個方向」：每一級都可以跳、只留一輪最後成長、條件由求解器重收到剛好兩條正解、飛彈尾聲標題卡照舊。

取代：物品 v2（`2026-10-26-items-v2-design.md`）§3 的「每物品最多一個跳級」「剛放下當回合不長」「倒數 3 回合」；
最終章（`2026-10-27-final-chapter-design.md`）§4–§5 的宣告放在倒數第一回合、三回合趕工蒙太奇。飛彈（§6）、尾聲（§7）、標題卡前 2 秒照舊。

## 1. 意圖

升級要發生在玩家放東西的那一回合，看得出「因為我現在放了 X，Y 才長」。放完第 8 個之後不再有三回合的自動大升級；
只剩一輪「最後大家長一次」（GROW 的收尾），照一般回合的速度與劇本演，演完才是飛彈警告。

## 2. 目標、非目標、反目標

目標
- 8 次放置 + 1 輪最後成長，61 級照舊（不砍內容），仍剛好兩條全 MAX 正解（一賽博一外星）。
- 放下的物品當回合就可以長一級（1 → 2），它帶動的別人也在同一回合長。
- 任何一級都能跳：在 n−2 級、第 n−1 與第 n 級的條件同時成立，就一回合 +2。一回合最多 +2 不變。
- 學校（鮮奶）不連跳：鮮奶只保留原本那一個跳級（5 → 7 升格大學），其餘一回合一級。
- 最後一輪成長演成一般回合：原速、一般劇本、鏡頭照常，沒有倒數數字、沒有趕工、沒有蒙太奇。
- 飛彈警告（海平面紅光、全島抬頭「！」）移到最後一輪成長之後、飛彈發射之前。

非目標
- 不改結局判定、飛彈三種結果、尾聲、標題卡。
- 不改素材與各級外觀。

反目標
- 某個物品一回合跳超過 +2。
- 放置回合長到無法忍受（節奏門檻見 §6）。

## 3. 規則

- 放下的物品當回合參加升級掃描。回合開始它是 0 級，一回合最多比回合開始高 2 級，所以放下當回合最多到 Lv2（不會放下就跳到 3）。
- `jump[n]`：每個物品每一級 n ≥ 3 預設都有一條跳級條件 `up[n−1] ∧ up[n]`。spec 裡寫的 `jump[n]` 是另外一條（兩條其一成立就能跳）。
- `steady: true` 的物品不加預設跳級，只用 spec 裡寫的 `jump`。鮮奶是 steady（使用者：學校一下升太多級很突兀）。
- `CLOSING_TURNS` 3 → 1。
- 求解器的驗收照舊（剛好兩條正解、一賽博一外星、七個壞結局到得了、晶片未 MAX ≥ 30%、平均 MAX ≤ 3.5、貪婪到不了真結局、節奏 PACING）。
  條件數字由收緊器重調；PACING 若在 9 回合下必須放寬，記成裁決。
- 可行性（2026-10-28 實測，現行條件只改上面三條）：全 MAX 24 條（賽博 2）；不讓放下當回合長只有 59/61；不加「每級可跳」只有 56/61；
  鮮奶與代幣都 steady 時沒有賽博解。
- 實作結果（計畫 5b 任務 1，2026-10-28）：只改上面三條是 24 條全 MAX（賽博 2、外星 22），但兩個壞結局到不了、節奏全部不過
  （MAX 全擠在第 8、9 回合）。9 回合下第 8 個一定是颱風（只有它放下後兩回合內到得了 MAX）、第 7 個一定是老鼠，所以光收緊救不了節奏，
  先放寬三條、再收緊三條，外加兩條颱風檢查門檻，每條都缺一不可（逐條還原都會讓驗收失敗）：
  - 颱風登陸時 大停電 燈泡 ≤2 → ≤4、捷運淹水 代幣 ≤2 → ≤4：颱風放下當回合就登陸，前一回合放的燈泡、代幣已經跳到 4，≤2 永遠碰不到。
  - 放寬：鮮奶 jump[7] 晶片 ≥5 ∧ 棒球 ≥3 → 棒球 ≥3（大巨蛋蓋好就升格大學）；燈泡 up[7] 代幣 7 → 6（高鐵載電工去開風電）；
    燈泡 up[8] 晶片 5 → 4（海底電纜要星群總部）。不放寬燈泡那兩條就沒有賽博解。
  - 收緊：晶片 up[3] 要燈泡 ≥6（園區要變電所供電）；鮮奶 up[3] 要有棒球（小學拿沙地球場當操場）；鮮奶 up[10] 要颱風 ≤1（鮮奶節趕在颱風登陸前辦）。
  - 結果：剛好兩條全 MAX，PACING 照舊（每回合 ≤4 個 MAX、≥3 個回合有 MAX，不必放寬）：
    鮮奶 → 棒球 → 燈泡 → 代幣 → 晶片 → 珍奶 → 老鼠 → 颱風 ⇒ 賽博龐克；鮮奶 → 棒球 → 代幣 → 燈泡 → 晶片 → 珍奶 → 老鼠 → 颱風 ⇒ 外星人。
    兩條都在第 7、8、9 回合各有 1、3、4 個到 MAX，沒有災難旗標。賽博／外星不再是「老鼠早放晚放」（老鼠一定第 7），
    改成「第 3 個先放燈泡（電網先好，晶片趕在老鼠分岔前測過矽盾）還是先放代幣（晶片晚一步）」。
  - 其他驗收：平均 MAX 2.36、晶片未 MAX 比例 ≥30%、貪婪（鮮奶 → 棒球 → 晶片 → 燈泡 → 代幣 → 老鼠 → 珍奶 → 颱風）到大巨蛋鼠災、
    七個壞結局都到得了、鮮奶過期當得上標題（18 種）、晶片放第 8 個時其餘七個到 MAX−1 的順序 272 種。
  - 副作用：燈泡 jump[5]（代幣 ≥2）與珍奶 jump[3]（鮮奶 ≥4）在 8! 種順序裡都不再發生（預設跳級 2 → 4 先跳過了第 3 級；
    珍奶放下當回合就到 2）。條件留著（spec 測試「六個跳級」照舊），演出層若有它們專屬的劇本就是死碼。

## 4. 演出

> 升級演出改由 2026-10-28 看得見的因果設計（`2026-10-28-cause-and-islets-design.md` §4–§6：拜訪、撲空、回合上限 60）接手；下面的節奏與鏡頭規則照舊。

- 一般回合：放下的物品 placed 劇本演完，接著它自己的 grow[2] 劇本（同一回合）。跳級規則照舊：第二級演 [套用, LEVEL UP]，◆ 關鍵級照演完整劇本。
- 最後一輪成長：一般回合（`montage: false`），回合開頭不冒數字，沒有趕工；劇本、鏡頭、空拍、節奏門檻都跟放置回合一樣。
- 終局回合：第一個事件是飛彈警告 `{ kind: 'warning', flag: { name: 'alarm', value: 1 } }`：紅光閃白出現、主島日常的人轉頭看紅光並冒「！」（原本倒數 3 的宣告去掉數字），
  接著飛彈（照舊）、真結局接尾聲（照舊）、標題卡前停 2 秒（照舊）。紅光脈動固定 2 Hz。
- 拿掉：倒數數字事件（`countdownEvent`）、趕工（`rushSite`、`RUSH_*`、`rushHero`）、蒙太奇的倍速與過濾（`MONTAGE_*`、`montage` 參數、`ctx.speed` 在一般演出恆為 1；
  劇本裡讀 `ctx.speed` 的地方保留預設 1 即可，不必逐一拆）、`closingEvents`。`crowd.js` 的 `lookUp`／`crowd`／`islanders` 留著（警告與矽盾測試用）。

## 5. 101 與其他依回合的東西

- 101 的四個階段門檻依新的總等級曲線重取（兩條正解各在不同回合跨過、散在整局、最後點燈），測試照舊。
- 人數預算（主島 ≤ 30、一格 ≤ 8）、draw call（≤ 250／≤ 150）、整局不變式照舊。
- 截圖清單裡依舊順序寫死的 `auto=` 與 `warp=` 重新找（物品特寫拍到對的那一級）。

## 6. 節奏

- 放置回合門檻照舊：4 秒起，上限 50 + 8 × max(0, ◆ − 1)。最後一輪成長回合同一套門檻（它就是一般回合）。
- 終局回合（警告＋飛彈＋尾聲）：真結局 ≤ 22 秒、壞結局 ≤ 12 秒（多了警告約 2.5 秒）。
- 一回合的升級變多（實測正解單回合最多 13 個 grow）。超過上限時先砍非關鍵劇本的停頓與泡泡，不加快走路；仍超過再記裁決放寬上限。
- pace 報表另印「最後一輪＋終局」合計，跟計畫 5 的最終章（外星 70.9、賽博 67.0）對照，不設門檻。

實測（計畫 5b 任務 4，`node tools/pace.mjs --check`，種子 21；格內是「秒數／上限」，上限 50 + 8 × max(0, ◆ − 1)）：

| 回合 | 賽博龐克台北 | 外星人統治台北 |
|---|---|---|
| 1 | 鮮奶 7.8／50 | 鮮奶 7.8／50 |
| 2 | 棒球 15.9／50 | 棒球 15.9／50 |
| 3 | 燈泡 29.7／50 | 代幣 27.7／50 |
| 4 | 代幣 21.6／50 | 燈泡 30.2／50 |
| 5 | 晶片 40.8／58 | 晶片 36.0／50 |
| 6 | 珍奶 46.6／50 | 珍奶 49.1／50 |
| 7 | 老鼠 53.0／58 | 老鼠 55.7／58 |
| 8 | 颱風 59.9／90 | 颱風 57.6／82 |
| 最後一輪 | 26.4／66 | 30.0／74 |
| 終局（警告＋飛彈＋尾聲） | 13.9／22 | 16.3／22 |
| 最後一輪＋終局 | 40.3（計畫 5 最終章 67.0） | 46.3（計畫 5 最終章 70.9） |
| 合計 | 315.6 | 326.2 |

壞結局終局：命中 6.5／12、吹歪 9.2／12。上限都沒有放寬。外星第 6 回合原本 59.0（燈泡 Lv5 走去 101 腳下 9 秒、101 跨門檻等鏡頭到了才走），
砍法：燈泡 Lv5 不走路（回全景、原地看 101）、101 跨門檻時鏡頭飛的同時工人就出發、鮮奶 Lv8／晶片 Lv3／代幣 Lv5、Lv6 的泡泡各短 0.1–0.2 秒（一級仍 ≥ 3 秒）。
只剩 ⚠：颱風 Lv2 劇本 5.5／4.9 秒（> 4.5，大家走去躲雨，走路不加速），不算失敗。

## 7. 驗收

- `npm run check` 通過（剛好兩條正解）；`npm test`；`node tools/pace.mjs --check`；`npm run shot` 預算內。
- 使用者看：放置回合的連鎖讀得出「因為放了 X」、學校沒有一下長太多、最後一輪不突兀、警告接飛彈。

## 7.1 我的取捨（使用者可推翻）

- 放下當回合就能長一級：不這樣，61 級在 8 + 1 回合裡到不了（59/61），要砍內容。
- 鮮奶 steady：照使用者提醒；代幣也 steady 就沒有賽博解，所以只有鮮奶。
- 警告固定 2 Hz、不再分 3、2、1。

## 8. 實作裁決

（控制者在計畫 5b 執行時記的，照 SDD 帳本原文）

- Ruling R1: accept the eight spec changes incl. skeleton thresholds blackout bulb ≤2→≤4, flood token ≤2→≤4 (typhoon now lands in its placement turn; without it both bad endings are unreachable) — cost if wrong: the user re-tunes bad-ending difficulty.
- Ruling R2: the cyber/alien split is bulb 3rd (cyber) vs token 3rd (alien); rat 7th and typhoon 8th fixed in both — accepted (R7 of plan 4 already moved the split off rat timing) — cost: puzzle clue text.
- Ruling R3: the typhoon lands in its own placement turn (cloud placed script → landing script in the same turn); T3 updates typhoon tests/scripts to that — cost if wrong: the one-turn cloud beat is gone.
- Ruling R4: dead explicit jumps (bulb.jump[5], boba.jump[3]) stay for now; noted for the user — cost: dead script paths.
- Ruling R5: keep exclusion, revisit if a placed item can stay Lv1（placed item excluded from post-scan wait/stall; no effect on shipped spec）.
- Ruling R6: story beats that are now always the second half of a jump get the ◆ key flag so their full script plays: token Lv4 (ring line + train), chip Lv7 (antenna), chip Lv8 (shield test) — the island chain and the ring line are the game's main story; design §4 says key levels play full — cost: pace, handled in T4 by trimming pauses.
- Ruling R7: carried into Task 4 instead of a separate fix round — T4 already re-keys token/chip levels and re-takes shots in the same area — cost if wrong: one more review cycle in T4.（Important：cyber token Lv7 ◆ opens on the windmill spur that bulb Lv7 already built; the new playground spur grows off frame.）

任務 4 的做法（不是新裁決）：R7 → 風車島支線已在就開在遊樂場島、列車開進遊樂場支線；兩條都要長（外星）時遊樂場那條等鏡頭回全景才長；
支線車速 2.5 → 3.5（◆ ≤ 8 s）。節奏見 §6 實測。走路格兩個修正（live 不變式量到）：走路互推一邊貼牆就由另一邊讓整段、
起點在格點連不出去的夾縫裡（夜市攤位外擴之間）先直線走到附近連得通的點。

審稿延後（不修）：跳級事件的 `via` 列出兩條條件（明寫的與預設的）裡所有幫手；明寫在 3..max 之外的 `jump[n]` 編譯時直接略過（掃描本來就擋）；
`separateStanding` 沒有新 `separate` 那道外擴守衛（同一類潛在問題，live 不變式沒量到）；燈泡 Lv5 電工只轉頭看 101，「他打開燈光秀」偏弱，等使用者看。
最終審稿延後（不修）：壞結局局最後一輪珍奶 Lv5 的 LEVEL UP 一半在畫面外（鏡頭從森林島飛回來；兩條正解演不到 Lv5）；颱風 Lv2「！」只給主島沒有專屬測試；
鮮奶 up[10]（颱風 ≤ 1）在兩條正解裡靠 ORDER 裡鮮奶排在颱風前面成立。
