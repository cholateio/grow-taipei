// 撲空（計畫 6「看得見的因果與離島三段」設計 §5；2026-10-29 回到 GROW 設計 §4.3 照用）。
// 拜訪（有原因的升級先演幫手走來敲門）2026-10-29 拿掉了（回到 GROW 設計 §4.2）：這個檔只剩撲空。
//
// 撲空（設計 §5，miss）：引擎的 wait 事件列出每個等不到幫手的物品（w.item）與它缺的幫手（w.for，照 ORDER）。一段撲空 =
//   [走到目標點, 失望 sigh SIGH 秒, 回日常]——沒有泡泡、沒有圖框（設計 §5、反目標：不用泡泡提示原因）。鏡頭由 turn.js 補（平移到代表那一格，跟走路一起演）。
//   代表 = 等待物品的 script.rep(s, ctx, w.for[0])（第三個參數是缺的幫手，鮮奶 Lv2 用它挑離幫手最近的島民），演到第一拍才找、找到就記住；
//   找不到、藏起來、在劇本手上、不在主島上 → 整段每一拍都跳過（0 秒）。
//   目標點（缺的幫手 = w.for[0]）：
//     還沒放（等級 0）→ 那個幫手錨點旁的空地：可走、離建築本身至少 MISS_CLEAR 公尺的點（從錨點往鏡頭側一圈一圈找；找不到退回 nearestWalkable）——
//       不管遠近一定往這裡走：路線 > MISS_WALK 秒就沿路走 MISS_WALK 秒、在路上失望（short）；走不過去就原地失望（here）。都面向空地（最終修正 1）；
//     放了但不夠高 → 那個建築這一級的門口 frontOf(visitSpot(幫手, 等級), r, nav)（visitSpot：各模組這一級建築的正面）：
//       只在門口那一格跟代表現在那一格同一格或相鄰、而且走得到、路線 ≤ MISS_WALK 秒才走；
//     否則（幫手放了但太遠、幫手是颱風、幫手這一級在離島上、主島上沒有 visitSpot）→ 走到自己門口 frontOf(visitSpot(物品, 現在的等級), r, nav)；
//     自己門口也超過 MISS_WALK 秒 → 往門口走 MISS_WALK 秒、在路上失望（short）；自己這一級沒有主島上的門口、走不過去 → 原地失望（here）。
//     撲空不換位置、不閃白。
//   失望之前面向目標（幫手的錨點／建築；原地的話面向缺的那個幫手的錨點）。回自己門口（door，含 short）的時候：缺的幫手放了、不是颱風
//   → 面向幫手的錨點（整支分支審稿 Important 1：嘆氣要指著缺的那個幫手，不指著自己的建築）；幫手是颱風 → 面向自己的建築。
//   每段 ≤ MISS_CAP 真實秒數（跟走路一起演的平移不另外算，物品之間的空拍由 turn.js 另外記在 mark 的 info.gap）：
//   MISS_WALK = MISS_CAP − SIGH − 0.2（幀的餘裕）。一回合最多 MISS_PER_TURN 段（turn.js：wait 事件的前兩個 waits，照 ORDER）。
import { B } from './beats.js';
import { frontOf, anchorWorld, cellOf } from '../actors/anchors.js';
import { cellAt, NEIGHBORS } from '../scene/hex.js';
import { PAD } from './nav.js';

export const SIGH = 1.0, MISS_CAP = 3, MISS_PER_TURN = 2;
export const MISS_WALK = MISS_CAP - SIGH - 0.2, MISS_CLEAR = 0.3;   // 撲空走路上限（秒）、空地離建築本身至少幾公尺
const REACH = 0.3;   // 路線的終點離目標點超過這麼多 = 走不過去（被 footprint 隔斷）

// 站在主島格上或橋上（坐在車頂的 ride、衛星島上的人不走過來）
const onIsland = (m, nav) => !!cellAt(m.pos.x, m.pos.z) || nav.walkable(m.pos.x, m.pos.z);
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// 路線上第 s 公尺的點（路線各段直線內插；高度照 nav 的地面）
function pointAt(route, s, nav) {
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1], b = route[k], d = Math.hypot(b.x - a.x, b.z - a.z);
    if (s <= d || k === route.length - 1) { const t = d > 1e-9 ? Math.min(1, s / d) : 1, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; return { x, y: nav.groundY(x, z), z }; }
    s -= d;
  }
  return { ...route[0] };
}

// 沿 route 走 MISS_WALK 秒那麼遠的點（short）：B.walk 會從代表現在的位置重新找路到這一點，那條路可能比 route 的前段長
// （格點 A* 繞的路不一樣）——量一次，超過上限就把點往回收 0.1 公尺再量，走路一定 ≤ MISS_WALK 秒
function cutAt(m, route, nav) {
  const cap = MISS_WALK * m.speed;
  for (let d = cap; d > 0; d -= 0.1) { const p = pointAt(route, d, nav); if (nav.routeLength(nav.route(m.pos, p)) <= cap) return p; }
  return { ...m.pos };
}

// 撲空（見檔頭）：w = { item, for }（引擎 wait 事件的一項）；s：turn.js 給劇本的 { lv, flags, … }；item／helper：等待物品、缺的幫手（w.for[0]）的模組。
// 回 [走過去, 失望, 回日常]；等待物品沒有代表劇本（或是颱風）→ []。
// 走過去那拍另外帶 ready(c)（找代表、定目標，第一次問就定案；回有沒有人要演）、cell(c)（代表現在那一格：turn.js 的平移目標）、
// goal()（定案的目標 { kind: 'lot' | 'spot' | 'door' | 'here', at, look, from, short }：測試看）
export function miss(w, s, ctx, { item, helper } = {}) {
  if (!item || item.id === 'typhoon' || !item.script?.rep) return [];
  const lvOf = id => s.lv?.[id] ?? 0;
  let asked = false, who = null, goal = null, inner = null, walked = false;
  // 某個模組第 n 級建築的正面（visitSpot；在主島上才算）
  const door = (mod, n, nav) => { const sp = n > 0 ? mod?.visitSpot?.(n, s) : null; return sp && cellAt(sp.x, sp.z) ? { to: frontOf(sp, sp.r, nav), look: sp } : null; };
  // 走得到、路線不超過 MISS_WALK 秒
  const reach = (m, to, nav) => {
    const route = nav.route(m.pos, to), end = route.at(-1);
    return !!end && Math.hypot(end.x - to.x, end.z - to.z) <= REACH && nav.routeLength(route) <= MISS_WALK * m.speed;
  };
  const ready = c => {
    if (asked) return !!who;
    asked = true;
    const m = item.script.rep(s, c, w.for?.[0]), nav = c.nav;   // 第三個參數：缺的幫手（鮮奶 Lv2 借離它錨點最近的島民）
    if (!m || m.hidden || m.gone || m.mode !== 'home' || !onIsland(m, nav)) return false;
    const here = cellAt(m.pos.x, m.pos.z) ?? cellOf(item.id);
    let pick = null, lot = null;
    if (helper && helper.id !== 'typhoon') {
      const n = lvOf(helper.id), at = anchorWorld(helper.id);
      if (n === 0) {
        // 還沒放：一定往那塊空地走（不看相鄰）——走路上限照 MISS_WALK 秒，走不到就沿路走那麼遠、在路上失望（short）；
        // 被 footprint 隔斷到不了就原地失望。都面向空地，缺幫手時不會面向自己的建築（最終修正 1：鮮奶 Lv2 等棒球）
        lot = at;
        const to = clearNear(at, nav), route = nav.route(m.pos, to), end = route.at(-1);
        if (end && Math.hypot(end.x - to.x, end.z - to.z) <= REACH) {
          const len = nav.routeLength(route), cap = MISS_WALK * m.speed;
          pick = len <= cap ? { kind: 'lot', to, look: at } : { kind: 'lot', to: cutAt(m, route, nav), look: at, short: true };
        }
      } else {
        const d = door(helper, n, nav), cell = d && cellAt(d.to.x, d.to.z);
        if (cell && near(cell, here) && reach(m, d.to, nav)) pick = { kind: 'spot', ...d };
      }
    }
    if (!pick && !lot) {
      // 自己門口：路線太長就走 MISS_WALK 秒那麼遠（往門口走、走不到門口就在路上失望；不換位置）。
      // 幫手放了（不是颱風）只是太遠：失望時面向幫手的錨點、不面向自己的建築（整支分支審稿 Important 1：淹水那局工程師在 HQ 門口要看著車站）
      const d = door(item, lvOf(item.id), nav), route = d && nav.route(m.pos, d.to), end = route?.at(-1);
      if (end && Math.hypot(end.x - d.to.x, end.z - d.to.z) <= REACH) {
        const len = nav.routeLength(route), cap = MISS_WALK * m.speed;
        const look = helper && helper.id !== 'typhoon' && lvOf(helper.id) > 0 ? anchorWorld(helper.id) : d.look;
        pick = len <= cap ? { kind: 'door', to: d.to, look } : { kind: 'door', to: cutAt(m, route, nav), look, short: true };
      }
    }
    if (!pick) pick = { kind: 'here', to: { ...m.pos }, look: helper && helper.id !== 'typhoon' ? anchorWorld(helper.id) : null };
    who = m; goal = { kind: pick.kind, at: { ...pick.to }, look: pick.look, from: { ...m.pos }, short: !!pick.short };
    c.roster.claim(m);   // 定案就拿到劇本手上：空拍、平移的時候站著等，不再散步走開
    inner = B.walk(m, pick.to);
    return true;
  };
  const walk = {
    kind: 'walk', estimate: () => MISS_WALK, ready, goal: () => goal,
    cell: c => (ready(c) ? cellAt(who.pos.x, who.pos.z) ?? { ...who.pos } : null),
    dur: c => (walked ? inner.dur(c) : 0),
    start(c) {
      walked = false;
      if (!ready(c)) return false;
      walked = inner.start(c) !== false;
      if (!walked) return false;
    },
    step(k, dt, c) { if (walked) inner.step(k, dt, c); },
    // 停下來面向目標（幫手的空地／建築、自己的門）
    end(c) {
      if (!who) return;
      if (walked) inner.end(c);
      const look = goal.look;
      if (look && Math.hypot(look.x - who.pos.x, look.z - who.pos.z) > 0.05) c.roster.setPose(who, { ...who.pos, yaw: yawTo(who.pos, look), walking: false });
    },
  };
  return [
    walk,
    B.gesture(() => who, 'sigh', SIGH),
    { kind: 'home', dur: 0, start(c) { if (who) c.roster.home(who, { hurry: true }); } },
  ];
}

const near = (a, b) => (a[0] === b[0] && a[1] === b[1]) || NEIGHBORS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);
// 錨點旁的空地：可走、四周 MISS_CLEAR 內沒有建築本身（外擴 PAD 的 footprint 往外再查 MISS_CLEAR − PAD）的點；
// 從錨點往鏡頭側（frontOf 的方向）一圈一圈找到 CLEAR_MAX，找不到退回 nearestWalkable
const CLEAR_STEP = 0.15, CLEAR_MAX = 1.2, CLEAR_DIRS = 16, CLEAR_RING = 12;
function clearNear(at, nav) {
  const f = frontOf(at, 1), a0 = Math.atan2(f.x - at.x, f.z - at.z), d = MISS_CLEAR - PAD;
  const ok = (x, z) => nav.walkable(x, z) && !nav.inFootprint(x, z)
    && Array.from({ length: CLEAR_RING }, (_, k) => 2 * Math.PI * k / CLEAR_RING).every(a => !nav.inFootprint(x + d * Math.sin(a), z + d * Math.cos(a)));
  for (let r = 0; r <= CLEAR_MAX + 1e-9; r += CLEAR_STEP) {
    for (let k = 0; k < (r ? CLEAR_DIRS : 1); k++) {
      const a = a0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 2 * Math.PI / CLEAR_DIRS, x = at.x + r * Math.sin(a), z = at.z + r * Math.cos(a);
      if (ok(x, z)) return { x, y: nav.groundY(x, z), z };
    }
  }
  return nav.nearestWalkable(at);
}
