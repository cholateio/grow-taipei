// 節奏報表：無頭模擬兩條正解，一回合一回合（8 次放置 + 倒數三回合）演完，印每回合秒數。
//   npm run pace              印表
//   node tools/pace.mjs --verbose   多印每回合每個事件的秒數（mark 拍之間的 elapsed 差值；括號裡是劇本秒數）
//   node tools/pace.mjs --check     任一放置回合 < 4 s 或超過那回合的上限、倒數回合 > 30 s 就列出並 exit 1；
//                                   放置回合裡非關鍵劇本 > 4.5 s、◆ 關鍵事件 > 8 s 超過 0.3 s 以上只印 ⚠（live 秒數跟日常的人在哪有關；硬門檻是各物品測試）
// 放置回合上限（裁決 R17）：50 + 8 × max(0, ◆ 個數 − 1)——一回合三個 ◆ 最多 66 s；◆ 個數看 mark 的 info.key
// 劇本秒數 = 不含鏡頭 focus 拍的秒數（跟各物品測試的 secs 同一把尺，helpers/show.js 的 scriptElapsed）再扣掉 turn.js 補的空拍（mark 的 info.gap）；
// ◆ 關鍵劇本（info.key）與 101 跳階（settle）不受 4.5 s 限，只印出來
// 最終章（計畫 5 任務 8，設計 §10）：倒數三回合之後多演終局回合（飛彈＋真結局尾聲，finale: true，1 倍速）一列「終局 x/22 s」，
//   再印「最終章 x s」＝倒數三回合＋終局（給使用者對照改版前的 51.0／52.6，不設門檻）；合計含終局。
//   主迴圈之後另跑兩局固定的壞結局（test/helpers/endings.js 的 EXAMPLE.hit／deflect：放置與倒數瞬間演完、終局 live）各一列「終局 x/10 s」。
//   超過 22／10 都算失敗
import * as spec from '../src/rules/spec.js';
import { createState, place, advance } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, closingEvents, SCRIPT_MAX, SCRIPT_EXCEPT, KEY_MAX } from '../test/helpers/show.js';
import { EXAMPLE, finaleStep } from '../test/helpers/endings.js';

// §13.6：鏡頭平移與空拍每回合多 6–10 s，門檻 45／20 → 50／22；裁決 R15（物品 v2）：MIN 8 → 4（第一回合只有一段短劇本）、
// 倒數 22 → 30（蒙太奇整串 2 倍速）；放置回合的非關鍵劇本 ≤ 4.5 s
const MIN = 4, MAX = 50, KEY_EXTRA = 8, CLOSING_MAX = 30, WARN_OVER = 0.3;
// 終局回合（設計 §10）：真結局（飛彈＋尾聲）≤ 22 s、壞結局（只有飛彈）≤ 10 s；FINAL_BEFORE：改版前的倒數三回合合計（兩條正解，對照用）
const FINALE_MAX = 22, BAD_FINALE_MAX = 10, FINAL_BEFORE = '51.0／52.6';   // WARN_OVER：劇本超過上限多於這麼多秒才印 ⚠（審稿：live 的抖動在這以內）   // 非關鍵劇本 SCRIPT_MAX 4.5 s 與只有走路的例外 SCRIPT_EXCEPT 跟各物品測試共用（test/helpers/show.js）
const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose'), check = args.has('--check');
const name = id => spec.ITEMS[id].name;
const s1 = x => x.toFixed(1);
const label = e => e.kind === 'countdown' ? `倒數字 ${e.n}` : `${e.kind}${e.item ? ` ${e.item}` : ''}${(e.to ?? e.delta?.to) != null ? `→${e.to ?? e.delta.to}` : ''}`;

const { show, run, scriptElapsed } = await headlessShow();
const failures = [], warnings = [];

for (const { order, ending } of stats(enumerate(spec), spec).full) {
  show.reset();
  let state = createState(spec);
  const steps = [...order.map(id => ['place', id]), ...Array.from({ length: spec.CLOSING_TURNS }, () => ['advance'])];
  const cells = [], details = [];
  let total = 0, closing = 0;   // closing：倒數三回合＋終局（最終章）
  for (const [i, [kind, id]] of steps.entries()) {
    const r = kind === 'place' ? place(state, id, spec) : advance(state, spec); state = r.state;
    // 倒數回合最前面是遊戲層插的倒數字（countdown，101 頭上 3、2、1——跟 game.js 一樣算進秒數）
    const events = kind === 'place' ? [...r.events, { kind: 'settle' }] : closingEvents(i - order.length, r.events);
    const marks = [];   // [事件, 開演那一刻的 elapsed, 那一刻的劇本秒數, mark 的 info]
    await run(events, { montage: kind === 'advance', onMark: (e, info) => marks.push([e, show.elapsed, scriptElapsed(), info]) });
    const secs = show.elapsed, scripted = scriptElapsed();   // 整回合（含鏡頭平移、空拍、回全景）；不含 focus 拍的
    // 第 j 個事件：[事件秒數, 劇本秒數]（最後一個量到回合結束）
    const span = j => [(marks[j + 1]?.[1] ?? secs) - marks[j][1], (marks[j + 1]?.[2] ?? scripted) - marks[j][2] - (marks[j][3]?.gap ?? 0)];
    total += secs; if (kind === 'advance') closing += secs;
    const k = i - order.length + 1;   // 倒數第幾回合（放置回合 ≤ 0）
    const head = kind === 'place' ? `${i + 1} ${name(id)}` : `倒數 ${k}`;
    const keys = marks.filter(m => m[3]?.key).length, cap = kind === 'place' ? MAX + KEY_EXTRA * Math.max(0, keys - 1) : CLOSING_MAX;
    cells.push(`${head} ${s1(secs)}/${cap} s`);
    if (kind === 'place' && (secs < MIN || secs > cap)) failures.push(`${ending.title} 第 ${i + 1} 回合（${name(id)}）${s1(secs)} s（${secs < MIN ? `< ${MIN}` : `> ${cap}，◆ ${keys} 個`}）`);
    if (kind === 'advance' && secs > CLOSING_MAX) failures.push(`${ending.title} 倒數 ${k} ${s1(secs)} s（倒數 > ${CLOSING_MAX}）`);
    // 放置回合：每個非關鍵劇本 ≤ SCRIPT_MAX、◆ ≤ KEY_MAX——live 秒數看日常裡的人在哪，會差半秒上下，只印警告（⚠，不算失敗）；
    // 劇本本身的上限由各物品測試單獨量（test/*.test.js 的 SCRIPT_MAX／KEY_MAX）。回合秒數超過上限才算失敗
    if (kind === 'place') marks.forEach(([e, , , info], j) => {
      const script = span(j)[1];
      const cap = SCRIPT_EXCEPT[`${e.item} ${e.kind === 'placed' ? 1 : e.to}`] ?? SCRIPT_MAX;
      if (!info?.key && e.kind !== 'settle' && script > cap + WARN_OVER) warnings.push(`${ending.title} 第 ${i + 1} 回合 ${label(e)} 劇本 ${s1(script)} s（> ${cap}）`);
      // ◆ 關鍵事件 live ≤ KEY_MAX（裁決 R17）：事件秒數（含鏡頭平移）扣掉物品之間的空拍
      const live = span(j)[0] - (info?.gap ?? 0);
      if (info?.key && live > KEY_MAX + WARN_OVER) warnings.push(`${ending.title} 第 ${i + 1} 回合 ◆${label(e)} ${s1(live)} s（> ${KEY_MAX}）`);
    });
    if (verbose) {
      // 每個事件的秒數 = 下一個 mark（最後一個用回合結束）減自己的 mark；倒數回合的第一個事件是倒數字
      // 「事件秒數（劇本秒數）」，◆ 標關鍵劇本
      const parts = marks.map(([e, , , info], j) => { const [t, sc] = span(j); return `${info?.key ? '◆' : ''}${label(e)} ${s1(t)}${Math.abs(t - sc) > 0.05 ? `（${s1(sc)}）` : ''}`; });
      details.push(`  ${head}：${parts.join('、')}`);
    }
  }
  // 終局回合（game.js：倒數演完 → show.turn(finaleEvents(resolve(state)), { finale: true })）
  const fin = await finale(state);
  total += fin.secs; closing += fin.secs;
  cells.push(`終局 ${s1(fin.secs)}/${FINALE_MAX} s`);
  if (fin.secs > FINALE_MAX) failures.push(`${ending.title} 終局 ${s1(fin.secs)} s（> ${FINALE_MAX}）`);
  if (verbose) details.push(`  終局：${fin.parts.join('、')}`);
  console.log(`${ending.title}  ${cells.join(' | ')} | 合計 ${s1(total)} s | 最終章 ${s1(closing)} s（倒數三回合＋終局；原本 ${FINAL_BEFORE}）`);
  for (const d of details) console.log(d);
}

// 兩局固定的壞結局：放置與倒數瞬間演完，終局（只有飛彈）live
for (const [outcome, title] of [['hit', '命中'], ['deflect', '吹歪']]) {
  show.reset();
  let state = createState(spec);
  const order = EXAMPLE[outcome];
  for (const id of order) { const r = place(state, id, spec); state = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  for (let i = 0; i < spec.CLOSING_TURNS; i++) { const r = advance(state, spec); state = r.state; await run(closingEvents(i, r.events), { montage: true, instant: true }); }
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
