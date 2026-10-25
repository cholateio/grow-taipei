// 晶片（§5.1）：北士科工地 → 冒煙的廠房、2 個工程師走去 101 → 園區三棟玻璃盒、4 個工程師騎 YouBike → 星群總部（弧形玻璃）→ 矽盾待命（閃光在 101）。
// 老鼠 ≥2 且晶片 ≥3：其中一個工程師變成拿放大鏡的「鼠類偵防師」。
import { anchorWorld, routeBetween } from './anchors.js';
import { ringPath } from '../scene/people.js';
import { builders as towerBuilders } from './tower.js';
import { C, roofColor, rebuilt, offset } from './palette.js';

export const id = 'chip';
export const labelY = 1.5;
const AT = anchorWorld('chip');
// 工程師上下班：廠門 → 橋 → 101 腳下（開放路徑，走到底折返）
export const ENGINEER_ROUTE = routeBetween([1, 0], offset(AT, -0.3, 0.75), [0, 0], offset(anchorWorld('tower'), 0.95, 0.25));

export function view(lv) {
  const n = lv.chip, at = AT, v = {};
  if (!n) return v;
  const parts = [];
  if (n === 1) {
    parts.push({ kind: 'box', pos: [0, 0.05, 0], scale: [1.2, 0.1, 1.0], color: C.cliff });
    for (let i = 0; i < 8; i++) {
      const side = i >> 1, k = i % 2 ? 0.4 : -0.4, horiz = side % 2 === 0, s = side < 2 ? -0.8 : 0.8;
      parts.push({ kind: 'box', pos: horiz ? [k, 0.15, s] : [s, 0.15, k], scale: horiz ? [0.78, 0.3, 0.03] : [0.03, 0.3, 0.78], color: C.yellow });
    }
    for (const [x, z] of [[-0.95, 0.95], [-0.6, 1.0], [0.95, 0.9]]) parts.push({ kind: 'cone', pos: [x, 0.09, z], scale: [0.12, 0.18, 0.12], color: C.coral });
    v['chip.crane'] = { kind: 'crane', at, height: 1.8, offset: [0.5, 0, -0.4], footprint: { x: 0.5, z: -0.4, w: 0.6, d: 0.6 } };   // footprint 擋塔架（at + offset）
    v['chip.worker'] = { kind: 'people', at, n: 1, accessory: 'helmet', path: ringPath(at, 0.9, at.y), speed: 0.3 };
  } else if (n === 2) {
    parts.push(
      { kind: 'box', pos: [0, 0.4, -0.1], scale: [1.4, 0.8, 1.0], color: C.wall },
      { kind: 'box', pos: [0, 0.84, -0.1], scale: [1.48, 0.08, 1.08], color: roofColor(C.navy, rebuilt(lv)) },
      { kind: 'cylinder', pos: [0.45, 1.1, -0.4], scale: [0.2, 0.6, 0.2], color: C.cliff },
      { kind: 'box', pos: [-0.3, 0.2, 0.41], scale: [0.3, 0.4, 0.02], color: C.window },
    );
    v['chip.smoke'] = { kind: 'smoke', at: offset(at, 0.45, -0.4), n: 4, size: 0.14, rise: 1.0, offsetY: 1.45 };
  } else {
    if (n === 3) parts.push(
      { kind: 'box', pos: [-0.55, 0.55, -0.35], scale: [0.6, 1.1, 0.6], color: C.glass },
      { kind: 'box', pos: [0.35, 0.45, -0.45], scale: [0.9, 0.9, 0.9], color: C.glass },
      { kind: 'box', pos: [0.6, 0.65, 0.5], scale: [0.6, 1.3, 0.6], color: C.glass },
    );
    else parts.push(
      { kind: 'cylinder', pos: [0, 0.05, -0.2], scale: [2.1, 0.1, 1.6], color: C.curb },
      { kind: 'dome', pos: [0, 0.1, -0.2], scale: [2.0, 1.1, 1.5], color: C.glass },
      { kind: 'box', pos: [-1.0, 0.35, 0.45], scale: [0.4, 0.7, 0.4], color: C.glass },
      { kind: 'box', pos: [1.0, 0.45, 0.4], scale: [0.4, 0.9, 0.4], color: C.glass },
    );
    // 園區招牌：白板 + 珊瑚色字條
    parts.push({ kind: 'box', pos: [-0.5, 0.25, 0.95], scale: [0.7, 0.3, 0.05], color: C.white }, { kind: 'box', pos: [-0.5, 0.27, 0.98], scale: [0.5, 0.06, 0.02], color: C.coral });
  }
  v['chip.main'] = { kind: 'compound', at, parts };
  if (n >= 2) {
    const detective = lv.rat >= 2 && n >= 3, k = (n >= 3 ? 4 : 2) - (detective ? 1 : 0);
    v['chip.engineers'] = { kind: 'people', at, n: k, accessory: n >= 3 ? 'bike' : 'coat', path: ENGINEER_ROUTE, loop: false, speed: n >= 3 ? 0.8 : 0.45 };
    if (detective) v['chip.detective'] = { kind: 'people', at, n: 1, accessory: 'glass', path: ENGINEER_ROUTE, loop: false, speed: 0.6 };
  }
  return { 'chip.main': v['chip.main'], ...v };
}

export const builders = { crane: towerBuilders.crane };
