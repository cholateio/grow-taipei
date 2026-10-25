// headless Chromium 截圖。node tools/shot.mjs <name>=<query> ...  → shots/<name>.png
//   名稱含 phone 用 390×844，否則 1280×800；console 有 Uncaught/Error/Failed 就 exit 1。
// node tools/shot.mjs --dom <query>  → 印出頁面 DOM（驗證錯誤畫面文字用）
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { serve } from './serve.mjs';

const CHROME = process.env.CHROME || `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
let PORT = 0;
const base = q => `http://127.0.0.1:${PORT}/index.html${q ? '?' + q : ''}`;
const flags = size => ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  `--window-size=${size}`, '--virtual-time-budget=20000', '--enable-logging=stderr', '--v=0'];

// 必須非同步：同步 spawn 會卡住同一個程序裡的伺服器，Chrome 就永遠等不到頁面。
const run = argv => new Promise(ok => execFile(CHROME, argv, { encoding: 'utf8', timeout: 180000, maxBuffer: 64 << 20 },
  (err, stdout, stderr) => ok({ status: err ? (err.code ?? 1) : 0, stdout, stderr })));

const args = process.argv.slice(2);
const server = await serve(0);   // 0 = 系統挑空的埠，不和開著的開發伺服器撞
PORT = server.address().port;
let failed = false;
try {
  if (args[0] === '--dom') {
    const r = await run([...flags('1280,800'), '--dump-dom', base(args[1] ?? '')]);
    process.stdout.write(r.stdout);
  } else {
    mkdirSync('shots', { recursive: true });
    for (const a of args) {
      const i = a.indexOf('='), name = a.slice(0, i), query = a.slice(i + 1);
      const r = await run([...flags(name.includes('phone') ? '390,844' : '1280,800'), `--screenshot=shots/${name}.png`, base(query)]);
      const bad = (r.stderr || '').split('\n').filter(l => l.includes('CONSOLE') && /Uncaught|Error|Failed/.test(l));
      console.log(`${bad.length ? '✖' : '✔'} shots/${name}.png  (${query || '預設'})`);
      // app 在 ?auto 時印的 [grow] calls=… 行：draw call 超過 150 加警告
      for (const l of (r.stderr || '').split('\n').filter(l => l.includes('[grow]'))) {
        const m = l.match(/\[grow\][^"]*/), calls = +(l.match(/calls=(\d+)/)?.[1] ?? 0);
        console.log(`   ${calls > 150 ? '⚠ ' : ''}${m ? m[0] : l}`);
      }
      for (const l of bad) console.log('   ' + l.replace(/^.*CONSOLE[^"]*/, ''));
      if (bad.length || r.status !== 0) failed = true;
    }
  }
} finally { server.close(); }
process.exit(failed ? 1 : 0);
