// 拍的建構函數：劇本（turn.js 與各物品的腳本）用這些小積木排出一回合，交給 timeline.js 一拍一拍演。
// 每個建構函數回一個拍 { kind, dur, start?, step?, end? }（kind 同函數名），只動 ctx 裡的東西（stage、roster、nav、bubbles、blink、rig、rail…）。
// 跳過、reduced-motion 時拍只會 start → end、不 step，所以每一拍的 end 都要自己把東西放到最終狀態。
// 躲進門裡（hidden，颱風登陸）的成員：walk、gesture、bubble、jump 都跳過（0 秒、不 claim）——登陸後照演的關鍵劇本不把人拉出來（裁決 R14）。
import { together } from './timeline.js';
import { BLINK } from './blink.js';
import { SEATS } from './roster.js';
import { trainPose, trainCars, spurTrip, SPUR_SPEED, RIDE_Y, TRAIN_HEAD_Y } from '../actors/token.js';
import { anchorWorld, cellOf, cellCentre } from '../actors/anchors.js';
import { worldToAxial } from '../scene/hex.js';
import { createPathCursor } from '../scene/path.js';
import { worldEffects } from '../actors/world.js';

export { together };
export const GESTURE_DUR = { knock: 1.0, wave: 1.0, jump: 0.6, look: 0.6, sniff: 1.5, puff: 0.8, build: 1.6, sigh: 1.0 };   // sigh：撲空時的失望（計畫 6 設計 §5）
// 加速上限：一圈 2π / 0.35 ≈ 18 s，車剛開走時要 4.5 倍才趕得上 4 秒內進站（三倍會拖到 6 秒）
export const TRAIN_ARRIVE = 4, TRAIN_STOP = 3, TRAIN_MAX_BOOST = 4.5;
const STATION = anchorWorld('token');
export const STATION_A = Math.atan2(STATION.z, STATION.x);   // 捷運站對島心的方位（列車車頭停在站前島緣）
const STAGGER = 0.15, DEPART_BEHIND = 0.6, TRAIN_SPEED = 0.35, JUMP_H = 0.7, HOP_H = 0.4, PUFF = 0.15, TWO_PI = 2 * Math.PI;

const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k * k * (3 - 2 * k);
const turnBy = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));   // 從角 a 轉到 b 的最短轉角
const call = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);
// 演出速度（裁決 R15，時間軸的 ctx.speed）：交給真實時間在跑的東西（泡泡、LEVEL UP、鏡頭飛行、列車時鐘）要自己換算
export const rate = ctx => (ctx?.speed > 0 ? ctx.speed : 1);
const isPartKey = t => typeof t === 'string' && t.includes('.');
const offsetOf = o => ({ dx: o?.dx ?? 0, dy: o?.dy ?? 0, dz: o?.dz ?? 0 });   // move 的 from／to 可以寫 0
// 列車角速度：跟 token.js 的 view 一樣，淹水時停駛
const trainSpeed = ctx => (ctx.stage.flags?.flooded ? 0 : TRAIN_SPEED);

// 拍的目標：成員 → 它的頭；函數 → 演到這拍時才算（回空值 = 人還沒出來，回 null 讓拍跳過）；
// 物品 id → 物品頭上；零件鍵（有 '.'）→ 零件頭上；{ head } → 原樣
export function resolveTarget(t, ctx) {
  if (typeof t === 'function') { const v = t(ctx); return v == null ? null : resolveTarget(v, ctx); }
  if (typeof t === 'string') return isPartKey(t) ? partHead(t, 0, ctx) : { head: () => ctx.stage.headOf(t) };
  if (t && typeof t.head === 'function') return t.pos ? { head: t.head, member: t } : t;
  throw new Error(`beat target ${JSON.stringify(t)}`);
}
function memberOf(who, ctx) {
  const r = resolveTarget(who, ctx); if (!r) return null;
  if (!r.member) throw new Error('beat needs a roster member');
  return r.member;
}
const partOf = (key, ctx) => ctx.stage.partObject(key);

// 零件頭上（零件的 object.position 就是它的 at）；零件不在就退回物品頭上
export function partHead(key, dy = 0, ctx) {
  return { head: () => {
    const o = partOf(key, ctx);
    return o ? { x: o.position.x, y: o.position.y + dy, z: o.position.z } : ctx.stage.headOf(key.split('.')[0]);
  } };
}
// 車頭上方（泡泡用）
export function trainHead(ctx) {
  return { head: () => { const p = trainPose(ctx.now + ctx.rail.offset, 0, { speed: trainSpeed(ctx), trip: ctx.rail.trip }); return { x: p.x, y: p.y + TRAIN_HEAD_Y, z: p.z }; } };
}
// 車頂第 i 個座位現在的位置：和名冊的 ride 一樣沿車身前進方向偏移
export function seat(i, ctx) {
  return () => {
    const seats = SEATS[trainCars(ctx.stage.lv.token) === 5 ? 5 : 3], [car, off] = seats[i % seats.length];
    return ridePose(ctx, car, off);
  };
}
// 第 car 節車頂、沿車身往前 off 的位置（老鼠的座位、燈泡電工的座位共用）
export function ridePose(ctx, car, off = 0) {
  const p = trainPose(ctx.now + ctx.rail.offset, car, { speed: trainSpeed(ctx), trip: ctx.rail.trip });
  return { x: p.x + Math.sin(p.yaw) * off, y: p.y + RIDE_Y, z: p.z + Math.cos(p.yaw) * off, yaw: p.yaw };
}
// 列車有在跑嗎（有列車零件、沒淹水停駛）
export const trainRuns = ctx => !!partOf('token.train', ctx) && trainSpeed(ctx) > 0;

// 從 hold 住的名冊拿一個人出來，直接站在 at（§13.2 不閃、不佔時間，之後由 walk 帶進場）；拍演完後 beat.member 就是他
export function spawn(key, at) {
  const beat = { kind: 'spawn', dur: 0, member: null, start(ctx) { beat.member = ctx.roster.spawnHeld(key, call(at, ctx)); } };
  return beat;
}

// delay：拍開始時就把人拿到劇本手上（原地站著），delay 秒後才出發（一群人排成一列跟著走）
// 走到一半 footprint 變了（路上長出建築，§14.1）：從現在的位置重新找路到同一個終點，剩下的時間不變（拍長開始時就定了），繞路就走快一點
export function walk(who, to, { speed, delay = 0 } = {}) {
  let m = null, route = null, cursor = null, s = 0, total = 0, v = 0, idle = 0, planned = -1, span = 0;   // span：開始時定的走路秒數（重新找路也不變）
  const plan = ctx => {
    const mm = memberOf(who, ctx); if (!mm || mm.hidden) return null;   // 躲進門裡的人不拉出來（裁決 R14）
    const r = ctx.nav.route(mm.pos, call(to, ctx));
    return { mm, r, len: ctx.nav.routeLength(r), v: speed ?? mm.speed };   // 蒙太奇的兩倍速由時間軸統一換算（ctx.speed）
  };
  return {
    kind: 'walk',
    dur: () => delay + span,
    estimate(ctx) { const p = plan(ctx); return !p || p.len < 1e-6 ? 0 : delay + p.len / p.v; },
    start(ctx) {
      const p = plan(ctx); m = p?.mm ?? null; if (!m) return false; route = p.r; total = p.len; v = p.v; s = 0; idle = delay; span = total / v;
      ctx.roster.claim(m);
      if (total < 1e-6) return false;
      cursor = createPathCursor(route, { loop: false }); planned = ctx.nav.version;
    },
    step(k, dt, ctx) {
      if (idle > 0) { const used = Math.min(idle, dt); idle -= used; dt -= used; if (dt <= 0) return; }
      if (ctx.nav.version !== planned && s < total) {
        planned = ctx.nav.version;
        const left = (total - s) / v, r = ctx.nav.route(m.pos, route.at(-1)), len = ctx.nav.routeLength(r);
        if (len > 1e-6) { route = r; cursor = createPathCursor(r, { loop: false }); total = len; s = 0; v = len / left; }
      }
      // 開放路徑的游標走過頭會折返，所以只推到終點為止
      const ds = Math.min(dt * v, total - s); s += ds; cursor.advance(ds);
      ctx.roster.setPose(m, { ...cursor.locate(), walking: true });
    },
    // 停在終點、面向最後一段的方向（游標停在終點時的朝向不可靠）
    end(ctx) {
      if (!m) return;
      const [a, b] = route.length >= 2 ? route.slice(-2) : [], d = a ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
      ctx.roster.setPose(m, { ...route.at(-1), yaw: d > 1e-9 ? Math.atan2(b.x - a.x, b.z - a.z) : m.yaw, walking: false });
    },
  };
}

export function bubble(who, kind, dur = 1.2) {
  let handle = null;
  return {
    kind: 'bubble', dur,
    start(ctx) { const r = resolveTarget(who, ctx); if (!r || r.member?.hidden) return false; handle = ctx.bubbles.show(r.head, kind, dur / rate(ctx)); },
    end() { handle?.cancel(); handle = null; },
  };
}

// 小動作。people：交給小人的 gesture（look、build 另外帶 { at } 決定轉向，演完就一直朝那邊；build 揮鋤頭的節奏要秒數，dur 一起帶）；
// 模型：sniff 左右轉頭、sigh 原地慢慢轉一圈（失望；演完回原本的朝向）、jump 原地拋物線、wave 在 m.waving 的期間名冊把揮手的搖擺加大加快（roster.js；model wave 的模型才搖）；
// 零件鍵 + puff：零件鼓起來再縮回去
export function gesture(who, kind, dur = GESTURE_DUR[kind], { at } = {}) {
  if (typeof dur === 'object') { at = dur.at; dur = GESTURE_DUR[kind]; }   // gesture(m, 'look', { at })
  let m = null, obj = null, base = null, yaw;
  return {
    kind: 'gesture', dur,
    start(ctx) {
      if (isPartKey(who)) { obj = partOf(who, ctx); if (!obj) return false; base = obj.scale.clone(); return; }
      m = memberOf(who, ctx); if (!m || m.hidden) { m = null; return false; }
      ctx.roster.claim(m);   // 名冊日常不再擺這個人，sniff／jump 才不會被蓋掉
      if (kind === 'wave' && m.holder) m.waving = true;
      yaw = (kind === 'look' || kind === 'build') && at ? Math.atan2(at.x - m.pos.x, at.z - m.pos.z) : undefined;
    },
    step(k) {
      if (obj) { obj.scale.copy(base).multiplyScalar(1 + PUFF * Math.sin(Math.PI * k)); return; }
      if (m.walker) { m.walker.gesture = yaw === undefined ? { kind, k, dur } : { kind, k, dur, yaw }; return; }
      if (!m.holder) return;
      if (kind === 'look' && yaw !== undefined) m.holder.rotation.y = m.yaw + turnBy(m.yaw, yaw) * k;   // 模型：慢慢轉過去
      if (kind === 'sniff') m.holder.rotation.y = m.yaw + 0.3 * Math.sin(k * TWO_PI * 2);
      if (kind === 'sigh') m.holder.rotation.y = m.yaw + TWO_PI * k;
      if (kind === 'jump') m.holder.position.y = m.pos.y + HOP_H * Math.sin(Math.PI * k);
    },
    end(ctx) {
      if (obj) { obj.scale.copy(base); return; }
      if (!m) return;
      if (m.walker) m.walker.gesture = null;
      m.waving = false;
      if (m.holder) { m.holder.rotation.y = m.yaw; m.holder.position.y = m.pos.y; }
      if (yaw !== undefined) ctx.roster.setPose(m, { ...m.pos, yaw, walking: false });
    },
  };
}

// 套用事件（§13.2）：blink 時新零件先藏著，舞台 pending 的鍵（有東西要露出或移除）依序（間隔 0.15 s）commit，
// commit 由舞台自己閃白 BLINK 秒（移除的閃完才拿掉），拍長 BLINK + 0.15·(n−1)。
// 名冊的鍵不 pending（名冊自己在換裝的人身上閃），也不算進長度。跳過時在 end 一次 commit（不閃）。
// stagger：鍵之間的間隔（預設 STAGGER）；0 = 全部同一刻閃（大停電：電一斷整區一起暗，拍長 BLINK）
// tagAlong 的零件（離島三段這類點綴，零件宣告 tagAlong: true）跟這拍第一個閃的零件一起閃、不多佔一格 stagger：
// 加了點綴不改任何一拍的長度（整局的走位對時間很敏感）；這拍只剩點綴時照常閃一次
export function apply(e, { blink = true, only, hold, stagger = STAGGER } = {}) {
  let keys = [], along = [], fired = 0, t = 0;
  // only 可以是 ctx => 鍵陣列：演到這拍（start）才算（劇本建拍時還不知道角色到時候在哪）
  const optsOf = ctx => { const o = call(only, ctx); return { ...(o && { only: o }), ...(hold && { hold }), deferred: blink }; };
  return {
    kind: 'apply', only, blink,   // only 原樣留在拍上給測試看（陣列，或 ctx => 陣列）；blink 給 turn.js 判斷有沒有東西演
    dur: () => (keys.length ? BLINK + stagger * (keys.length - 1) : 0),
    estimate: () => (blink ? BLINK : 0),   // 還沒套用不知道幾個零件要閃：蒙太奇估長度時至少算一個
    start(ctx) {
      const all = ctx.stage.apply(e, optsOf(ctx)).changed; fired = 0; t = 0;
      // 新建築的 footprint 從套用這一刻就算（閃白期間還藏著也一樣）：不然閃白那 0.15 秒走路格還不知道，走路的人會走進剛長出來的建築
      if (all.length) ctx.nav.setFootprints(ctx.stage.footprints());
      const pending = new Set(blink ? ctx.stage.pendingKeys() : []);
      const shown = all.filter(c => pending.has(c.key));
      keys = shown.filter(c => !c.tagAlong).map(c => c.key); along = shown.filter(c => c.tagAlong).map(c => c.key);
      if (!keys.length) keys = along.splice(0, 1);
      if (!keys.length) return false;
    },
    step(k, dt, ctx) {
      t += dt;
      while (fired < keys.length && t >= stagger * fired - 1e-9) { if (!fired) for (const a of along) ctx.stage.commit(a); ctx.stage.commit(keys[fired++]); }
    },
    end(ctx) { ctx.stage.commitAll(); ctx.nav.setFootprints(ctx.stage.footprints()); },
  };
}

// LEVEL UP 字樣。twice（跳級合成一段，回到 GROW 設計 §4.2）：拍長 1.3 s，第二個字樣在 TWICE_AFTER 秒後冒、多抬高 TWICE_DY——
// 沒有「×2」、沒有別的字。target／text／down／twice 留在拍上（turn.js 把跳級劇本裡的 LEVEL UP 換成彈兩次的要讀）。
// 跳過、reduced-motion（不 step）只冒第一個
export const TWICE_AFTER = 0.3, TWICE_DY = 0.25;
export function levelUp(target, { text = 'LEVEL UP', down = false, twice = false } = {}) {
  let handles = [], head = null, t = 0;
  const pop = (ctx, extra = {}) => handles.push(ctx.bubbles.levelUp(head, { text: down && text === 'LEVEL UP' ? 'LEVEL DOWN' : text, down, ...extra, ...(rate(ctx) !== 1 && { dur: 1.0 / rate(ctx) }) }));
  return {
    kind: 'levelUp', dur: twice ? 1.3 : 1.0, target, text, down, twice,
    start(ctx) {
      const r = resolveTarget(target, ctx); if (!r) return false;
      handles = []; head = r.head; t = 0; pop(ctx);
    },
    step(k, dt, ctx) {
      t += dt;
      if (twice && handles.length === 1 && t >= TWICE_AFTER - 1e-9) pop(ctx, { dy: TWICE_DY });
    },
    end() { for (const h of handles) h?.cancel(); handles = []; },
  };
}

// 起因閃一下（回到 GROW 設計 §4.2）：零件 key（turn.js 給幫手的本體 <id>.main）整棟閃白 dur 秒（同升級用的材質閃白）。
// 這一級沒有那個零件（被鎖、淹水換了站體……）或瞬間演（跳過、reduced-motion）→ 0 秒、不閃
export const CAUSE_FLASH = 0.4;
export function flash(key, dur = CAUSE_FLASH) {
  return {
    kind: 'flash', key, dur,
    start(ctx) {
      if (ctx.instant) return false;
      const o = ctx.stage.partObject?.(key); if (!o) return false;
      ctx.blink.part(o, dur);
    },
  };
}

// 鏡頭跟主線（§13.1）：target 是格子 [q, r]（平移到格子中心）、物品 id（那個物品的格子）或點 { x, y, z }，
// 也可以是 ctx => 上面三種（演到這拍才算：主角到時候在哪一格；回 null 這拍跳過）；
// 1 秒平移＋拉近到全景距離 × zoom，名冊只讓那一格的人做日常（§13.4）。玩家拖過鏡頭 → 不動、不佔時間。
// 拍只佔 FOCUS_BEAT 秒：easeInOut 最後 0.2 秒只剩 3% 的路，劇本先接著演（節奏門檻 50 s，計畫 3.8 Task 3）。
// 'home'：回全景、名冊全部恢復。不佔時間：鏡頭在後面的拍（或回合結束後）自己飛完
export const FOCUS_BEAT = 0.8;
// 回合中途的 'home'（全島的事）也尊重拖過的記號：名冊照樣全部恢復，鏡頭不動、不清記號（計畫 3.8 R13）；
// final（只有 turn.js 回合最後那拍用）拖過也照回、清掉記號。
// hold：'home' 停幾秒等鏡頭飛到（101 大升級回全景再換零件，§14.4）；拖過就不動、不停。
// skyline：回全景之前先更新天際線（101 頭頂 y，§14.4；數字或 ctx => 數字，演到這拍才算）
export function focus(target, { zoom = 0.6, final = false, hold = 0, skyline } = {}) {
  return {
    kind: 'focus', dur: target === 'home' ? hold : FOCUS_BEAT, target, final,
    start(ctx) {
      const ms = ctx.instant ? 0 : 1000 / rate(ctx);
      if (target === 'home') {
        ctx.roster.setFocus(null);
        if (skyline != null) ctx.rig.setSkyline(call(skyline, ctx));
        if (!final && ctx.rig.grabbed) return false;
        ctx.rig.home(ms); return;
      }
      const t = typeof target === 'function' ? target(ctx) : target; if (!t) return false;
      // 點：格子用軸座標反算（衛星島也有自己的格子）
      const cell = Array.isArray(t) ? t : typeof t === 'string' ? cellOf(t) : worldToAxial(t.x, t.z);
      if (!cell) return false;
      ctx.roster.setFocus([cell]);
      const point = Array.isArray(t) || typeof t === 'string' ? cellCentre(cell) : t;
      return ctx.rig.grabbed ? false : ctx.rig.focus(point, { zoom, ms });
    },
  };
}

// 零件自己演的動畫（矽盾測試、電纜通電、飛彈）：套用一個零件（不閃白）並在同一拍裡把它的動畫歸零重演——
// 建好的零件是演完的樣子（電纜整條亮、測試罩收好、飛彈飛完），套用和歸零在同一個 start 裡，中間沒有畫面；
// begin(o, ctx) 回 false 這拍跳過；step(o, k) 逐幀（可省）；end 一律 finish(o, ctx) 跳到演完（跳過、reduced-motion 也一樣；
// 拍演完之後零件還要自己接著演的——飛彈撞上罩子才放煙火——看 ctx.instant 決定要不要跳）
export function replay(e, key, dur, { begin, step, finish }) {
  let o = null;
  return {
    kind: 'replay', dur,
    start(ctx) {
      if (ctx.stage.apply(e, { only: [key] }).changed.length) ctx.nav.setFootprints(ctx.stage.footprints());
      o = ctx.stage.partObject(key); if (!o || !begin(o, ctx)) { o = null; return false; }
    },
    step(k) { step?.(o, k); },
    end(ctx) { if (o) finish(o, ctx); },
  };
}

export function world(effects) {
  return { kind: 'world', dur: 0, effects, start(ctx) { ctx.world(effects, !!ctx.instant); } };
}

// 全島效果照舞台現在的狀態重算（lv、flags、meta → worldEffects）：劇本改了旗標要立刻反映（命中躺平、外星三眼）時用，
// 跟 turn.js 收尾那拍同一個來源，劇本裡不另外寫心情規則（最終審稿）
export function worldNow() {
  return { kind: 'world', dur: 0, start(ctx) { ctx.world(worldEffects(ctx.stage.lv, ctx.stage.flags, ctx.stage.meta), !!ctx.instant); } };
}

export function wait(s) { return { kind: 'wait', dur: s }; }

// who：一個或一串目標；也可以是 ctx => 目標（或一串），演到這拍才算（turn.js 收尾：所有 script 成員）
export function home(who) {
  return { kind: 'home', dur: 0, start(ctx) { for (const w of [].concat(call(who, ctx) ?? [])) { const m = memberOf(w, ctx); if (m) ctx.roster.home(m); } } };
}

// 零件位置 = 它原本的位置 + 偏移；目前的偏移記在 userData.showOffset，連續 move 才不會越疊越遠
export function move(key, { from, to, dur = 1 } = {}) {
  const a = offsetOf(from), b = offsetOf(to);
  let obj = null, base = null;
  const put = k => {
    const o = { dx: lerp(a.dx, b.dx, k), dy: lerp(a.dy, b.dy, k), dz: lerp(a.dz, b.dz, k) };
    obj.position.set(base.x + o.dx, base.y + o.dy, base.z + o.dz); obj.userData.showOffset = o;
  };
  return {
    kind: 'move', dur,
    start(ctx) {
      obj = partOf(key, ctx); if (!obj) return false;
      const o = offsetOf(obj.userData.showOffset);
      base = { x: obj.position.x - o.dx, y: obj.position.y - o.dy, z: obj.position.z - o.dz };
      put(0);
    },
    step(k) { put(k); },
    end() { if (obj) put(1); },
  };
}

// 零件從扁平長出來（環狀線從海面升起）
export function scaleIn(key, { axis = 'y', dur = 0.8 } = {}) {
  let obj = null;
  return {
    kind: 'scaleIn', dur,
    start(ctx) { obj = partOf(key, ctx); if (!obj) return false; obj.scale[axis] = 1e-3; },
    step(k) { obj.scale[axis] = Math.max(1e-3, k); },
    end() { if (obj) obj.scale[axis] = 1; },
  };
}

// 零件歪掉（攤車被撞歪）；記在 stage.tilted，下一回合開頭 turn.js 閃白扶正
export function tilt(key, { rz = 0.25, dur = 0.3 } = {}) {
  let obj = null;
  return {
    kind: 'tilt', dur,
    start(ctx) { obj = partOf(key, ctx); if (!obj) return false; ctx.stage.tilted?.add(key); },
    step(k) { obj.rotation.z = rz * k; },
    end() { if (obj) obj.rotation.z = rz; },
  };
}

const visibility = (kind, on) => keys => ({
  kind, dur: 0,
  start(ctx) { for (const k of [].concat(keys)) { const o = partOf(k, ctx); if (o) o.visible = on; } },
});
export const hideParts = visibility('hideParts', false), showParts = visibility('showParts', true);

// 列車從站的後方 0.6 rad 出發：改共用的列車時鐘偏移，讓車頭此刻就在那裡
export function trainDepart() {
  return {
    kind: 'trainDepart', dur: 0,
    start(ctx) {
      const speed = trainSpeed(ctx);
      if (partOf('token.train', ctx) && speed) ctx.rail.offset = (STATION_A - DEPART_BEHIND) / speed - ctx.now;
      return false;
    },
  };
}

// 列車進站：車頭還要 need 秒才到 at；太久就把列車時鐘加速 k 倍（最多 boost，預設 4.5 倍）在 arrive 秒（預設 4）內趕到，
// 進站跟支線版一樣緩：最後 SPUR_BRAKE 秒線性減速停住（所以到站多 SPUR_BRAKE / 2 秒；路太短就從原速直接減速），
// 到站後停 stop 秒（預設 3；時鐘偏移跟時間等速倒退，車不動），拍還沒演完就 SPUR_PULL 秒緩緩開走，之後照常開。
// 跳過時什麼都不改（車照原本的時鐘跑）
// spur（'windmill'／'playground'）：停的不是站，是支線那頭的離島站——車頭先進到支線入口（token.spurTrip 的角 a），
//   環上的時鐘停住，ctx.rail.trip 帶著車頭在支線上的位置 s：開出去（SPUR_SPEED）→ 在島那頭停 stop 秒 → 倒回環上，再照常開。
//   支線版進出都緩：趕路（最多 boost 倍）的最後 SPUR_BRAKE 秒線性減速停在入口；倒回環上後 SPUR_PULL 秒從 0 加速回原速
//   （這段算在拍裡）。during 在車頭到島那頭時才開始演；跳過、中止時 trip 收掉（列車回到環上原本的時鐘）
// back：車頭剛開過 at 不到 back 弧度就倒車回來（trainRun）；spurSpeed：支線上的車速（預設 SPUR_SPEED）
// launch：列車原本停著（上一個 trainStop 剛停在站上、拍一結束就接這一拍）——趕路從 0 加速（trainRun），不一幀跳到 k 倍
// during：到站那一刻才開始依序演的一串拍（turn.js 的 withTwice 會就地換掉 during 裡的 LEVEL UP 元素，所以 during 要留在拍上、不要複製）（站前的人接箱子、再走開），車停 stop 秒照樣開走，這拍演到 during 也演完為止；
//   長度在 start 時就要給時間軸，所以用每拍的 estimate（walk）或固定 dur 估。跳過或沒有列車時 during 每拍 start → end
// together（還沒 start，dur 是 0）取子拍估計的最長
const durOf = (b, ctx) => {
  if (b.kind === 'together' && b.beats) return Math.max(0, ...b.beats.map(x => durOf(x, ctx)));
  const d = b.estimate ? b.estimate(ctx) : typeof b.dur === 'function' ? b.dur(ctx) : b.dur; return d > 0 ? d : 0;
};
export const SPUR_BRAKE = 0.6, SPUR_PULL = 0.7;
// 列車從現在的位置趕到環上角 target 的行程（trainStop 用；劇本也能先問幾秒到站）：
//   need：原速要開幾秒；k：趕路倍數（need ≤ within 照原速，否則最多 boost 倍在 within 秒內趕到）；arrive：實際幾秒停住（含減速）；
//   run(u)：第 u 秒（< arrive）環上走了多少（以原速的秒計）。速度曲線：（launch：先 SPUR_PULL 秒從 0 加速到 k）→ 等速 k → 最後 SPUR_BRAKE 秒減速到 0；
//   路太短：沒有 launch 就從原速直接減速；launch 照同樣的加減速度跑一個三角形（峰值降低）。
//   launch：車原本停著（上一個 trainStop 剛停在站上），從 0 慢慢加速，不一幀跳到 k 倍
//   back（弧度）：車頭剛開過 target 不到 back 時倒車回去（先 SPUR_BRAKE 秒從原速煞停、再照 launch 曲線倒回）——剛開走的車不用繞一整圈；
//   這時 need 是負的（環上要倒退幾秒）
const wrap2pi = a => ((a % TWO_PI) + TWO_PI) % TWO_PI;
export function trainRun(ctx, target, { within = TRAIN_ARRIVE, boost = TRAIN_MAX_BOOST, launch = false, back = 0 } = {}) {
  const speed = trainSpeed(ctx), a0 = (ctx.now + ctx.rail.offset) * speed;
  if (!speed) return { need: 0, k: 1, arrive: 0, run: () => 0 };
  const behind = wrap2pi(a0 - target);
  if (!launch && behind > 1e-9 && behind <= back) {
    const B0 = SPUR_BRAKE, r = ramp(behind / speed + B0 / 2, within, boost, true);
    return { need: -behind / speed, k: -r.k, arrive: B0 + r.arrive, run: u => (u < B0 ? u - u * u / (2 * B0) : B0 / 2 - r.run(u - B0)) };
  }
  return ramp(wrap2pi(target - a0) / speed, within, boost, launch);
}
// 走 need 秒（原速）的速度曲線（見 trainRun）
function ramp(need, within, boost, launch) {
  let k = need <= within ? 1 : Math.min(boost, need / within), p = launch ? SPUR_PULL : 0, b = SPUR_BRAKE;
  if (need < 1e-9) return { need: 0, k, arrive: 0, run: () => 0 };
  if (need < k * (p + b) / 2) {
    if (!launch) { const arrive = 2 * need; return { need, k, arrive, run: u => u - u * u / (2 * arrive) }; }
    const s = Math.sqrt(2 * need / (k * (p + b))); k *= s; p *= s; b *= s;
  }
  const c = need / k - (p + b) / 2, arrive = p + c + b;
  const run = u => {
    if (u < p) return k * u * u / (2 * p);
    if (u <= p + c) return k * p / 2 + k * (u - p);
    const w = u - p - c; return k * (p / 2 + c) + k * (w - w * w / (2 * b));
  };
  return { need, k, arrive, run };
}
export function trainStop({ at = STATION_A, stop = TRAIN_STOP, during = [], spur = null, arrive: within = TRAIN_ARRIVE, boost = TRAIN_MAX_BOOST, launch = false, back = 0, spurSpeed = SPUR_SPEED } = {}) {
  const subs = [].concat(during), trip = spur ? spurTrip(spur) : null, out = trip ? trip.total / spurSpeed : 0;
  const hold = trip ? out + stop + out : stop;   // 環上的時鐘停多久：支線來回加上在島那頭停的
  // 進支線後第 u 秒車頭在支線上第幾公尺（緩起緩停）
  const tripS = u => trip.total * (u < out ? ease(u / out) : u < out + stop ? 1 : 1 - ease(Math.min(1, (u - out - stop) / out)));
  let arrive = 0, t = 0, total = stop, i = 0, cur = null;   // cur：正在演的 during 拍 { beat, t0, dur }
  // 要趕的環上時間、開始時的時鐘偏移（每幀直接算偏移 = offset0 + 環上走了多少 − 真實經過的秒數 real）、趕路那段的曲線（trainRun）。
  // t 是演出時間（蒙太奇 2 倍速時列車整段跟著快）；列車時鐘 ctx.now 是真實時間，所以偏移扣的是 real
  let need = 0, offset0 = 0, real = 0, run = () => 0;
  // 第 u 秒環上走了多少（以原速的秒計）：趕路（trainRun）→ 停住 → 加速回原速
  const ringRun = u => {
    if (u < arrive) return run(u);
    const w = u - arrive - hold;
    if (w <= 0) return need;
    return w < SPUR_PULL ? need + w * w / (2 * SPUR_PULL) : need + SPUR_PULL / 2 + (w - SPUR_PULL);
  };
  const open = (ctx, t0) => {
    while (i < subs.length) {
      const beat = subs[i++], shown = beat.start?.(ctx), d = shown === false ? 0 : (typeof beat.dur === 'function' ? beat.dur(ctx) : beat.dur);
      if (d > 0) { cur = { beat, t0, dur: d }; return; }
      beat.end?.(ctx);
    }
    cur = null;
  };
  return {
    kind: 'trainStop', spur, during: subs,   // spur、during 原樣留在拍上（測試看開進哪條支線、裡面的拍）
    dur: () => arrive + total,
    start(ctx) {
      i = 0; cur = null;
      if (!partOf('token.train', ctx) || !trainSpeed(ctx)) return false;
      ({ need, arrive, run } = trainRun(ctx, trip ? trip.a : at, { within, boost, launch, back }));
      t = 0; real = 0; offset0 = ctx.rail.offset;
      const sub = subs.reduce((a, b) => a + durOf(b, ctx), 0);
      total = trip ? out + Math.max(stop + out + SPUR_PULL, sub) : Math.max(stop, sub);
    },
    step(_k, dt, ctx) {
      t += dt; real += dt / rate(ctx); ctx.rail.offset = offset0 + ringRun(t) - real;
      if (trip) ctx.rail.trip = t > arrive && t < arrive + hold ? { ...trip, s: tripS(t - arrive) } : null;
      if (t < arrive + out) return;
      if (!cur && i === 0) open(ctx, arrive + out);
      while (cur) {
        const sk = Math.min(1, (t - cur.t0) / cur.dur);
        cur.beat.step?.(sk, dt, ctx);
        if (sk < 1) return;
        const c = cur; c.beat.end?.(ctx); open(ctx, c.t0 + c.dur);
      }
    },
    // start 回 false（沒列車、淹水停駛）時時間軸照樣呼叫 end：during 剩下的拍 start → end 一口氣跑完（跳下車的 jump.end 把人放到落點）
    end(ctx) {
      if (trip) ctx.rail.trip = null;
      cur?.beat.end?.(ctx); cur = null;
      while (i < subs.length) { const beat = subs[i++]; beat.start?.(ctx); beat.end?.(ctx); }
    },
  };
}

// 拋物線跳到會動的目標（列車車頂），目標每幀重算；end 落在目標上
export function jump(who, target, dur = 0.5) {
  let m = null, p0 = null;
  return {
    kind: 'jump', dur,
    start(ctx) { m = memberOf(who, ctx); if (!m || m.hidden) { m = null; return false; } ctx.roster.claim(m); p0 = { ...m.pos }; },
    step(k, dt, ctx) {
      const q = target(ctx);
      ctx.roster.setPose(m, { x: lerp(p0.x, q.x, k), y: lerp(p0.y, q.y, k) + JUMP_H * Math.sin(Math.PI * k), z: lerp(p0.z, q.z, k), yaw: q.yaw });
    },
    end(ctx) { if (m) ctx.roster.setPose(m, { ...target(ctx), walking: false }); },
  };
}

export const B = {
  spawn, walk, bubble, gesture, apply, levelUp, focus, world, worldNow, wait, home, together, move, scaleIn, replay,
  hideParts, showParts, flash, trainDepart, trainStop, trainRun, trainRuns, trainHead, seat, ridePose, jump, tilt, partHead,
};
