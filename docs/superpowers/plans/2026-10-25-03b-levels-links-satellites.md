# 計畫 3.5：更多等級、看得見的連動、衛星島與海面跟著長 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把八個物品從 31 級加到 41 級（max 6/6/5/6/3/5/4/6），讓先放的東西一路長到最後；每次升級都看得到是誰幫的（因果光點）、卡住的東西看得到在等誰（等待手勢）；7 座衛星島和海面跟著主島的等級反應；兩條正解的節奏每回合 ≤ 4 個升級、MAX 分散在 ≥ 4 個回合。

**Architecture:** 規則層：`spec.js` 的 max 與 `up[]` 重寫（Lv2..max−1 自動、最後一兩級看別人／時間窗口），求解器加節奏驗收並用白名單子句收到剛好 2 解；引擎在 grow 事件加 `via`、每回合加一個 `wait` 事件。演出層：舞台多兩種轉場前奏（光點飛行、等待轉身），`satellites.js` 是第 11 個舞台模組，view 讀全部等級畫 7 座島＋海上的船、浪、煙火。所有新東西都走現有的 `view(lv, flags) → parts` 與 `createPartFactory`。

**Tech Stack:** three.js r170（vendor/）、node:test、headless Chromium 截圖、求解器（`npm run check`）。

**Spec:** `docs/superpowers/specs/2026-10-24-grow-taipei-design.md`（§5、§5.1、§5.3、§6.2、§6.5 #6、§7.2，2026-10-25 已更新）。

## Global Constraints

- 每回合每個物品最多升一級，剛放下的當回合不升；第 8 個放完後倒數 `CLOSING_TURNS = 2` 回合（§6.2）。
- `npm run check` 全程必須通過：剛好 2 解（一賽博一外星）、壞結局都到得了、晶片未 MAX ≥ 30%、平均 MAX ≤ 3.5、貪婪到不了、**節奏 #6**。
- 畫面只飄「Lv.n」，不加標籤、不解釋條件（§7.2）；鏡頭不跟事件走。
- 主島 draw call ≤ 150（`npm run shot` 會印 `[grow] calls=`）；小人 ≤ 48 個（`createPeople` 的 max）；骨架動畫角色同時 ≤ 12（機器鼠軍團 10 隻 + 柴犬 1 剛好）。
- 色票、材質、規則只動 `up[]`／`max`／STORIES、不改颱風檢查與老鼠分岔的骨架——同前幾個計畫。
- 每個任務結束 `npm test` 全綠；動到畫面的任務 `npm run shot` 乾淨。

## Review Focus

1. `wait` 事件不能洗版：每回合最多一個、沒人在等就不發、跳過／reduced-motion 不演（Task 1 測試 `wait is one grouped event per turn and absent when nothing waits`；Task 4 測試 `instant apply shows no wait gesture`）。
2. 光點的起點物品還沒有零件（例如 via 指到只有錨點的物品、或 RESET 剛清掉）時要退回錨點、不能丟錯（Task 4 測試 `spark falls back to the anchor when the via item has no parts`）。
3. 新的高等級被扣回去（鮮奶 6→5、棒球 6→5）：大學／煙火零件要消失、小人數要退回（Task 3 測試 `knocking milk back from 6 removes the university and its graduates`）。
4. 衛星島在 RESET 後回到開局：風車慢轉、寶箱關上、船回到 2 艘、浪平（Task 5 測試 `satellites reset to the opening state`）。
5. 節奏驗收必須把倒數回合算進去：一條 MAX 全擠在第 9、10 回合的正解要被擋下（Task 2 測試 `pacing check rejects a solution whose MAXes all land in the closing turns`）。

---

## 檔案結構

```
src/rules/spec.js            改：max、up[]、STORIES.grow 新等級文案
src/rules/engine.js          改：grow 事件加 via；每回合一個 wait 事件；匯出 condDeps(cond, self)
src/solver/run.js            改：check #6 節奏；匯出 pacing(results, spec)
tools/solutions.mjs          新：npm run solutions → 重產 docs/superpowers/plans/solutions.md
src/director.js              改：DURATIONS.wait = 700；grow 有 via 時 900
src/actors/stage.js          改：光點前奏（spark）、等待手勢（wait）、anchorOf(id)
src/actors/parts.js          改：新 kind spark（會飛的發光球）、fireworks（循環粒子）
src/actors/{milk,chip,bulb,token,rat,boba,baseball}.js  改：新等級的 view
src/actors/satellites.js     新：第 11 個模組：7 座島 + 船 + 浪 + 煙火
src/scene/island.js          改：風車葉片從 kit 拿掉（改成會轉的零件）
src/scene/water.js           改：setStorm(k)（波幅）
src/app.js                   改：modules 加 satellites；船從 app 搬進 satellites；水的 storm 由 worldEffects 推
src/actors/world.js          改：worldEffects 多回傳 storm（颱風 Lv2 → 1）
test/…                       對應測試；test/game.test.js 與 test/stage-real.test.js 的正解順序改成從求解器取
```

---

### Task 1: 規則資料與引擎註記（via、wait）

**Files:**
- Modify: `src/rules/spec.js`, `src/rules/engine.js`, `src/director.js`
- Test: `test/spec.test.js`, `test/engine.test.js`, `test/director.test.js`

**Interfaces:**
- Produces: `ITEMS[id].max` = milk 6, chip 6, bulb 5, token 6, typhoon 3, rat 5, boba 4, baseball 6；`STORIES.grow[id][n]` 每一級一句。
- `condDeps(cond, self) → string[]`（匯出）：條件樹裡出現的其他物品 id（`minLevel/maxLevel/present/absent`，去掉 self、去重、依 ORDER 排序）；`age`、`always`、`flag` 不算。
- grow 事件：`{ kind:'grow', item, from, to, story, via: condDeps(up[to], item) }`（沒有依賴時 `via: []`）。
- wait 事件：掃描結束後，所有「已放、未滿、未鎖、這回合沒升、`up[lv+1]` 不成立且 `condDeps` 非空」的物品，合成**一個**事件 `{ kind:'wait', item: <第一個>, waits: [{ item, for: ids }] }`，放在 `after` 事件之前；沒有就不發。剛放下的物品不算。
- `DURATIONS.wait = 700`；grow 事件有 `via.length` 時導演等 900 而不是 700（光點 0.35 s + 彈出）。

- [ ] **Step 1: 測試**

`test/spec.test.js`：maxes 改成 `[6,6,5,6,3,5,4,6]`；`STORIES.grow[id]` 每個 2..max 都有字串。
`test/engine.test.js`（mini spec 加一個 `e: { max: 3, up: { 2: {minLevel:['a',2]}, 3: {and:[{age:['e',2]},{maxLevel:['c',1]}]} } }`）：

```js
test('condDeps lists the other items a condition mentions, ordered, without age/self', () => {
  assert.deepEqual(condDeps({ and: [{ age: ['e', 2] }, { maxLevel: ['c', 1] }, { minLevel: ['a', 2] }, { present: 'e' }] }, 'e', mini), ['a', 'c']);
  assert.deepEqual(condDeps({ always: true }, 'a', mini), []);
});
test('grow events carry via = the items their condition depends on', () => { /* e 升 2 的事件 via ['a']；a 自己長的 via [] */ });
test('wait is one grouped event per turn and absent when nothing waits', () => {
  // e 放了、a 還是 1 → 下一回合有 wait { waits:[{item:'e', for:['a']}] }；a 到 2 之後那回合 e 升級、沒有 wait
  // 剛放下的物品不算在 waits 裡
});
```

`test/director.test.js`：`DURATIONS.wait === 700`；`[{kind:'grow', via:['a']}]` 等 900、`via: []` 等 700。

- [ ] **Step 2: 跑測試確認失敗** — Run: `node --test test/spec.test.js test/engine.test.js test/director.test.js`，Expected: FAIL（max 不符、`condDeps` 不存在）。

- [ ] **Step 3: 實作**：`spec.js` 先只改 `max` 與 STORIES（`up[]` 在 Task 2 調，這一步先把每一級補成 `age(id, n−1)` 讓測試能過）；`engine.js` 加 `condDeps`、`via`、`wait`；`director.js` 的 DURATIONS。

- [ ] **Step 4: `npm test`** — 除 `solver/tighten/game/stage-real` 可能因規則暫時不合而紅之外全綠；紅的在 Task 2 處理（ledger 記下）。

- [ ] **Step 5: Commit** `git commit -m "rules: 八物品 41 級骨架；引擎在升級事件標 via、每回合一個 wait 事件"`

---

### Task 2: 規則調參、節奏驗收、正解文件工具

**Files:**
- Modify: `src/rules/spec.js`（`up[]`）, `src/solver/run.js`, `package.json`（`"solutions": "node tools/solutions.mjs"`）, `test/game.test.js`, `test/stage-real.test.js`, `docs/superpowers/plans/solutions.md`
- Create: `tools/solutions.mjs`
- Test: `test/solver.test.js`

**Interfaces:**
- `pacing(results, spec) → { ok, maxGrowsPerTurn, maxTurns, failures }`（匯出）：對每條全 MAX 的順序用 `playOrder` 重播，數每回合（含倒數）的 grow 事件數與「有物品到 MAX」的回合集合；`ok` = 每回合 ≤ 4 且 MAX 回合數 ≥ 4。`check` 把它當第 6 條。
- `tools/solutions.mjs`：重產 `solutions.md`（兩條正解逐回合表含倒數列、壞結局代表順序、統計、調參紀錄從舊檔保留並可 append）。
- 規則起點（§5.1）：每個物品 Lv2..max−1 = `age(id, n−1)`；有「需」的級照 §5.1：鮮奶 5 `min(baseball,2)`、6 `min(chip,3)`；晶片 4 `min(milk,3)`、5 `min(token,3)`、6 `min(typhoon,3)`；燈泡 5 `min(baseball,4)`；代幣 4 `min(baseball,3)`、6 `and(min(rat,3), max(bulb,4))`；老鼠 2 `and(age, max(milk,1))`、3 `and(age, min(token,2))`；珍奶 3 `min(chip,2)`、4 `min(token,4)`；棒球 3 `and(age, max(token,1))`、4 `min(token,2)`、5 `min(bulb,3)`、6 `min(boba,2)`；颱風不動。大巨蛋鼠災的條件改成 `min(baseball,3)`（巨蛋現在是 Lv3）。
- 收緊：用 `tighten(spec, { filter })`，filter 只放行**白名單**子句（寫在 `tools/solutions.mjs` 旁的 `tools/whitelist.mjs`，一行一個故事理由）；單一子句收不到 2 解時用「兩兩搜尋」（計畫 3 調參紀錄 #5 的作法，腳本放 `tools/pairsearch.mjs`）。
- 正解順序的測試不再寫死：`test/game.test.js`、`test/stage-real.test.js` 從 `stats(enumerate(spec), spec).full` 取（一次約 2 秒，放在檔案頂層）。

- [ ] **Step 1: 測試**

```js
// solver.test.js
test('pacing check rejects a solution whose MAXes all land in the closing turns', () => {
  // 造一個假結果：用 playOrder 事件改造——或直接用 mini spec：三個物品、閉合 2 回合、所有 MAX 落在最後兩回合 → pacing().ok === false，failures 含 'MAX 回合'
});
test('pacing counts closing turns as turns', () => { /* turn 9、10 的 grow 也算進每回合上限 */ });
test('check #6 is wired: a spec failing pacing fails check', () => { /* 用上面的 mini spec */ });
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `node --test test/solver.test.js`，Expected: FAIL（`pacing` 不存在）。
- [ ] **Step 3: 實作 `pacing`、接進 `check`；寫 `tools/solutions.mjs`、`tools/whitelist.mjs`、`tools/pairsearch.mjs`**。
- [ ] **Step 4: 調參**：把 §5.1 起點寫進 `spec.js` → `npm run check`；沒過就 `node tools/pairsearch.mjs`（只用白名單）→ 把選中的子句寫進 `spec.js` 並在註解寫故事理由 → 直到 `npm run check` 全過。每一輪的結果記進 ledger。
- [ ] **Step 5: `npm run solutions`**，看 `solutions.md` 的兩條正解：每回合 ≤ 4 個升級、MAX 分散。把這次的調參寫成紀錄 #6。
- [ ] **Step 6: `npm test`** 全綠（game／stage-real 改為從求解器取正解）。
- [ ] **Step 7: Commit** `git commit -m "rules: 41 級規則調到剛好兩解並通過節奏驗收；npm run solutions"`

---

### Task 3: 七個物品的新等級

**Files:**
- Modify: `src/actors/milk.js`, `chip.js`, `bulb.js`, `token.js`, `rat.js`, `boba.js`, `baseball.js`, `src/actors/tower.js`（天線改看晶片 ≥5、閃光 ≥6、燈光秀看燈泡 ≥5）, `src/actors/world.js`（傍晚 燈泡 ≥3、夜晚 燈泡 ≥5）
- Test: 對應的 `test/<item>.test.js`、`test/tower.test.js`、`test/typhoon.test.js`（worldEffects）

**Interfaces:** 每個 view 依 §5.1 的新表。只列新增或改動的級（其餘沿用計畫 3）：

| 物品 | 級 | 零件 |
|---|---|---|
| 鮮奶 | 4 | 校舍 box h 1.7（三排窗）＋旗桿頂一面 box 旗子 `0xdb6a41` |
| | 5 | ＋鐘塔；kids `cap`、路徑到巨蛋旁空地（需 baseball ≥2 才搬） |
| | 6 | 校舍 scale x 2.0、拱門（兩根 cylinder + 半 torus）`0xf1e7da`；kids accessory `cap`→ 新配件 `mortar`（方帽：box .12×.02×.12 黑 + 流蘇）；`labelY` 2.4 |
| 晶片 | 5 | 本體同 4；天線在 tower（tower 讀 `lv.chip >= 5`） |
| | 6 | 同 5；閃光在 tower（`>= 6`） |
| 燈泡 | 4 | 夜市 4 攤（`market` 地標周圍 (0,0) (0.6,0.5) (−0.6,0.5) (0,1.0)）＋霓虹招牌 |
| | 5 | 全島 LED：tower 燈光秀 `>= 5`；路燈頭全部 glow 強一點（顏色不變） |
| 代幣 | 2 | 環狀線 ＋ 3 節 |
| | 3 | 5 節 |
| | 4 | 支線（原 Lv3 的 spur） |
| | 5 | `token.shuttle`：自訂 kind `shuttle`：一節小車（rbox .3×.25×.4 黃）在燈塔支線上來回（`createPathCursor` 開放路徑） |
| | 6 | 車廂 neon（原 Lv4） |
| 老鼠 | 5 | cyber：`rat.pack` n 10、loop 改成繞 101 的環 `ringPath(tower, 1.3)`（骨架 ≤ 12 的上限就是這裡）；alien：變異鼠 ＋ `rat.ufo`：自訂 kind `ufo`：dome scale [0.9,0.3,0.9] 銀 ＋ 底部 glowsphere 綠，在變異鼠頭上 y+1.2 繞小圓盤旋 |
| 珍奶 | 4 | 本體同 3；分店與船在 satellites 模組（讀 `lv.boba >= 4`） |
| 棒球 | 2 | 沙地 ＋ 木看台（3 排 box 階梯 `0x9c7a4e`，在 −z 側）＋ 球員 2 |
| | 3 | 大巨蛋（原 Lv2 的 dome）＋球員 |
| | 4 | 頂縫 ＋ 觀眾 4（原 Lv3） |
| | 5 | 應援棒 ＋ 觀眾 6（原 Lv4） |
| | 6 | `baseball.fireworks`：kind `fireworks`（本任務在 parts.js 新增：每 1.2 s 一發，60 顆小 sphere 的 InstancedMesh 從中心炸開、重力下落、淡出，不投影）在巨蛋上空 y+4 |

- 被影響的條件改數字：鮮奶小孩的「少棒」看 `baseball >= 2`→ 仍是 2（看台就能練）；`domeRats` 的工作人員看旗標不變；老鼠 `train` 模式 `cars` 看 `token >= 3 ? 5 : 3`。
- 配件 `mortar` 加進 `people.js`（`ACCESSORIES` 變 8 個）。

- [ ] **Step 1: 測試**（每個模組的 test 加／改）：新等級的 key 與零件數、`labelY`、不出格；`knocking milk back from 6 removes the university and its graduates`（用 stage + 真 people：6→5 後 walkers 的 `mortar` 配件消失、拱門零件不在）；tower 的門檻 5/6；worldEffects 的 3/5；people `mortar` 配件測試。
- [ ] **Step 2: 跑測試確認失敗** → **Step 3: 實作** → **Step 4: `npm test && npm run shot`**（`shots/seven.png`、`end.png` 看得到看台、大學、煙火前的巨蛋）→ **Step 5: Commit** `git commit -m "actors: 七個物品的新等級（看台、大學、支線小車、機器鼠軍團、UFO、四攤夜市）"`

---

### Task 4: 看得見的因果：光點前奏與等待手勢

**Files:**
- Modify: `src/actors/stage.js`, `src/actors/parts.js`, `src/ui/ui.css`
- Test: `test/stage.test.js`, `test/parts.test.js`

**Interfaces:**
- `parts.js` 新 kind `spark`：`{ kind:'spark', at, to:{x,y,z}, color, dark? }`：glowsphere 0.1（dark 時 `0x211d1d` 無 glow）從 `at` 沿拋物線（頂點抬高 0.8）飛到 `to`，0.35 s，`update` 回報 `done`；到達時 3 顆小煙。
- `stage.js`：
  - `anchorOf(id)`：該物品 `<id>.main`（或第一個 key）的 `at` + labelY×0.6；沒有零件就 `anchorWorld(id)`。
  - grow 事件且 `via.length`（非 instant）：對每個 via 物品先放一顆 `spark` 從 `anchorOf(via)` 飛到 `anchorOf(item)`，全部到達後才 `sync`（彈出）。fx 事件有 `cause !== item` 且有 `delta` 或 `lock`：黑光點從 cause 飛到 item。
  - wait 事件（非 instant）：`waits` 裡每個物品的零件 `rotation.y` 轉向 `for[0]` 的 anchorOf（0.3 s 轉過去、0.3 s 轉回），頭上飄一個 `…`（`.actor-float.wait`，灰色、不上飄）。instant：什麼都不做。
  - RESET 清掉飛行中的光點。
- CSS：`.actor-float.wait { color:#7a6f68; animation-name: float-hold; }`（1.2 s 原地淡出）。

- [ ] **Step 1: 測試**

```js
test('spark part flies from at to to in 0.35 s and reports done', () => { /* update(0.2) 中途 y 比兩端高；update 到 0.35 後 done === true、位置 ≈ to */ });
test('a grow with via plays a spark from the helper before the target pops', async () => {
  // fake 模組兩個：helper、target；apply grow(target, via:['helper']) 非 instant：
  // 1) stage:puffs 或 stage:sparks 群組裡出現 spark、起點 ≈ helper 的 anchorOf；2) run(0.2) 時 target 的新零件還沒加進 parts；3) run(0.5) 之後加進了且在彈出
});
test('spark falls back to the anchor when the via item has no parts (review focus 2)', async () => { /* via 指向沒有模組的 'chip' → 起點 === anchorWorld('chip')，不丟錯 */ });
test('a knock-back flies a dark spark from the cause', async () => { /* fx cause 'rat' delta milk 2→1 → spark.dark === true */ });
test('wait event turns the waiting item toward what it waits for and floats "…"; instant shows nothing (review focus 1)', async () => {});
test('reset clears sparks in flight', async () => {});
```

- [ ] **Step 2: 跑測試確認失敗** → **Step 3: 實作** → **Step 4: `npm test && npm run shot`** → **Step 5: Commit** `git commit -m "stage: 因果光點、等待手勢"`

---

### Task 5: 衛星島與海面

**Files:**
- Create: `src/actors/satellites.js`, `test/satellites.test.js`
- Modify: `src/scene/island.js`（風車葉片移出 kit）, `src/scene/water.js`（`setStorm`）, `src/actors/world.js`（`storm`）, `src/app.js`（modules 加 satellites、船搬走、`view.water.setStorm(w.storm)`）, `assets/LICENSES.md`（不變，船已列）
- Test: `test/satellites.test.js`, `test/typhoon.test.js`（worldEffects.storm）, `test/island.test.js`（風車葉片不在 kit）

**Interfaces:**
- `satellites.js`：`id = 'satellites'`，`view(lv, flags)`，key 前綴 `sat.`：
  - `sat.windmill`：自訂 kind `blades`（三片 box 繞 hub 轉）：`speed` = 颱風 Lv2 → 6、停電 → 0、其他 → 1；颱風 Lv2 時整座 `rotation.z = sin(t·8)·0.05`。
  - `sat.lighthouse`：bulb ≥2：燈頭 glowsphere（原 kit 的那顆仍在，這裡加一顆更亮的）；bulb ≥3：`beam` kind：半透明 cone（長 4，opacity .25）繞 y 每 4 s 一圈。停電：沒有這個 key。
  - `sat.playground`：token ≥4 且 milk ≥2：people n 2、loop r .5 繞溜滑梯、accessory milk ≥5 ? 'cap' : 'none'、shirt 黃。
  - `sat.forest`：boba ≥2：people n 2 suitcase、`stand` 面向主島；boba ≥4：`sat.forestShop`：compound 小攤（box + hip 珊瑚 + 大杯）。
  - `sat.camp`（階梯丘）：chip ≥3：帳篷（prism 旋轉 90° 黃）＋營火（glowsphere 珊瑚 + 3 根 trunk）。
  - `sat.rocks`：rat ≥3：`rats` kind（rat.js 的 builder 共用，匯出）n 2、anim Idle、spots 在兩顆石頭上。
  - `sat.chest`：全 MAX（`spec.ORDER.every(id => lv[id] === ITEMS[id].max)`）→ 蓋子 rbox 翻開（rot x −1.2）＋ glowsphere 金 `0xe8c547` ＋ 6 顆小 sphere 金幣；否則關著（蓋子平）。原 kit 的寶箱改成只畫箱體，蓋子由這裡畫。
  - `sat.boats`：`glb` 零件 n 艘（kind `boats`：`Boat.glb`／`BoatWSail.glb` 交錯，各自 `loop` 繞 r 16.5 + i·1.1 的圓，速度 .05 + i·.01）：數量 = 2 + (boba ≥2 ? 2 : 0) + (boba ≥4 ? 2 : 0)；颱風 Lv2 → 0 艘。
- `water.js`：`setStorm(k)`：uniform `uStorm`（0..1），shader 的 w 波幅乘 `1 + 2·uStorm`、閃光密度乘 `1 + uStorm`。
- `world.js`：`worldEffects` 多回傳 `storm: lv.typhoon === 2 ? 1 : 0`。app 每次 `applyWorld` 呼叫 `view.water.setStorm(w.storm)`。
- 風車：`island.js` 的 `windmill` 只留桅杆與小屋；葉片在 `sat.windmill`。

- [ ] **Step 1: 測試**

```js
test('windmill blades: idle 1, storm 6 with wobble, blackout 0, after the storm back to 1', () => {});
test('lighthouse lights at bulb 2, sweeps at bulb 3, dark in a blackout', () => {});
test('playground kids need the spur and a school; forest tourists need a queue; shop needs the chain', () => {});
test('camp at chip 3, rocks get rats at rat 3, chest opens only when everything is MAX', () => {});
test('boats: 2, 4 with a queue, 6 with the chain, none in the storm', () => {});
test('satellites reset to the opening state (review focus 4)', async () => { /* stage + 真模組：走到 end 再 reset → sat 零件只剩 windmill(speed 1)、chest closed、boats 2 */ });
test('every satellite part sits on its island (within R of the island centre) except boats', () => {});
// typhoon.test.js: worldEffects(...).storm；island.test.js: kit 裡沒有風車葉片（count of windmill blade boxes）
```

- [ ] **Step 2: 跑測試確認失敗** → **Step 3: 實作** → **Step 4: `npm test && npm run shot`**（`storm.png`：浪大、船不見、風車狂轉；`end.png`：寶箱開、六艘船、燈塔光束）→ **Step 5: Commit** `git commit -m "actors: 衛星島與海面跟著主島反應（風車、燈塔、遊樂場、分店、露營、石堆老鼠、寶箱、船、浪）"`

---

### Task 6: 收尾

**Files:**
- Modify: `package.json`（shot 組：加 `storm=auto=typhoon,boba` 已有；加 `turn5=auto=<正解前 5 個>`，順序從 `solutions.md` 取）, `docs/superpowers/plans/README.md`（第 3.5 列）, `docs/superpowers/plans/solutions.md`（`npm run solutions`）

- [ ] **Step 1: `npm run solutions && npm test && npm run check && npm run shot`**，Expected: 全綠、`[grow] calls=` 每張 ≤ 150（衛星島與船加上去之後最可能超：超了就把 `sat.*` 的 compound 合併、船減到 4 艘，記 ledger）。
- [ ] **Step 2: 看 `shots/`**：每回合有東西長（`mid.png` 第 4 回合主島至少 4 個物品在 Lv2 以上）、衛星島有反應、環狀線不擋建築。
- [ ] **Step 3: 索引**：README 加一列 `3.5 | 2026-10-25-03b-levels-links-satellites.md | 41 級、因果光點、等待手勢、衛星島與海面 | 完成（分支 …）`。
- [ ] **Step 4: Commit** `git commit -m "docs: 計畫 3.5 收尾、正解重產、截圖組"`
- [ ] **Step 5: 手動遊玩**（請使用者）：亂放一局看每回合是否都有東西動、光點是否看得出誰幫誰、卡住的東西是否轉頭；照正解玩一局看倒數兩回合與寶箱。

---

## 自我檢查紀錄

- **規格覆蓋**：§5 max 表 → Task 1；§5.1 新級 → Task 3；§5.3 衛星島與海 → Task 5；§6.5 #6 → Task 2；§7.2 因果光點、等待手勢 → Task 4、Task 1（事件）；§7.2 鏡頭不跟 → 已在 main。**不在本計畫**：§8 結局（石堆降落場、飛彈）→ 計畫 4。
- **型別一致**：`via: string[]` 由 Task 1 產生、Task 4 消費；`wait` 事件形狀 `{ kind, item, waits:[{item, for}] }` Task 1 → Task 4 → director（Task 1 的 DURATIONS）；`rats` builder 由 rat.js 匯出給 satellites（Task 5）；`fireworks` kind 在 Task 3 的 parts.js 建並由 baseball.js 用；Task 4 只加 `spark`。
- **數字核對**：41 級 = 6+6+5+6+3+5+4+6 ✓；骨架動畫：機器鼠 10 + 柴犬 1 = 11 ≤ 12（石堆的 2 隻老鼠只在 rat ≥3 且非賽博最終型態時同時存在：賽博 Lv5 時 10 隻軍團 + 石堆 2 隻 = 12 + 柴犬 = 13 ✗ → **石堆老鼠在 rat ≥5 且 cyber 時不畫**，記進 Task 5 的 view）；小人：少棒 3 + 觀眾 6 + 球員 2 + 工程師 4 + 偵防師 1 + 人龍 10 + 遊樂場 2 + 森林 2 + 島民 6 + 工人 0 = 36 ≤ 48 ✓。
- **比例**：規格新增約 90 行，計畫約 260 行，表格是規格沒有的幾何與數值決定。
