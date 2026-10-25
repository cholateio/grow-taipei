// 收緊到剛好兩解（一賽博一外星）：只用 whitelist，單一、兩兩、三三組合；在現有正解上快篩，再全枚舉跑完整驗收。
// node tools/pairsearch.mjs [最多組合數=3]
import * as base from '../src/rules/spec.js';
import { enumerate, stats, check, playOrder } from '../src/solver/run.js';
import { withClause } from '../src/solver/tighten.js';
import { WHITELIST, toCand } from './whitelist.mjs';
const name = id => base.ITEMS[id].name, fmt = c => `${c.item} up[${c.level}] += ${JSON.stringify(c.cond)}`;
const full0 = stats(enumerate(base), base).full;
const survive = spec => { let cy = 0, al = 0; for (const r of full0) { const p = playOrder(r.order, spec); if (p.maxCount === 8) p.ending.id === 'cyber' ? cy++ : al++; } return { cy, al }; };
const cands = WHITELIST.map(toCand), depth = +(process.argv[2] ?? 3);
console.log(`起點：${full0.length} 解，白名單 ${cands.length} 條`);
let shown = 0;
const tryCombo = combo => {
  let sp = base; for (const c of combo) sp = withClause(sp, c);
  const v = survive(sp); if (v.cy !== 1 || v.al !== 1) return v;
  const res = enumerate(sp), s = stats(res, sp), c = check(res, sp);
  console.log(`\n${c.ok ? '✔' : '✖'} ${combo.map(fmt).join(' & ')}  avg ${s.avgMax.toFixed(2)}  ${c.ok ? '' : c.failures.join(' | ')}`);
  for (const r of s.full) console.log('   ', r.order.map(name).join('→'), '⇒', r.ending.id);
  if (c.ok && ++shown >= 6) process.exit(0);
  return v;
};
const rec = (start, combo) => {
  if (combo.length) { const v = tryCombo(combo); if (v.cy < 1 || v.al < 1) return; }
  if (combo.length >= depth) return;
  for (let i = start; i < cands.length; i++) if (!combo.some(c => c.item === cands[i].item && c.level === cands[i].level)) rec(i + 1, [...combo, cands[i]]);
};
rec(0, []);
if (!shown) console.log('\n白名單內找不到完全通過的組合');
