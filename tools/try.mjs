// 試算：node tools/try.mjs '{"typhoon":{"3":{...}}}' [...] → 每組覆寫各跑一次求解器
import * as base from '../src/rules/spec.js';
import { enumerate, stats, check } from '../src/solver/run.js';
const name = id => base.ITEMS[id].name;
for (const arg of process.argv.slice(2)) {
  const ITEMS = structuredClone(base.ITEMS), o = JSON.parse(arg);
  for (const id in o) Object.assign(ITEMS[id].up, o[id]);
  const spec = { ...base, ITEMS }, res = enumerate(spec), s = stats(res, spec), c = check(res, spec);
  console.log(`== ${arg}\n   全MAX ${s.full.length} (cyber ${s.full.filter(r => r.ending.id === 'cyber').length}) avg ${s.avgMax.toFixed(2)} greedy ${s.greedyReachesTrue}`);
  for (const r of s.full.slice(0, 4)) console.log('   ', r.order.map(name).join('→'), r.ending.id);
  console.log('   ', c.ok ? 'ok' : c.failures.filter(f => !/^節奏：/.test(f)).join(' | '), `| 節奏失敗 ${c.failures.filter(f => /^節奏：/.test(f)).length}`);
}
