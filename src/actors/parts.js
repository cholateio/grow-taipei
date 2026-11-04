// 動態零件工廠：把 view 裡的 partSpec 做成 three.js 物件。
//   compound：kit 零件合併成「一個黏土 mesh + 每種發光色一個 mesh」，演員再多 draw call 也壓得住（§10 ≤ 150）
//   people：在共用的小人系統裡生 n 個；glb：CC0 模型（可沿路徑走）；smoke：循環冒煙；
//   orbit：一台車（kit 零件拼的 model 或 glb）從 from 飛進來或從停車點（斜坡）起飛、繞圓心 at 一圈（高 h、半徑 r、車頭朝切線）、停到 park（飛天車）
//   shield：矽盾罩（半球、半透明淡藍、六角格紋）；cable：沿路徑的管子（海底電纜，通電時多一條發光管）
// 物品模組可以用 ctx.builders 加自己的 kind。每個零件 = { object, update?(dt, t), dispose?() }。
import { makeGeometry } from '../scene/kit.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { createPathCursor } from '../scene/path.js';

const ease = k => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
// orbit 的一趟飛行（純函式）：t 秒時的位置與車頭方向。start 'from'（從 spec.from 飛進來）或 'park'（從停車點起飛）；
//   legs = [飛到圓上幾秒, 從圓上飛回停車點幾秒]；圓上那一圈從角 phase 逆時針繞一圈（2π / speed 秒），車頭朝切線（同列車的 yaw）；
//   飛完 done = true、停在 park，車頭朝 park.yaw（有給的話：Roadster 停好朝 101），不然朝最後一段的方向（停好不再轉）。
//   每一段開頭車頭從上一段結束的方向轉過來（最短轉角，每秒最多 TURN_RATE、至少 TURN_MIN 秒），交界不瞬間轉向
// 計畫 8 任務 5（Tesla Roadster，設計 §4.6）的兩個選項，沒給就是上面的老飛法（無人機、尾聲的紅色跑車只用 squash）：
//   ramp = { foot, yaw, len, angle, points }：停車點前方屋頂上的一條坡道（坡腳 foot、朝 yaw、坡面長 len、仰角 angle），
//     points 是車身底下會碰地的點 [沿車頭方向, 離輪底高]（後保險桿底、後輪、前輪、車鼻底；原點在輪底）。
//     從停車點起飛時前 RAMP_T 秒：車順著 yaw 加速（離坡腳的水平距離 c = c0 + (c1 − c0)·k²）往前開，每一刻的車身是
//     「放在屋頂＋坡面上、所有 points 都不低於表面、原點最低」的那個姿勢（rampRest：先在屋頂上平開，車鼻碰到坡、前輪上坡、
//     車尾保險桿擦著屋頂、一路仰起來），前輪到坡頂（c1）那一刻離開坡道；車鼻過了坡腳才噴氣（puff）。
//     之後一條拋物線（水平等速、高度 1 − (1 − k)² 先快後慢、仰角放平）從離坡那一點拉到圓上入口，整段 legs[0] 秒
//   squash（壓下去的深度）：回停車點那段提早 TOUCH 秒落地，最後 TOUCH 秒車身壓下去再回彈（squash = 深度 · sin(π·u/TOUCH)），
//     落地前 TOUCH 秒噴氣；回程車頭從切線一路轉到 park.yaw（落地時剛好轉好；Roadster 車頭朝 101 倒車入位）
//   puff：噴氣那段的進度 0..1（其餘時候沒有這個欄位）；pitch：仰角（只有 ramp 才有）
export const RAMP_T = 0.6, TOUCH = 0.3;
const TURN_RATE = 3.3, TURN_MIN = 0.3;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const turnIn = (prev, cur, u) => { const d = wrap(prev - cur), T = Math.max(TURN_MIN, Math.abs(d) / TURN_RATE); return cur + d * Math.max(0, 1 - u / T); };
// 坡道的剖面（沿車頭方向、離坡腳的水平距離 x → 表面高，相對坡腳）：坡腳以前是屋頂（0）、坡上 x·tan(angle)、坡頂以外沒有東西
export const rampSurface = (ramp, x) => { const run = ramp.len * Math.cos(ramp.angle); return x < 0 ? 0 : x <= run + 1e-12 ? x * Math.tan(ramp.angle) : -Infinity; };
// 車在剖面上的靜止姿勢：原點離坡腳水平 c 時，仰角 th ∈ [0, angle] 裡讓「所有 points 都不低於表面」的原點高 y0 最低的那個
export function rampRest(ramp, c) {
  const y0 = th => {
    const sn = Math.sin(th), cs = Math.cos(th);
    let m = -Infinity;
    for (const [a, u] of ramp.points) m = Math.max(m, rampSurface(ramp, c + a * cs - u * sn) - (a * sn + u * cs));
    return m;
  };
  const N = 48, A = ramp.angle;
  let best = 0;
  for (let i = 1; i <= N; i++) if (y0(A * i / N) < y0(A * best / N)) best = i;
  let lo = A * Math.max(0, best - 1) / N, hi = A * Math.min(N, best + 1) / N;
  for (let i = 0; i < 40; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (y0(m1) <= y0(m2)) hi = m2; else lo = m1; }
  const th = y0(0) <= y0((lo + hi) / 2) + 1e-12 ? 0 : (lo + hi) / 2;   // 平的時候剛好 0
  return { th, y0: y0(th) };
}
// 一條坡道的起飛常數（純看 spec，算一次記住）：c0 停車點離坡腳、c1 前輪到坡頂、cNose 車鼻到坡腳（之後噴氣）、離坡那一刻的姿勢
const launchCache = new WeakMap();
function launchOf(ramp, park) {
  if (launchCache.has(ramp)) return launchCache.get(ramp);
  const dx = Math.sin(ramp.yaw), dz = Math.cos(ramp.yaw), run = ramp.len * Math.cos(ramp.angle);
  const front = Math.max(...ramp.points.filter(([, u]) => u === 0).map(([a]) => a)), nose = Math.max(...ramp.points.map(([a]) => a));
  const c0 = (park.x - ramp.foot.x) * dx + (park.z - ramp.foot.z) * dz;
  let lo = c0, hi = run;   // 前輪的水平位置 c + front·cos(th) 隨 c 遞增：二分找到坡頂
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (m + front * Math.cos(rampRest(ramp, m).th) < run) lo = m; else hi = m; }
  const c1 = lo, end = rampRest(ramp, c1);   // lo：前輪還在坡上的最後一點（再過去前輪懸空，rampRest 會讓車平躺回去）
  const L = { dx, dz, c0, c1, cNose: -nose, at: c => ({ x: ramp.foot.x + dx * c, z: ramp.foot.z + dz * c }) };
  L.lift = { ...L.at(c1), y: ramp.foot.y + end.y0, pitch: end.th };
  launchCache.set(ramp, L);
  return L;
}
export function orbitPose(spec, t, start = 'from') {
  const { at, r, h, speed, phase = 0, legs: [tin, tout] = [1, 1], park, ramp, squash = 0 } = spec, from = start === 'park' ? park : spec.from ?? park;
  const name = () => `orbit spec (park ${park.x.toFixed(2)}, ${park.z.toFixed(2)})`;
  if (ramp && tin <= RAMP_T) throw new Error(`${name()}: legs[0] ${tin} must be longer than the ramp (${RAMP_T} s)`);
  if (squash > 0 && tout <= TOUCH) throw new Error(`${name()}: legs[1] ${tout} must be longer than the touchdown (${TOUCH} s)`);
  const lap = 2 * Math.PI / speed, E = { x: at.x + Math.cos(phase) * r, y: at.y + h, z: at.z + Math.sin(phase) * r };
  const head = (a, b) => Math.atan2(b.x - a.x, b.z - a.z), tangent = a => Math.atan2(-Math.sin(a), Math.cos(a));
  const L = start === 'park' && ramp ? launchOf(ramp, park) : null, R = L ? L.lift : from;
  const hIn = head(R, E), hOut = head(E, park), hPark = park.yaw ?? hOut, touchT = squash > 0 ? TOUCH : 0, descentT = tout - touchT;
  const leg = (a, b, k, yaw) => ({ x: lerp(a.x, b.x, ease(k)), y: lerp(a.y, b.y, ease(k)), z: lerp(a.z, b.z, ease(k)), yaw, done: false });
  if (L && t < RAMP_T) {   // 屋頂上開過去、上坡道：從靜止加速，姿勢由 rampRest 決定
    const k = Math.max(0, t) / RAMP_T, c = L.c0 + (L.c1 - L.c0) * k * k, rest = rampRest(ramp, c), p = L.at(c);
    const pose = { x: p.x, y: ramp.foot.y + rest.y0, z: p.z, yaw: hPark, pitch: rest.th, done: false };
    return c > L.cNose ? { ...pose, puff: (c - L.cNose) / (L.c1 - L.cNose) } : pose;
  }
  if (L && t < tin) {   // 拋物線：離坡那一點拉高到圓上入口，車頭放平
    const k = (t - RAMP_T) / (tin - RAMP_T);
    return { x: lerp(R.x, E.x, k), y: R.y + (E.y - R.y) * (1 - (1 - k) ** 2), z: lerp(R.z, E.z, k), yaw: turnIn(hPark, hIn, t - RAMP_T), pitch: R.pitch * (1 - ease(k)), done: false };
  }
  if (t < tin) return leg(from, E, t / tin, start === 'park' ? turnIn(hPark, hIn, t) : hIn);
  if (t < tin + lap) { const u = t - tin, a = phase + u * speed; return { x: at.x + Math.cos(a) * r, y: at.y + h, z: at.z + Math.sin(a) * r, yaw: turnIn(hIn, tangent(a), u), done: false }; }
  if (t < tin + lap + descentT) {
    const u = t - tin - lap, k = u / descentT;
    if (!touchT) return leg(E, park, k, turnIn(tangent(phase), hOut, u));
    const p = leg(E, park, k, tangent(phase) + wrap(hPark - tangent(phase)) * ease(k));
    return u >= descentT - TOUCH ? { ...p, puff: (u - descentT + TOUCH) / TOUCH } : p;
  }
  if (t < tin + lap + tout) { const u = t - tin - lap - descentT; return { x: park.x, y: park.y, z: park.z, yaw: hPark, squash: squash * Math.sin(Math.PI * u / touchT), done: false }; }
  return { x: park.x, y: park.y, z: park.z, yaw: hPark, done: true };
}

// ── 矽盾罩（晶片 Lv8／9、結局 §8）：狀態 test 閃三下（不透明度脈衝）再縮回地面藏起來；standby 淡淡常駐、跟 101 每 3 秒一起亮一下；
// full 全亮（結局擋隕石）：隕石撞上那一刻建好（t 從撞上算），全亮到 fade[0]、fade[0]–fade[1] 淡到 0 同時微微脹大到 swell 倍，之後藏起來——
//   擋完隕石罩子就收掉（使用者 2026-11-04：「防護罩在擋完隕石就可以消失了」；煙火在 t 0–1.2 放完前罩子都還在）。
// shieldPose 是純函式：t 秒時的 { opacity, scale, visible }
export const SHIELD = { color: 0xa8e6ff, flashes: 3, period: 0.8, retract: 0.6, test: 0.55, standby: [0.08, 0.2], full: 0.55, pulse: 3, fade: [0.8, 1.6], swell: 1.08 };
export const SHIELD_TEST_DUR = SHIELD.flashes * SHIELD.period + SHIELD.retract;
// fail（計畫 17 任務 2：晶片 7–8 的隕石警告裡試升失敗）：0–rise 秒從地面長到 scale 倍大（不透明度 opacity）、停到 0.5 →
// flashes 兩段 [起, 迄]（sin² 亮到 hi 再暗回 lo：第一下 0.2 s、第二下 0.1 s 短一點，像電力不穩）→ 暗著（lo）到 retract[0] →
// retract 那段縮回 0（不透明度回 opacity，看得出是縮回去）→ 藏起來；整段 SHIELD_FAIL_DUR
export const SHIELD_FAIL = { rise: 0.4, scale: 0.6, opacity: 0.35, flashes: [[0.5, 0.7], [0.7, 0.8]], hi: 0.5, lo: 0.05, retract: [0.9, 1.2] };
export const SHIELD_FAIL_DUR = 1.3;
function failPose(t) {
  const F = SHIELD_FAIL, [r0, r1] = F.retract;
  if (t < F.rise) return { opacity: F.opacity, scale: F.scale * ease(t / F.rise), visible: true };
  if (t < F.flashes[0][0]) return { opacity: F.opacity, scale: F.scale, visible: true };
  if (t < r0) {
    const f = F.flashes.find(([a, b]) => t >= a && t < b);
    const k = f ? Math.sin(Math.PI * (t - f[0]) / (f[1] - f[0])) ** 2 : 0;
    return { opacity: F.lo + (F.hi - F.lo) * k, scale: F.scale, visible: true };
  }
  if (t < r1) return { opacity: F.opacity, scale: F.scale * (1 - ease((t - r0) / (r1 - r0))), visible: true };
  return { opacity: 0, scale: 0, visible: false };
}
export function shieldPose(state, t) {
  if (state === 'fail') return failPose(t);
  if (state === 'test') {
    const flash = SHIELD.flashes * SHIELD.period;
    if (t < flash) return { opacity: 0.04 + (SHIELD.test - 0.04) * Math.sin(Math.PI * (t % SHIELD.period) / SHIELD.period) ** 2, scale: 1, visible: true };
    if (t < SHIELD_TEST_DUR) return { opacity: 0.04, scale: 1 - ease((t - flash) / SHIELD.retract), visible: true };
    return { opacity: 0, scale: 0, visible: false };
  }
  if (state === 'full') {
    const [f0, f1] = SHIELD.fade;
    if (t < f0) return { opacity: SHIELD.full, scale: 1, visible: true };
    if (t < f1) { const k = ease((t - f0) / (f1 - f0)); return { opacity: SHIELD.full * (1 - k), scale: 1 + (SHIELD.swell - 1) * k, visible: true }; }
    return { opacity: 0, scale: SHIELD.swell, visible: false };
  }
  // standby：跟天線同一個相位（tower.js 的 antenna：(1 + sin(2πt/3)) / 2）
  const [lo, hi] = SHIELD.standby, k = (1 + Math.sin(t * Math.PI * 2 / SHIELD.pulse)) / 2;
  return { opacity: lo + (hi - lo) * k, scale: 1, visible: true };
}
// 六角格紋貼圖（pointy-top，一格貼圖剛好一個週期：寬 √3·s、高 3·s）：邊線不透明白、格心淡；DataTexture 不靠 canvas，Node 測試也做得出來
const HEX_W = 64, HEX_H = 111, hexCache = new WeakMap();
function hexGrid(THREE) {
  if (hexCache.has(THREE)) return hexCache.get(THREE);
  const s = HEX_W / Math.sqrt(3), data = new Uint8Array(HEX_W * HEX_H * 4), ap = s * Math.sqrt(3) / 2;
  // 週期格子裡的六角中心：四角與正中（再加上下左右的鄰格，取最近的）
  const centres = [];
  for (const [cx, cy] of [[0, 0], [HEX_W, 0], [0, HEX_H], [HEX_W, HEX_H], [HEX_W / 2, HEX_H / 2], [HEX_W / 2, -HEX_H / 2], [HEX_W / 2, HEX_H * 1.5], [-HEX_W / 2, HEX_H / 2], [HEX_W * 1.5, HEX_H / 2]]) centres.push([cx, cy]);
  const normals = [0, Math.PI / 3, 2 * Math.PI / 3].map(a => [Math.cos(a), Math.sin(a)]);
  for (let y = 0; y < HEX_H; y++) for (let x = 0; x < HEX_W; x++) {
    let best = Infinity;
    for (const [cx, cy] of centres) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.max(...normals.map(([nx, ny]) => Math.abs(dx * nx + dy * ny)));
      if (r < best) best = r;
    }
    const edge = ap - best, i = (y * HEX_W + x) * 4;   // 離最近的邊幾格
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = edge < 1.5 ? 255 : edge < 3 ? 140 : 46;
  }
  const tex = new THREE.DataTexture(data, HEX_W, HEX_H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  hexCache.set(THREE, tex);
  return tex;
}

export function createPartFactory(THREE, ctx) {
  const unit = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), color = new THREE.Color();
  const clay = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, vertexColors: true });
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);

  // 每種 kind 一份非索引的單位幾何，合併時 clone 再套矩陣
  const baseGeo = kind => {
    if (!unit.has(kind)) { const g = makeGeometry(THREE, kind); unit.set(kind, g.index ? g.toNonIndexed() : g); }
    return unit.get(kind);
  };

  // geometry：builder 自己算好的幾何（計畫 13 火山錐）代替 kind——一樣套矩陣；自己帶頂點色就留著，沒有才塗 color。
  // 防呆（修正輪 1）：索引幾何先攤平（mergeGeometries 要全部非索引）、沒有法線就自己算（clone 之後才動，不改呼叫端那份）
  function partGeometry({ kind, geometry, pos, scale = 1, rot = [0, 0, 0], color: hex }) {
    let g = (geometry ?? baseGeo(kind)).clone();
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    if (geometry && g.index) { const flat = g.toNonIndexed(); g.dispose(); g = flat; }
    if (geometry && !g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m4.compose(new THREE.Vector3(...pos), q.setFromEuler(e.set(...rot)), new THREE.Vector3(...s)));
    if (!(geometry && g.attributes.color)) {
      color.setHex(hex);
      const n = g.attributes.position.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  }

  function compound(spec) {
    const object = new THREE.Group(), groups = new Map(), owned = [];
    for (const p of spec.parts) {
      if (ctx.quality === 'low' && p.low === false) continue;   // 單一零件的 low: false（離島三段併在基座裡的點綴）：手機不畫那一塊
      const key = ctx.quality === 'low' ? 'clay' : p.glow ?? 'clay';   // ?quality=low：發光的部分照顏色併進同一個 mesh（一個零件一個 draw call，裁決 R18）
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(partGeometry(p));
    }
    for (const [key, geos] of groups) {
      const geo = mergeGeometries(geos); geos.forEach(g => g.dispose());
      let mat = clay;
      if (key !== 'clay') { mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, vertexColors: true, emissive: key }); ctx.glow.add(mat); owned.push(mat); }
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = spec.shadow !== false;
      object.add(mesh);
    }
    return {
      object, materials: owned,
      dispose() { object.traverse(o => o.geometry?.dispose()); for (const m of owned) { ctx.glow.remove(m); m.dispose(); } },
    };
  }

  function people(spec) {
    const { n = 1, path, stand, loop = true, speed = 0.35, accessory = 'none', shirt, scale } = spec;
    const walkers = Array.from({ length: n }, (_, i) => ctx.people.spawn({
      ...(stand ? { stand: stand[i % stand.length] } : { path }), loop, speed, accessory, ...(shirt !== undefined ? { shirt: Array.isArray(shirt) ? shirt[i % shirt.length] : shirt } : {}), ...(scale ? { scale } : {}),
    }));
    return { object: new THREE.Group(), walkers, dispose() { for (const w of walkers) w.remove(); } };
  }

  function glb(spec) {
    const object = new THREE.Group(), mats = [];
    let model = null, disposed = false;
    const cursor = spec.loop ? createPathCursor(spec.loop.path, { loop: spec.loop.loop ?? true }) : null;
    if (cursor && spec.loop.phase) cursor.advance(spec.loop.phase * cursor.total);
    // ?quality=low：不分發光材質（合併後一個模型一個 mesh，裁決 R18）
    // ready：模型加進 group 的那一刻 resolve（載入失敗、或已經丟掉也 resolve）——回合預熱等它才編 shader（計畫 15 C）
    const ready = ctx.assets.spawn(spec.path, { h: spec.h, anim: spec.anim, speed: spec.animSpeed, tint: spec.tint, glow: ctx.quality === 'low' ? null : spec.glow, ry: spec.ry ?? 0 }).then(m => {
      if (disposed) { ctx.assets.release?.(m); return; }
      model = m; object.add(m);
      m.traverse(o => { if (o.isMesh) for (const mt of [].concat(o.material)) if (mt.emissiveIntensity > 0 && mt.emissive?.getHex()) { ctx.glow.add(mt); mats.push(mt); } });
      place();
    }).catch(err => console.warn('模型載入失敗', spec.path, err));
    loads?.push(ready);
    const place = () => {
      if (!model || !cursor) return;
      const p = cursor.locate(), at = spec.at;
      model.position.set(p.x - at.x, p.y - at.y, p.z - at.z); model.rotation.y = p.yaw;
    };
    return {
      object, ready,
      update(dt) { if (cursor) { cursor.advance(dt * spec.loop.speed); place(); } },
      dispose() { disposed = true; for (const m of mats) ctx.glow.remove(m); if (model) ctx.assets.release?.(model); },
    };
  }

  function smoke(spec) {
    const { size = 0.2, rise = 1.2, color: hex = 0xffffff, opacity = 0.8, offsetY = 0 } = spec, object = new THREE.Group();
    const n = Math.min(spec.n ?? 4, ctx.quality === 'low' ? 2 : Infinity);   // ?quality=low 最多兩團煙（一團一個 draw call）
    const puffs = Array.from({ length: n }, (_, i) => {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false }));
      object.add(m); return { m, ph: i / n };
    });
    return {
      object,
      update(dt, t) {
        for (const p of puffs) {
          const k = (p.ph + t * 0.18) % 1;
          p.m.position.set(Math.sin(k * 5 + p.ph * 7) * 0.15, offsetY + k * rise, 0);
          p.m.scale.setScalar(size * (0.5 + k)); p.m.material.opacity = opacity * (1 - k) + 1e-3;
        }
      },
      dispose() { for (const p of puffs) p.m.material.dispose(); },
    };
  }

  // 飛天車：平常停在 park；object.userData.fly({ delay, speed }) 飛一趟（劇本的拍叫它；delay 與飛行照 speed 倍速，現在恆為 1）——
  // 有 from 從 from 飛進來，沒有就從停車點起飛（Roadster：屋頂斜坡）；land() 立刻停好（跳過）；
  // 有 rest 的話停滿 rest 秒自己從停車點起飛再繞一圈（全島長滿時天上一直有車在動）。
  // 模型：model: { parts }（kit 零件拼的車，一個 compound，原點在輪底）或 path（glb：無人機、尾聲的紅色跑車）。
  // 車（object.children[0]）在 at 底下，位置相對 at；轉向 YXZ（先仰角 pitch 再轉車頭 yaw）。
  // squash：模型 y 方向壓扁，輪底（原點）不離地、車頂壓下 squash；puff：車底三顆白色小球往外散、變大、淡出（一個 InstancedMesh，
  // 只在 orbitPose 給 puff 的那幾段看得到——跳過（land）就藏起來）
  const PUFF_AT = [[-0.07, 0.1], [0.07, 0.1], [0, -0.12]];
  function orbit(spec) {
    // ?quality=low（手機，裁決 R18 draw call ≤ 150）：飛天車、無人機不畫；fly／land 留著給劇本叫
    if (ctx.quality === 'low') { const object = new THREE.Group(); object.userData.fly = () => {}; object.userData.land = () => {}; return { object, update() {}, dispose() {} }; }
    const object = new THREE.Group(), at = spec.at, car = new THREE.Group(); car.rotation.order = 'YXZ'; object.add(car);
    const model = spec.model ? compound({ parts: spec.model.parts }) : glb({ path: spec.path, h: spec.size, tint: spec.tint, glow: spec.glow, ry: spec.ry ?? 0 });
    car.add(model.object);
    const top = spec.model ? new THREE.Box3().setFromObject(model.object).max.y : 1;
    let puffs = null;
    if (spec.ramp || spec.squash) {
      puffs = new THREE.InstancedMesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }), PUFF_AT.length);
      puffs.castShadow = puffs.receiveShadow = false; puffs.frustumCulled = false; puffs.visible = false; car.add(puffs);
    }
    const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pv = new THREE.Vector3(), ps = new THREE.Vector3();
    const puffAt = k => {
      PUFF_AT.forEach(([x, z], i) => {
        const u = (k * 2 + i / PUFF_AT.length) % 1, d = Math.hypot(x, z);
        puffs.setMatrixAt(i, pm.compose(pv.set(x + x / d * 0.12 * u, 0.025 - 0.02 * u, z + z / d * 0.12 * u), pq, ps.setScalar(0.025 + 0.045 * u)));
      });
      puffs.instanceMatrix.needsUpdate = true; puffs.material.opacity = 0.85 * (1 - k * k) + 0.05;
    };
    const put = p => {
      car.position.set(p.x - at.x, p.y - at.y, p.z - at.z); car.rotation.y = p.yaw; car.rotation.x = -(p.pitch ?? 0);
      model.object.scale.y = p.squash > 0 ? 1 - p.squash / top : 1;
      if (puffs) { puffs.visible = p.puff != null; if (puffs.visible) puffAt(p.puff); }
    };
    let flying = false, start = 'park', t = 0, idle = 0, rate = 1;
    const land = () => { flying = false; idle = 0; put(orbitPose(spec, Infinity)); };
    land();
    object.userData.fly = ({ delay = 0, speed = 1 } = {}) => { flying = true; start = spec.from ? 'from' : 'park'; t = -delay; rate = speed; const p = orbitPose(spec, 0, start); put(t < 0 ? { ...p, puff: undefined } : p); };
    object.userData.land = land;
    return {
      object,
      update(dt) {
        if (!flying) { if (spec.rest == null || (idle += dt) < spec.rest) return; flying = true; start = 'park'; t = 0; rate = 1; }
        t += dt * rate; const p = orbitPose(spec, Math.max(0, t), start); put(t < 0 ? { ...p, puff: undefined } : p);   // 錯開起飛的等待（t < 0）不噴氣
        if (p.done) land();
      },
      dispose() { model.dispose(); puffs?.material.dispose(); },
    };
  }

  // 煙火：60 顆小球一發，從中心炸開、重力下落、淡出，每 1.2 秒一發；不投影
  // once（最終章 §6：隕石撞上矽盾碎成一發煙火）：只放一發——用自己的時鐘（累加 dt，不看全域 t），1.2 秒後整個藏起來、一直藏著；
  //   建好即終態（藏著、不自己放）：object.userData.burst() 從頭放一發（隕石撞上罩子那一刻），finish() 直接藏好（跳過）
  function fireworks(spec) {
    const N = 60, BURST = 1.2, object = new THREE.Group(), colors = spec.colors ?? [0xff3fa0];
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), N);
    mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false; object.add(mesh);
    const dirs = Array.from({ length: N }, (_, i) => { const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const pose = t => {
      const k = (t % BURST) / BURST, burst = Math.floor(t / BURST), s = 1.4 * Math.sqrt(k), fade = 1 - k;
      dirs.forEach((d, i) => { mesh.setMatrixAt(i, m4.compose(p.copy(d).multiplyScalar(s).add(sc.set(0, -1.2 * k * k, 0)), q, sc.setScalar(fade + 0.05))); mesh.setColorAt(i, col.setHex(colors[(burst + i) % colors.length])); });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.material.opacity = fade;
    };
    let own = Infinity;   // once 的時鐘（Infinity = 放完了、藏著）
    const put = () => { mesh.visible = own < BURST; if (mesh.visible) pose(own); };
    if (spec.once) {
      object.userData.burst = () => { own = 0; put(); };
      object.userData.finish = () => { own = Infinity; put(); };
      put();
    }
    return {
      object,
      update(dt, t) { if (!spec.once) { pose(t); return; } if (own < BURST) { own += dt; put(); } },
      dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
    };
  }

  // 矽盾罩：半徑 r 的半球立在 at（101 底座）；格紋貼圖共用，材質每個零件自己一份（不透明度各演各的）。
  // 單面（FrontSide）：從全景看得到靠鏡頭的那半面，罩裡的島透得出來；不寫深度、不投影，一個 draw call。
  // 演法照 shieldPose；縮放與藏起來動的是裡面的 mesh，劇本的 scaleIn／閃白照樣作用在外層。
  // test 建好時就是演完的樣子（收起來、藏著）：閃三下由劇本叫 object.userData.test({ speed }) 開演、finish() 跳到收好
  //   （跳過、reduced-motion、舞台重建零件都不會重閃）；speed：演出倍速（現在恆為 1；以前蒙太奇 2，裁決 R15），閃三下跟著快
  // fail（計畫 17 任務 2，隕石警告裡試升失敗）同 test：建好時就藏著，劇本叫 test() 從 0 演 shieldPose('fail')、finish() 跳到藏好
  // full（結局擋隕石，2026-11-04 起擋完就消失）也一樣：建好時就是演完的樣子（藏著）——跳過、截圖、舞台重建零件都看不到罩子；
  //   隕石劇本在撞上那一刻套用的同一幀叫 test() 從 0 演（全亮 → 淡掉 → 藏起來，見 shieldPose）
  function shield(spec) {
    const geo = new THREE.SphereGeometry(spec.r, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), map = hexGrid(THREE).clone();
    map.repeat.set(24, 3.5); map.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ color: SHIELD.color, map, transparent: true, depthWrite: false, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat), object = new THREE.Group(); mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = 2; object.add(mesh);
    let t = spec.state === 'test' || spec.state === 'fail' || spec.state === 'full' ? Infinity : 0, rate = 1;
    const put = () => { const p = shieldPose(spec.state, t); mesh.visible = p.visible; mesh.scale.setScalar(p.scale); mat.opacity = p.opacity; };
    object.userData.test = ({ speed = 1 } = {}) => { t = 0; rate = speed; put(); };
    object.userData.finish = () => { t = Infinity; put(); };
    put();
    return {
      object,
      update(dt) { t += dt * rate; put(); map.offset.y = (map.offset.y + dt * 0.05) % 1; },   // 格紋慢慢往上捲
      dispose() { geo.dispose(); mat.dispose(); map.dispose(); },
    };
  }

  // 海底電纜：path（世界座標）連成平滑的管子。暗的管子和 parts（登陸桿等，相對 at）併成一個黏土 mesh；
  // lit 時外面多一條略粗的自發光管（MeshBasicMaterial，白天也亮），建好時整條亮；object.userData.progress(k) 讓光從 path 的頭跑到 k
  // （劇本在套用這個零件的同一拍把它歸零再跑，中間沒有畫面）
  function cable(spec) {
    const at = spec.at, pts = spec.path.map(p => new THREE.Vector3(p.x - at.x, p.y - at.y, p.z - at.z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), segs = Math.max(16, pts.length * 6), r = spec.r ?? 0.05;
    const tube = new THREE.TubeGeometry(curve, segs, r, 5, false).toNonIndexed();
    tube.deleteAttribute('uv'); color.setHex(spec.color ?? 0x211d1d);
    const n = tube.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b; }
    tube.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const extra = (spec.parts ?? []).map(partGeometry), geo = mergeGeometries([tube, ...extra]); tube.dispose(); extra.forEach(g => g.dispose());
    const object = new THREE.Group(), dark = new THREE.Mesh(geo, clay); dark.castShadow = dark.receiveShadow = true; object.add(dark);
    let glowGeo = null, glowMat = null;
    if (spec.lit) {
      glowGeo = new THREE.TubeGeometry(curve, segs, r * 1.25, 5, false); glowMat = new THREE.MeshBasicMaterial({ color: spec.glow ?? 0x3fe0ff });
      const lit = new THREE.Mesh(glowGeo, glowMat); lit.castShadow = lit.receiveShadow = false; object.add(lit);
      const total = glowGeo.index.count, tri = 3 * 5 * 2;   // 一段管子（5 邊 × 2 三角形）的索引數，光一段一段往前
      object.userData.progress = k => glowGeo.setDrawRange(0, Math.round(Math.min(1, Math.max(0, k)) * total / tri) * tri);
    } else object.userData.progress = () => {};
    return { object, dispose() { geo.dispose(); glowGeo?.dispose(); glowMat?.dispose(); } };
  }

  const KINDS = { compound, people, glb, smoke, fireworks, orbit, shield, cable };
  // 模組自己的 kind 拿到的 ctx 多一個 build，可以用 compound 等基本零件組出會動的東西
  const builderCtx = { ...ctx, build: s => build(s) };

  // low: false 的零件（燈光秀、堤防、煙火、船隊這類點綴）在 ?quality=low 不畫：給一個空的 Group（footprint 照宣告的算，劇本照樣找得到零件）
  // ready（計畫 15 C）：最外層這次 build 底下所有 glb 的 ready 收在 loads——自己的 kind 沒給 ready、底下又有模型的零件
  //   （101 頂樓、路燈、球場、列車、老鼠……用 ctx.build 拼 glb 的）也拿到一個「全部模型都載好」的 ready；底下沒有模型就沒有 ready（當作已就緒）
  let loads = null;
  function build(spec) {
    if (ctx.quality === 'low' && spec.low === false) { const object = new THREE.Group(), { x = 0, y = 0, z = 0 } = spec.at ?? {}; object.position.set(x, y, z); return { object, dispose() {} }; }
    const make = ctx.builders?.[spec.kind] ? s => ctx.builders[spec.kind](THREE, s, builderCtx) : KINDS[spec.kind];
    if (!make) throw new Error(`unknown part kind ${spec.kind}`);
    const outer = !loads; if (outer) loads = [];
    try {
      const part = make(spec);
      const { x = 0, y = 0, z = 0 } = spec.at ?? {};
      part.object.position.set(x, y, z);
      if (outer && loads.length && !part.ready) part.ready = Promise.all(loads).then(() => {});
      return part;
    } finally { if (outer) loads = null; }
  }

  return { clay, build };
}
