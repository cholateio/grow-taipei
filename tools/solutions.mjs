// 重產 docs/superpowers/plans/solutions.md（劇透）：兩條正解逐回合表（含倒數回合）、壞結局代表順序、統計。
// 「調參紀錄」一節從舊檔原樣保留，新紀錄手動加在後面。  npm run solutions
import { readFile, writeFile } from 'node:fs/promises';
import * as spec from '../src/rules/spec.js';
import { createState, place, advance } from '../src/rules/engine.js';
import { enumerate, stats, playOrder, greedyOrder, pacing } from '../src/solver/run.js';
import { ENDINGS } from '../src/rules/endings.js';

const FILE = new URL('../docs/superpowers/plans/solutions.md', import.meta.url);
const name = id => spec.ITEMS[id].name, O = spec.ORDER;
const results = enumerate(spec), s = stats(results, spec);

function table(order) {
  let state = createState(spec);
  const steps = [...order.map(id => ['place', id]), ...Array.from({ length: spec.CLOSING_TURNS }, () => ['advance'])];
  return steps.map(([kind, id], i) => {
    const r = kind === 'place' ? place(state, id, spec) : advance(state, spec); state = r.state;
    const ev = r.events.filter(e => e.kind === 'grow' || e.delta || e.flag).map(e => e.kind === 'grow' ? `${name(e.item)}${e.to}${e.via.length ? `（${e.via.map(name).join('、')}）` : ''}` : e.story ?? '').filter(Boolean).join('、');
    const cells = O.map(k => state.lv[k] === spec.ITEMS[k].max ? `**${state.lv[k]}**` : state.lv[k]);
    return `| ${i + 1} | ${kind === 'place' ? name(id) : '（倒數）'} | ${cells.join(' | ')} | ${ev} |`;
  }).join('\n');
}
const head = `| 回合 | 放 | ${O.map(name).join(' | ')} | 事件（括號＝因為誰） |\n|---|---|${O.map(() => '---').join('|')}|---|`;
const sol = id => { const r = s.full.find(x => x.ending.id === id); return `### ${ENDINGS[id].title}\n\n順序：${r.order.map(name).join(' → ')}\n\n${head}\n${table(r.order)}\n`; };
const first = id => results.find(r => r.ending.id === id);
const bad = ['blackout', 'flood', 'domeRats', 'shieldDown', 'typhoonDeflect', 'milkExpired', 'bobaSugar', 'tryAgain']
  .map(id => `- **${ENDINGS[id].title}**（${s.byEnding[id] ?? 0} 種）：${first(id)?.order.map(name).join(' → ') ?? '無'}`).join('\n');
const g = greedyOrder(spec), gr = playOrder(g, spec), p = pacing(s.full, spec);
const chipShort = results.filter(r => r.ending.missile !== 'shield').length / results.length;
const old = await readFile(FILE, 'utf8').catch(() => '');
const log = old.includes('## 調參紀錄') ? old.slice(old.indexOf('## 調參紀錄')) : '## 調參紀錄\n';

await writeFile(FILE, `# 台北成長 正解與統計（劇透）

由 \`npm run solutions\` 產生，規則見 \`src/rules/spec.js\`。規則改了就要重產。

## 兩條正解

${sol('cyber')}
${sol('alien')}
## 各壞結局的代表順序

（取該結局當標題卡的第一條順序）

${bad}

## 統計

- 結局分佈：${Object.entries(s.byEnding).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${ENDINGS[id]?.title ?? id} ${n}`).join('、')}
- MAX 數分佈 0..8：${s.maxHist.join(' ')}
- 隨機平均 MAX 數：${s.avgMax.toFixed(2)}
- 貪婪順序：${g.map(name).join(' → ')} ⇒ ${gr.ending.title}（${gr.maxCount} 個 MAX）
- 晶片未 MAX 到終局的比例：${(chipShort * 100).toFixed(1)}%
- 節奏：正解單回合最多 ${p.maxGrowsPerTurn} 個升級、最多 ${p.maxMaxesPerTurn} 個同時到 MAX、MAX 分散在 ${p.maxTurns} 個回合

${log}`);
console.log(`寫入 solutions.md：${s.full.length} 解`);
