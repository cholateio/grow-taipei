import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, place, advance, isAllMax, isComplete, SCAN_LIMIT, condDeps, foldEvent, landsTyphoon, satisfiedHelpers } from '../src/rules/engine.js';

// 迷你 spec：a 放了就自己每回合升；b 的 Lv2 需要 a>=2，Lv3 需要 a>=3（同回合連鎖）
const mini = {
  ORDER: ['a','b','c','d'],
  ITEMS: {
    a: { name:'A', max:3, up:{ 2:{age:['a',1]}, 3:{age:['a',2]} } },
    b: { name:'B', max:3, up:{ 2:{minLevel:['a',2]}, 3:{minLevel:['a',3]} },
         onLevel:{ 3:[{ when:{present:'c'}, delta:{target:'c', by:-1}, story:'b踩到c' }] } },
    c: { name:'C', max:2, up:{ 2:{always:true} }, stall:[{ when:{present:'b'}, story:'c被b擋住' }] },
    d: { name:'D', max:1, up:{} },
  },
  AFTER_TURN: [{ when:{and:[{present:'a'},{age:['a',1]}]}, flag:{name:'aOld'}, story:'a老了' }],
  STORIES: { placed:{a:'放a',b:'放b',c:'放c',d:'放d'}, grow:{ a:{2:'a2',3:'a3'}, b:{2:'b2',3:'b3'}, c:{2:'c2'}, d:{} } },
};

test('placing sets level 1, age 0, records order and a placed event', () => {
  const { state, events } = place(createState(mini), 'a', mini);
  assert.equal(state.lv.a, 1); assert.equal(state.age.a, 0); assert.deepEqual(state.order, ['a']); assert.equal(state.turn, 1);
  assert.deepEqual(events[0], { kind:'placed', item:'a', to:1, story:'放a' });
});
// GROW 的節奏：每回合每個物品只走一步（使用者 2026-10-25）；剛放下的物品當回合也長，但最多到 Lv2（選擇帶動升級 2026-10-28 §3）
test('ages advance each turn; an item takes one step per turn and a placed item grows in its own turn up to Lv2', () => {
  let s = createState(mini);
  s = place(s, 'a', mini).state;          // a1（age 0：up[2] 要 age 1，放下當回合不成立）
  assert.equal(s.lv.a, 1);
  const t2 = place(s, 'b', mini);          // a2（age 1）；b 剛放，同回合跟著 a ≥ 2 長到 2（放下當回合最多 Lv2）
  s = t2.state; assert.equal(s.lv.a, 2); assert.equal(s.lv.b, 2);
  assert.deepEqual(t2.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`), ['a2', 'b2']);
  const t3 = place(s, 'c', mini);          // a3 → b3（b3 的反應想扣 c，c 已經 1 扣不動，但算被打到：這回合不長、不記 stall——修正批次 2）
  s = t3.state; assert.equal(s.lv.a, 3); assert.equal(s.lv.b, 3); assert.equal(s.lv.c, 1);
  assert.deepEqual(t3.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`), ['a3', 'b3']);
  assert.ok(t3.events.some(e => e.kind === 'fx' && e.delta?.target === 'c'), 'b3 knocks the fresh c');
  assert.ok(!t3.events.some(e => e.kind === 'stall'), 'a knocked item sits the turn out: no stall either');
  const t4 = place(s, 'd', mini);          // 沒有人能動：c 被 b 擋住
  assert.equal(t4.state.lv.c, 1); assert.deepEqual(t4.events.filter(e => e.kind === 'grow'), []);
  assert.ok(t4.events.some(e => e.kind === 'stall' && e.item === 'c'), 'the next turn c is stalled by b');
});
test('a cascade within a turn still works: A growing lets B grow in the same scan pass', () => {
  const chain = { ORDER:['p','q','r'], ITEMS:{
    p:{ name:'P', max:2, up:{2:{age:['p',1]}} }, q:{ name:'Q', max:2, up:{2:{minLevel:['p',2]}} }, r:{ name:'R', max:1, up:{} } },
    AFTER_TURN:[], STORIES:{placed:{p:'',q:'',r:''},grow:{p:{2:''},q:{2:''},r:{}}} };
  let s = place(createState(chain), 'q', chain).state; s = place(s, 'p', chain).state;
  const t = place(s, 'r', chain);           // p 升 2 → 同回合 q 也升 2
  assert.equal(t.state.lv.p, 2); assert.equal(t.state.lv.q, 2);
});
test('stall blocks growth and records one stall event per turn', () => {
  let s = createState(mini);
  s = place(s, 'b', mini).state;          // b1（a 沒放，b 長不了）
  let r = place(s, 'c', mini);            // c up always，但 b 在場 → 剛放下就擋住
  assert.equal(r.state.lv.c, 1); assert.equal(r.events.filter(e => e.kind === 'stall' && e.item === 'c').length, 1);
  r = place(r.state, 'd', mini);
  assert.equal(r.state.lv.c, 1); assert.equal(r.events.filter(e => e.kind === 'stall' && e.item === 'c').length, 1);
});
test('locked item never grows', () => {
  let s = createState(mini); s = place(s, 'a', mini).state;
  s = { ...s, locked: { ...s.locked, a: true } };
  s = place(s, 'c', mini).state; assert.equal(s.lv.a, 1);
});
test('AFTER_TURN actions evaluate once per turn and set flags', () => {
  let s = createState(mini); s = place(s, 'a', mini).state;
  assert.equal(s.flags.aOld, undefined);
  const r = place(s, 'c', mini); assert.equal(r.state.flags.aOld, true);
  assert.ok(r.events.some(e => e.kind === 'after' && e.story === 'a老了'));
});
test('placing twice throws', () => {
  const s = place(createState(mini), 'a', mini).state;
  assert.throws(() => place(s, 'a', mini), /already placed/);
});
test('state is immutable', () => {
  const s0 = createState(mini); place(s0, 'a', mini); assert.equal(s0.lv.a, 0); assert.deepEqual(s0.order, []);
});
test('deterministic: same order gives identical event JSON', () => {
  const run = () => { let s = createState(mini); const ev = []; for (const id of ['c','a','b']) { const r = place(s, id, mini); s = r.state; ev.push(...r.events); } return JSON.stringify(ev); };
  assert.equal(run(), run());
});
test('a mutually knocking-back pair no longer loops: one level per item per turn bounds the scan', () => {
  const bad = { ORDER:['x','y','z'], ITEMS:{
    x:{ name:'X', max:3, up:{2:{always:true},3:{always:true}}, onLevel:{3:[{delta:{target:'y', by:-1}}]} },
    y:{ name:'Y', max:3, up:{2:{always:true},3:{always:true}}, onLevel:{3:[{delta:{target:'x', by:-1}}]} },
    z:{ name:'Z', max:1, up:{} } },
    AFTER_TURN:[], STORIES:{placed:{x:'',y:'',z:''},grow:{x:{2:'',3:''},y:{2:'',3:''},z:{}}} };
  let s = place(createState(bad), 'x', bad).state; s = place(s, 'y', bad).state;
  const t = place(s, 'z', bad);
  assert.ok(SCAN_LIMIT > 0); assert.equal(t.state.lv.x, 3); assert.equal(t.state.lv.y, 2);   // x 升 3 想扣 y，y 還在 1 扣不動，接著 y 自己升 2
});
test('isComplete / isAllMax on the real spec shape', () => {
  const s = createState(mini); assert.equal(isComplete(s), false); assert.equal(isAllMax(s, mini), false);
});
test('a positive delta that crosses a level fires that level\'s onLevel actions', () => {
  const sp = { ORDER: ['p','q','r'], ITEMS: {
      p: { name:'P', max:3, up:{ 2:{always:true}, 3:{minLevel:['p',9]} }, onLevel:{ 3:[{ flag:{name:'p3'}, story:'p到3' }] } },
      q: { name:'Q', max:2, up:{ 2:{minLevel:['q',9]} }, fx:[{ delta:{target:'p', by:1}, story:'q推p' }] },
      r: { name:'R', max:1, up:{} } },
    AFTER_TURN: [], STORIES: { placed:{p:'',q:'',r:''}, grow:{ p:{2:'',3:''}, q:{2:''}, r:{} } } };
  let s = place(createState(sp), 'p', sp).state; s = place(s, 'r', sp).state;   // p → 2（3 永遠不會自己升）
  assert.equal(s.lv.p, 2);
  const r = place(s, 'q', sp);                       // q 的放置反應把 p 推到 3
  assert.equal(r.state.lv.p, 3); assert.equal(r.state.flags.p3, true);
  const kinds = r.events.map(e => e.kind + (e.story ?? ''));
  assert.ok(kinds.indexOf('fxq推p') < kinds.indexOf('fxp到3'));
});
test('a delta↔onLevel cycle throws a named chain-limit error instead of a stack overflow', () => {
  const sp = { ORDER: ['x','y','z'], ITEMS: {
      x: { name:'X', max:3, up:{ 2:{always:true}, 3:{always:true} },
           onLevel:{ 3:[{ delta:{target:'x', by:-1} }, { delta:{target:'x', by:1} }] } },
      y: { name:'Y', max:1, up:{} }, z: { name:'Z', max:1, up:{} } },
    AFTER_TURN: [], STORIES: { placed:{x:'',y:'',z:''}, grow:{ x:{2:'',3:''}, y:{}, z:{} } } };
  const s = place(createState(sp), 'x', sp).state;   // x 放下當回合就到 2
  assert.equal(s.lv.x, 2);
  assert.throws(() => place(s, 'y', sp), /chain limit .* x/);
});
// 飛彈倒數：第 8 個物品放完後全島再長幾回合（spec.CLOSING_TURNS），沒有放置、其餘和一般回合一樣
test('advance runs a growth turn without placing anything', () => {
  let s = place(createState(mini), 'a', mini).state;
  const r = advance(s, mini);
  assert.equal(r.state.lv.a, 2); assert.equal(r.state.age.a, 1); assert.equal(r.state.turn, 2); assert.deepEqual(r.state.order, ['a']);
  assert.deepEqual(r.events.map(e => e.kind), ['grow', 'after']);
  assert.equal(advance(r.state, mini).state.lv.a, 3);
});
// 看得見的因果（§7.2）：升級事件標上 via；等不到別人的物品每回合合成一個 wait 事件
const linked = {
  ORDER: ['a', 'c', 'e', 'z'],
  ITEMS: {
    a: { name: 'A', max: 3, up: { 2: { age: ['a', 2] }, 3: { age: ['a', 3] } } },
    c: { name: 'C', max: 2, up: { 2: { age: ['c', 5] } } },
    e: { name: 'E', max: 3, up: { 2: { minLevel: ['a', 2] }, 3: { and: [{ age: ['e', 2] }, { maxLevel: ['c', 1] }] } } },
    z: { name: 'Z', max: 1, up: {} },
  },
  AFTER_TURN: [], STORIES: { placed: { a: '', c: '', e: '', z: '' }, grow: { a: { 2: '', 3: '' }, c: { 2: '' }, e: { 2: '', 3: '' }, z: {} } },
};
test('condDeps lists the other items a condition mentions, in ORDER, without age/self', () => {
  assert.deepEqual(condDeps({ and: [{ age: ['e', 2] }, { maxLevel: ['c', 1] }, { minLevel: ['a', 2] }, { present: 'e' }] }, 'e', linked), ['a', 'c']);
  assert.deepEqual(condDeps({ always: true }, 'a', linked), []);
  assert.deepEqual(condDeps({ or: [{ absent: 'c' }, { flag: 'x' }] }, 'a', linked), ['c']);
});
test('grow events carry via = the items their condition depends on', () => {
  let s = place(createState(linked), 'a', linked).state; s = place(s, 'e', linked).state;   // a 還是 1（age 1）
  const r = place(s, 'z', linked);                                                         // a → 2，同回合 e → 2（看 a）
  const g = r.events.filter(e => e.kind === 'grow');
  assert.deepEqual(g.map(e => [e.item, e.via]), [['a', []], ['e', ['a']]]);
});
test('wait is one grouped event per turn and absent when nothing waits', () => {
  let s = place(createState(linked), 'a', linked).state;
  let r = place(s, 'e', linked); assert.equal(r.events.filter(e => e.kind === 'wait').length, 0, 'freshly placed e does not wait yet');
  r = place(r.state, 'c', linked);                                // a 到 2 了嗎？a age 2 → 2；e 同回合升 2 → 不等
  assert.equal(r.events.filter(e => e.kind === 'wait').length, 0);
  r = place(r.state, 'z', linked);                                // e 想升 3 需 age 2 且 c ≤ 1：c 是 1 → 成立，e 升 3；a 升 3
  const st = r.state; assert.equal(st.lv.e, 3);
  // 另一條路：先讓 c 長到 2 再看 e 在等 c
  const blocked = { ...linked, ITEMS: { ...linked.ITEMS, c: { name: 'C', max: 2, up: { 2: { always: true } } } } };
  let b = place(createState(blocked), 'c', blocked).state; b = place(b, 'e', blocked).state; b = place(b, 'a', blocked).state;   // c 2、e 1、a 剛放 1
  const r2 = place(b, 'z', blocked);
  const w = r2.events.filter(e => e.kind === 'wait');
  assert.equal(w.length, 1); assert.deepEqual(w[0].waits.find(x => x.item === 'e'), { item: 'e', for: ['a'] });
  assert.ok(!w[0].waits.some(x => x.item === 'z'), 'freshly placed z is not waiting');
});
// 審查 #2：「要低於／不在」的條件不是幫手——via 只列 minLevel/present，wait 只在缺幫手時發、for 列缺的幫手
const keep = {
  ORDER: ['h', 'x', 'k', 'q'],
  ITEMS: {
    h: { name: 'H', max: 2, up: { 2: { age: ['h', 4] } } },
    x: { name: 'X', max: 2, up: { 2: { always: true } } },
    k: { name: 'K', max: 3, up: { 2: { and: [{ age: ['k', 1] }, { maxLevel: ['x', 1] }] }, 3: { and: [{ minLevel: ['h', 2] }, { maxLevel: ['x', 1] }] } } },
    q: { name: 'Q', max: 1, up: {} },
  },
  AFTER_TURN: [], STORIES: { placed: { h: '', x: '', k: '', q: '' }, grow: { h: { 2: '' }, x: { 2: '' }, k: { 2: '', 3: '' }, q: {} } },
};
test('via lists only helpers (minLevel/present), never the "must stay below" items (review #2)', () => {
  let s = place(createState(keep), 'k', keep).state;
  const r = place(s, 'q', keep), g = r.events.find(e => e.kind === 'grow' && e.item === 'k');
  assert.deepEqual(g.via, [], 'x ≤ 1 is not a helper');
});
test('wait fires only when a helper is missing, and names the missing helper (review #2)', () => {
  let s = place(createState(keep), 'k', keep).state; s = place(s, 'q', keep).state;   // k 2；k 3 需 h ≥2（h 還沒放）且 x ≤1
  let r = place(s, 'h', keep); let w = r.events.find(e => e.kind === 'wait');
  assert.deepEqual(w.waits, [{ item: 'k', for: ['h'] }]);
  // 只被「x 要 ≤1」擋住（h 夠了、x 已經 2）：不算在等誰，不發 wait
  const blockedOnlyByMax = { ...keep, ITEMS: { ...keep.ITEMS, h: { name: 'H', max: 2, up: { 2: { always: true } } } } };
  let b = place(createState(blockedOnlyByMax), 'k', blockedOnlyByMax).state; b = place(b, 'h', blockedOnlyByMax).state; b = place(b, 'x', blockedOnlyByMax).state;
  r = place(b, 'q', blockedOnlyByMax); assert.equal(r.state.lv.x, 2); assert.equal(r.events.filter(e => e.kind === 'wait').length, 0);
});

// 演出層共用的事件折疊（舞台與遊戲都用，計畫 3.6）
test('foldEvent applies placed / grow / delta / flag and leaves the input alone', () => {
  const s0 = { lv: { milk: 0, rat: 2 }, flags: {} };
  const s1 = foldEvent(s0, { kind: 'placed', item: 'milk', to: 1 });
  assert.equal(s1.lv.milk, 1); assert.equal(s0.lv.milk, 0);
  assert.equal(foldEvent(s1, { kind: 'grow', item: 'milk', from: 1, to: 2 }).lv.milk, 2);
  assert.equal(foldEvent(s1, { kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 1 } }).lv.milk, 1);
  assert.equal(foldEvent(s1, { kind: 'fx', item: 'rat', delta: { target: 'rat', from: 2, to: 3 } }).lv.rat, 3);
  assert.equal(foldEvent(s1, { kind: 'fx', item: 'typhoon', flag: { name: 'blackout', value: true } }).flags.blackout, true);
  assert.equal(foldEvent(s1, { kind: 'wait', item: 'milk', waits: [] }), s1);
});
// 颱風四站（設計 2026-10-31 §5.1）：「颱風到了」改看放下事件——烏雲放下那回合就到 101 上空、全島躲雨
test('landsTyphoon: the typhoon placed event, never a grow or a delta', () => {
  assert.equal(landsTyphoon({ kind: 'placed', item: 'typhoon', to: 1 }), true);
  assert.equal(landsTyphoon({ kind: 'placed', item: 'milk', to: 1 }), false);
  assert.equal(landsTyphoon({ kind: 'grow', item: 'typhoon', from: 1, to: 2 }), false);
  assert.equal(landsTyphoon({ kind: 'grow', item: 'typhoon', from: 2, to: 3 }), false);
  assert.equal(landsTyphoon({ kind: 'fx', item: 'typhoon', delta: { target: 'typhoon', from: 1, to: 2 } }), false);
});

// 物品 v2（設計 2026-10-26 §3）：跳級 jump[n] 從 n−2 一次升兩級；delay[n] 成立時那一級要多等一回合
const hop = {
  ORDER: ['b', 'a', 'c', 'd'],   // b 先掃：b 這回合長上來，同一輪掃到 a 時 a 就能跳
  ITEMS: {
    a: { name: 'A', max: 5, up: { 2: { always: true }, 3: { always: true }, 4: { minLevel: ['b', 9] }, 5: { always: true } },
         jump: { 4: { minLevel: ['b', 2] } }, onLevel: { 3: [{ flag: { name: 'a3' } }], 4: [{ flag: { name: 'a4' } }] } },
    b: { name: 'B', max: 2, up: { 2: { always: true } } },
    c: { name: 'C', max: 3, up: { 2: { always: true }, 3: { always: true } }, jump: { 3: { always: true } } },
    d: { name: 'D', max: 3, up: { 2: { always: true }, 3: { always: true } }, delay: { 3: { minLevel: ['b', 2] } } },
  },
  AFTER_TURN: [], STORIES: { placed: { a: '', b: '', c: '', d: '' }, grow: { a: { 2: 'a2', 3: 'a3', 4: 'a4', 5: 'a5' }, b: { 2: 'b2' }, c: { 2: 'c2', 3: 'c3' }, d: { 2: 'd2', 3: 'd3' } } },
};
const grows = r => r.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.from}>${e.to}${e.jump ? 'J' : ''}`);
test('jump: an item at n−2 whose jump[n] holds rises two levels in one turn with two grow events, the second marked jump', () => {
  const s = place(createState(hop), 'a', hop).state;  // a 放下當回合 1 → 2
  const r = place(s, 'b', hop);                        // b 先掃、放下就到 2 → a 在 2、jump[4]（b≥2）成立 → 2→3→4
  assert.equal(r.state.lv.a, 4);
  assert.deepEqual(grows(r).filter(g => g.startsWith('a')), ['a2>3', 'a3>4J']);
  const [g1, g2] = r.events.filter(e => e.kind === 'grow' && e.item === 'a');
  assert.deepEqual([g1.story, g2.story], ['a3', 'a4']); assert.deepEqual(g2.via, ['b']); assert.equal(g1.jump, undefined);
  assert.equal(r.state.flags.a3, true, 'the skipped-through level still fires its onLevel'); assert.equal(r.state.flags.a4, true);
  assert.equal(place(r.state, 'c', hop).state.lv.a, 5, 'next turn back to +1');
});
// R2／R5：照 ORDER 掃，每個物品每次掃到就決定——跳級條件成立就跳，否則 +1；不為了等跳級而延後 +1
test('an item whose jump never comes true still takes its +1 that turn', () => {
  const s = place(createState(hop), 'a', hop).state;   // a2（b 沒放，jump[4] 永遠不成立）
  const r = place(s, 'c', hop);
  assert.deepEqual(grows(r).filter(g => g.startsWith('a')), ['a2>3']);
  // 掃到 a 時跳級還不成立、a 先 +1；之後同回合 b 才長上來也不會再跳
  const late = { ...hop, ORDER: ['a', 'b', 'c', 'd'] };
  const t = place(createState(late), 'a', late).state;   // a2
  const r2 = place(t, 'b', late);
  assert.equal(r2.state.lv.b, 2); assert.deepEqual(grows(r2).filter(g => g.startsWith('a')), ['a2>3']);
});
// 裁決 R4：每回合每物品最多 +2，連 delta 一起算（正向 delta 被壓到「回合開始的級數 +2」，壓到 0 就不發事件）
const push = {
  ORDER: ['x', 'p', 'q', 'z'],
  ITEMS: {
    x: { name: 'X', max: 9, up: { 2: { always: true }, 3: { always: true }, 4: { always: true }, 5: { always: true }, 6: { always: true }, 7: { always: true }, 8: { always: true }, 9: { always: true } },
         // 每一級都寫明跳級（回到 GROW 之後引擎沒有預設跳級；這裡測的是 +2 上限）
         jump: { 3: { always: true }, 4: { always: true }, 5: { always: true }, 6: { always: true }, 7: { always: true }, 8: { always: true }, 9: { always: true } } },
    p: { name: 'P', max: 1, up: {}, fx: [{ delta: { target: 'x', by: 5 }, story: 'p推x' }] },
    q: { name: 'Q', max: 1, up: {}, fx: [{ delta: { target: 'x', by: 1 }, story: 'q推x' }] },
    z: { name: 'Z', max: 1, up: {}, fx: [{ delta: { target: 'x', by: 1 }, story: 'z推x' }, { delta: { target: 'x', by: 1 }, story: 'z再推x' }, { delta: { target: 'x', by: 1 }, story: 'z三推x' }] },
  },
  AFTER_TURN: [], STORIES: { placed: { x: '', p: '', q: '', z: '' }, grow: { x: { 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '', 9: '' }, p: {}, q: {}, z: {} } },
};
test('R4: a positive delta never lifts an item past its turn-start level + 2, and growth respects the same cap', () => {
  const s = place(createState(push), 'x', push).state;            // x 放下當回合就到 2
  assert.equal(s.lv.x, 2);
  const r = place(s, 'p', push);                                  // +5 → 壓成 +2（2 → 4），x 這回合不再長
  assert.deepEqual(r.events.find(e => e.delta).delta, { target: 'x', from: 2, to: 4 }); assert.equal(r.state.lv.x, 4);
  assert.deepEqual(grows(r), []);
  const q = place(s, 'q', push);                                  // +1（2 → 3），再 +1 → 4（剛好 +2；jump[5] 是 +3 → 不跳）
  assert.equal(q.state.lv.x, 4);
  let t = place(createState(push), 'x', push).state; t = advance(t, push).state; t = advance(t, push).state;   // x 2 → 4 → 6（都是跳級）
  assert.equal(t.lv.x, 6);
  const j = place(t, 'q', push);                                  // delta +1 → 7；jump[9] 是 +3 → 不跳，改 +1 → 8
  assert.equal(j.state.lv.x, 8); assert.deepEqual(grows(j), ['x7>8']);
  const z = place(t, 'z', push);                                  // 三次 +1：第三次壓到 0 → 沒有那個事件
  assert.equal(z.state.lv.x, 8); assert.deepEqual(z.events.filter(e => e.delta).map(e => e.story), ['z推x', 'z再推x']);
});
test('jump fires only from exactly n−2: one level short or past it, the item takes +1 or waits', () => {
  // a 只有 spec 寫的 jump[4]（b ≥ 2，b 已經是 2）——引擎沒有預設跳級（回到 GROW 2026-10-29 §3.1）
  const s0 = createState(hop);
  const at = n => advance({ ...s0, lv: { ...s0.lv, a: n, b: 2 }, age: { ...s0.age, a: 3, b: 3 }, held: { ...s0.held, a: 1, b: 1 }, turn: 4 }, hop);
  assert.deepEqual(grows(at(1)), ['a1>2'], 'one level short: +1');
  assert.deepEqual(grows(at(2)), ['a2>3', 'a3>4J'], 'exactly n−2: jump');
  assert.deepEqual(grows(at(3)), [], 'past it: up[4] (b ≥ 9) waits');
});
test('jump never crosses a locked item and never exceeds max (review focus 1)', () => {
  const s0 = createState(hop), s = { ...s0, lv: { ...s0.lv, c: 1 }, age: { ...s0.age, c: 1 }, held: { ...s0.held, c: 1 }, turn: 1 };   // c1：jump[3] 永遠成立
  const locked = advance({ ...s, locked: { c: true } }, hop);
  assert.equal(locked.state.lv.c, 1, 'locked items never jump');
  const r = advance(s, hop);
  assert.equal(r.state.lv.c, 3); assert.deepEqual(grows(r), ['c1>2', 'c2>3J']);
  const big = { ...hop, ITEMS: { ...hop.ITEMS, c: { ...hop.ITEMS.c, jump: { 3: { always: true }, 4: { always: true } } } } };
  let t = place(createState(big), 'c', big).state; t = advance(t, big).state;      // c 2 → 3 = max
  assert.equal(t.lv.c, 3); assert.equal(advance(t, big).state.lv.c, 3, 'jump[max+1] is never taken');
  const two = { ...hop, ITEMS: { ...hop.ITEMS, c: { ...hop.ITEMS.c, max: 2, up: { 2: { always: true } } } } };
  assert.equal(advance(s, two).state.lv.c, 2, 'a jump to 3 is ignored when max is 2');
});
test('placed items grow at most to Lv2 in their placement turn; at most +2 per item per turn', () => {
  const r = place(createState(hop), 'c', hop);                 // c 的 jump[3] 永遠成立，但回合開始是 0 級 → 到 2 為止
  assert.equal(r.state.lv.c, 2); assert.deepEqual(grows(r), ['c1>2']);
  let s = r.state;
  for (const id of ['a', 'b', 'd']) {
    const before = s.lv; const t = place(s, id, hop); s = t.state;
    for (const k of hop.ORDER) assert.ok(s.lv[k] - before[k] <= 2, `${k} grew more than 2`);
    assert.ok(new Set(grows(t).map(g => g[0])).size === grows(t).filter(g => !g.endsWith('J')).length, 'one step (+1 or jump) per item per turn');
  }
});
test('delay[n]: while its condition holds the level waits one extra turn, otherwise it comes on time', () => {
  const s = place(createState(hop), 'd', hop).state;    // d 放下當回合就到 2（b 沒放，delay 不成立）
  assert.equal(s.lv.d, 2);
  assert.equal(advance(s, hop).state.lv.d, 3, 'no delay → Lv3 the next turn');
  let w = place(createState(hop), 'b', hop).state; w = place(w, 'd', hop).state;   // b2；d2（剛長上來，held 0）
  assert.equal(w.lv.d, 2);
  const late = advance(w, hop); assert.equal(late.state.lv.d, 2, 'b ≥ 2 → Lv3 waits one more turn');
  assert.equal(late.events.filter(e => e.kind === 'wait').length, 0, 'a delay is not waiting for a helper');
  assert.equal(advance(late.state, hop).state.lv.d, 3, 'and then comes');
});

// 真的 spec（唯一正解 2026-10-31；修正批次 2：颱風三級）：放下那回合一次全部檢查、之後 Lv2 暴風圈還在、Lv3 放晴；放下後的反應先於成長掃描
import * as real from '../src/rules/spec.js';
const playReal = (order, closing = 0) => {
  let s = createState(real); const lvs = [];
  for (const id of order) { s = place(s, id, real).state; lvs.push(s.lv); }
  for (let i = 0; i < closing; i++) { s = advance(s, real).state; lvs.push(s.lv); }
  return { s, lvs };
};
// 颱風三級（設計 2026-10-31 §4.3，修正批次 2）：放下當回合停在 Lv1（up[2] 要 age ≥ 1），之後一回合一級：2 暴風圈還在、3 放晴
// 計畫 14：正解換成颱風第 7 個放（鮮奶 棒球 代幣 燈泡 晶片 珍奶 颱風 老鼠）
test('the typhoon stays Lv1 in its placement turn, then 2 (still storming), 3 (cleared)', () => {
  const r = playReal(['milk', 'baseball', 'token', 'bulb', 'chip', 'boba', 'typhoon', 'rat'], 1);
  assert.deepEqual(r.lvs.map(l => l.typhoon), [0, 0, 0, 0, 0, 0, 1, 2, 3]);
  let s = createState(real);
  for (const id of ['milk', 'baseball', 'token', 'bulb', 'chip', 'boba']) s = place(s, id, real).state;
  const t7 = place(s, 'typhoon', real);
  assert.ok(!t7.events.some(e => e.kind === 'grow' && e.item === 'typhoon'), 'no level-up in the placement turn');
  assert.ok(!t7.events.some(e => e.kind === 'wait' && e.waits.some(w => w.item === 'typhoon')), 'a just-placed typhoon is not waiting for anyone');
  assert.ok(!t7.state.flags.blackout && !t7.state.flags.flooded && !t7.state.flags.domeFlood && !t7.state.flags.cartBlown, 'the solution is ready: bulb 5, token 6, baseball 6, boba 2 (the queue holds the cart)');
  assert.ok(!Object.keys(real.ITEMS.typhoon.onLevel ?? {}).length, 'no checks on the later levels');
});
// 所有檢查都在放下那回合（修正批次 2）：燈泡 ≤2 停電、代幣 ≤3 淹水、棒球 ≤3 巨蛋淹水、珍奶 ≤3 攤車被吹走（外送 +1 拿掉了）
const turnOf = (order, pred) => { let s = createState(real); for (let t = 0; t < order.length; t++) { const r = place(s, order[t], real); s = r.state; if (pred(r)) return { t: t + 1, r, s }; } return null; };
test('placement check: the bulb ≤ 2 when the typhoon is placed → blackout, the bulb locked, no milk penalty (R25), before any growth', () => {
  const hit = turnOf(['milk', 'baseball', 'token', 'bulb', 'typhoon'], r => r.state.flags.blackout);
  assert.equal(hit.t, 5, 'the turn the typhoon is placed');
  const kinds = hit.r.events.map(e => e.kind), fx = hit.r.events.find(e => e.lock === 'bulb');
  assert.ok(fx && fx.cause === 'typhoon' && !fx.delta, 'the blackout locks the bulb and knocks nothing (milk −1 removed 2026-11-01)');
  assert.ok(hit.r.events.indexOf(fx) < kinds.indexOf('grow'), 'a placement reaction comes before the growth scan');
  assert.equal(hit.s.locked.bulb, true); assert.equal(hit.s.lv.bulb, 2);
  assert.ok(hit.r.events.some(e => e.kind === 'fx' && e.cause === 'typhoon' && e.story === '颱風假！小朋友在家看電視'));
});
test('placement check: the token ≤ 3 → flood (token locked), the baseball ≤ 3 → dome flood (baseball locked), all in the placement turn', () => {
  let s = createState(real);
  for (const id of ['milk', 'baseball', 'token']) s = place(s, id, real).state;
  assert.ok(s.lv.token <= 3 && s.lv.baseball <= 3);
  const r = place(s, 'typhoon', real);
  assert.equal(r.state.lv.typhoon, 1);
  assert.equal(r.state.flags.flooded, true); assert.equal(r.state.locked.token, true);
  assert.equal(r.state.flags.domeFlood, true); assert.equal(r.state.locked.baseball, true);
  for (const id of ['token', 'baseball']) {
    const lock = r.events.find(e => e.lock === id);
    assert.equal(lock.cause, 'typhoon'); assert.ok(r.events.indexOf(lock) < r.events.findIndex(e => e.kind === 'grow'), `${id}: before the growth scan`);
    assert.equal(r.state.lv[id], s.lv[id], `${id} does not grow once locked`);
  }
  // 已經準備好的（代幣 ≥4、棒球 ≥4）淹不到；之後的回合不再檢查
  const later = advance(r.state, real);
  assert.ok(!later.events.some(e => e.kind === 'fx' && e.cause === 'typhoon'), 'no checks after the placement turn');
});
// 計畫 14：門檻 ≤3 → ≤1——只剩一台攤車（Lv1）才被吹走；排隊人龍（Lv2）起有人顧著攤車（唯一解要珍奶 2 撐過颱風，見設計 §8 R30）
test('placement check: boba ≤ 1 → the cart is blown away (boba locked, flag cartBlown); the queue (2) and the fountain plaza (4) are left alone; no delivery +1', () => {
  let s = createState(real);
  for (const id of ['chip', 'boba']) s = place(s, id, real).state;   // 沒有鮮奶：珍奶 2 要鮮奶 ≥3，停在攤車
  assert.equal(s.lv.boba, 1);
  const r = place(s, 'typhoon', real);
  assert.equal(r.state.flags.cartBlown, true); assert.equal(r.state.locked.boba, true); assert.equal(r.state.lv.boba, s.lv.boba);
  const blown = r.events.find(e => e.lock === 'boba');
  assert.equal(blown.cause, 'typhoon'); assert.equal(blown.story, '珍奶攤車被吹走了'); assert.ok(!blown.delta);
  assert.ok(!r.events.some(e => e.delta?.target === 'boba'), 'no delivery for a cart');
  let q = createState(real);
  for (const id of ['milk', 'baseball', 'boba']) q = place(q, id, real).state;
  assert.equal(q.lv.boba, 2, 'precondition: the queue');
  const queue = place(q, 'typhoon', real);
  assert.ok(!queue.state.flags.cartBlown && !queue.state.locked.boba, 'the queue holds the cart');
  // 珍奶 4（噴泉廣場）：不吹走、也沒有外送 +1（協調者裁決：外送 +1 是死規則，拿掉了；機車只是 view 的點綴）
  let t = createState(real);
  for (const id of ['milk', 'chip', 'baseball', 'token', 'boba', 'bulb']) t = place(t, id, real).state;
  assert.equal(t.lv.boba, 4, 'precondition: the fountain plaza');
  const four = place(t, 'typhoon', real);
  assert.ok(!four.state.flags.cartBlown && !four.state.locked.boba);
  assert.ok(!four.events.some(e => e.kind === 'fx' && e.delta?.target === 'boba'), 'no delivery delta');
});
// 降級當回合不升級（修正批次 2，使用者：「downgrade 當回合就不要 levelup 了」）：被負向 delta 打到的物品這回合不再長，也不列在等待裡
test('an item knocked by a negative delta does not grow back that turn (the rat bite: milk 2 → 1 stays 1), and grows the next turn', () => {
  // 大停電的鮮奶 −1 2026-11-01 拿掉了（R25），規則裡剩下的負向 delta 是老鼠咬鮮奶（鮮奶 ≤2 時放老鼠）
  const s = place(createState(real), 'milk', real).state;
  assert.equal(s.lv.milk, 2);
  const r = place(s, 'rat', real);
  assert.deepEqual(r.events.find(e => e.kind === 'fx' && e.delta?.target === 'milk').delta, { target: 'milk', from: 2, to: 1 });
  assert.equal(r.state.lv.milk, 1, 'stays at 1 this turn');
  assert.ok(!r.events.some(e => e.kind === 'grow' && e.item === 'milk'), 'no LEVEL UP after the LEVEL DOWN');
  assert.ok(!r.events.some(e => e.kind === 'wait' && e.waits.some(w => w.item === 'milk')), 'not listed as waiting either');
  const next = place(r.state, 'baseball', real);
  assert.ok(next.events.some(e => e.kind === 'grow' && e.item === 'milk' && e.from === 1 && e.to === 2), 'grows the next turn');
});
test('rat placed while milk ≤ 2 bites milk −1; placed later it does not', () => {
  const s = place(createState(real), 'milk', real).state;    // 鮮奶放下當回合就到 2（早餐店）；沒有棒球就蓋不了小學
  const r = place(s, 'rat', real);
  const bite = r.events.find(e => e.kind === 'fx' && e.delta?.target === 'milk');
  assert.deepEqual(bite.delta, { target: 'milk', from: 2, to: 1 }); assert.equal(r.state.lv.milk, 1, 'bitten to 1 and stays there this turn (修正批次 2)');
  assert.equal(advance(r.state, real).state.lv.milk, 2, 'grows back the next turn');
  assert.equal(r.state.lv.rat, 1, 'the rat Lv2 needs milk ≥ 2: the bitten milk stays 1 this turn, so the rat waits');
  let t = place(createState(real), 'milk', real).state; t = place(t, 'baseball', real).state;   // 鮮奶 3（小學，沙地球場當操場）
  const late = place(t, 'rat', real);
  // 沒咬；鮮奶照常自己長到 4（回到 GROW 2026-10-29：鮮奶 4 是 auto）
  assert.ok(!late.events.some(e => e.delta?.target === 'milk')); assert.equal(late.state.lv.milk, 4);
  assert.equal(late.events.filter(e => e.kind === 'fx' && e.cause === 'rat').length, 0, 'no boba to knock over either');
});
test('ratBranch at rat Lv4: chip ≥ 8 → cyber, else alien', () => {
  const at = (chip) => {
    const s0 = createState(real);
    const s = { ...s0, lv: { ...s0.lv, rat: 3, chip }, age: { ...s0.age, rat: 3, chip: 8 }, held: { ...s0.held, rat: 1, chip: 1 }, turn: 9 };
    return advance(s, real);
  };
  const cyber = at(8), alien = at(6);   // 晶片 8 → 9 要颱風：不動；6 → 7 要代幣 ≥7（2026-10-30 連鎖）：代幣 0，晶片停在 6，還是 < 8
  assert.equal(cyber.state.lv.chip, 8); assert.equal(alien.state.lv.chip, 6);
  assert.equal(cyber.state.lv.rat, 4); assert.equal(cyber.state.flags.ratBranch, 'cyber');
  assert.equal(alien.state.lv.rat, 4); assert.equal(alien.state.flags.ratBranch, 'alien');
});

test('R4 invariant on the real spec: over all 8! orders (with the closing turn) no item rises more than 2 in one turn, placed ones included', () => {
  let worst = 0, turns = 0;
  const check = (before, after) => { turns++; for (const k of real.ORDER) worst = Math.max(worst, after.lv[k] - before.lv[k]); };   // 剛放下的也算（0 → ≤2）
  const walk = (s, left) => {
    if (!left.length) { let t = s; for (let i = 0; i < real.CLOSING_TURNS; i++) { const n = advance(t, real).state; check(t, n); t = n; } return; }
    for (const id of left) { const n = place(s, id, real).state; check(s, n); walk(n, left.filter(x => x !== id)); }
  };
  walk(createState(real), real.ORDER);
  assert.ok(turns > 100000); assert.ok(worst <= 2, `an item rose ${worst} in one turn`);
});

// 計畫 5b 選擇帶動升級（設計 2026-10-28 §3）：放下的物品當回合就長；一回合最多 +2（連 delta）不變。
// 回到 GROW（2026-10-29 §3.1）：沒有預設跳級，只有 spec 寫的 jump[n] 會跳
const choice = {
  ORDER: ['h', 'g', 'k', 'm', 'z'],   // h 先掃：h 這回合長上來，同一輪掃到 g 時 g 就能跳
  ITEMS: {
    g: { name: 'G', max: 5, up: { 2: { always: true }, 3: { always: true }, 4: { minLevel: ['h', 2] }, 5: { minLevel: ['h', 9] } },
         jump: { 4: { present: 'k' } }, onLevel: { 3: [{ flag: { name: 'g3' } }] } },
    h: { name: 'H', max: 2, up: { 2: { always: true } } },
    k: { name: 'K', max: 1, up: {} },
    m: { name: 'M', max: 5, up: { 2: { always: true }, 3: { always: true }, 4: { always: true }, 5: { always: true } }, jump: { 5: { always: true } } },
    z: { name: 'Z', max: 1, up: {} },
  },
  AFTER_TURN: [], STORIES: { placed: { g: '', h: '', k: '', m: '', z: '' }, grow: { g: { 2: 'g2', 3: 'g3', 4: 'g4', 5: 'g5' }, h: { 2: '' }, k: {}, m: { 2: '', 3: '', 4: '', 5: '' }, z: {} } },
};
test('a placed item joins the growth scan in its placement turn: up[2] holds → it ends the turn at Lv2 (never Lv3)', () => {
  const r = place(createState(choice), 'g', choice);           // 0 → 1（放下）→ 2；回合開始是 0 級，最多到 2
  assert.equal(r.state.lv.g, 2); assert.deepEqual(grows(r), ['g1>2']);
  assert.deepEqual(r.events.map(e => e.kind), ['placed', 'grow']);
  assert.equal(r.state.held.g, 0); assert.equal(r.state.age.g, 0);
  const stuck = place(createState(choice), 'k', choice);       // k 沒有 up[2]：停在 1，也不算在等誰
  assert.equal(stuck.state.lv.k, 1); assert.ok(!stuck.events.some(e => e.kind === 'wait'));
});
test('an item with no jump[n] takes +1 even when up[n−1] and up[n] both hold', () => {
  // h 先長到 2 → g 的 up[3]、up[4] 這一刻都成立，但沒有 jump[4] 以外的跳級、k 沒放 → g 2 → 3 一回合，沒有 J
  let s = place(createState(choice), 'h', choice).state; s = place(s, 'g', choice).state;   // h2、g2
  let r = place(s, 'z', choice);
  assert.deepEqual(grows(r), ['g2>3']); assert.equal(r.state.flags.g3, true);
  assert.deepEqual(r.events.find(e => e.kind === 'grow' && e.item === 'g').via, [], 'up[3] is always: nobody to thank');
  // spec 寫的那條：k 在場 → 跳，via = present k
  s = place(createState(choice), 'g', choice).state;
  r = place(s, 'k', choice);
  assert.deepEqual(grows(r), ['g2>3', 'g3>4J']);
  assert.deepEqual(r.events.find(e => e.jump).via, ['k'], 'via = spec 寫的那條（present k）');
  // m 全是 auto、只有 jump[5]：一回合一級，到 3 才跳
  let t = place(createState(choice), 'm', choice).state; assert.equal(t.lv.m, 2);
  t = advance(t, choice).state; assert.equal(t.lv.m, 3, 'no jump[4] → +1');
  assert.deepEqual(grows(advance(t, choice)), ['m3>4', 'm4>5J'], 'its explicit jump[5] works');
});
// 真的 spec 沒有颱風 jump[3]、也沒有 onLevel（修正批次 2：檢查都在放下那回合）：在複本上寫明跳級與一條 Lv2 的反應，
// 測「跳級跨過的那一級的反應照樣觸發」
const crossing = { ...real, ITEMS: { ...real.ITEMS,
  typhoon: { ...real.ITEMS.typhoon, max: 3, jump: { 3: { and: [real.ITEMS.typhoon.up[2], real.ITEMS.typhoon.up[3]] } },
    onLevel: { 2: [
      { when: { and: [{ present: 'token' }, { maxLevel: ['token', 3] }] }, lock: 'token', flag: { name: 'flooded' } },
      { when: { present: 'boba' }, delta: { target: 'boba', by: 1 } },
    ] } } } };
test('a jump across a level with onLevel fires that reaction (typhoon 1 → 3 crosses a Lv2 check on a copy)', () => {
  const s0 = createState(crossing);
  // 颱風在 1（放下過一回合）、代幣 2、珍奶 2：1 → 2 → 3 一回合，跨過第 2 級照樣淹水、珍奶 +1（複本上的正向 delta，不是真規則）
  const ty = { ...s0, lv: { ...s0.lv, typhoon: 1, token: 2, milk: 2, boba: 2 }, age: { ...s0.age, typhoon: 1, token: 3, milk: 3, boba: 3 }, held: { ...s0.held, typhoon: 1, token: 1, milk: 1, boba: 1 }, locked: { milk: true, boba: true }, turn: 9 };
  const r = advance(ty, crossing);
  assert.deepEqual(grows(r).filter(g => g.startsWith('t')), ['typhoon1>2', 'typhoon2>3J']);
  assert.ok(r.events.some(e => e.kind === 'fx' && e.cause === 'typhoon' && e.lock === 'token'), 'the flood still fires');
  assert.ok(r.events.some(e => e.kind === 'fx' && e.delta?.target === 'boba'), 'the positive delta on the copy still fires');
});
test('the +2 per turn cap still includes deltas', () => {
  // x 放下就到 2；p 的 +5 只能推到 4（回合開始 2 + 2），之後 x 不能再長、跳級也不行
  let s = place(createState(push), 'x', push).state; assert.equal(s.lv.x, 2);
  let r = place(s, 'p', push);
  assert.deepEqual(r.events.find(e => e.delta).delta, { target: 'x', from: 2, to: 4 }); assert.deepEqual(grows(r), []);
  // q 推 +1 到 3：jump[5] 會是 +3 → 不跳，改 +1 → 4
  r = place(s, 'q', push);
  assert.equal(r.state.lv.x, 4); assert.deepEqual(grows(r), ['x3>4']);
  // 沒有 delta：2 → 4 跳級（+2）是上限
  r = advance(s, push); assert.deepEqual(grows(r), ['x2>3', 'x3>4J']);
  // 放下當回合被 delta 推（自己的 fx +5 推自己）：回合開始 0 → 最多到 2（delta 壓成 1 → 2），之後這回合也不再長
  const al = { always: true }, self = { ORDER: ['y'], ITEMS: { y: { name: 'Y', max: 9, up: { 2: al, 3: al, 4: al }, fx: [{ delta: { target: 'y', by: 5 }, story: 'y推自己' }] } },
    AFTER_TURN: [], STORIES: { placed: { y: '' }, grow: { y: {} } } };
  const t = place(createState(self), 'y', self), d = t.events.find(e => e.delta);
  assert.deepEqual(d.delta, { target: 'y', from: 1, to: 2 }); assert.equal(t.state.lv.y, 2); assert.deepEqual(grows(t), []);
});

// 看得見的因果與離島三段（2026-10-28 設計 §3）：via 只列「這次真的讓條件成立」的幫手——or 只算成立的那一支（兩支都成立就兩支都列）、
// and 全列、跳級列整條 jump[n] 成立的幫手（第一級的先列）；不成立的分支、「要低於」的物品都不算
const cause = {
  ORDER: ['milk', 'chip', 'token', 'p', 'z'],
  ITEMS: {
    milk: { name: 'M', max: 1, up: {} },
    chip: { name: 'C', max: 3, up: { 2: { always: true }, 3: { always: true } } },
    token: { name: 'T', max: 4, up: { 2: { always: true }, 3: { always: true }, 4: { always: true } } },
    // jump[4] 寫明 up[3] ∧ up[4]（回到 GROW 之後沒有預設跳級）：測跳級 via 的排序
    p: { name: 'P', max: 4, up: { 2: { always: true }, 3: { or: [{ minLevel: ['chip', 3] }, { minLevel: ['token', 4] }] }, 4: { present: 'milk' } },
         jump: { 4: { and: [{ or: [{ minLevel: ['chip', 3] }, { minLevel: ['token', 4] }] }, { present: 'milk' }] } } },
    z: { name: 'Z', max: 1, up: {} },
  },
  AFTER_TURN: [], STORIES: { placed: { milk: '', chip: '', token: '', p: '', z: '' }, grow: { milk: {}, chip: { 2: '', 3: '' }, token: { 2: '', 3: '', 4: '' }, p: { 2: '', 3: '', 4: '' }, z: {} } },
};
test('satisfiedHelpers: or → only the satisfied alternative(s); and → all; maxLevel/flag/age never; nothing when the condition fails', () => {
  const st = lv => ({ lv: { milk: 0, chip: 0, token: 0, p: 0, z: 0, ...lv }, age: {}, held: {}, flags: { f: true }, locked: {} });
  const either = { or: [{ minLevel: ['chip', 3] }, { minLevel: ['token', 4] }] };
  assert.deepEqual(satisfiedHelpers(either, st({ token: 4 }), 'p', cause), ['token']);
  assert.deepEqual(satisfiedHelpers(either, st({ chip: 3 }), 'p', cause), ['chip']);
  assert.deepEqual(satisfiedHelpers(either, st({ chip: 3, token: 4 }), 'p', cause), ['chip', 'token'], 'both alternatives hold → both listed, in ORDER');
  assert.deepEqual(satisfiedHelpers(either, st({ chip: 2 }), 'p', cause), [], 'condition fails → nobody');
  assert.deepEqual(satisfiedHelpers({ and: [{ present: 'milk' }, { minLevel: ['token', 2] }, { maxLevel: ['chip', 1] }, { flag: 'f' }] }, st({ milk: 1, token: 2 }), 'p', cause), ['milk', 'token']);
  assert.deepEqual(satisfiedHelpers({ or: [{ and: [{ minLevel: ['chip', 3] }, { minLevel: ['milk', 1] }] }, { present: 'token' }] }, st({ chip: 3, token: 1 }), 'p', cause), ['token'], 'a failed and-branch lends none of its helpers');
  assert.deepEqual(satisfiedHelpers({ always: true }, st({}), 'p', cause), []);
  assert.deepEqual(satisfiedHelpers({ minLevel: ['p', 1] }, st({ p: 1 }), 'p', cause), [], 'self is never a helper');
});
test('via lists only the helpers that satisfied the condition: or(min chip 3, min token 4) with only token placed → [token]; a jump unions both levels, first level first', () => {
  // 只有代幣：p 在 2，代幣到 4 → p 升 3，via 只有 token（晶片沒放）
  let s = place(createState(cause), 'token', cause).state; s = advance(s, cause).state; s = advance(s, cause).state;   // token 2 → 4
  assert.equal(s.lv.token, 4);
  s = place(s, 'p', cause).state; assert.equal(s.lv.p, 2);
  let r = place(s, 'z', cause), g = r.events.find(e => e.kind === 'grow' && e.item === 'p' && e.to === 3);
  assert.ok(g && !g.jump, 'p takes +1 (up[4] needs milk)'); assert.deepEqual(g.via, ['token']);
  // 跳級：鮮奶在場、代幣 4 → p 2 → 4 一回合，jump[4]（= up[3] ∧ up[4]）的聯集 = token（up[3] 成立的那支）＋ milk（up[4]）。
  // 順序（最終審稿 1）：先第一級（up[3]）的幫手、再第二級才有的——via[0] 是第一級的原因（拜訪敲門的是代幣，不是 ORDER 排前面的鮮奶）
  s = place(createState(cause), 'token', cause).state; s = advance(s, cause).state; s = advance(s, cause).state;
  s = place(s, 'milk', cause).state; s = place(s, 'p', cause).state; assert.equal(s.lv.p, 2);
  r = place(s, 'z', cause);
  const jumps = r.events.filter(e => e.kind === 'grow' && e.item === 'p');
  assert.deepEqual(jumps.map(e => [e.to, !!e.jump]), [[3, false], [4, true]]);
  for (const e of jumps) assert.deepEqual(e.via, ['token', 'milk'], `jump event to ${e.to}: the first level's helpers first, then the second level's`);
});

// 鎖↔旗標的對照（2026-10-31 Task 5：turn.js 的起因閃與 stage.js 的老鼠 trouble 共用 engine.lockFlags）：照規則資料算，真的 spec 是這四條（修正批次 2 多了攤車被吹走）
test('lockFlags(spec) reads the lock ↔ flag pairs from the rules: blackout locks the bulb, the flood the token, the dome flood the baseball, the blown cart the boba', async () => {
  const { lockFlags } = await import('../src/rules/engine.js');
  assert.deepEqual(lockFlags(real), { bulb: 'blackout', token: 'flooded', baseball: 'domeFlood', boba: 'cartBlown' });
  assert.equal(lockFlags(real), lockFlags(real), 'computed once per spec');
  assert.deepEqual(lockFlags({ ITEMS: { a: { fx: [{ lock: 'b', flag: { name: 'x' } }] } } }), { b: 'x' });
});

// 計畫 14 R29 颱風雨一直有效：颱風 Lv1–2（還在下雨）時放下的燈泡／代幣／棒球／珍奶，當場套用颱風那條檢查（鎖＋旗標＋故事句），
// 排在 placed 之後、成長掃描之前；鮮奶、晶片、老鼠不受影響；颱風 3（放晴）之後放沒事；颱風放下那回合的檢查不重複
const turnEvents = order => { let s = createState(real), r; for (const id of order) { r = place(s, id, real); s = r.state; } return { r, s }; };
test('R29 rain: a token placed while the typhoon is Lv1 floods at once (locked, flag flooded, story), before the growth scan, and stays Lv1', () => {
  const { r, s } = turnEvents(['milk', 'typhoon', 'token']);
  assert.equal(s.lv.typhoon, 2, 'the typhoon was Lv1 when the token came down (it grows to 2 in this scan)');
  const fx = r.events.find(e => e.kind === 'fx' && e.lock === 'token');
  assert.ok(fx, 'a flood lock event');
  assert.deepEqual({ cause: fx.cause, flag: fx.flag, story: fx.story }, { cause: 'typhoon', flag: { name: 'flooded', value: true }, story: '捷運站變游泳池了' });
  const kinds = r.events.map(e => e.kind);
  assert.equal(r.events.indexOf(fx), kinds.indexOf('placed') + 1, 'right after the placed event');
  assert.ok(!r.events.some((e, i) => e.kind === 'grow' && i < r.events.indexOf(fx)), 'before any growth');
  assert.equal(s.locked.token, true); assert.equal(s.flags.flooded, true); assert.equal(s.lv.token, 1, 'locked: no growth this turn');
  assert.equal(r.events.filter(e => e.cause === 'typhoon').length, 1, 'only the check for the placed item');
});
test('R29 rain: baseball, boba and bulb placed while the typhoon is Lv2 get dome flood, the blown cart and the blackout', () => {
  for (const [item, flag, story] of [['baseball', 'domeFlood', '球場變游泳池了'], ['boba', 'cartBlown', '珍奶攤車被吹走了'], ['bulb', 'blackout', '全島大停電！']]) {
    const { r, s } = turnEvents(['milk', 'typhoon', 'chip', item]);
    assert.equal(r.events.find(e => e.kind === 'placed').item, item);
    assert.equal(s.lv.typhoon, 3, `${item}: the typhoon was Lv2 at placement, clears this turn`);
    const fx = r.events.find(e => e.kind === 'fx' && e.lock === item);
    assert.ok(fx, `${item}: locked by the rain`);
    assert.equal(fx.cause, 'typhoon'); assert.equal(fx.flag.name, flag); assert.equal(fx.story, story);
    assert.equal(r.events.indexOf(fx), 1, `${item}: right after placed`);
    assert.equal(s.locked[item], true); assert.equal(s.lv[item], 1, `${item}: does not grow once locked`);
  }
});
test('R29 rain: after the sky clears (typhoon Lv3) nothing happens; milk, chip and rat are never hit by the rain', () => {
  const late = turnEvents(['milk', 'typhoon', 'chip', 'rat', 'boba']);
  assert.equal(late.r.state.lv.typhoon, 3);
  assert.ok(!late.r.events.some(e => e.cause === 'typhoon'), 'the typhoon was already Lv3: no blown cart');
  assert.ok(!late.s.flags.cartBlown && !late.s.locked.boba);
  for (const item of ['chip', 'rat']) {
    const { r } = turnEvents(['milk', 'typhoon', item]);
    assert.ok(!r.events.some(e => e.cause === 'typhoon'), `${item}: no rain check`);
  }
  const milk = turnEvents(['chip', 'typhoon', 'milk']);
  assert.ok(!milk.r.events.some(e => e.cause === 'typhoon'), 'milk: no rain check (the day-off story is only at the typhoon placement)');
});
test('R29 rain: the typhoon placement turn checks are unchanged and are not repeated by the rain on later turns', () => {
  const { r, s } = turnEvents(['milk', 'token', 'typhoon']);
  assert.deepEqual(r.events.filter(e => e.cause === 'typhoon').map(e => e.flag?.name ?? e.story), ['flooded', '颱風假！小朋友在家看電視']);
  const next = place(s, 'baseball', real);
  assert.deepEqual(next.events.filter(e => e.cause === 'typhoon').map(e => e.lock), ['baseball'], 'only the new baseball; the token is not flooded twice');
});
test('R29 rain is declared in the spec, not hard-coded: a mini spec with rain on w locks a placed x while w is 1..2', () => {
  const w = { ORDER: ['w', 'x', 'y'], ITEMS: {
    w: { name: 'W', max: 3, up: { 2: { always: true }, 3: { always: true } }, rain: { while: { and: [{ minLevel: ['w', 1] }, { maxLevel: ['w', 2] }] } },
         fx: [{ when: { and: [{ present: 'x' }, { maxLevel: ['x', 1] }] }, lock: 'x', flag: { name: 'wet' }, story: 'x 濕了' }] },
    x: { name: 'X', max: 2, up: { 2: { always: true } } }, y: { name: 'Y', max: 2, up: { 2: { always: true } } } },
    AFTER_TURN: [], STORIES: { placed: { w: '', x: '', y: '' }, grow: { w: { 2: '', 3: '' }, x: { 2: '' }, y: { 2: '' } } } };
  const s = place(createState(w), 'w', w).state;    // w 放下當回合長到 2
  const r = place(s, 'x', w);
  assert.equal(r.state.locked.x, true); assert.equal(r.state.lv.x, 1);
  assert.deepEqual(r.events[1], { kind: 'fx', item: 'w', cause: 'w', lock: 'x', flag: { name: 'wet', value: true }, story: 'x 濕了' });
  const t = place(place(createState(w), 'w', w).state, 'y', w).state;   // w 3
  assert.ok(!place(t, 'x', w).state.locked.x, 'w Lv3: no rain');
});

// 計畫 14 R30 老鼠一直有效：老鼠 Lv1–2（還在島上）時放下的鮮奶／珍奶被咬——立 bitten_<id>、發 fx（cause rat），
// 而且老鼠還是 Lv1–2 期間它長不上去（掃描跳過、列在 wait 裡 for ['rat']，連放下那回合也列：老鼠指標守在它門口）；
// 老鼠升到 Lv3（搭捷運走了）那一刻起不再擋，旗標留著。原本的「放老鼠時鮮奶 ≤2 就 −1」照舊
const waitOf = (r, item) => r.events.find(e => e.kind === 'wait')?.waits.find(w => w.item === item);
test('R30 rat: boba placed while the rat is Lv2 is bitten (flag, fx event after placed, before growth), does not grow and waits for the rat', () => {
  const { r, s } = turnEvents(['milk', 'baseball', 'rat', 'boba']);
  assert.equal(r.state.lv.rat, 2, 'precondition: the rat is Lv2 (no token for the metro)');
  const bite = r.events.find(e => e.kind === 'fx' && e.cause === 'rat');
  assert.deepEqual(bite, { kind: 'fx', item: 'boba', cause: 'rat', flag: { name: 'bitten_boba', value: 'rat' }, story: '老鼠咬了剛開的珍奶' });   // 修正輪 1：旗標值記下咬它的那個
  assert.equal(r.events.indexOf(bite), 1, 'right after the placed event');
  assert.equal(s.flags.bitten_boba, 'rat');
  assert.equal(s.lv.boba, 1, 'boba up[2] (milk ≥ 3) holds, but the rat blocks it');
  assert.ok(!r.events.some(e => e.kind === 'grow' && e.item === 'boba'));
  assert.deepEqual(waitOf(r, 'boba'), { item: 'boba', for: ['rat'] }, 'listed as waiting for the rat even in its placement turn');
  const next = place(s, 'chip', real);
  assert.equal(next.state.lv.boba, 1, 'still blocked while the rat is Lv2');
  assert.deepEqual(waitOf(next, 'boba'), { item: 'boba', for: ['rat'] });
  assert.ok(!next.events.some(e => e.cause === 'rat' && e.flag?.name === 'bitten_boba'), 'bitten once, at placement');
});
test('R30 rat: milk placed while the rat is Lv1 is bitten and stays Lv1 (and the rat, needing milk ≥ 2, stays Lv1 too)', () => {
  const { r, s } = turnEvents(['rat', 'milk']);
  assert.deepEqual(r.events.find(e => e.cause === 'rat'), { kind: 'fx', item: 'milk', cause: 'rat', flag: { name: 'bitten_milk', value: 'rat' }, story: '老鼠咬了剛開的鮮奶' });
  assert.equal(s.lv.milk, 1); assert.equal(s.lv.rat, 1);
  assert.deepEqual(waitOf(r, 'milk'), { item: 'milk', for: ['rat'] });
  assert.equal(advance(s, real).state.lv.milk, 1, 'still bitten next turn');
});
// 修正輪 1 裁決 4：放下那一刻老鼠照當下狀態這回合就會搭上捷運（up[3]／jump[4] 成立）就不咬——不演「咬了當回合又放過」
test('R30 rat (fix round 1, ruling 4): boba placed while the rat is Lv2 but already able to board this turn (token ≥ 4) is not bitten and grows as usual', () => {
  const { r, s } = turnEvents(['milk', 'baseball', 'token', 'rat', 'boba']);
  assert.ok(!s.flags.bitten_boba && !r.events.some(e => e.flag?.name === 'bitten_boba'), 'no bite: the rat boards the metro this very turn');
  const g = r.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`);
  assert.ok(g.includes('rat3') && g.includes('boba2'), `rat 3 and boba 2: ${g}`);
});
test('R30 rat: the turn the rat reaches Lv3 the bitten boba grows too (the rat is scanned first; boba sits after it in ORDER)', () => {
  const { r, s } = turnEvents(['milk', 'baseball', 'rat', 'boba', 'token', 'bulb']);   // 第 4 回合咬（老鼠 2、沒有代幣）、第 6 回合代幣 4 → 老鼠 3
  assert.equal(s.flags.bitten_boba, 'rat', 'bitten at placement on turn 4');
  const g = r.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`);
  assert.ok(g.includes('rat3') && g.includes('boba2'), `rat 3 and boba 2 in the same turn: ${g}`);
  assert.ok(g.indexOf('rat3') < g.indexOf('boba2'), 'the rat leaves first, then the boba grows');
  assert.ok(!waitOf(r, 'boba'), 'not waiting any more');
});
test('R30 rat: a bitten item scanned before the rat still grows in the turn the rat leaves (the scan repeats)', () => {
  const m = { ORDER: ['m', 'r', 't'], ITEMS: {
    m: { name: '奶', max: 3, up: { 2: { always: true }, 3: { always: true } } },
    r: { name: '鼠', max: 3, up: { 2: { always: true }, 3: { present: 't' } }, bite: { while: { and: [{ minLevel: ['r', 1] }, { maxLevel: ['r', 2] }] }, targets: ['m'], story: { m: '鼠咬了剛開的奶' } } },
    t: { name: 'T', max: 1, up: {} } },
    AFTER_TURN: [], STORIES: { placed: { m: '', r: '', t: '' }, grow: { m: { 2: 'm2', 3: 'm3' }, r: { 2: 'r2', 3: 'r3' }, t: {} } } };
  let s = place(createState(m), 'r', m).state;      // r 2
  const bitten = place(s, 'm', m); s = bitten.state;
  assert.equal(s.lv.m, 1); assert.equal(bitten.events[1].story, '鼠咬了剛開的奶');
  assert.deepEqual(waitOf(bitten, 'm'), { item: 'm', for: ['r'] });
  const free = place(s, 't', m);
  assert.deepEqual(free.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`), ['r3', 'm2'], 'm is skipped in the first pass, grows in the second');
  assert.equal(free.state.flags.bitten_m, 'r', 'the flag stays for the show (value: who bit it)');
});
test('R30 rat: placed after the rat reached Lv3 nothing is bitten; the old rat-placement bite (milk ≤ 2 → −1) is unchanged and sets no bitten flag', () => {
  const { r, s } = turnEvents(['milk', 'baseball', 'token', 'rat', 'chip', 'boba']);
  assert.ok(s.lv.rat >= 3);
  assert.ok(!r.events.some(e => e.cause === 'rat' && e.flag?.name?.startsWith('bitten_')), 'no bite (the rat Lv4 branch is also a rat fx)'); assert.ok(!s.flags.bitten_boba);
  assert.equal(s.lv.boba, 2, 'grows as usual');
  const old = turnEvents(['milk', 'rat']);
  assert.deepEqual(old.r.events.find(e => e.cause === 'rat').delta, { target: 'milk', from: 2, to: 1 });
  assert.ok(!old.s.flags.bitten_milk, 'the milk was there first: no blocking bite');
  for (const item of ['chip', 'bulb', 'token', 'baseball']) {
    const t = turnEvents(['milk', 'rat', item]);
    assert.ok(!t.r.events.some(e => e.cause === 'rat'), `${item} is not bitten`);
  }
});
// 計畫 14 Task 4：雨中放下、當場被吹走（鎖住）的攤車不會再被老鼠咬（攤車已經在海裡：老鼠不跑去海邊咬）
test('R30 rat: a boba blown away by the rain the moment it is placed is not bitten as well', () => {
  const { r, s } = turnEvents(['milk', 'rat', 'typhoon', 'boba']);
  assert.ok(s.lv.rat >= 1 && s.lv.rat <= 2 && s.lv.typhoon >= 1, `precondition: rat ${s.lv.rat}, typhoon ${s.lv.typhoon}`);
  assert.equal(s.locked.boba, true); assert.equal(s.flags.cartBlown, true);
  assert.ok(!s.flags.bitten_boba && !r.events.some(e => e.flag?.name === 'bitten_boba'), 'no bite on a blown cart');
});

// 修正輪 1：咬它的那個記在旗標值上，擋不擋看那一個的 bite.while（heldBy 給演出層共用）；故事句在規格（bite.story），引擎不寫死
test('heldBy(state, id): the biter recorded in the bitten flag while its bite.while holds, else null; the story comes from the spec', async () => {
  const { heldBy } = await import('../src/rules/engine.js');
  const L = rat => ({ ...createState(real).lv, rat, boba: 1 });
  assert.equal(heldBy({ lv: L(2), flags: { bitten_boba: 'rat' } }, 'boba', real), 'rat');
  assert.equal(heldBy({ lv: L(1), flags: { bitten_boba: 'rat' } }, 'boba', real), 'rat');
  assert.equal(heldBy({ lv: L(3), flags: { bitten_boba: 'rat' } }, 'boba', real), null, 'the rat left on the metro');
  assert.equal(heldBy({ lv: L(2), flags: {} }, 'boba', real), null, 'not bitten');
  const two = { ORDER: ['m', 'r', 'q'], ITEMS: {
    m: { name: '奶', max: 2, up: { 2: { always: true } } },
    r: { name: '鼠', max: 3, up: { 2: { always: true }, 3: { present: 'q' } }, bite: { while: { maxLevel: ['r', 2] }, targets: ['m'], story: { m: 'r 咬' } } },
    q: { name: '蟲', max: 3, up: { 2: { minLevel: ['r', 3] }, 3: { always: true } }, bite: { while: { maxLevel: ['q', 1] }, targets: ['m'], story: { m: 'q 咬' } } } },
    AFTER_TURN: [], STORIES: { placed: { m: '', r: '', q: '' }, grow: { m: { 2: '' }, r: { 2: '', 3: '' }, q: { 2: '', 3: '' } } } };
  // 只有 r 在場：r 咬；之後 q 來了、r 升 3 → r 放過（就算 q 的 while 成立，咬它的不是 q）
  let s = place(createState(two), 'r', two).state;
  const b = place(s, 'm', two); s = b.state;
  assert.equal(b.events[1].story, 'r 咬'); assert.equal(s.flags.bitten_m, 'r');
  assert.equal(heldBy(s, 'm', two), 'r');
  const after = place(s, 'q', two);
  assert.equal(after.state.lv.r, 3); assert.equal(heldBy(after.state, 'm', two), null, 'only the recorded biter holds it');
  assert.equal(after.state.lv.m, 2, 'free once its own biter left');
});

// 修正輪 2：咬之前先「不咬」試跑一次這回合（同一個 turn()、工作狀態的複本、不往外發事件、試跑裡不再試跑），
// 試跑結束時咬它的那個已經升出 bite.while（老鼠搭上捷運）就不咬——全枚舉（含最後一輪）裡「咬了、被咬的同一回合又長」是 0 次
test('R30 rat (fix round 2): over all 8! orders, nothing bitten ever grows in the turn it was bitten', () => {
  let bites = 0, same = 0;
  const walk = (s, left) => {
    if (!left.length) return;
    for (const id of left) {
      const r = place(s, id, real);
      for (const e of r.events) if (e.flag?.name?.startsWith('bitten_')) { bites++; if (r.events.some(g => g.kind === 'grow' && g.item === e.item)) same++; }
      walk(r.state, left.filter(x => x !== id));
    }
  };
  walk(createState(real), real.ORDER);
  assert.ok(bites > 10000, `${bites} bites`);
  assert.equal(same, 0, `${same} bitten-and-released-in-the-same-turn placements`);
});
// 試跑看的是整回合：放下那一刻老鼠還上不了車（代幣 3），同一回合掃描裡代幣先長到 4、老鼠才上車——這種也不咬
test('R30 rat (fix round 2): the rat boards later in the same scan (the token reaches 4 this turn) → no bite', () => {
  // 列舉裡找一條：放下珍奶那一刻老鼠 2、代幣 ≤3，這回合結束老鼠 ≥3
  const perms = a => a.length ? a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])) : [[]];
  let found = null;
  for (const order of perms(real.ORDER)) {
    let s = createState(real);
    for (const id of order) {
      const before = s, r = place(s, id, real); s = r.state;
      if (id === 'boba' && before.lv.rat === 2 && before.lv.token <= 3 && s.lv.rat >= 3) { found = { order, r }; break; }
    }
    if (found) break;
  }
  assert.ok(found, 'such a placement exists');
  assert.ok(!found.r.events.some(e => e.flag?.name === 'bitten_boba'), `${found.order.join(',')}: not bitten`);
  assert.ok(!found.r.state.flags.bitten_boba);
});
