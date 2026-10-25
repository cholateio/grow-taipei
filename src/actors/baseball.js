// 棒球（§5.1）：沙地 → 木看台與兩個傳接球的球員 → 大巨蛋 → 比賽開打（頂縫透光、觀眾 4 人）→ 演唱會（藍色應援棒、觀眾 6 人）→ 跨年煙火。
// 大巨蛋鼠災：兩個戴安全帽的工作人員繞著門口追老鼠。
import { anchorWorld } from './anchors.js';
import { ringPath } from '../scene/people.js';
import { C, offset } from './palette.js';

export const id = 'baseball';
export const labelY = 1.3;
const SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// 觀眾站在巨蛋門前的弧線上，正中間留一條走道給球員；人數少一點，不然和小孩、老鼠擠成一團
function fans(at, n) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1) - 0.5, a = t * 1.7 + Math.sign(t) * 0.25, r = 1.75, x = Math.sin(a) * r, z = Math.cos(a) * r;
    return { ...offset(at, x, z), yaw: Math.atan2(-x, -z) };
  });
}

export function view(lv, flags) {
  const n = lv.baseball, at = anchorWorld('baseball'), v = {};
  if (!n) return v;
  const parts = [];
  if (n <= 2) {
    // 沙地（Lv1）→ 加木看台（Lv2）
    parts.push({ kind: 'cylinder', pos: [0, 0.015, 0], scale: [2.0, 0.03, 2.0], color: C.sand });
    for (const [x, z] of [[0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0]]) parts.push({ kind: 'box', pos: [x, 0.04, z], scale: [0.1, 0.03, 0.1], color: C.white });
    for (let i = 0; i < 6; i++) { const a = Math.PI * (0.75 + i * 0.1); parts.push({ kind: 'box', pos: [Math.cos(a) * 1.05, 0.1, Math.sin(a) * 1.05], scale: [0.04, 0.2, 0.36], rot: [0, -a, 0], color: C.wood }); }
    if (n === 2) for (let r = 0; r < 3; r++) parts.push({ kind: 'box', pos: [0, 0.08 + r * 0.12, -1.15 - r * 0.18], scale: [1.4, 0.16 + r * 0.12, 0.18], color: C.wood, stand: true });
  } else {
    parts.push(
      { kind: 'cylinder', pos: [0, 0.06, 0], scale: [2.3, 0.12, 1.9], color: C.curb },
      { kind: 'dome', pos: [0, 0.12, 0], scale: [2.2, 1.2, 1.8], color: C.cream, ...(n >= 5 ? { glow: 0x9fe8ff } : {}) },
      { kind: 'box', pos: [0, 0.25, 0.86], scale: [0.32, 0.26, 0.06], color: C.window },
    );
    if (n >= 4) parts.push({ kind: 'box', pos: [0, 0.72, 0], scale: [1.2, 0.04, 0.12], color: C.yellow, glow: C.yellow });
    if (n >= 5) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; parts.push({ kind: 'box', pos: [Math.cos(a) * 1.3, 0.2, Math.sin(a) * 1.1], scale: [0.06, 0.3, 0.06], color: C.neonBlue, glow: C.neonBlue }); }
  }
  if (n >= 2) {
    v['baseball.players'] = { kind: 'people', at, n: 2, accessory: 'cap', shirt: [C.white, C.navy], stand: [{ ...offset(at, -0.45, 1.05), yaw: Math.PI / 2 }, { ...offset(at, 0.45, 1.05), yaw: -Math.PI / 2 }] };
    v['baseball.ball'] = { kind: 'ball', at, from: [-0.4, 1.05], to: [0.4, 1.05] };
    if (n >= 4) { const k = n >= 5 ? 6 : 4; v['baseball.crowd'] = { kind: 'people', at, n: k, stand: fans(at, k), shirt: SHIRTS }; }
  }
  // 跨年煙火：巨蛋上空循環放
  if (n >= 6) v['baseball.fireworks'] = { kind: 'fireworks', at: offset(at, 0, 0, 4), colors: [C.neonPink, C.neonBlue, C.yellow, C.coral] };
  v['baseball.main'] = { kind: 'compound', at, parts };
  if (flags.domeRats) { const gate = offset(at, 0, 1.1); v['baseball.staff'] = { kind: 'people', at, n: 2, accessory: 'helmet', path: ringPath(gate, 0.6, gate.y), speed: 0.9 }; }
  // 鍵的順序：main 先（標籤掛在 main）
  return { 'baseball.main': v['baseball.main'], ...v };
}

export const builders = {
  // 傳接球：兩個球員之間來回的拋物線，單程 0.6 秒
  ball(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, shadow: false, parts: [{ kind: 'sphere', pos: [0, 0, 0], scale: 0.06, color: C.white }] });
    const object = new THREE.Group(), ball = part.object; object.add(ball);
    const [ax, az] = spec.from, [bx, bz] = spec.to;
    return {
      object,
      update(dt, t) {
        const leg = Math.floor(t / 0.6), s = t / 0.6 - leg, [x0, z0, x1, z1] = leg % 2 ? [bx, bz, ax, az] : [ax, az, bx, bz];
        ball.position.set(x0 + (x1 - x0) * s, 0.25 + Math.sin(Math.PI * s) * 0.5, z0 + (z1 - z0) * s);
      },
      dispose: part.dispose,
    };
  },
};
