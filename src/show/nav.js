// 走路格與尋路：主島六格與橋面切成方格，A* 八方向（不切角）找路，再沿視線拉直。
// 建築佔地（footprint）是另一層可隨時重設的阻擋集合，每個 footprint 外擴 PAD（小人身寬，§14.1）。純函式、不依賴 three。
import { MAIN_CELLS, R, RING_R, cellAt, cellTop, axialToWorld, adjacentPairs, edgeMidpoint, WATER_Y, SATELLITES } from '../scene/hex.js';

export const STEP = 0.3, MARGIN = 0.35, BRIDGE_HALF = 0.25, SEPARATION = 0.25, HALF = 9.5;   // 走路格的點在 -HALF + STEP·i
export const PAD = 0.12;   // footprint 外擴：小人半徑約 0.08 加餘裕，站在牆邊身體不會陷進牆裡（§14.1）
// 兩個人該離多遠：各自的半徑相加（名冊成員的 m.radius：小人 0.125、模型照高度；2026-10-28 錄影修正，變異鼠和溫泉客疊在一起）。
// 沒帶半徑的（測試、舊的呼叫端）當成 SEPARATION / 2——人對人照舊 0.25
export const radiusOf = m => m.radius ?? SEPARATION / 2;
const apart = (a, b) => radiusOf(a) + radiusOf(b);
// 正面擦身（任務 12）：走路的人前方 YIELD_LOOK 內、橫向不到 YIELD_CLEAR 有人，就往遠離他的那一側橫移到橫向 YIELD_CLEAR 再走過去
export const YIELD_LOOK = 0.5, YIELD_CLEAR = SEPARATION + 0.05;
// 該橫移多少：沿右手邊（朝 yaw 走時的 (−cos yaw, sin yaw)）的有號距離；前方沒人擋回 0。前方好幾個人照最近的那個讓
export function yieldOffset(p, yaw, others) { return yieldTarget(p, yaw, others)?.side ?? 0; }
// 同上，另外回讓的是 others 裡的第幾個、從他另一邊過去的橫移（other）（roster 記住他：直到他落在身後超過 SEPARATION 才收回，不在擦身的那一刻就切回路線上）。
// 半徑（2026-10-28 錄影修正）：others 的點可以帶 r、自己的半徑 r0——要讓開的橫向距離是兩人半徑相加 + 0.05、往前看也多看那麼多
// （小孩走過變異鼠 r 0.325 要讓到 0.5）；沒帶的當成 SEPARATION / 2，人對人照舊 YIELD_CLEAR、YIELD_LOOK
export function yieldTarget(p, yaw, others, r0 = SEPARATION / 2) {
  const ux = Math.sin(yaw), uz = Math.cos(yaw), rx = -uz, rz = ux;
  let best = null;
  others.forEach((o, index) => {
    const dx = o.x - p.x, dz = o.z - p.z, ahead = dx * ux + dz * uz, lat = dx * rx + dz * rz, clear = r0 + (o.r ?? SEPARATION / 2) + YIELD_CLEAR - SEPARATION;
    if (ahead <= 0 || ahead >= YIELD_LOOK + clear - YIELD_CLEAR || Math.abs(lat) >= clear) return;
    if (!best || ahead < best.ahead) best = { ahead, lat, index, clear };
  });
  // other：從他另一邊過去要橫移到哪（同樣離他 clear；計畫 11 任務 5：讓的那一側走不到時換邊）
  return best && { index: best.index, side: best.lat > 0 ? best.lat - best.clear : best.lat + best.clear, other: best.lat > 0 ? best.lat + best.clear : best.lat - best.clear };
}
// p 前方 yaw 方向上 o 在多遠（負的 = 在身後）
export const aheadOf = (p, yaw, o) => (o.x - p.x) * Math.sin(yaw) + (o.z - p.z) * Math.cos(yaw);
// 同高兩格之間的拱橋（island.js addBridge → bridgeDecks(a, b, { arch: 0.08 })）：甲板中心 base + sin(π·t)·ARCH，板厚 DECK；
// 9 片甲板各長 len/9 × 1.08，兩端的板子超出端點半片（PLANK·len）。DENSE：路線過橋那一段每隔多遠補一個點（游標直線內插才貼著拱）
const ARCH = 0.08, DECK = 0.05, PLANK = 1.08 / 18, DENSE = 0.05, STEP_Y = 0.03;   // STEP_Y：相鄰取樣差這麼多就是一階（拱的弧每 0.05 只差 0.02 以內）
const NEAR_STEP = 0.04, NEAR_MAX = 0.6, NEAR_DIRS = 32, ESCAPE_MAX = 1.6;
const ROUND = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5];   // separate：推離站著的人時試的方向（相對直直退開，rad）
const SQ3 = Math.sqrt(3), BRIDGE_TUCK = 0.3, RING_GROW = 0.3, RING_TRIES = 5, SLOT_SAMPLES = 72, WANDER_TRIES = 12, STAND_PASSES = 24;
// separate 每幀最多幾輪、一輪裡沒人動超過多少就停（計畫 11 任務 5）
export const SEP_PASSES = 3;
const SEP_STILL = 1e-4;

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
const onGrid = (x, z) => !!cellAt(x, z) || onAnyBridge(x, z);   // 主島格內或橋面上（groundY 有意義的地方）

// 地面高度（純函式：nav 的 groundY、手畫路線的橋頭都用它）。橋面：同高兩格是拱橋（拱高 + 半個板厚，走在甲板上不陷進去；
// 兩端超出端點的半片板子上從地面斜上半個板厚，不是一階 0.025 的台階），高低格之間的階梯直線內插
export function groundAt(x, z) {
  for (const br of BRIDGES) {
    const { s, off } = onBridge(br, x, z), end = br.level ? PLANK * br.len : 0;
    if (off > BRIDGE_HALF || s < -end || s > br.len + end) continue;
    const t = s / br.len, onto = end ? Math.min(1, (Math.min(s, br.len - s) + end) / end) : 1;
    return br.level ? br.ta + Math.max(0, Math.sin(Math.PI * t)) * ARCH + onto * DECK / 2 : br.ta + (br.tb - br.ta) * t;
  }
  const cell = cellAt(x, z);
  return cell ? cellTop(cell) : WATER_Y;
}

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
  let bodies = [], away = new Map();   // bodies：footprint 本身（不外擴，同 pads 的形狀格式）；away：escape 的結果（footprint 變了就清掉）
  const ground = k => k >= 0 && open[k] === 1, free = k => ground(k) && !blocked.has(k);
  const padded = (x, z) => pads.some(p => inPad(p, x, z));

  // 走得過：在格內／橋面上（看最近的格點）、點本身不在外擴後的 footprint 裡——不管夾縫。路線拉直時（clear）用的就是這個標準，
  // 走路中每幀的防穿牆也用它（貼著外擴邊走過夾縫是合法的路，不能當成牆把人卡住）
  function passable(x, z) {
    const k = index(x, z); if (!ground(k) || padded(x, z)) return false;
    return onGrid(x, z);   // 橋旁邊的水（格點落在橋面上，點本身在橋外）不算
  }
  // 可走：在格內／橋面上（看最近的格點），而且點本身不在外擴後的 footprint 裡——footprint 用真的形狀判，不看格點
  // （格點 0.3 一格，只看格點的話 PAD 會忽大忽小，牆邊的站位、入口落在哪一格就看運氣）。
  // 最近的格點被 footprint 擋住（點貼著牆）時，旁邊一格內要有直線走得到的可走格點，不然是走不出去的夾縫（牆和格邊之間）
  function walkable(x, z) {
    if (!passable(x, z)) return false;
    const k = index(x, z);
    if (!blocked.has(k)) return true;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const kk = k + dj * N + di; if ((di || dj) && Math.abs(ix(kk) - ix(k)) <= 1 && free(kk) && clear({ x, z }, pointOf(kk))) return true;
    }
    return false;
  }

  function groundY(x, z) { return groundAt(x, z); }

  // 每個 footprint（圓 { r }、橢圓 { rx, rz } 或矩形 { w, d }）外擴 PAD 再擋格子
  function setFootprints(list) {
    const key = JSON.stringify(list); if (key === last) return;
    last = key; version++;
    blocked = new Set(); pads = []; near = new Map(); edge = new Uint8Array(N * N); bodies = []; away = new Map();
    for (const f of list) {
      const p = f.r != null ? { x: f.x, z: f.z, r: f.r + PAD } : f.rx != null ? { x: f.x, z: f.z, rx: f.rx + PAD, rz: f.rz + PAD } : { x: f.x, z: f.z, hx: f.w / 2 + PAD, hz: f.d / 2 + PAD };
      const hx = p.r ?? p.rx ?? p.hx, hz = p.r ?? p.rz ?? p.hz;
      pads.push(p); bodies.push(f.r != null ? { x: f.x, z: f.z, r: f.r } : f.rx != null ? { x: f.x, z: f.z, rx: f.rx, rz: f.rz } : { x: f.x, z: f.z, hx: f.w / 2, hz: f.d / 2 });
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
  // 走出 footprint（建築長在身上、被放在水裡／屋頂上）：最近的可走點，而且走過去的直線不穿過別的建築本身（不含 PAD；
  // 身上這棟本來就在裡面，不算）——最近的可走點隔著隔壁的攤子時，改走沒有隔著建築的那一邊。一圈一圈找到 ESCAPE_MAX，找不到退回 nearestWalkable
  function escape(from) {
    const key = `${from.x},${from.z}`, hit = away.get(key); if (hit) return { ...hit };
    const others = bodies.filter(b => !inPad(b, from.x, from.z));
    let out = null;
    for (let rr = NEAR_STEP; !out && rr <= ESCAPE_MAX + 1e-9; rr += NEAR_STEP) for (let k = 0; k < NEAR_DIRS && !out; k++) {
      const a = 2 * Math.PI * k / NEAR_DIRS, p = { x: from.x + Math.cos(a) * rr, z: from.z + Math.sin(a) * rr };
      if (walkable(p.x, p.z) && !others.some(b => crossesPad(b, from, p))) out = { x: p.x, y: groundY(p.x, p.z), z: p.z };
    }
    out ??= nearestWalkable(from);
    away.set(key, out);
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
  let lastDone = null;
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
    if (goalK < 0) { lastDone = done; return null; }   // 找不到：記下從起點走得到的那一塊（route 的 slip 不再從那裡試）
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
    const rescued = !walkable(from.x, from.z), start = rescued ? escape(from) : from;
    if (rescued) head.push(start);
    const end = nearestWalkable(to);
    const a = anchors(start), b = anchors(end);
    let cells = a.length && b.length ? astar(a, b) : null, via = null;
    if (!cells && b.length) ({ cells, via } = slip(start, a.length ? lastDone : new Uint8Array(N * N), b));
    if (!cells) return head;                                   // 被 footprint 隔斷、到不了：留在原地
    // 起點、終點的格點也排進去：拉直時從起點直接接第二格會擦過牆角的話，退回先走到起點的格點（那一段一定看得到）
    const pulled = pull([start, ...(via ? [via] : []), ...cells.map(pointOf), end]).slice(1);
    return densify([...head, ...pulled.map(p => ({ x: p.x, y: groundY(p.x, p.z), z: p.z }))]);
  }

  // 起點在格點連不出去的夾縫裡（電工沿手畫的主路走進兩個夜市攤位外擴 PAD 之間的窄縫：點本身可走，但 0.3 一格的格點過不去，
  // A* 從那一塊出不去——計畫 5b 任務 4 量到燈泡 Lv7 上車前他走不到站前，0.45 秒跳 4.6 公尺上車）：
  // 附近 ESCAPE_MAX 內一圈圈找一個直線走得到（不擦過外擴 footprint）、格點又連得到終點的點，先直線走過去再照常找路。
  // dead：已經知道連不到終點的格點（A* 走過的那一塊），不重試
  function slip(start, dead, goals) {
    for (let rr = NEAR_STEP; rr <= ESCAPE_MAX + 1e-9; rr += NEAR_STEP) for (let k = 0; k < NEAR_DIRS; k++) {
      const t = 2 * Math.PI * k / NEAR_DIRS, p = { x: start.x + Math.cos(t) * rr, z: start.z + Math.sin(t) * rr };
      if (!walkable(p.x, p.z) || !clear(start, p)) continue;
      const a = anchors(p).filter(([q]) => !dead[q]); if (!a.length) continue;
      const cells = astar(a, goals);
      if (cells) return { cells, via: { x: p.x, y: groundY(p.x, p.z), z: p.z } };
      for (let q = 0; q < N * N; q++) if (lastDone[q]) dead[q] = 1;
    }
    return { cells: null, via: null };
  }

  // 拉直後一段路的地面不是直線（過拱橋、上下階梯）：每隔 DENSE 補一個貼地的點（xz 不變），游標的直線內插才不會陷進橋面。
  // 起點在走路格外（水裡、屋頂上被救回來）的那一段不補
  function densify(path) {
    const out = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (walkable(a.x, a.z)) out.push(...bend(a, b));
      out.push(b);
    }
    return out;
  }
  // a→b 這一段的地面不是直線（拱橋、階梯）就回每隔 DENSE 一個貼地的點（不含兩端）；是直線回 []。落在走路格外的取樣點（水上）照直線內插
  function bend(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / DENSE), at = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    const yAt = (p, t) => (onGrid(p.x, p.z) ? groundY(p.x, p.z) : a.y + (b.y - a.y) * t);
    let bent = false;
    for (let k = 1; k < 2 * n && !bent; k++) { const t = k / (2 * n), p = at(t); bent = Math.abs(yAt(p, t) - (a.y + (b.y - a.y) * t)) > 0.002; }
    if (!bent) return [];
    const pts = Array.from({ length: n - 1 }, (_, k) => { const t = (k + 1) / n, p = at(t); return { t, x: p.x, y: yAt(p, t), z: p.z }; });
    // 從橋側邊踏上／踏下（格面和橋面差一階，不是拱的弧）：兩個取樣點之間差超過 STEP_Y 就二分找到那一階，
    // 在階的兩側各補一個點——游標內插到那一段時是「一步跨上去」，不會停在半空中陷進橋面（物品 v2 任務 4：被推擠卡住幾幀就看得出來）
    const ends = [{ t: 0, y: a.y }, ...pts, { t: 1, y: b.y }], out = [];
    for (let i = 1; i < ends.length; i++) {
      const p = ends[i - 1], q = ends[i];
      if (Math.abs(q.y - p.y) > STEP_Y) {
        let lo = p.t, hi = q.t;
        for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2, y = yAt(at(mid), mid); if (Math.abs(y - p.y) <= Math.abs(y - q.y)) lo = mid; else hi = mid; }
        for (const t of [lo, hi]) if (t > p.t && t < q.t) { const c = at(t); out.push({ t, x: c.x, y: yAt(c, t), z: c.z }); }   // 不和兩端重疊（零長度的一段）
      }
      if (i < ends.length - 1) out.push(q);
    }
    return out.map(({ x, y, z }) => ({ x, y, z }));
  }
  // 手畫的折線（工程師通勤、電工主路、routeBetween 接起來的路）貼地：走路格上（格內、橋面）的點 y 換成 groundY，
  // 兩端都在走路格上的那一段過拱橋、上下階梯就補點（同 densify）。xz 不變（補的點都在原線段上，總長一樣）；
  // loop：最後一點接回第一點那一段也補（補在最後面）。走路格外的點（衛星島）照原樣
  function groundPath(path, { loop = false } = {}) {
    const pts = path.map(p => (onGrid(p.x, p.z) ? { ...p, y: groundY(p.x, p.z) } : { ...p })), out = [pts[0]];
    for (let i = 1; i <= (loop ? pts.length : pts.length - 1); i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      if (onGrid(a.x, a.z) && onGrid(b.x, b.z)) out.push(...bend(a, b));
      if (i < pts.length) out.push(b);
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

  // 走動中的兩人太近（< 兩人半徑相加）就各退一半差距（dt 保留給呼叫端統一簽名，修正是一次到位）；
  // 走路格上的人推過去會落進 footprint（或水裡）那一半就不推（§14.1）；推到走路格上的點 y 跟著換成那裡的地面（拱橋上推一下不陷進橋面）。
  // 本來在外擴 footprint 外的人也不推進去（貼著牆、最近格點被擋的夾縫裡 walkable 是假，以前照推，推進 PAD 一兩幀：計畫 5b 任務 4 量到老鼠在窩邊）；
  // 一邊推不動（貼著牆）就由另一邊讓開整段（同 separateStanding），兩個人才不會在窄道上疊在一起
  // standing（2026-10-28 錄影修正第二輪）：沒在走的人（名冊傳日常裡站定的、休息中的、站著等的）——走路的人離他不到兩人半徑相加就自己退開整段，站著的不動
  //   （以前只推兩個都在走的人，老鼠、小孩直直穿過站著的觀眾）；推不動（會進外擴 footprint）就不推。
  //   沿手畫折線走的人（m.cursor）不推（同兩兩互推）；keep(w, s, need) 回 true 的也不推——名冊用它放過「站位就在這個人旁邊」
  //   的人（第二輪審稿：站位離站好的人不到 ra + rb 時每幀被推開整段、走不到站位，在原地空走；讓他走到、站定後由 separateStanding 錯開）。
  //   一次處理一個站著的人：被一個人推開後又落進另一個人的範圍，就再推一次（整幀最多 SEP_PASSES 輪，見下；不保證同時離開所有人，下一幀再修）
  // 多輪（計畫 11 任務 5，使用者 2026-10-31「走路互相重疊」）：上面整輪（走路對站著、走路對走路）每幀最多做 passes 輪（預設 SEP_PASSES）——
  //   三個人擠成一串時，推開 A、B 又把 B 推回 C 身上，只做一輪就留著重疊到下一幀（下一幀游標又拉回來）。
  //   一輪裡沒人移動超過 SEP_STILL 就停。規則照舊（cursor 不推、can() 不推進牆／水、keep 放過的照樣放過）；
  //   不另外限每幀推多少：名冊在 separate 之後本來就把每個人這一幀的總位移限在走路速度 × dt（不瞬移）
  function separate(members, _dt, standing = [], keep = () => false, passes = SEP_PASSES) {
    const walkers = members.filter(m => m.walking === true);
    const can = (p, x, z) => walkable(x, z) || (!walkable(p.x, p.z) && !(padded(x, z) && !padded(p.x, p.z)));
    const put = (p, x, z) => { p.x = x; p.z = z; if (walkable(x, z)) p.y = groundY(x, z); };
    // w 自己退到離 s 兩人半徑相加（s 不動）。直直退開會撞牆（s 背後是池子、牆，或兩人在窄橋上）：繞著 s 往旁邊轉，找第一個推得過去的方向
    const stepOff = (w, s, need) => {
      const p = w.pos, a0 = Math.atan2(p.z - s.pos.z, p.x - s.pos.x) || 0, r = need;
      for (const da of ROUND) {
        const x = s.pos.x + Math.cos(a0 + da) * r, z = s.pos.z + Math.sin(a0 + da) * r;
        if (can(p, x, z)) { put(p, x, z); return; }
      }
    };
    for (let pass = 0; pass < passes; pass++) {
      const before = walkers.map(m => [m.pos.x, m.pos.z]);
      for (const w of walkers) for (const s of standing) {
        if (s === w || s.walking || w.cursor) continue;
        const need = apart(w, s);
        if (Math.hypot(w.pos.x - s.pos.x, w.pos.z - s.pos.z) >= need || keep(w, s, need)) continue;
        stepOff(w, s, need);
      }
      for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
        const p = walkers[i].pos, q = walkers[j].pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), need = apart(walkers[i], walkers[j]);
        if (d >= need) continue;
        // 沿手畫折線走的人（m.cursor：下一幀位置又從折線算，推了也白推）不推：另一個人自己退開整段（第二輪：偵防師和通勤的工程師在橋上擦身）
        if (!!walkers[i].cursor !== !!walkers[j].cursor) { const [w, r] = walkers[i].cursor ? [walkers[j], walkers[i]] : [walkers[i], walkers[j]]; stepOff(w, r, need); continue; }
        const ux = d ? dx / d : 1, uz = d ? dz / d : 0, push = (need - d) / 2;
        const at = (r, sgn, k) => [r.x + sgn * ux * push * k, r.z + sgn * uz * push * k];
        const okP = can(p, ...at(p, -1, 1)), okQ = can(q, ...at(q, 1, 1));
        if (okP && okQ) { put(p, ...at(p, -1, 1)); put(q, ...at(q, 1, 1)); }
        else if (okP) put(p, ...(can(p, ...at(p, -1, 2)) ? at(p, -1, 2) : at(p, -1, 1)));
        else if (okQ) put(q, ...(can(q, ...at(q, 1, 2)) ? at(q, 1, 2) : at(q, 1, 1)));
      }
      if (walkers.every((m, i) => Math.hypot(m.pos.x - before[i][0], m.pos.z - before[i][1]) <= SEP_STILL)) break;
    }
  }

  // 站著的人太近（< 兩人半徑相加）：只沿 x 錯開（不往鏡頭縱深推，§13.3），各退一半；寫回 m.pos，回傳被推過的人。
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
        const dx = xs[j] - xs[i], dz = zs[j] - zs[i], S = apart(members[i], members[j]);
        if (Math.abs(dz) >= S || Math.hypot(dx, dz) >= S - 1e-9) continue;
        const need = Math.sqrt(S * S - dz * dz) + 1e-6, dir = dx < 0 ? -1 : 1, push = (need - Math.abs(dx)) / 2;
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
      if (walkable(x, m.pos.z)) m.pos.y = groundY(x, m.pos.z);   // 走路格上錯開：貼著那裡的地面（橋上、橋頭）
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

  return { get version() { return version; }, inFootprint: padded, walkable, passable, groundY, setFootprints, nearestWalkable, route, ground: groundPath, routeLength, slots, wander, separate, separateStanding, edgePoint };
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
