// 節奏報表：無頭模擬唯一正解（與 EXAMPLE 壞局），一回合一回合（8 次放置 + 最後一輪）演完，印每回合秒數。
//   npm run pace              印表
//   node tools/pace.mjs --verbose   多印每回合每個事件的秒數（mark 拍之間的 elapsed 差值；括號裡是劇本秒數）
//   node tools/pace.mjs --check     任一放置回合或最後一輪 < 4 s 或超過那回合的上限、終局超過上限就列出並 exit 1；
//                                   放置回合裡非關鍵劇本 > 3.5 s、◆ 關鍵事件 > 6 s（R41，使用者 2026-11-05：後期動畫偏長；原 4.5／8）超過 0.3 s 以上只印 ⚠（live 秒數跟日常的人在哪有關；硬門檻是各物品測試）
// 放置回合上限（裁決 R17；計畫 6 設計 §6 50 → 60）：60 + 8 × max(0, ◆ 個數 − 1)——一回合三個 ◆ 最多 76 s；◆ 個數看 mark 的 info.key
// 劇本秒數 = 不含鏡頭 focus 拍的秒數（跟各物品測試的 secs 同一把尺，helpers/show.js 的 scriptElapsed）再扣掉 turn.js 補的空拍（mark 的 info.gap）；
// ◆ 關鍵劇本（info.key）與 101 跳階（settle）不受 3.5 s 限，只印出來
// 拜訪（計畫 6 設計 §4）2026-10-29 回到 GROW 時拿掉了（設計 §4.2）、撲空（計畫 6 設計 §5）2026-10-31 也拿掉了（唯一正解設計 R10）：沒有這兩種段可量
// 最終章（選擇帶動升級 2026-10-28 §6，取代計畫 5 的倒數三回合）：最後一輪是一般回合，門檻跟放置回合一樣（4 s 起，60 + 8 × max(0, ◆ − 1)），
//   列名「最後一輪」；之後演終局回合（警告＋隕石＋真結局尾聲，finale: true）一列「終局 x/22 s」，
//   再印「最後一輪＋終局 x s」（給使用者對照計畫 5 的最終章：外星 70.9、賽博 67.0，不設門檻）；合計含終局。
//   主迴圈之後另跑兩局固定的壞結局（test/helpers/endings.js 的 EXAMPLE.hit／deflect）：計畫 6 起放置與最後一輪也 live（同樣的回合門檻——
//   設計 §6：60 秒上限在唯一正解與 EXAMPLE 上驗），最後一列「終局 x/16 s」。超過 22／16 都算失敗（計畫 17：壞結局也接收尾，12 → 16）。
//   再跑一局「老鼠跑遠」（FAR_TROUBLE：放下的老鼠跑去最遠的 trouble 門口，唯一正解 §5.2），門檻同壞結局
import * as spec from '../src/rules/spec.js';
import { createState, place, advance } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, SCRIPT_MAX, SCRIPT_EXCEPT, KEY_MAX, SCRIPT_MIN, KEY_MIN } from '../test/helpers/show.js';
import { EXAMPLE, finaleStep } from '../test/helpers/endings.js';
import { ENDINGS } from '../src/rules/endings.js';

// §13.6：鏡頭平移與空拍每回合多 6–10 s，門檻 45 → 50；計畫 6 設計 §6：拜訪每回合最多加十幾秒，50 → 60（拜訪 2026-10-29 拿掉了、起因提示 2026-10-31 拿掉了，上限留著當餘裕）；裁決 R15（物品 v2）：MIN 8 → 4（第一回合只有一段短劇本）；
// 放置回合（與最後一輪）的非關鍵劇本 ≤ 3.5 s（R41）
const MIN = 4, MAX = 60, KEY_EXTRA = 8, WARN_OVER = 0.3;   // WARN_OVER：劇本超過上限多於這麼多秒才印 ⚠（審稿：live 的抖動在這以內）   // 非關鍵劇本 SCRIPT_MAX 3.5 s（R41）與燈泡 Lv2 環掃的例外 SCRIPT_EXCEPT 跟各物品測試共用（test/helpers/show.js）
// 終局回合（選擇帶動升級 §6）：真結局（警告＋隕石＋尾聲）≤ 22 s、壞結局（警告＋隕石，有收尾的再加收尾）≤ 16 s（計畫 17 任務 3：從 12 放寬；EXAMPLE.hit／deflect 都是捷運淹水局）；
// FINAL_BEFORE：計畫 5 的最終章（倒數三回合＋終局，外星／賽博），對照用
const FINALE_MAX = 22, BAD_FINALE_MAX = 16, FINAL_BEFORE = { alien: 70.9, cyber: 67.0 };
const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose'), check = args.has('--check');
const name = id => spec.ITEMS[id].name;
const s1 = x => x.toFixed(1);
const label = e => `${e.kind}${e.item ? ` ${e.item}` : ''}${(e.to ?? e.delta?.to) != null ? `→${e.to ?? e.delta.to}` : ''}`;

const { show, run, scriptElapsed } = await headlessShow();
const failures = [], warnings = [];

// 一局 live：8 次放置 + 最後一輪一回合一回合演完（每回合印秒數），再演終局回合（上限 finaleMax）。
// head：這一列開頭（結局名或壞結局的「命中（順序）」）
async function playOrder(order, head0, finaleMax) {
  show.reset();
  let state = createState(spec);
  const steps = [...order.map(id => ['place', id]), ...Array.from({ length: spec.CLOSING_TURNS }, () => ['advance'])];
  const cells = [], details = [];
  let total = 0, closing = 0;   // closing：最後一輪＋終局（最終章）
  for (const [i, [kind, id]] of steps.entries()) {
    const r = kind === 'place' ? place(state, id, spec) : advance(state, spec); state = r.state;
    // 最後一輪跟放置回合一樣演（game.js：play(c.events)，後面補 settle）
    const events = [...r.events, { kind: 'settle' }];
    const marks = [];   // [事件, 開演那一刻的 elapsed, 那一刻的劇本秒數, mark 的 info]
    await run(events, { onMark: (e, info) => marks.push([e, show.elapsed, scriptElapsed(), info]) });
    const secs = show.elapsed, scripted = scriptElapsed();   // 整回合（含鏡頭平移、空拍、回全景）；不含 focus 拍的
    // 第 j 個事件：[事件秒數, 劇本秒數]（最後一個量到回合結束）
    const span = j => [(marks[j + 1]?.[1] ?? secs) - marks[j][1], (marks[j + 1]?.[2] ?? scripted) - marks[j][2] - (marks[j][3]?.gap ?? 0)];
    total += secs; if (kind === 'advance') closing += secs;
    const head = kind === 'place' ? `${i + 1} ${name(id)}` : '最後一輪';
    const what = kind === 'place' ? `第 ${i + 1} 回合（${name(id)}）` : '最後一輪';
    // 放置回合與最後一輪同一套門檻（選擇帶動升級 §6：最後一輪就是一般回合）
    const keys = marks.filter(m => m[3]?.key).length, cap = MAX + KEY_EXTRA * Math.max(0, keys - 1);
    cells.push(`${head} ${s1(secs)}/${cap} s ◆ ${keys}`);
    // R38（使用者 2026-11-05）：咬住的鮮奶停著，有的壞結局局第 8 個放完就沒東西可長——最後一輪可以是 0 s 的空回合（合法），
    //   所以下限 MIN 只管放置回合；最後一輪的下限是 0，上限 cap 照舊
    const floor = kind === 'place' ? MIN : 0;
    if (secs < floor || secs > cap) failures.push(`${head0} ${what} ${s1(secs)} s（${secs < floor ? `< ${floor}` : `> ${cap}，◆ ${keys} 個`}）`);
    // 每個非關鍵劇本 ≤ SCRIPT_MAX、◆ ≤ KEY_MAX——live 秒數看日常裡的人在哪，會差半秒上下，只印警告（⚠，不算失敗）；
    // 劇本本身的上限由各物品測試單獨量（test/*.test.js 的 SCRIPT_MAX／KEY_MAX）。回合秒數超過上限才算失敗
    // R41 最終審稿：下限也在真的回合裡量（各物品測試只單獨演 playItem，日常裡的人、列車在哪會讓劇本變短）——放下／升級的非關鍵劇本 < SCRIPT_MIN、
    //   ◆ live < KEY_MIN，同樣差 WARN_OVER 以上才印 ⚠。跳級的第一級（mark 的 info.skipped，只有 mark）不量。
    //   下限的例外（R41 之前就這麼短，不是這一輪的回歸，最終審稿點名留著）：◆ 颱風 3（放晴 4.1 s）、
    //   放下老鼠接著咬鮮奶的那一回合（放下劇本只演爬上岸、跑到牛奶箱 1.7 s，聞、！ 在咬的 fx 裡）
    const bites = r.events.some(x => x.kind === 'fx' && x.cause === 'rat' && x.delta?.target === 'milk');
    const floorExempt = (e, key) => (key && ['typhoon 3'].includes(`${e.item} ${e.to}`)) || (e.kind === 'placed' && e.item === 'rat' && bites);
    marks.forEach(([e, , , info], j) => {
      const script = span(j)[1];
      const cap = SCRIPT_EXCEPT[`${e.item} ${e.kind === 'placed' ? 1 : e.to}`] ?? SCRIPT_MAX;
      if (!info?.key && e.kind !== 'settle' && script > cap + WARN_OVER) warnings.push(`${head0} ${what} ${label(e)} 劇本 ${s1(script)} s（> ${cap}）`);
      if (!info?.key && !info?.skipped && (e.kind === 'placed' || e.kind === 'grow') && !floorExempt(e, false) && script < SCRIPT_MIN - WARN_OVER) warnings.push(`${head0} ${what} ${label(e)} 劇本 ${s1(script)} s（< ${SCRIPT_MIN}）`);
      // ◆ 關鍵事件 live ≤ KEY_MAX（裁決 R17）：事件秒數（含鏡頭平移）扣掉物品之間的空拍
      const live = span(j)[0] - (info?.gap ?? 0);
      if (info?.key && live > KEY_MAX + WARN_OVER) warnings.push(`${head0} ${what} ◆${label(e)} ${s1(live)} s（> ${KEY_MAX}）`);
      if (info?.key && !floorExempt(e, true) && live < KEY_MIN - WARN_OVER) warnings.push(`${head0} ${what} ◆${label(e)} ${s1(live)} s（< ${KEY_MIN}）`);
    });
    if (verbose) {
      // 每個事件的秒數 = 下一個 mark（最後一個用回合結束）減自己的 mark
      // 「事件秒數（劇本秒數）」，◆ 標關鍵劇本
      const parts = marks.map(([e, , , info], j) => {
        const [t, sc] = span(j);
        return `${info?.key ? '◆' : ''}${label(e)} ${s1(t)}${Math.abs(t - sc) > 0.05 ? `（${s1(sc)}）` : ''}`;
      });
      details.push(`  ${head}：${parts.join('、')}`);
    }
  }
  // 終局回合（game.js：最後一輪演完 → show.turn(finaleEvents(resolve(state)), { finale: true })：警告、隕石、尾聲）
  const fin = await finale(state);
  total += fin.secs; closing += fin.secs;
  cells.push(`終局 ${s1(fin.secs)}/${finaleMax} s`);
  if (fin.secs > finaleMax) failures.push(`${head0} 終局 ${s1(fin.secs)} s（> ${finaleMax}）`);
  if (verbose) details.push(`  終局：${fin.parts.join('、')}`);
  return { cells, details, total, closing, fin };
}

for (const { order, ending } of stats(enumerate(spec), spec).full) {
  const { cells, details, total, closing } = await playOrder(order, ending.title, FINALE_MAX);
  console.log(`${ending.title}  ${cells.join(' | ')} | 合計 ${s1(total)} s | 最後一輪＋終局 ${s1(closing)} s（計畫 5 最終章 ${s1(FINAL_BEFORE[ending.id])} s）`);
  for (const d of details) console.log(d);
}

// 兩局固定的壞結局（亂放的局，計畫 6 設計 §6、§8）：放置與最後一輪 live（同樣的回合門檻），終局（警告＋隕石＋收尾）≤ 16 s
for (const [outcome, title] of [['hit', '命中'], ['deflect', '吹偏']]) {
  const order = EXAMPLE[outcome], head = `${title}（${order.map(name).join('、')}）`;
  const { cells, details, total, fin } = await playOrder(order, title, BAD_FINALE_MAX);
  console.log(`${head}  ${cells.join(' | ')} | 合計 ${s1(total)} s`);
  for (const d of details) console.log(d);
  if (fin.ending.missile !== outcome) failures.push(`${title}：EXAMPLE.${outcome} 的隕石是 ${fin.ending.missile}`);
}
// 計畫 17：有自己收尾的壞結局各跑一局（EXAMPLE 裡那條到得了的順序；捷運淹水已在上面兩局、變異鼠稱王在下面的老鼠跑遠局），只看終局 ≤ 16 s
// R47：大巨蛋鼠災（影片那一局，吹偏）也有收尾了
for (const id of ['blackout', 'domeFlood', 'cartBlown', 'milkExpired', 'domeRats']) {
  const order = EXAMPLE[id], head = `${ENDINGS[id].title}（${order.map(name).join('、')}）`;
  const { cells, details, total, fin } = await playOrder(order, ENDINGS[id].title, BAD_FINALE_MAX);
  console.log(`${head}  ${cells.join(' | ')} | 合計 ${s1(total)} s`);
  if (verbose) for (const d of details) console.log(d);
  if (fin.ending.id !== id) failures.push(`${ENDINGS[id].title}：EXAMPLE.${id} 的結局是 ${fin.ending.id}`);
}

// 老鼠跑遠處的 trouble（唯一正解 §5.2、2026-10-31 Task 5）：放下的老鼠爬上岸直接跑去上一回合出問題的那棟門口聞一聞。
//   列舉裡（老鼠第 8 個放）trouble 離上岸點最遠的是晶片園區（8.1 m，晶片在等燈泡）：這一局第 8 回合放老鼠。命中局（EXAMPLE.hit）第 6 回合也是放老鼠，trouble 是早餐店（近的）。
//   計畫 14：舊的那局（鮮奶 棒球 晶片 代幣 颱風 燈泡 珍奶 老鼠）燈泡在雨中放下、大停電，trouble 變成路燈（4.9 m），重找：颱風第 1 個放、放晴之後才放其他的
const FAR_TROUBLE = ['typhoon', 'milk', 'chip', 'bulb', 'token', 'boba', 'baseball', 'rat'];
{
  const head = `老鼠跑遠（${FAR_TROUBLE.map(name).join('、')}）`;
  const { cells, details, total } = await playOrder(FAR_TROUBLE, '老鼠跑遠', BAD_FINALE_MAX);
  console.log(`${head}  ${cells.join(' | ')} | 合計 ${s1(total)} s`);
  for (const d of details) console.log(d);
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
