// 沿折線走：閉合路徑繞圈，開放路徑走到底折返。小人與會走動的模型共用。
export function measurePath(path, loop = true) {
  const lens = [0], n = loop ? path.length : path.length - 1;
  for (let i = 1; i <= n; i++) { const a = path[i - 1], b = path[i % path.length]; lens.push(lens[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  return lens;
}

export function locateOnPath(path, lens, s, loop = true) {
  const total = lens.at(-1), n = path.length;
  s = loop ? ((s % total) + total) % total : Math.min(total, Math.max(0, s));
  let i = 0; while (i < lens.length - 2 && lens[i + 1] < s) i++;
  const a = path[i], b = path[(i + 1) % n], t = (s - lens[i]) / (lens[i + 1] - lens[i] || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

export function createPathCursor(path, { loop = true, s = 0 } = {}) {
  const lens = measurePath(path, loop), total = lens.at(-1);
  let dir = 1;
  return {
    advance(ds) {
      s += ds * dir;
      if (!loop) { if (s >= total) { s = 2 * total - s; dir = -1; } else if (s <= 0) { s = -s; dir = 1; } }
    },
    locate() { const p = locateOnPath(path, lens, s, loop); if (dir < 0) p.yaw += Math.PI; return p; },
    get total() { return total; },
  };
}
