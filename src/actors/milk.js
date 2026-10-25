// 鮮奶（§5.1）：牛奶箱 → 一層小學與 3 個小孩 → 兩層、小孩長高 1.3 倍 → 三層、升旗 → 鐘塔、棒球帽（有球場就組少棒隊）→ 大學、學士帽。
// 老鼠 ≥2 或颱風 Lv2：小孩躲回校舍，窗戶亮燈。
import { anchorWorld } from './anchors.js';
import { ringPath } from '../scene/people.js';
import { C, roofColor, rebuilt, offset } from './palette.js';

export const id = 'milk';
export const labelY = 1.4;

export function view(lv) {
  const n = lv.milk, at = anchorWorld('milk'), v = {};
  if (!n) return v;
  const parts = [
    { kind: 'rbox', pos: [-0.95, 0.225, 0.75], scale: 0.45, color: C.cream },
    { kind: 'box', pos: [-0.95, 0.3, 0.75], scale: [0.47, 0.08, 0.47], color: C.blue },
  ];
  const home = lv.rat >= 2 || lv.typhoon === 2;
  // 一級蓋一層：Lv2 一層、Lv3 兩層、Lv4 起三層；Lv6 升格大學，校舍拉長
  const floors = n >= 4 ? 3 : n >= 3 ? 2 : n >= 2 ? 1 : 0, h = 0.2 + 0.5 * floors, w = n >= 6 ? 2.2 : 1.4;
  if (floors) {
    const win = home ? { color: C.warm, glow: C.warm } : { color: C.window };
    parts.push(
      { kind: 'box', pos: [0, h / 2, -0.45], scale: [w, h, 0.8], color: C.wall },
      { kind: 'hip', pos: [0, h + 0.2, -0.45], scale: [w + 0.1, 0.4, 0.9], color: roofColor(C.coral, rebuilt(lv)) },
      { kind: 'cylinder', pos: [0, 0.02, 0.95], scale: [1.2, 0.04, 1.2], color: C.sand },
      { kind: 'cylinder', pos: [0.75, 0.4, 0.95], scale: [0.03, 0.8, 0.03], color: C.cream },
    );
    if (n >= 4) parts.push({ kind: 'box', pos: [0.86, 0.72, 0.95], scale: [0.2, 0.13, 0.02], color: C.coral, flag: true });
    const cols = n >= 6 ? [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75] : [-0.45, -0.15, 0.15, 0.45];
    for (let row = 0; row < floors; row++) for (const x of cols) parts.push({ kind: 'box', pos: [x, 0.38 + row * 0.5, -0.04], scale: [0.16, 0.2, 0.02], ...win, win: true });
  }
  if (n >= 5) parts.push(
    { kind: 'box', pos: [0, h + 0.5, -0.45], scale: [0.4, 1.0, 0.4], color: C.wall },
    { kind: 'cone', pos: [0, h + 1.2, -0.45], scale: [0.5, 0.4, 0.5], color: roofColor(C.navy, rebuilt(lv)) },
    { kind: 'sphere', pos: [0, h + 0.75, -0.24], scale: [0.2, 0.2, 0.04], color: C.yellow, glow: C.yellow },
  );
  v['milk.main'] = { kind: 'compound', at, parts, labelY: n >= 5 ? h + 1.6 : h + 0.6 };
  // 大學校門：兩根柱子 + 半圈拱
  if (n >= 6) v['milk.gate'] = { kind: 'compound', at, parts: [
    { kind: 'box', pos: [0.95, 0.35, 0.2], scale: [0.1, 0.7, 0.1], color: C.wall },
    { kind: 'box', pos: [1.55, 0.35, 0.2], scale: [0.1, 0.7, 0.1], color: C.wall },
    { kind: 'torus', pos: [1.25, 0.7, 0.2], scale: 0.62, color: C.wall },
  ] };
  if (n >= 2 && !home) {
    const league = n >= 5 && lv.baseball >= 2;
    // 少棒隊在巨蛋旁的空地練球（門口留給球員和觀眾）
    const center = league ? offset(anchorWorld('baseball'), -1.15, 0.75) : offset(at, 0, 0.95);
    v['milk.kids'] = {
      kind: 'people', at, n: 3, path: ringPath(center, league ? 0.4 : 0.5, center.y), speed: 0.5, shirt: C.yellow,
      accessory: n >= 6 ? 'mortar' : n >= 5 ? 'cap' : 'none', ...(n >= 3 ? { scale: 1.3 } : {}),
    };
  }
  return v;
}
