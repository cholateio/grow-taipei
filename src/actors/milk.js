// 鮮奶（§5.1）：牛奶箱 → 小學與 3 個小孩 → 加一層、小孩長高 1.3 倍 → 鐘塔、棒球帽（有大巨蛋就組少棒隊去球場）。
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
  if (n >= 2) {
    const h = n >= 3 ? 1.2 : 0.7, win = home ? { color: C.warm, glow: C.warm } : { color: C.window };
    parts.push(
      { kind: 'box', pos: [0, h / 2, -0.45], scale: [1.4, h, 0.8], color: C.wall },
      { kind: 'hip', pos: [0, h + 0.2, -0.45], scale: [1.5, 0.4, 0.9], color: roofColor(C.coral, rebuilt(lv)) },
      { kind: 'cylinder', pos: [0, 0.02, 0.95], scale: [1.2, 0.04, 1.2], color: C.sand },
      { kind: 'cylinder', pos: [0.75, 0.4, 0.95], scale: [0.03, 0.8, 0.03], color: C.cream },
      { kind: 'box', pos: [0.86, 0.72, 0.95], scale: [0.2, 0.13, 0.02], color: C.coral },
    );
    for (let row = 0; row < (n >= 3 ? 2 : 1); row++) for (const x of [-0.45, -0.15, 0.15, 0.45]) parts.push({ kind: 'box', pos: [x, 0.38 + row * 0.5, -0.04], scale: [0.16, 0.2, 0.02], ...win });
  }
  if (n >= 4) parts.push(
    { kind: 'box', pos: [0, 1.7, -0.45], scale: [0.4, 1.0, 0.4], color: C.wall },
    { kind: 'cone', pos: [0, 2.4, -0.45], scale: [0.5, 0.4, 0.5], color: roofColor(C.navy, rebuilt(lv)) },
    { kind: 'sphere', pos: [0, 1.95, -0.24], scale: [0.2, 0.2, 0.04], color: C.yellow, glow: C.yellow },
  );
  v['milk.main'] = { kind: 'compound', at, parts };
  if (n >= 2 && !home) {
    const league = n >= 4 && lv.baseball >= 2;
    const center = league ? offset(anchorWorld('baseball'), 0, 1.1) : offset(at, 0, 0.95);
    v['milk.kids'] = {
      kind: 'people', at, n: 3, path: ringPath(center, 0.5, center.y), speed: 0.5, shirt: C.yellow,
      accessory: n >= 4 ? 'cap' : 'none', ...(n >= 3 ? { scale: 1.3 } : {}),
    };
  }
  return v;
}
