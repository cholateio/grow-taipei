// 燈泡（§5.1）：一盞路燈 → 五個低格的路都有燈、夜市兩攤 → 霓虹（粉藍交錯）→ 夜市四攤＋霓虹招牌 → 全島 LED（燈光秀在 101）。
// 大停電：所有燈熄（view 拿掉發光；app 另外把全島發光歸零）。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { axialToWorld, RING_R } from '../scene/hex.js';
import { C } from './palette.js';

export const id = 'bulb';
export const labelY = 0.8;
const LOW_CELLS = [[0, 0], [1, 0], [-1, 0], [0, 1], [-1, 1]];

function lamp(x, z, head) {
  return [{ kind: 'cylinder', pos: [x, 0.25, z], scale: [0.06, 0.5, 0.06], color: C.ink }, { kind: 'sphere', pos: [x, 0.52, z], scale: 0.12, ...head }];
}

export function view(lv, flags) {
  const n = lv.bulb, at = anchorWorld('bulb'), v = {};
  if (!n) return v;
  const lit = !flags.blackout, head = i => {
    const c = n >= 3 ? (i % 2 ? C.neonBlue : C.neonPink) : C.yellow;
    return lit ? { color: c, glow: c } : { color: C.window };
  };
  v['bulb.main'] = { kind: 'compound', at, parts: lamp(0, 0, head(0)) };
  if (n >= 2) {
    const parts = [];
    let i = 0;
    for (const cell of LOW_CELLS) for (const deg of [90, 210, 330]) {
      const c = axialToWorld(...cell), a = deg * Math.PI / 180, r = RING_R + 0.12;
      parts.push(...lamp(c.x + Math.cos(a) * r - at.x, c.z + Math.sin(a) * r - at.z, head(++i)));
    }
    v['bulb.lamps'] = { kind: 'compound', at, parts, footprint: false };
    const stall = (x, z, roof) => [
      { kind: 'box', pos: [x, 0.22, z], scale: [0.5, 0.45, 0.4], color: C.wall },
      { kind: 'hip', pos: [x, 0.58, z], scale: [0.62, 0.22, 0.52], color: roof },
      { kind: 'sphere', pos: [x + 0.2, 0.47, z + 0.22], scale: 0.07, ...(lit ? { color: C.warm, glow: C.warm } : { color: C.window }) },
    ];
    const market = [...stall(0, 0, C.coral), ...stall(0.6, 0.5, C.yellow)];
    if (n >= 4) market.push(...stall(-0.6, 0.5, C.navy), ...stall(0, 1.0, C.coral));   // 夜市擴大到四攤
    if (n >= 4) market.push({ kind: 'box', pos: [0.3, 0.95, 0.25], scale: [0.7, 0.18, 0.04], ...(lit ? { color: C.neonPink, glow: C.neonPink } : { color: C.window }) });
    v['bulb.market'] = { kind: 'compound', at: landmarkWorld('market'), parts: market };
  }
  return v;
}
