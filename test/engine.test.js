import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, place, isAllMax, isComplete, SCAN_LIMIT } from '../src/rules/engine.js';

// 迷你 spec：a 放了就自己每回合升；b 的 Lv2 需要 a>=2，Lv3 需要 a>=3（同回合連鎖）
const mini = {
  ORDER: ['a','b','c'],
  ITEMS: {
    a: { name:'A', max:3, up:{ 2:{age:['a',1]}, 3:{age:['a',2]} } },
    b: { name:'B', max:3, up:{ 2:{minLevel:['a',2]}, 3:{minLevel:['a',3]} },
         onLevel:{ 3:[{ when:{present:'c'}, delta:{target:'c', by:-1}, story:'b踩到c' }] } },
    c: { name:'C', max:2, up:{ 2:{always:true} }, stall:[{ when:{present:'b'}, story:'c被b擋住' }] },
  },
  AFTER_TURN: [{ when:{and:[{present:'a'},{age:['a',1]}]}, flag:{name:'aOld'}, story:'a老了' }],
  STORIES: { placed:{a:'放a',b:'放b',c:'放c'}, grow:{ a:{2:'a2',3:'a3'}, b:{2:'b2',3:'b3'}, c:{2:'c2'} } },
};

test('placing sets level 1, age 0, records order and a placed event', () => {
  const { state, events } = place(createState(mini), 'a', mini);
  assert.equal(state.lv.a, 1); assert.equal(state.age.a, 0); assert.deepEqual(state.order, ['a']); assert.equal(state.turn, 1);
  assert.deepEqual(events[0], { kind:'placed', item:'a', to:1, story:'放a' });
});
test('ages advance each turn and up conditions fire; cascade can climb several levels in one turn', () => {
  let s = createState(mini);
  s = place(s, 'a', mini).state;          // a1
  s = place(s, 'c', mini).state;          // a2 (age1), c1→? c up always → c2
  assert.equal(s.lv.a, 2); assert.equal(s.lv.c, 2);
  const r = place(s, 'b', mini);          // a3; b1→2 (a>=2) →3 (a>=3) 同回合；b3 onLevel: c -1
  assert.equal(r.state.lv.a, 3); assert.equal(r.state.lv.b, 3); assert.equal(r.state.lv.c, 1);
  const kinds = r.events.map(e => `${e.kind}:${e.item}${e.to ?? ''}`);
  assert.deepEqual(kinds.filter(k => k.startsWith('grow')), ['grow:a3','grow:b2','grow:b3']);
  const fx = r.events.find(e => e.kind === 'fx');
  assert.deepEqual(fx.delta, { target:'c', from:2, to:1 }); assert.equal(fx.cause, 'b');
});
test('stall blocks growth and records one stall event per turn', () => {
  let s = createState(mini);
  s = place(s, 'b', mini).state;
  const r = place(s, 'c', mini);          // c up always, but stalled by b present
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
test('pathological spec hits SCAN_LIMIT and throws naming the item', () => {
  const bad = { ORDER:['x','y'], ITEMS:{
    x:{ name:'X', max:3, up:{2:{always:true},3:{always:true}}, onLevel:{3:[{delta:{target:'y', by:-1}}]} },
    y:{ name:'Y', max:3, up:{2:{always:true},3:{always:true}}, onLevel:{3:[{delta:{target:'x', by:-1}}]} } },
    AFTER_TURN:[], STORIES:{placed:{x:'',y:''},grow:{x:{2:'',3:''},y:{2:'',3:''}}} };
  let s = place(createState(bad), 'x', bad).state;
  assert.throws(() => place(s, 'y', bad), new RegExp(`scan limit ${SCAN_LIMIT} exceeded while growing [xy]`));
});
test('isComplete / isAllMax on the real spec shape', () => {
  const s = createState(mini); assert.equal(isComplete(s), false); assert.equal(isAllMax(s, mini), false);
});
test('a positive delta that crosses a level fires that level\'s onLevel actions', () => {
  const sp = { ORDER: ['p','q'], ITEMS: {
      p: { name:'P', max:3, up:{ 2:{always:true}, 3:{minLevel:['p',9]} }, onLevel:{ 3:[{ flag:{name:'p3'}, story:'p到3' }] } },
      q: { name:'Q', max:2, up:{ 2:{minLevel:['q',9]} }, fx:[{ delta:{target:'p', by:1}, story:'q推p' }] } },
    AFTER_TURN: [], STORIES: { placed:{p:'',q:''}, grow:{ p:{2:'',3:''}, q:{2:''} } } };
  let s = place(createState(sp), 'p', sp).state;   // p → 2（3 永遠不會自己升）
  assert.equal(s.lv.p, 2);
  const r = place(s, 'q', sp);                       // q 的放置反應把 p 推到 3
  assert.equal(r.state.lv.p, 3); assert.equal(r.state.flags.p3, true);
  const kinds = r.events.map(e => e.kind + (e.story ?? ''));
  assert.ok(kinds.indexOf('fxq推p') < kinds.indexOf('fxp到3'));
});
test('a delta↔onLevel cycle throws a named chain-limit error instead of a stack overflow', () => {
  const sp = { ORDER: ['x'], ITEMS: {
      x: { name:'X', max:3, up:{ 2:{always:true}, 3:{always:true} },
           onLevel:{ 3:[{ delta:{target:'x', by:-1} }, { delta:{target:'x', by:1} }] } } },
    AFTER_TURN: [], STORIES: { placed:{x:''}, grow:{ x:{2:'',3:''} } } };
  assert.throws(() => place(createState(sp), 'x', sp), /chain limit .* x/);
});
