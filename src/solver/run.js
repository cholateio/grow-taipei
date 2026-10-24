// 求解器：跑完 8! 種放置順序，做統計與 §6.5 的五條驗收。
// node src/solver/run.js          印統計
// node src/solver/run.js --check  另跑驗收，失敗 exit 1
import { fileURLToPath } from 'node:url';
import * as defaultSpec from '../rules/spec.js';
import { createState, place } from '../rules/engine.js';
import { resolve, satisfied, ENDINGS } from '../rules/endings.js';

const BAD = ['blackout', 'flood', 'domeRats', 'shieldDown', 'typhoonDeflect', 'milkExpired', 'bobaSugar'];

const countMax = (state, spec) => spec.ORDER.filter(id => state.lv[id] === spec.ITEMS[id].max).length;

export function playOrder(order, spec = defaultSpec) {
  let state = createState(spec);
  const events = [];
  for (const id of order) { const r = place(state, id, spec); state = r.state; events.push(...r.events); }
  return { state, ending: resolve(state, spec), satisfied: satisfied(state, spec), maxCount: countMax(state, spec), events };
}

// 深度優先走完所有順序，共用前綴的狀態（place 呼叫數約為逐條重播的 1/3）。
// 不保留事件列表（4 萬局的事件太佔記憶體）；要看事件就單獨呼叫 playOrder。
export function enumerate(spec = defaultSpec) {
  const out = [];
  const fail = (order, e) => {
    // 前綴就出錯：把所有以它開頭的順序都記成錯誤
    const rest = spec.ORDER.filter(id => !order.includes(id));
    const perms = a => a.length ? a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])) : [[]];
    for (const p of perms(rest)) out.push({ order: [...order, ...p], error: e.message, ending: { id: 'error' }, satisfied: [], maxCount: 0 });
  };
  const walk = (state, order) => {
    if (order.length === spec.ORDER.length) {
      out.push({ order, state, ending: resolve(state, spec), satisfied: satisfied(state, spec), maxCount: countMax(state, spec) });
      return;
    }
    for (const id of spec.ORDER) {
      if (state.lv[id] > 0) continue;
      const next = [...order, id];
      let s;
      try { s = place(state, id, spec).state; } catch (e) { fail(next, e); continue; }
      walk(s, next);
    }
  };
  walk(createState(spec), []);
  return out;
}

export function greedyOrder(spec = defaultSpec) {
  let state = createState(spec);
  const order = [];
  const total = s => spec.ORDER.reduce((n, id) => n + s.lv[id], 0);
  while (order.length < spec.ORDER.length) {
    let best = null;
    for (const id of spec.ORDER) {
      if (state.lv[id] > 0) continue;
      const next = place(state, id, spec).state;
      if (!best || total(next) > best.score) best = { id, state: next, score: total(next) };
    }
    order.push(best.id); state = best.state;
  }
  return order;
}

export function stats(results, spec = defaultSpec) {
  const byEnding = {}, maxHist = new Array(spec.ORDER.length + 1).fill(0);
  let sumMax = 0;
  for (const r of results) { byEnding[r.ending.id] = (byEnding[r.ending.id] || 0) + 1; maxHist[r.maxCount]++; sumMax += r.maxCount; }
  let greedyReachesTrue = false;
  try { greedyReachesTrue = ENDINGS[playOrder(greedyOrder(spec), spec).ending.id].kind === 'true'; } catch { /* 規則壞掉時由 check #5 回報 */ }
  return {
    total: results.length,
    full: results.filter(r => !r.error && r.maxCount === spec.ORDER.length),
    byEnding, avgMax: sumMax / results.length, maxHist, greedyReachesTrue,
  };
}

export function check(results, spec = defaultSpec) {
  const s = stats(results, spec), failures = [];
  if (s.full.length !== 2) failures.push(`正解數必須剛好 2，目前 ${s.full.length}`);
  const ends = s.full.map(r => r.ending.id).sort().join('+');
  const nCyber = s.full.filter(r => r.ending.id === 'cyber').length;
  if (ends !== 'alien+cyber') failures.push(`兩條正解必須一條賽博龐克、一條外星人，目前賽博龐克 ${nCyber}、外星人 ${s.full.length - nCyber}`);
  for (const id of BAD) if (!results.some(r => r.satisfied.includes(id))) failures.push(`壞結局「${ENDINGS[id].title}」沒有任何順序到得了`);
  const chipShort = results.filter(r => r.ending.missile && r.ending.missile !== 'shield').length / results.length;
  if (chipShort < 0.3) failures.push(`晶片未 MAX 的比例必須 ≥ 30%，目前 ${(chipShort * 100).toFixed(1)}%`);
  if (s.avgMax > 3) failures.push(`隨機順序平均 MAX 數必須 ≤ 3，目前 ${s.avgMax.toFixed(2)}`);
  if (s.greedyReachesTrue) failures.push('貪婪策略不能走到真結局');
  const errs = results.filter(r => r.error);
  if (errs.length) failures.push(`${errs.length} 種順序讓引擎出錯，例如 ${errs[0].order.join(',')}：${errs[0].error}`);
  return { ok: failures.length === 0, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now(), results = enumerate(defaultSpec), s = stats(results, defaultSpec);
  const name = id => defaultSpec.ITEMS[id].name;
  console.log(`共 ${s.total} 種順序（${Date.now() - t0} ms）`);
  console.log(`全 MAX：${s.full.length}`);
  for (const r of s.full.slice(0, 10)) console.log(`  ${r.order.map(name).join(' → ')}  ⇒ ${r.ending.title}`);
  console.log('結局分佈：');
  for (const [id, n] of Object.entries(s.byEnding).sort((a, b) => b[1] - a[1])) console.log(`  ${(ENDINGS[id]?.title ?? id).padEnd(8, '　')} ${n}`);
  console.log(`MAX 數分佈 0..8：${s.maxHist.join(' ')}`);
  console.log(`平均 MAX 數：${s.avgMax.toFixed(2)}`);
  const g = greedyOrder(defaultSpec), gr = playOrder(g, defaultSpec);
  console.log(`貪婪順序：${g.map(name).join(' → ')}  ⇒ ${gr.ending.title}（${gr.maxCount} 個 MAX）`);
  if (process.argv.includes('--check')) {
    const c = check(results, defaultSpec);
    console.log(c.ok ? '\n驗收：ok' : `\n驗收失敗：\n${c.failures.map(f => '  ✖ ' + f).join('\n')}`);
    if (!c.ok) process.exit(1);
  }
}
