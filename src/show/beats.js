// 拍的建構函數：劇本（turn.js 與各物品的腳本）用這些小積木排出一回合，交給 timeline.js 一拍一拍演。
// 每個建構函數回一個拍 { kind, dur, start?, step?, end? }（kind 同函數名），只動 ctx 裡的東西（stage、roster、nav、bubbles、flash、rig、rail…）。
// 跳過、reduced-motion 時拍只會 start → end、不 step，所以每一拍的 end 都要自己把東西放到最終狀態。
import { together } from './timeline.js';
import { FLASH } from './flash.js';
import { SEATS } from './roster.js';
import { trainPose } from '../actors/token.js';
import { anchorWorld, ANCHORS } from '../actors/anchors.js';
import { createPathCursor } from '../scene/path.js';

export { together };
export const GESTURE_DUR = { knock: 1.0, wave: 1.0, jump: 0.6, look: 0.6, sniff: 1.5, puff: 0.8 };
export const TRAIN_ARRIVE = 4, TRAIN_STOP = 3, TRAIN_MAX_BOOST = 3;
const STATION = anchorWorld('token');
export const STATION_A = Math.atan2(STATION.z, STATION.x);   // 捷運站對島心的方位（列車車頭停在站前島緣）
const STAGGER = 0.15, DEPART_BEHIND = 0.6, TRAIN_SPEED = 0.35, RIDE_Y = 0.18, TRAIN_HEAD_Y = 0.5, JUMP_H = 0.7, HOP_H = 0.4, PUFF = 0.15, TWO_PI = 2 * Math.PI;

const lerp = (a, b, k) => a + (b - a) * k;
const call = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);
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
  return { head: () => { const p = trainPose(ctx.now + ctx.rail.offset, 0, { speed: trainSpeed(ctx) }); return { x: p.x, y: p.y + TRAIN_HEAD_Y, z: p.z }; } };
}
// 車頂第 i 個座位現在的位置：和名冊的 ride 一樣沿車身前進方向偏移
export function seat(i, ctx) {
  return () => {
    const seats = SEATS[ctx.stage.lv.token >= 3 ? 5 : 3], [car, off] = seats[i % seats.length];
    const p = trainPose(ctx.now + ctx.rail.offset, car, { speed: trainSpeed(ctx) });
    return { x: p.x + Math.sin(p.yaw) * off, y: p.y + RIDE_Y, z: p.z + Math.cos(p.yaw) * off, yaw: p.yaw };
  };
}

// 從 hold 住的名冊拿一個人出來（名冊自己會在他身上閃白光、最亮時露出）；拍演完後 beat.member 就是他
export function spawn(key, at) {
  const beat = { kind: 'spawn', dur: FLASH, member: null, start(ctx) { beat.member = ctx.roster.spawnHeld(key, call(at, ctx)); } };
  return beat;
}

export function walk(who, to, { speed } = {}) {
  let m = null, route = null, cursor = null, s = 0, total = 0, v = 0;
  const plan = ctx => {
    const mm = memberOf(who, ctx); if (!mm) return null;
    const r = ctx.nav.route(mm.pos, call(to, ctx));
    return { mm, r, len: ctx.nav.routeLength(r), v: (speed ?? mm.speed) * (ctx.montage ? 2 : 1) };
  };
  return {
    kind: 'walk',
    dur: () => total / v,
    estimate(ctx) { const p = plan(ctx); return !p || p.len < 1e-6 ? 0 : p.len / p.v; },
    start(ctx) {
      const p = plan(ctx); m = p?.mm ?? null; if (!m) return false; route = p.r; total = p.len; v = p.v; s = 0;
      ctx.roster.claim(m);
      if (total < 1e-6) return false;
      cursor = createPathCursor(route, { loop: false });
    },
    step(k, dt, ctx) {
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
    start(ctx) { const r = resolveTarget(who, ctx); if (!r) return false; handle = ctx.bubbles.show(r.head, kind, dur); },
    end() { handle?.cancel(); handle = null; },
  };
}

// 小動作。people：交給小人的 gesture（look 另外帶 { at } 決定轉向，演完就一直朝那邊）；
// 模型：sniff 左右轉頭、jump 原地拋物線；零件鍵 + puff：零件鼓起來再縮回去
export function gesture(who, kind, dur = GESTURE_DUR[kind], { at } = {}) {
  if (typeof dur === 'object') { at = dur.at; dur = GESTURE_DUR[kind]; }   // gesture(m, 'look', { at })
  let m = null, obj = null, base = null, yaw;
  return {
    kind: 'gesture', dur,
    start(ctx) {
      if (isPartKey(who)) { obj = partOf(who, ctx); if (!obj) return false; base = obj.scale.clone(); return; }
      m = memberOf(who, ctx); if (!m) return false;
      ctx.roster.claim(m);   // 名冊日常不再擺這個人，sniff／jump 才不會被蓋掉
      yaw = kind === 'look' && at ? Math.atan2(at.x - m.pos.x, at.z - m.pos.z) : undefined;
    },
    step(k) {
      if (obj) { obj.scale.copy(base).multiplyScalar(1 + PUFF * Math.sin(Math.PI * k)); return; }
      if (m.walker) { m.walker.gesture = yaw === undefined ? { kind, k } : { kind, k, yaw }; return; }
      if (!m.holder) return;
      if (kind === 'sniff') m.holder.rotation.y = m.yaw + 0.3 * Math.sin(k * TWO_PI * 2);
      if (kind === 'jump') m.holder.position.y = m.pos.y + HOP_H * Math.sin(Math.PI * k);
    },
    end(ctx) {
      if (obj) { obj.scale.copy(base); return; }
      if (!m) return;
      if (m.walker) m.walker.gesture = null;
      if (m.holder) { m.holder.rotation.y = m.yaw; m.holder.position.y = m.pos.y; }
      if (yaw !== undefined) ctx.roster.setPose(m, { ...m.pos, yaw, walking: false });
    },
  };
}

// 白光的位置：零件的 at；at 在島心的（軌道、支線、列車）改到物品頭上，列車則是車頭那節
const atOrigin = at => !at || Math.abs(at.x) + Math.abs(at.z) < 1e-6;
function flashPoint({ key, at }, ctx) {
  if (!atOrigin(at)) return at;
  if (key === 'token.train') return trainPose(ctx.now + ctx.rail.offset, 0, { speed: trainSpeed(ctx) });
  return ctx.stage.headOf(key.split('.')[0]);
}
// 在島心、又不是物品的零件（衛星島的 sat.boats）沒有地方掛白光：不閃、不算時間，end 照樣 commit
const flashable = ({ key, at }) => !atOrigin(at) || key.split('.')[0] in ANCHORS;

// 套用事件：flash 時新零件先藏著，舞台 pending 的鍵（有東西要露出或移除）依序（間隔 0.15 s）閃白光、最亮那一刻 commit；
// 名冊的鍵不閃（名冊自己在每個人身上閃），也不算進長度。跳過時在 end 一次 commit。
// 白光由這拍自己照時間放（不用 flash 的 delay），等著的才不會先算進畫面上的白光
export function apply(e, { flash = true, only, hold } = {}) {
  let changed = [], fired = 0, t = 0;
  const opts = { ...(only && { only }), ...(hold && { hold }), deferred: flash };
  return {
    kind: 'apply',
    dur: () => (changed.length ? FLASH + STAGGER * (changed.length - 1) : 0),
    estimate: () => (flash ? FLASH : 0),   // 還沒套用不知道幾個零件要閃：蒙太奇估長度時至少算一道白光
    start(ctx) {
      const all = ctx.stage.apply(e, opts).changed; fired = 0; t = 0;
      const pending = new Set(flash ? ctx.stage.pendingKeys() : []);
      changed = all.filter(c => pending.has(c.key) && flashable(c));
      if (!changed.length) return false;
    },
    step(k, dt, ctx) {
      t += dt;
      while (fired < changed.length && t >= STAGGER * fired - 1e-9) {
        const c = changed[fired++];
        ctx.flash.at(flashPoint(c, ctx), { onPeak: () => ctx.stage.commit(c.key) });
      }
    },
    end(ctx) { ctx.stage.commitAll(); ctx.nav.setFootprints(ctx.stage.footprints()); },
  };
}

export function levelUp(target, { text = 'LEVEL UP', down = false } = {}) {
  let handle = null;
  return {
    kind: 'levelUp', dur: 1.0, down,
    start(ctx) {
      const r = resolveTarget(target, ctx); if (!r) return false;
      handle = ctx.bubbles.levelUp(r.head, { text: down && text === 'LEVEL UP' ? 'LEVEL DOWN' : text, down });
    },
    end() { handle?.cancel(); handle = null; },
  };
}

export function camera(target) {
  return {
    kind: 'camera', dur: 1.0,
    start(ctx) { const ms = ctx.instant ? 0 : 1000; if (target === 'home') ctx.rig.home(ms); else ctx.rig.panTo(target, ms); },
  };
}

export function world(effects) {
  return { kind: 'world', dur: 0, start(ctx) { ctx.world(effects, !!ctx.instant); } };
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

// 零件歪掉（攤車被撞歪）；下一次該零件重建就回正
export function tilt(key, { rz = 0.25, dur = 0.3 } = {}) {
  let obj = null;
  return {
    kind: 'tilt', dur,
    start(ctx) { obj = partOf(key, ctx); if (!obj) return false; },
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

// 列車進站：車頭還要 need 秒才到 at；太久就把列車時鐘加速 k 倍（最多 3 倍）在 4 秒內進站，
// 到站後停 stop 秒（預設 3；時鐘偏移跟時間等速倒退，車不動），之後照常開。跳過時什麼都不改（車照原本的時鐘跑）
// during：到站那一刻才開始依序演的一串拍（站前的人接箱子、再走開），車停 stop 秒照樣開走，這拍演到 during 也演完為止；
//   長度在 start 時就要給時間軸，所以用每拍的 estimate（walk）或固定 dur 估。跳過或沒有列車時 during 每拍 start → end
const durOf = (b, ctx) => { const d = b.estimate ? b.estimate(ctx) : typeof b.dur === 'function' ? b.dur(ctx) : b.dur; return d > 0 ? d : 0; };
export function trainStop({ at = STATION_A, stop = TRAIN_STOP, during = [] } = {}) {
  const subs = [].concat(during);
  let k = 1, arrive = 0, t = 0, total = stop, i = 0, cur = null;   // cur：正在演的 during 拍 { beat, t0, dur }
  const open = (ctx, t0) => {
    while (i < subs.length) {
      const beat = subs[i++], shown = beat.start?.(ctx), d = shown === false ? 0 : (typeof beat.dur === 'function' ? beat.dur(ctx) : beat.dur);
      if (d > 0) { cur = { beat, t0, dur: d }; return; }
      beat.end?.(ctx);
    }
    cur = null;
  };
  return {
    kind: 'trainStop',
    dur: () => arrive + total,
    start(ctx) {
      i = 0; cur = null;
      const speed = trainSpeed(ctx);
      if (!partOf('token.train', ctx) || !speed) return false;
      const a0 = (ctx.now + ctx.rail.offset) * speed, need = ((((at - a0) % TWO_PI) + TWO_PI) % TWO_PI) / speed;
      k = need <= TRAIN_ARRIVE ? 1 : Math.min(TRAIN_MAX_BOOST, need / TRAIN_ARRIVE);
      arrive = need / k; t = 0;
      total = Math.max(stop, subs.reduce((a, b) => a + durOf(b, ctx), 0));
    },
    step(_k, dt, ctx) {
      // 跨過到站、開車那一刻的一幀拆開：進站的部分加速、停站的部分停住、之後照常
      const run = Math.max(0, Math.min(dt, arrive - t)), held = Math.max(0, Math.min(dt - run, arrive + stop - t - run));
      ctx.rail.offset += run * (k - 1) - held; t += dt;
      if (t < arrive) return;
      if (!cur && i === 0) open(ctx, arrive);
      while (cur) {
        const sk = Math.min(1, (t - cur.t0) / cur.dur);
        cur.beat.step?.(sk, dt, ctx);
        if (sk < 1) return;
        const c = cur; c.beat.end?.(ctx); open(ctx, c.t0 + c.dur);
      }
    },
    end(ctx) {
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
    start(ctx) { m = memberOf(who, ctx); if (!m) return false; ctx.roster.claim(m); p0 = { ...m.pos }; },
    step(k, dt, ctx) {
      const q = target(ctx);
      ctx.roster.setPose(m, { x: lerp(p0.x, q.x, k), y: lerp(p0.y, q.y, k) + JUMP_H * Math.sin(Math.PI * k), z: lerp(p0.z, q.z, k), yaw: q.yaw });
    },
    end(ctx) { if (m) ctx.roster.setPose(m, { ...target(ctx), walking: false }); },
  };
}

export const B = {
  spawn, walk, bubble, gesture, apply, levelUp, camera, world, wait, home, together, move, scaleIn,
  hideParts, showParts, trainDepart, trainStop, trainHead, seat, jump, tilt, partHead,
};
