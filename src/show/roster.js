// 名冊：島上會一直留著的角色（小孩、工程師、老鼠…）。升級時是「同一批人」走過去、換配件、換身分，不會重生。
// 每個鍵一個 group { key, spec, members, leaving, held, pending, retired }：
//   leaving：待退的人，等 flush() 才真的退（stage 依模組順序 declare，from 的目標名冊可能晚一步才來搬人）
//   held／pending：hold 住的宣告，等 sync() 才套用；pending 為 null 表示「hold 中被 retire，等 sync 再退」
// 成員日常（mode 'home'）：wander 在家附近隨機走走停停、stand 走回自己的 spot、ride 坐在列車車頂、
//   path 沿手畫的折線來回（不走尋路；起點依 i / n 錯開；折線先 nav.ground 貼地，過拱橋不陷進橋面）、follow 跟在另一個名冊最近的成員旁邊。
// 'script' 模式的成員日常不碰，由劇本 setPose；home() 或 snap() 才回日常。藏起來（hidden，躲進門裡）的人不過日常、停在門口。
// 衛星島上的 wander（不在主島走路格上）改成繞 ringPath(at, r) 走；stand 帶 fidget（'wave'／'jump'）的小人站定時每 3 秒做一次 0.6 秒的小動作
// （老闆搖杯）；stand 帶 rescue 的 spot 在走路格外就站到最近的可走點。不認得的 home 先當成站在 spec.at。
// setFocus(cells)（§13.4 背景減量）：演出中只有家在焦點格裡的人做日常（wander 挑新目標、繞圈、沿折線走、stand 小動作），
//   path 成員只要折線經過焦點格就照走（整條路都不在鏡頭裡才停）；其他人走完手上這一趟就站著；劇本手上的人、走回站位的人照樣動；ride、follow 不受限。null = 全部恢復。
// 進場（§13.2）：新成員出現在入口點（home.entry，陣列依 i 輪流；沒給就用家所在格子邊上離家最遠、走得到的點；入口被擋就用最近的可走點），
//   在背景走回家（arriving：wander 走到第一個散步點、path 走到自己錯開的那一點、stand 走回 spot），焦點不在這格也照走、不閃；
//   家不在主島走路格上（衛星島、橋上）、ride 照舊直接在家出現。宣告的家搬了，留下來的人一樣走過去，不重生。
// 退場（計畫 3.8 R9）：人數變少或零件拿掉而退的人（沒被 from 搬走、沒藏起來）flush 後走回入口，到了才拿掉；
//   走出去的人不算成員（members／nearest／count 都看不到），也不再歸劇本管（claim／home／setPose 對他不算數）。
//   還沒走到，同一個鍵又要補人 → 把他叫回來走回家，不從入口生新的。snap、reset 立刻拿掉。
// 走進來、走出去、家搬了走過去都是有目的的走路，用走路速度（小人 1.6、老鼠 2.0）；日常散步、走回站位仍是 WANDER_SPEED。
// 站著的 stand 成員彼此 < 兩人半徑相加（m.radius：小人 0.125、模型照高度，2026-10-28）→ nav.separateStanding 沿 x 錯開（改 m.pos、不改 spot；每幀最多滑走路速度 × dt，
//   站定後就留在錯開的位置，不走回 spot）
// 不在焦點也不疊著（final review）：休息中的 wander 成員、焦點外停下的 path 成員離別人（任何露出來的成員）< 0.25 就不停——
//   wander 馬上走下一趟、path 沿路接著走，走到不擠了才停。
// 不瞬移（final review）：日常、退場中的人每幀最多移動自己的走路速度 × dt（nav.separate 的推擠、開始／停下走路時推擠突然消失，
//   都是滑過去的，不會一幀跳 0.3–0.5）；劇本手上的人、ride、藏起來的人不限
// 不穿牆（§14.1）：footprint 一變（建築長出來），走到一半的人從現在的位置重新找路；推擠、追游標會切進 footprint 的那一幀不動；
//   閒晃的人站在走路格外（建築長在身上、劇本把人放在門裡）馬上走出來
import { trainPose, RIDE_Y } from '../actors/token.js';
import { C } from '../actors/palette.js';
import { cellAt, worldToAxial } from '../scene/hex.js';
import { ringPath } from '../scene/people.js';
import { createPathCursor, measurePath, locateOnPath } from '../scene/path.js';
import { SEPARATION, YIELD_CLEAR, yieldTarget, aheadOf, radiusOf } from './nav.js';

export const WALK_SPEED = { people: 1.6, model: 2.0 }, WANDER_SPEED = 0.5, HEAD_Y = { people: 0.5, model: 0.3 };
// ROUTE_TRIES：散步挑點時路線借道別格就重挑，最多幾次（wanderRoute）；LOW_MODELS：?quality=low 時一份模型名冊最多載幾個 glb（機器鼠軍團，裁決 R18）
const ROUTE_TRIES = 6, LOW_MODELS = 3;
export const SEATS = { 3: [[0, 0.12], [0, -0.12], [1, 0.12], [1, -0.12], [2, 0]], 5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] };   // [車廂, 沿車身偏移]
const MODEL_H = 0.2, ARRIVE = 0.05, BELOW = -5;   // HEAD_Y.model 是 h 0.2 的頭高；藏起來的小人放到海面下
const NEAR_PATH = 0.6;   // path 日常：路線的終點離折線上那一點這麼近才直接走上去（橋頭在走路格外，nearestWalkable 離它不到一格）
const FOLLOW_SLACK = 0.2, FOLLOW_REPLAN = 0.5;   // follow：離目標超過 dist + 0.2 才動身；目標走開 0.5 以上就重新規劃
const FOLLOW_DIRS = 24, FOLLOW_RETRY = 1;   // follow 的站位：目標周圍 dist、dist + 0.2 兩圈各 24 個方向挑；站著貼著別人又挑不到時 1 秒後再挑
const FIDGET_EVERY = 3, FIDGET_DUR = 0.6, FIDGET_SHIFT = 1.1;   // fidget：每 3 秒一次、一次 0.6 秒；第 i 個人錯開 1.1i 秒
const GLANCE = 0.6, GLANCE_TURN = 0.2;   // look 的 fidget：瞥過去的角度、轉過去／轉回來各 0.2 秒（同小人的 look 轉向）

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const accOf = (spec, i) => { const a = spec.accessory ?? 'none'; return Array.isArray(a) ? a[i % a.length] : a; };
const look = md => `${!!md?.antenna},${!!md?.eye},${!!md?.crown}`;   // 模型的「配件」：天線、獨眼、王冠
const body = md => JSON.stringify([md?.path, md?.h, md?.anim, md?.tint, md?.glow]);   // 模型本體：變了就換一個 holder
// path 日常：第 s 公尺的位置、離 p 最近的那一點在第幾公尺（P 是 pathOf 貼地後的折線）
const pointAt = (P, s) => locateOnPath(P.path, P.lens, s, P.loop);
// 折線經過哪些格子（頂點與每段中點的軸座標；同一條折線只算一次）
const cellsOfPath = new WeakMap();
function pathCells(h) {
  let cells = cellsOfPath.get(h.path);
  if (!cells) {
    const P = h.path, pts = [...P];
    for (let k = 0; k < P.length - (h.loop ? 0 : 1); k++) { const a = P[k], b = P[(k + 1) % P.length]; pts.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }); }
    const keys = new Set(pts.map(p => worldToAxial(p.x, p.z).join(',')));
    cells = [...keys].map(k => k.split(',').map(Number));
    cellsOfPath.set(h.path, cells);
  }
  return cells;
}
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
// 身體半徑（分離距離＝兩人半徑相加，nav.separate／separateStanding；2026-10-28 錄影修正）：小人 0.125（人對人照舊 0.25，長高的小孩也一樣）；
// 模型照高度 0.65 × h（含 scale），夾在 0.12–0.35——老鼠 h 0.2 → 0.13、變異鼠 h 0.5 → 0.325
export const PEOPLE_R = 0.125;
const radiusFor = spec => (spec.model ? Math.min(0.35, Math.max(0.12, 0.65 * spec.model.h * (spec.scale ?? 1))) : PEOPLE_R);

// 模型身上的小配件（從 rat.js 的 builders.rats 搬來；站頂的王冠鼠零件也用）：機器鼠天線、變異鼠的大眼睛、
// 老鼠 Lv5 的王冠（金色圈＋四個尖，照模型高度縮放，戴在頭頂偏前）
export const CROWN_GOLD = 0xe8c547;
export function modelExtras(md, h) {
  const out = [], k = h / MODEL_H;
  if (md.crown) out.push({ kind: 'compound', at: { x: 0, y: h * 0.86, z: h * 0.2 }, shadow: false, parts: [
    { kind: 'cylinder', pos: [0, 0.02 * k, 0], scale: [0.09 * k, 0.04 * k, 0.09 * k], color: CROWN_GOLD },
    ...[0, 1, 2, 3].map(i => { const a = i * Math.PI / 2 + Math.PI / 4; return { kind: 'cone', pos: [Math.cos(a) * 0.035 * k, 0.06 * k, Math.sin(a) * 0.035 * k], scale: [0.025 * k, 0.05 * k, 0.025 * k], color: CROWN_GOLD }; }),
  ] });
  if (md.antenna) out.push({ kind: 'compound', at: { x: 0, y: h, z: 0 }, shadow: false, parts: [{ kind: 'cylinder', pos: [0, 0.04, 0], scale: [0.01, 0.08, 0.01], color: C.ink }, { kind: 'sphere', pos: [0, 0.09, 0], scale: 0.025, color: C.neonBlue, glow: C.neonBlue }] });
  if (md.eye) out.push({ kind: 'compound', at: { x: 0, y: h * 0.78, z: h * 0.32 }, shadow: false, parts: [{ kind: 'sphere', pos: [0, 0, 0], scale: [0.09, 0.09, 0.05], color: C.white }, { kind: 'sphere', pos: [0, 0, 0.02], scale: [0.04, 0.04, 0.03], color: C.ink }] });
  return out;
}

// blink：show/blink.js 的閃白（換配件、換模型、換身分時閃一下；新生的、退場的不閃，§13.2）
export function createRoster(THREE, { people, assets, build = null, nav, blink = null, rail = { offset: 0 }, rnd = Math.random, quality = 'high' }) {
  const group = new THREE.Group(); group.name = 'roster:models';
  const groups = new Map();
  const fresh = new Set();   // 上次 flush 之後才生出來的人：換身分不先搬他們（§5.2 同一個小人原地換）
  let exits = [];   // 走回入口、到了就拿掉的人（R9）
  let now = 0;   // 最近一次 update 的 t（home() 讓 ride 成員瞬間上車要用）
  let planned = nav.version;   // 走到一半的路是照哪一版 footprint 規劃的（建築長出來就重新規劃，§14.1）
  let focus = null;   // 焦點格 [[q, r], …]；null = 全部的人都做日常

  const pause = () => 0.5 + rnd();
  // path 日常的折線：手畫的點 y 是格面，過拱橋那一段直線內插會陷進橋面——先 nav.ground 貼地（補點、y 換成 groundY），
  // 每條折線算一次（同一條 ROAD／ENGINEER_ROUTE 每幀都要問）；回 { path（貼地後）, loop, lens, total }
  const grounded = new WeakMap();
  function pathOf(h) {
    const loop = !!h.loop, hit = grounded.get(h.path); if (hit?.loop === loop) return hit;
    const path = nav.ground(h.path, { loop }), lens = measurePath(path, loop), P = { path, loop, lens, total: lens.at(-1) };
    grounded.set(h.path, P);
    return P;
  }
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
    const p = trainPose(t + (rail?.offset ?? 0), car, { speed: h.speed, trip: rail?.trip });
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
  // 走進來的目的地：wander 看散步中心、path 看自己錯開的那一點、follow 看 spec.at、其餘看 spot
  function arrivalOf(spec, i) {
    const h = spec.home ?? {};
    if (h.kind === 'wander') return wanderHome(spec, i).at;
    if (h.kind === 'path') { const P = pathOf(h); return pointAt(P, P.total * i / Math.max(1, spec.n)); }
    if (h.kind === 'follow') return spec.at;
    return spotOf(spec, i);
  }
  // 入口點（§13.2）：家不在主島走路格上（衛星島、橋上）、ride 回 null＝照舊直接在家出現
  function entryOf(spec, i) {
    const h = spec.home ?? {};
    if (h.kind === 'ride') return null;
    const goal = arrivalOf(spec, i), cell = cellAt(goal.x, goal.z); if (!cell) return null;
    if (h.entry) {
      const e = Array.isArray(h.entry) ? h.entry[i % h.entry.length] : h.entry;
      return nav.walkable(e.x, e.z) ? { x: e.x, y: nav.groundY(e.x, e.z), z: e.z } : nav.nearestWalkable(e);
    }
    return nav.edgePoint(cell, goal);
  }

  // ── 把成員的 pos／yaw／walking／hidden 寫到小人或模型上 ──
  function place(m) {
    const gone = m.hidden;
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
    if (build) for (const s of modelExtras(md, md.h * m.scale)) { const p = build(s); m.extras.push(p); m.holder.add(p.object); }
  }

  // 換裝閃白（§13.2）：小人整個實例閃白；模型閃 holder——換了模型、新 holder 還沒到就記著，到了再閃
  function glint(m) {
    if (!blink) return;
    if (m.walker) blink.walker(m.walker);
    else if (m.holder) blink.part(m.holder);
    else m.glint = true;
  }

  // 載入模型 holder；換過模型（gen 變了）或成員已退，晚到的 holder 直接放掉
  function load(m, md) {
    const gen = m.gen = (m.gen ?? 0) + 1;
    if (quality === 'low' && m.i >= LOW_MODELS) return;   // ?quality=low：一份名冊最多 LOW_MODELS 個模型，其餘不畫（裁決 R18）
    assets.spawn(md.path, { h: md.h * m.scale, anim: md.anim, tint: md.tint, glow: md.glow, parent: group }).then(holder => {
      if (m.gone || m.gen !== gen) { assets.release(holder); return; }
      m.holder = holder; dress(m, m.dress); place(m);
      if (m.glint) { m.glint = false; blink?.part(holder); }
    }).catch(err => console.warn('名冊模型載入失敗', md.path, err));
  }
  function remodel(m, spec) {
    if (m.holder) { blink?.stop(m.holder); dress(m, {}); assets.release(m.holder); m.holder = null; }
    m.scale = spec.scale ?? 1; m.dress = spec.model; m.headY = headYOf(spec); m.radius = radiusFor(spec); load(m, spec.model);
  }

  function spawn(g, spec, i, p, mode = 'home') {
    const kind = spec.model ? 'model' : 'people', scale = spec.scale ?? 1;
    const m = {
      key: g.key, i, kind, pos: { x: p.x, y: p.y ?? nav.groundY(p.x, p.z), z: p.z }, yaw: p.yaw ?? 0,
      speed: spec.speed ?? WALK_SPEED[kind], headY: headYOf(spec), radius: radiusFor(spec), mode, walking: false, hidden: false, trip: null, rest: pause(), scale,
      arriving: false, settled: null,   // arriving：正在走回家（焦點不限制）；settled：站定在哪個 spot
    };
    m.head = () => ({ x: m.pos.x, y: m.pos.y + m.headY, z: m.pos.z });
    if (kind === 'people') m.walker = people.spawn({ controlled: true, shirt: spec.shirt, accessory: accOf(spec, i), scale });
    else { m.extras = []; m.dress = spec.model; load(m, spec.model); }
    place(m); fresh.add(m);
    return m;
  }
  // 名冊自己補的人：同一個鍵還有人在走出去就叫最後走的那個回來（不閃、不重生）；
  // 否則從入口點出現、走回家（§13.2）；沒有入口的照舊在家出現
  function enter(g, spec, i) {
    const k = exits.findLastIndex(x => x.key === g.key);
    if (k >= 0) {
      const [m] = exits.splice(k, 1);
      m.mode = 'home'; m.i = i; m.trip = null; m.cursor = null; m.rest = 0; m.arriving = true; m.settled = null;
      restyle(m, spec, i); return m;
    }
    const e = entryOf(spec, i), m = spawn(g, spec, i, e ?? homePose(spec, i));
    if (e) { m.arriving = true; m.rest = 0; }
    return m;
  }
  function destroy(m) {
    m.gone = true;
    if (m.walker) { blink?.stop(m.walker); m.walker.remove(); }
    if (m.holder) { blink?.stop(m.holder); dress(m, {}); assets.release(m.holder); }
  }

  // 依宣告調整一個成員的外觀（people：配件、身高；模型：本體與天線／眼睛）；有換就閃白，回傳有沒有換
  function restyle(m, spec, i) {
    m.speed = spec.speed ?? WALK_SPEED[m.kind];
    if (m.walker) {
      // people：配件或身高（鮮奶 Lv3 長高 1.3）變了就原地換，頭頂跟著抬高
      const acc = accOf(spec, i), scale = spec.scale ?? 1;
      if (m.walker.accessory === acc && m.walker.scale === scale) return false;
      if (m.walker.accessory !== acc) m.walker.setAccessory(acc);
      m.walker.scale = m.scale = scale; m.headY = headYOf(spec);
      glint(m); return true;
    }
    const md = spec.model; if (!md) return false;
    if (body(m.dress) !== body(md) || (spec.scale ?? 1) !== m.scale) remodel(m, spec);
    else if (look(m.dress) !== look(md)) dress(m, md);
    else { m.dress = md; return false; }
    glint(m); return true;
  }

  // 套用一份宣告：少的（最後面的先）標成待退；留下的換配件、換家；from 搬人；還不夠就生
  function apply(g, spec) {
    const prev = g.spec; g.spec = spec; g.held = false; g.pending = null; g.retired = false;
    while (g.members.length > spec.n) g.leaving.push(g.members.pop());
    const moved = prev && !same(prev.home, spec.home);
    // 家搬了：留下來的人走過去（當成走回家：走路速度、焦點不限制）；劇本手上的人不搶
    g.members.forEach((m, i) => { m.i = i; restyle(m, spec, i); if (moved && m.mode === 'home') { home(m); m.arriving = spec.home?.kind !== 'ride'; } });
    const src = spec.from && spec.from !== g.key ? groups.get(spec.from) : null;
    while (src && g.members.length < spec.n && (src.leaving.length || src.members.length)) {
      const m = src.leaving.length ? src.leaving.pop() : take(src);
      m.key = g.key; m.i = g.members.length; m.trip = null; m.cursor = null; m.rest = 0; g.members.push(m);
      if (!restyle(m, spec, m.i)) glint(m);   // 換身分一定閃一下
    }
    while (g.members.length < spec.n) g.members.push(enter(g, spec, g.members.length));
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
    for (const [key, g] of groups) {
      for (const m of g.leaving) depart(m, g.spec);   // 退場的人走回入口、不閃（R9）
      g.leaving = [];
      if (g.retired && !g.held && !g.members.length) { groups.delete(key); continue; }
      if (!g.retired && !g.held && g.spec) while (g.members.length < g.spec.n) g.members.push(enter(g, g.spec, g.members.length));
    }
    fresh.clear();
  }

  // 退場：藏起來的人（躲進門裡）、沒有入口（衛星島、ride）、走不到入口的直接拿掉；其他人走回入口（update 走到了才拿掉）
  function depart(m, spec) {
    const e = !m.hidden && spec ? entryOf(spec, m.i) : null;
    if (e) { still(m); m.mode = 'exit'; m.cursor = null; m.arriving = false; m.settled = null; go(m, nav.route(m.pos, e)); }
    if (m.trip) exits.push(m); else destroy(m);
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

  // 走出去的人（mode 'exit'）、已經拿掉的人不歸劇本：claim／home／setPose 不算數（劇本 once() 快取的人可能已經在退場）
  const out = m => m.mode === 'exit' || m.gone;
  function claim(m) { if (out(m)) return; still(m); m.mode = 'script'; m.trip = null; m.cursor = null; m.rest = 0; m.arriving = false; m.settled = null; }
  function home(m) {
    if (out(m)) return;
    m.mode = 'home'; m.trip = null; m.cursor = null; m.rest = 0; m.settled = null;   // wander：下一幀就挑新目標；stand：下一幀開始走回 spot
    const g = groups.get(m.key), spec = g && current(g);
    if (spec?.home?.kind === 'ride') setPose(m, { ...seat(spec.home, m.i, now), walking: false });
  }
  function accessory(m, acc) { if (!m.walker) return; m.walker.setAccessory(acc); glint(m); }
  function hide(m) { m.hidden = true; place(m); }
  function show(m) { m.hidden = false; place(m); }
  // 全部露出來：hidden 只在一回合裡有效（颱風登陸躲進門裡），下一回合開始、跳過、RESET 都收掉。
  // walk（下一回合開始，計畫 3.8 Task 6）：躲著的人從藏起來的地方（門口）出來、用走路速度走回家（不閃）；
  // 不帶 walk（跳過、snap）只露出來，snap 自己會讓每個人瞬間到家
  function showAll({ walk = false } = {}) {
    for (const g of groups.values()) for (const m of g.members) {
      if (!m.hidden) continue;
      show(m);
      if (!walk || m.mode !== 'home') continue;
      const kind = current(g)?.home?.kind;
      if (kind === 'ride') { home(m); continue; }
      m.trip = null; m.cursor = null; m.rest = 0; m.settled = null; m.arriving = true;
    }
  }

  // 跳過（§4.3 立刻到最終狀態）：先套用 hold 住的宣告，再讓每個人（劇本手上的、還在走的都算）瞬間到家、停下、露出來
  function snap() {
    syncAll();
    for (const m of exits) destroy(m);   // 走出去的人立刻拿掉
    exits = [];
    for (const g of groups.values()) {
      const spec = current(g); if (!spec) continue;
      for (const m of g.members) {
        m.mode = 'home'; m.trip = null; m.rest = pause(); m.hidden = false; m.glint = false; m.arriving = false; m.settled = null;   // 跳過：晚到的模型不再補閃
        m.cursor = null; setPose(m, { ...homePose(spec, m.i, m), walking: false });
      }
    }
  }

  // ── 日常 ──
  // 走進來、走出去用走路速度，日常散步用 WANDER_SPEED（出發時定好）；只有站在 footprint 裡的那一段例外（見 hurry）
  // offgrid：終點本來就在走路格外（屋頂、footprint 裡的站位、橋頭的折線），重新規劃時照樣走上去
  // 建築長在身上（人站在外擴後的 footprint 裡，或主島格上被 footprint 夾住、走不出去的夾縫，§14.1）：先用走路速度走出來
  // （閒晃的 0.5 要一秒多才走得出底座），一走到可走的地方就回到這趟原本的速度（trip.calm）。衛星島、屋頂、水上不算
  const caught = m => nav.inFootprint(m.pos.x, m.pos.z) || (!!cellAt(m.pos.x, m.pos.z) && !nav.walkable(m.pos.x, m.pos.z));
  const hurry = (m, speed) => { if (m.trip && caught(m) && m.speed > speed) { m.trip.calm = speed; m.trip.speed = m.speed; } };
  function go(m, path) {
    const last = path.at(-1), cursor = createPathCursor(path, { loop: false }), speed = m.arriving || m.mode === 'exit' ? m.speed : WANDER_SPEED;
    m.trip = path.length > 1 && cursor.total > 0 ? { cursor, left: cursor.total, last, speed, offgrid: !nav.walkable(last.x, last.z) } : null;
    hurry(m, speed);
  }
  // footprint 變了（建築長出來、拿掉）：走到一半的人從現在的位置重新找路到同一個終點，不照舊路穿過新建築
  function replan(m) {
    const { last, speed, calm, offgrid, goal, spot } = m.trip, path = nav.route(m.pos, last), end = path.at(-1);
    if (offgrid && (end.x !== last.x || end.z !== last.z)) path.push(last);
    go(m, path);
    if (m.trip) { m.trip.speed = calm ?? speed; delete m.trip.calm; hurry(m, m.trip.speed); if (goal) m.trip.goal = goal; if (spot) m.trip.spot = spot; }
  }
  function walk(m, dt) {
    const trip = m.trip;
    if (trip.calm !== undefined && !caught(m)) { trip.speed = trip.calm; delete trip.calm; }
    const ds = Math.min(trip.speed * dt, trip.left);
    trip.cursor.advance(ds); trip.left -= ds;
    // 走到底：開放路徑的游標會折返（yaw 翻面），所以直接停在終點、保留原本朝向。
    // 人被防穿牆擋在半路（游標自己走完了、人還離終點很遠）：不跳到終點（下一幀會被限速從牆裡拖過去），停在原地，下一趟從這裡重新找路
    if (trip.left <= 1e-9) {
      const blocked = Math.hypot(trip.last.x - m.pos.x, trip.last.z - m.pos.z) > trip.speed * dt + 2 * ARRIVE;
      m.trip = null; m.side = 0; m.yielding = null; m.rest = pause(); m.arriving = false; setPose(m, { ...(blocked ? m.pos : trip.last), yaw: m.yaw, walking: false }); return;
    }
    setPose(m, { ...sidestep(m, trip.cursor.locate(), trip.speed * dt), walking: true });
  }
  // 正面擦身（任務 12）：前方 YIELD_LOOK 內有人擋著（走著或站著都算）就往旁邊讓開再走過去（nav.yieldOffset），
  // 橫移每幀最多 trip.speed × dt（不瞬移），讓開的那一點走不到就慢慢收回路線上；過了就收回 0
  function sidestep(m, c, max) {
    const others = [];
    for (const g of groups.values()) for (const o of g.members) if (o !== m && !o.hidden && !o.gone) others.push(o);
    const at = side => ({ x: c.x - Math.cos(c.yaw) * side, z: c.z + Math.sin(c.yaw) * side });
    const toward = (a, b) => a + Math.max(-max, Math.min(max, b - a));
    // 遲滯：前方有人擋就記住他和要讓的量；沒人擋時，記住的那個人還沒落到身後 SEPARATION 以外就照樣讓著
    // 橋上（不在格子裡）不讓：橋面只有 0.5 寬，讓出去就踩到橋外，拱橋的高度也對不上
    const onBridge = !cellAt(c.x, c.z), t = onBridge ? null : yieldTarget(c, c.yaw, others.map(o => ({ x: o.pos.x, z: o.pos.z, r: radiusOf(o) })), radiusOf(m));
    if (onBridge) m.yielding = null;
    else if (t) m.yielding = { who: others[t.index], side: t.side };
    else if (m.yielding) { const w = m.yielding.who; if (w.gone || w.hidden || aheadOf(c, c.yaw, w.pos) < -SEPARATION) m.yielding = null; }
    let side = toward(m.side ?? 0, m.yielding?.side ?? 0), p = at(side);
    if (side && !nav.passable(p.x, p.z)) { side = toward(m.side ?? 0, 0); p = at(side); if (!nav.passable(p.x, p.z)) { side = 0; p = c; } }
    m.side = side;
    return side ? { ...c, x: p.x, y: nav.groundY(p.x, p.z), z: p.z } : c;
  }
  // 家在焦點格裡嗎：wander 看家的中心、stand 看站位、path 看折線經過的任何一格（軸座標，衛星島也算一格）
  const hit = ([q, r]) => focus.some(c => c[0] === q && c[1] === r);
  function inFocus(m, spec) {
    if (!focus) return true;
    const h = spec.home ?? {};
    if (h.kind === 'path') return pathCells(h).some(hit);
    const p = h.kind === 'wander' ? wanderHome(spec, m.i).at : spotOf(spec, m.i);
    return hit(worldToAxial(p.x, p.z));
  }
  // 不在焦點：停在原地（沿線走的游標留著，恢復時接著走）
  function halt(m) { if (m.walking) setPose(m, { ...m.pos, walking: false }); }
  // 離其他露出來的成員（任何名冊、任何模式）< 兩人半徑相加：不在焦點也不在這裡停（final review）
  function crowded(m) {
    for (const g of groups.values()) for (const o of g.members) if (o !== m && !o.hidden && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < radiusOf(m) + radiusOf(o)) return true;
    return false;
  }

  // 散步路線：人在家那格裡時，不挑要借道別格（過橋繞去鄰格再回來）才走得到的點——家那格被建築切成兩半時只在自己這半邊走
  // （人數預算，裁決 R16：路過的人不擠爆別格）。第一個點就好的話跟以前一樣只抽一次亂數；試 ROUTE_TRIES 次都借道就原地休息
  // 也不挑別人身邊（< 兩人半徑相加 + 0.05，人對人 YIELD_CLEAR）的點：走過去停在人家旁邊就是貼著人站（任務 12，偵防師不變式）
  function wanderRoute(m, at, r) {
    const home = cellAt(at.x, at.z), here = cellAt(m.pos.x, m.pos.z);
    const inside = route => route.every(p => { const c = cellAt(p.x, p.z); return c && c[0] === home[0] && c[1] === home[1]; });
    if (!home || !here || here[0] !== home[0] || here[1] !== home[1]) return nav.route(m.pos, nav.wander(at, r));
    const clear = p => { for (const g of groups.values()) for (const o of g.members) if (o !== m && !o.hidden && !o.gone && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < radiusOf(m) + radiusOf(o) + YIELD_CLEAR - SEPARATION) return false; return true; };
    let fallback = null;   // 家裡擠到挑不到空位：走到第一個不借道的點（不在原地卡住，走進來的第一趟一定進得來）
    for (let k = 0; k < ROUTE_TRIES; k++) {
      const route = nav.route(m.pos, nav.wander(at, r)); if (!inside(route)) continue;
      if (clear(route.at(-1))) return route;
      fallback ??= route;
    }
    return fallback ?? [{ ...m.pos }];
  }

  function idle(m, spec, dt, t) {
    const h = spec.home ?? {};
    if (h.kind === 'ride') { setPose(m, { ...seat(h, m.i, t), walking: false }); return; }
    if (h.kind === 'follow') { follow(m, spec, dt); return; }
    const ring = h.kind === 'wander' ? ringHome(spec, m.i) : null;
    if (h.kind === 'path' || ring) { if (m.trip || m.arriving || inFocus(m, spec) || crowded(m)) onPath(m, ring ?? h, dt, spec); else halt(m); return; }
    if (m.trip) { walk(m, dt); return; }
    if (h.kind === 'wander') {
      // 走進來的第一趟、擠著別人、站在走路格外（建築長在身上、劇本放在門裡）時不等、不看焦點
      if (!m.arriving && !crowded(m) && nav.walkable(m.pos.x, m.pos.z) && (!inFocus(m, spec) || (m.rest -= dt) > 0)) return;
      const { at, r } = wanderHome(spec, m.i);
      go(m, wanderRoute(m, at, r));
      if (!m.trip) { m.rest = pause(); m.arriving = false; }
      return;
    }
    // 站定：到 spot 就站上去；之後被錯開（還是同一個 spot）也算站好，不走回去（多人擠一個 spot 時不會推開又走回來）
    const spot = spotOf(spec, m.i), d = Math.hypot(spot.x - m.pos.x, spot.z - m.pos.z);
    const kept = m.settled && m.settled.x === spot.x && m.settled.z === spot.z;
    if (d <= ARRIVE || kept) {
      m.arriving = false; if (!kept) m.settled = { x: spot.x, z: spot.z };
      setPose(m, { ...(kept ? m.pos : spot), yaw: spot.yaw ?? m.yaw, walking: false });
      if (inFocus(m, spec)) fidget(m, h, t, spot.yaw ?? m.yaw); else still(m);
      return;
    }
    m.settled = null; still(m);
    const path = nav.route(m.pos, spot), end = path.at(-1);
    if (end.x !== spot.x || end.z !== spot.z) path.push({ x: spot.x, y: spot.y ?? nav.groundY(spot.x, spot.z), z: spot.z });   // spot 可能在走路格外（屋頂、footprint 裡）
    go(m, path);
  }

  // fidget：站定的 people 小人每 FIDGET_EVERY 秒做一次 FIDGET_DUR 秒的 gesture，其餘時間不動。
  // 'look'（溫泉客偶爾看一下，§14.3）：往站位朝向 ± GLANCE 瞥一眼（每次換邊），開頭 GLANCE_TURN 秒轉過去、結尾 GLANCE_TURN 秒轉回來；
  // gesture 直接帶算好的 yaw、不帶 dur（小人照 yaw 轉好），結束時剛好回到站位朝向
  function fidget(m, h, t, yaw) {
    if (!h.fidget || !m.walker) return;
    const s = t + m.i * FIDGET_SHIFT, ph = ((s % FIDGET_EVERY) + FIDGET_EVERY) % FIDGET_EVERY, on = ph < FIDGET_DUR;
    let g = null;
    if (on && h.fidget === 'look') {
      const side = Math.floor(s / FIDGET_EVERY) % 2 ? -1 : 1, f = Math.min(1, ph / GLANCE_TURN, (FIDGET_DUR - ph) / GLANCE_TURN);
      g = { kind: 'look', k: ph / FIDGET_DUR, yaw: yaw + side * GLANCE * f };
    } else if (on) g = { kind: h.fidget, k: ph / FIDGET_DUR };
    m.walker.gesture = g; m.fidgeting = on;
  }
  // 離開站位或被劇本拿走：小動作立刻收掉（劇本自己的 gesture 不碰）
  function still(m) { if (m.fidgeting) { m.walker.gesture = null; m.fidgeting = false; } }

  // path：不在折線上（剛被劇本放回來）就先走到折線上最近的一點，再從那裡沿線來回
  // 剛走進來（arriving）的人走到自己錯開的那一點（i / n），不擠在離入口最近的地方
  function onPath(m, h, dt, spec) {
    if (m.cursor) { m.cursor.advance(h.speed * dt); setPose(m, { ...m.cursor.locate(), walking: true }); return; }
    if (m.trip) { walk(m, dt); if (m.trip) return; }
    const P = pathOf(h), s = m.arriving ? P.total * m.i / Math.max(1, spec.n) : nearestS(P, m.pos), p = pointAt(P, s);
    if (Math.hypot(p.x - m.pos.x, p.z - m.pos.z) > ARRIVE) {
      // 折線可能在走路格外（橋頭）：最後一段直接走上去（這一段也貼地，落在橋上不陷）——只在路線真的走到它旁邊時；
      // 找不到路（卡在死角裡，路線只有起點）就不畫一條直線穿牆過去
      const path = nav.route(m.pos, p), end = path.at(-1);
      if (Math.hypot(end.x - p.x, end.z - p.z) <= NEAR_PATH) path.push(...nav.ground([end, p]).slice(1));
      go(m, path); if (m.trip) return;
    }
    // 走不過去（卡在走不出去的死角裡，找不到路）也照樣接上游標，但標 offPath：每幀限速拉過去的那一段照樣不穿 footprint（擋住就停在牆外），
    // 拉到游標上才算回到折線（任務 7 審稿第 1 輪：卡住的機器鼠被直線拖過廠房）
    m.arriving = false; m.cursor = createPathCursor(P.path, { loop: P.loop, s }); m.offPath = Math.hypot(p.x - m.pos.x, p.z - m.pos.z) > ARRIVE;
  }
  // follow：走向另一個名冊最近的成員，停在 dist 外；目標走開 0.5 以上重新規劃；沒有目標就站著（剛走進來的先走到 spec.at）
  // 不擠（最終審查：偵防師貼著泡湯客停了整個結局）：動身時就在目標周圍挑一個離每個人 ≥ 兩人半徑相加的站位走過去
  //   （trip.spot：走到站位才停，不在 dist 內提早停）；站著時有人靠到兩人半徑相加內也重挑；挑不到就先站著，FOLLOW_RETRY 秒後再挑
  function follow(m, spec, dt) {
    const h = spec.home, dist = h.dist ?? 0.6, target = api.nearest(h.key, m.pos);
    if (!target && m.arriving) { if (!m.trip) go(m, nav.route(m.pos, spec.at)); if (m.trip) walk(m, dt); else m.arriving = false; return; }
    // 目標出現了：改跟目標（走進來那一趟沒有 goal）。走進來／從門口出來的那一趟跟上目標照樣用走路速度（物品 v2：偵防師躲進 101 門口，下一回合出來追老鼠）
    const coming = m.arriving;
    if (m.arriving) { m.arriving = false; m.trip = null; }
    if (!target) { if (m.trip || m.walking) { m.trip = null; setPose(m, { ...m.pos, walking: false }); } return; }
    const d = Math.hypot(target.pos.x - m.pos.x, target.pos.z - m.pos.z);
    if (m.trip && !m.trip.spot && d <= dist) { m.trip = null; setPose(m, { ...m.pos, walking: false }); }
    if (!m.trip && d <= dist + FOLLOW_SLACK) {
      if (!crowded(m) || (m.rest -= dt) > 0) return;
      const p = followSpot(m, target, dist); if (!p) { m.rest = FOLLOW_RETRY; return; }
      go(m, nav.route(m.pos, p)); if (!m.trip) { m.rest = FOLLOW_RETRY; return; }
      m.trip.goal = { ...target.pos }; m.trip.spot = true;
    }
    if (!m.trip || Math.hypot(target.pos.x - m.trip.goal.x, target.pos.z - m.trip.goal.z) > FOLLOW_REPLAN) {
      const p = followSpot(m, target, dist);   // 直接走去不擠的站位（不走到目標旁邊、站到別人身上才發現擠）；挑不到就照舊走向目標
      go(m, nav.route(m.pos, p ?? target.pos)); if (!m.trip) return;
      m.trip.goal = { ...target.pos }; m.trip.spot = !!p;
      if (coming) m.trip.speed = Math.max(m.trip.speed, m.speed);
    }
    walk(m, dt);
  }

  // follow 的站位：目標周圍 dist、dist + FOLLOW_SLACK 兩圈上可走、離每個露出來的成員 ≥ 兩人半徑相加、走得到的點
  function followSpot(m, target, dist) {
    const others = [...groups.values()].flatMap(g => g.members).filter(o => o !== m && !o.hidden);
    const rings = [dist, dist + FOLLOW_SLACK].map(r => Array.from({ length: FOLLOW_DIRS }, (_, k) => {
      const a = 2 * Math.PI * k / FOLLOW_DIRS; return { x: target.pos.x + Math.cos(a) * r, z: target.pos.z + Math.sin(a) * r };
    }).filter(p => nav.walkable(p.x, p.z) && others.every(o => Math.hypot(o.pos.x - p.x, o.pos.z - p.z) >= radiusOf(m) + radiusOf(o) + 0.02)));
    // 先挑 dist 那一圈（停在 dist 外，照原本的距離跟著），那一圈都擠才用外圈；同一圈裡挑離自己最近、走得到的
    for (const ring of rings) {
      ring.sort((a, b) => Math.hypot(a.x - m.pos.x, a.z - m.pos.z) - Math.hypot(b.x - m.pos.x, b.z - m.pos.z));
      for (const p of ring.slice(0, 3)) { const end = nav.route(m.pos, p).at(-1); if (Math.hypot(end.x - p.x, end.z - p.z) < ARRIVE) return { x: p.x, y: nav.groundY(p.x, p.z), z: p.z }; }
    }
    return null;
  }

  function update(dt, t) {
    now = t;
    if (nav.version !== planned) {
      planned = nav.version;
      for (const g of groups.values()) for (const m of g.members) if (m.trip && m.mode === 'home') replan(m);
      for (const m of exits) if (m.trip) replan(m);
    }
    // 躺平（最終章 §6：飛彈命中全島躺平比讚，「姿勢持續到標題卡」；最終審稿）：people.mood 是 'lie' 時日常走動的 people 小人
    // （home 模式、不是 ride、還有正要走回入口的人）整個停在原地——不散步、不走趟、不被推、不被錯開；名冊每個 people 成員都是
    // controlled（位置由這裡 setPose），people.js 自己不推路徑也擋不住，所以在這裡停。ride（跟著車走）、模型、藏起來的照舊；
    // 劇本手上的照拍演（命中劇本的群眾拍在換心情之前就演完了）。這裡每幀讀 people.mood、不存狀態：
    // 心情回 normal（RESET 經 app 的 showWorld、演出層 reset 的 world 拍）下一幀就接著走，roster.reset 也不用另外清
    const lying = people.mood === 'lie', frozen = (m, spec) => lying && !!m.walker && spec?.home?.kind !== 'ride';
    const moving = [], standing = [], was = [];   // was：[成員, 這幀開始的位置, 每幀最多移動多少]（不瞬移）
    // loose：這幀本來就可能走出走路格（沿手畫的折線、走向格外的終點、已經在格外）；還沒追上游標的 offPath 例外：只有已經在外擴 footprint 裡時才放行（讓他走出來）。
    // gap：loose 只是因為這幀開始時站在走路格的夾縫裡（walkable 假、passable 真：被推到柱子和牆之間）——這種人照樣不准切進外擴 footprint
    //   （2026-10-28 錄影修正量到：島民被推離路線後追游標，直線斜切過校門柱子的 PAD；沿折線、走向格外終點的人不算）
    const keep = (m, spec) => {
      if (spec?.home?.kind === 'ride') return;
      const free = !!(m.cursor || m.trip?.offgrid), loose = m.cursor && m.offPath ? !nav.passable(m.pos.x, m.pos.z) : free || !nav.walkable(m.pos.x, m.pos.z);
      was.push([m, { ...m.pos }, Math.max(m.speed, spec?.home?.speed ?? 0) * dt, loose, loose && !free && nav.passable(m.pos.x, m.pos.z)]);
    };
    for (const g of groups.values()) {
      const spec = current(g); if (!spec) continue;
      for (const m of g.members) {
        if (m.mode === 'home' && !m.hidden && !frozen(m, spec)) { keep(m, spec); idle(m, spec, dt, t); if (m.walking) moving.push(m); else if (m.settled) standing.push(m); }   // 藏起來的人（躲在門裡）不動、不推別人
        if (m.holder) {
          const mixer = m.holder.userData.mixer; if (mixer) mixer.timeScale = m.walking ? 1 : 0;
          // 揮手的模型（變異鼠）左右搖；劇本的 gesture 'wave'（m.waving）期間搖得大又快（對天揮手）
          m.holder.rotation.z = spec.model?.wave ? (m.waving ? Math.sin(t * 10) * 0.4 : Math.sin(t * 3) * 0.15) : 0;
        }
      }
    }
    // 走出去的人：走到入口就拿掉
    exits = exits.filter(m => { if (frozen(m, null)) return true; keep(m, null); if (m.trip) walk(m, dt); if (m.trip) { moving.push(m); return true; } destroy(m); return false; });
    // 只推日常走動的人（劇本手上的主角不被推歪）。走在路線上的人下一幀位置又從游標算（游標＋橫移 m.side），推開的那一截會被拉回來、
    // 兩個人斜著交會時就一直貼著走（2026-10-28 列車加大後 live 測試量到偵防師和島民並肩走 0.10）：推開的橫向分量記進 m.side，
    // 之後照 sidestep 的速度慢慢收回路線上。橋上不記（橋面只有 0.5 寬，同 sidestep 橋上不讓）
    const pushedFrom = moving.map(m => ({ x: m.pos.x, z: m.pos.z }));
    nav.separate(moving, dt);
    moving.forEach((m, i) => {
      const dx = m.pos.x - pushedFrom[i].x, dz = m.pos.z - pushedFrom[i].z;
      if ((!dx && !dz) || !m.trip || !cellAt(m.pos.x, m.pos.z)) return;
      m.side = Math.max(-YIELD_CLEAR, Math.min(YIELD_CLEAR, (m.side ?? 0) - dx * Math.cos(m.yaw) + dz * Math.sin(m.yaw)));
    });
    nav.separateStanding(standing, WALK_SPEED.people * dt);
    // 不瞬移：這幀的位移超過走路速度 × dt 就只走到那麼遠（推擠的位移下一幀接著滑；游標上的位置不變，下一幀照樣從游標算）。
    // 被推、被拉回游標的這一小段要是會切進 footprint（§14.1），這幀就站著不動（游標照走，下一幀再追上）。
    // 看的是 nav.passable（外擴後的 footprint、水），不是 walkable：路線會貼著外擴邊走過格點被擋住的夾縫，那不是牆
    for (const [m, p, max, loose, gap] of was) {
      if (m.gone || m.hidden || m.mode === 'script') continue;
      const dx = m.pos.x - p.x, dz = m.pos.z - p.z, d = Math.hypot(dx, dz);
      // 只走到一半時 y 不用兩點的直線內插（拱橋上那條弦會陷進橋面）：落在走路格上就貼那裡的地面
      if (d > max) { const k = max / d, x = p.x + dx * k, z = p.z + dz * k; m.pos = { x, y: nav.passable(x, z) ? nav.groundY(x, z) : p.y + (m.pos.y - p.y) * k, z }; }
      if ((!loose || gap) && !nav.passable(m.pos.x, m.pos.z)) m.pos = p;
      // 追上游標了：回到折線上，之後照手畫的線走（可以走到走路格外的橋頭）
      if (m.offPath && m.cursor) { const c = m.cursor.locate(); if (Math.hypot(c.x - m.pos.x, c.z - m.pos.z) <= 2 * ARRIVE) m.offPath = false; }
      place(m);
    }
  }

  function reset() {
    for (const g of groups.values()) for (const m of [...g.members, ...g.leaving]) destroy(m);
    for (const m of exits) destroy(m);
    groups.clear(); fresh.clear(); exits = []; focus = null;
  }
  function setFocus(cells) { focus = cells ? cells.map(c => [c[0], c[1]]) : null; }

  const api = {
    group, declare, flush, retire, sync, syncAll, spawnHeld, claim, home, setPose: (m, p) => { if (!out(m)) setPose(m, p); }, accessory, hide, show, showAll, snap, update, reset, setFocus,
    members: key => [...(groups.get(key)?.members ?? [])],
    // visible：藏起來的人（颱風登陸躲進門裡）不算
    nearest(key, p, { visible = false } = {}) {
      let best = null, bestD = Infinity;
      for (const m of groups.get(key)?.members ?? []) { if (visible && m.hidden) continue; const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bestD) { bestD = d; best = m; } }
      return best;
    },
    get count() { let n = 0; for (const g of groups.values()) n += g.members.length; return n; },
    keys: () => [...groups.keys()],
  };
  return api;
}
