// 演員測試共用：零等級、把 view 攤成世界座標的點（檢查不出格用）
import { axialToWorld, cellAt, worldToAxial } from '../../src/scene/hex.js';
import { cellOf } from '../../src/actors/anchors.js';
import { measurePath, locateOnPath } from '../../src/scene/path.js';
export const zero = { milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0 };
export const lv = extra => ({ ...zero, ...extra });
export function worldPoints(spec) {
  const at = spec.at, pts = [];
  for (const p of spec.parts ?? []) pts.push({ x: at.x + p.pos[0], z: at.z + p.pos[2] });
  for (const s of spec.stand ?? []) pts.push(s);
  for (const s of spec.path ?? []) pts.push(s);
  if (!spec.parts && !spec.stand && !spec.path) pts.push(at);
  return pts;
}
export const distToCell = (p, cell) => { const c = axialToWorld(...cell); return Math.hypot(p.x - c.x, p.z - c.z); };

// 名冊入口（§13.2、計畫 3.8 Task 5）：每個宣告的入口點走得到、離每個站位 ≥ 1.5。
// 站位：wander 的散步中心、path 的第 i 個人錯開的那一點（i / n）、follow 的 at、stand 的 spots（ride、主島外的家沒有入口，不查）。
// 入口：home.entry（陣列每一個都查）；沒給就照名冊用 nav.edgePoint(家那格, 站位) 算每個人的
export const ENTRY_MIN = 1.5;
export function rosterSpots(decl) {
  const h = decl.home ?? {};
  if (h.kind === 'wander') return [].concat(h.at ?? decl.at);
  if (h.kind === 'path') { const lens = measurePath(h.path, !!h.loop), T = lens.at(-1); return Array.from({ length: decl.n }, (_, i) => locateOnPath(h.path, lens, T * i / Math.max(1, decl.n), !!h.loop)); }
  if (h.kind === 'stand') return h.spots?.length ? h.spots : [decl.at];
  if (h.kind === 'follow') return [decl.at];
  return [];
}
// 回傳查到的問題（空陣列 = 全部合格）；label 標在每一條前面
export function entryProblems(view, nav, label = '') {
  const bad = [];
  for (const [key, d] of Object.entries(view)) {
    if (d?.kind !== 'roster' || d.home?.kind === 'ride') continue;
    const spots = rosterSpots(d).filter(p => cellAt(p.x, p.z)); if (!spots.length) continue;
    const entries = d.home.entry ? [].concat(d.home.entry) : spots.map(p => nav.edgePoint(cellAt(p.x, p.z), p));
    for (const e of entries) {
      if (!e || !nav.walkable(e.x, e.z)) { bad.push(`${label} ${key} entry ${e && `(${e.x.toFixed(2)}, ${e.z.toFixed(2)})`} not walkable`); continue; }
      for (const p of spots) { const dd = Math.hypot(e.x - p.x, e.z - p.z); if (dd < ENTRY_MIN) bad.push(`${label} ${key} entry (${e.x.toFixed(2)}, ${e.z.toFixed(2)}) ${dd.toFixed(2)} from spot (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`); }
    }
  }
  return bad;
}

// focus 拍的目標換成格子 [q, r]（函數目標用 ctx 解開；物品 id 看它的格子；點看它落在哪一格）；回 null = 這拍會跳過
export function focusCell(beat, ctx) {
  const t = typeof beat.target === 'function' ? beat.target(ctx) : beat.target;
  if (!t) return null;
  return Array.isArray(t) ? [...t] : typeof t === 'string' ? cellOf(t) : worldToAxial(t.x, t.z);
}
// 假 rig 記下的 focus 呼叫（從第 n0 筆起）換成格子；'home' 記成 'home'
export const focusTrail = (log, n0 = 0) => log.slice(n0).filter(([k]) => k === 'focus' || k === 'home').map(([k, p]) => (k === 'home' ? 'home' : worldToAxial(p.x, p.z)));
