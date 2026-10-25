// 名冊：島上會一直留著的角色（小孩、工程師、老鼠…）。升級時是「同一批人」走過去、換配件、換身分，不會重生。
// 每個鍵一個 group { key, spec, members, leaving, held, pending, retired }：
//   leaving：待退的人，等 flush() 才真的退（stage 依模組順序 declare，from 的目標名冊可能晚一步才來搬人）
//   held／pending：hold 住的宣告，等 sync() 才套用；pending 為 null 表示「hold 中被 retire，等 sync 再退」
// 成員日常（mode 'home'）：wander 在家附近隨機走走停停、stand 走回自己的 spot、ride 坐在列車車頂、
//   path 沿手畫的折線來回（不走尋路；起點依 i / n 錯開）、follow 跟在另一個名冊最近的成員旁邊。
// 'script' 模式的成員日常不碰，由劇本 setPose；home() 或 snap() 才回日常。
// 衛星島上的 wander（不在主島走路格上）改成繞 ringPath(at, r) 走；stand 帶 fidget（'wave'／'jump'）的小人站定時每 3 秒做一次 0.6 秒的小動作
// （老闆搖杯）；stand 帶 rescue 的 spot 在走路格外就站到最近的可走點。不認得的 home 先當成站在 spec.at。
import { trainPose } from '../actors/token.js';
import { C } from '../actors/palette.js';
import { cellAt } from '../scene/hex.js';
import { ringPath } from '../scene/people.js';
import { createPathCursor, measurePath, locateOnPath } from '../scene/path.js';

export const WALK_SPEED = { people: 1.6, model: 2.0 }, WANDER_SPEED = 0.5, HEAD_Y = { people: 0.5, model: 0.3 };
export const SEATS = { 3: [[0, 0.12], [0, -0.12], [1, 0.12], [1, -0.12], [2, 0]], 5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] };   // [車廂, 沿車身偏移]
const MODEL_H = 0.2, RIDE_Y = 0.18, ARRIVE = 0.05, BELOW = -5, STAGGER = 0.15;   // HEAD_Y.model 是 h 0.2 的頭高；藏起來的小人放到海面下；同一次宣告依序閃的間隔
const FOLLOW_SLACK = 0.2, FOLLOW_REPLAN = 0.5;   // follow：離目標超過 dist + 0.2 才動身；目標走開 0.5 以上就重新規劃
const FIDGET_EVERY = 3, FIDGET_DUR = 0.6, FIDGET_SHIFT = 1.1;   // fidget：每 3 秒一次、一次 0.6 秒；第 i 個人錯開 1.1i 秒

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const accOf = (spec, i) => { const a = spec.accessory ?? 'none'; return Array.isArray(a) ? a[i % a.length] : a; };
const look = md => `${!!md?.antenna},${!!md?.eye}`;   // 模型的「配件」：天線、獨眼
const body = md => JSON.stringify([md?.path, md?.h, md?.anim, md?.tint, md?.glow]);   // 模型本體：變了就換一個 holder
// path 日常：開放路徑的長度、第 s 公尺的位置、離 p 最近的那一點在第幾公尺
const pathOf = h => { const loop = !!h.loop, lens = measurePath(h.path, loop); return { path: h.path, loop, lens, total: lens.at(-1) }; };
const pointAt = (P, s) => locateOnPath(P.path, P.lens, s, P.loop);
function nearestS(P, p) {
  let best = 0, bestD = Infinity;
  for (let k = 0; k < P.lens.length - 1; k++) {
    const a = P.path[k], b = P.path[(k + 1) % P.path.length], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
    const d = Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
    if (d < bestD) { bestD = d; best = P.lens[k] + t * (P.lens[k + 1] - P.lens[k]); }
  }
  return best;
}
const headYOf = spec => (spec.model ? HEAD_Y.model * spec.model.h / MODEL_H : HEAD_Y.people) * (spec.scale ?? 1);

// 模型身上的小配件（從 rat.js 的 builders.rats 搬來）：機器鼠天線、變異鼠的大眼睛
function extraSpecs(md, h) {
  const out = [];
  if (md.antenna) out.push({ kind: 'compound', at: { x: 0, y: h, z: 0 }, shadow: false, parts: [{ kind: 'cylinder', pos: [0, 0.04, 0], scale: [0.01, 0.08, 0.01], color: C.ink }, { kind: 'sphere', pos: [0, 0.09, 0], scale: 0.025, color: C.neonBlue, glow: C.neonBlue }] });
  if (md.eye) out.push({ kind: 'compound', at: { x: 0, y: h * 0.78, z: h * 0.32 }, shadow: false, parts: [{ kind: 'sphere', pos: [0, 0, 0], scale: [0.09, 0.09, 0.05], color: C.white }, { kind: 'sphere', pos: [0, 0, 0.02], scale: [0.04, 0.04, 0.03], color: C.ink }] });
  return out;
}

export function createRoster(THREE, { people, assets, build = null, nav, flash, rail = { offset: 0 }, rnd = Math.random }) {
  const group = new THREE.Group(); group.name = 'roster:models';
  const groups = new Map();
  const fresh = new Set();   // 上次 flush 之後才生出來的人：換身分不先搬他們（§5.2 同一個小人原地換）
  let now = 0;   // 最近一次 update 的 t（home() 讓 ride 成員瞬間上車要用）
  let order = 0;   // 這次宣告裡第幾個閃的（每個晚 STAGGER 秒）
  const next = () => STAGGER * order++;

  const pause = () => 0.5 + rnd();
  // 成員照哪份宣告過日常：hold 中先照待套用的（劇本 spawnHeld 出來的人回家要回新家）
  const current = g => (g.held && g.pending) || g.spec;

  // ── 家的位置 ──
  function wanderHome(spec, i) {
    const h = spec.home, at = Array.isArray(h.at) ? h.at[i % h.at.length] : (h.at ?? spec.at);
    return { at, r: h.r ?? 0.5 };
  }
  // 衛星島上的家：nav 只有主島，wander 會把人拉回主島，所以改成沿家周圍的圓圈慢慢繞（同 path 日常，閉合）
  function ringHome(spec, i) {
    const { at, r } = wanderHome(spec, i);
    return cellAt(at.x, at.z) ? null : { path: ringPath(at, r, at.y), loop: true, speed: WANDER_SPEED };
  }
  // rescue：spot 落在 footprint 裡（走路格外）就站到最近的可走點（排隊的人不站進噴泉裡）；
  // 沒帶 rescue 的照原樣站（泳客站在泳池裡、老鼠泡溫泉）
  function spotOf(spec, i) {
    const spots = spec.home?.kind === 'stand' ? spec.home.spots : null;
    const spot = spots?.length ? spots[i % spots.length] : { ...spec.at, yaw: 0 };
    return spec.home?.rescue && !nav.walkable(spot.x, spot.z) ? { ...nav.nearestWalkable(spot), yaw: spot.yaw } : spot;
  }
  // 車頂座位：沿車廂前進方向（yaw）偏移，y 抬到車頂
  function seat(h, i, t) {
    const seats = SEATS[h.cars] ?? SEATS[3], [car, off] = seats[i % seats.length];
    const p = trainPose(t + (rail?.offset ?? 0), car, { speed: h.speed });
    return { x: p.x + Math.sin(p.yaw) * off, y: p.y + RIDE_Y, z: p.z + Math.cos(p.yaw) * off, yaw: p.yaw };
  }
  // m：已經在場上的成員（snap 用）；follow 的家就是他現在站的地方，剛生出來的站在 spec.at
  function homePose(spec, i, m = null) {
    const h = spec.home ?? {};
    if (h.kind === 'wander') {
      const ring = ringHome(spec, i); if (ring) { const P = pathOf(ring); return pointAt(P, P.total * i / Math.max(1, spec.n)); }
      const { at, r } = wanderHome(spec, i); return nav.wander(at, r);
    }
    if (h.kind === 'ride') return seat(h, i, now);
    if (h.kind === 'path') { const P = pathOf(h); return pointAt(P, P.total * i / Math.max(1, spec.n)); }
    if (h.kind === 'follow' && m) return { ...m.pos, yaw: m.yaw };
    return spotOf(spec, i);
  }

  // ── 把成員的 pos／yaw／walking／hidden 寫到小人或模型上 ──
  function place(m) {
    const gone = m.hidden || m.veiled;
    if (m.walker) m.walker.setPose({ x: m.pos.x, y: gone ? BELOW : m.pos.y, z: m.pos.z, yaw: m.yaw, walking: m.walking });
    if (m.holder) {
      m.holder.position.set(m.pos.x, m.pos.y, m.pos.z); m.holder.rotation.y = m.yaw; m.holder.visible = !gone;
      const mixer = m.holder.userData.mixer; if (mixer) mixer.timeScale = m.walking ? 1 : 0;
    }
  }
  function setPose(m, { x, y, z, yaw = m.yaw, walking = false }) {
    m.pos = { x, y: y ?? nav.groundY(x, z), z }; m.yaw = yaw; m.walking = walking; place(m);
  }

  // 模型的天線／眼睛：holder 還沒到就先記著，到了再做；沒有 build（測試）就不做
  function dress(m, md) {
    m.dress = md; if (!m.holder) return;
    for (const e of m.extras) { e.dispose?.(); e.object.removeFromParent(); }
    m.extras = [];
    if (build) for (const s of extraSpecs(md, md.h * m.scale)) { const p = build(s); m.extras.push(p); m.holder.add(p.object); }
  }

  // 白光揭露（§6.4）：成員先藏著，白光最亮那一刻才看得到；換配件也是「先藏、換好、最亮時露出」
  function veil(m, delay = 0) {
    const token = {}; m.veil = token; m.veiled = true; place(m);
    flash.at(m.pos, { delay, onPeak: () => { if (m.veil === token) unveil(m); } });
  }
  function unveil(m) { m.veil = null; if (m.gone) return; m.veiled = false; place(m); }

  // 載入模型 holder；換過模型（gen 變了）或成員已退，晚到的 holder 直接放掉
  function load(m, md) {
    const gen = m.gen = (m.gen ?? 0) + 1;
    assets.spawn(md.path, { h: md.h * m.scale, anim: md.anim, tint: md.tint, glow: md.glow, parent: group }).then(holder => {
      if (m.gone || m.gen !== gen) { assets.release(holder); return; }
      m.holder = holder; dress(m, m.dress); place(m);
    }).catch(err => console.warn('名冊模型載入失敗', md.path, err));
  }
  function remodel(m, spec) {
    if (m.holder) { dress(m, {}); assets.release(m.holder); m.holder = null; }
    m.scale = spec.scale ?? 1; m.dress = spec.model; m.headY = headYOf(spec); load(m, spec.model);
  }

  function spawn(g, spec, i, p, mode = 'home', delay = 0) {
    const kind = spec.model ? 'model' : 'people', scale = spec.scale ?? 1;
    const m = {
      key: g.key, i, kind, pos: { x: p.x, y: p.y ?? nav.groundY(p.x, p.z), z: p.z }, yaw: p.yaw ?? 0,
      speed: spec.speed ?? WALK_SPEED[kind], headY: headYOf(spec), mode, walking: false, hidden: false, trip: null, rest: pause(), scale,
    };
    m.head = () => ({ x: m.pos.x, y: m.pos.y + m.headY, z: m.pos.z });
    if (kind === 'people') m.walker = people.spawn({ controlled: true, shirt: spec.shirt, accessory: accOf(spec, i), scale });
    else { m.extras = []; m.dress = spec.model; load(m, spec.model); }
    veil(m, delay); fresh.add(m);
    return m;
  }
  function destroy(m) {
    m.gone = true; m.veil = null; m.walker?.remove();
    if (m.holder) { dress(m, {}); assets.release(m.holder); }
  }

  // 依宣告調整一個成員的外觀（people：配件、身高；模型：本體與天線／眼睛）；有換就藏起來等白光，回傳有沒有換
  function restyle(m, spec, i) {
    m.speed = spec.speed ?? WALK_SPEED[m.kind];
    if (m.walker) {
      // people：配件或身高（鮮奶 Lv3 長高 1.3）變了就原地換，頭頂跟著抬高
      const acc = accOf(spec, i), scale = spec.scale ?? 1;
      if (m.walker.accessory === acc && m.walker.scale === scale) return false;
      if (m.walker.accessory !== acc) m.walker.setAccessory(acc);
      m.walker.scale = m.scale = scale; m.headY = headYOf(spec);
      veil(m, next()); return true;
    }
    const md = spec.model; if (!md) return false;
    if (body(m.dress) !== body(md) || (spec.scale ?? 1) !== m.scale) remodel(m, spec);
    else if (look(m.dress) !== look(md)) dress(m, md);
    else { m.dress = md; return false; }
    veil(m, next()); return true;
  }

  // 套用一份宣告：少的（最後面的先）標成待退；留下的換配件、換家；from 搬人；還不夠就生
  function apply(g, spec) {
    const prev = g.spec; g.spec = spec; g.held = false; g.pending = null; g.retired = false; order = 0;
    while (g.members.length > spec.n) g.leaving.push(g.members.pop());
    const moved = prev && !same(prev.home, spec.home);
    g.members.forEach((m, i) => { m.i = i; restyle(m, spec, i); if (moved && m.mode === 'home') home(m); });   // 劇本手上的人不搶
    const src = spec.from && spec.from !== g.key ? groups.get(spec.from) : null;
    while (src && g.members.length < spec.n && (src.leaving.length || src.members.length)) {
      const m = src.leaving.length ? src.leaving.pop() : take(src);
      m.key = g.key; m.i = g.members.length; m.trip = null; m.cursor = null; m.rest = 0; g.members.push(m);
      if (!restyle(m, spec, m.i)) veil(m, next());   // 換身分一定閃一下
    }
    while (g.members.length < spec.n) { const i = g.members.length; g.members.push(spawn(g, spec, i, homePose(spec, i), 'home', next())); }
  }

  // 從來源名冊搬一個人：先挑這次之前就在的（最後一個），都是剛生的才搬剛生的；剩下的人重新編號
  function take(src) {
    let k = src.members.length - 1; while (k > 0 && fresh.has(src.members[k])) k--;
    if (fresh.has(src.members[k])) k = src.members.length - 1;
    const [m] = src.members.splice(k, 1); src.members.forEach((o, i) => { o.i = i; });
    return m;
  }

  function declare(key, spec, { hold = false } = {}) {
    let g = groups.get(key);
    if (!g) { g = { key, spec: null, members: [], leaving: [], held: false, pending: null, retired: false }; groups.set(key, g); }
    if (!g.retired && g.held === hold && same(g.held ? g.pending : g.spec, spec)) return;
    if (hold) { g.held = true; g.pending = spec; g.retired = false; return; }
    apply(g, spec);
  }

  // 退人；換身分搬走人後不夠宣告人數的名冊（工程師 2 → 3 的同一刻有一個變偵防師）在這裡補——
  // 等所有 declare／retire 都做完才補，被退掉的來源名冊就不會補出幽靈
  function flush() {
    order = 0;
    for (const [key, g] of groups) {
      for (const m of g.leaving) { if (!m.hidden) flash.at(m.pos); destroy(m); }   // 藏著的人（躲進門裡）已經不見了，不再閃
      g.leaving = [];
      if (g.retired && !g.held && !g.members.length) { groups.delete(key); continue; }
      if (!g.retired && !g.held && g.spec) while (g.members.length < g.spec.n) { const i = g.members.length; g.members.push(spawn(g, g.spec, i, homePose(g.spec, i), 'home', next())); }
    }
    fresh.clear();
  }

  function retire(key) {
    const g = groups.get(key); if (!g) return;
    g.retired = true;
    if (g.held) { g.pending = null; return; }   // hold 中：等 sync 才退
    g.leaving.push(...g.members); g.members = [];
  }

  // 套用 hold 住的宣告（不 flush）
  function release(g) {
    if (!g.held) return;
    if (g.pending) { apply(g, g.pending); return; }
    g.held = false; g.leaving.push(...g.members); g.members = [];
  }
  function sync(key) { const g = groups.get(key); if (g) release(g); flush(); }
  function syncAll() { for (const g of groups.values()) release(g); flush(); }

  function spawnHeld(key, at) {
    const g = groups.get(key);
    if (!g?.held || !g.pending) throw new Error(`${key} is not held`);
    if (g.members.length >= g.pending.n) throw new Error(`${key} held roster is full`);
    const m = spawn(g, g.pending, g.members.length, at, 'script'); g.members.push(m);
    return m;
  }

  function claim(m) { still(m); m.mode = 'script'; m.trip = null; m.cursor = null; m.rest = 0; }
  function home(m) {
    m.mode = 'home'; m.trip = null; m.cursor = null; m.rest = 0;   // wander：下一幀就挑新目標；stand：下一幀開始走回 spot
    const g = groups.get(m.key), spec = g && current(g);
    if (spec?.home?.kind === 'ride') setPose(m, { ...seat(spec.home, m.i, now), walking: false });
  }
  function accessory(m, acc) { if (!m.walker) return; m.walker.setAccessory(acc); veil(m); }
  function hide(m) { m.hidden = true; place(m); }
  function show(m) { m.hidden = false; place(m); }
  // 全部露出來：hidden 只在一回合裡有效（颱風登陸躲進門裡），下一回合開始、跳過、RESET 都收掉
  function showAll() { for (const g of groups.values()) for (const m of g.members) if (m.hidden) show(m); }

  // 跳過（§4.3 立刻到最終狀態）：先套用 hold 住的宣告，再讓每個人（劇本手上的、還在走的都算）瞬間到家、停下、露出來
  function snap() {
    syncAll();
    for (const g of groups.values()) {
      const spec = current(g); if (!spec) continue;
      for (const m of g.members) {
        m.mode = 'home'; m.trip = null; m.rest = pause(); m.hidden = false; m.veil = null; m.veiled = false;
        m.cursor = null; setPose(m, { ...homePose(spec, m.i, m), walking: false });
      }
    }
  }

  // ── 日常 ──
  function go(m, path) {
    const last = path.at(-1), cursor = createPathCursor(path, { loop: false });
    m.trip = path.length > 1 && cursor.total > 0 ? { cursor, left: cursor.total, last } : null;
  }
  function walk(m, dt) {
    const trip = m.trip, ds = Math.min(WANDER_SPEED * dt, trip.left);
    trip.cursor.advance(ds); trip.left -= ds;
    // 走到底：開放路徑的游標會折返（yaw 翻面），所以直接停在終點、保留原本朝向
    if (trip.left <= 1e-9) { m.trip = null; m.rest = pause(); setPose(m, { ...trip.last, yaw: m.yaw, walking: false }); return; }
    setPose(m, { ...trip.cursor.locate(), walking: true });
  }
  function idle(m, spec, dt, t) {
    const h = spec.home ?? {};
    if (h.kind === 'ride') { setPose(m, { ...seat(h, m.i, t), walking: false }); return; }
    if (h.kind === 'path') { onPath(m, h, dt); return; }
    if (h.kind === 'follow') { follow(m, h, dt); return; }
    const ring = h.kind === 'wander' ? ringHome(spec, m.i) : null;
    if (ring) { onPath(m, ring, dt); return; }
    if (m.trip) { walk(m, dt); return; }
    if (h.kind === 'wander') {
      if ((m.rest -= dt) > 0) return;
      const { at, r } = wanderHome(spec, m.i);
      go(m, nav.route(m.pos, nav.wander(at, r)));
      if (!m.trip) m.rest = pause();
      return;
    }
    const spot = spotOf(spec, m.i);
    if (Math.hypot(spot.x - m.pos.x, spot.z - m.pos.z) <= ARRIVE) { setPose(m, { ...spot, yaw: spot.yaw ?? m.yaw, walking: false }); fidget(m, h, t); return; }
    still(m);
    const path = nav.route(m.pos, spot), end = path.at(-1);
    if (end.x !== spot.x || end.z !== spot.z) path.push({ x: spot.x, y: spot.y ?? nav.groundY(spot.x, spot.z), z: spot.z });   // spot 可能在走路格外（屋頂、footprint 裡）
    go(m, path);
  }

  // fidget：站定的 people 小人每 FIDGET_EVERY 秒做一次 FIDGET_DUR 秒的 gesture，其餘時間不動
  function fidget(m, h, t) {
    if (!h.fidget || !m.walker) return;
    const ph = (((t + m.i * FIDGET_SHIFT) % FIDGET_EVERY) + FIDGET_EVERY) % FIDGET_EVERY, on = ph < FIDGET_DUR;
    m.walker.gesture = on ? { kind: h.fidget, k: ph / FIDGET_DUR } : null; m.fidgeting = on;
  }
  // 離開站位或被劇本拿走：小動作立刻收掉（劇本自己的 gesture 不碰）
  function still(m) { if (m.fidgeting) { m.walker.gesture = null; m.fidgeting = false; } }

  // path：不在折線上（剛被劇本放回來）就先走到折線上最近的一點，再從那裡沿線來回
  function onPath(m, h, dt) {
    if (m.cursor) { m.cursor.advance(h.speed * dt); setPose(m, { ...m.cursor.locate(), walking: true }); return; }
    if (m.trip) { walk(m, dt); if (m.trip) return; }
    const P = pathOf(h), s = nearestS(P, m.pos), p = pointAt(P, s);
    if (Math.hypot(p.x - m.pos.x, p.z - m.pos.z) > ARRIVE) {
      const path = nav.route(m.pos, p); path.push(p);   // 折線可能在走路格外（橋頭）：最後一段直接走上去
      go(m, path); if (m.trip) return;
    }
    m.cursor = createPathCursor(h.path, { loop: !!h.loop, s });
  }
  // follow：走向另一個名冊最近的成員，停在 dist 外；目標走開 0.5 以上重新規劃；沒有目標就站著
  function follow(m, h, dt) {
    const dist = h.dist ?? 0.6, target = api.nearest(h.key, m.pos);
    if (!target) { if (m.trip || m.walking) { m.trip = null; setPose(m, { ...m.pos, walking: false }); } return; }
    const d = Math.hypot(target.pos.x - m.pos.x, target.pos.z - m.pos.z);
    if (m.trip && d <= dist) { m.trip = null; setPose(m, { ...m.pos, walking: false }); return; }
    if (!m.trip && d <= dist + FOLLOW_SLACK) return;
    if (!m.trip || Math.hypot(target.pos.x - m.trip.goal.x, target.pos.z - m.trip.goal.z) > FOLLOW_REPLAN) {
      go(m, nav.route(m.pos, target.pos)); if (!m.trip) return;
      m.trip.goal = { ...target.pos };
    }
    walk(m, dt);
  }

  function update(dt, t) {
    now = t;
    const moving = [];
    for (const g of groups.values()) {
      const spec = current(g); if (!spec) continue;
      for (const m of g.members) {
        if (m.mode === 'home') { idle(m, spec, dt, t); if (m.walking) moving.push(m); }
        if (m.holder) {
          const mixer = m.holder.userData.mixer; if (mixer) mixer.timeScale = m.walking ? 1 : 0;
          m.holder.rotation.z = spec.model?.wave ? Math.sin(t * 3) * 0.15 : 0;
        }
      }
    }
    nav.separate(moving, dt);   // 只推日常走動的人（劇本手上的主角不被推歪）
    for (const m of moving) place(m);
  }

  function reset() {
    for (const g of groups.values()) for (const m of [...g.members, ...g.leaving]) destroy(m);
    groups.clear(); fresh.clear();
  }

  const api = {
    group, declare, flush, retire, sync, syncAll, spawnHeld, claim, home, setPose, accessory, hide, show, showAll, snap, update, reset,
    members: key => [...(groups.get(key)?.members ?? [])],
    nearest(key, p) {
      let best = null, bestD = Infinity;
      for (const m of groups.get(key)?.members ?? []) { const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bestD) { bestD = d; best = m; } }
      return best;
    },
    get count() { let n = 0; for (const g of groups.values()) n += g.members.length; return n; },
    keys: () => [...groups.keys()],
  };
  return api;
}
