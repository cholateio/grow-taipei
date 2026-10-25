// 演員測試共用：零等級、把 view 攤成世界座標的點（檢查不出格用）
import { axialToWorld } from '../../src/scene/hex.js';
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
