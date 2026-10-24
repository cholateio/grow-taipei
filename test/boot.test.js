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
