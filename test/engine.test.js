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
  const t2 = place(s, 'b', mini);          // a2（age 1）；b 剛放，同回合跟著 a ≥ 2 長到 2（預設 jump[3] 也成立，但放下當回合最多 Lv2）
  s = t2.state; assert.equal(s.lv.a, 2); assert.equal(s.lv.b, 2);
  assert.deepEqual(t2.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`), ['a2', 'b2']);
  const t3 = place(s, 'c', mini);          // a3 → b3（b3 的反應想扣 c，c 已經 1 扣不動）；c 剛放就被 b 擋住
  s = t3.state; assert.equal(s.lv.a, 3); assert.equal(s.lv.b, 3); assert.equal(s.lv.c, 1);
  assert.deepEqual(t3.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`), ['a3', 'b3']);
  assert.ok(t3.events.some(e => e.kind === 'stall' && e.item === 'c'), 'the fresh c is stalled in its own turn');
  const t4 = place(s, 'd', mini);          // 沒有人能動：c 仍被 b 擋住
  assert.equal(t4.state.lv.c, 1); assert.deepEqual(t4.events.filter(e => e.kind === 'grow'), []);
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
test('landsTyphoon: only the event that brings the typhoon to Lv2', () => {
  assert.equal(landsTyphoon({ kind: 'grow', item: 'typhoon', from: 1, to: 2 }), true);
  assert.equal(landsTyphoon({ kind: 'fx', item: 'typhoon', delta: { target: 'typhoon', from: 1, to: 2 } }), true);
  assert.equal(landsTyphoon({ kind: 'grow', item: 'typhoon', from: 2, to: 3 }), false);
  assert.equal(landsTyphoon({ kind: 'grow', item: 'milk', from: 1, to: 2 }), false);
  assert.equal(landsTyphoon({ kind: 'fx', item: 'typhoon', delta: { target: 'typhoon', from: 2, to: 2 } }), false);
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
  const r = place(s, 'b', hop);                        // b 先掃、放下就到 2 → a 在 2、jump[4]（b≥2）成立 → 2→3→4（預設那條 up[3] ∧ up[4] 不成立）
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
         jump: { 6: { always: true } } },
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
  const q = place(s, 'q', push);                                  // +1（2 → 3），再 +1 → 4（剛好 +2；預設 jump[5] 是 +3 → 不跳）
  assert.equal(q.state.lv.x, 4);
  let t = place(createState(push), 'x', push).state; t = advance(t, push).state; t = advance(t, push).state;   // x 2 → 4 → 6（都是跳級）
  assert.equal(t.lv.x, 6);
  const j = place(t, 'q', push);                                  // delta +1 → 7；預設 jump[9] 是 +3 → 不跳，改 +1 → 8
  assert.equal(j.state.lv.x, 8); assert.deepEqual(grows(j), ['x7>8']);
  const z = place(t, 'z', push);                                  // 三次 +1：第三次壓到 0 → 沒有那個事件
  assert.equal(z.state.lv.x, 8); assert.deepEqual(z.events.filter(e => e.delta).map(e => e.story), ['z推x', 'z再推x']);
});
test('jump fires only from exactly n−2: one level short or past it, the item takes +1 or waits', () => {
  // steady 的 a 只剩 spec 寫的 jump[4]（b ≥ 2，b 已經是 2）
  const st = { ...hop, ITEMS: { ...hop.ITEMS, a: { ...hop.ITEMS.a, steady: true } } }, s0 = createState(st);
  const at = n => advance({ ...s0, lv: { ...s0.lv, a: n, b: 2 }, age: { ...s0.age, a: 3, b: 3 }, held: { ...s0.held, a: 1, b: 1 }, turn: 4 }, st);
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

// 真的 spec（物品 v2）：颱風賴在大巨蛋、老鼠放下就咬、老鼠分岔看晶片
import * as real from '../src/rules/spec.js';
const playReal = (order, closing = 0) => {
  let s = createState(real); const lvs = [];
  for (const id of order) { s = place(s, id, real).state; lvs.push(s.lv); }
  for (let i = 0; i < closing; i++) { s = advance(s, real).state; lvs.push(s.lv); }
  return { s, lvs };
};
test('delay[3] on typhoon: with baseball ≥ 3 the rainbow waits one extra turn instead of never coming', () => {
  // 選擇帶動升級：颱風放下當回合就登陸。燈泡要到 6 才放得了晴，而燈泡 5 要棒球 ≥4，所以照常玩放晴時大巨蛋一定在：
  // 晶片還沒測矽盾 → 放下（登陸）→ 賴在巨蛋一回合 → 放晴
  // （因果設計 2026-10-28：棒球長要鮮奶 ≥3，所以鮮奶先放；第 6 個放颱風）
  const { lvs } = playReal(['milk', 'chip', 'bulb', 'token', 'baseball', 'typhoon', 'rat', 'boba']);
  assert.ok(lvs[6].baseball >= 3 && lvs[6].chip <= 7);
  assert.deepEqual(lvs.slice(5, 8).map(l => l.typhoon), [2, 2, 3]);
  // 正解（賽博）：第 8 個放、晶片已經 8 → 罩子把颱風推走，最後一輪就放晴
  const cyber = playReal(['milk', 'baseball', 'bulb', 'token', 'chip', 'boba', 'rat', 'typhoon'], 1).lvs;
  assert.deepEqual(cyber.slice(7).map(l => l.typhoon), [2, 3]); assert.equal(cyber[7].chip, 8);
  // 矽盾測試過（晶片 ≥8）：罩子把颱風推走，不多等
  const s0 = createState(real);
  const lingering = { ...s0, lv: { ...s0.lv, typhoon: 2, baseball: 5, bulb: 6, chip: 8 }, age: { ...s0.age, typhoon: 1, baseball: 5, bulb: 5, chip: 5 }, held: { ...s0.held, typhoon: 0, baseball: 0, bulb: 0, chip: 0 }, turn: 9 };   // 颱風上回合剛登陸
  assert.equal(advance(lingering, real).state.lv.typhoon, 3);
  assert.equal(advance({ ...lingering, lv: { ...lingering.lv, chip: 6 } }, real).state.lv.typhoon, 2);
});
// 計畫 4 任務 9：只差多等一回合（+1 條件成立、delay 擋著）時記一個 stall 事件（演出層：雲停在巨蛋上空冒「……」）；
// 缺幫手（燈泡 <6）照舊是 wait，不記 stall；第二回合照常長
test('the typhoon delay records one stall event on the extra turn (up passes, delay holds), then grows', () => {
  const s0 = createState(real);
  const lingering = { ...s0, lv: { ...s0.lv, typhoon: 2, baseball: 5, bulb: 6, chip: 6 }, age: { ...s0.age, typhoon: 1, baseball: 5, bulb: 5, chip: 5 }, held: { ...s0.held, typhoon: 0, baseball: 0, bulb: 0, chip: 0 }, locked: { bulb: true, chip: true, baseball: true }, turn: 9 };
  const r1 = advance(lingering, real);
  assert.equal(r1.state.lv.typhoon, 2);
  assert.deepEqual(r1.events.filter(e => e.kind === 'stall'), [{ kind: 'stall', item: 'typhoon' }]);
  assert.ok(!r1.events.some(e => e.kind === 'wait' && e.waits.some(w => w.item === 'typhoon')), 'not a wait');
  const r2 = advance(r1.state, real);
  assert.equal(r2.state.lv.typhoon, 3); assert.ok(!r2.events.some(e => e.kind === 'stall'));
  const pushed = advance({ ...lingering, lv: { ...lingering.lv, chip: 8 } }, real);
  assert.equal(pushed.state.lv.typhoon, 3); assert.ok(!pushed.events.some(e => e.kind === 'stall'), 'the shield pushes it away: no stall');
  const dark = advance({ ...lingering, lv: { ...lingering.lv, bulb: 5 } }, real);
  assert.ok(!dark.events.some(e => e.kind === 'stall'), 'waiting for the bulb is a wait, not a stall');
  assert.ok(dark.events.some(e => e.kind === 'wait' && e.waits.some(w => w.item === 'typhoon')));
});
test('rat placed while milk ≤ 2 bites milk −1; placed later it does not', () => {
  const s = place(createState(real), 'milk', real).state;    // 鮮奶放下當回合就到 2（早餐店）；沒有棒球就蓋不了小學
  const r = place(s, 'rat', real);
  const bite = r.events.find(e => e.kind === 'fx' && e.delta?.target === 'milk');
  assert.deepEqual(bite.delta, { target: 'milk', from: 2, to: 1 }); assert.equal(r.state.lv.milk, 2, 'bitten to 1, then grows back to 2 this turn');
  assert.equal(r.state.lv.rat, 2, 'the rat itself grows in its placement turn');
  let t = place(createState(real), 'milk', real).state; t = place(t, 'baseball', real).state;   // 鮮奶 3（小學，沙地球場當操場）
  const late = place(t, 'rat', real);
  // 沒咬；鮮奶也不長——兩層校舍要有人帶家庭來（晶片／燈泡／代幣／珍奶），老鼠不算（因果設計 2026-10-28 §3）
  assert.ok(!late.events.some(e => e.delta?.target === 'milk')); assert.equal(late.state.lv.milk, 3);
  assert.equal(late.events.filter(e => e.kind === 'fx' && e.cause === 'rat').length, 0, 'no boba to knock over either');
});
test('ratBranch at rat Lv4: chip ≥ 8 → cyber, else alien', () => {
  const at = (chip) => {
    const s0 = createState(real);
    const s = { ...s0, lv: { ...s0.lv, rat: 3, chip }, age: { ...s0.age, rat: 3, chip: 8 }, held: { ...s0.held, rat: 1, chip: 1 }, turn: 9 };
    return advance(s, real);
  };
  const cyber = at(8), alien = at(6);   // 晶片 8 → 9 要颱風、6 → 7 要代幣：這回合都不動
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

// 計畫 5b 選擇帶動升級（設計 2026-10-28 §3）：放下的物品當回合就長；每一級 n ≥ 3 預設都能跳（up[n−1] ∧ up[n]）；
// steady 的物品不加預設跳級；一回合最多 +2（連 delta）不變
const choice = {
  ORDER: ['h', 'g', 'k', 'm', 'z'],   // h 先掃：h 這回合長上來，同一輪掃到 g 時 g 就能跳
  ITEMS: {
    g: { name: 'G', max: 5, up: { 2: { always: true }, 3: { always: true }, 4: { minLevel: ['h', 2] }, 5: { minLevel: ['h', 9] } },
         jump: { 4: { present: 'k' } }, onLevel: { 3: [{ flag: { name: 'g3' } }] } },
    h: { name: 'H', max: 2, up: { 2: { always: true } } },
    k: { name: 'K', max: 1, up: {} },
    m: { name: 'M', max: 5, steady: true, up: { 2: { always: true }, 3: { always: true }, 4: { always: true }, 5: { always: true } }, jump: { 5: { always: true } } },
    z: { name: 'Z', max: 1, up: {} },
  },
  AFTER_TURN: [], STORIES: { placed: { g: '', h: '', k: '', m: '', z: '' }, grow: { g: { 2: 'g2', 3: 'g3', 4: 'g4', 5: 'g5' }, h: { 2: '' }, k: {}, m: { 2: '', 3: '', 4: '', 5: '' }, z: {} } },
};
test('a placed item joins the growth scan in its placement turn: up[2] holds → it ends the turn at Lv2 (never Lv3)', () => {
  const r = place(createState(choice), 'g', choice);           // 0 → 1（放下）→ 2；預設 jump[3]（up2 ∧ up3）成立，但回合開始是 0 級，最多到 2
  assert.equal(r.state.lv.g, 2); assert.deepEqual(grows(r), ['g1>2']);
  assert.deepEqual(r.events.map(e => e.kind), ['placed', 'grow']);
  assert.equal(r.state.held.g, 0); assert.equal(r.state.age.g, 0);
  const stuck = place(createState(choice), 'k', choice);       // k 沒有 up[2]：停在 1，也不算在等誰
  assert.equal(stuck.state.lv.k, 1); assert.ok(!stuck.events.some(e => e.kind === 'wait'));
});
test('default jump: at n−2 with up[n−1] and up[n] both true the item rises +2 in one turn; an explicit jump[n] is an alternative (either holds)', () => {
  // 兩條都不成立（h 沒放、k 沒放）：up[3] 成立 → 只 +1
  let s = place(createState(choice), 'g', choice).state;
  assert.deepEqual(grows(place(s, 'z', choice)), ['g2>3']);
  // 預設那條：h 先長到 2 → up[3] ∧ up[4] → 2 → 3 → 4 一回合，跳過的第 3 級照樣觸發 onLevel；via = 編譯後條件的幫手
  s = place(createState(choice), 'h', choice).state; s = place(s, 'g', choice).state;   // h2、g2
  let r = place(s, 'z', choice);
  assert.deepEqual(grows(r), ['g2>3', 'g3>4J']); assert.equal(r.state.flags.g3, true);
  assert.deepEqual(r.events.find(e => e.jump).via, ['h'], 'via = 真的成立的那一支（預設 up[3] ∧ up[4]，k 沒放就不列）');
  // spec 寫的那條：h 沒放、k 在場 → 一樣跳
  s = place(createState(choice), 'g', choice).state;
  r = place(s, 'k', choice);
  assert.deepEqual(grows(r), ['g2>3', 'g3>4J']);
  assert.deepEqual(r.events.find(e => e.jump).via, ['k'], 'via = spec 寫的那條（present k）');
  // 在 3：預設 jump[5] = up[4] ∧ up[5]（h ≥ 9 永遠不成立）→ 只 +1；下一級也一樣
  s = place(createState(choice), 'g', choice).state; s = place(s, 'z', choice).state;   // g3
  assert.deepEqual(grows(place(s, 'h', choice)).filter(x => x[0] === 'g'), ['g3>4']);
});
test('steady items get no default jumps: milk rises one level per turn except its explicit jump[7]', () => {
  let s = place(createState(choice), 'm', choice).state; assert.equal(s.lv.m, 2);
  s = advance(s, choice).state; assert.equal(s.lv.m, 3, 'no default jump[4] for a steady item');
  const r = advance(s, choice); assert.deepEqual(grows(r), ['m3>4', 'm4>5J'], 'its explicit jump[5] still works');
  const loose = { ...choice, ITEMS: { ...choice.ITEMS, m: { ...choice.ITEMS.m, steady: false } } };
  assert.deepEqual(grows(advance(place(createState(loose), 'm', loose).state, loose)), ['m2>3', 'm3>4J'], 'the same item without steady jumps');
  // 真的鮮奶（棒球第 2 個放，當操場、組少棒隊）：2 → 5 一回合一級（不 steady 就會 3 → 5），5 → 7 是 spec 寫的跳級（大巨蛋蓋好）
  // （因果設計 2026-10-28：鮮奶 4 要有人帶家庭來、5 要路燈，所以照賽博正解的前綴放，不再空轉）
  let t = place(createState(real), 'milk', real).state; const lvs = [t.lv.milk];
  for (const id of ['baseball', 'bulb', 'token', 'chip']) { t = place(t, id, real).state; lvs.push(t.lv.milk); }
  assert.deepEqual(lvs, [2, 3, 4, 5, 7]); assert.ok(t.lv.baseball >= 3);
  assert.deepEqual(real.ORDER.filter(id => real.ITEMS[id].steady), ['milk']);
});
test('a default jump across a level with onLevel fires that reaction (rat Lv3 → 5 crosses the Lv4 branch; typhoon 1 → 3 crosses the Lv2 check)', () => {
  const s0 = createState(real);
  // 老鼠 up[5] 看 ratBranch，旗標要到 Lv4 才設：照常玩老鼠在 3 時預設 jump[5] 不成立，只 +1
  const rat = { ...s0, lv: { ...s0.lv, rat: 3, chip: 8, token: 7 }, age: { ...s0.age, rat: 3, chip: 8, token: 8 }, held: { ...s0.held, rat: 1, chip: 1, token: 1 }, locked: { chip: true, token: true }, turn: 9 };
  const plain = advance(rat, real);
  assert.deepEqual(grows(plain).filter(g => g.startsWith('r')), ['rat3>4']); assert.equal(plain.state.flags.ratBranch, 'cyber');
  // 人工造的狀態（照規則玩不會出現：旗標只在老鼠 Lv4 設）——旗標已經是 alien、颱風 2：3 → 4 → 5 一回合，跨過第 4 級重新分岔（晶片 8 → cyber）
  const hop5 = advance({ ...rat, lv: { ...rat.lv, typhoon: 2 }, flags: { ratBranch: 'alien' } }, real);
  assert.deepEqual(grows(hop5).filter(g => g.startsWith('r')), ['rat3>4', 'rat4>5J']);
  assert.equal(hop5.state.flags.ratBranch, 'cyber');
  // 颱風在 1、燈泡 ≥ 6、沒有大巨蛋：1 → 2 → 3 一回合，跨過第 2 級照樣全島檢查（颱風假、珍奶外送）
  const ty = { ...s0, lv: { ...s0.lv, typhoon: 1, bulb: 6, milk: 3, boba: 2 }, age: { ...s0.age, typhoon: 1, bulb: 6, milk: 3, boba: 3 }, held: { ...s0.held, typhoon: 1, bulb: 1, milk: 1, boba: 1 }, locked: { bulb: true, milk: true, boba: true }, turn: 9 };
  const r = advance(ty, real);
  assert.deepEqual(grows(r).filter(g => g.startsWith('t')), ['typhoon1>2', 'typhoon2>3J']);
  assert.ok(r.events.some(e => e.kind === 'fx' && e.cause === 'typhoon' && e.story === '颱風假！小朋友在家看電視'));
  assert.ok(r.events.some(e => e.kind === 'fx' && e.delta?.target === 'boba'), 'the boba delivery delta still fires');
});
test('the +2 per turn cap still includes deltas', () => {
  // x 放下就到 2；p 的 +5 只能推到 4（回合開始 2 + 2），之後 x 不能再長、預設跳級也不行
  let s = place(createState(push), 'x', push).state; assert.equal(s.lv.x, 2);
  let r = place(s, 'p', push);
  assert.deepEqual(r.events.find(e => e.delta).delta, { target: 'x', from: 2, to: 4 }); assert.deepEqual(grows(r), []);
  // q 推 +1 到 3：預設 jump[5] 會是 +3 → 不跳，改 +1 → 4
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
// and 全列、跳級是兩級條件的聯集；不成立的分支、「要低於」的物品都不算
const cause = {
  ORDER: ['milk', 'chip', 'token', 'p', 'z'],
  ITEMS: {
    milk: { name: 'M', max: 1, up: {} },
    chip: { name: 'C', max: 3, up: { 2: { always: true }, 3: { always: true } } },
    token: { name: 'T', max: 4, up: { 2: { always: true }, 3: { always: true }, 4: { always: true } } },
    p: { name: 'P', max: 4, up: { 2: { always: true }, 3: { or: [{ minLevel: ['chip', 3] }, { minLevel: ['token', 4] }] }, 4: { present: 'milk' } } },
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
test('via lists only the helpers that satisfied the condition: or(min chip 3, min token 4) with only token placed → [token]; a jump unions both levels', () => {
  // 只有代幣：p 在 2，代幣到 4 → p 升 3，via 只有 token（晶片沒放）
  let s = place(createState(cause), 'token', cause).state; s = advance(s, cause).state; s = advance(s, cause).state;   // token 2 → 4
  assert.equal(s.lv.token, 4);
  s = place(s, 'p', cause).state; assert.equal(s.lv.p, 2);
  let r = place(s, 'z', cause), g = r.events.find(e => e.kind === 'grow' && e.item === 'p' && e.to === 3);
  assert.ok(g && !g.jump, 'p takes +1 (up[4] needs milk)'); assert.deepEqual(g.via, ['token']);
  // 跳級：鮮奶在場、代幣 4 → p 2 → 4 一回合，預設跳級 up[3] ∧ up[4] 的聯集 = token（up[3] 成立的那支）＋ milk（up[4]）
  s = place(createState(cause), 'token', cause).state; s = advance(s, cause).state; s = advance(s, cause).state;
  s = place(s, 'milk', cause).state; s = place(s, 'p', cause).state; assert.equal(s.lv.p, 2);
  r = place(s, 'z', cause);
  const jumps = r.events.filter(e => e.kind === 'grow' && e.item === 'p');
  assert.deepEqual(jumps.map(e => [e.to, !!e.jump]), [[3, false], [4, true]]);
  for (const e of jumps) assert.deepEqual(e.via, ['milk', 'token'], `jump event to ${e.to}: union of both levels' satisfied helpers`);
});
