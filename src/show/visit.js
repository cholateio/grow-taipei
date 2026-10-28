// 拜訪（計畫 6「看得見的因果與離島三段」設計 §4）：有原因的升級（grow 事件的 via 非空）先演一段幫手走來互動，再演那一級自己的劇本。
// 一段拜訪 = [走到拜訪點, together(敲門, 被升級物品的代表揮手), 幫手 ♥, 兩人回日常]：
//   幫手的代表 = via[0] 那個模組的 script.rep(s, ctx)，演到第一拍才找、找到就記住（同 turn.js 的 once）；找不到、藏起來（躲進門裡）、
//   在劇本手上（mode 'script'：同一回合別的劇本拿去用、還沒放回來——審稿重點 2：寧可略過，不半路搶人）、不在主島上（坐車頂、衛星島）、
//   走不過去 → 整段每一拍都跳過（0 秒）。
//   拜訪點 = 被升級物品的 visitSpot(第幾級, s)（這一級的建築正面）；代表站在 frontOf(spot, r, nav)，面向建築敲門。
//   走路上限 VISIT_WALK 秒：路線比 VISIT_WALK × 走路速度長，就把代表放到路線進入拜訪點那一格的地方（格邊，橋頭那一側），
//   還是太長就放到離終點剛好 VISIT_WALK 秒的那一點，再走剩下的（設計 §4「走不到就在格邊出現再走剩下的」；走路速度不加快，§6）。
//   被升級物品的代表在場（在拜訪點那一格、看得到、不在劇本手上）才轉身面向幫手揮手；不在場就只有敲門。
// 回日常：從別格來的（在格邊出現的）幫手由名冊 leave 背景走回格邊、回到被叫來之前的地方再回日常（不佔拍的時間，
//   也不在日常裡橫越半個島穿過鼠窩）；本來就在附近的直接回日常。
// 鏡頭由 turn.js 補：拜訪的第一拍跟平移到拜訪點那一格一起演（邊平移邊走進來）。
// 颱風不拜訪、也不被拜訪（天氣）：helper／target 是颱風就回 []（颱風的 rep、visitSpot 本來也是 null）。
import { B, together } from './beats.js';
import { frontOf } from '../actors/anchors.js';
import { cellAt } from '../scene/hex.js';

export const VISIT_WALK = 1.5, VISIT_KNOCK = 0.8, VISIT_LOVE = 0.6, VISIT_MAX_PER_HELPER = 3, VISIT_CAP = 3.5;
const REACH = 0.3;   // 路線的終點離拜訪點的站位超過這麼多 = 走不過去（被 footprint 隔斷），整段略過

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
// 路線最後一次走進 cell 的那一刻在第幾公尺（整條都在 cell 裡 → 0）：每段切 0.05 公尺查 cellAt
function enterAt(route, cell) {
  let s = 0, last = 0, inside = sameCell(cellAt(route[0].x, route[0].z), cell);
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1], b = route[k], d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.05));
    for (let j = 1; j <= n; j++) {
      const t = j / n, now = sameCell(cellAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), cell);
      if (now && !inside) last = s + d * (j - 1) / n;
      inside = now;
    }
    s += d;
  }
  return last;
}

// e：grow 事件；s：turn.js 給劇本的 { lv, flags, … }（lv 已經是這一級）；helper／target：幫手、被升級物品的模組
export function visit(e, s, ctx, { helper, target }) {
  if (!helper || !target || helper.id === 'typhoon' || target.id === 'typhoon') return [];
  const spot = target.visitSpot?.(e.to, s), repOf = helper.script?.rep;
  if (!spot || !repOf) return [];
  const cell = cellAt(spot.x, spot.z);
  if (!cell) return [];
  let who = null, asked = false, partner, dest = null, back = null, exit = null;   // back／exit：在格邊出現的話，他原本站的地方、出現的那一點
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
  const arrive = {
    kind: 'walk', dur: c => inner.dur(c), estimate: () => VISIT_WALK,
    start(c) {
      const m = rep(c); if (!m) return false;
      const to = stand(c), route = c.nav.route(m.pos, to), end = route.at(-1);
      if (!end || Math.hypot(end.x - to.x, end.z - to.z) > REACH) { who = null; return false; }   // 走不過去：不拜訪
      const len = c.nav.routeLength(route), cap = VISIT_WALK * m.speed;
      if (len > cap) {
        // 在格邊出現（不閃，同名冊 spawnHeld 式的進場；鏡頭這時正平移到這一格），再走剩下的；走的時候記下原本站的地方與格邊那一點（離開時用）
        const enter = enterAt(route, cell), at = pointAt(route, Math.max(enter, len - cap), c.nav);
        back = { ...(m.away?.back ?? m.pos) }; exit = enter > 0 ? pointAt(route, enter, c.nav) : null;   // 上一段拜訪完正走回格邊：回的還是最早那個地方
        c.roster.claim(m); c.roster.setPose(m, { ...at, yaw: yawTo(at, to), walking: false });
      }
      return inner.start(c);
    },
    step: (k, dt, c) => inner.step(k, dt, c),
    end: c => inner.end(c),
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
    // 回日常：從別格來的（在格邊出現的）幫手走回格邊、回到原本的地方（roster.leave，背景走、不佔時間）；
    // 本來就在附近的直接回日常；揮手的人本來就在家那一格
    { kind: 'home', dur: 0, start(c) {
      const m = rep(c), h = host(c);
      if (m && exit) c.roster.leave(m, c.nav.route(m.pos, exit), back); else if (m) c.roster.home(m);
      if (h) c.roster.home(h);
    } },
  ];
}
