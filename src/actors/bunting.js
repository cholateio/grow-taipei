// 三角旗串（修正批次 max-skip：棒球 Lv8 巨蛋外牆一圈、珍奶 Lv6 店到噴泉一串）：都是不發光的 kit 零件，併進既有 compound 的黏土 mesh（不多 draw call）。
//   一面三角旗：kit 的 prism（CylinderGeometry 三個邊 = 三稜柱）。原始的三角形躺在 xz 平面、尖在 +z；先繞 x 轉 90° 立起來（尖朝下、旗面法線 +z），
//   再繞 y 轉 yaw（旗面法線朝 (sin yaw, cos yaw)）。scale [寬 / 0.866, 厚, 高 / 0.75]：三角形底寬 0.866·sx、高 0.75·sz，外心在離底 1/3 高的地方。
//   繩子：兩點之間往下垂的拋物線（中間垂 sag），切成幾段斜的細盒子。
// 轉動（three.js Euler 'XYZ'：向量先轉 z、再 y、再 x）：零件只帶得了一組 Euler，「先俯仰、再轉 yaw」= Ry(yaw)·Rx(θ) 要換算回 XYZ
import { C } from './palette.js';

// 五、六色輪流（色票裡的珊瑚、黃、藍、白，加上名冊衣服的綠與粉）
export const PENNANT_COLORS = [C.coral, C.yellow, C.blue, C.white, 0x8db86f, 0xf2b5c6];
// 長軸 z 的零件朝 yaw（繞 y，0 = +z）、仰角 pitch（往上為正）：Ry(yaw)·Rx(−pitch) 的 Euler XYZ
export function eulerYawPitch(yaw, pitch) {
  const sa = Math.sin(yaw), ca = Math.cos(yaw), st = Math.sin(-pitch), ct = Math.cos(-pitch);
  return [Math.atan2(st, ca * ct), Math.asin(Math.max(-1, Math.min(1, sa * ct))), Math.atan2(-sa * st, ca)];
}
// 一面三角旗：top 是底邊（掛在繩上的那一邊）中點，往下垂 h、底寬 w，旗面法線朝 yaw
export function pennant(top, yaw, color, w = 0.09, h = 0.1, thick = 0.008) {
  return { kind: 'prism', pos: [top[0], top[1] - h / 3, top[2]], scale: [w / 0.866, thick, h / 0.75], rot: eulerYawPitch(yaw, -Math.PI / 2), color, pennant: true };
}
// 兩點 a → b（相對零件的原點）之間一串：繩子 seg 段、n 面旗（等距、從第一色輪流）
export function bunting(a, b, { n = 6, sag = 0.08, seg = 6, w, h, colors = PENNANT_COLORS, string = C.cream, from = 0 } = {}) {
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]), parts = [];
  for (let i = 0; i < seg; i++) {
    const p = at(i / seg), q = at((i + 1) / seg), dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
    parts.push({ kind: 'box', pos: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], scale: [0.012, 0.012, L], rot: eulerYawPitch(yaw, Math.atan2(dy, Math.hypot(dx, dz))), color: string });
  }
  for (let k = 0; k < n; k++) parts.push(pennant(at((k + 0.5) / n), yaw + Math.PI / 2, colors[(from + k) % colors.length], w, h));
  return parts;
}
