# 計畫 5 最終章（宣告、趕工、飛彈、結局尾聲）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 第 8 個物品放完之後有故事：宣告（紅光、全島抬頭、倒數數字）→ 三回合趕工（每一級由小人揮鋤頭蓋出來）→ 飛彈飛向 101、三種結果各有畫面 → 真結局各有一段尾聲 → 停 2 秒才出標題卡。

**Architecture:** 遊戲層（`game.js`）在倒數回合最前面插合成事件 `countdown`，倒數完再演一個「終局回合」（`missile`＋真結局的 `epilogue`），然後 `show.hold(2)` 再出標題卡。合成事件帶 `flag`，舞台照舊折進 `stage.flags`（`alarm`／`missile`／`epilogue`），各模組的 `view` 讀旗標畫自己的終局型態（101 彎 L／黑塔／母艦、降落場、老鼠上屋頂），新模組 `actors/finale.js` 畫紅光、飛彈、UFO、外星生物、紅車並寫三個劇本。`turn.js` 多一條趕工規則（倒數回合的非關鍵升級由最近的小人揮鋤頭蓋出來）與終局模式。小人的躺平／三眼是全島效果 `mood`。

**Tech Stack:** 原生 ES modules、three.js（vendor）、node:test、headless Chromium（`npm run shot`）。不新增 glb。

**Spec:** `docs/superpowers/specs/2026-10-27-final-chapter-design.md`（本計畫依據，§3–§10）；主規格 `2026-10-24-grow-taipei-design.md` §8（結局）；演出層 `2026-10-25-show-layer-design.md` §4、§13–15；物品 v2 `2026-10-26-items-v2-design.md` §6、§12 的裁決（R11、R14、R15–R18）不變。

分支：從 `main`（計畫 4 併入後，`8267e5c`）開 `final-chapter`。

## Global Constraints

- 不改規則：`src/rules/spec.js`、`engine.js`、`endings.js`、`solver/` 一個數字都不動；`npm run check` 照舊剛好兩條正解。飛彈結果一律 `endings.missile(state)`。
- 節奏（`node tools/pace.mjs --check`，seed 21）：放置回合門檻不變；倒數回合 ≤ 30 s（含宣告）；終局回合（飛彈＋尾聲）≤ 22 s；單獨量：宣告（countdown n=3）≤ 5 s、飛彈 ≤ 10 s、尾聲 ≤ 12 s；趕工的一個升級 ≤ 3 s 真實時間。
- 預算（裁決 R16／R18）：主島可見名冊成員 ≤ 30、任一格 ≤ 8（老鼠不算）；draw call 一般 ≤ 250、手機／`?quality=low` ≤ 150；骨架動畫角色同時 ≤ 12（10 隻軍團＋王冠鼠＋柴犬＝12 已滿：尾聲不加任何 glb 角色）。
- 全部程式幾何（compound），紅車用現有 `kenney/space/craft_speederA.glb`；色票照 `src/actors/palette.js`。
- 跳過、reduced-motion、RESET 照 `2026-10-25-show-layer-design.md` §4.3：跳過直接到終態；reduced-motion 每回合等於跳過；RESET 中止。只有 `show.hold(2)` 不能跳過（能中止）。
- 蒙太奇規則：倒數回合 2 倍速（`ctx.speed`）、◆ 關鍵劇本照演（R11）、`keep` 的拍保留；`MONTAGE_CAP` **20 → 26 s** 真實時間，超過就拿掉走路（趕工的走路也拿掉，揮鋤頭留著）。「比現在多不超過 30 s」是目標：pace 印合計，不設門檻。
- 文件與註解：台灣用語的繁體中文。每個任務的 commit 訊息用中文。

## Review Focus

1. **RESET 在終局回合或 hold 期間**：舊的終局不能碰新的一局（不出標題卡、新局可玩）。Task 1 測試 `reset during the finale turn / during hold`。
2. **跳過終局回合**：三種結果的終態都要對（飛彈停在終點、罩子 full／101 彎 L／飛彈插池裡、mood）。Task 5 測試 `instant` 路徑。
3. **101 在完工與點燈兩階段被命中**（終局時總等級一定 ≥ 26，40320 種順序枚舉過；設計 §6）：彎 L 的 view 在 full／lit 都要有上半段轉 π/2、沒有天線／燈光秀／罩子；site／half 傳進來不炸（照 full 彎）。Task 5 測試。
4. **晶片 MAX 但沒全 MAX**：結果 shield、沒有 epilogue 事件、煙火照放、不演尾聲就出標題卡。Task 1（事件形狀）、Task 5（劇本）測試。
5. **玩家拖過鏡頭（`rig.grabbed`）在終局回合**：focus 拍跳過，其餘照演、不炸、標題卡照出。Task 8 的整局測試用假 rig `cancel()` 一次。

---

## 檔案

新增：`src/actors/finale.js`、`src/show/crowd.js`、`test/finale.test.js`、`test/crowd.test.js`、`test/helpers/endings.js`。
修改：`src/game.js`、`src/show/index.js`、`src/show/turn.js`、`src/show/bubbles.js`、`src/ui/ui.css`、`src/app.js`、`src/actors/world.js`、`src/scene/people.js`、`src/actors/parts.js`、`src/actors/tower.js`、`src/actors/rat.js`、`src/actors/satellites.js`、六個建築物品模組（`rushSite`）、`tools/pace.mjs`、`tools/shot.mjs`（`package.json` 的 shot 清單）、`test/helpers/show.js`、對應測試、規格 §13、計畫 README、`docs/assets/manifest.md`。

## 共用介面

```js
// game.js（純函式，測試與 pace 共用）
export const countdownEvent = n => ({ kind: 'countdown', n, flag: { name: 'alarm', value: n } });            // n = 3, 2, 1
export function finaleEvents(ending)                                                                             // ending = endings.resolve(state, spec)
  // → [{ kind: 'missile', outcome: ending.missile, flag: { name: 'missile', value: ending.missile } },
  //    ...(ENDINGS[ending.id].kind === 'true' ? [{ kind: 'epilogue', ending: ending.id, flag: { name: 'epilogue', value: ending.id } }] : [])]
export const TITLE_HOLD = 2;   // 標題卡前停幾秒（不能跳過）
// pick()：第 8 個放完 → 每個倒數回合 play([countdownEvent(3 − i), ...c.events, settle], { montage: true })
//   → await show.turn(finaleEvents(ending), { finale: true }) → await show.hold(TITLE_HOLD) → onFinished(ending, state)

// show/index.js
show.turn(events, { montage, finale, onMark })   // finale: true → turn.js 終局模式
show.hold(seconds) → Promise                       // 播一個 wait 拍；期間 skip() 不作用；reduced-motion 0 秒；abort() 照樣中止

// show/turn.js
//   countdown／missile／epilogue 事件 → 劇本查 modules.find(m => m.id === 'finale').script[e.kind](e, s, ctx)
//   finale: true → ctx.speed 1、不扶正零件、不補 focus／GAP、收尾照舊（home、world、focus home final）
//   蒙太奇趕工規則（設計 §5）：grow 事件依序 key → 完整劇本；e.jump → [apply, levelUp]；劇本有 keep 拍 → 蒙太奇過濾；
//     mod.rushSite?.(e.to, s) 回點 → rush(e, site)；否則蒙太奇過濾
export const RUSH_BUILD = 1.6;   // 揮鋤頭秒數（演出時間；2 倍速下 0.8 s 真實）
//   rush(e, site) = [B.walk(hero, c => frontOf(site, site.r, c.nav)), B.gesture(hero, 'build', RUSH_BUILD, { at: site }), B.apply(e), B.levelUp(e.item), B.home(hero)]
//   hero = once(c => heroNear(c, site))；找不到 → [B.apply(e), B.levelUp(e.item)]

// show/crowd.js（從 chip.js／typhoon.js 抽出的共用小工具）
export const islanders = ctx => [...]                 // 主島上、露出來、日常（mode 'home'）、不在進場、people walker 的成員（同 chip.js 的 islanders）
export function heroNear(ctx, p)                      // islanders 裡離 p 最近的；沒有 → null
export function lookUp(B, at, dur, max = 24)          // { look: [gesture look × max], release: B.home(...) }（同 chip.js everyoneLooksUp，at 可指定）
export function crowd(B, fn)                          // 演到才算的一群拍（同 typhoon.js 的 crowd）

// actors/<item>.js（milk、chip、bulb、token、boba、baseball）
export function rushSite(n, s) → { x, y, z, r } | null   // 第 n 級要蓋的東西在主島上的位置與站位半徑；null = 不趕工

// actors/finale.js
export const id = 'finale';
export function view(lv, flags)   // flags.alarm → 'finale.flare'；flags.missile → 'finale.missile'（+ deflect 的 'finale.splash'）；
                                  // flags.epilogue === 'cyber' → 'finale.car'；'alien' → 'finale.ufos'、'finale.aliens'
export const builders = { flare, missile, aliens }   // ufos 用 compound；car 用 parts.js 的 orbit
export const script = { countdown(e, s, ctx), missile(e, s, ctx), epilogue(e, s, ctx) };
export const FLARE_AT = { x: -6, y: 2.5, z: -30 };   // 建造者可調，但要在 16:9 與 390×844 的全景裡（NDC ±0.9）
export const FLIGHT = 2.5, DEFLECT = 1.2, HOLD_END = 1.0;

// actors/parts.js
fireworks(spec)：spec.once → 只放一發（1.2 s）然後整個藏起來
// 零件 missile（finale.js builders）：object.userData.launch({ speed })；建好即終態（飛完）；update 推自己的時鐘；
//   機頭朝前進方向；outcome 'shield' 飛完藏起來＋一發煙火；'deflect' 第二段掉進溫泉、終態斜插；'hit' 終態卡在 101 彎角

// actors/world.js
worldEffects(lv, flags, meta) → { ..., mood: flags.missile === 'hit' ? 'lie' : flags.epilogue === 'alien' ? 'alien' : 'normal' }
// scene/people.js
people.setMood(mood)   // 'lie'：所有小人躺平（繞 x −90°）、右手比讚；'alien'：額頭多第三隻眼（InstancedMesh 'eye3'）；'normal' 還原

// actors/tower.js
view(lv, flags, meta)：flags.missile === 'shield' → tower.shield = shieldSpec('full')；'hit' → body 彎 L（bent）、無 antenna／show／shield；
                       flags.epilogue === 'cyber' → 黑塔（body 顏色 C.ink、trim 霓虹）＋ 'tower.screen'；'alien' → 母艦（底座抬 1.0、頂端倒扣 dome、底下綠光盤）
export function body(stage, { bent = false, dark = false, ship = false } = {})

// show/bubbles.js
bubbles.show(head, { text: '…' }, dur)   // 跑馬燈：<span class="text">，CSS 字級小一號、可兩行

// test/helpers/endings.js
export const EXAMPLE = { hit: [...order], deflect: [...order] }   // 求解器枚舉裡第一個 resolve().missile 為 hit／deflect 的順序（測試釘住）
export function finaleStep(state) → { events: finaleEvents(resolve(state)), ending }
// test/helpers/show.js：turnSteps(order) 不變；新增 closingEvents(i, events) = [countdownEvent(3 − i), ...events, { kind: 'settle' }]
```

---

### Task 1: 遊戲層與演出層骨架（合成事件、終局回合、hold、finale 模組雛形）

**Files:**
- Create: `src/actors/finale.js`（雛形：`view` 回 `{}`；`script.countdown` → `[B.bubble('tower', String(e.n), 1.2 × ctx.speed)]`；`script.missile`／`epilogue` → `[B.apply(e)]`）
- Modify: `src/game.js`, `src/show/index.js`, `src/show/turn.js`（拿掉 `COUNTDOWN` 前綴；countdown／missile／epilogue 查 finale 劇本；`finale` 模式）, `src/app.js`（modules 加 finale；`onFinished` 不再切夜晚）, `test/helpers/show.js`（`ALL` 加 finale；`closingEvents`）
- Test: `test/game.test.js`, `test/show.test.js`, `test/turn.test.js`

**Interfaces:** Produces `countdownEvent`、`finaleEvents`、`TITLE_HOLD`、`show.hold`、`show.turn(…, { finale })`、turn.js 的劇本查找。

- [ ] **Step 1: Write the failing tests**

```js
// test/game.test.js
test('closing turns carry a countdown event first (3, 2, 1), then the finale turn, then hold, then onFinished', async () => {
  // 假演出層記下 turns 與 holds；正解放完：turns.length === 8 + 3 + 1；turns[8].events[0] deepEqual countdownEvent(3)、[9] 2、[10] 1；
  // turns[11].opts.finale === true 且 events deepEqual finaleEvents(resolve(state))；holds deepEqual [2]；onFinished 在 hold resolve 之後才呼叫（順序用計數）
});
test('finaleEvents: true ending → missile shield + epilogue; chip max but not all max → missile shield only; else missile hit/deflect only', () => {});
test('reset during the finale turn or during hold: no onFinished, new game playable (review focus 1)', async () => {});
// test/show.test.js
test('hold(s) plays s seconds, ignores skip, ends on abort; reduced-motion resolves at once', async () => {});
test('turn(events, { finale: true }) runs at speed 1 and ends on the overview with everyone home', async () => {});
// test/turn.test.js
test('montage turns no longer prepend 3-2-1; a countdown event plays the finale module script (one digit, 1.2 s real)', () => {});
test('missile / epilogue events look up finale.script[kind]; finale mode adds no lead focus, no GAP, no upright', () => {});
```

- [ ] **Step 2: Run** `node --test test/game.test.js test/show.test.js test/turn.test.js` → FAIL（`countdownEvent` 未定義等）
- [ ] **Step 3: Implement**
  - `game.js`：`countdownEvent`、`finaleEvents`、`TITLE_HOLD`；`pick()` 倒數回合 `play([countdownEvent(3 − i), ...c.events, { kind: 'settle' }], { montage: true })`；之後 `const ending = endings.resolve(state, spec); ui.setBusy(true); await show.turn(finaleEvents(ending), { finale: true })`（同 `play` 的 try/finally 與世代檢查）→ `await show.hold(TITLE_HOLD)` → 世代仍同才 `finished = true; onFinished(ending, state)`。
  - `show/index.js`：`hold(s)`（`timeline.play([B.wait(s)], ctx)`，`holding = true`；`skip()` 在 holding 時 return；`abort()` 照舊；reduced 時 `s = 0`）；`turn` 把 `finale` 傳給 `buildTurn`。
  - `turn.js`：`buildTurn(events, { …, montage, finale })`；`ctx.speed = montage ? MONTAGE_SPEED : 1`；finale 時跳過 upright 與 lead；`kind` 為 countdown／missile／epilogue 時 `sc = mod('finale')?.script`、`fn = sc?.[e.kind]`，沒劇本就 `[B.apply(e)]`；拿掉 `COUNTDOWN`／`COUNTDOWN_DUR`。
  - `app.js`：`modules` 加 `finale`；`onFinished` 只出標題卡。
  - `test/helpers/show.js`：`IDS` 加 `'finale'`；`export const closingEvents = (i, events) => [countdownEvent(3 - i), ...events, { kind: 'settle' }]`。
- [ ] **Step 4: Run** `npm test` → 全綠（既有測試裡 montage 的 3-2-1 斷言要改成 countdown 事件）
- [ ] **Step 5: Commit** `feat(finale): 倒數事件、終局回合、標題卡前 hold 2 秒、finale 模組雛形`

---

### Task 2: 趕工規則與六個模組的 `rushSite`

**Files:**
- Create: `src/show/crowd.js`, `test/crowd.test.js`
- Modify: `src/show/turn.js`（rush）, `src/actors/{milk,chip,bulb,token,boba,baseball}.js`（`rushSite`）, `src/actors/chip.js`／`typhoon.js`（改用 crowd.js 的 `islanders`／`lookUp`／`crowd`，行為不變）
- Test: `test/turn.test.js`, `test/crowd.test.js`, `test/budget.test.js`（不變，重跑）

**Interfaces:** Consumes Task 1 的 `closingEvents`。Produces `crowd.js`、`rushSite`、`RUSH_BUILD`。

- [ ] **Step 1: Write the failing tests**

```js
// test/turn.test.js（假模組：script.grow[n] 帶 key／keep／普通；rushSite 回點或 null）
test('montage grow: key → full script; jump → apply+levelUp; keep beat in script → filtered script; rushSite point → walk+build+apply+levelUp+home; rushSite null → filtered script', () => {});
test('rush with no hero near (empty roster) → apply + levelUp only', () => {});
test('rush beats are tagged rush; over MONTAGE_CAP the rush walk is dropped but the build gesture stays', () => {});
// test/crowd.test.js（headlessShow：放到有島民與工程師的狀態）
test('islanders excludes hidden, arriving, riding, model members and anyone off the main island; heroNear returns the nearest one', async () => {});
test('lookUp turns at most 24 islanders toward the point and release sends them home', async () => {});
// test/finale.test.js 先放一個：每個 rushSite 的點
test('every rushSite point of both solutions lies on the main island and its frontOf(site, r, nav) is walkable (within 0.6 of the request)', async () => {});
```

- [ ] **Step 2: Run** `node --test test/turn.test.js test/crowd.test.js test/finale.test.js` → FAIL
- [ ] **Step 3: Implement**
  - `crowd.js`：照介面；`chip.js` 的 `islanders`／`everyoneLooksUp` 與 `typhoon.js` 的 `crowd` 改成 import（測試不變）。
  - `turn.js`：`MONTAGE_CAP` 20 → 26；蒙太奇分支依設計 §5 的優先序；rush 拍標 `rush: true`；`MONTAGE_CAP` 過濾改成 `b.keep || (b.kind !== 'walk')`（既有規則已經是這樣，確認 rush 的 walk 也被拿掉、gesture 留下）。
  - `rushSite`：鮮奶（校舍／大學 `AT`，r 1.0；Lv10 鮮奶節 → 噴泉廣場）；晶片（Lv2 廠房、3 園區、4 總部、5 變電站 → 各自的 at，r `FRONT_R` 1.3；6 → null）；燈泡（2–3 路燈 `AT` r 0.8、4 夜市 `MARKET` r 1.0、5 101 → `TOWER` r 1.1、6 變電所位置；7–9 → null）；代幣（2–6、9 車站 `AT` r 1.2；7、8、10 → null）；珍奶（2–4 攤車／店 `AT` r 0.9；5、6、7 → null）；棒球（2–7 球場 `AT` r `FRONT_R` 1.6；8 → null）。
- [ ] **Step 4: Run** `npm test` 與 `node tools/pace.mjs --check`（倒數回合 ≤ 30 s；印每回合秒數進報告）→ 綠
- [ ] **Step 5: Commit** `feat(finale): 倒數回合趕工——非關鍵升級由最近的小人揮鋤頭蓋出來；crowd.js 共用抬頭／群演`

---

### Task 3: 宣告（紅光、全島抬頭、數字）

**Files:**
- Modify: `src/actors/finale.js`（`view` 的 flare、`builders.flare`、`script.countdown`）, `test/finale.test.js`

**Interfaces:** Produces `FLARE_AT`、`'finale.flare'`（pulse 依 `flags.alarm`：3 → 1 Hz、2 → 2 Hz、1 → 3 Hz）。

- [ ] **Step 1: Write the failing tests**

```js
test('view: alarm 3/2/1 draws finale.flare with pulse 1/2/3 Hz; no alarm or missile set → no flare', () => {});
test('countdown n=3 live: flare blinks in, visible islanders look at FLARE_AT and say ！, the digit 3 shows on 101 for 1.2 s real, everyone released; ≤ 5 s real at montage speed', async () => {});
test('countdown n=2 / n=1: only the digit (≤ 2 s real)', async () => {});
test('FLARE_AT projects inside NDC ±0.9 on the 16:9 overview and on the 390×844 portrait overview (lit-stage skyline)', () => {});
```

- [ ] **Step 2: Run** `node --test test/finale.test.js` → FAIL
- [ ] **Step 3: Implement**：flare = compound（sphere r 0.9 glow 紅橘 `0xff5a3c`＋cylinder 光柱高 6 半透明不投影）＋ `update` 脈動（emissiveIntensity 隨 Hz）；劇本照設計 §4（`lookUp(B, FLARE_AT, 1.2 × ctx.speed)`、`crowd` 的「！」0.8 × speed、`B.bubble('tower', '3', 1.2 × speed)`）。
- [ ] **Step 4: Run** `npm test` → 綠；`node tools/pace.mjs --check` 倒數 1 ≤ 30
- [ ] **Step 5: Commit** `feat(finale): 宣告——海平面紅光、全島抬頭、101 頭上倒數數字一回合一個`

---

### Task 4: 小人姿勢與全島效果（躺平比讚、第三隻眼、mood）

**Files:**
- Modify: `src/scene/people.js`（`setMood`、`eye3` InstancedMesh、lie 姿勢）, `src/actors/world.js`（`mood`）, `src/app.js`（`showWorld` 套 `people.setMood(w.mood)`）, `test/people.test.js`, `test/world.test.js`

**Interfaces:** Produces `people.setMood('normal' | 'lie' | 'alien')`、`worldEffects(...).mood`。

- [ ] **Step 1: Write the failing tests**

```js
// test/people.test.js
test('setMood lie: every walker matrix is rotated −90° about x (body lies flat, y of head ≈ ground + 0.1) and the right arm points up; walking stops', () => {});
test('setMood alien: the eye3 instanced mesh is visible with one instance per walker on the forehead centre; normal hides it', () => {});
test('low quality keeps eye3 in alien mood (the normal eyes stay skipped)', () => {});
// test/world.test.js
test('worldEffects.mood: hit → lie, alien epilogue → alien, otherwise normal; stepWorld carries mood through unchanged', () => {});
```

- [ ] **Step 2: Run** `node --test test/people.test.js test/world.test.js` → FAIL
- [ ] **Step 3: Implement**：`place()` 在 `mood === 'lie'` 時 `W` 多乘 `rx(-π/2)`（以腳底為軸、抬高 0.1）、右手 `rx(-2.6)` 固定、腿不擺；`eye3` 與 `eyeL` 同幾何，位置 `(0, 0.305, 0.064)`；`SKIP` 在 low 時**不**加 `eye3`（設計 §8：手機也要看到三眼）；`stepWorld` 的非數值欄位原樣帶過。
- [ ] **Step 4: Run** `npm test` → 綠
- [ ] **Step 5: Commit** `feat(people): 全島心情——躺平比讚、第三隻眼；worldEffects 多 mood`

---

### Task 5: 飛彈零件與三種結果

**Files:**
- Modify: `src/actors/finale.js`（`view` 的 missile／splash、`builders.missile`、`script.missile`）, `src/actors/parts.js`（`fireworks` 的 `once`）, `src/actors/tower.js`（`body(stage, { bent })`、shield full、hit 時拿掉 antenna／show／shield）, `test/finale.test.js`, `test/tower.test.js`, `test/parts.test.js`

**Interfaces:** Consumes Task 4 的 mood。Produces 零件 `missile`（`launch`）、`fireworks once`、`tower.js` 的 `bent`。

- [ ] **Step 1: Write the failing tests**

```js
// test/parts.test.js
test('fireworks once: bursts for 1.2 s then hides the mesh and stays hidden', () => {});
// test/tower.test.js
test('view with missile hit: body is bent at full and lit — the upper tiers rotated about z by π/2, no antenna/lightshow/shield parts; site/half do not throw (review focus 3)', () => {});
test('view with missile shield: tower.shield state full', () => {});
// test/finale.test.js
test('view: missile flag draws finale.missile with outcome and target (shield → dome surface toward FLARE_AT; hit → tower bend point; deflect → spring pool) and no flare; deflect adds finale.splash', () => {});
test('missile part: built finished (final pose); launch() restarts from FLARE_AT; nose points along the velocity; shield → hidden after FLIGHT with one firework; deflect → nose-down in the pool after FLIGHT + DEFLECT; hit → at the bend point', () => {});
test('missile script live, each outcome: ≤ 10 s real, ！ from the crowd mid-flight, then ♥+jump (shield) / ？ then ♪ (deflect) / mood lie (hit); camera on the overview at the end', async () => {});
test('missile script instant (skip): the final state matches the live one for all three outcomes (review focus 2)', async () => {});
```

- [ ] **Step 2: Run** `node --test test/parts.test.js test/tower.test.js test/finale.test.js` → FAIL
- [ ] **Step 3: Implement**：設計 §6。飛行拋物線 `p(k) = lerp(F, T, k) + up · 2 · sin(πk)`；`launch` 把時鐘歸零（`rate = speed`）；`hit` 的彎角 = 塔身一半高度（`body` 的 tiers 一半以上繞 z 轉 π/2、往 +x 倒；site 階段轉的是吊車桅杆＋圍籬）；shield 的 `tower.shield` 由 `B.apply(e, { only: ['tower.shield'] })` 在飛完那一拍切 full；`B.world({ mood: 'lie' })`… 注意 world 拍用 `worldEffects(stage.lv, stage.flags, meta)` 讀旗標，所以劇本在 apply 之後放一個 `B.world` 讀舞台即可。
- [ ] **Step 4: Run** `npm test` → 綠
- [ ] **Step 5: Commit** `feat(finale): 飛彈——矽盾擋下放煙火、颱風吹進溫泉、命中 101 彎 L 全島躺平`

---

### Task 6: 賽博尾聲

**Files:**
- Modify: `src/actors/finale.js`（`view` 的 car、`script.epilogue` cyber）, `src/actors/tower.js`（黑塔＋`tower.screen`）, `src/actors/rat.js`（epilogue cyber → 軍團站上 101 屋頂排一列、王冠鼠不變）, `src/show/bubbles.js`＋`src/ui/ui.css`（`{ text }`）, `test/finale.test.js`, `test/tower.test.js`, `test/rat.test.js`, `test/bubbles.test.js`

**Interfaces:** Produces `bubbles.show(head, { text })`、`'finale.car'`、`'tower.screen'`。

- [ ] **Step 1: Write the failing tests**

```js
// test/bubbles.test.js
test('{ text } bubble renders a span.text with the text; unknown shapes still throw', () => {});
// test/tower.test.js
test('view with epilogue cyber: body colours are ink, trims neon blue, tower.screen is a glowing box above the spire facing +z', () => {});
// test/rat.test.js
test('epilogue cyber: the 10 robot rats stand in a row on the 101 roof (y = tower top), the king stays crowned; skeleton count ≤ 12', () => {});
// test/finale.test.js
test('view: epilogue cyber draws finale.car (orbit, red tint, from the sea, park on the 101 roof, no rest)', () => {});
test('cyber epilogue live: night, black tower blinks in, the car flies in and parks within 4 s, the marquee text shows 3 s, the rats appear on the roof, ends on the overview; ≤ 12 s real', async () => {});
```

- [ ] **Step 2: Run** `node --test test/bubbles.test.js test/tower.test.js test/rat.test.js test/finale.test.js` → FAIL
- [ ] **Step 3: Implement**：設計 §7 賽博。`finale.car` = `orbit`（`path: 'kenney/space/craft_speederA.glb'`, tint `metalRed` → `0xe8322e`、`from` 海上 `(10, 3.5, 9)`、`at: TOWER`、`r 1.4`、`h` = 塔頂 + 0.6、`park` = 塔頂中心、`legs [1.2, 0.8]`、`speed 2.5`、無 `rest`）；劇本用 chip.js 的 `replay` 模式叫 `userData.fly({ speed: c.speed })` 演 `FLIGHT_CAR` 秒；跑馬燈 `B.bubble('tower.screen', { text: '飛天跑車今日抵台，先付清 755 萬' }, 3.0)`。
- [ ] **Step 4: Run** `npm test` → 綠；`npm run shot end=... phone-end=...`（draw call ≤ 250／150）
- [ ] **Step 5: Commit** `feat(finale): 賽博尾聲——黑塔螢幕、紅色飛天跑車停上屋頂、跑馬燈、機器鼠排隊`

---

### Task 7: 外星尾聲

**Files:**
- Modify: `src/actors/finale.js`（`view` 的 ufos／aliens、`builders.aliens`、`script.epilogue` alien）, `src/actors/tower.js`（母艦）, `src/actors/satellites.js`（降落場；石堆老鼠不畫）, `src/actors/rat.js`（epilogue alien → 變異鼠坐 101 頂、小 UFO 不畫）, `test/finale.test.js`, `test/tower.test.js`, `test/satellites.test.js`, `test/rat.test.js`

**Interfaces:** Consumes Task 4 的 `mood: 'alien'`。

- [ ] **Step 1: Write the failing tests**

```js
// test/tower.test.js
test('view with epilogue alien: base lifted by 1.0 with a green glow disc beneath, top is an inverted dome; antenna kept', () => {});
// test/satellites.test.js
test('epilogue alien: sat.rocksRing becomes the landing pad (brighter ring + 3 lights), sat.rocks rats gone', () => {});
// test/rat.test.js
test('epilogue alien: the mutant rat sits crowned on the 101 top (y ≥ tower top), rat.ufo not drawn', () => {});
// test/finale.test.js
test('view: epilogue alien draws finale.ufos (one compound, three saucers over the rocks island) and finale.aliens (three, bobbing, C.alien glow)', () => {});
test('alien epilogue live: mutant waves + ！, pad blinks in, UFOs descend 2 s, aliens blink in, mothership blinks in, mood alien, king on top + ♥, ends on the overview; ≤ 12 s real', async () => {});
test('alien epilogue on low quality draws ufos as one mesh', async () => {});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**：設計 §7 外星。UFO 碟造型沿用 rat.js `ufo` 的 parts 放大 2 倍，三個 at 石堆島 `island('rocks')` 周圍半徑 1.0；外星生物 = compound（sphere 頭 0.18、capsule 身 0.12、三顆眼 `C.ink`、`C.alien` glow）＋ `update` 上下漂 0.08；母艦底座 `pos.y += 1.0`、綠光盤 `cylinder` r 1.2 在 y 0.5。
- [ ] **Step 4: Run** `npm test` → 綠；`npm run shot alien=... phone-alien=...` ≤ 250／150
- [ ] **Step 5: Commit** `feat(finale): 外星尾聲——降落場、三台 UFO、外星生物、101 母艦、三眼島民、王冠鼠登頂`

---

### Task 8: 驗收總整理（pace、截圖、整局不變式、文件）

**Files:**
- Create: `test/helpers/endings.js`
- Modify: `tools/pace.mjs`（終局列）, `package.json`（shot 清單加 `hit`、`deflect`、`phone-alien`）, `test/chain.test.js`（整局跑到終局；`gameInvariants` 含終局；一次 `rig.cancel()` 在終局前——review focus 5）, `test/budget.test.js`（倒數回合用 `closingEvents`、加終局回合）, `docs/superpowers/specs/2026-10-27-final-chapter-design.md` §13（裁決）, `docs/superpowers/plans/README.md`（第 5 列完成；第 6 列補「其餘壞結局畫面」）, `docs/assets/manifest.md`（紅車）, `README.md`／`docs` 裡提到 3-2-1 的地方

- [ ] **Step 1: Write the failing tests**

```js
// test/helpers/endings.js + test/endings.test.js
test('EXAMPLE.hit / EXAMPLE.deflect orders resolve to missile hit / deflect (pinned from the solver enumeration)', () => {});
// test/chain.test.js
test('both solutions live through the finale: countdown events, finale turn, game invariants clean, ends on the overview; a camera grab before the finale does not break it', async () => {});
// test/budget.test.js：倒數回合含 countdown、終局回合後主島 ≤ 30／格 ≤ 8（機器鼠在屋頂不算人）
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**：`pace.mjs` 合計列多印「最終章 x s（倒數三回合＋終局；原本 51.0／52.6）」供對照（不設門檻）；兩條正解各多一列「終局 x/22 s」（`finaleEvents(resolve(state))`，`finale: true`），再跑 `EXAMPLE.hit`／`EXAMPLE.deflect` 兩局（放置與倒數 instant、終局 live）各一列「終局 x/10 s」；超過就 failures。`package.json` 的 shot：`'hit=auto=<EXAMPLE.hit 順序>'`、`'deflect=auto=<EXAMPLE.deflect 順序>'`、`'phone-alien=auto=bulb,token,milk,chip,baseball,rat,boba,typhoon&quality=low'`。
- [ ] **Step 4: Run** `npm test`、`npm run check`、`node tools/pace.mjs --check`、`npm run shot` → 全綠；把 pace 實測表與 draw call 最大值寫進規格 §10
- [ ] **Step 5: Commit** `docs,test(finale): 終局節奏列、壞結局截圖、整局不變式到終局；規格 §13 裁決、計畫 README`
