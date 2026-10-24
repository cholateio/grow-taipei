// 連鎖規則引擎：place(state, id) → { state, events }。不可變，Node 與瀏覽器共用。
// 語意見設計文件 §6.2：放置 → 放置反應 → 反覆掃描升級到不動為止 → 回合結束反應。
import * as defaultSpec from './spec.js';
import { compile } from './conditions.js';

export const SCAN_LIMIT = 64;

const compiled = new WeakMap();
function rulesOf(spec) {
  if (compiled.has(spec)) return compiled.get(spec);
  const ctx = { max: Object.fromEntries(spec.ORDER.map(id => [id, spec.ITEMS[id].max])) };
  const cAct = a => ({ ...a, test: a.when ? compile(a.when, ctx) : () => true, branchTest: a.branch ? compile(a.branch.when, ctx) : null });
  const r = { ctx, items: {} };
  for (const id of spec.ORDER) {
    const it = spec.ITEMS[id];
    const up = {};
    for (const n in it.up) up[n] = compile(it.up[n], ctx);
    const onLevel = {};
    for (const n in it.onLevel || {}) onLevel[n] = it.onLevel[n].map(cAct);
    r.items[id] = { max: it.max, up, fx: (it.fx || []).map(cAct), onLevel, stall: (it.stall || []).map(cAct) };
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

// 套用一條 Action；成立就回傳一個事件，否則 null。會直接改 s（呼叫端已拷貝）。
function applyAction(s, a, kind, cause, rules) {
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
  const s = { lv: { ...state.lv }, age: { ...state.age }, locked: { ...state.locked }, flags: { ...state.flags }, order: [...state.order, id], turn: state.turn + 1 };
  const events = [];
  const push = e => { if (e) events.push(e); };

  for (const k of spec.ORDER) if (s.lv[k] > 0) s.age[k] += 1;
  s.lv[id] = 1; s.age[id] = 0;
  events.push({ kind: 'placed', item: id, to: 1, story: spec.STORIES.placed[id] });

  for (const a of rules.items[id].fx) push(applyAction(s, a, 'fx', id, rules));

  const stalled = new Set();
  let lastGrown = null;
  for (let scan = 0; ; scan++) {
    if (scan >= SCAN_LIMIT) throw new Error(`scan limit ${SCAN_LIMIT} exceeded while growing ${lastGrown}`);
    let changed = false;
    for (const k of spec.ORDER) {
      const it = rules.items[k], lv = s.lv[k];
      if (lv === 0 || lv >= it.max || s.locked[k]) continue;
      const st = it.stall.find(r => r.test(s));
      if (st) {
        if (!stalled.has(k)) { stalled.add(k); const e = { kind: 'stall', item: k }; if (st.story !== undefined) e.story = st.story; events.push(e); }
        continue;
      }
      if (!it.up[lv + 1](s)) continue;
      s.lv[k] = lv + 1; lastGrown = k; changed = true;
      events.push({ kind: 'grow', item: k, from: lv, to: lv + 1, story: spec.STORIES.grow[k][lv + 1] });
      for (const a of it.onLevel[lv + 1] || []) push(applyAction(s, a, 'fx', k, rules));
    }
    if (!changed) break;
  }

  for (const a of rules.after) push(applyAction(s, a, 'after', id, rules));
  return { state: s, events };
}
