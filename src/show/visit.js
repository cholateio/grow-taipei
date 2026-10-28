// 拜訪（計畫 6「看得見的因果與離島三段」設計 §4）：有原因的升級（grow 事件的 via 非空）先演一段幫手走來互動，再演那一級自己的劇本。
// 一段拜訪 = [走到拜訪點, together(敲門, 被升級物品的代表揮手), 幫手 ♥, 兩人回日常]：
//   幫手的代表 = via[0] 那個模組的 script.rep(s, ctx)，演到第一拍才找、找到就記住（同 turn.js 的 once）；找不到、藏起來（躲進門裡）、
//   在劇本手上（mode 'script'：同一回合別的劇本拿去用、還沒放回來——審稿重點 2：寧可略過，不半路搶人）、不在主島上（坐車頂、衛星島）、
//   走不過去、這回合這個幫手已經真的拜訪過 VISIT_MAX_PER_HELPER 次（quota，演到才算：略過的那幾段不算數）→ 整段每一拍都跳過（0 秒）。
//   拜訪點 = 被升級物品的 visitSpot(第幾級, s)（這一級的建築正面）；代表站在 frontOf(spot, r, nav)，面向建築敲門。
//   走路上限 VISIT_WALK 秒（裁決 R3）：路線比 VISIT_WALK × 走路速度長，就在原處閃白 BLINK 秒、換到路線上離終點剛好 VISIT_WALK 秒的那一點
//   （可能還在前一格、橋上）再閃白一下，走滿 VISIT_WALK 秒過去——至少 MIN_WALK 公尺真的走（設計 §4「走不到就在格邊出現再走剩下的」；
//   走路速度不加快，§6）。不靜靜地放下：每次換位置都閃白（同零件的閃白）。
//   被升級物品的代表在場（在拜訪點那一格、看得到、不在劇本手上）才轉身面向幫手揮手；不在場就只有敲門。
// 回日常：閃白換過位置、回家的路又超過 2 × VISIT_WALK 秒的幫手由名冊 leave 背景走回他出現的那一點、閃白、換回被叫來之前的地方再閃白、回日常
//   （不佔拍的時間，也不在日常裡橫越半個島穿過鼠窩）；其他的直接回日常（自己走回去）。
// 鏡頭由 turn.js 補：拜訪的第一拍跟平移到拜訪點那一格一起演（邊平移邊走進來）。
// 同一回合同一個幫手最多拜訪 VISIT_MAX_PER_HELPER 次（設計 §4 原本 3；裁決 R2：第三次重複，2，之後只演那一級的劇本）。
// 颱風不拜訪、也不被拜訪（天氣）：helper／target 是颱風就回 []（颱風的 rep、visitSpot 本來也是 null）。
import { B, together } from './beats.js';
import { frontOf } from '../actors/anchors.js';
import { cellAt } from '../scene/hex.js';
import { BLINK } from './blink.js';

export const VISIT_WALK = 1.5, VISIT_KNOCK = 0.8, VISIT_LOVE = 0.6, VISIT_MAX_PER_HELPER = 2, VISIT_CAP = 3.5;
const REACH = 0.3;   // 路線的終點離拜訪點的站位超過這麼多 = 走不過去（被 footprint 隔斷），整段略過
const MIN_WALK = 0.6;   // 換過位置之後至少真的走這麼多公尺（裁決 R3：不在門口放下、走 4 公分）

const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
// 在日常裡（或剛拜訪完正走回格邊：'away'，同一回合同一個幫手下一段拜訪照樣叫得到他）
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
  // 走過去：要換位置的話先在原處閃白 BLINK 秒（fading），再換到 at、閃白、開始走（inner）；拍長 = BLINK + 從 at 走過去的秒數
  let at = null, fading = false, tf = 0, span = 0, walking = false;
  const go = c => { fading = false; c.roster.relocate(who, { ...at, yaw: yawTo(at, stand(c)) }); walking = inner.start(c) !== false; };
  const arrive = {
    kind: 'walk', estimate: () => BLINK + VISIT_WALK,
    dur: c => (at ? BLINK + span : inner.dur(c)),
    start(c) {
      at = null; fading = false; walking = false;
      const m = rep(c); if (!m) return false;
      const to = stand(c), route = c.nav.route(m.pos, to), end = route.at(-1);
      const used = quota?.get(helper.id) ?? 0;
      if (!end || Math.hypot(end.x - to.x, end.z - to.z) > REACH || used >= VISIT_MAX_PER_HELPER) { who = null; return false; }   // 走不過去、這回合來夠了：不拜訪
      quota?.set(helper.id, used + 1);
      const len = c.nav.routeLength(route), cap = VISIT_WALK * m.speed;
      if (len <= cap) { walking = inner.start(c) !== false; return walking ? undefined : false; }
      at = pointAt(route, Math.max(0, Math.min(len - cap, len - MIN_WALK)), c.nav);
      back = { ...(m.away?.back ?? m.pos) };   // 上一段拜訪完正走回去：回的還是最早那個地方
      exit = c.nav.routeLength(c.nav.route(to, back)) > 2 * cap ? at : null;   // 回家的路不長：拜訪完自己走回去
      span = c.nav.routeLength(c.nav.route(at, to)) / m.speed;
      c.roster.claim(m); c.roster.flash(m); fading = true; tf = 0;
    },
    step(k, dt, c) {
      if (fading) { tf += dt; if (tf < BLINK - 1e-9) return; go(c); return; }
      if (walking) inner.step(k, dt, c);
    },
    end(c) { if (fading) go(c); if (walking || at) inner.end(c); },
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
  return [
    arrive, face,
    together([B.gesture(rep, 'knock', VISIT_KNOCK, { at: spot }), B.gesture(host, 'wave', VISIT_KNOCK)]),
    B.bubble(rep, '♥', VISIT_LOVE),
    // 回日常：換過位置、回家的路又長的幫手走回他出現的那一點、閃白換回原本的地方（roster.leave，背景走、不佔時間）；
    // 其他的直接回日常；揮手的人本來就在家那一格
    { kind: 'home', dur: 0, start(c) {
      const m = rep(c), h = host(c);
      if (m && exit) c.roster.leave(m, c.nav.route(m.pos, exit), back); else if (m) c.roster.home(m);
      if (h) c.roster.home(h);
    } },
  ];
}
