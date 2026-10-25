// 名冊：島上會一直留著的角色（小孩、工程師、老鼠…）。升級時是「同一批人」走過去、換配件、換身分，不會重生。
// 每個鍵一個 group { key, spec, members, leaving, held, pending, retired }：
//   leaving：待退的人，等 flush() 才真的退（stage 依模組順序 declare，from 的目標名冊可能晚一步才來搬人）
//   held／pending：hold 住的宣告，等 sync() 才套用；pending 為 null 表示「hold 中被 retire，等 sync 再退」
// 成員日常（mode 'home'）：wander 在家附近隨機走走停停、stand 走回自己的 spot、ride 坐在列車車頂。
// 'script' 模式的成員日常不碰，由劇本 setPose；home() 或 snap() 才回日常。
// path／follow／fidget 與衛星島 wander 之後的任務才做；不認得的 home 先當成站在 spec.at。
import { trainPose } from '../actors/token.js';
import { C } from '../actors/palette.js';
import { createPathCursor } from '../scene/path.js';

export const WALK_SPEED = { people: 1.6, model: 2.0 }, WANDER_SPEED = 0.5, HEAD_Y = { people: 0.5, model: 0.3 };
export const SEATS = { 3: [[0, 0.12], [0, -0.12], [1, 0.12], [1, -0.12], [2, 0]], 5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] };   // [車廂, 沿車身偏移]
const MODEL_H = 0.2, RIDE_Y = 0.18, ARRIVE = 0.05, BELOW = -5;   // HEAD_Y.model 是 h 0.2 的頭高；藏起來的小人放到海面下

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const accOf = (spec, i) => { const a = spec.accessory ?? 'none'; return Array.isArray(a) ? a[i % a.length] : a; };
const look = md => `${!!md?.antenna},${!!md?.eye}`;   // 模型的「配件」：天線、獨眼

// 模型身上的小配件（從 rat.js 的 builders.rats 搬來）：機器鼠天線、變異鼠的大眼睛
function extraSpecs(md) {
  const h = md.h, out = [];
  if (md.antenna) out.push({ kind: 'compound', at: { x: 0, y: h, z: 0 }, shadow: false, parts: [{ kind: 'cylinder', pos: [0, 0.04, 0], scale: [0.01, 0.08, 0.01], color: C.ink }, { kind: 'sphere', pos: [0, 0.09, 0], scale: 0.025, color: C.neonBlue, glow: C.neonBlue }] });
  if (md.eye) out.push({ kind: 'compound', at: { x: 0, y: h * 0.78, z: h * 0.32 }, shadow: false, parts: [{ kind: 'sphere', pos: [0, 0, 0], scale: [0.09, 0.09, 0.05], color: C.white }, { kind: 'sphere', pos: [0, 0, 0.02], scale: [0.04, 0.04, 0.03], color: C.ink }] });
  return out;
}

export function createRoster(THREE, { people, assets, build = null, nav, flash, rail = { offset: 0 }, rnd = Math.random }) {
  const group = new THREE.Group(); group.name = 'roster:models';
  const groups = new Map();
  let now = 0;   // 最近一次 update 的 t（home() 讓 ride 成員瞬間上車要用）

  const pause = () => 0.5 + rnd();
  // 成員照哪份宣告過日常：hold 中先照待套用的（劇本 spawnHeld 出來的人回家要回新家）
  const current = g => (g.held && g.pending) || g.spec;

  // ── 家的位置 ──
  function wanderHome(spec, i) {
    const h = spec.home, at = Array.isArray(h.at) ? h.at[i % h.at.length] : (h.at ?? spec.at);
    return { at, r: h.r ?? 0.5 };
  }
  function spotOf(spec, i) {
    const spots = spec.home?.kind === 'stand' ? spec.home.spots : null;
    return spots?.length ? spots[i % spots.length] : { ...spec.at, yaw: 0 };
  }
  // 車頂座位：沿車廂前進方向（yaw）偏移，y 抬到車頂
  function seat(h, i, t) {
    const seats = SEATS[h.cars] ?? SEATS[3], [car, off] = seats[i % seats.length];
    const p = trainPose(t + (rail?.offset ?? 0), car, { speed: h.speed });
    return { x: p.x + Math.sin(p.yaw) * off, y: p.y + RIDE_Y, z: p.z + Math.cos(p.yaw) * off, yaw: p.yaw };
  }
  function homePose(spec, i) {
    const h = spec.home ?? {};
    if (h.kind === 'wander') { const { at, r } = wanderHome(spec, i); return nav.wander(at, r); }
    if (h.kind === 'ride') return seat(h, i, now);
    return spotOf(spec, i);
  }

  // ── 把成員的 pos／yaw／walking／hidden 寫到小人或模型上 ──
  function place(m) {
    if (m.walker) m.walker.setPose({ x: m.pos.x, y: m.hidden ? BELOW : m.pos.y, z: m.pos.z, yaw: m.yaw, walking: m.walking });
    if (m.holder) {
      m.holder.position.set(m.pos.x, m.pos.y, m.pos.z); m.holder.rotation.y = m.yaw; m.holder.visible = !m.hidden;
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
    if (build) for (const s of extraSpecs(md)) { const p = build(s); m.extras.push(p); m.holder.add(p.object); }
  }

  function spawn(g, spec, i, p, mode = 'home') {
    const kind = spec.model ? 'model' : 'people', scale = spec.scale ?? 1;
    const m = {
      key: g.key, i, kind, pos: { x: p.x, y: p.y ?? nav.groundY(p.x, p.z), z: p.z }, yaw: p.yaw ?? 0,
      speed: spec.speed ?? WALK_SPEED[kind], headY: (kind === 'model' ? HEAD_Y.model * spec.model.h / MODEL_H : HEAD_Y.people) * scale,
      mode, walking: false, hidden: false, trip: null, rest: pause(),
    };
    m.head = () => ({ x: m.pos.x, y: m.pos.y + m.headY, z: m.pos.z });
    if (kind === 'people') {
      m.walker = people.spawn({ controlled: true, shirt: spec.shirt, accessory: accOf(spec, i), scale });
    } else {
      const md = spec.model; m.extras = []; m.dress = md;
      assets.spawn(md.path, { h: md.h * scale, anim: md.anim, tint: md.tint, glow: md.glow, parent: group }).then(holder => {
        if (m.gone) { assets.release(holder); return; }   // 模型到之前就被退掉（或 RESET）了
        m.holder = holder; dress(m, m.dress); place(m);
      }).catch(err => console.warn('名冊模型載入失敗', md.path, err));
    }
    place(m); flash.at(m.pos);
    return m;
  }
  function destroy(m) {
    m.gone = true; m.walker?.remove();
    if (m.holder) { dress(m, {}); assets.release(m.holder); }
  }

  // 依宣告調整一個成員的配件（people：小人配件；模型：天線／眼睛）；有換就閃白光，回傳有沒有換
  function restyle(m, spec, i) {
    m.speed = spec.speed ?? WALK_SPEED[m.kind];
    if (m.walker) { const acc = accOf(spec, i); if (m.walker.accessory === acc) return false; accessory(m, acc); return true; }
    if (spec.model && look(m.dress) !== look(spec.model)) { dress(m, spec.model); flash.at(m.pos); return true; }
    if (spec.model) m.dress = spec.model;
    return false;
  }

  // 套用一份宣告：少的（最後面的先）標成待退；留下的換配件、換家；from 搬人；還不夠就生
  function apply(g, spec) {
    const prev = g.spec; g.spec = spec; g.held = false; g.pending = null; g.retired = false;
    while (g.members.length > spec.n) g.leaving.push(g.members.pop());
    const moved = prev && !same(prev.home, spec.home);
    g.members.forEach((m, i) => { m.i = i; restyle(m, spec, i); if (moved && m.mode === 'home') home(m); });   // 劇本手上的人不搶
    const src = spec.from && spec.from !== g.key ? groups.get(spec.from) : null;
    while (src && g.members.length < spec.n && (src.leaving.length || src.members.length)) {
      const m = src.leaving.length ? src.leaving.pop() : src.members.pop();
      m.key = g.key; m.i = g.members.length; m.trip = null; m.rest = 0; g.members.push(m);
      if (!restyle(m, spec, m.i)) flash.at(m.pos);   // 換身分一定閃一下
    }
    while (g.members.length < spec.n) { const i = g.members.length; g.members.push(spawn(g, spec, i, homePose(spec, i))); }
  }

  function declare(key, spec, { hold = false } = {}) {
    let g = groups.get(key);
    if (!g) { g = { key, spec: null, members: [], leaving: [], held: false, pending: null, retired: false }; groups.set(key, g); }
    if (!g.retired && same(g.held ? g.pending : g.spec, spec)) return;
    if (hold) { g.held = true; g.pending = spec; g.retired = false; return; }
    apply(g, spec);
  }

  function flush() {
    for (const [key, g] of groups) {
      for (const m of g.leaving) { flash.at(m.pos); destroy(m); }
      g.leaving = [];
      if (g.retired && !g.held && !g.members.length) groups.delete(key);
    }
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

  function claim(m) { m.mode = 'script'; m.trip = null; m.rest = 0; }
  function home(m) {
    m.mode = 'home'; m.trip = null; m.rest = 0;   // wander：下一幀就挑新目標；stand：下一幀開始走回 spot
    const g = groups.get(m.key), spec = g && current(g);
    if (spec?.home?.kind === 'ride') setPose(m, { ...seat(spec.home, m.i, now), walking: false });
  }
  function accessory(m, acc) { if (!m.walker) return; m.walker.setAccessory(acc); flash.at(m.pos); }
  function hide(m) { m.hidden = true; place(m); }
  function show(m) { m.hidden = false; place(m); }

  function snap() {
    for (const g of groups.values()) {
      const spec = current(g); if (!spec) continue;
      for (const m of g.members) if (m.mode === 'script') { m.mode = 'home'; m.trip = null; m.rest = pause(); m.hidden = false; setPose(m, { ...homePose(spec, m.i), walking: false }); }
    }
    syncAll();
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
    if (m.trip) { walk(m, dt); return; }
    if (h.kind === 'wander') {
      if ((m.rest -= dt) > 0) return;
      const { at, r } = wanderHome(spec, m.i);
      go(m, nav.route(m.pos, nav.wander(at, r)));
      if (!m.trip) m.rest = pause();
      return;
    }
    const spot = spotOf(spec, m.i);
    if (Math.hypot(spot.x - m.pos.x, spot.z - m.pos.z) <= ARRIVE) { setPose(m, { ...spot, yaw: spot.yaw ?? m.yaw, walking: false }); return; }
    const path = nav.route(m.pos, spot), end = path.at(-1);
    if (end.x !== spot.x || end.z !== spot.z) path.push({ x: spot.x, y: spot.y ?? nav.groundY(spot.x, spot.z), z: spot.z });   // spot 可能在走路格外（屋頂、footprint 裡）
    go(m, path);
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
          if (spec.model?.wave) m.holder.rotation.z = Math.sin(t * 3) * 0.15;
        }
      }
    }
    nav.separate(moving, dt);   // 只推日常走動的人（劇本手上的主角不被推歪）
    for (const m of moving) place(m);
  }

  function reset() {
    for (const g of groups.values()) for (const m of [...g.members, ...g.leaving]) destroy(m);
    groups.clear();
  }

  return {
    group, declare, flush, retire, sync, syncAll, spawnHeld, claim, home, setPose, accessory, hide, show, snap, update, reset,
    members: key => [...(groups.get(key)?.members ?? [])],
    nearest(key, p) {
      let best = null, bestD = Infinity;
      for (const m of groups.get(key)?.members ?? []) { const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bestD) { bestD = d; best = m; } }
      return best;
    },
    get count() { let n = 0; for (const g of groups.values()) n += g.members.length; return n; },
    keys: () => [...groups.keys()],
  };
}
