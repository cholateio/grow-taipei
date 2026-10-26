// headless Chromium 截圖。node tools/shot.mjs <name>=<query> ...  → shots/<name>.png
//   名稱含 phone 用 390×844、含 wide 用 2560×1080，否則 1280×800；console 有 Uncaught/Error/Failed 就 exit 1。
//   虛擬時間預設 20 s（夠載入＋?auto 瞬間放完）。但 ?live 在 warp 同步快轉之後動畫迴圈還會繼續演，20 s 拍到的是
//   warp＋十幾秒那一刻，回合可能已經演完、鏡頭回全景。wide 的 live 截圖要拍「拉近到主角格」的那一刻，
//   所以名稱含 wide（或物品 id- 開頭的特寫：milk-、token-…）又有 live=1 時預算縮成 1.5 s（實測拍到 warp 後不到 1 秒的畫面，每次同一刻）；其他截圖照舊 20 s。
//   npm run shot 的 wide-live 用 warp=4.5：第 6 回合（鮮奶）放下、酪農在鮮奶格冒 ♥，鏡頭拉近在鮮奶格。
// node tools/shot.mjs --dom <query>  → 印出頁面 DOM（驗證錯誤畫面文字用）
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { serve } from './serve.mjs';

const CHROME = process.env.CHROME || `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
let PORT = 0;
const base = q => `http://127.0.0.1:${PORT}/index.html${q ? '?' + q : ''}`;
const flags = (size, budget = 20000) => ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  `--window-size=${size}`, `--virtual-time-budget=${budget}`, '--enable-logging=stderr', '--v=0'];
const sizeOf = name => (name.includes('phone') ? '390,844' : name.includes('wide') ? '2560,1080' : '1280,800');
const ITEM_SHOT = /^(milk|chip|bulb|token|typhoon|rat|boba|baseball)-/;   // 物品特寫（milk-3、token-6…）
// draw call 預算（裁決 R18，物品 v2 的 61 級島）：手機（名稱含 phone，或 ?quality=low）≤ 150，其他 ≤ 250（原本全部 150，41 級時訂的）
const budgetCalls = (name, query) => (name.includes('phone') || /(^|&)quality=low(&|$)/.test(query) ? 150 : 250);
const budgetOf = (name, query) => ((name.includes('wide') || ITEM_SHOT.test(name)) && /(^|&)live=1(&|$)/.test(query) ? 1500 : 20000);

// 必須非同步：同步 spawn 會卡住同一個程序裡的伺服器，Chrome 就永遠等不到頁面。
const run = argv => new Promise(ok => execFile(CHROME, argv, { encoding: 'utf8', timeout: 180000, maxBuffer: 64 << 20 },
  (err, stdout, stderr) => ok({ status: err ? (err.code ?? 1) : 0, stdout, stderr })));

const args = process.argv.slice(2);
const server = await serve(0);   // 0 = 系統挑空的埠，不和開著的開發伺服器撞
PORT = server.address().port;
let failed = false;
const worst = { calls: 0, name: '' }, over = [];   // 這一趟 draw call 最多的截圖、超過預算的截圖
try {
  if (args[0] === '--dom') {
    const r = await run([...flags('1280,800'), '--dump-dom', base(args[1] ?? '')]);
    process.stdout.write(r.stdout);
  } else {
    mkdirSync('shots', { recursive: true });
    for (const a of args) {
      const i = a.indexOf('='), name = a.slice(0, i), query = a.slice(i + 1);
      const r = await run([...flags(sizeOf(name), budgetOf(name, query)), `--screenshot=shots/${name}.png`, base(query)]);
      const bad = (r.stderr || '').split('\n').filter(l => l.includes('CONSOLE') && /Uncaught|Error|Failed/.test(l));
      console.log(`${bad.length ? '✖' : '✔'} shots/${name}.png  (${query || '預設'})`);
      // app 在 ?auto 時印的 [grow] calls=… 行（模型都載好、穩定幾幀之後才印）：draw call 超過預算加警告（budgetCalls：手機 150、其他 250）；
      // ?auto 卻沒有這一行 = 截圖那一刻模型還沒載完（量不到），也加警告
      const grow = (r.stderr || '').split('\n').filter(l => l.includes('[grow]'));
      for (const l of grow) {
        const m = l.match(/\[grow\][^"]*/), calls = +(l.match(/calls=(\d+)/)?.[1] ?? 0);
        const cap = budgetCalls(name, query);
        console.log(`   ${calls > cap ? `⚠ > ${cap} ` : ''}${m ? m[0] : l}`);
        if (calls > cap) over.push(`${name} ${calls} > ${cap}`);
        if (calls > worst.calls) Object.assign(worst, { calls, name });
      }
      if (!grow.length && /(^|&)auto=/.test(query)) console.log('   ⚠ [grow] 沒有 draw call 回報（截圖時模型還沒載完）');
      for (const l of bad) console.log('   ' + l.replace(/^.*CONSOLE[^"]*/, ''));
      if (bad.length || r.status !== 0) failed = true;
    }
    if (worst.calls) console.log(`draw call 最多 ${worst.calls}（${worst.name}）；超過預算：${over.length ? over.join('、') : '沒有'}`);
  }
} finally { server.close(); }
process.exit(failed ? 1 : 0);
