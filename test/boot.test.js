import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 任何模組 404 都必須落進 main.js 的 try/catch：所以 main.js 不能有靜態 import，
// 整個 app 用動態 import 載入（審查 #1：vendor 檔 404 會永遠停在載入畫面）
test('main.js is a bootstrap with no static imports and loads the app dynamically inside try', () => {
  const src = readFileSync('src/main.js', 'utf8');
  assert.doesNotMatch(src, /^\s*import\s[^(]/m);
  const tryAt = src.indexOf('try {'), dyn = src.search(/import\([^;]*'\.\/app\.js'/);
  assert.ok(tryAt >= 0 && dyn > tryAt, 'dynamic import of ./app.js inside try');
});

// 計畫 12 Task 1：跳過改成跳過鍵——畫布不再聽 click（拖鏡頭的 pointerdown 照舊）；修正批次 max-skip §C：跳過鍵是物品列的最後一格
// （createSlots 的 onSkip），每幀照 show.skippable 啟用／停用；浮動膠囊（createSkipButton）拿掉了
test('app.js skips through the item-bar skip cell only: no canvas click listener, slots.setSkippable(show.skippable) every frame', () => {
  const src = readFileSync('src/app.js', 'utf8');
  assert.doesNotMatch(src, /domElement\.addEventListener\(\s*'click'/, 'no canvas click → skip');
  assert.match(src, /domElement\.addEventListener\(\s*'pointerdown'/, 'drag still cancels the camera flight');
  assert.match(src, /createSlots\(uiRoot, \{[^\n]*onSkip:\s*\(\)\s*=>\s*show\.skip\(\)/);
  assert.doesNotMatch(src, /createSkipButton/);
  const loop = src.slice(src.indexOf('setAnimationLoop('));
  assert.match(loop, /slots\.setSkippable\(show\.skippable\)/, 'the frame loop updates the skip cell');
});

// 計畫 12 Task 2：遊戲結束（onFinished）RESET 變醒目，restart 拿掉
test('app.js lights RESET on finish and turns it off on restart', () => {
  const src = readFileSync('src/app.js', 'utf8');
  assert.match(src, /onFinished:\s*\((?:ending)?\)\s*=>\s*\{?\s*topBar\.setFinished\(true\)/);
  // restart 的本文（到下一個頂層宣告前）：先拿掉 glow，再 game.reset()
  const body = src.slice(src.indexOf('function restart()'), src.indexOf('\n  const pick'));
  const off = body.indexOf('topBar.setFinished(false)'), reset = body.indexOf('game.reset()');
  assert.ok(off >= 0, 'restart turns the glow off'); assert.ok(reset > off, 'before game.reset()');
});
// R43（使用者 2026-11-06）：結束才開放平移（除錯特寫不開），RESET 先關再回全景；每幀 rig.update 之後夾住注視點
test('app.js enables free panning on finish, disables it on restart before home, and clamps every frame after rig.update', () => {
  const src = readFileSync('src/app.js', 'utf8');
  assert.match(src, /onFinished:\s*\((?:ending)?\)\s*=>\s*\{[^}]*if \(!debugCam\) rig\.setFree\(true\)/);
  const body = src.slice(src.indexOf('function restart()'), src.indexOf('\n  const pick'));
  const off = body.indexOf('rig.setFree(false)'), home = body.indexOf('rig.home(0)');
  assert.ok(off >= 0 && home > off, 'setFree(false) before home(0)');
  assert.match(src, /rig\.update\(dt\);\s*rig\.clamp\(\)/);
  assert.match(src, /enablePan:\s*false/, 'no panning until the game finishes');
});

// R45 結局圖鑑（使用者 2026-11-06）：結束時把結局 id 併進 localStorage；怎麼玩卡片拿 ENDINGS 與看過的清單；?card=howto 除錯參數不管 localStorage 直接開卡片
test('app.js records the finished ending and hands the gallery to the how-to card', () => {
  const src = readFileSync('src/app.js', 'utf8');
  assert.match(src, /const SEEN_KEY = 'grow-taipei:endings'/);
  assert.match(src, /onFinished:\s*\(ending\)\s*=>\s*\{[^}]*storageSet\(SEEN_KEY, JSON\.stringify\(\[\.\.\.new Set\(\[\.\.\.seenEndings\(\), ending\.id\]\)\]\)\)/);
  assert.match(src, /showHowTo\(uiRoot, \{[^\n]*endings: endings\.ENDINGS, seen: debugSeen \?\? seenEndings\(\)/);
  // 整批審查：ENDINGS 用已經在的 endings 命名空間，不另外 import；?seen=a,b 只給圖鑑顯示（不寫進 localStorage）
  assert.doesNotMatch(src, /import \{ ENDINGS \}/);
  assert.match(src, /const debugSeen = params\.get\('seen'\)\?\.split\(','\)\.filter\(Boolean\) \?\? null;/);
  assert.equal((src.match(/debugSeen/g) ?? []).length, 2, 'debugSeen is only read by howTo, never stored');
  assert.match(src, /params\.get\('card'\) === 'howto'/);
});
