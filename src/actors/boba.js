// 珍奶（§5.1）：路邊攤車 → 6 個拿行李箱的觀光客排隊 → 珍奶噴泉廣場（有鮮奶 ≥2 → 招牌變「鮮奶珍奶」、排 10 人）。
// 老鼠撞翻攤車、颱風外送都是事件演出（舞台的搖晃、颱風模組的機車），不在這裡。
import { anchorWorld } from './anchors.js';
import { C, offset } from './palette.js';

export const id = 'boba';
export const labelY = 1.0;
const TEA = 0xc9a27c, SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// 排隊：先往 −x 排 6 個，再往 +z 轉彎
function queue(at, n, start) {
  return Array.from({ length: n }, (_, i) => i < 6
    ? { ...offset(at, start - 0.22 * i, 0.1), yaw: Math.PI / 2 }
    : { ...offset(at, start - 0.22 * 5, 0.1 + 0.22 * (i - 5)), yaw: Math.PI });
}

export function view(lv) {
  const n = lv.boba, at = anchorWorld('boba'), v = {};
  if (!n) return v;
  const fresh = lv.milk >= 2;
  const parts = n < 3 ? [
    { kind: 'box', pos: [0, 0.35, 0], scale: [0.6, 0.5, 0.4], color: C.wall },
    { kind: 'hip', pos: [0, 0.75, 0], scale: [0.75, 0.25, 0.55], color: C.coral },
    { kind: 'torus', pos: [-0.2, 0.1, 0.21], scale: 0.2, color: C.ink }, { kind: 'torus', pos: [0.2, 0.1, 0.21], scale: 0.2, color: C.ink },
    { kind: 'cylinder', pos: [0, 1.0, 0], scale: [0.2, 0.25, 0.2], color: TEA },
    { kind: 'sphere', pos: [0, 0.92, 0.1], scale: 0.05, color: C.ink },
  ] : [
    { kind: 'cylinder', pos: [0, 0.03, 0], scale: [1.8, 0.06, 1.8], color: C.curb },
    { kind: 'cylinder', pos: [0, 0.07, 0], scale: [1.3, 0.04, 1.3], color: 0xa4d4da, glow: 0xa4d4da },
    { kind: 'cylinder', pos: [0, 0.48, 0], scale: [0.6, 0.8, 0.6], color: TEA },
    { kind: 'dome', pos: [0, 0.88, 0], scale: 0.62, color: C.cream },
    { kind: 'cylinder', pos: [0.08, 1.25, 0], scale: [0.05, 0.6, 0.05], rot: [0, 0, 0.2], color: C.coral },
    ...[0, 1, 2].map(i => ({ kind: 'sphere', pos: [Math.cos(i * 2.1) * 0.22, 0.16, Math.sin(i * 2.1) * 0.22], scale: 0.09, color: C.ink })),
    { kind: 'box', pos: [0, 0.3, 0.88], scale: [0.6, 0.2, 0.04], color: fresh ? C.white : C.coral, sign: true },
    { kind: 'box', pos: [0, 0.3, 0.9], scale: [0.4, 0.06, 0.02], color: fresh ? C.blue : C.cream },
  ];
  v['boba.main'] = { kind: 'compound', at, parts };
  if (n >= 2) { const k = n >= 3 && fresh ? 10 : 6; v['boba.queue'] = { kind: 'people', at, n: k, accessory: 'suitcase', shirt: SHIRTS, stand: queue(at, k, n >= 3 ? -1.0 : -0.45) }; }
  return v;
}
