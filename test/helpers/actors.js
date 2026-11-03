// 演員測試共用：零等級、把 view 攤成世界座標的點（檢查不出格用）
import { axialToWorld, cellAt, cellTop, worldToAxial, RING_R } from '../../src/scene/hex.js';
import { cellOf, anchorWorld, routeBetween } from '../../src/actors/anchors.js';
import { offset } from '../../src/actors/palette.js';
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

// 測 path 日常（開放折線、過拱橋、走到底折返、≥ 2 人錯開）用的手畫路線：原本晶片工程師的通勤路線（廠門 → 園區南緣 → 橋 → 101 腳下）。
// 裁決 R23（2026-10-31）起工程師改在廠區散步（wander），遊戲裡已經沒有 n ≥ 2 的開放折線，名冊的 path 機制照樣留著、照樣測
export const OPEN_ROUTE = (() => {
  const AT = anchorWorld('chip'), TOWER = anchorWorld('tower'), door = offset(AT, -0.3, 1.25), west = offset(AT, -1.45, 1.25);
  const r = routeBetween([1, 0], door, [0, 0], offset(TOWER, 0.95, 0.25));
  return [r[0], { ...west, y: r[0].y }, ...r.slice(1)];
})();
// 測閉合折線日常（loop、過拱橋、等速繞圈）用的手畫路線：原本燈泡電工 Lv1–6 巡的主路（五個低格的環路接成一圈）。
// 計畫 16（使用者 2026-11-03：「拿掉前期的燈泡工人，他亂跑」）起電工 Lv7 才登場、住在風車島上，遊戲裡已經沒有閉合折線；名冊的 loop 機制照樣留著、照樣測。
// pointy-top：角在 30°+60°k、邊中點＝橋頭在 60°k；角往內收 0.05；捷運格 30° 角往外放到 RING_R + 0.05（同原本的 bulb.ROAD）
export const RING_LOOP = (() => {
  const at = (cell, deg, r) => { const c = axialToWorld(...cell), a = deg * Math.PI / 180; return { x: c.x + Math.cos(a) * r, y: cellTop(cell), z: c.z + Math.sin(a) * r }; };
  const tour = [
    [[0, 0], [180, 150, 90, 30, 0]], [[1, 0], [180, 210, 270, 330, 30, 90, 120]], [[0, 1], [300, 330, [30, RING_R + 0.05], 90, 150, 180]],
    [[-1, 1], [0, 30, 90, 150, 210, 240]], [[-1, 0], [60, 90, 150, 210, 270, 330, 0]],
  ];
  return tour.flatMap(([cell, degs]) => degs.map(d => (Array.isArray(d) ? at(cell, ...d) : at(cell, d, d % 60 ? RING_R - 0.05 : RING_R * Math.sqrt(3) / 2))));
})();
