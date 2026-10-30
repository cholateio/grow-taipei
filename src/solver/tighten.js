// 收緊器：在 up[] 上逐步 AND 一條子句，讓 score 降到 0（= check 通過）。
// 只動升級條件，不碰颱風檢查、老鼠分岔等謎題骨架。不自動改檔，只印建議。
// node src/solver/tighten.js
import { fileURLToPath } from 'node:url';
import * as defaultSpec from '../rules/spec.js';
import { enumerate, stats, check, playOrder } from './run.js';

export function candidates(spec = defaultSpec) {
  const out = [];
  for (const item of spec.ORDER) {
    const max = spec.ITEMS[item].max;
    for (let level = 2; level <= max; level++) {
      for (const other of spec.ORDER) {
        if (other === item) continue;
        for (let n = 1; n <= spec.ITEMS[other].max; n++) out.push({ item, level, cond: { minLevel: [other, n] } });
        for (let n = 0; n < spec.ITEMS[other].max; n++) out.push({ item, level, cond: { maxLevel: [other, n] } });
      }
      for (let n = 2; n <= 4; n++) out.push({ item, level, cond: { age: [item, n] } });
    }
  }
  return out;
}

export function withClause(spec, { item, level, cond }) {
  const it = spec.ITEMS[item];
  return { ...spec, ITEMS: { ...spec.ITEMS, [item]: { ...it, up: { ...it.up, [level]: { and: [it.up[level], cond] } } } } };
}

export function score(spec = defaultSpec) {
  const results = enumerate(spec);
  if (results.some(r => r.error)) return Infinity;
  const s = stats(results, spec), c = check(results, spec);
  const softFails = c.failures.filter(f => /沒有任何順序|晶片未 MAX/.test(f)).length;
  const paceFails = c.failures.filter(f => /^節奏/.test(f)).length;   // 加條件救不了節奏，但 score 0 必須等於 check 通過
  // 唯一正解（2026-10-31）：全 MAX 剛好一條、結局賽博龐克
  const notCyber = s.full.some(r => r.ending.id !== 'cyber');
  return Math.abs(s.full.length - 1) * 100 + (notCyber ? 50 : 0)
    + (s.greedyReachesTrue ? 20 : 0) + Math.max(0, s.avgMax - 3.5) * 10 + softFails * 30 + paceFails * 10;
}

const fullResults = spec => stats(enumerate(spec), spec).full;
const fmt = c => `${c.item} up[${c.level}] += ${JSON.stringify(c.cond)}`;

// 便宜的預篩：賽博龐克的正解等距抽最多 200 條重播，估計加了子句後剩幾條。
// 什麼都沒擋、或把正解擋光的子句直接淘汰；目標是剩 1 條（唯一正解 2026-10-31）。
const SAMPLE = 200;
function shortlist(spec, cands, full, k) {
  // 只剩一組（賽博的正解）：原本「賽博＋外星各一組」的外殼拿掉（2026-10-31 Task 5）
  const all = full.filter(r => r.ending.id === 'cyber').map(r => r.order);
  const step = Math.max(1, Math.floor(all.length / SAMPLE));
  const sample = all.filter((_, i) => i % step === 0), scale = all.length / Math.max(1, sample.length);
  const ranked = [];
  for (const c of cands) {
    const next = withClause(spec, c);
    let left = 0, broken = false;
    for (const order of sample) {
      try { const r = playOrder(order, next); if (r.maxCount === spec.ORDER.length && r.ending.id === 'cyber') left++; } catch { broken = true; break; }
    }
    if (broken || (sample.length && left === 0) || left === sample.length) continue;
    ranked.push({ c, gap: Math.abs(left * scale - 1) });
  }
  ranked.sort((a, b) => a.gap - b.gap);
  return ranked.slice(0, k).map(r => r.c);
}

// filter：只考慮通過的候選子句（例如只動 Lv3 以上，保住「Lv2 自己長」的 GROW 節奏）
export function tighten(spec = defaultSpec, { maxSteps = 40, candidateLimit = Infinity, shortlistSize = 30, filter = () => true, log = () => {} } = {}) {
  let cur = spec, curScore = score(spec);
  const applied = [];
  log(`起始 score ${curScore.toFixed(1)}`);
  for (let step = 0; step < maxSteps && curScore > 0; step++) {
    const full = fullResults(cur);
    if (full.length <= 1) { log(`正解只剩 ${full.length} 條，加條件無法再改善`); break; }
    const pool = shortlist(cur, candidates(cur).filter(filter).slice(0, candidateLimit), full, shortlistSize);
    let best = null;
    for (const c of pool) {
      const next = withClause(cur, c), sc = score(next);
      if (sc < curScore && (!best || sc < best.score)) best = { c, spec: next, score: sc };
    }
    if (!best) { log('沒有候選能再降低 score'); break; }
    cur = best.spec; curScore = best.score; applied.push(best.c);
    log(`第 ${step + 1} 步：${fmt(best.c)}  → score ${curScore.toFixed(1)}`);
  }
  return { spec: cur, applied, finalScore: curScore };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = tighten(defaultSpec, { log: m => console.log(m) });
  console.log(`\n最終 score ${r.finalScore.toFixed(1)}`);
  console.log('建議貼進 spec.js 的子句：');
  for (const c of r.applied) console.log('  ' + fmt(c));
  const c = check(enumerate(r.spec), r.spec);
  console.log(c.ok ? '驗收：ok' : `仍未通過：\n${c.failures.map(f => '  ✖ ' + f).join('\n')}`);
}
