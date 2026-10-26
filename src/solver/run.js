// 求解器：跑完 8! 種放置順序，做統計與 §6.5 的六條驗收，外加「晶片放第 8 個」的報告項（只印，不算失敗）。
// node src/solver/run.js          印統計
// node src/solver/run.js --check  另跑驗收，失敗 exit 1
import { fileURLToPath } from 'node:url';
import * as defaultSpec from '../rules/spec.js';
import { createState, place, advance } from '../rules/engine.js';
import { resolve, satisfied, ENDINGS } from '../rules/endings.js';

const BAD = ['blackout', 'flood', 'domeRats', 'typhoonDeflect', 'shieldDown', 'milkExpired', 'bobaSugar'];

const countMax = (state, spec) => spec.ORDER.filter(id => state.lv[id] === spec.ITEMS[id].max).length;

// 第 8 個放完後的倒數回合（spec.CLOSING_TURNS），和遊戲本體一樣
export function closing(state, spec = defaultSpec) {
  const events = [];
  for (let i = 0; i < (spec.CLOSING_TURNS ?? 0); i++) { const r = advance(state, spec); state = r.state; events.push(...r.events); }
  return { state, events };
}

export function playOrder(order, spec = defaultSpec) {
  let state = createState(spec);
  const events = [];
  for (const id of order) { const r = place(state, id, spec); state = r.state; events.push(...r.events); }
  { const r = closing(state, spec); state = r.state; events.push(...r.events); }
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
      try { state = closing(state, spec).state; } catch (e) { fail(order, e); return; }
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

// 節奏（§6.5 #6，使用者 2026-10-25「末期統一升等很突然」）：正解逐回合重播（含倒數），
// 同一回合到 MAX 的物品 ≤ 4 個，且「有物品到 MAX」的回合至少 3 個不同回合。
// 物品 v2（裁決 R3，2026-10-26）從 3／4 放寬：61 級擠在 11 回合裡，鮮奶、晶片、棒球和第 7 個放的都是零餘裕，
// 最後一回合一定有 4 個到 MAX——那就是 GROW 的收尾；舊數字是 41 級時定的。
// （每回合「升級」數不設限：每個物品每回合自己長一級，中盤六七個一起長正是熱鬧的地方）
export const PACING = { maxMaxesPerTurn: 4, minMaxTurns: 3 };
export function pacing(full, spec = defaultSpec) {
  let maxGrowsPerTurn = 0, maxMaxesPerTurn = 0, maxTurns = Infinity;
  const failures = [];
  for (const r of full) {
    let state = createState(spec);
    const steps = [...r.order.map(id => s => place(s, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS ?? 0 }, () => s => advance(s, spec))];
    const turnsWithMax = new Set(); let worstGrows = 0, worstMaxes = 0;
    steps.forEach((step, t) => {
      const res = step(state); state = res.state;
      worstGrows = Math.max(worstGrows, res.events.filter(e => e.kind === 'grow').length);
      const maxed = new Set(res.events.filter(e => (e.kind === 'grow' && e.to === spec.ITEMS[e.item].max) || (e.delta && e.delta.to === spec.ITEMS[e.delta.target].max)).map(e => e.delta?.target ?? e.item));
      if (maxed.size) turnsWithMax.add(t);
      worstMaxes = Math.max(worstMaxes, maxed.size);
    });
    maxGrowsPerTurn = Math.max(maxGrowsPerTurn, worstGrows); maxMaxesPerTurn = Math.max(maxMaxesPerTurn, worstMaxes); maxTurns = Math.min(maxTurns, turnsWithMax.size);
    const name = r.order.join(',');
    if (worstMaxes > PACING.maxMaxesPerTurn) failures.push(`節奏：${name} 有一回合 ${worstMaxes} 個物品同時到 MAX（上限 ${PACING.maxMaxesPerTurn}）`);
    if (turnsWithMax.size < PACING.minMaxTurns) failures.push(`節奏：${name} 只有 ${turnsWithMax.size} 個回合出現 MAX（至少 ${PACING.minMaxTurns}）`);
  }
  if (!full.length) maxTurns = 0;
  return { ok: failures.length === 0, maxGrowsPerTurn, maxMaxesPerTurn, maxTurns, failures };
}

// 反目標「晶片不能變成樞紐」（物品 v2 §2，報告項、不是驗收）：晶片放第 8 個時，
// 是否有某一種順序讓其餘七個都到 MAX−1 以上。best = 差最少的那條（short = 沒到 MAX−1 的物品）。
export function chipEighth(results, spec = defaultSpec) {
  let best = null, count = 0;
  for (const r of results) {
    if (r.error || r.order[r.order.length - 1] !== 'chip') continue;
    const short = spec.ORDER.filter(id => id !== 'chip' && r.state.lv[id] < spec.ITEMS[id].max - 1);
    if (!short.length) count++;
    if (!best || short.length < best.short.length) best = { order: r.order, short };
  }
  return { ok: count > 0, count, best };
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
  // 一回合一級的節奏下大家都會長一些，門檻從 3 放寬到 3.5（§6.5 #4，2026-10-25）
  if (s.avgMax > 3.5) failures.push(`隨機順序平均 MAX 數必須 ≤ 3.5，目前 ${s.avgMax.toFixed(2)}`);
  if (s.greedyReachesTrue) failures.push('貪婪策略不能走到真結局');
  failures.push(...pacing(s.full, spec).failures);
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
  const ce = chipEighth(results, defaultSpec);
  console.log(ce.ok ? `晶片放第 8 個：其餘七個都到 MAX−1 的順序 ${ce.count} 種（例：${ce.best.order.map(name).join(' → ')}）`
    : `晶片放第 8 個：沒有順序讓其餘七個都到 MAX−1（最接近：${ce.best.order.map(name).join(' → ')}，差 ${ce.best.short.map(name).join('、')}）`);
  if (process.argv.includes('--check')) {
    const c = check(results, defaultSpec);
    console.log(c.ok ? '\n驗收：ok' : `\n驗收失敗：\n${c.failures.map(f => '  ✖ ' + f).join('\n')}`);
    if (!c.ok) process.exit(1);
  }
}
