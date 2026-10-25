import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, place, advance, isAllMax, isComplete, SCAN_LIMIT, condDeps } from '../src/rules/engine.js';

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
// GROW 的節奏：每回合每個物品最多升一級，剛放下的物品當回合不升（使用者 2026-10-25）
test('ages advance each turn; an item grows at most one level per turn and never in the turn it is placed', () => {
  let s = createState(mini);
  s = place(s, 'a', mini).state;          // a1（剛放，不升）
  assert.equal(s.lv.a, 1);
  const t2 = place(s, 'c', mini);          // a2 (age1)；c 剛放：c1，不升
  s = t2.state; assert.equal(s.lv.a, 2); assert.equal(s.lv.c, 1);
  const t3 = place(s, 'b', mini);          // a3；c 被剛放下的 b 擋住；b 剛放：b1
  s = t3.state; assert.equal(s.lv.a, 3); assert.equal(s.lv.c, 1); assert.equal(s.lv.b, 1);
  assert.deepEqual(t3.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`), ['a3']);
  const t4 = place(s, 'd', mini);          // b 條件上可以連升到 3，但一回合只升一級 → b2；c 仍被 b 擋住
  assert.equal(t4.state.lv.b, 2); assert.equal(t4.state.lv.c, 1);
  assert.deepEqual(t4.events.filter(e => e.kind === 'grow').map(e => `${e.item}${e.to}`), ['b2']);
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
  s = place(s, 'c', mini).state; s = place(s, 'b', mini).state;
  const r = place(s, 'd', mini);          // c up always, but stalled by b present
  assert.equal(r.state.lv.c, 1);
  assert.equal(r.events.filter(e => e.kind === 'stall' && e.item === 'c').length, 1);
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
  let s = place(createState(sp), 'x', sp).state; s = place(s, 'y', sp).state;   // x → 2
  assert.throws(() => place(s, 'z', sp), /chain limit .* x/);
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
