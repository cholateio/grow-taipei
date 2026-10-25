// 診斷：把每一條「看別人」的升級條件換成純年齡，看正解數怎麼變（規則收不到解時找瓶頸用）
// node tools/relax.mjs
import * as base from '../src/rules/spec.js';
import { enumerate, stats } from '../src/solver/run.js';
const name = id => base.ITEMS[id].name;
const count = spec => { const s = stats(enumerate(spec), spec); return { full: s.full.length, cy: s.full.filter(r => r.ending.id === 'cyber').length }; };
console.log('現況', count(base));
for (const id of base.ORDER) for (const n in base.ITEMS[id].up) {
  const c = JSON.stringify(base.ITEMS[id].up[n]);
  if (!/minLevel|maxLevel|present|absent/.test(c)) continue;
  const ITEMS = structuredClone(base.ITEMS); ITEMS[id].up[n] = { age: [id, n - 1] };
  console.log(`${name(id)} Lv${n} 改純年齡 →`, count({ ...base, ITEMS }), c);
}
