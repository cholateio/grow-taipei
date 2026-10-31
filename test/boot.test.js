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

// 計畫 12 Task 1：跳過改成頂欄的跳過鍵——畫布不再聽 click（拖鏡頭的 pointerdown 照舊），每幀照 show.skippable 顯示／隱藏
test('app.js skips through the top-bar button only: no canvas click listener, setSkippable(show.skippable) every frame', () => {
  const src = readFileSync('src/app.js', 'utf8');
  assert.doesNotMatch(src, /domElement\.addEventListener\(\s*'click'/, 'no canvas click → skip');
  assert.match(src, /domElement\.addEventListener\(\s*'pointerdown'/, 'drag still cancels the camera flight');
  assert.match(src, /onSkip:\s*\(\)\s*=>\s*show\.skip\(\)/);
  const loop = src.slice(src.indexOf('setAnimationLoop('));
  assert.match(loop, /setSkippable\(show\.skippable\)/, 'the frame loop updates the skip button');
});

// 計畫 12 Task 2：遊戲結束（onFinished）RESET 變醒目，restart 拿掉
test('app.js lights RESET on finish and turns it off on restart', () => {
  const src = readFileSync('src/app.js', 'utf8');
  assert.match(src, /onFinished:\s*\(\)\s*=>\s*topBar\.setFinished\(true\)/);
  assert.match(/function restart\(\)\s*\{[^}]*\}/.exec(src)?.[0] ?? '', /topBar\.setFinished\(false\)/);
});
