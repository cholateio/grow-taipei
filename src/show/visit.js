// 拜訪（計畫 6「看得見的因果與離島三段」設計 §4）：有原因的升級（grow 事件的 via 非空）先演一段幫手走來互動，再演那一級自己的劇本。
// 一段拜訪 = [（要換位置的話）原處閃白, 走到拜訪點, together(敲門, 被升級物品的代表揮手), 幫手轉身要走時冒 ♥（不擋拍，裁決 R4）, 兩人回日常]：
//   幫手的代表 = via[0] 那個模組的 script.rep(s, ctx)，演到第一拍才找、找到就記住（同 turn.js 的 once）；找不到、藏起來（躲進門裡）、
//   在劇本手上（mode 'script'：同一回合別的劇本拿去用、還沒放回來——審稿重點 2：寧可略過，不半路搶人）、不在主島上（坐車頂、衛星島）、
//   走不過去、這回合這個幫手已經真的拜訪過 VISIT_MAX_PER_HELPER 次（quota，演到才算：略過的那幾段不算數）→ 整段每一拍都跳過（0 秒）。
//   拜訪點 = 被升級物品的 visitSpot(第幾級, s)（這一級的建築正面）；代表站在 frontOf(spot, r, nav)，面向建築敲門。
//   走路上限 VISIT_WALK 秒（裁決 R3）：路線比 VISIT_WALK × 走路速度長，就在原處閃白 BLINK 秒（裁決 R4：跟物品之間的空拍一起演）、換到路線上離終點剛好 VISIT_WALK 秒的那一點
//   （可能還在前一格、橋上）再閃白一下，走滿 VISIT_WALK 秒過去——至少 MIN_WALK 公尺真的走（設計 §4 第 2 步；
//   走路速度不加快，§6）。不靜靜地放下：每次換位置都閃白（同零件的閃白）。
//   被升級物品的代表在場（在拜訪點那一格、看得到、不在劇本手上）才轉身面向幫手揮手；不在場就只有敲門。
// 回日常：閃白換過位置、回家的路又超過 2 × VISIT_WALK 秒的幫手由名冊 leave 背景走回他出現的那一點、閃白、換回被叫來之前的地方再閃白、回日常
//   （不佔拍的時間，也不在日常裡橫越半個島穿過鼠窩）；其他的直接回日常（自己走回去）。
// 鏡頭由 turn.js 補：拜訪的第一拍跟平移到拜訪點那一格一起演（邊平移邊走進來）。
// 同一回合同一個幫手最多拜訪 VISIT_MAX_PER_HELPER 次（設計 §4 原本 3；裁決 R2：第三次重複，2，之後只演那一級的劇本）。
// 颱風不拜訪、也不被拜訪（天氣）：helper／target 是颱風就回 []（颱風的 rep、visitSpot 本來也是 null）。
//
// 撲空（設計 §5，miss）：引擎的 wait 事件列出每個等不到幫手的物品（w.item）與它缺的幫手（w.for，照 ORDER）。一段撲空 =
//   [走到目標點, 失望 sigh SIGH 秒, 回日常]——沒有泡泡、沒有圖框（設計 §5、反目標：不用泡泡提示原因）。鏡頭由 turn.js 補（平移到代表那一格，跟走路一起演）。
//   代表 = 等待物品的 script.rep(s, ctx)，演到第一拍才找、找到就記住；找不到、藏起來、在劇本手上、拜訪完正走回去（'away'——
//   他在背景還有一段路要走完，不半路叫住）、不在主島上 → 整段每一拍都跳過（0 秒）。
//   目標點（缺的幫手 = w.for[0]）：
//     還沒放（等級 0）→ 那個幫手錨點旁的空地：可走、離建築本身至少 MISS_CLEAR 公尺的點（從錨點往鏡頭側一圈一圈找；找不到退回 nearestWalkable）；
//     放了但不夠高 → 那個建築這一級的拜訪點正面 frontOf(visitSpot(幫手, 等級), r, nav)（跟拜訪站同一個位置）；
//     兩種都只在目標點那一格跟代表現在那一格同一格或相鄰、而且走得到、路線 ≤ MISS_WALK 秒才走；
//     否則（太遠、幫手是颱風、幫手這一級在離島上沒有拜訪點）→ 走到自己門口 frontOf(visitSpot(物品, 現在的等級), r, nav)；
//     自己門口也超過 MISS_WALK 秒 → 往門口走 MISS_WALK 秒、在路上失望（short）；自己這一級沒有主島上的門口、走不過去 → 原地失望（here）。
//     撲空不換位置、不閃白（只有拜訪才閃白叫人過來）。
//   失望之前面向目標（幫手的錨點／建築；原地的話面向缺的那個幫手的錨點）。
//   每段 ≤ MISS_CAP 真實秒數（跟走路一起演的平移不另外算，物品之間的空拍由 turn.js 另外記在 mark 的 info.gap）：
//   MISS_WALK = MISS_CAP − SIGH − 0.2（幀的餘裕）。一回合最多 MISS_PER_TURN 段（turn.js：wait 事件的前兩個 waits，照 ORDER）。
import { B, together, rate } from './beats.js';
import { frontOf, anchorWorld, cellOf } from '../actors/anchors.js';
import { cellAt, NEIGHBORS } from '../scene/hex.js';
import { BLINK } from './blink.js';
import { PAD } from './nav.js';

// VISIT_WALK：拜訪走進來的秒數上限。裁決 R10（計畫 6 最終審稿）：維持 1.5——via[0] 改對之後外星第 6 回合 59.97/60（R4 的 59.5 是預留的餘裕，上限 60 內）。
// 掃過 1.2–1.4：每個值都在 seed 21 或 23 的其中一個踩到不同的推擠情況（鼠窩、偵防師、變異鼠、外擴 footprint），只有 1.5 兩個種子都綠；
// 根本原因是走路的人兩兩互推只推一輪（nav.separate），多推幾輪的修法另案（設計 §11 R10 記了量到的那一群人）
export const VISIT_WALK = 1.5, VISIT_KNOCK = 0.8, VISIT_LOVE = 0.6, VISIT_MAX_PER_HELPER = 2, VISIT_CAP = 3.5;
export const SIGH = 1.0, MISS_CAP = 3, MISS_PER_TURN = 2;
export const MISS_WALK = MISS_CAP - SIGH - 0.2, MISS_CLEAR = 0.3;   // 撲空走路上限（秒）、空地離建築本身至少幾公尺
const REACH = 0.3;   // 路線的終點離拜訪點的站位超過這麼多 = 走不過去（被 footprint 隔斷），整段略過
const MIN_WALK = 0.6;   // 換過位置之後至少真的走這麼多公尺（裁決 R3：不在門口放下、走 4 公分）

const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
// 在日常裡（或剛拜訪完正走回出現的那一點：'away'，同一回合同一個幫手下一段拜訪照樣叫得到他）
const usable = m => !!m && !m.hidden && !m.gone && (m.mode === 'home' || m.mode === 'away');
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
// e：grow 事件；s：turn.js 給劇本的 { lv, flags, … }（lv 已經是這一級）；helper／target：幫手、被升級物品的模組；
// quota：這回合每個幫手真的拜訪了幾次（turn.js 給的 Map；演到這段、確定會走才 +1）
export function visit(e, s, ctx, { helper, target, quota = null }) {
  if (!helper || !target || helper.id === 'typhoon' || target.id === 'typhoon') return [];
  const spot = target.visitSpot?.(e.to, s), repOf = helper.script?.rep;
  if (!spot || !repOf) return [];
  const cell = cellAt(spot.x, spot.z);
  if (!cell) return [];
  let who = null, asked = false, partner, dest = null, back = null, exit = null;   // back／exit：換過位置的話，他原本站的地方、出現的那一點
  // 幫手的代表：第一次問就定案（之後每拍都是同一個人，或都是 null → 整段跳過）
  const rep = c => { if (!asked) { asked = true; const m = repOf(s, c); who = usable(m) && onIsland(m, c.nav) ? m : null; } return who; };
  // 被升級物品的代表：幫手有來、他在拜訪點那一格、看得到、在日常才揮手
  const host = c => {
    if (partner !== undefined) return partner;
    const m = rep(c) && target.script?.rep?.(s, c);
    partner = usable(m) && m !== who && sameCell(cellAt(m.pos.x, m.pos.z), cell) ? m : null;
    return partner;
  };
  const stand = c => (dest ??= frontOf(spot, spot.r, c.nav));
  const inner = B.walk(rep, stand);
  // 走過去（裁決 R3、R4）：先問好要不要換位置（fade 拍：在原處閃白 BLINK 秒——turn.js 把它跟物品之間的空拍一起演，不另外佔時間），
  // 走路那拍一開始換到 at、閃白、開始走（inner）
  let at = null, fading = false, walking = false, counted = false;
  const plan = c => {
    at = null; fading = false; counted = false;
    const m = rep(c); if (!m) return;
    const to = stand(c), route = c.nav.route(m.pos, to), end = route.at(-1);
    const used = quota?.get(helper.id) ?? 0;
    if (!end || Math.hypot(end.x - to.x, end.z - to.z) > REACH || used >= VISIT_MAX_PER_HELPER) { who = null; return; }   // 走不過去、這回合來夠了：不拜訪
    quota?.set(helper.id, used + 1); counted = true;
    const len = c.nav.routeLength(route), cap = VISIT_WALK * m.speed;
    if (len <= cap) return;
    at = pointAt(route, Math.max(0, Math.min(len - cap, len - MIN_WALK)), c.nav);
    back = { ...(m.away?.back ?? m.pos) };   // 上一段拜訪完正走回去：回的還是最早那個地方
    exit = c.nav.routeLength(c.nav.route(to, back)) > 2 * cap ? at : null;   // 回家的路不長：拜訪完自己走回去
  };
  const fade = {
    kind: 'fade', dur: () => (fading ? BLINK : 0), estimate: () => BLINK,
    start(c) { plan(c); if (!at) return false; c.roster.claim(who); c.roster.flash(who); fading = true; },
  };
  // 走路那拍才發現走不了（閃白那幾拍裡躲進門裡、換過去的那一點到站位沒有路）：不拜訪了——放回日常、這段不算拜訪過的次數，
  // 後面的拍全部跳過（who = null）
  const drop = (c, m) => {
    who = null; at = null;
    if (counted) { quota?.set(helper.id, Math.max(0, (quota.get(helper.id) ?? 1) - 1)); counted = false; }
    c.roster.home(m);
  };
  const arrive = {
    kind: 'walk', estimate: () => VISIT_WALK,
    dur: c => (walking ? inner.dur(c) : 0),
    start(c) {
      walking = false;
      const m = rep(c); if (!m) return false;
      // 最終審稿 5：先確定換過去之後走得動才換位置（B.walk 的 start 只在藏起來、或路線是 0 的時候不走）——不先瞬間換到路上再放著不管
      if (m.hidden || (at && c.nav.routeLength(c.nav.route(at, stand(c))) < 1e-6)) { drop(c, m); return false; }
      if (at) c.roster.relocate(m, { ...at, yaw: yawTo(at, stand(c)) });
      walking = inner.start(c) !== false;
      if (!walking) return false;
    },
    step(k, dt, c) { if (walking) inner.step(k, dt, c); },
    end(c) { if (who) inner.end(c); },
  };
  // 轉身：幫手面向建築、被升級物品的代表面向幫手（0 秒；人要先拿到劇本手上，日常才不會把朝向蓋掉）
  const face = {
    kind: 'face', dur: 0,
    start(c) {
      const m = rep(c); if (!m) return false;
      c.roster.setPose(m, { ...m.pos, yaw: yawTo(m.pos, spot), walking: false });
      const h = host(c); if (h) { c.roster.claim(h); c.roster.setPose(h, { ...h.pos, yaw: yawTo(h.pos, m.pos), walking: false }); }
      return false;
    },
  };
  // ♥（裁決 R4，設計 §4 第 4 步）：轉身要走的那一刻冒出來，跟著他走 VISIT_LOVE 秒——不擋後面的拍（0 秒拍，泡泡自己活 VISIT_LOVE 秒）。
  // 跳過時（timeline 的 ctx.skipping）不冒：0 秒拍的 end 正常演也馬上就到，沒辦法像 B.bubble 那樣在 end 收掉；已經冒出來的由跳過的 snap 清掉
  const love = {
    kind: 'bubble', dur: 0, love: VISIT_LOVE,
    start(c) { const m = rep(c); if (!m || m.hidden || c.skipping) return false; c.bubbles.show(m.head, '♥', VISIT_LOVE / rate(c)); return false; },
  };
  return [
    fade, arrive, face,
    together([B.gesture(rep, 'knock', VISIT_KNOCK, { at: spot }), B.gesture(host, 'wave', VISIT_KNOCK)]),
    love,
    // 回日常：換過位置、回家的路又長的幫手走回他出現的那一點、閃白換回原本的地方（roster.leave，背景走、不佔時間）；
    // 其他的直接回日常；揮手的人本來就在家那一格
    { kind: 'home', dur: 0, start(c) {
      const m = rep(c), h = host(c);
      if (m && exit) c.roster.leave(m, c.nav.route(m.pos, exit), back); else if (m) c.roster.home(m, { hurry: true });
      if (h) c.roster.home(h);
    } },
  ];
}

// 撲空（見檔頭）：w = { item, for }（引擎 wait 事件的一項）；s：turn.js 給劇本的 { lv, flags, … }；item／helper：等待物品、缺的幫手（w.for[0]）的模組。
// 回 [走過去, 失望, 回日常]；等待物品沒有代表劇本（或是颱風）→ []。
// 走過去那拍另外帶 ready(c)（找代表、定目標，第一次問就定案；回有沒有人要演）、cell(c)（代表現在那一格：turn.js 的平移目標）、
// goal()（定案的目標 { kind: 'lot' | 'spot' | 'door' | 'here', at, look, from, short }：測試看）
export function miss(w, s, ctx, { item, helper } = {}) {
  if (!item || item.id === 'typhoon' || !item.script?.rep) return [];
  const lvOf = id => s.lv?.[id] ?? 0;
  let asked = false, who = null, goal = null, inner = null, walked = false;
  // 某個模組第 n 級拜訪點的正面（在主島上才算）
  const door = (mod, n, nav) => { const sp = n > 0 ? mod?.visitSpot?.(n, s) : null; return sp && cellAt(sp.x, sp.z) ? { to: frontOf(sp, sp.r, nav), look: sp } : null; };
  // 走得到、路線不超過 MISS_WALK 秒
  const reach = (m, to, nav) => {
    const route = nav.route(m.pos, to), end = route.at(-1);
    return !!end && Math.hypot(end.x - to.x, end.z - to.z) <= REACH && nav.routeLength(route) <= MISS_WALK * m.speed;
  };
  const ready = c => {
    if (asked) return !!who;
    asked = true;
    const m = item.script.rep(s, c), nav = c.nav;
    if (!m || m.hidden || m.gone || m.mode !== 'home' || !onIsland(m, nav)) return false;
    const here = cellAt(m.pos.x, m.pos.z) ?? cellOf(item.id);
    let pick = null;
    if (helper && helper.id !== 'typhoon') {
      const n = lvOf(helper.id), at = anchorWorld(helper.id);
      const d = n === 0 ? null : door(helper, n, nav), t = n === 0 ? { kind: 'lot', to: clearNear(at, nav), look: at } : d && { kind: 'spot', ...d };
      const cell = t && cellAt(t.to.x, t.to.z);
      if (cell && near(cell, here) && reach(m, t.to, nav)) pick = t;
    }
    if (!pick) {
      // 自己門口：路線太長就走 MISS_WALK 秒那麼遠（往門口走、走不到門口就在路上失望；不換位置）
      const d = door(item, lvOf(item.id), nav), route = d && nav.route(m.pos, d.to), end = route?.at(-1);
      if (end && Math.hypot(end.x - d.to.x, end.z - d.to.z) <= REACH) {
        const len = nav.routeLength(route), cap = MISS_WALK * m.speed;
        pick = len <= cap ? { kind: 'door', ...d } : { kind: 'door', to: pointAt(route, cap, nav), look: d.look, short: true };
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
