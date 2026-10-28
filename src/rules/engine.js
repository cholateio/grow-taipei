// 連鎖規則引擎：place(state, id) → { state, events }。不可變，Node 與瀏覽器共用。
// 語意見設計文件 §6.2、物品 v2 §3、選擇帶動升級（2026-10-28）§3：放置 → 放置反應 → 反覆掃描升級到不動為止
// （每物品每回合一步：+1 或跳級 +2；連 delta 最多比回合開始高 2 級；剛放下的物品也參加，回合開始它是 0 級所以最多到 Lv2）
// → 被 delay 擋住的記 stall → 等待 → 回合結束反應。
// 跳級：每個物品每一級 n ≥ 3 預設都有 jump[n] = up[n−1] ∧ up[n]（spec 寫的 jump[n] 是另一條，兩條其一成立就跳）；
// steady 的物品（鮮奶）不加預設跳級，只用 spec 寫的。
import * as defaultSpec from './spec.js';
import { compile } from './conditions.js';

export const SCAN_LIMIT = 64;

// 條件裡提到的其他物品（看得見的因果用：升級事件的 via、等待事件的 for）。age/always/flag 不算，自己不算，依 ORDER 排序。
export function condDeps(cond, self, spec = defaultSpec) {
  const found = new Set();
  const walk = c => {
    if (!c || typeof c !== 'object') return;
    for (const key of ['minLevel', 'maxLevel']) if (key in c) found.add(c[key][0]);
    for (const key of ['present', 'absent']) if (key in c) found.add(c[key]);
    for (const key of ['and', 'or']) if (key in c) c[key].forEach(walk);
    if ('ltPlus' in c) { found.add(c.ltPlus[0]); found.add(c.ltPlus[1]); }
  };
  walk(cond); found.delete(self);
  return spec.ORDER.filter(id => found.has(id));
}

// 幫手：條件裡「要有／要夠高」的物品（minLevel、present），不管成不成立。「要低於／不在」的不是幫手（審查 #2）。
// grow 事件的 via 改用 satisfiedHelpers（只列真的成立的）；這個留給規格測試問「這條條件有沒有提到幫手」
export function helperDeps(cond, self, spec = defaultSpec) {
  const found = new Set();
  const walk = c => {
    if (!c || typeof c !== 'object') return;
    if ('minLevel' in c) found.add(c.minLevel[0]);
    if ('present' in c) found.add(c.present);
    for (const key of ['and', 'or']) if (key in c) c[key].forEach(walk);
  };
  walk(cond); found.delete(self);
  return spec.ORDER.filter(id => found.has(id));
}

// 這次真的讓條件成立的幫手（看得見的因果與離島三段 §3、§4：grow 事件的 via，演出層讓 via[0] 走來拜訪）：
// minLevel／present 成立就算；and 要整條成立才算、列全部；or 只算成立的那幾支（兩支都成立就都列）；
// maxLevel／absent／flag／age 不是幫手。整條不成立 → []。自己不算，照 ORDER 排序。
// 跳級的條件本身就是 up[n−1] ∧ up[n]（或再 or 上 spec 寫的那條），所以跳級的 via 自然是兩級的聯集
const holdsCache = new WeakMap();
const holds = (c, s) => { let f = holdsCache.get(c); if (!f) { f = compile(c, {}); holdsCache.set(c, f); } return f(s); };
export function satisfiedHelpers(cond, s, self, spec = defaultSpec) {
  const found = new Set();
  const walk = c => {
    if (!c || typeof c !== 'object' || !holds(c, s)) return false;
    if ('minLevel' in c) found.add(c.minLevel[0]);
    if ('present' in c) found.add(c.present);
    if ('and' in c) c.and.forEach(walk);
    if ('or' in c) c.or.forEach(walk);
    return true;
  };
  walk(cond); found.delete(self);
  return spec.ORDER.filter(id => found.has(id));
}

// 這一刻缺的幫手：沒達標的 minLevel／present（or 已經成立就不缺）
function missingHelpers(cond, s, self, out = new Set()) {
  if (!cond || typeof cond !== 'object') return out;
  if ('minLevel' in cond && s.lv[cond.minLevel[0]] < cond.minLevel[1] && cond.minLevel[0] !== self) out.add(cond.minLevel[0]);
  if ('present' in cond && !(s.lv[cond.present] > 0) && cond.present !== self) out.add(cond.present);
  if ('and' in cond) cond.and.forEach(c => missingHelpers(c, s, self, out));
  if ('or' in cond) { const before = out.size, tmp = new Set(); cond.or.forEach(c => missingHelpers(c, s, self, tmp)); if (tmp.size && before === out.size) for (const id of tmp) out.add(id); }
  return out;
}

const compiled = new WeakMap();
function rulesOf(spec) {
  if (compiled.has(spec)) return compiled.get(spec);
  const ctx = { max: Object.fromEntries(spec.ORDER.map(id => [id, spec.ITEMS[id].max])) };
  const cAct = a => ({ ...a, test: a.when ? compile(a.when, ctx) : () => true, branchTest: a.branch ? compile(a.branch.when, ctx) : null });
  const r = { ctx, items: {} };
  for (const id of spec.ORDER) {
    const it = spec.ITEMS[id];
    const up = {}, jump = {}, jumpRaw = {}, delay = {};
    for (const n in it.up) up[n] = compile(it.up[n], ctx);
    // 預設跳級（選擇帶動升級 §3）：在 n−2、第 n−1 與第 n 級的條件同時成立就一回合 +2；spec 寫的 jump[n] 是另一條（or）。
    // jumpRaw 留著整條條件，升級事件的 via 在決定的那一刻用 satisfiedHelpers 算
    for (let n = 3; n <= it.max; n++) {
      const explicit = it.jump?.[n], auto = it.steady || !it.up[n - 1] || !it.up[n] ? null : { and: [it.up[n - 1], it.up[n]] };
      const cond = explicit && auto ? { or: [explicit, auto] } : explicit || auto;
      if (cond) { jump[n] = compile(cond, ctx); jumpRaw[n] = cond; }
    }
    for (const n in it.delay || {}) delay[n] = compile(it.delay[n], ctx);
    const onLevel = {};
    for (const n in it.onLevel || {}) onLevel[n] = it.onLevel[n].map(cAct);
    r.items[id] = { max: it.max, up, jump, jumpRaw, delay, raw: it.up, fx: (it.fx || []).map(cAct), onLevel, stall: (it.stall || []).map(cAct) };
  }
  r.after = (spec.AFTER_TURN || []).map(cAct);
  compiled.set(spec, r);
  return r;
}

export function createState(spec = defaultSpec) {
  const lv = {}, age = {}, held = {};
  for (const id of spec.ORDER) { lv[id] = 0; age[id] = -1; held[id] = -1; }
  return { lv, age, held, locked: {}, flags: {}, order: [], turn: 0 };
}

// 演出層共用：把一個事件疊到 { lv, flags } 上（舞台的鏡像、遊戲逐事件回報全島狀態）。純函數，不改輸入。
export function foldEvent(view, e) {
  let { lv, flags } = view;
  if (e.kind === 'placed') lv = { ...lv, [e.item]: 1 };
  else if (e.kind === 'grow') lv = { ...lv, [e.item]: e.to };
  if (e.delta) lv = { ...lv, [e.delta.target]: e.delta.to };
  if (e.flag) flags = { ...flags, [e.flag.name]: e.flag.value };
  return lv === view.lv && flags === view.flags ? view : { lv, flags };
}

// 颱風登陸：這個事件把颱風從 <2 帶到 2（只有登陸那回合小人躲起來、雨最大）
export function landsTyphoon(e) {
  if (e.kind === 'grow') return e.item === 'typhoon' && e.from < 2 && e.to === 2;
  return !!e.delta && e.delta.target === 'typhoon' && e.delta.from < 2 && e.delta.to === 2;
}

export const isPlaced = (state, id) => state.lv[id] > 0;
export const isComplete = state => Object.values(state.lv).every(n => n > 0);
export const isAllMax = (state, spec = defaultSpec) => spec.ORDER.every(id => state.lv[id] === spec.ITEMS[id].max);

// 套用一條 Action；成立就把事件推進 events。會直接改 s（呼叫端已拷貝）。
// 正向 delta 跨過的每一級，都會接著觸發那一級的 onLevel（「被加上去」也算升級）。
// 連鎖深度與掃描共用同一個上限，病態規則一律丟出帶物品名的錯誤。
function applyAction(s, a, kind, cause, rules, events, depth = 0) {
  const ev = actionEvent(s, a, kind, cause, rules);
  if (!ev) return;
  events.push(ev);
  if (ev.delta && ev.delta.to > ev.delta.from) {
    const { target, from, to } = ev.delta;
    if (depth >= SCAN_LIMIT) throw new Error(`delta chain limit ${SCAN_LIMIT} exceeded at ${target}`);
    for (let n = from + 1; n <= to; n++) for (const b of rules.items[target].onLevel[n] || []) applyAction(s, b, 'fx', target, rules, events, depth + 1);
  }
}

// 每回合開始時各物品的級數（R4 的 +2 上限用）；鍵是 turn() 裡的工作狀態，回合結束就沒人引用
const turnStart = new WeakMap();

function actionEvent(s, a, kind, cause, rules) {
  if (!a.test(s)) return null;
  const ev = { kind, item: cause, cause };
  if (a.delta) {
    const { target, by } = a.delta;
    if (!(s.lv[target] > 0)) return null;
    // 裁決 R4：每回合每物品最多 +2，delta 也算——正向 delta 壓到「回合開始的級數 +2」，壓到不動就整條不發
    const cap = by > 0 ? (turnStart.get(s)?.[target] ?? s.lv[target]) + 2 : Infinity;
    const from = s.lv[target], to = Math.max(1, Math.min(rules.items[target].max, from + by, Math.max(from, cap)));
    if (by > 0 && to === from) return null;
    s.lv[target] = to; if (to !== from) s.held[target] = 0;
    ev.item = target;
    ev.delta = { target, from, to };
  }
  if (a.lock) { s.locked[a.lock] = true; ev.lock = a.lock; }
  if (a.flag) { const value = a.flag.value ?? true; s.flags[a.flag.name] = value; ev.flag = { name: a.flag.name, value }; }
  if (a.branch) { const value = a.branchTest(s) ? a.branch.then : a.branch.else; s.flags[a.branch.flag] = value; ev.flag = { name: a.branch.flag, value }; }
  if (a.story !== undefined) ev.story = a.story;
  return ev;
}

export function place(state, id, spec = defaultSpec) {
  const rules = rulesOf(spec);
  if (!(id in rules.items)) throw new Error(`unknown item ${id}`);
  if (state.lv[id] > 0) throw new Error(`${id} already placed`);
  return turn(state, id, spec, rules);
}

// 沒有放置的回合（最後一輪成長：第 8 個物品放完後全島再長 spec.CLOSING_TURNS 回合，才是飛彈警告）
export function advance(state, spec = defaultSpec) { return turn(state, null, spec, rulesOf(spec)); }

function turn(state, id, spec, rules) {
  const s = { lv: { ...state.lv }, age: { ...state.age }, held: { ...state.held }, locked: { ...state.locked }, flags: { ...state.flags }, order: id ? [...state.order, id] : [...state.order], turn: state.turn + 1 };
  const events = [];

  // age = 放下幾回合；held = 停在目前這一級幾回合（delay 用；升級或被 delta 改級就歸零）
  for (const k of spec.ORDER) if (s.lv[k] > 0) { s.age[k] += 1; s.held[k] = (s.held[k] ?? 0) + 1; }
  turnStart.set(s, { ...s.lv });
  if (id) {
    s.lv[id] = 1; s.age[id] = 0; s.held[id] = 0;
    events.push({ kind: 'placed', item: id, to: 1, story: spec.STORIES.placed[id] });
    for (const a of rules.items[id].fx) applyAction(s, a, 'fx', id, rules, events);
  }

  // GROW 的節奏（使用者 2026-10-25、物品 v2 §3、裁決 R2／R4／R5、選擇帶動升級 §3）：每回合每個物品只走一步——在 n−2 且 jump[n]
  // 成立就跳（+2；每一級都有預設跳級 up[n−1] ∧ up[n]，steady 的除外），否則 up 成立就 +1；連 delta 在內一回合最多比回合開始高 2 級。
  // 剛放下的物品當回合也參加掃描（使用者 2026-10-28：要看得出「因為我現在放了 X」）：回合開始它是 0 級，所以放下當回合最多到 Lv2。
  // 照 ORDER 反覆掃到不動為止（A 升了讓 B 升的連鎖還在），掃到誰就當場決定，不為了等跳級延後 +1。
  // delay[n] 成立時，第 n 級要在上一級多停一回合（held ≥ 2）。
  const stalled = new Set(), grown = new Set(), start = turnStart.get(s);
  const delayed = (k, n) => { const d = rules.items[k].delay[n]; return !!d && d(s) && s.held[k] < 2; };   // 第 n 級還要多等一回合
  let lastGrown = null;
  for (let scan = 0; ; scan++) {
    if (scan >= SCAN_LIMIT) throw new Error(`scan limit ${SCAN_LIMIT} exceeded while growing ${lastGrown}`);
    let changed = false;
    for (const k of spec.ORDER) {
      const it = rules.items[k], lv = s.lv[k];
      if (lv === 0 || lv >= it.max || s.locked[k] || grown.has(k)) continue;
      const st = it.stall.find(r => r.test(s));
      if (st) {
        if (!stalled.has(k)) { stalled.add(k); const e = { kind: 'stall', item: k }; if (st.story !== undefined) e.story = st.story; events.push(e); }
        continue;
      }
      const room = start[k] + 2, ready = n => n <= room && !delayed(k, n);
      const jump = lv + 2 <= it.max && it.jump[lv + 2] && ready(lv + 2) && it.jump[lv + 2](s);
      if (!jump && !(ready(lv + 1) && it.up[lv + 1](s))) continue;
      const to = jump ? lv + 2 : lv + 1;
      // via 在改級之前算（條件是照這一刻的全島狀態成立的）；跳級的兩個事件共用同一份
      const via = satisfiedHelpers(jump ? it.jumpRaw[to] : it.raw[to], s, k, spec);
      lastGrown = k; changed = true; grown.add(k);
      for (let n = lv + 1; n <= to; n++) {
        s.lv[k] = n; s.held[k] = 0;
        const e = { kind: 'grow', item: k, from: n - 1, to: n, story: spec.STORIES.grow[k][n], via: [...via] };
        if (jump && n === to) e.jump = true;
        events.push(e);
        for (const a of it.onLevel[n] || []) applyAction(s, a, 'fx', k, rules, events);
      }
    }
    if (!changed) break;
  }

  // 只差多等一回合的物品（+1 條件成立、delay[n] 擋著，颱風賴在巨蛋）：記一個 stall 事件（演出層演「……」）；不算在等誰
  for (const k of spec.ORDER) {
    const it = rules.items[k], lv = s.lv[k], n = lv + 1;
    if (lv === 0 || lv >= it.max || s.locked[k] || grown.has(k) || stalled.has(k) || k === id) continue;
    if (delayed(k, n) && it.up[n](s)) { stalled.add(k); events.push({ kind: 'stall', item: k }); }
  }

  // 等不到幫手的物品：整回合合成一個 wait 事件，for = 這一刻缺的幫手（剛放的、這回合升過的、卡在 stall 的不算；
  // 只被「要低於／不在」擋住的不算在等誰；剛放的照舊不算——它當回合也參加掃描，但「還沒開始等」）
  const waits = [];
  for (const k of spec.ORDER) {
    const it = rules.items[k], lv = s.lv[k];
    if (lv === 0 || lv >= it.max || s.locked[k] || grown.has(k) || stalled.has(k) || k === id || it.up[lv + 1](s)) continue;
    const missing = missingHelpers(it.raw[lv + 1], s, k);
    if (missing.size) waits.push({ item: k, for: spec.ORDER.filter(id => missing.has(id)) });
  }
  if (waits.length) events.push({ kind: 'wait', item: waits[0].item, waits });

  for (const a of rules.after) applyAction(s, a, 'after', id ?? 'turn', rules, events);
  return { state: s, events };
}
