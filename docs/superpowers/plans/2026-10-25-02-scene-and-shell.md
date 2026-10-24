# 台北成長 計畫 2：場景骨架與遊戲外殼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在瀏覽器裡做出可玩的台北島：政策島質感的渲染骨架（天空、水、六角島、零件庫、日夜、背景山、小人、模型載入）、GROW 式物品列介面、照事件順序演出的導演，角色先用有等級標籤的方塊代替。

**Architecture:** 純靜態 ES module，three.js r170 本地化到 `vendor/`。`src/scene/*` 只管畫面，`src/ui/*` 只管 DOM，`src/director.js` 把計畫 1 引擎吐出的事件列表一個一個演，`src/game.js` 把三者和引擎接起來，`src/main.js` 開機。所有純函式（六角座標、日夜插值、地形高度、走路姿勢、鏡頭距離、導演排程、遊戲流程）在 Node 用 `node:test` 測；畫面用 headless Chromium 截圖（`npm run shot`）人工比對，截圖工具同時把 console 錯誤當失敗。

**Tech Stack:** three.js 0.170.0（vendored：three.module.js、OrbitControls、CSS2DRenderer、RoundedBoxGeometry、BufferGeometryUtils、SimplexNoise、GLTFLoader、DRACOLoader、SkeletonUtils、draco 解碼器）、Node ≥ 18、`node:test`、Playwright 的 Chromium 二進位（只用來截圖，不裝套件）。

**Spec:** `docs/superpowers/specs/2026-10-24-grow-taipei-design.md`（§4 玩法、§5.2–5.3 地標與背景、§7 演出層、§9 美術、§10 架構）。計畫 1 的介面：`src/rules/engine.js`（`createState/place/isComplete`）、`src/rules/endings.js`（`resolve`）、`src/rules/spec.js`（`ORDER/ITEMS/STORIES`）。

## Global Constraints

- 無建置工具、無 npm 依賴、無 CDN：所有外部程式碼放 `vendor/`，`index.html` 用 importmap 把 `three` 與 `three/addons/` 指到 `./vendor/three/`。
- 不載入 webfont；字型 `"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`。介面文字繁體中文、台灣用語。
- 不接任何追蹤或分析；localStorage 讀寫包 try/catch。
- 前景材質 `MeshStandardMaterial` roughness .78、metalness 0、不開 flatShading；背景（地形、背景樹）flatShading 且不投影。只有太陽投影（map 2048、bias −.0006、normalBias .045、radius 3）。
- 相機 fov 32、near .3、far 320；pixelRatio = min(devicePixelRatio, 1.75)，手機 1.4；ACES、exposure 1；霧色永遠等於當下 horizon。
- 六角參數：R=2.02、SPACING=2.28、TOP=0.65、WATER_Y=−0.18；axial→world：x = √3·SPACING·(q + r/2)，z = 1.5·SPACING·r。
- 色票（§9.1）：海 `#4fa6b4`、奶油 `#fff8f4`、沙 `#e9dcc6`、珊瑚 `#db6a41`、墨 `#211d1d`、黃 `#fcea8b`、草 `#bfd39c`、草地 `#cfe0a8`、岩壁 `#d2b48c`、樹 `#9bbd7e/#8aaf70/#6f9560`、牆 `#f1e7da`、窗 `#5c5650`、玻璃 `#9cc3bf`、山 `#b3c79a`、膚 `#f3c9a5`、髮 `#3a2a22`、路緣 `#e4d6c3`、發光 `#ffc777`。
- 所有隨機用 mulberry32 固定種子，同一組參數每次載入畫面相同。
- 外部模型只用 `spike/assets/` 裡已確認 CC0 的檔案，複製到 `assets/` 並列進 `assets/LICENSES.md`；首次載入總量 ≤ 6 MB。
- 整段開機包 try/catch：WebGL 或 vendor 載入失敗時，載入畫面顯示錯誤訊息，不能白畫面。

## Review Focus

1. WebGL 不可用或 vendor 檔 404：載入畫面要顯示「無法啟動 3D 畫面」加原因，不能白畫面（Task 12 用 `?simulateFail=webgl` 截 DOM 文字驗證）。
2. 演出中再點物品、或點已放過的物品：必須忽略，引擎不能被呼叫第二次（Task 11 `game.test.js`）。
3. 直式手機（9:16）：全景距離 56，整座主島含衛星島在畫面內，物品列不遮島（Task 12 手機截圖）。
4. `prefers-reduced-motion`：導演每個事件 0 ms、鏡頭直接瞬移，遊戲照常可完成（Task 10 `camera.test.js`、Task 11 `director.test.js`）。
5. 連鎖演到一半點畫面跳過：剩下的事件要立刻套用到最終狀態，物品列的 Lv 與角色高度要和引擎狀態一致（Task 11 `director.test.js`、`game.test.js`）。

---

### Task 1: 本地化 three.js、靜態伺服器、頁面骨架、截圖工具

**Files:**
- Create: `tools/vendor.sh`、`tools/serve.mjs`、`tools/shot.mjs`、`index.html`、`src/main.js`（暫時只畫一片海色）、`.gitignore`（加 `shots/`）
- Test: `test/vendor.test.js`

**Interfaces:**
- Produces:
  - `vendor/three/three.module.js`、`vendor/three/addons/{controls/OrbitControls,renderers/CSS2DRenderer,geometries/RoundedBoxGeometry,utils/BufferGeometryUtils,utils/SkeletonUtils,math/SimplexNoise,loaders/GLTFLoader,loaders/DRACOLoader}.js`、`vendor/three/draco/{draco_decoder.wasm,draco_wasm_wrapper.js,draco_decoder.js}`。
  - `node tools/serve.mjs [port=8766]`：零依賴靜態伺服器，MIME 含 `.js .mjs .html .css .json .glb .wasm .png .svg`，根目錄 = repo。
  - `node tools/shot.mjs <name>=<url-query> ...`（只切第一個 `=`，query 本身可含 `=`）：啟動伺服器、用 `$CHROME`（預設 `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`）對 `http://127.0.0.1:8766/index.html?<query>` 截 1280×800 到 `shots/<name>.png`；`<name>` 含 `phone` 時用 390×844；加 `--virtual-time-budget=20000`；stderr 裡 `CONSOLE` 行含 `Uncaught|Error|Failed` 就印出並 `exit 1`；`--dump-dom` 模式 `node tools/shot.mjs --dom <query>` 印 DOM 文字。
  - `package.json` scripts：`"serve": "node tools/serve.mjs"`、`"shot": "node tools/shot.mjs open= night=time=night phone=quality=low"`、`"vendor": "bash tools/vendor.sh"`。
  - `index.html`：`<div id="loading">正在組合台北島…</div>`、`<canvas id="c">`、`<div id="labels">`、`<div id="ui">`、importmap、`<script type="module" src="./src/main.js">`；`body` 背景 `radial-gradient(#fffdf9, #edddcf)`。
  - `src/main.js` 暫時：import three，建 WebGLRenderer 清成海色 `#4fa6b4`，把 `#loading` 隱藏；整段 try/catch，失敗時 `#loading` 顯示 `無法啟動 3D 畫面：<錯誤訊息>`。

- [ ] **Step 1: 寫 `test/vendor.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
const files = ['vendor/three/three.module.js','vendor/three/addons/controls/OrbitControls.js','vendor/three/addons/renderers/CSS2DRenderer.js',
  'vendor/three/addons/geometries/RoundedBoxGeometry.js','vendor/three/addons/utils/BufferGeometryUtils.js','vendor/three/addons/utils/SkeletonUtils.js',
  'vendor/three/addons/math/SimplexNoise.js','vendor/three/addons/loaders/GLTFLoader.js','vendor/three/addons/loaders/DRACOLoader.js',
  'vendor/three/draco/draco_decoder.wasm','vendor/three/draco/draco_wasm_wrapper.js'];
for (const f of files) test(`${f} vendored and non-empty`, () => { assert.ok(existsSync(f), f); assert.ok(statSync(f).size > 1000, f); });
test('three is r170 and importable in Node', async () => {
  const THREE = await import('../vendor/three/three.module.js');
  assert.equal(THREE.REVISION, '170'); assert.ok(new THREE.Vector3(1, 2, 3).length() > 3.7);
});
test('index.html importmap points three and three/addons/ at vendor', () => {
  const html = readFileSync('index.html', 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.imports.three, './vendor/three/three.module.js');
  assert.equal(map.imports['three/addons/'], './vendor/three/addons/');
  assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg|cdnjs/);
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`，Expected: vendor 檔案不存在的 FAIL

- [ ] **Step 3: 寫 `tools/vendor.sh`**（用 `curl -fsSL` 從 `https://cdn.jsdelivr.net/npm/three@0.170.0/` 抓上面每個檔到對應路徑；`examples/jsm/<sub>` → `vendor/three/addons/<sub>`；`examples/jsm/libs/draco/` → `vendor/three/draco/`；任何檔案 < 1000 bytes 就 exit 1）並執行 `npm run vendor`

- [ ] **Step 4: 寫 `index.html`、`src/main.js`、`tools/serve.mjs`、`tools/shot.mjs`**（照 Interfaces）

- [ ] **Step 5: 跑測試確認通過** — Run: `npm test`，Expected: 全過

- [ ] **Step 6: 截圖驗證** — Run: `npm run shot`，Expected: `shots/open.png`、`shots/night.png`、`shots/phone.png` 存在，無 console 錯誤；用 Read 看 `shots/open.png` 是一片海色、沒有載入文字。再 Run: `node tools/shot.mjs --dom simulateFail=vendor`（main.js 看到此參數就 `throw new Error('模擬 vendor 失敗')`），Expected: 輸出含 `無法啟動 3D 畫面：模擬 vendor 失敗`

- [ ] **Step 7: Commit**

```bash
git add tools index.html src/main.js vendor test/vendor.test.js package.json .gitignore
git commit -m "scene: 本地化 three.js、靜態伺服器、截圖工具、頁面骨架"
```

---

### Task 2: 六角座標與橋 `hex.js`、`bridge.js`

**Files:**
- Create: `src/scene/hex.js`、`src/scene/bridge.js`
- Test: `test/hex.test.js`

**Interfaces:**
- Produces（全部純函式，無 three）:
  ```js
  // hex.js
  export const R = 2.02, SPACING = 2.28, TOP = 0.65, WATER_Y = -0.18, PLATEAU_TOP = 1.15, RING_R = 1.8;
  export function axialToWorld(q, r) → { x, z }
  export function hexCorners(cx, cz, radius) → [{x, z}]×6    // pointy-top：第一個角在 (cx, cz − radius)，逆時針
  export const MAIN_CELLS = [[0,0],[1,0],[-1,0],[0,1],[-1,1],[0,-1],[1,-1]];   // 中心 + 一圈
  export const PLATEAU_CELLS = [[0,-1],[1,-1]];                                  // 北側兩格墊高（陽明山、溫泉）
  export const NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  export function adjacentPairs(cells) → [[cellA, cellB]]    // 不重複、a<b 以索引序
  export function edgeMidpoint(cellA, cellB, radius = RING_R) → { a:{x,z}, b:{x,z} }  // 兩島步道環上彼此最近的點
  export const SATELLITES = [ { kind:'lighthouse', q:5, r:-1 }, { kind:'windmill', q:-5, r:1 }, { kind:'rocks', q:3, r:3 },
    { kind:'pyramid', q:-2, r:4 }, { kind:'playground', q:5, r:-4 }, { kind:'forest', q:-4, r:-2 }, { kind:'chest', q:1, r:-5 } ];
  export function cellTop([q, r]) → TOP | PLATEAU_TOP
  // bridge.js
  export function bridgeDecks(a:{x,z}, b:{x,z}, { n = 9, arch = 0.08 } = {}) → [{ x, y, z, ry, len }]  // y = TOP + sin(π·i/(n−1))·arch
  ```

- [ ] **Step 1: 寫 `test/hex.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, SPACING, TOP, axialToWorld, hexCorners, MAIN_CELLS, PLATEAU_CELLS, adjacentPairs, edgeMidpoint, SATELLITES, cellTop, RING_R } from '../src/scene/hex.js';
import { bridgeDecks } from '../src/scene/bridge.js';
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('axialToWorld follows the pointy-top formula', () => {
  const p = axialToWorld(1, 0); assert.ok(near(p.x, Math.sqrt(3) * SPACING)); assert.ok(near(p.z, 0));
  const q = axialToWorld(0, 1); assert.ok(near(q.x, Math.sqrt(3) * SPACING / 2)); assert.ok(near(q.z, 1.5 * SPACING));
});
test('hexCorners: six corners on the circumradius, first one toward -z', () => {
  const c = hexCorners(1, 2, R); assert.equal(c.length, 6);
  for (const p of c) assert.ok(near(Math.hypot(p.x - 1, p.z - 2), R));
  assert.ok(near(c[0].x, 1)); assert.ok(near(c[0].z, 2 - R));
});
test('main island is a centre plus one ring, plateau cells are in it, 12 adjacencies', () => {
  assert.equal(MAIN_CELLS.length, 7);
  for (const c of PLATEAU_CELLS) assert.ok(MAIN_CELLS.some(m => m[0] === c[0] && m[1] === c[1]));
  assert.equal(adjacentPairs(MAIN_CELLS).length, 12);
  assert.equal(cellTop([0, 0]), TOP); assert.ok(cellTop([0, -1]) > TOP);
});
test('neighbouring tiles leave a ~0.45 water channel', () => {
  const a = axialToWorld(0, 0), b = axialToWorld(1, 0);
  assert.ok(near(Math.hypot(b.x - a.x, b.z - a.z) - 2 * (R * Math.sqrt(3) / 2), 0.45, 0.05));
});
test('edgeMidpoint gives two points on the ring circles facing each other', () => {
  const { a, b } = edgeMidpoint([0, 0], [1, 0]);
  const ca = axialToWorld(0, 0), cb = axialToWorld(1, 0);
  assert.ok(near(Math.hypot(a.x - ca.x, a.z - ca.z), RING_R)); assert.ok(near(Math.hypot(b.x - cb.x, b.z - cb.z), RING_R));
  assert.ok(b.x > a.x);
});
test('satellites are outside the main island and apart from each other', () => {
  assert.equal(SATELLITES.length, 7);
  for (const s of SATELLITES) { const p = axialToWorld(s.q, s.r); assert.ok(Math.hypot(p.x, p.z) > 3 * SPACING, s.kind); }
  for (const s of SATELLITES) for (const t of SATELLITES) if (s !== t) {
    const p = axialToWorld(s.q, s.r), u = axialToWorld(t.q, t.r); assert.ok(Math.hypot(p.x - u.x, p.z - u.z) >= SPACING * 1.9, `${s.kind}-${t.kind}`);
  }
});
test('bridgeDecks: 9 decks from a to b with a sine arch', () => {
  const d = bridgeDecks({ x: 0, z: 0 }, { x: 1, z: 0 });
  assert.equal(d.length, 9); assert.ok(near(d[0].x, 0, 0.1)); assert.ok(near(d[8].x, 1, 0.1));
  assert.ok(near(Math.max(...d.map(k => k.y)), TOP + 0.08, 1e-6)); assert.ok(near(d[0].y, TOP, 1e-6));
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`，Expected: 找不到 `hex.js`
- [ ] **Step 3: 實作 `src/scene/hex.js`、`src/scene/bridge.js`**
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`，Expected: 全過
- [ ] **Step 5: Commit** — `git add src/scene/hex.js src/scene/bridge.js test/hex.test.js && git commit -m "scene: 六角座標、主島格、衛星島、橋"`

---

### Task 3: 日夜 `daynight.js`

**Files:**
- Create: `src/scene/daynight.js`
- Test: `test/daynight.test.js`

**Interfaces:**
- Produces:
  ```js
  export const KEYFRAMES = [ [0,0x1e2c58,0x3f4f80,0xb4c2ff,1.15,0x94a2d8,0x64566a,1.85,1,0x5a88b2], [300,…], [360,…], [450,…], [720,…], [960,…], [1065,…], [1140,…], [1260,…], [1440,=0] ];  // 設計文件 §9.2 / 提示詞 §4 的表，欄位：minute, skyTop, horizon, sunColor, sunI, hemiSky, hemiGround, hemiI, night, water
  export const TIMES = { day: 600, dusk: 1065, night: 1260 };     // 開局 10:00；燈泡 Lv3 → 黃昏；燈泡 Lv4／結局 → 夜晚
  export function lerpColor(a, b, t) → int     // 每通道線性、四捨五入
  export function sample(minute) → { skyTop, horizon, sunColor, sunI, hemiSky, hemiGround, hemiI, night, water }   // minute 先 mod 1440
  export function sunDirection(minute) → { x, y, z }   // 先量化到 10 分鐘；t = clamp((min−360)/720,0,1)；az = π(.15+.7t)；el = .35 + sin(tπ)·.75；dir = normalize(cos az·cos el, sin el, .55·cos el + .35)
  ```

- [ ] **Step 1: 寫 `test/daynight.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYFRAMES, TIMES, lerpColor, sample, sunDirection } from '../src/scene/daynight.js';
test('keyframes cover a full day and wrap', () => {
  assert.equal(KEYFRAMES[0][0], 0); assert.equal(KEYFRAMES.at(-1)[0], 1440);
  assert.deepEqual(KEYFRAMES.at(-1).slice(1), KEYFRAMES[0].slice(1));
  assert.deepEqual(sample(1440), sample(0));
});
test('exact keyframe at noon', () => {
  const s = sample(720); assert.equal(s.skyTop, 0x9fd0ec); assert.equal(s.horizon, 0xf4eee3); assert.equal(s.night, 0); assert.equal(s.sunI, 2.9);
});
test('interpolates linearly between keyframes', () => {
  assert.equal(sample(1200).night, 0.875);                 // 1140:.75 → 1260:1
  assert.equal(lerpColor(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(sample(1200).sunI, 1.25);
});
test('TIMES map to the spec moods', () => {
  assert.equal(sample(TIMES.day).night, 0); assert.ok(sample(TIMES.dusk).night > 0 && sample(TIMES.dusk).night < 1); assert.equal(sample(TIMES.night).night, 1);
});
test('sunDirection is unit length, high at noon, and quantized to 10 minutes', () => {
  const d = sunDirection(720); assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9); assert.ok(d.y > 0.85);
  assert.deepEqual(sunDirection(723), sunDirection(720)); assert.notDeepEqual(sunDirection(730), sunDirection(720));
  assert.ok(sunDirection(0).z > 0, 'sun stays on the camera side');
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`，Expected: 找不到 `daynight.js`
- [ ] **Step 3: 實作 `src/scene/daynight.js`**（KEYFRAMES 的十行數值照提示詞 §4 原文抄）
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: Commit** — `git add src/scene/daynight.js test/daynight.test.js && git commit -m "scene: 日夜 keyframe 插值與太陽方位"`

---

### Task 4: 零件庫 `kit.js`

**Files:**
- Create: `src/scene/kit.js`、`src/scene/random.js`
- Test: `test/kit.test.js`

**Interfaces:**
- Produces:
  ```js
  // random.js
  export function mulberry32(seed) → () => number     // [0,1)
  // kit.js
  export const KINDS = ['box','rbox','cylinder','cone','cone6','sphere','ico','dome','torus','prism','hip','leaf','trunk','glowbox','glowsphere'];
  export const GLOW = 0xffc777;
  export function createKit(THREE, { seed = 1 } = {}) → kit
  kit.part(kind, { pos:[x,y,z], scale:number|[sx,sy,sz], rot?:[rx,ry,rz], color:number }) → entry   // entry = { kind, index, color }
  kit.count(kind) → number
  kit.build() → THREE.Group        // 每個用過的 kind 一個 InstancedMesh；solid: MeshStandardMaterial({roughness:.78, metalness:0}); glow kinds: emissive GLOW, emissiveIntensity 0；castShadow/receiveShadow = true；每 instance scale × (1 ± 0.0072) 用 mulberry32(seed)
  kit.setColor(entry, color) → void   // build 後改色（高亮用），instanceColor.needsUpdate
  kit.glowMaterials → Material[]      // 夜晚把 emissiveIntensity 設成 night×3.2
  ```
  幾何定義照提示詞 §5：`rbox` = RoundedBoxGeometry(1,1,1,2,0.12)、`cylinder` 14 段、`cone` 10 段、`cone6` 6 段、`sphere`(0.5,14,10)、`ico`(0.5,1)、`dome` 半球、`torus`(0.5,0.055,6,24)、`prism` 3 段柱、`hip` = ConeGeometry(0.5,1,4).rotateY(π/4).scale(√2,1,√2)、`leaf` = ico(0.5,1) 頂點抖動 ±8%、`trunk` = CylinderGeometry(0.32,0.5,1,9)。

- [ ] **Step 1: 寫 `test/kit.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKit, KINDS, GLOW } from '../src/scene/kit.js';
import { mulberry32 } from '../src/scene/random.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(7), b = mulberry32(7); const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b())); assert.ok(xs.every(x => x >= 0 && x < 1));
});
test('one InstancedMesh per used kind with the right counts', () => {
  const kit = createKit(THREE);
  kit.part('box', { pos: [0, 0, 0], scale: 1, color: 0xff0000 }); kit.part('box', { pos: [1, 0, 0], scale: 1, color: 0xff0000 }); kit.part('cone', { pos: [0, 1, 0], scale: [1, 2, 1], color: 0x00ff00 });
  const g = kit.build();
  assert.equal(g.children.length, 2); assert.ok(g.children.every(m => m.isInstancedMesh));
  assert.equal(kit.count('box'), 2); assert.equal(kit.count('cone'), 1);
});
test('instance matrix carries position and (jittered) scale', () => {
  const kit = createKit(THREE); const e = kit.part('box', { pos: [1, 2, 3], scale: 2, color: 0xffffff }); const g = kit.build();
  const m = new THREE.Matrix4(); g.children[0].getMatrixAt(e.index, m);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s);
  assert.deepEqual([p.x, p.y, p.z], [1, 2, 3]); assert.ok(Math.abs(s.x - 2) < 2 * 0.0073);
});
test('materials: clay standard for solids, emissive for glow kinds, shadows on', () => {
  const kit = createKit(THREE); kit.part('box', { pos: [0, 0, 0], scale: 1, color: 0xffffff }); kit.part('glowbox', { pos: [0, 0, 0], scale: 1, color: 0xffffff });
  const g = kit.build(); const solid = g.children.find(m => m.material.emissive.getHex() === 0), glow = g.children.find(m => m !== solid);
  assert.equal(solid.material.roughness, 0.78); assert.equal(solid.material.metalness, 0); assert.equal(solid.material.flatShading, false);
  assert.equal(glow.material.emissive.getHex(), GLOW); assert.equal(kit.glowMaterials.length, 1);
  assert.ok(solid.castShadow && solid.receiveShadow);
});
test('setColor after build updates instanceColor; unknown kind throws', () => {
  const kit = createKit(THREE); const e = kit.part('box', { pos: [0, 0, 0], scale: 1, color: 0x000000 }); const g = kit.build();
  kit.setColor(e, 0xff0000); const c = new THREE.Color(); g.children[0].getColorAt(e.index, c); assert.equal(c.getHex(), 0xff0000);
  assert.throws(() => kit.part('banana', { pos: [0, 0, 0], scale: 1, color: 0 }), /unknown kind/);
  assert.ok(KINDS.includes('hip'));
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`，Expected: 找不到 `kit.js`
- [ ] **Step 3: 實作 `src/scene/random.js`、`src/scene/kit.js`**（`rbox` 從 `../../vendor/three/addons/geometries/RoundedBoxGeometry.js` 相對匯入，讓 Node 也能跑；瀏覽器端同一路徑有效）
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: Commit** — `git add src/scene/kit.js src/scene/random.js test/kit.test.js && git commit -m "scene: 實例化零件庫"`

---

### Task 5: 渲染器、光、天空、水 `renderer.js`、`sky.js`、`water.js`

**Files:**
- Create: `src/scene/renderer.js`、`src/scene/sky.js`、`src/scene/water.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces（瀏覽器）:
  ```js
  // renderer.js
  export function createRenderer(THREE, { canvas, quality }) → { renderer, scene, camera, labels (CSS2DRenderer), sun, hemi, fill, resize(), setTime(minute), render(), dispose() }
  //   quality: 'high'|'medium'|'low'（pixelRatio 1.75 / 1.4 / 1；shadow map 2048 / 1024 / off）
  //   setTime(minute)：用 daynight.sample 設 sun/hemi/fill 顏色強度、fog 顏色 = horizon、天空 uniforms、水色、body 背景漸層不變
  // sky.js
  export function createSky(THREE) → { mesh, setTime(sampleResult, sunDir) }   // SphereGeometry(170) BackSide ShaderMaterial，uTop/uHorizon/uSunDir/uSun/uNight，太陽光暈 pow(dot,18)·.35，夜晚 hash 星星 > .9965
  // water.js
  export function createWater(THREE) → { mesh, update(t), setColor(hex) }     // CircleGeometry(160,64) ShaderMaterial，淺 #a4d4da 深 #6fa9b8，兩組正弦漂移，離中心越遠越深，支援 fog
  ```
  `main.js`：開機建 renderer，加天空、水，`?time=day|dusk|night` 對應 `TIMES`，render loop（`requestAnimationFrame`，dt 上限 .08）。

- [ ] **Step 1: 實作三個檔案並接進 `main.js`**（天空與水的 GLSL 照提示詞 §4；`setTime` 的光線數值照 `daynight.sample`）
- [ ] **Step 2: 截圖驗證** — Run: `npm run shot`，Expected: `shots/open.png` 奶油色天空、藍綠色水面漸層；`shots/night.png` 深藍天空有星星、水面偏暗；無 console 錯誤
- [ ] **Step 3: 跑測試** — Run: `npm test`，Expected: 全過（這個任務沒有新 Node 測試；截圖是驗證）
- [ ] **Step 4: Commit** — `git add src/scene/renderer.js src/scene/sky.js src/scene/water.js src/main.js && git commit -m "scene: 渲染器、日夜光線、程序天空與水"`

---

### Task 6: 島 `island.js`、地面貼圖 `textures.js`、衛星島

**Files:**
- Create: `src/scene/island.js`、`src/scene/textures.js`
- Modify: `src/main.js`
- Test: `test/island.test.js`

**Interfaces:**
- Produces:
  ```js
  // textures.js（瀏覽器；純邏輯部分可測）
  export const GROUND_KINDS = ['brick','dots','stripes','lawn'];
  export function groundPalette(kind) → { base:hex, accent:hex }     // 純函式：brick 沙/路緣、dots 草地/草、stripes 沙/牆、lawn 草地/草
  export function groundTexture(THREE, kind, size = 256) → CanvasTexture  // 用 canvas 畫；wrapS/T Repeat
  // island.js
  export function tileLayout(cells) → [{ cell, center:{x,z}, top, corners:[{x,z}]×6 }]      // 純函式：用 hex.js
  export function buildIsland(THREE, kit, { cells = MAIN_CELLS, textures, seed = 11 }) → { group, tiles: tileLayout 結果, bridges: bridgeDecks 結果[] }
  //   每格：島面 CircleGeometry(R−0.05, 6).rotateZ(π/6).rotateX(−π/2)，MeshStandard roughness .92，貼 groundTexture，UV = 世界座標 ÷ 2.2
  //        側壁（六角柱到 WATER_Y−0.6，顏色岩壁）、步道環（半徑 RING_R、寬 .28、色 #d9c5a8，放在 top+0.01）、路緣 #e4d6c3、
  //        頂緣彩帶（高 .16、色珊瑚/黃/藍輪流）、外圈淺水環（R+0.7，半透明沙色）、白色泡沫環（R+0.16，opacity .55）
  //   台地格（PLATEAU_CELLS）用 PLATEAU_TOP，與相鄰低格之間在 kit 放 4 階 box 樓梯
  //   相鄰格之間 bridgeDecks 的每片甲板用 kit.part('box')，木色 #b48560，欄杆柱白
  export function buildSatellite(THREE, kit, sat) → Group    // 單格小島 + kind 對應的小場景（lighthouse 紅白圓柱塔、windmill 三葉、rocks 3–4 顆 ico、pyramid 5 層圓柱、playground 溜滑梯+小屋、forest 5 棵 leaf+trunk、chest 木箱）
  ```

- [ ] **Step 1: 寫 `test/island.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileLayout } from '../src/scene/island.js';
import { groundPalette, GROUND_KINDS } from '../src/scene/textures.js';
import { MAIN_CELLS, PLATEAU_CELLS, TOP, PLATEAU_TOP, R } from '../src/scene/hex.js';
test('tileLayout: one entry per cell, plateau cells raised, corners on R', () => {
  const t = tileLayout(MAIN_CELLS); assert.equal(t.length, 7);
  const plateau = t.filter(x => PLATEAU_CELLS.some(p => p[0] === x.cell[0] && p[1] === x.cell[1]));
  assert.equal(plateau.length, 2); assert.ok(plateau.every(x => x.top === PLATEAU_TOP)); assert.ok(t.filter(x => x.top === TOP).length === 5);
  for (const x of t) for (const c of x.corners) assert.ok(Math.abs(Math.hypot(c.x - x.center.x, c.z - x.center.z) - R) < 1e-6);
});
test('groundPalette has a base and accent for every kind', () => {
  for (const k of GROUND_KINDS) { const p = groundPalette(k); assert.ok(p.base >= 0 && p.accent >= 0 && p.base !== p.accent, k); }
  assert.throws(() => groundPalette('lava'));
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`
- [ ] **Step 3: 實作 `textures.js`、`island.js`，在 `main.js` 建主島（kit 共用一個）與 7 座衛星島，`kit.build()` 加進 scene**
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: 截圖驗證** — Run: `npm run shot`，Expected: 7 格主島（北側兩格較高、有樓梯）、格與格之間有水道和小拱橋、白色泡沫環、7 座衛星島各有地標；無 console 錯誤
- [ ] **Step 6: Commit** — `git add src/scene/island.js src/scene/textures.js src/main.js test/island.test.js && git commit -m "scene: 六角主島、台地、橋、衛星島、程序地面貼圖"`

---

### Task 7: 背景地形、背景樹、遠山、雲 `terrain.js`

**Files:**
- Create: `src/scene/terrain.js`
- Modify: `src/main.js`
- Test: `test/terrain.test.js`

**Interfaces:**
- Produces:
  ```js
  export function basinHeight(x, z, noise2 = () => 0) → y
  //   r = hypot(x,z)；ring = smoothstep(25, 50, r)·26；fbm = Σ 3 octaves noise2(x·f, z·f)·amp（f .025/.05/.1，amp 3/1.5/.75）·smoothstep(18,30,r)
  //   camera side: 乘 (1 − .65·smoothstep(0, 40, z))；terrace: round(y/0.6)·0.6 當 y>3；r<16 固定 −0.6（海床）
  export function heightColor(y) → hex   // ≤0 河床 0x8fb3ad、≤2 沙 0xd9c9a3、≤6 田 0xaec493、≤12 草 0xa3b986、≤20 林 0x6f8a62、否則岩 0xb2a38d
  export function treeSpots(count, rnd, heightFn) → [{ x, z, y, s, conifer:boolean }]   // 半徑 16–52、y = heightFn(x,z)、y < 1.5 的捨棄重抽（最多 count×5 次）、s ∈ [.8,1.8]
  export function buildTerrain(THREE, { noise2, quality, seed = 99 }) → { group, update(t) }
  //   170² PlaneGeometry 細分 160（low 80）、頂點色、flatShading、不投影；背景樹 InstancedMesh（high 3000 / medium 1800 / low 800；針葉 3 cone merge、闊葉 4 抖動 ico merge）；三圈遠山剪影帶 MeshBasic；12 團雲 update 時沿 +x 漂、超過 90 繞回
  ```

- [ ] **Step 1: 寫 `test/terrain.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basinHeight, heightColor, treeSpots } from '../src/scene/terrain.js';
import { mulberry32 } from '../src/scene/random.js';
test('basin: sea floor at centre, ring mountains far out, camera side pressed down', () => {
  assert.ok(basinHeight(0, 0) < 0); assert.ok(basinHeight(0, -38) > 12);
  assert.ok(basinHeight(0, 38) < basinHeight(0, -38) * 0.6);
});
test('terrace quantization only above 3', () => {
  const y = basinHeight(0, -45); assert.ok(Math.abs(y / 0.6 - Math.round(y / 0.6)) < 1e-9);
});
test('heightColor bands', () => {
  assert.equal(heightColor(-1), 0x8fb3ad); assert.equal(heightColor(1), 0xd9c9a3); assert.equal(heightColor(5), 0xaec493); assert.equal(heightColor(10), 0xa3b986); assert.equal(heightColor(15), 0x6f8a62); assert.equal(heightColor(25), 0xb2a38d);
});
test('treeSpots stay on the slopes and are deterministic', () => {
  const a = treeSpots(200, mulberry32(5), basinHeight), b = treeSpots(200, mulberry32(5), basinHeight);
  assert.deepEqual(a, b); assert.equal(a.length, 200);
  for (const t of a) { const r = Math.hypot(t.x, t.z); assert.ok(r >= 16 && r <= 52); assert.ok(t.y >= 1.5); assert.ok(t.s >= .8 && t.s <= 1.8); }
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`
- [ ] **Step 3: 實作 `terrain.js`，`main.js` 加入（noise2 用 vendored SimplexNoise，random 用 mulberry32(99)）**
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: 截圖驗證** — Run: `npm run shot`，Expected: 島後方環狀山坡、密集小樹、遠山帶往天色融、幾團雲；鏡頭前方沒有山擋住島；`shots/phone.png`（quality=low）也看得到山；無 console 錯誤
- [ ] **Step 6: Commit** — `git add src/scene/terrain.js src/main.js test/terrain.test.js && git commit -m "scene: 盆地地形、背景樹、遠山、雲"`

---

### Task 8: 小人 `people.js`

**Files:**
- Create: `src/scene/people.js`
- Modify: `src/main.js`
- Test: `test/people.test.js`

**Interfaces:**
- Produces:
  ```js
  export const SHIRTS = [0xdb6a41, 0x5a88b2, 0xf2b5c6, 0x8db86f, 0xfcea8b, 0xffffff, 0x3f5a8a, 0xe8b04a];
  export const ACCESSORIES = ['none', 'cap', 'coat', 'suitcase', 'glass'];   // 本計畫只實作 none、cap
  export function walkPose(ph) → { leg: .55·sin(ph), arm: −.45·sin(ph), bob: |sin(ph)|·.012 }
  export function ringPath(center:{x,z}, radius, y, n = 24) → [{x,y,z}]   // 繞一格步道環的閉路
  export function createPeople(THREE, { max = 48, seed = 21 }) → people
  people.group                          // 加進 scene；零件各一個 InstancedMesh(DynamicDrawUsage)：leg×2, arm×2, body(capsule), head(sphere), hair(半球), eye×2, shadow(圓片 opacity .22)；高 0.35、頭占 40%
  people.spawn({ path, speed = .35, shirt, accessory = 'none', loop = true }) → walker  // walker = { id, remove(), setPath(path), pos }
  people.update(dt, t, cameraDistance)  // 沿 path 走、walkPose 動作、ph = t·9 + phase·20、縮放乘 clamp(d/20, 1, 1.45)
  ```

- [ ] **Step 1: 寫 `test/people.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkPose, ringPath, SHIRTS } from '../src/scene/people.js';
test('walkPose amplitudes', () => {
  const p = walkPose(Math.PI / 2); assert.ok(Math.abs(p.leg - .55) < 1e-9); assert.ok(Math.abs(p.arm + .45) < 1e-9); assert.ok(Math.abs(p.bob - .012) < 1e-9);
  assert.equal(walkPose(0).leg, 0);
});
test('ringPath is a closed loop on the ring', () => {
  const p = ringPath({ x: 1, z: 2 }, 1.8, 0.65, 24); assert.equal(p.length, 24);
  for (const q of p) { assert.ok(Math.abs(Math.hypot(q.x - 1, q.z - 2) - 1.8) < 1e-9); assert.equal(q.y, 0.65); }
});
test('eight shirt colours', () => assert.equal(SHIRTS.length, 8));
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`
- [ ] **Step 3: 實作 `people.js`，`main.js` 在主島中心格與兩個鄰格各放 2 個走步道環的島民（共 6），render loop 呼叫 `update`**
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: 截圖驗證** — Run: `npm run shot`，Expected: 看得到 6 個大頭小人在步道環上，黑髮、彩色上衣、腳下有影子；無 console 錯誤
- [ ] **Step 6: Commit** — `git add src/scene/people.js src/main.js test/people.test.js && git commit -m "scene: 大頭小人與步道行走"`

---

### Task 9: 模型載入 `assets.js` 與第一批素材

**Files:**
- Create: `src/scene/assets.js`、`assets/LICENSES.md`、`assets/kenney/nature/tree_{default,oak,detailed,fat,small}.glb`、`assets/quat/ships/{Boat,BoatWSail}.glb`
- Modify: `src/main.js`
- Test: `test/assets.test.js`

**Interfaces:**
- Produces:
  ```js
  export function normalizeHeight(size:{x,y,z}, h) → scale          // 純函式：h / size.y
  export function convertMaterial(THREE, m, { tint = null, glow = null } = {}) → MeshStandardMaterial  // roughness .78、metalness 0、保留 color/map/vertexColors/transparent/opacity/side；tint: {nameRegex: hex} 改 color；glow: {nameRegex: hex} 改 color+emissive
  export function createAssets(THREE, { base = './assets/', draco = './vendor/three/draco/' }) → assets
  assets.load(path) → Promise<gltf>            // 快取
  assets.spawn(path, { x, y, z, h, ry, anim, speed, parent, tint, glow }) → Promise<Group>   // 從 spike/v3.html 搬：SkeletonUtils.clone、skinned 先 skeleton.update()+computeBoundingBox()、Box3 精準量、縮到高度 h、腳底落在 y、材質轉換、castShadow/receiveShadow
  assets.update(dt)                              // 推進 AnimationMixer
  ```
  `assets/LICENSES.md`：Kenney Nature Kit（CC0，kenney.nl）、Quaternius Ships Pack（CC0，經 trebeljahr/quaternius-showcase 鏡像）。

- [ ] **Step 1: 寫 `test/assets.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { normalizeHeight, convertMaterial } from '../src/scene/assets.js';
test('normalizeHeight', () => assert.equal(normalizeHeight({ x: 1, y: 4, z: 1 }, 2), 0.5));
test('convertMaterial keeps colour/map, sets clay params, applies tint and glow by material name', () => {
  const src = new THREE.MeshStandardMaterial({ color: 0x123456, name: 'leafsGreen', metalness: 1 });
  const m = convertMaterial(THREE, src); assert.equal(m.roughness, 0.78); assert.equal(m.metalness, 0); assert.equal(m.color.getHex(), 0x123456);
  assert.equal(convertMaterial(THREE, src, { tint: { leaf: 0x9bbd7e } }).color.getHex(), 0x9bbd7e);
  const g = convertMaterial(THREE, src, { glow: { leaf: 0xff3fa0 } }); assert.equal(g.emissive.getHex(), 0xff3fa0);
});
test('first asset batch is present, CC0-listed and small', () => {
  const files = ['assets/kenney/nature/tree_default.glb','assets/kenney/nature/tree_oak.glb','assets/kenney/nature/tree_detailed.glb','assets/kenney/nature/tree_fat.glb','assets/kenney/nature/tree_small.glb','assets/quat/ships/Boat.glb','assets/quat/ships/BoatWSail.glb'];
  let total = 0; for (const f of files) { assert.ok(existsSync(f), f); total += statSync(f).size; }
  assert.ok(total < 1_000_000);
  const lic = readFileSync('assets/LICENSES.md', 'utf8'); assert.match(lic, /Kenney/); assert.match(lic, /Quaternius/); assert.match(lic, /CC0/);
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`
- [ ] **Step 3: 複製素材、寫 `LICENSES.md`、實作 `assets.js`；`main.js` 在主島與衛星島放 Kenney 樹（葉色 tint 成樹三色之一，位置由 mulberry32(3) 決定、避開步道環與格中心 1.2 內）、海上 2 艘船繞圈**
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: 截圖驗證** — Run: `npm run shot`，Expected: 島上有鼠尾草綠的 Kenney 樹、海上有船；無 console 錯誤（含沒有 texture 404）
- [ ] **Step 6: Commit** — `git add src/scene/assets.js assets src/main.js test/assets.test.js && git commit -m "scene: GLB 載入與材質統一、第一批 CC0 素材"`

---

### Task 10: 鏡頭 `camera.js`

**Files:**
- Create: `src/scene/camera.js`
- Modify: `src/main.js`
- Test: `test/camera.test.js`

**Interfaces:**
- Produces:
  ```js
  export const OVERVIEW_DIR = { x: .24, y: .33, z: .87 }（normalize 後）
  export function overviewDistance(aspect) → 28.5 (aspect ≥ 1.4) | 38 (≥ .8) | 56
  export function easeInOutCubic(t) → number
  export function createCameraRig({ THREE, camera, controls, center = {x:.4,y:.6,z:0}, reducedMotion = false }) → rig
  rig.fit(aspect)                                   // 全景：position = center + OVERVIEW_DIR·overviewDistance(aspect)，target = center
  rig.overview(ms = 800) / rig.focus(target:{x,y,z}, offset = {x:1.6,y:2.5,z:3.2}, ms = 800)   // 插值 position 與 controls.target；reducedMotion → 瞬移
  rig.update(dt)  // 推進飛行；controls.update()
  rig.cancel()    // pointerdown 時呼叫，停止飛行
  rig.flying → boolean
  ```
  controls 只需要 `{ target: Vector3, update() }`，測試用假物件。

- [ ] **Step 1: 寫 `test/camera.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { overviewDistance, easeInOutCubic, createCameraRig, OVERVIEW_DIR } from '../src/scene/camera.js';
const rigWith = (opts = {}) => { const camera = new THREE.PerspectiveCamera(32, 1, .3, 320); const controls = { target: new THREE.Vector3(), update() {} }; return { rig: createCameraRig({ THREE, camera, controls, ...opts }), camera, controls }; };
test('overview distance by aspect', () => { assert.equal(overviewDistance(16 / 9), 28.5); assert.equal(overviewDistance(1), 38); assert.equal(overviewDistance(9 / 16), 56); });
test('ease endpoints and midpoint', () => { assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1); assert.equal(easeInOutCubic(.5), .5); });
test('fit places the camera along OVERVIEW_DIR at the aspect distance', () => {
  const { rig, camera } = rigWith(); rig.fit(16 / 9);
  const d = camera.position.clone().sub(new THREE.Vector3(.4, .6, 0)); assert.ok(Math.abs(d.length() - 28.5) < 1e-6);
  assert.ok(Math.abs(d.normalize().dot(new THREE.Vector3(OVERVIEW_DIR.x, OVERVIEW_DIR.y, OVERVIEW_DIR.z)) - 1) < 1e-6);
});
test('focus flies over ms and lands on target + offset', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(1); rig.focus({ x: 5, y: 0, z: 5 }, { x: 1.6, y: 2.5, z: 3.2 }, 800);
  assert.equal(rig.flying, true); rig.update(.4); assert.equal(rig.flying, true); rig.update(.5);
  assert.equal(rig.flying, false); assert.ok(camera.position.distanceTo(new THREE.Vector3(6.6, 2.5, 8.2)) < 1e-6); assert.ok(controls.target.distanceTo(new THREE.Vector3(5, 0, 5)) < 1e-6);
});
test('reduced motion snaps immediately; cancel stops a flight', () => {
  const a = rigWith({ reducedMotion: true }); a.rig.fit(1); a.rig.focus({ x: 5, y: 0, z: 5 }); assert.equal(a.rig.flying, false); assert.ok(a.controls.target.distanceTo(new THREE.Vector3(5, 0, 5)) < 1e-6);
  const b = rigWith(); b.rig.fit(1); b.rig.focus({ x: 5, y: 0, z: 5 }); b.rig.update(.1); const mid = b.camera.position.clone(); b.rig.cancel(); b.rig.update(.5); assert.ok(b.camera.position.distanceTo(mid) < 1e-9);
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`
- [ ] **Step 3: 實作 `camera.js`；`main.js` 建 OrbitControls（damping .07、禁平移、polar 25°–70°、距離 3–70）、rig、`pointerdown → rig.cancel()`、ResizeObserver → `rig.fit(aspect)`；偵測 `matchMedia('(prefers-reduced-motion: reduce)')` 並監聽 change**
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: 截圖驗證** — Run: `npm run shot`，Expected: 桌機全景從提示詞方向看島、整座主島含衛星島入鏡；`shots/phone.png` 直式也完整入鏡
- [ ] **Step 6: Commit** — `git add src/scene/camera.js src/main.js test/camera.test.js && git commit -m "scene: 全景與飛行鏡頭"`

---

### Task 11: 介面、導演、定位點、佔位角色

**Files:**
- Create: `src/ui/icons.js`、`src/ui/format.js`、`src/ui/slots.js`、`src/ui/cards.js`、`src/ui/ui.css`、`src/director.js`、`src/actors/anchors.js`、`src/actors/placeholder.js`
- Test: `test/ui.test.js`、`test/director.test.js`、`test/anchors.test.js`

**Interfaces:**
- Produces:
  ```js
  // ui/icons.js — 8 個簡筆 SVG 字串，viewBox="0 0 64 64"，白底黑線 #211d1d，stroke-width 3
  export const ICONS = { milk, chip, bulb, token, typhoon, rat, boba, baseball };
  // ui/format.js
  export function levelLabel(lv, max) → 'Lv.MAX' | `Lv.${lv}` | '' (lv 0)
  export function storageGet(key, storage = globalThis.localStorage) / storageSet(key, value, storage)   // try/catch，失敗回 null / false
  // ui/slots.js（瀏覽器）
  export function createSlots(root, { items:[{ id, name, icon, max }], onPick }) → { setLevel(id, lv), setPlaced(id), setBusy(flag), reset() }
  //   每格 <button class="slot" data-id>：icon、名稱、<em class="lv">；已放：加 class placed、disabled；busy：全部 disabled；桌機一排 8、≤640px 兩排 4
  // ui/cards.js（瀏覽器）
  export function showHowTo(root, { onClose }) ; export function showEndCard(root, { title, line, levels:[{name, lv, max}], onRestart }) ; export function showError(root, message)
  export function createTopBar(root, { onReset, onHowTo }) → { el }   // 右上角兩顆按鈕：RESET、怎麼玩（圖鑑與音效是計畫 5）
  // director.js
  export const DURATIONS = { placed: 850, grow: 700, fx: 700, stall: 950, after: 600 };
  export function createDirector({ wait = ms => new Promise(r => setTimeout(r, ms)), onFocus = () => {}, reducedMotion = false }) → director
  director.play(events, onEvent) → Promise<void>   // 逐一：onFocus(e) → await onEvent(e, { instant }) → await wait(DURATIONS[e.kind])；instant = reducedMotion || skipped；skip 後剩餘事件不再 wait；busy 中再 play → throw /busy/
  director.skip() ; director.busy ; director.setReducedMotion(flag)
  // actors/anchors.js（純資料）
  export const ANCHORS = { milk:{ cell:[-1,0], dx:-.4, dz:.3 }, chip:{ cell:[1,0], dx:.3, dz:-.3 }, bulb:{ cell:[0,0], dx:-1.1, dz:.9 }, token:{ cell:[0,1], dx:0, dz:.2 }, typhoon:{ cell:[0,0], dx:0, dz:-1.3 }, rat:{ cell:[1,0], dx:-.2, dz:1.0 }, boba:{ cell:[-1,1], dx:.2, dz:0 }, baseball:{ cell:[-1,1], dx:-.9, dz:-.8 }, tower:{ cell:[0,0], dx:.6, dz:-.2 } };
  export function anchorWorld(id) → { x, y, z }   // 格中心 + 偏移，y = cellTop(cell)
  // actors/placeholder.js（瀏覽器）
  export function createPlaceholderActors(THREE, { scene, labelsRoot, spec }) → { apply(event, { instant }) → Promise, reset(), levelOf(id) }
  //   每物品一個 rbox（色：各物品固定色）在 anchorWorld，高度 .25 + .25·lv，CSS2DObject 標籤「名稱 Lv.n」；placed/grow/fx(delta) 時彈跳（easeOutBack 600ms，instant 則直接設）；stall 時左右搖一下
  //   事件帶 story 時，在該角色標籤下方顯示白色圓角氣泡 1.2 秒（instant 不顯示）；fx 事件的角色是 e.item（被影響者）
  ```

- [ ] **Step 1: 寫三個測試檔（會失敗）**

```js
// test/ui.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS } from '../src/ui/icons.js';
import { levelLabel, storageGet, storageSet } from '../src/ui/format.js';
test('eight inline SVG icons with the shared viewBox and ink stroke', () => {
  assert.deepEqual(Object.keys(ICONS).sort(), ['baseball','boba','bulb','chip','milk','rat','token','typhoon']);
  for (const s of Object.values(ICONS)) { assert.match(s, /^<svg/); assert.match(s, /viewBox="0 0 64 64"/); assert.match(s, /#211d1d/); }
});
test('levelLabel', () => { assert.equal(levelLabel(0, 4), ''); assert.equal(levelLabel(2, 4), 'Lv.2'); assert.equal(levelLabel(4, 4), 'Lv.MAX'); });
test('storage helpers never throw', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(storageGet('k', broken), null); assert.equal(storageSet('k', '1', broken), false);
  const mem = new Map(); const ok = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(storageSet('k', 'v', ok), true); assert.equal(storageGet('k', ok), 'v');
});
```

```js
// test/director.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDirector, DURATIONS } from '../src/director.js';
const ev = [{ kind: 'placed', item: 'milk' }, { kind: 'grow', item: 'milk', to: 2 }, { kind: 'fx', item: 'boba' }];
const harness = (opts = {}) => {
  const log = [], waits = [];
  const d = createDirector({ wait: ms => { waits.push(ms); return Promise.resolve(); }, onFocus: e => log.push(['focus', e.item]), reducedMotion: opts.reducedMotion, ...(opts.wait ? { wait: opts.wait } : {}) });
  const onEvent = opts.onEvent ? opts.onEvent(d, log) : (e, o) => { log.push([e.kind, o.instant]); return Promise.resolve(); };
  return { d, log, waits, play: () => d.play(ev, onEvent) };
};
test('plays events in order with per-kind durations', async () => {
  const { d, log, waits, play } = harness(); await play();
  assert.deepEqual(log, [['focus','milk'],['placed',false],['focus','milk'],['grow',false],['focus','boba'],['fx',false]]);
  assert.deepEqual(waits, [DURATIONS.placed, DURATIONS.grow, DURATIONS.fx]); assert.equal(d.busy, false);
});
test('skip mid-way applies the rest instantly without waiting', async () => {
  const { log, waits, play } = harness({ onEvent: (d, log) => (e, o) => { log.push([e.kind, o.instant]); if (e.kind === 'placed') d.skip(); return Promise.resolve(); } });
  await play(); assert.deepEqual(log.filter(l => l[0] !== 'focus'), [['placed',false],['grow',true],['fx',true]]); assert.equal(waits.length, 1);
});
test('reduced motion makes every event instant with no waits', async () => {
  const { log, waits, play } = harness({ reducedMotion: true }); await play();
  assert.ok(log.filter(l => l[0] !== 'focus').every(l => l[1] === true)); assert.deepEqual(waits, []);
});
test('play while busy throws', async () => {
  let release; const { d, play } = harness({ wait: () => new Promise(r => { release = r; }) });
  const p = play(); await Promise.resolve(); assert.equal(d.busy, true); assert.throws(() => d.play(ev, () => {}), /busy/); d.skip(); release(); await p;
});
```

```js
// test/anchors.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, anchorWorld } from '../src/actors/anchors.js';
import { MAIN_CELLS, axialToWorld, RING_R, cellTop } from '../src/scene/hex.js';
import { ORDER } from '../src/rules/spec.js';
test('every item and the tower have an anchor inside the walking ring of a main-island cell', () => {
  for (const id of [...ORDER, 'tower']) {
    const a = ANCHORS[id]; assert.ok(a, id); assert.ok(MAIN_CELLS.some(c => c[0] === a.cell[0] && c[1] === a.cell[1]), id);
    assert.ok(Math.hypot(a.dx, a.dz) < RING_R - 0.3, id);
    const w = anchorWorld(id), c = axialToWorld(...a.cell); assert.equal(w.y, cellTop(a.cell)); assert.ok(Math.abs(w.x - c.x - a.dx) < 1e-9);
  }
});
test('no two anchors closer than 0.8', () => {
  const ids = Object.keys(ANCHORS);
  for (const a of ids) for (const b of ids) if (a < b) { const p = anchorWorld(a), q = anchorWorld(b); assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 0.8, `${a}-${b}`); }
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`
- [ ] **Step 3: 實作八個檔案**（`ui.css` 從 `index.html` 連結：物品格白底圓角 12、內嵌 1.5px `#e9ded2` 邊、下方珊瑚色 Lv 小標、placed 變淡；標題卡奶油底珊瑚大字；按鈕最小高 44px、圓角 9、focus 3px 珊瑚 outline；載入畫面與錯誤文字）
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: Commit** — `git add src/ui src/director.js src/actors test/ui.test.js test/director.test.js test/anchors.test.js index.html && git commit -m "shell: 物品列、卡片、導演、定位點、佔位角色"`

---

### Task 12: 遊戲流程 `game.js`、開機 `main.js`、自動播放、截圖組

**Files:**
- Create: `src/game.js`
- Modify: `src/main.js`、`package.json`（shot 清單）、`docs/superpowers/plans/README.md`
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: 計畫 1 `createState/place/isComplete`、`resolve`、`ORDER/ITEMS`；Task 11 `createDirector/createSlots/createPlaceholderActors`；Task 10 rig；Task 5 `setTime`。
- Produces:
  ```js
  export function createGame({ spec, engine:{ createState, place, isComplete }, endings:{ resolve }, ui, director, actors, onFinished, onLevels = () => {} }) → game
  game.pick(id) → Promise<boolean>   // 回 false 並什麼都不做：director.busy、已放、已完成；否則 place → ui.setBusy(true)、ui.setPlaced(id) → director.play(events, onEvent)（onEvent = actors.apply 再對帶 to／delta 的事件 ui.setLevel）→ 播完把所有已放物品的 lv 再同步一次到 ui → ui.setBusy(false) → onLevels(state.lv)；8 個放完 → onFinished(resolve(state), state)
  game.reset() → 新 state、ui.reset()、actors.reset()
  game.state
  ```
  `main.js` 完整開機順序：loading → renderer → scene（island/terrain/people/assets/rig）→ ui（slots、how-to 第一次顯示）→ director（`onFocus` → `rig.focus(anchorWorld(e.item))`，播完 `rig.overview()`；畫面 click/tap 於 busy 時 → `director.skip()`）→ game → 讀 `?auto=a,b,c`（逗號分隔 id，依序 `game.pick`，reducedMotion 強制 true）、`?time=`、`?quality=`、`?simulateFail=webgl|vendor`。結束時 `showEndCard`（標題、一句話、8 個等級），再玩一次 → `game.reset()` + `rig.overview()` + `setTime(TIMES.day)`。燈泡 Lv3 → `setTime(TIMES.dusk)`、Lv4 → `setTime(TIMES.night)`（用 `onLevels`）。

- [ ] **Step 1: 寫 `test/game.test.js`（會失敗）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import * as endings from '../src/rules/endings.js';
const CYBER = ['typhoon','milk','token','baseball','rat','bulb','chip','boba'];   // solutions.md 的賽博龐克正解
function fakes() {
  const ui = { levels: {}, placed: [], busy: [], setLevel(id, lv) { this.levels[id] = lv; }, setPlaced(id) { this.placed.push(id); }, setBusy(f) { this.busy.push(f); }, reset() { this.levels = {}; this.placed = []; } };
  const actors = { applied: [], apply(e) { this.applied.push(e); return Promise.resolve(); }, reset() { this.applied = []; } };
  let busy = false; const director = { get busy() { return busy; }, async play(events, onEvent) { busy = true; for (const e of events) await onEvent(e, { instant: true }); busy = false; }, skip() {} };
  return { ui, actors, director };
}
test('a full solution order finishes with the cyber ending and MAX levels', async () => {
  const f = fakes(); let done = null;
  const g = createGame({ spec, engine, endings, ...f, onFinished: (ending, state) => { done = { ending, state }; } });
  for (const id of CYBER) assert.equal(await g.pick(id), true);
  assert.equal(done.ending.id, 'cyber'); assert.ok(spec.ORDER.every(id => f.ui.levels[id] === spec.ITEMS[id].max));
  assert.deepEqual(f.ui.busy.slice(0, 2), [true, false]);
});
test('ui levels track the engine after every pick, including delta-driven levels', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  for (const id of ['bulb','boba','typhoon','milk']) { await g.pick(id); for (const k of spec.ORDER) if (g.state.lv[k] > 0) assert.equal(f.ui.levels[k], g.state.lv[k], `${k} after ${id}`); }
});
test('double pick, pick while busy and pick after finish are ignored', async () => {
  const f = fakes(); let finished = 0; const g = createGame({ spec, engine, endings, ...f, onFinished() { finished++; } });
  await g.pick('milk'); assert.equal(await g.pick('milk'), false);
  let release; f.director.play = (events, onEvent) => new Promise(r => { release = async () => { for (const e of events) await onEvent(e, { instant: true }); r(); }; });
  Object.defineProperty(f.director, 'busy', { get: () => !!release });
  const p = g.pick('chip'); assert.equal(await g.pick('bulb'), false); await release(); release = null; await p;
  assert.equal(g.state.lv.chip, 1); assert.equal(g.state.lv.bulb, 0);
  f.director.play = async (events, onEvent) => { for (const e of events) await onEvent(e, { instant: true }); };
  for (const id of ['bulb','token','typhoon','rat','boba','baseball']) await g.pick(id);
  assert.equal(finished, 1); assert.equal(await g.pick('milk'), false);
});
test('reset starts a new state and clears ui/actors', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  await g.pick('milk'); g.reset(); assert.equal(g.state.lv.milk, 0); assert.deepEqual(f.ui.placed, []); assert.deepEqual(f.actors.applied, []);
});
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm test`
- [ ] **Step 3: 實作 `game.js`，完成 `main.js`**
- [ ] **Step 4: 跑測試確認通過** — Run: `npm test`
- [ ] **Step 5: 更新 `package.json` 的 shot 清單並截圖**

`"shot": "node tools/shot.mjs open= mid=auto=typhoon,milk,token,baseball end=auto=typhoon,milk,token,baseball,rat,bulb,chip,boba night=time=night phone=quality=low"`

Run: `npm run shot`，Expected: `open`（空島、8 個物品格有圖示、怎麼玩卡）、`mid`（4 個方塊角色有 Lv 標籤、物品格顯示 Lv、鏡頭回全景）、`end`（標題卡「賽博龐克台北」、8 個 Lv.MAX、夜晚光線）、`night`、`phone`（直式、整島入鏡、物品列兩排 4 格不遮島）；全部無 console 錯誤。Run: `node tools/shot.mjs --dom simulateFail=webgl`，Expected: 含「無法啟動 3D 畫面」

- [ ] **Step 6: 用瀏覽器實際玩一局**（`npm run serve` 後開 `http://127.0.0.1:8766/index.html`）：點 8 個物品、中途點畫面跳過、看結局卡、再玩一次。這一步是人工驗證，把看到的問題記進 ledger。

- [ ] **Step 7: 更新 `docs/superpowers/plans/README.md` 計畫 2 狀態，Commit**

```bash
git add src/game.js src/main.js package.json test/game.test.js docs/superpowers/plans/README.md
git commit -m "shell: 遊戲流程接上引擎與導演、自動播放、截圖組"
```
