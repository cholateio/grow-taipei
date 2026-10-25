// 走路格與尋路：主島六格與橋面切成方格，A* 八方向（不切角）找路，再沿視線拉直。
// 建築佔地（footprint）是另一層可隨時重設的阻擋集合。純函式、不依賴 three。
import { MAIN_CELLS, R, RING_R, cellAt, cellTop, axialToWorld, adjacentPairs, edgeMidpoint, WATER_Y } from '../scene/hex.js';

export const STEP = 0.3, MARGIN = 0.35, BRIDGE_HALF = 0.25, SEPARATION = 0.25;
const SQ3 = Math.sqrt(3), HALF = 9.5, BRIDGE_TUCK = 0.3, RING_GROW = 0.3, RING_TRIES = 5, WANDER_TRIES = 12;

// 橋 = 兩格之間的中心線段（和 island.js 的 addBridge 同一組端點）
const BRIDGES = adjacentPairs(MAIN_CELLS).map(([A, B]) => {
  const { a, b } = edgeMidpoint(A, B, RING_R * SQ3 / 2), len = Math.hypot(b.x - a.x, b.z - a.z);
  return { a, len, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, ta: cellTop(A), tb: cellTop(B) };
});

// 點投影到橋線段：s 是沿線距離（從 a 起算），off 是離中心線的距離
function onBridge(br, x, z) {
  const dx = x - br.a.x, dz = z - br.a.z;
  return { s: dx * br.ux + dz * br.uz, off: Math.abs(dx * br.uz - dz * br.ux) };
}

// 在格內且離六角邊至少 MARGIN（cellAt 的判法，半徑縮成 R − MARGIN）
function insideCell(x, z) {
  const cell = cellAt(x, z); if (!cell) return false;
  const c = axialToWorld(...cell), dx = Math.abs(x - c.x), dz = Math.abs(z - c.z), r = R - MARGIN;
  return dx <= r * SQ3 / 2 && dz + dx / SQ3 <= r;
}

const onAnyBridge = (x, z) => BRIDGES.some(br => {
  const { s, off } = onBridge(br, x, z);
  return off <= BRIDGE_HALF && s >= -BRIDGE_TUCK && s <= br.len + BRIDGE_TUCK;
});

export function createNav({ step = STEP, rnd = Math.random } = {}) {
  const N = Math.round(2 * HALF / step) + 1;
  const toI = v => Math.round((v + HALF) / step), toW = i => -HALF + i * step;
  const index = (x, z) => { const i = toI(x), j = toI(z); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const ix = k => k % N, jz = k => Math.floor(k / N);
  const pointOf = k => { const x = toW(ix(k)), z = toW(jz(k)); return { x, y: groundY(x, z), z }; };

  const open = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = toW(i), z = toW(j); open[j * N + i] = insideCell(x, z) || onAnyBridge(x, z) ? 1 : 0; }
  let blocked = new Set();
  const free = k => k >= 0 && open[k] === 1 && !blocked.has(k);

  function walkable(x, z) { return free(index(x, z)); }

  function groundY(x, z) {
    for (const br of BRIDGES) {
      const { s, off } = onBridge(br, x, z);
      if (off <= BRIDGE_HALF && s >= 0 && s <= br.len) return br.ta + (br.tb - br.ta) * (s / br.len);
    }
    const cell = cellAt(x, z);
    return cell ? cellTop(cell) : WATER_Y;
  }

  function setFootprints(list) {
    blocked = new Set();
    for (const f of list) {
      const hx = f.r ?? f.w / 2, hz = f.r ?? f.d / 2;
      const inside = f.r != null ? (x, z) => Math.hypot(x - f.x, z - f.z) <= f.r : (x, z) => Math.abs(x - f.x) <= hx && Math.abs(z - f.z) <= hz;
      for (let j = Math.max(0, toI(f.z - hz)); j <= Math.min(N - 1, toI(f.z + hz)); j++)
        for (let i = Math.max(0, toI(f.x - hx)); i <= Math.min(N - 1, toI(f.x + hx)); i++) if (inside(toW(i), toW(j))) blocked.add(j * N + i);
    }
  }

  function nearestWalkable({ x, z }) {
    if (walkable(x, z)) return { x, y: groundY(x, z), z };
    let best = -1, bestD = Infinity;
    for (let k = 0; k < N * N; k++) if (free(k)) { const d = Math.hypot(toW(ix(k)) - x, toW(jz(k)) - z); if (d < bestD) { bestD = d; best = k; } }
    return best < 0 ? { x, y: groundY(x, z), z } : pointOf(best);
  }

  // A*：八方向，斜走要兩個正交鄰居都可走；啟發用 octile 距離（格數單位）
  function astar(startK, goalK) {
    const g = new Float64Array(N * N).fill(Infinity), came = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
    const gi = ix(goalK), gj = jz(goalK);
    const h = k => { const a = Math.abs(ix(k) - gi), b = Math.abs(jz(k) - gj); return Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b); };
    const heap = createHeap(); g[startK] = 0; heap.push(startK, h(startK));
    while (heap.size) {
      const k = heap.pop(); if (done[k]) continue; done[k] = 1;
      if (k === goalK) break;
      const i = ix(k), j = jz(k);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni; if (done[nk] || !free(nk)) continue;
        if (di && dj && !(free(j * N + ni) && free(nj * N + i))) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; heap.push(nk, ng + h(nk)); }
      }
    }
    if (!done[goalK]) return null;
    const cells = []; for (let k = goalK; k !== -1; k = came[k]) cells.push(k);
    return cells.reverse();
  }

  // 視線：沿線每 step/2 取樣都可走。相鄰兩樣本斜跨一格時，線會擦過兩個正交鄰格之一，兩格都要可走（同 A* 不切角）
  function clear(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (step / 2));
    let prev = -1;
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0, cur = index(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!free(cur)) return false;
      if (prev >= 0 && ix(prev) !== ix(cur) && jz(prev) !== jz(cur) && !(free(jz(prev) * N + ix(cur)) && free(jz(cur) * N + ix(prev)))) return false;
      prev = cur;
    }
    return true;
  }

  function pull(points) {
    const out = [points[0]];
    for (let i = 0; i < points.length - 1;) {
      let j = points.length - 1; while (j > i + 1 && !clear(points[i], points[j])) j--;
      out.push(points[j]); i = j;
    }
    return out;
  }

  function route(from, to) {
    const head = [{ x: from.x, y: from.y ?? groundY(from.x, from.z), z: from.z }];
    const rescued = !walkable(from.x, from.z), start = rescued ? nearestWalkable(from) : from;
    if (rescued) head.push(start);
    const end = nearestWalkable(to);
    const cells = astar(index(start.x, start.z), index(end.x, end.z));
    if (!cells) return head;                                   // 被 footprint 隔斷、到不了：留在原地
    const pulled = pull([start, ...cells.slice(1, -1).map(pointOf), end]).slice(1);
    return [...head, ...pulled.map(p => ({ x: p.x, y: groundY(p.x, p.z), z: p.z }))];
  }

  function routeLength(path) {
    let s = 0; for (let i = 1; i < path.length; i++) s += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    return s;
  }

  function slots(center, n, r) {
    const y = groundY(center.x, center.z);
    let pts = [];
    for (let attempt = 0; attempt <= RING_TRIES; attempt++, r += RING_GROW) {
      pts = Array.from({ length: n }, (_, k) => {
        const a = 2 * Math.PI * k / n, p = nearestWalkable({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r });
        return { x: p.x, y, z: p.z };
      });
      if (pts.every((p, i) => pts.slice(i + 1).every(q => Math.hypot(p.x - q.x, p.z - q.z) >= SEPARATION))) break;
    }
    return pts;
  }

  function wander(home, r) {
    for (let k = 0; k < WANDER_TRIES; k++) {
      const a = rnd() * 2 * Math.PI, d = r * Math.sqrt(rnd()), x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
      if (walkable(x, z)) return { x, y: groundY(x, z), z };
    }
    return nearestWalkable(home);
  }

  // 走動中的兩人太近就各退一半差距（dt 保留給呼叫端統一簽名，修正是一次到位）
  function separate(members, _dt) {
    const walkers = members.filter(m => m.walking === true);
    for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      const p = walkers[i].pos, q = walkers[j].pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d >= SEPARATION) continue;
      const ux = d ? dx / d : 1, uz = d ? dz / d : 0, push = (SEPARATION - d) / 2;
      p.x -= ux * push; p.z -= uz * push; q.x += ux * push; q.z += uz * push;
    }
  }

  return { walkable, groundY, setFootprints, nearestWalkable, route, routeLength, slots, wander, separate };
}

// 最小堆（A* 的 open list）
function createHeap() {
  const keys = [], pri = [];
  const swap = (a, b) => { [keys[a], keys[b]] = [keys[b], keys[a]]; [pri[a], pri[b]] = [pri[b], pri[a]]; };
  return {
    get size() { return keys.length; },
    push(k, p) {
      keys.push(k); pri.push(p);
      for (let i = keys.length - 1; i > 0;) { const up = (i - 1) >> 1; if (pri[up] <= pri[i]) break; swap(i, up); i = up; }
    },
    pop() {
      const top = keys[0], lastK = keys.pop(), lastP = pri.pop();
      if (keys.length) {
        keys[0] = lastK; pri[0] = lastP;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < keys.length && pri[l] < pri[m]) m = l;
          if (r < keys.length && pri[r] < pri[m]) m = r;
          if (m === i) break; swap(i, m); i = m;
        }
      }
      return top;
    },
  };
}
