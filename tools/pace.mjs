// 節奏報表：無頭模擬兩條正解，一回合一回合（8 次放置 + 最後一輪）演完，印每回合秒數。
//   npm run pace              印表
//   node tools/pace.mjs --verbose   多印每回合每個事件的秒數（mark 拍之間的 elapsed 差值；括號裡是劇本秒數）
//   node tools/pace.mjs --check     任一放置回合或最後一輪 < 4 s 或超過那回合的上限、終局超過上限就列出並 exit 1；
//                                   放置回合裡非關鍵劇本 > 4.5 s、◆ 關鍵事件 > 8 s 超過 0.3 s 以上只印 ⚠（live 秒數跟日常的人在哪有關；硬門檻是各物品測試）
// 放置回合上限（裁決 R17；計畫 6 設計 §6 50 → 60）：60 + 8 × max(0, ◆ 個數 − 1)——一回合三個 ◆ 最多 76 s；◆ 個數看 mark 的 info.key（拜訪段的 mark 不算）
// 劇本秒數 = 不含鏡頭 focus 拍的秒數（跟各物品測試的 secs 同一把尺，helpers/show.js 的 scriptElapsed）再扣掉 turn.js 補的空拍（mark 的 info.gap）；
// ◆ 關鍵劇本（info.key）與 101 跳階（settle）不受 4.5 s 限，只印出來
// 拜訪（計畫 6 設計 §4、§6）：有原因的升級前面那段拜訪有自己的 mark（info.visit）——拜訪段單獨量（事件秒數扣掉物品之間的空拍，含跟走路一起演的平移），
//   超過 VISIT_CAP 3.5 s 多於 WARN_OVER 只印 ⚠（同劇本的上限）；那一級自己的劇本照舊從它自己的 mark 量。每回合印「拜訪 n」（真的演了的段數：
//   幫手的代表不在、躲著、正被別的劇本拿著時那段只剩平移，不算）。回合上限 50 → 60（設計 §6：60 + 8 × max(0, ◆ − 1)）
// 最終章（選擇帶動升級 2026-10-28 §6，取代計畫 5 的倒數三回合）：最後一輪是一般回合，門檻跟放置回合一樣（4 s 起，60 + 8 × max(0, ◆ − 1)），
//   列名「最後一輪」；之後演終局回合（警告＋飛彈＋真結局尾聲，finale: true）一列「終局 x/22 s」，
//   再印「最後一輪＋終局 x s」（給使用者對照計畫 5 的最終章：外星 70.9、賽博 67.0，不設門檻）；合計含終局。
//   主迴圈之後另跑兩局固定的壞結局（test/helpers/endings.js 的 EXAMPLE.hit／deflect：放置與最後一輪瞬間演完、終局 live）各一列「終局 x/12 s」。
//   超過 22／12 都算失敗
import * as spec from '../src/rules/spec.js';
import { createState, place, advance } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, SCRIPT_MAX, SCRIPT_EXCEPT, KEY_MAX } from '../test/helpers/show.js';
import { EXAMPLE, finaleStep } from '../test/helpers/endings.js';
import { VISIT_CAP } from '../src/show/visit.js';

// §13.6：鏡頭平移與空拍每回合多 6–10 s，門檻 45 → 50；計畫 6 設計 §6：拜訪每回合最多加十幾秒，50 → 60；裁決 R15（物品 v2）：MIN 8 → 4（第一回合只有一段短劇本）；
// 放置回合（與最後一輪）的非關鍵劇本 ≤ 4.5 s
const MIN = 4, MAX = 60, KEY_EXTRA = 8, WARN_OVER = 0.3;   // WARN_OVER：劇本超過上限多於這麼多秒才印 ⚠（審稿：live 的抖動在這以內）   // 非關鍵劇本 SCRIPT_MAX 4.5 s 與只有走路的例外 SCRIPT_EXCEPT 跟各物品測試共用（test/helpers/show.js）
// 終局回合（選擇帶動升級 §6）：真結局（警告＋飛彈＋尾聲）≤ 22 s、壞結局（警告＋飛彈）≤ 12 s（多了警告約 2.5 s）；
// FINAL_BEFORE：計畫 5 的最終章（倒數三回合＋終局，外星／賽博），對照用
const FINALE_MAX = 22, BAD_FINALE_MAX = 12, FINAL_BEFORE = { alien: 70.9, cyber: 67.0 };
const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose'), check = args.has('--check');
const name = id => spec.ITEMS[id].name;
const s1 = x => x.toFixed(1);
const label = e => `${e.kind}${e.item ? ` ${e.item}` : ''}${(e.to ?? e.delta?.to) != null ? `→${e.to ?? e.delta.to}` : ''}`;

const { show, run, scriptElapsed, bubblesLog } = await headlessShow();
const hearts = () => bubblesLog.filter(b => b.kind === '♥').length;   // 拜訪段有沒有真的演：段裡冒了 ♥
const failures = [], warnings = [];

for (const { order, ending } of stats(enumerate(spec), spec).full) {
  show.reset();
  let state = createState(spec);
  const steps = [...order.map(id => ['place', id]), ...Array.from({ length: spec.CLOSING_TURNS }, () => ['advance'])];
  const cells = [], details = [];
  let total = 0, closing = 0;   // closing：最後一輪＋終局（最終章）
  for (const [i, [kind, id]] of steps.entries()) {
    const r = kind === 'place' ? place(state, id, spec) : advance(state, spec); state = r.state;
    // 最後一輪跟放置回合一樣演（game.js：play(c.events)，後面補 settle）
    const events = [...r.events, { kind: 'settle' }];
    const marks = [];   // [事件, 開演那一刻的 elapsed, 那一刻的劇本秒數, mark 的 info, 那一刻的 ♥ 泡泡數]
    await run(events, { onMark: (e, info) => marks.push([e, show.elapsed, scriptElapsed(), info, hearts()]) });
    const secs = show.elapsed, scripted = scriptElapsed();   // 整回合（含鏡頭平移、空拍、回全景）；不含 focus 拍的
    // 第 j 個事件：[事件秒數, 劇本秒數]（最後一個量到回合結束）
    const span = j => [(marks[j + 1]?.[1] ?? secs) - marks[j][1], (marks[j + 1]?.[2] ?? scripted) - marks[j][2] - (marks[j][3]?.gap ?? 0)];
    total += secs; if (kind === 'advance') closing += secs;
    const head = kind === 'place' ? `${i + 1} ${name(id)}` : '最後一輪';
    const what = kind === 'place' ? `第 ${i + 1} 回合（${name(id)}）` : '最後一輪';
    // 放置回合與最後一輪同一套門檻（選擇帶動升級 §6：最後一輪就是一般回合）
    const keys = marks.filter(m => m[3]?.key).length, cap = MAX + KEY_EXTRA * Math.max(0, keys - 1);
    // 拜訪段：演了的才算（段裡冒了幫手的 ♥）
    const played = j => (marks[j + 1]?.[4] ?? hearts()) > marks[j][4];
    const visits = marks.filter((m, j) => m[3]?.visit && played(j)).length;
    cells.push(`${head} ${s1(secs)}/${cap} s 拜訪 ${visits}`);
    if (secs < MIN || secs > cap) failures.push(`${ending.title} ${what} ${s1(secs)} s（${secs < MIN ? `< ${MIN}` : `> ${cap}，◆ ${keys} 個`}）`);
    // 每個非關鍵劇本 ≤ SCRIPT_MAX、◆ ≤ KEY_MAX——live 秒數看日常裡的人在哪，會差半秒上下，只印警告（⚠，不算失敗）；
    // 劇本本身的上限由各物品測試單獨量（test/*.test.js 的 SCRIPT_MAX／KEY_MAX）。回合秒數超過上限才算失敗
    marks.forEach(([e, , , info], j) => {
      if (info?.visit) {
        const live = span(j)[0] - (info.gap ?? 0);
        if (live > VISIT_CAP + WARN_OVER) warnings.push(`${ending.title} ${what} 拜訪 ${label(e)}（${e.via[0]}） ${s1(live)} s（> ${VISIT_CAP}）`);
        return;
      }
      const script = span(j)[1];
      const cap = SCRIPT_EXCEPT[`${e.item} ${e.kind === 'placed' ? 1 : e.to}`] ?? SCRIPT_MAX;
      if (!info?.key && e.kind !== 'settle' && script > cap + WARN_OVER) warnings.push(`${ending.title} ${what} ${label(e)} 劇本 ${s1(script)} s（> ${cap}）`);
      // ◆ 關鍵事件 live ≤ KEY_MAX（裁決 R17）：事件秒數（含鏡頭平移）扣掉物品之間的空拍
      const live = span(j)[0] - (info?.gap ?? 0);
      if (info?.key && live > KEY_MAX + WARN_OVER) warnings.push(`${ending.title} ${what} ◆${label(e)} ${s1(live)} s（> ${KEY_MAX}）`);
    });
    if (verbose) {
      // 每個事件的秒數 = 下一個 mark（最後一個用回合結束）減自己的 mark
      // 「事件秒數（劇本秒數）」，◆ 標關鍵劇本
      // 拜訪段寫成「拜訪 幫手→物品→級 秒數」（只剩平移、沒演的加「略」）
      const parts = marks.map(([e, , , info], j) => {
        const [t, sc] = span(j);
        if (info?.visit) return `拜訪 ${e.via[0]}→${e.item}→${e.to}${played(j) ? '' : '略'} ${s1(t)}`;
        return `${info?.key ? '◆' : ''}${label(e)} ${s1(t)}${Math.abs(t - sc) > 0.05 ? `（${s1(sc)}）` : ''}`;
      });
      details.push(`  ${head}：${parts.join('、')}`);
    }
  }
  // 終局回合（game.js：最後一輪演完 → show.turn(finaleEvents(resolve(state)), { finale: true })：警告、飛彈、尾聲）
  const fin = await finale(state);
  total += fin.secs; closing += fin.secs;
  cells.push(`終局 ${s1(fin.secs)}/${FINALE_MAX} s`);
  if (fin.secs > FINALE_MAX) failures.push(`${ending.title} 終局 ${s1(fin.secs)} s（> ${FINALE_MAX}）`);
  if (verbose) details.push(`  終局：${fin.parts.join('、')}`);
  console.log(`${ending.title}  ${cells.join(' | ')} | 合計 ${s1(total)} s | 最後一輪＋終局 ${s1(closing)} s（計畫 5 最終章 ${s1(FINAL_BEFORE[ending.id])} s）`);
  for (const d of details) console.log(d);
}

// 兩局固定的壞結局：放置與最後一輪瞬間演完，終局（警告＋飛彈）live
for (const [outcome, title] of [['hit', '命中'], ['deflect', '吹歪']]) {
  show.reset();
  let state = createState(spec);
  const order = EXAMPLE[outcome];
  for (const id of order) { const r = place(state, id, spec); state = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  for (let i = 0; i < spec.CLOSING_TURNS; i++) { const r = advance(state, spec); state = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  const fin = await finale(state);
  console.log(`${title}（${order.map(name).join('、')}）  終局 ${s1(fin.secs)}/${BAD_FINALE_MAX} s`);
  if (verbose) console.log(`  終局：${fin.parts.join('、')}`);
  if (fin.ending.missile !== outcome) failures.push(`${title}：EXAMPLE.${outcome} 的飛彈是 ${fin.ending.missile}`);
  if (fin.secs > BAD_FINALE_MAX) failures.push(`${title} 終局 ${s1(fin.secs)} s（> ${BAD_FINALE_MAX}）`);
}

// 終局回合 live（finale: true）：回 { secs（整回合真實秒數）, parts（每個事件的秒數，--verbose 印）, ending }
async function finale(state) {
  const { events, ending } = finaleStep(state), marks = [];
  await run(events, { finale: true, onMark: e => marks.push([e, show.elapsed]) });
  const secs = show.elapsed;
  return { secs, ending, parts: marks.map(([e, at], j) => `${e.kind}${e.outcome ? ` ${e.outcome}` : ''}${e.ending ? ` ${e.ending}` : ''} ${s1((marks[j + 1]?.[1] ?? secs) - at)}`) };
}

for (const w of warnings) console.log(`⚠ ${w}`);
if (failures.length) { console.log('節奏失敗：'); for (const f of failures) console.log(`  ${f}`); } else console.log('節奏：ok');
if (check && failures.length) process.exitCode = 1;
