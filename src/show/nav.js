// 走路格與尋路：主島六格與橋面切成方格，A* 八方向（不切角）找路，再沿視線拉直。
// 建築佔地（footprint）是另一層可隨時重設的阻擋集合，每個 footprint 外擴 PAD（小人身寬，§14.1）。純函式、不依賴 three。
import { MAIN_CELLS, R, RING_R, cellAt, cellTop, axialToWorld, adjacentPairs, edgeMidpoint, WATER_Y, SATELLITES } from '../scene/hex.js';

export const STEP = 0.3, MARGIN = 0.35, BRIDGE_HALF = 0.25, SEPARATION = 0.25, HALF = 9.5;   // 走路格的點在 -HALF + STEP·i
export const PAD = 0.12;   // footprint 外擴：小人半徑約 0.08 加餘裕，站在牆邊身體不會陷進牆裡（§14.1）
// 同高兩格之間的拱橋（island.js addBridge → bridgeDecks(a, b, { arch: 0.08 })）：甲板中心 base + sin(π·t)·ARCH，板厚 DECK；
// 9 片甲板各長 len/9 × 1.08，兩端的板子超出端點半片（PLANK·len）。DENSE：路線過橋那一段每隔多遠補一個點（游標直線內插才貼著拱）
const ARCH = 0.08, DECK = 0.05, PLANK = 1.08 / 18, DENSE = 0.05;
const NEAR_STEP = 0.04, NEAR_MAX = 0.6, NEAR_DIRS = 32;
const SQ3 = Math.sqrt(3), BRIDGE_TUCK = 0.3, RING_GROW = 0.3, RING_TRIES = 5, SLOT_SAMPLES = 72, WANDER_TRIES = 12, STAND_PASSES = 24;

// 橋 = 兩格之間的中心線段（和 island.js 的 addBridge 同一組端點）
const BRIDGES = adjacentPairs(MAIN_CELLS).map(([A, B]) => {
  const { a, b } = edgeMidpoint(A, B, RING_R * SQ3 / 2), len = Math.hypot(b.x - a.x, b.z - a.z);
  return { a, len, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, ta: cellTop(A), tb: cellTop(B), level: cellTop(A) === cellTop(B) };
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

// 點在哪一座衛星島上（島中心 R 以內）；不在衛星島上回 -1
const SAT_CENTRES = SATELLITES.map(s => axialToWorld(s.q, s.r));
export const satelliteAt = ({ x, z }) => SAT_CENTRES.findIndex(c => Math.hypot(x - c.x, z - c.z) <= R);

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
  // blocked：落在外擴後 footprint 裡的格點（A* 不走）；pads：外擴 PAD 之後的 footprint（圓 { x, z, r }、橢圓 { x, z, rx, rz } 或框 { x, z, hx, hz }）；
  // version：footprint 每變一次 +1（名冊看它重新規劃走到一半的路）
  let blocked = new Set(), pads = [], version = 0, last = '[]', near = new Map(), edge = new Uint8Array(N * N);   // edge：被擋格點旁邊的格點（A* 走這裡要查線段）
  const ground = k => k >= 0 && open[k] === 1, free = k => ground(k) && !blocked.has(k);
  const padded = (x, z) => pads.some(p => inPad(p, x, z));

  // 可走：在格內／橋面上（看最近的格點），而且點本身不在外擴後的 footprint 裡——footprint 用真的形狀判，不看格點
  // （格點 0.3 一格，只看格點的話 PAD 會忽大忽小，牆邊的站位、入口落在哪一格就看運氣）。
  // 最近的格點被 footprint 擋住（點貼著牆）時，旁邊一格內要有直線走得到的可走格點，不然是走不出去的夾縫（牆和格邊之間）
  function walkable(x, z) {
    const k = index(x, z); if (!ground(k) || padded(x, z)) return false;
    if (!cellAt(x, z) && !onAnyBridge(x, z)) return false;   // 橋旁邊的水（格點落在橋面上，點本身在橋外）
    if (!blocked.has(k)) return true;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const kk = k + dj * N + di; if ((di || dj) && Math.abs(ix(kk) - ix(k)) <= 1 && free(kk) && clear({ x, z }, pointOf(kk))) return true;
    }
    return false;
  }

  // 橋面：同高兩格是拱橋（拱高 + 半個板厚，走在甲板上不陷進去；兩端超出端點的半片板子上從地面斜上半個板厚，
  // 不是一階 0.025 的台階），高低格之間的階梯直線內插
  function groundY(x, z) {
    for (const br of BRIDGES) {
      const { s, off } = onBridge(br, x, z), end = br.level ? PLANK * br.len : 0;
      if (off > BRIDGE_HALF || s < -end || s > br.len + end) continue;
      const t = s / br.len, onto = end ? Math.min(1, (Math.min(s, br.len - s) + end) / end) : 1;
      return br.level ? br.ta + Math.max(0, Math.sin(Math.PI * t)) * ARCH + onto * DECK / 2 : br.ta + (br.tb - br.ta) * t;
    }
    const cell = cellAt(x, z);
    return cell ? cellTop(cell) : WATER_Y;
  }

  // 每個 footprint（圓 { r }、橢圓 { rx, rz } 或矩形 { w, d }）外擴 PAD 再擋格子
  function setFootprints(list) {
    const key = JSON.stringify(list); if (key === last) return;
    last = key; version++;
    blocked = new Set(); pads = []; near = new Map(); edge = new Uint8Array(N * N);
    for (const f of list) {
      const p = f.r != null ? { x: f.x, z: f.z, r: f.r + PAD } : f.rx != null ? { x: f.x, z: f.z, rx: f.rx + PAD, rz: f.rz + PAD } : { x: f.x, z: f.z, hx: f.w / 2 + PAD, hz: f.d / 2 + PAD };
      const hx = p.r ?? p.rx ?? p.hx, hz = p.r ?? p.rz ?? p.hz;
      pads.push(p);
      for (let j = Math.max(0, toI(f.z - hz)); j <= Math.min(N - 1, toI(f.z + hz)); j++)
        for (let i = Math.max(0, toI(f.x - hx)); i <= Math.min(N - 1, toI(f.x + hx)); i++) if (inPad(p, toW(i), toW(j))) blocked.add(j * N + i);
    }
    for (const k of blocked) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ix(k) + di, j = jz(k) + dj; if (i >= 0 && j >= 0 && i < N && j < N) edge[j * N + i] = 1;
    }
  }

  // 最近的可走格點（格點在格內、不在外擴後的 footprint 裡）；沒有回 -1
  function nearestFree(x, z) {
    let best = -1, bestD = Infinity;
    for (let k = 0; k < N * N; k++) if (free(k)) { const d = Math.hypot(toW(ix(k)) - x, toW(jz(k)) - z); if (d < bestD) { bestD = d; best = k; } }
    return best;
  }
  // 最近的可走點：先在附近一圈一圈找（每圈 NEAR_STEP，NEAR_DIRS 個方向，同一圈取第一個），NEAR_MAX 內找不到再找最近的可走格點。
  // 不直接跳到格點：相鄰的站位一起落進 footprint 時，各自站到牆邊不同的位置，不會擠到同一個格點上。
  // 結果記在 near（footprint 變了就清掉）：rescue 的站位每幀都會問
  function nearestWalkable({ x, z }) {
    if (walkable(x, z)) return { x, y: groundY(x, z), z };
    const key = `${x},${z}`, hit = near.get(key); if (hit) return { ...hit };
    let out = null;
    for (let rr = NEAR_STEP; !out && rr <= NEAR_MAX + 1e-9; rr += NEAR_STEP) for (let k = 0; k < NEAR_DIRS && !out; k++) {
      const a = 2 * Math.PI * k / NEAR_DIRS, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (walkable(px, pz)) out = { x: px, y: groundY(px, pz), z: pz };
    }
    if (!out) { const best = nearestFree(x, z); out = best < 0 ? { x, y: groundY(x, z), z } : pointOf(best); }
    near.set(key, out);
    return { ...out };
  }
  // 路線從哪些格點出發／到哪些格點：點所在那一格；那一格的格點在 footprint 裡（點本身在 PAD 外、貼著牆）就用
  // 附近兩格內、直線走得到（不擦過 footprint）的格點，全部交給 A*（最近的那個可能在 footprint 圍住的死角裡）。
  // 回 [[格點, 從點走過去的距離（格數）]]
  function anchors(p) {
    const k = index(p.x, p.z); if (free(k) && clear(p, pointOf(k))) return [[k, 0]];
    const out = [];
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const i = toI(p.x) + di, j = toI(p.z) + dj; if (i < 0 || j < 0 || i >= N || j >= N || !free(j * N + i)) continue;
      const q = { x: toW(i), z: toW(j) };
      if (clear(p, q)) out.push([j * N + i, Math.hypot(q.x - p.x, q.z - p.z) / step]);
    }
    return out;
  }

  // A*：八方向，斜走要兩個正交鄰居都可走；啟發用 octile 距離（格數單位）。
  // 起點、終點各可以是幾個格點（[格點, 從點走到格點的距離（格數）]）：走到任何一個終點格點就停
  function astar(starts, goals) {
    const g = new Float64Array(N * N).fill(Infinity), came = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
    const goal = new Set(goals.map(([k]) => k));
    const oct = (k, q) => { const a = Math.abs(ix(k) - ix(q)), b = Math.abs(jz(k) - jz(q)); return Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b); };
    const h = k => Math.min(...goals.map(([q, d]) => oct(k, q) + d));
    const heap = createHeap();
    for (const [k, d] of starts) if (d < g[k]) { g[k] = d; heap.push(k, d + h(k)); }
    let goalK = -1;
    while (heap.size) {
      const k = heap.pop(); if (done[k]) continue; done[k] = 1;
      if (goal.has(k)) { goalK = k; break; }
      const i = ix(k), j = jz(k);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni; if (done[nk] || !free(nk)) continue;
        if (di && dj && !(free(j * N + ni) && free(nj * N + i))) continue;
        // 貼著 footprint 的兩個格點之間，連線也不能擦過外擴後的形狀（拉直時這一段是硬走的，不再查視線）
        if ((edge[k] || edge[nk]) && pads.some(p => crossesPad(p, { x: toW(i), z: toW(j) }, { x: toW(ni), z: toW(nj) }))) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; heap.push(nk, ng + h(nk)); }
      }
    }
    if (goalK < 0) return null;
    const cells = []; for (let k = goalK; k !== -1; k = came[k]) cells.push(k);
    return cells.reverse();
  }

  // 視線：線段不擦過外擴後的 footprint（真的形狀，取樣之間那一段也算），沿線每 step/2 取樣都在格內／橋面上；
  // 相鄰兩樣本斜跨一格時，線會擦過兩個正交鄰格之一，兩格都要在格內（同 A* 不切角）
  function clear(a, b) {
    if (pads.some(p => crossesPad(p, a, b))) return false;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (step / 2));
    let prev = -1;
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0, cur = index(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!ground(cur)) return false;
      if (prev >= 0 && ix(prev) !== ix(cur) && jz(prev) !== jz(cur) && !(ground(jz(prev) * N + ix(cur)) && ground(jz(cur) * N + ix(prev)))) return false;
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
    // 衛星島不在走路格上：同一座島上的兩點直接直線走（不被拉回主島）
    const sat = cellAt(from.x, from.z) ? -1 : satelliteAt(from);
    if (sat >= 0 && !cellAt(to.x, to.z) && satelliteAt(to) === sat) return [head[0], { x: to.x, y: to.y ?? head[0].y, z: to.z }];
    const rescued = !walkable(from.x, from.z), start = rescued ? nearestWalkable(from) : from;
    if (rescued) head.push(start);
    const end = nearestWalkable(to);
    const a = anchors(start), b = anchors(end), cells = a.length && b.length ? astar(a, b) : null;
    if (!cells) return head;                                   // 被 footprint 隔斷、到不了：留在原地
    // 起點、終點的格點也排進去：拉直時從起點直接接第二格會擦過牆角的話，退回先走到起點的格點（那一段一定看得到）
    const pulled = pull([start, ...cells.map(pointOf), end]).slice(1);
    return densify([...head, ...pulled.map(p => ({ x: p.x, y: groundY(p.x, p.z), z: p.z }))]);
  }

  // 拉直後一段路的地面不是直線（過拱橋、上下階梯）：每隔 DENSE 補一個貼地的點（xz 不變），游標的直線內插才不會陷進橋面。
  // 起點在走路格外（水裡、屋頂上被救回來）的那一段不補
  function densify(path) {
    const out = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (!walkable(a.x, a.z)) { out.push(b); continue; }
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / DENSE), at = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      let bent = false;
      for (let k = 1; k < 2 * n && !bent; k++) { const t = k / (2 * n), p = at(t); bent = Math.abs(groundY(p.x, p.z) - (a.y + (b.y - a.y) * t)) > 0.002; }
      if (bent) for (let k = 1; k < n; k++) { const p = at(k / n); out.push({ x: p.x, y: groundY(p.x, p.z), z: p.z }); }
      out.push(b);
    }
    return out;
  }

  function routeLength(path) {
    let s = 0; for (let i = 1; i < path.length; i++) s += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    return s;
  }

  // 站定點：半徑 r 的圓上 n 個可走、彼此 ≥ SEPARATION 的點。先照等分角取；有點落在 footprint 裡（外擴 PAD 後
  // 圓的一段被建築蓋住）就在圓上可走的那幾段裡平均挑；圓上放不下才把半徑放大（最多 RING_TRIES 次），最後退回最近的可走點
  function slots(center, n, r) {
    const y = groundY(center.x, center.z), apart = ps => ps.every((p, i) => ps.slice(i + 1).every(q => Math.hypot(p.x - q.x, p.z - q.z) >= SEPARATION));
    const on = (a, rr) => ({ x: center.x + Math.cos(a) * rr, y, z: center.z + Math.sin(a) * rr });
    let pts = [];
    for (let attempt = 0; attempt <= RING_TRIES; attempt++, r += RING_GROW) {
      pts = Array.from({ length: n }, (_, k) => on(2 * Math.PI * k / n, r));
      if (pts.every(p => walkable(p.x, p.z)) && apart(pts)) return pts;
      const arc = Array.from({ length: SLOT_SAMPLES }, (_, k) => on(2 * Math.PI * k / SLOT_SAMPLES, r)).filter(p => walkable(p.x, p.z));
      if (arc.length >= n) { pts = Array.from({ length: n }, (_, k) => arc[Math.floor((k + 0.5) * arc.length / n)]); if (apart(pts)) return pts; }
    }
    r -= RING_GROW;   // 最後一次試的半徑
    return Array.from({ length: n }, (_, k) => { const p = nearestWalkable(on(2 * Math.PI * k / n, r)); return { x: p.x, y, z: p.z }; });
  }

  // 閒晃的下一個點：home 附近隨機挑可走點（footprint 外擴 PAD 之外）；挑不到就回 home 最近的可走點
  function wander(home, r) {
    for (let k = 0; k < WANDER_TRIES; k++) {
      const a = rnd() * 2 * Math.PI, d = r * Math.sqrt(rnd()), x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
      if (walkable(x, z)) return { x, y: groundY(x, z), z };
    }
    return nearestWalkable(home);
  }

  // 走動中的兩人太近就各退一半差距（dt 保留給呼叫端統一簽名，修正是一次到位）；
  // 走路格上的人推過去會落進 footprint（或水裡）那一半就不推（§14.1）
  function separate(members, _dt) {
    const walkers = members.filter(m => m.walking === true);
    const nudge = (p, x, z) => { if (walkable(x, z) || !walkable(p.x, p.z)) { p.x = x; p.z = z; } };
    for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      const p = walkers[i].pos, q = walkers[j].pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d >= SEPARATION) continue;
      const ux = d ? dx / d : 1, uz = d ? dz / d : 0, push = (SEPARATION - d) / 2;
      nudge(p, p.x - ux * push, p.z - uz * push); nudge(q, q.x + ux * push, q.z + uz * push);
    }
  }

  // 站著的人太近（< SEPARATION）：只沿 x 錯開（不往鏡頭縱深推，§13.3），各退一半；寫回 m.pos，回傳被推過的人。
  // 一串人擠在一起時推一次可能又撞到下一個，最多來回推 STAND_PASSES 輪（每次多推 1e-6，浮點誤差不會讓下一幀又推）。
  // 只推到可走點上（§14.1）：站在走路格上的人，推過去會落進 footprint（或水裡）就不推——貼著牆的人不動、
  //   另一個人讓開整段；兩邊都推不開就不推。走路格外的人（衛星島、屋頂）照舊錯開。
  // maxStep：這一次每人最多移動多少（每幀呼叫時傳走路速度 × dt，錯開是滑過去的、不瞬移；沒到的下一幀接著推）
  function separateStanding(members, maxStep = Infinity) {
    const xs = members.map(m => m.pos.x), zs = members.map(m => m.pos.z);
    const can = (i, x) => walkable(x, zs[i]) || !walkable(xs[i], zs[i]);
    for (let pass = 0; pass < STAND_PASSES; pass++) {
      let pushed = false;
      for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
        const dx = xs[j] - xs[i], dz = zs[j] - zs[i];
        if (Math.abs(dz) >= SEPARATION || Math.hypot(dx, dz) >= SEPARATION - 1e-9) continue;
        const need = Math.sqrt(SEPARATION * SEPARATION - dz * dz) + 1e-6, dir = dx < 0 ? -1 : 1, push = (need - Math.abs(dx)) / 2;
        const ok = [can(i, xs[i] - dir * push), can(j, xs[j] + dir * push)];
        let di = ok[0] ? push : 0, dj = ok[1] ? push : 0;
        if (!ok[1] && ok[0] && can(i, xs[i] - dir * 2 * push)) di = 2 * push;   // 對方貼著牆：自己讓開整段
        if (!ok[0] && ok[1] && can(j, xs[j] + dir * 2 * push)) dj = 2 * push;
        xs[i] -= dir * di; xs[j] += dir * dj; pushed ||= di > 0 || dj > 0;
      }
      if (!pushed) break;
    }
    const moved = [];
    members.forEach((m, i) => {
      const d = xs[i] - m.pos.x; if (d === 0) return;
      const x = m.pos.x + Math.max(-maxStep, Math.min(maxStep, d));
      if (!walkable(x, m.pos.z) && walkable(m.pos.x, m.pos.z)) return;   // 滑到一半會經過 footprint：這一幀不動
      m.pos.x = x; moved.push(m);
    });
    return moved;
  }

  // 格子裡離 awayFrom 最遠、而且從 awayFrom 走得到的點（名冊成員出場的預設入口，§13.2：落在格子邊上）。
  // 從 awayFrom 最近的可走點往外淹（四方向），淹到的點裡挑這一格的；這一格沒有走得到的點（不是主島格）回 null
  function edgePoint(cell, awayFrom) {
    const k = index(awayFrom.x, awayFrom.z), k0 = free(k) ? k : nearestFree(awayFrom.x, awayFrom.z);
    if (k0 < 0) return null;
    const seen = new Uint8Array(N * N), queue = [k0]; seen[k0] = 1;
    let best = -1, bestD = -1;
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h], i = ix(k), j = jz(k), x = toW(i), z = toW(j), c = cellAt(x, z);
      if (c && c[0] === cell[0] && c[1] === cell[1]) { const d = Math.hypot(x - awayFrom.x, z - awayFrom.z); if (d > bestD) { bestD = d; best = k; } }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni; if (!seen[nk] && free(nk)) { seen[nk] = 1; queue.push(nk); }
      }
    }
    return best < 0 ? null : pointOf(best);
  }

  return { get version() { return version; }, inFootprint: padded, walkable, groundY, setFootprints, nearestWalkable, route, routeLength, slots, wander, separate, separateStanding, edgePoint };
}

// 點在外擴後的 footprint 裡（圓 { r }、橢圓 { rx, rz } 或框 { hx, hz }）
function inPad(p, x, z) {
  if (p.r != null) return Math.hypot(x - p.x, z - p.z) <= p.r;
  if (p.rx != null) return ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 <= 1;
  return Math.abs(x - p.x) <= p.hx && Math.abs(z - p.z) <= p.hz;
}
// 線段 a→b 碰到外擴後的 footprint：圓（橢圓先縮放成單位圓）看圓心到線段的距離，框用 slab 法
function crossesPad(p, a, b) {
  if (p.r != null || p.rx != null) {
    const sx = p.rx ?? p.r, sz = p.rz ?? p.r, ax = (a.x - p.x) / sx, az = (a.z - p.z) / sz, dx = (b.x - a.x) / sx, dz = (b.z - a.z) / sz;
    const L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / L)) : 0;
    return Math.hypot(ax + dx * t, az + dz * t) <= 1;
  }
  const dx = b.x - a.x, dz = b.z - a.z;
  let lo = 0, hi = 1;
  for (const [o, d, c, h] of [[a.x, dx, p.x, p.hx], [a.z, dz, p.z, p.hz]]) {
    if (Math.abs(d) < 1e-12) { if (Math.abs(o - c) > h) return false; continue; }
    let t0 = (c - h - o) / d, t1 = (c + h - o) / d; if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0); hi = Math.min(hi, t1); if (lo > hi) return false;
  }
  return true;
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
