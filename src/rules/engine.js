// 連鎖規則引擎：place(state, id) → { state, events }。不可變，Node 與瀏覽器共用。
// 語意見設計文件 §6.2：放置 → 放置反應 → 反覆掃描升級到不動為止（每物品每回合最多一級）→ 回合結束反應。
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

// 幫手：條件裡「要有／要夠高」的物品（minLevel、present）。「要低於／不在」的不是幫手（審查 #2）
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
    const up = {}, deps = {};
    for (const n in it.up) { up[n] = compile(it.up[n], ctx); deps[n] = helperDeps(it.up[n], id, spec); }
    const onLevel = {};
    for (const n in it.onLevel || {}) onLevel[n] = it.onLevel[n].map(cAct);
    r.items[id] = { max: it.max, up, deps, raw: it.up, fx: (it.fx || []).map(cAct), onLevel, stall: (it.stall || []).map(cAct) };
  }
  r.after = (spec.AFTER_TURN || []).map(cAct);
  compiled.set(spec, r);
  return r;
}

export function createState(spec = defaultSpec) {
  const lv = {}, age = {};
  for (const id of spec.ORDER) { lv[id] = 0; age[id] = -1; }
  return { lv, age, locked: {}, flags: {}, order: [], turn: 0 };
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

function actionEvent(s, a, kind, cause, rules) {
  if (!a.test(s)) return null;
  const ev = { kind, item: cause, cause };
  if (a.delta) {
    const { target, by } = a.delta;
    if (!(s.lv[target] > 0)) return null;
    const from = s.lv[target], to = Math.max(1, Math.min(rules.items[target].max, from + by));
    s.lv[target] = to;
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

// 沒有放置的回合（飛彈倒數：第 8 個物品放完後全島再長 spec.CLOSING_TURNS 回合）
export function advance(state, spec = defaultSpec) { return turn(state, null, spec, rulesOf(spec)); }

function turn(state, id, spec, rules) {
  const s = { lv: { ...state.lv }, age: { ...state.age }, locked: { ...state.locked }, flags: { ...state.flags }, order: id ? [...state.order, id] : [...state.order], turn: state.turn + 1 };
  const events = [];

  for (const k of spec.ORDER) if (s.lv[k] > 0) s.age[k] += 1;
  if (id) {
    s.lv[id] = 1; s.age[id] = 0;
    events.push({ kind: 'placed', item: id, to: 1, story: spec.STORIES.placed[id] });
    for (const a of rules.items[id].fx) applyAction(s, a, 'fx', id, rules, events);
  }

  // GROW 的節奏（使用者 2026-10-25）：每回合每個物品最多升一級，剛放下的物品當回合不升。
  // 掃描仍反覆到不動為止，所以 A 升了讓 B 升的連鎖還在，只是每人每回合一步。
  const stalled = new Set(), grown = new Set(id ? [id] : []);
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
      if (!it.up[lv + 1](s)) continue;
      s.lv[k] = lv + 1; lastGrown = k; changed = true; grown.add(k);
      events.push({ kind: 'grow', item: k, from: lv, to: lv + 1, story: spec.STORIES.grow[k][lv + 1], via: it.deps[lv + 1] });
      for (const a of it.onLevel[lv + 1] || []) applyAction(s, a, 'fx', k, rules, events);
    }
    if (!changed) break;
  }

  // 等不到幫手的物品：整回合合成一個 wait 事件，for = 這一刻缺的幫手（剛放的、這回合升過的、卡在 stall 的不算；
  // 只被「要低於／不在」擋住的不算在等誰）
  const waits = [];
  for (const k of spec.ORDER) {
    const it = rules.items[k], lv = s.lv[k];
    if (lv === 0 || lv >= it.max || s.locked[k] || grown.has(k) || stalled.has(k) || it.up[lv + 1](s)) continue;
    const missing = missingHelpers(it.raw[lv + 1], s, k);
    if (missing.size) waits.push({ item: k, for: spec.ORDER.filter(id => missing.has(id)) });
  }
  if (waits.length) events.push({ kind: 'wait', item: waits[0].item, waits });

  for (const a of rules.after) applyAction(s, a, 'after', id ?? 'turn', rules, events);
  return { state: s, events };
}
