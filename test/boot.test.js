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
  assert.match(src, /onFinished:\s*\(\)\s*=>\s*topBar\.setFinished\(true\)/);
  // restart 的本文（到下一個頂層宣告前）：先拿掉 glow，再 game.reset()
  const body = src.slice(src.indexOf('function restart()'), src.indexOf('\n  const pick'));
  const off = body.indexOf('topBar.setFinished(false)'), reset = body.indexOf('game.reset()');
  assert.ok(off >= 0, 'restart turns the glow off'); assert.ok(reset > off, 'before game.reset()');
});
