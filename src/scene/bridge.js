// 小拱橋：兩點之間 n 片甲板，高度沿 sin 拱起。純函式。
import { TOP } from './hex.js';

export function bridgeDecks(a, b, { n = 9, arch = 0.08, base = TOP } = {}) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: a.x + dx * t, y: base + Math.sin(Math.PI * t) * arch, z: a.z + dz * t, ry, len: len / n };
  });
}
