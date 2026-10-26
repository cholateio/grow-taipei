// 節奏報表：無頭模擬兩條正解，一回合一回合（8 次放置 + 倒數三回合）演完，印每回合秒數。
//   npm run pace              印表
//   node tools/pace.mjs --verbose   多印每回合每個事件的秒數（mark 拍之間的 elapsed 差值；括號裡是劇本秒數）
//   node tools/pace.mjs --check     任一放置回合 < 4 s 或 > 50 s、倒數回合 > 30 s、放置回合裡非關鍵劇本 > 4.5 s 就列出並 exit 1
// 劇本秒數 = 不含鏡頭 focus 拍的秒數（跟各物品測試的 secs 同一把尺，helpers/show.js 的 scriptElapsed）再扣掉 turn.js 補的空拍（mark 的 info.gap）；
// ◆ 關鍵劇本（info.key）與 101 跳階（settle）不受 4.5 s 限，只印出來
import * as spec from '../src/rules/spec.js';
import { createState, place, advance } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, SCRIPT_MAX, SCRIPT_EXCEPT } from '../test/helpers/show.js';

// §13.6：鏡頭平移與空拍每回合多 6–10 s，門檻 45／20 → 50／22；裁決 R15（物品 v2）：MIN 8 → 4（第一回合只有一段短劇本）、
// 倒數 22 → 30（蒙太奇整串 2 倍速）；放置回合的非關鍵劇本 ≤ 4.5 s
const MIN = 4, MAX = 50, CLOSING_MAX = 30;   // 非關鍵劇本 SCRIPT_MAX 4.5 s 與只有走路的例外 SCRIPT_EXCEPT 跟各物品測試共用（test/helpers/show.js）
const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose'), check = args.has('--check');
const name = id => spec.ITEMS[id].name;
const s1 = x => x.toFixed(1);
const label = e => `${e.kind}${e.item ? ` ${e.item}` : ''}${(e.to ?? e.delta?.to) != null ? `→${e.to ?? e.delta.to}` : ''}`;

const { show, run, scriptElapsed } = await headlessShow();
const failures = [];

for (const { order, ending } of stats(enumerate(spec), spec).full) {
  show.reset();
  let state = createState(spec);
  const steps = [...order.map(id => ['place', id]), ...Array.from({ length: spec.CLOSING_TURNS }, () => ['advance'])];
  const cells = [], details = [];
  let total = 0;
  for (const [i, [kind, id]] of steps.entries()) {
    const r = kind === 'place' ? place(state, id, spec) : advance(state, spec); state = r.state;
    const events = [...r.events, { kind: 'settle' }];
    const marks = [];   // [事件, 開演那一刻的 elapsed, 那一刻的劇本秒數, mark 的 info]
    await run(events, { montage: kind === 'advance', onMark: (e, info) => marks.push([e, show.elapsed, scriptElapsed(), info]) });
    const secs = show.elapsed, scripted = scriptElapsed();   // 整回合（含鏡頭平移、空拍、回全景）；不含 focus 拍的
    // 第 j 個事件：[事件秒數, 劇本秒數]（最後一個量到回合結束）
    const span = j => [(marks[j + 1]?.[1] ?? secs) - marks[j][1], (marks[j + 1]?.[2] ?? scripted) - marks[j][2] - (marks[j][3]?.gap ?? 0)];
    total += secs;
    const k = i - order.length + 1;   // 倒數第幾回合（放置回合 ≤ 0）
    const head = kind === 'place' ? `${i + 1} ${name(id)}` : `倒數 ${k}`;
    cells.push(`${head} ${s1(secs)} s`);
    if (kind === 'place' && (secs < MIN || secs > MAX)) failures.push(`${ending.title} 第 ${i + 1} 回合（${name(id)}）${s1(secs)} s（${secs < MIN ? `< ${MIN}` : `> ${MAX}`}）`);
    if (kind === 'advance' && secs > CLOSING_MAX) failures.push(`${ending.title} 倒數 ${k} ${s1(secs)} s（倒數 > ${CLOSING_MAX}）`);
    // 放置回合：每個非關鍵劇本 ≤ SCRIPT_MAX（扣掉平移與空拍；最後一個事件量到回合結束前的收尾不算——settle 永遠在最後）
    if (kind === 'place') marks.forEach(([e, , , info], j) => {
      const script = span(j)[1];
      const cap = SCRIPT_EXCEPT[`${e.item} ${e.kind === 'placed' ? 1 : e.to}`] ?? SCRIPT_MAX;
      if (!info?.key && e.kind !== 'settle' && script > cap + 1e-6) failures.push(`${ending.title} 第 ${i + 1} 回合 ${label(e)} 劇本 ${s1(script)} s（> ${cap}）`);
    });
    if (verbose) {
      // 每個事件的秒數 = 下一個 mark（最後一個用回合結束）減自己的 mark；第一個 mark 之前是蒙太奇的 3-2-1
      // 「事件秒數（劇本秒數）」，◆ 標關鍵劇本
      const parts = marks.map(([e, , , info], j) => { const [t, sc] = span(j); return `${info?.key ? '◆' : ''}${label(e)} ${s1(t)}${Math.abs(t - sc) > 0.05 ? `（${s1(sc)}）` : ''}`; });
      if (kind === 'advance' && marks.length) parts.unshift(`3-2-1 ${s1(marks[0][1])}`);
      details.push(`  ${head}：${parts.join('、')}`);
    }
  }
  console.log(`${ending.title}  ${cells.join(' | ')} | 合計 ${s1(total)} s`);
  for (const d of details) console.log(d);
}

if (failures.length) { console.log('節奏失敗：'); for (const f of failures) console.log(`  ${f}`); } else console.log('節奏：ok');
if (check && failures.length) process.exitCode = 1;
