// 節奏報表：無頭模擬兩條正解，一回合一回合（8 次放置 + 倒數三回合）演完，印每回合秒數。
//   npm run pace              印表
//   node tools/pace.mjs --verbose   多印每回合每個事件的秒數（mark 拍之間的 elapsed 差值）
//   node tools/pace.mjs --check     任一回合 < 8 s 或 > 45 s、倒數回合 > 20 s 就列出並 exit 1
import * as spec from '../src/rules/spec.js';
import { createState, place, advance } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow } from '../test/helpers/show.js';

const MIN = 8, MAX = 45, CLOSING_MAX = 20;
const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose'), check = args.has('--check');
const name = id => spec.ITEMS[id].name;
const s1 = x => x.toFixed(1);
const label = e => `${e.kind}${e.item ? ` ${e.item}` : ''}${(e.to ?? e.delta?.to) != null ? `→${e.to ?? e.delta.to}` : ''}`;

const { show, run } = await headlessShow();
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
    const marks = [];   // [事件, 開演那一刻的 elapsed]
    const secs = await run(events, { montage: kind === 'advance', onMark: e => marks.push([e, show.elapsed]) });
    total += secs;
    const k = i - order.length + 1;   // 倒數第幾回合（放置回合 ≤ 0）
    const head = kind === 'place' ? `${i + 1} ${name(id)}` : `倒數 ${k}`;
    cells.push(`${head} ${s1(secs)} s`);
    if (kind === 'place' && (secs < MIN || secs > MAX)) failures.push(`${ending.title} 第 ${i + 1} 回合（${name(id)}）${s1(secs)} s（${secs < MIN ? `< ${MIN}` : `> ${MAX}`}）`);
    if (kind === 'advance' && secs > CLOSING_MAX) failures.push(`${ending.title} 倒數 ${k} ${s1(secs)} s（倒數 > ${CLOSING_MAX}）`);
    if (verbose) {
      // 每個事件的秒數 = 下一個 mark（最後一個用回合結束）減自己的 mark；第一個 mark 之前是蒙太奇的 3-2-1
      const parts = marks.map(([e, at], j) => `${label(e)} ${s1((marks[j + 1]?.[1] ?? secs) - at)}`);
      if (kind === 'advance' && marks.length) parts.unshift(`3-2-1 ${s1(marks[0][1])}`);
      details.push(`  ${head}：${parts.join('、')}`);
    }
  }
  console.log(`${ending.title}  ${cells.join(' | ')} | 合計 ${s1(total)} s`);
  for (const d of details) console.log(d);
}

if (failures.length) { console.log('節奏失敗：'); for (const f of failures) console.log(`  ${f}`); } else console.log('節奏：ok');
if (check && failures.length) process.exitCode = 1;
