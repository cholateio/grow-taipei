// test/turn.test.js：事件 → 劇本 → 拍（預設劇本、模組劇本、終局事件、fx 掛在 cause 上）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { installFakeDom } from './helpers/fakedom.js';
installFakeDom();
const turnModule = await import('../src/show/turn.js');
const { buildTurn, estimateTurn, GAP } = turnModule;
const { B } = await import('../src/show/beats.js');
const { cellOf } = await import('../src/actors/anchors.js');
const finale = await import('../src/actors/finale.js');
const { WARNING, finaleEvents } = await import('../src/game.js');

const zero = Object.fromEntries(spec.ORDER.map(id => [id, 0]));
const fakeCtx = (extra = {}) => ({
  stage: { headOf: () => ({ x: 0, y: 1, z: 0 }), lv: {}, flags: {}, meta: {} },
  roster: { nearest: () => null, keys: () => [], members: () => [] },
  B, ...extra,
});
const tower = { id: 'tower', view() {} };
const base = (modules = [tower]) => ({ modules, spec, lv: { ...zero, chip: 1 }, flags: {}, meta: { total: 1 } });
// 每個事件劇本前的 mark 拍（0 秒，給 pace 工具量每個事件的秒數）不算在拍型清單裡
const noMarks = beats => beats.filter(b => b.kind !== 'mark');
const kindsOf = beats => noMarks(beats).map(b => b.kind);
// 走路拍的長度用 nav 估：假成員 + 假 nav，每段路長 len
const walker = { pos: { x: 0, y: 0, z: 0 }, speed: 1, head: () => ({ x: 0, y: 1, z: 0 }) };
const navOf = len => ({ route: () => [{ x: 0, z: 0 }, { x: len, z: 0 }], routeLength: () => len });

test('default scripts: placed → apply; grow → apply + levelUp; knock-back → LEVEL DOWN; a wait plays nothing', () => {
  // base()：lv chip 1、其他 0（所以 settle 的總等級 1 → 3 不跨 101 門檻，什麼都不演）
  const ctx = fakeCtx();
  const events = [{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'grow', item: 'chip', from: 1, to: 2 }, { kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } }, { kind: 'wait', item: 'bulb', waits: [{ item: 'bulb', for: ['baseball'] }] }, { kind: 'settle' }];
  const raw = buildTurn(events, base(), ctx);
  // 每個事件的劇本前面各一個 0 秒 mark 拍，start 時把事件交給 ctx.onMark
  const marks = raw.filter(b => b.kind === 'mark'), marked = [];
  assert.equal(marks.length, events.length); assert.ok(marks.every(b => b.dur === 0));
  for (const b of marks) b.start({ onMark: e => marked.push(e) });
  assert.deepEqual(marked, events);
  // mark 在每個事件最前面：第一拍就是 mark，之後每個 mark 前一拍都是上個事件補的 apply
  raw.forEach((b, i) => { if (b.kind === 'mark' && i > 0) assert.equal(raw[i - 1].kind, 'apply'); });
  assert.equal(raw[0].kind, 'mark'); assert.deepEqual(raw.slice(-3).map(b => b.kind), ['home', 'world', 'focus']);
  assert.doesNotThrow(() => marks[0].start({}), 'no onMark → no-op');
  const beats = noMarks(raw), kinds = kindsOf(raw);
  // 每個有東西演的事件前面平移過去（不同物品之間空 GAP 0.4 s，裁決 R15）；等待事件不平移（撲空拿掉了，R10）；回合最後回全景
  assert.deepEqual(kinds.filter(k => k !== 'apply' && k !== 'mark'), ['focus', 'wait', 'focus', 'levelUp', 'wait', 'focus', 'levelUp', 'wait', 'focus', 'home', 'world', 'focus']);
  assert.equal(beats[kinds.indexOf('levelUp') + 1].kind, 'apply', 'trailing apply after every script'); assert.equal(beats[kinds.lastIndexOf('levelUp')].down, true);
  assert.equal(beats[kinds.indexOf('levelUp')].down, false);
  // placed：平移 + 預設 apply + 補的 apply；每個事件至少一個 apply
  assert.deepEqual(kinds.slice(0, 3), ['focus', 'apply', 'apply']);
  assert.equal(kinds.filter(k => k === 'apply').length, 2 + 2 + 2 + 2 + 2);
});

test('a module script replaces the default and still gets a trailing apply', () => {
  const seen = [];
  const chip = { id: 'chip', view() {}, script: { grow: { 2: (e, s, ctx) => { seen.push({ e, s, ctx }); return [ctx.B.wait(1)]; } } } };
  const ctx = fakeCtx();
  const e = { kind: 'grow', item: 'chip', from: 1, to: 2 };
  const beats = buildTurn([e], base([tower, chip]), ctx);
  const kinds = kindsOf(beats);
  assert.deepEqual(kinds, ['focus', 'wait', 'apply', 'home', 'world', 'focus']);
  // s：這個事件套用後的等級；prev 是套用前；total／prevTotal 是總等級
  assert.equal(seen.length, 1); assert.equal(seen[0].e, e); assert.equal(seen[0].ctx, ctx);
  assert.equal(seen[0].s.lv.chip, 2); assert.equal(seen[0].s.prev.lv.chip, 1); assert.equal(seen[0].s.total, 2); assert.equal(seen[0].s.prevTotal, 1);
  // 其他等級沒有劇本 → 預設
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'grow', item: 'chip', from: 2, to: 3 }], base([tower, chip]), ctx)), ['focus', 'apply', 'levelUp', 'apply', 'home', 'world', 'focus']);
  // settle：交給 tower.script.settle，s.total 是結算後的總等級、prevTotal 是上次結算的
  let settled = null;
  const t2 = { id: 'tower', view() {}, script: { settle: (ev, s) => { settled = s; return []; } } };
  // settle 沒有拍：不平移
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'settle' }], base([t2]), ctx)), ['focus', 'apply', 'apply', 'apply', 'home', 'world', 'focus']);
  assert.equal(settled.total, 2); assert.equal(settled.prevTotal, 1);
});

test('no montage path remains: buildTurn has no montage/rush branches; a warning event plays finale.script.warning', () => {
  // 選擇帶動升級 §4：蒙太奇（倍速、過濾）與趕工整個拿掉
  for (const k of ['MONTAGE_CAP', 'MONTAGE_KEEP', 'MONTAGE_SPEED', 'RUSH_BUILD', 'RUSH_WALK']) assert.equal(k in turnModule, false, `${k} removed`);
  const src = buildTurn.toString();
  for (const w of ['montage', 'rush', 'MONTAGE', 'keep: true']) assert.ok(!src.includes(w), `buildTurn has no ${w}`);
  // 有人照舊傳 montage: true：一樣是一般回合（1 倍速、劇本整串照演、物品之間照空拍）
  const script = { placed: (e, s, c) => [c.B.walk(walker, { x: 2, z: 0 }), c.B.bubble(walker, '！'), c.B.gesture(walker, 'wave'), c.B.levelUp('milk')] };
  const milk = { id: 'milk', view() {}, script };
  const plain = fakeCtx({ nav: navOf(2) }), legacy = fakeCtx({ nav: navOf(2) });
  const e = { kind: 'placed', item: 'milk', to: 1 };
  const a = kindsOf(buildTurn([e], base([tower, milk]), plain)), b = kindsOf(buildTurn([e], { ...base([tower, milk]), montage: true }, legacy));
  assert.deepEqual(a, ['focus', 'walk', 'bubble', 'gesture', 'levelUp', 'apply', 'home', 'world', 'focus']);
  assert.deepEqual(b, a, 'montage option is ignored');
  assert.equal(plain.speed, 1); assert.equal(legacy.speed, 1);
  // 警告：先 mark、finale.script.warning 的拍（紅光 apply 只套 finale.flare → 抬頭＋「！」→ 放回日常）、補的 apply；不補鏡頭平移、不空拍
  assert.deepEqual(WARNING, { kind: 'warning', flag: { name: 'alarm', value: 1 } });
  const beats = buildTurn([WARNING, e], base([tower, finale, milk]), fakeCtx({ nav: navOf(2) })), kinds = kindsOf(beats);
  assert.equal(beats[0].kind, 'mark');
  assert.deepEqual(kinds.slice(0, 4), ['apply', 'together', 'home', 'apply']);
  assert.deepEqual(noMarks(beats)[0].only, ['finale.flare']);
  assert.ok(!kinds.slice(0, 4).includes('bubble'), 'no countdown digit');
  // 鮮奶的事件照常平移（warning 不算「上一個物品」：不空拍）
  assert.deepEqual(kinds.slice(4, 6), ['focus', 'walk']);
  assert.ok(!noMarks(beats).some(b => b.kind === 'wait'), 'no GAP after the warning');
  // 舞台旗標：foldEvent 折進 e.flag（alarm = 1）；劇本查 finale.script.warning
  const seen = [];
  const spy = { id: 'finale', view() { return {}; }, script: { warning: (ev, st) => { seen.push([ev.kind, st.flags.alarm]); return []; } } };
  buildTurn([WARNING], base([tower, spy]), fakeCtx());
  assert.deepEqual(seen, [['warning', 1]]);
  // 倒數劇本已經拿掉
  assert.equal(finale.script.countdown, undefined); assert.equal(typeof finale.script.warning, 'function');
  // 沒有 finale 模組：只有 apply
  assert.deepEqual(kindsOf(buildTurn([WARNING], base(), fakeCtx())), ['apply', 'apply', 'home', 'world', 'focus']);
});

test('missile / epilogue events look up finale.script[kind]; finale mode adds no lead focus, no GAP, no upright', () => {
  const calls = [];
  const fin = { id: 'finale', view() { return {}; }, script: {
    warning: (e, s, c) => { calls.push(['warning', s.flags.alarm, c.speed]); return [c.B.wait(0.5)]; },
    missile: (e, s, c) => { calls.push(['missile', e.outcome, s.flags.missile, c.speed]); return [c.B.wait(1)]; },
    epilogue: (e, s, c) => { calls.push(['epilogue', e.ending, s.flags.epilogue]); return [c.B.wait(2)]; },
  } };
  const events = finaleEvents({ id: 'cyber', missile: 'shield' });
  const tilted = () => ({ stage: { headOf: () => ({ x: 0, y: 1, z: 0 }), lv: {}, flags: {}, meta: {}, tilted: new Set(['milk.cart']) } });
  const ctx = fakeCtx(tilted());
  const beats = buildTurn(events, { ...base([tower, fin]), finale: true }, ctx);
  assert.equal(ctx.speed, 1);
  assert.deepEqual(calls, [['warning', 1, 1], ['missile', 'shield', 'shield', 1], ['epilogue', 'cyber', 'cyber']]);
  // 不扶正（第一拍就是 mark）、不補 focus、不空拍；收尾照舊
  assert.equal(beats[0].kind, 'mark');
  assert.deepEqual(kindsOf(beats), ['wait', 'apply', 'wait', 'apply', 'wait', 'apply', 'home', 'world', 'focus']);
  assert.equal(noMarks(beats).at(-1).final, true);
  assert.equal(estimateTurn(beats.filter(b => b.kind === 'wait'), ctx), 3.5, 'speed 1: show seconds are real seconds');
  // 沒有劇本：[apply]（加補的 apply）
  assert.deepEqual(kindsOf(buildTurn(events, { ...base(), finale: true }, fakeCtx())), ['apply', 'apply', 'apply', 'apply', 'apply', 'apply', 'home', 'world', 'focus']);
  // 對照：一般回合會先扶正被撞歪的零件
  assert.equal(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), fakeCtx(tilted()))[0].kind, 'apply');
  // 一般模式下的 missile 事件也查 finale 劇本、不補平移（劇本自己管鏡頭）
  assert.deepEqual(kindsOf(buildTurn([events[1]], base([tower, fin]), fakeCtx())), ['wait', 'apply', 'home', 'world', 'focus']);
});

test('estimateTurn returns real seconds: show-time beat lengths divided by ctx.speed', () => {
  const beats = [B.wait(1), B.wait(2)];
  assert.equal(estimateTurn(beats, fakeCtx()), 3); assert.equal(estimateTurn(beats, { ...fakeCtx(), speed: 2 }), 1.5);
  const live = fakeCtx({ nav: navOf(2) }); buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base([tower]), live); assert.equal(live.speed, 1, 'a placement turn plays at ×1');
});
test('estimateTurn adds numeric durs, uses estimate for function durs, and takes the longest child of together', () => {
  const ctx = fakeCtx({ nav: navOf(3) });
  assert.equal(estimateTurn([B.wait(1), B.together([B.wait(2), B.wait(0.5)]), B.walk(walker, { x: 3, z: 0 }), B.apply({ kind: 'settle' })], ctx), 1 + 2 + 3 + 0.15, 'a blinking apply counts one blink');
  assert.equal(estimateTurn([B.apply({ kind: 'settle' }, { blink: false }), { kind: 'x', dur: () => 9 }], ctx), 0, 'function durs without estimate count 0');
});

test('fx scripts are looked up on the cause module and may return null to fall back', () => {
  const calls = [];
  const rat = { id: 'rat', view() {}, script: { fx: (e, s, ctx) => { calls.push(e.cause); return e.flag ? [ctx.B.wait(0.5)] : null; } } };
  const milk = { id: 'milk', view() {}, script: { fx: () => { throw new Error('target module must not be asked'); } } };
  const ctx = fakeCtx();
  const mods = [tower, rat, milk];
  // 有劇本 → 用劇本
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'fx', item: 'rat', cause: 'rat', flag: { name: 'nest', value: true } }], base(mods), ctx)), ['focus', 'wait', 'apply', 'home', 'world', 'focus']);
  // 回 null → 預設：正向 delta 升級、負向 LEVEL DOWN、沒有 delta 不閃白
  const up = buildTurn([{ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 2 } }], base(mods), ctx);
  assert.deepEqual(kindsOf(up), ['focus', 'apply', 'levelUp', 'apply', 'home', 'world', 'focus']); assert.equal(noMarks(up)[2].down, false);
  const down = buildTurn([{ kind: 'fx', item: 'chip', cause: 'rat', delta: { target: 'chip', from: 1, to: 1 } }, { kind: 'after', item: 'chip', cause: 'rat', delta: { target: 'chip', from: 2, to: 1 } }], base(mods), ctx);
  // 不閃白的套用（等級沒變）沒東西演：不平移
  assert.deepEqual(kindsOf(down), ['apply', 'apply', 'focus', 'apply', 'levelUp', 'apply', 'home', 'world', 'focus']); assert.equal(noMarks(down)[4].down, true);
  assert.deepEqual(calls, ['rat', 'rat', 'rat', 'rat']);
  // cause 模組沒有 fx 劇本（或 cause 是 'turn'）→ 預設
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'after', item: 'turn', cause: 'turn', flag: { name: 'blackout', value: true } }], base(mods), ctx)), ['apply', 'apply', 'home', 'world', 'focus']);
});

test('a part knocked askew last turn is righted with a blink at the start of this turn', () => {
  const obj = { position: { x: 1, y: 0, z: 2 }, rotation: { z: 0.25 } }, blinks = [];
  const ctx = fakeCtx(); ctx.stage.tilted = new Set(['boba.main']); ctx.stage.partObject = k => (k === 'boba.main' ? obj : null);
  const beats = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), ctx);
  const [fix] = beats;
  assert.equal(fix.kind, 'apply'); assert.ok(fix.dur > 0); assert.equal(beats[1].kind, 'mark');
  fix.start({ ...ctx, blink: { part: o => blinks.push(o) } });
  assert.deepEqual(blinks, [obj], 'the part itself blinks'); assert.equal(obj.rotation.z, 0, 'righted under the blink'); assert.equal(ctx.stage.tilted.size, 0);
  obj.rotation.z = 0.3; fix.end(ctx); assert.equal(obj.rotation.z, 0, 'end rights it too (skip)');
  assert.equal(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), ctx)[0].kind, 'mark', 'nothing askew → no beat');
  assert.equal(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), fakeCtx())[0].kind, 'mark', 'stages without tilted are fine');
});

// §13.1 鏡頭跟主線
const quietTower = { id: 'tower', view() {}, script: { settle: () => [] } };   // 跟真的 101 一樣：沒跨門檻 0 拍
const focusTargets = beats => noMarks(beats).filter(b => b.kind === 'focus').map(b => b.target);
test('buildTurn inserts a focus before each event, skips repeats on the same cell, waits GAP (0.4 s) between items, and returns home last', () => {
  const ctx = fakeCtx();
  const events = [{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'grow', item: 'milk', from: 1, to: 2 }, { kind: 'grow', item: 'chip', from: 1, to: 2 }, { kind: 'settle' }];
  const beats = buildTurn(events, base([quietTower]), ctx), kinds = kindsOf(beats).filter(k => k !== 'apply');
  assert.deepEqual(kinds, ['focus', 'levelUp', 'wait', 'focus', 'levelUp', 'home', 'world', 'focus']);
  assert.deepEqual(focusTargets(beats), [[-1, 0], [1, 0], 'home']);
  assert.equal(GAP, 0.4); assert.equal(noMarks(beats).find(b => b.kind === 'wait').dur, GAP);
  // 平移在 mark 後面（pace 量到的事件秒數包含平移與空拍）
  const raw = beats.map(b => b.kind), chip = raw.indexOf('wait');
  assert.equal(raw[chip - 1], 'mark'); assert.equal(raw[chip + 1], 'focus');
  // 同一格的不同物品（燈泡、颱風都在中心格）：空 GAP，但不再平移
  const same = buildTurn([{ kind: 'placed', item: 'bulb', to: 1 }, { kind: 'placed', item: 'typhoon', to: 1 }], base([quietTower]), ctx);
  assert.deepEqual(kindsOf(same).filter(k => k !== 'apply'), ['focus', 'wait', 'home', 'world', 'focus']);
  // 101 跨門檻（settle 有拍）：平移到 101 那一格
  const loud = { id: 'tower', view() {}, script: { settle: (e, s, c) => [c.B.levelUp('tower')] } };
  assert.deepEqual(focusTargets(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'settle' }], base([loud]), ctx)), [[-1, 0], [0, 0], 'home']);
});

test('a script whose first beat is a focus is not given a default one', () => {
  const milk = { id: 'milk', view() {}, script: { placed: (e, s, c) => [c.B.focus([0, 1]), c.B.wait(1)] } };
  const beats = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'grow', item: 'milk', from: 1, to: 2 }], base([quietTower, milk]), fakeCtx());
  assert.deepEqual(kindsOf(beats).filter(k => k !== 'apply'), ['focus', 'wait', 'focus', 'levelUp', 'home', 'world', 'focus']);
  // 劇本把鏡頭帶走了：同一個物品的下一個事件重新平移回來（同物品不空拍）
  assert.deepEqual(focusTargets(beats), [[0, 1], [-1, 0], 'home']);
});

// 燈泡 Lv7（任務 7 審稿第 1 輪）：第一拍是 together、裡面有 focus（鏡頭邊飛主角邊走）——也不補平移；together 裡沒有 focus 的照補
test('a script whose first beat is a together holding a focus is not given a default one either', () => {
  const pans = { id: 'milk', view() {}, script: { placed: (e, s, c) => [c.B.together([c.B.focus([0, 1]), c.B.wait(1)])] } };
  const plain = { id: 'chip', view() {}, script: { placed: (e, s, c) => [c.B.together([c.B.wait(1)])] } };
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base([quietTower, pans]), fakeCtx())).filter(k => k !== 'apply'), ['together', 'home', 'world', 'focus']);
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'placed', item: 'chip', to: 1 }], base([quietTower, plain]), fakeCtx())).filter(k => k !== 'apply'), ['focus', 'together', 'home', 'world', 'focus']);
});

test('focus beats set the roster focus cells; the final home focus clears them', () => {
  const set = [], ctx = fakeCtx({ instant: false, rig: { grabbed: false, focus() {}, home() {}, setSkyline() {} } });
  ctx.roster.setFocus = cells => set.push(cells);
  const beats = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'placed', item: 'chip', to: 1 }], base([quietTower]), ctx);
  for (const b of noMarks(beats)) if (b.kind === 'focus') b.start(ctx);
  assert.deepEqual(set, [[[-1, 0]], [[1, 0]], null]);
});

// 審查：有東西演但沒有格子的事件（cause 'turn' 之類）不平移，也不算「換物品」，不多空 GAP
test('an event with no cell neither pans nor counts as a change of item', () => {
  const rat = { id: 'rat', view() {}, script: { fx: (e, s, c) => [c.B.wait(0.5)] } };
  const beats = noMarks(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'after', item: 'turn', cause: 'rat', flag: { name: 'x', value: true } }, { kind: 'grow', item: 'milk', from: 1, to: 2 }], base([quietTower, rat]), fakeCtx()));
  assert.deepEqual(beats.filter(b => b.kind === 'wait').map(b => b.dur), [0.5], 'only the script wait');
  assert.deepEqual(focusTargets(beats), [[-1, 0], 'home']);
});

// 跳級（回到 GROW 設計 §4.2）：同一物品一回合連兩個 grow、第二個 jump: true——合成一段：第一級只有 mark（0 秒），
// 第二級照一般事件演 n 級的劇本、LEVEL UP 彈兩次，它的 apply 一次套兩級的零件
const between = (raw, k) => { const at = raw.flatMap((b, i) => (b.kind === 'mark' ? [i] : [])); return raw.slice(at[k] + 1, at[k + 1] ?? raw.length - 3); };
// 假模組：幫手（Lv2 劇本一拍）、晶片（Lv2／Lv3 劇本各一拍＋LEVEL UP）；grow 事件；一串拍裡每個 mark 的 info（start 一次就知道）
const helperLike = id => ({ id, view() {}, script: { grow: { 2: (e, s, c) => [c.B.wait(1)] } } });
const chipLike = () => ({ id: 'chip', view() {}, script: { grow: { 2: (e, s, c) => [c.B.wait(1), c.B.levelUp('chip')], 3: (e, s, c) => [c.B.wait(1), c.B.levelUp('chip')] } } });
const grow = (item, to, via, extra = {}) => ({ kind: 'grow', item, from: to - 1, to, via, ...extra });
const marksOf = raw => raw.filter(b => b.kind === 'mark').map(b => { let got = null; b.start({ onMark: (e, info) => { got = { e, info }; } }); return got; });
test('a jump: the first grow plays only a mark (0 s), the second plays level n script with LEVEL UP twice and one apply covering both levels', () => {
  const asked = [], prevs = [];
  const chip = { id: 'chip', view() {}, script: { grow: {
    4: (e, s, c) => { asked.push(e.to); return [c.B.wait(1), c.B.levelUp('chip')]; },
    5: (e, s, c) => { asked.push(e.to); prevs.push([s.prev.lv.chip, s.lv.chip, s.prev.lv.milk]); return [c.B.wait(2), c.B.levelUp('chip')]; },
  } } };
  const jump = { kind: 'grow', item: 'chip', from: 4, to: 5, jump: true };
  const events = [{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'grow', item: 'chip', from: 3, to: 4 }, jump, { kind: 'settle' }];
  const raw = buildTurn(events, base([quietTower, chip]), fakeCtx());
  assert.deepEqual(asked, [5], 'only the second level asks its script (level n−1 is not played)');
  // 「這次升級前」跟舞台一致：第一級沒套，s.prev 的晶片是 n−2（別的物品照這回合到這裡的狀態）
  assert.deepEqual(prevs, [[3, 5, 1]], 's.prev of the merged level is n − 2');
  // 第一級：只有 mark（0 秒）——不套、不閃、不平移
  assert.deepEqual(between(raw, 1), [], 'the first level: a mark only');
  assert.deepEqual(marksOf(raw)[1].info, { gap: 0, key: false, skipped: true });
  // 第二級：照一般事件演（換物品空 GAP、平移到晶片格、n 級劇本、補的 apply），LEVEL UP 彈兩次
  const second = between(raw, 2);
  assert.deepEqual(second.map(b => b.kind), ['wait', 'focus', 'wait', 'levelUp', 'apply']);
  assert.equal(second[3].twice, true, 'LEVEL UP pops twice');
  // 整回合的 apply：鮮奶放置 2、跳級 1（第二級那一個一次套兩級）、settle 1——第一級沒有自己的 apply
  assert.equal(raw.filter(b => b.kind === 'apply').length, 4);
  // 中間被別的事件隔開（第一級的 fx、別的物品）也一樣：第一級只有 mark，第二級合成一段
  const apart = buildTurn([{ kind: 'grow', item: 'chip', from: 3, to: 4 }, { kind: 'grow', item: 'milk', from: 1, to: 2 }, jump], base([quietTower, chip]), fakeCtx());
  assert.deepEqual(between(apart, 0), [], 'apart: the first level is a mark only');
  const merged = between(apart, 2);
  assert.deepEqual(merged.map(b => b.kind), ['wait', 'focus', 'wait', 'levelUp', 'apply']); assert.equal(merged[3].twice, true);
  // 同物品中間又長了一級（不是接著的那一級）就不算跳級的第一級
  const notFirst = buildTurn([{ kind: 'grow', item: 'chip', from: 2, to: 3 }, jump], base([quietTower, chip]), fakeCtx());
  assert.notDeepEqual(between(notFirst, 0), [], 'from must match: chip 3 is not the first level of the 4 → 5 jump');
});

// 裁決 R11：◆ 關鍵節點（劇本函數帶 key: true）在正解裡也要看得到——跳級的第二級落在關鍵級就演完整劇本（第一級只有 mark）
const keyChip = () => {
  const asked = [], five = (e, s, c) => { asked.push(e.to); return [c.B.wait(2), { kind: 'fly', dur: 3 }, c.B.walk(walker, { x: 40, y: 0, z: 0 }), c.B.levelUp('chip')]; };
  five.key = true;
  return { asked, mod: { id: 'chip', view() {}, script: { grow: { 4: (e, s, c) => { asked.push(e.to); return [c.B.wait(1), c.B.levelUp('chip')]; }, 5: five } } } };
};
test('R11: the second level of a jump plays its full script when it is a key node', () => {
  const { asked, mod } = keyChip(), jump = { kind: 'grow', item: 'chip', from: 4, to: 5, jump: true };
  const raw = buildTurn([{ kind: 'grow', item: 'chip', from: 3, to: 4 }, jump, { kind: 'settle' }], base([quietTower, mod]), fakeCtx({ nav: navOf(40) }));
  assert.deepEqual(asked, [5], 'only the key level asks its script');
  assert.deepEqual(between(raw, 0), [], 'the first level: a mark only');
  const seg = between(raw, 1);
  assert.deepEqual(seg.map(b => b.kind), ['focus', 'wait', 'fly', 'walk', 'levelUp', 'apply'], 'the key script after the pan to the chip cell');
  assert.equal(seg[4].twice, true, 'the key script\'s LEVEL UP pops twice too');
  assert.equal(marksOf(raw)[1].info.key, true);
});
// 協調者裁決（2026-10-29）：跳級合成時演 {n−1, n} 裡最高的 ◆——n 不是 ◆、n−1 是 ◆ 就演 n−1 的 ◆ 劇本（燈泡 Lv7 風車島不能從正解裡消失），
// mark 標 key；n 是 ◆ 就照演 n（n−1 是不是 ◆ 都一樣）
test('a merged jump plays the highest key level among n−1 and n: n−1 key, n plain → the n−1 key script; n key → n', () => {
  const make = keys => {
    const asked = [], fn = n => { const f = (e, s, c) => { asked.push(n); return [c.B.wait(2), c.B.levelUp('chip')]; }; f.key = keys.includes(n); return f; };
    return { asked, mod: { id: 'chip', view() {}, script: { grow: { 3: fn(3), 4: fn(4) } } } };
  };
  const events = [grow('chip', 3, []), grow('chip', 4, [], { jump: true })];
  const low = make([3]), raw = buildTurn(events, base([quietTower, low.mod]), fakeCtx());
  assert.deepEqual(low.asked, [3], 'n−1 is the key level: its script plays with the merged event');
  assert.deepEqual(between(raw, 0), []);
  const seg = between(raw, 1);
  assert.deepEqual(seg.map(b => b.kind), ['focus', 'wait', 'levelUp', 'apply']); assert.equal(seg[2].twice, true);
  assert.equal(marksOf(raw)[1].info.key, true, 'the merged event counts as a key event');
  // n 是 ◆、n−1 不是：演 n（兩級都是 ◆ 就不合成，見下一個測試）
  const hi = make([4]), rh = buildTurn(events, base([quietTower, hi.mod]), fakeCtx());
  assert.deepEqual(hi.asked, [4], 'n is the key level → n'); assert.equal(marksOf(rh)[1].info.key, true);
  const none = make([]), r0 = buildTurn(events, base([quietTower, none.mod]), fakeCtx());
  assert.deepEqual(none.asked, [4], 'no key level → n'); assert.equal(marksOf(r0)[1].info.key, false);
});
// Task 6a 修正輪裁決：n−1 和 n 都是 ◆ 就不合成（外星晶片 8 → 9：矽盾測試不能被 Lv9 待命吃掉）——兩個 grow 照一般事件接著演，
// 各演自己的 ◆ 劇本、各一個（不是彈兩次的）LEVEL UP、各自一個 apply（起因提示 2026-10-31 拿掉了，R22）
test('a jump between two key levels is not merged: both levels play their own key script with a single LEVEL UP', () => {
  const asked = [], fn = n => { const f = (e, s, c) => { asked.push(n); return [c.B.wait(2), c.B.levelUp('chip')]; }; f.key = true; return f; };
  const mod = { id: 'chip', view() {}, script: { grow: { 8: fn(8), 9: fn(9) } } };
  const raw = buildTurn([grow('chip', 8, ['milk']), grow('chip', 9, ['milk'], { jump: true })], { ...base([quietTower, helperLike('milk'), mod]), lv: { ...zero, chip: 7 } }, fakeCtx());
  assert.deepEqual(asked, [8, 9], 'both key scripts are asked');
  const marks = marksOf(raw);
  assert.deepEqual(marks.map(m => [m.e.to, m.info.key, !!m.info.skipped]), [[8, true, false], [9, true, false]]);
  const first = between(raw, 0), second = between(raw, 1);
  assert.deepEqual(kindsOf(first), ['focus', 'wait', 'levelUp', 'apply'], 'pan to the chip cell, then the first key script'); assert.equal(first[2].twice, false, 'a single LEVEL UP');
  assert.deepEqual(kindsOf(second), ['wait', 'levelUp', 'apply'], 'no pan (same cell) before the second'); assert.equal(second[1].twice, false);
  // 只有一級是 ◆ 的照舊合成（上一個測試）
});
// 選擇帶動升級裁決 R6：代幣 Lv4 也標 ◆（2 → 4 一定跳級，環狀線是主線）
test('R11: key nodes are flagged on token Lv4 (R6)/Lv7/Lv10 and milk Lv7/Lv10 only; token Lv10 flies the speeders in', async () => {
  const token = await import('../src/actors/token.js'), milkMod = await import('../src/actors/milk.js');
  for (const [mod, keys] of [[token, [4, 7, 10]], [milkMod, [7, 10]]]) assert.deepEqual(Object.entries(mod.script.grow).filter(([, f]) => f.key).map(([n]) => +n), keys, mod.id);
  const ctx = fakeCtx({ roster: { members: () => [], nearest: () => null, keys: () => [] } });
  const beats = buildTurn([{ kind: 'grow', item: 'token', from: 9, to: 10 }], { ...base([quietTower, token]), lv: { ...zero, token: 9 } }, ctx);
  assert.ok(beats.some(b => b.kind === 'fly'), 'the speeders fly in');
});

// ── 拜訪拿掉了（2026-10-29 回到 GROW 設計 §4.2）──
// 有原因的升級（grow 的 via 非空）不再先演一段幫手走來敲門：建串時不插 mark { visit }、也沒有走路、閃白的拍
test('a grow with via plays no visit: no mark {visit}, nobody walks before the script', () => {
  const raw = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, grow('chip', 2, ['milk'])], base([quietTower, helperLike('milk'), chipLike()]), fakeCtx());
  assert.ok(marksOf(raw).every(m => !m.info.visit));
  assert.ok(!raw.some(b => b.kind === 'walk' || b.kind === 'fade'));
  // 被升級的這一級有拜訪點（以前插拜訪段的條件）也一樣：沒有拜訪
  const spotted = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, grow('chip', 2, ['milk'])], base([quietTower, helperLike('milk'), { ...chipLike(), visitSpot: () => ({ x: 0, y: 0.65, z: 0, r: 0.8 }) }]), fakeCtx());
  assert.ok(marksOf(spotted).every(m => !m.info.visit), 'a level with a visit spot gets no visit either');
  assert.ok(!spotted.some(b => b.kind === 'walk' || b.kind === 'fade' || (b.kind === 'together' && b.beats.some(x => x.kind === 'walk' || x.kind === 'fade'))));
});

// 唯一正解修正輪 1：颱風放下不再讓同一回合後面的事件只演 [apply, LEVEL UP]——躲雨是放下劇本裡的一小段（躲一下又走出來），
// 後面的升級照一般事件演（劇本、跳級合成；起因提示 2026-10-31 拿掉了，R22）；放下本身是 ◆（§5.3 颱風 1：mark 標 key，pace 算 ◆ 個數）
const placedLike = () => { const placed = (e, s, c) => [c.B.wait(1), c.B.focus('home')]; placed.key = true; return { id: 'typhoon', view() {}, script: { placed } }; };
test('after the typhoon placed event the rest of the turn plays normally (scripts, merged jump); the placed event is a key event', () => {
  const after = buildTurn([{ kind: 'placed', item: 'typhoon', to: 1 }, grow('chip', 2, ['milk']), grow('chip', 3, ['milk'], { jump: true })], base([quietTower, helperLike('milk'), placedLike(), chipLike()]), fakeCtx());
  const without = buildTurn([grow('chip', 2, ['milk']), grow('chip', 3, ['milk'], { jump: true })], base([quietTower, helperLike('milk'), chipLike()]), fakeCtx());
  assert.equal(marksOf(after)[0].info.key, true, 'the typhoon placed event is a key event');
  assert.deepEqual(between(after, 1), [], 'the first level of the jump is a mark only');
  assert.deepEqual(kindsOf(between(after, 2)).filter(k => k !== 'wait' && k !== 'focus'), kindsOf(between(without, 1)).filter(k => k !== 'wait' && k !== 'focus'), 'the merged level plays the same script as without the typhoon');
  assert.ok(between(after, 2).filter(b => b.kind === 'levelUp').every(b => b.twice));
});
// LEVEL DOWN（knock-back）不會被換成彈兩次；together 裡的 LEVEL UP 也換
test('a jump wraps every LEVEL UP of its script, inside together too, but never a LEVEL DOWN', () => {
  const mod = { ...chipLike(), script: { grow: { 3: (e, s, c) => [c.B.together([c.B.wait(1), c.B.levelUp('chip')]), c.B.levelUp('chip', { down: true })] } } };
  const raw = buildTurn([grow('chip', 2, []), grow('chip', 3, [], { jump: true })], base([quietTower, mod]), fakeCtx());
  const seg = between(raw, 1), inner = seg.find(b => b.kind === 'together').beats.find(b => b.kind === 'levelUp'), down = seg.find(b => b.kind === 'levelUp');
  assert.equal(inner.twice, true); assert.equal(down.down, true); assert.equal(down.twice, false);
  // 列車進站拍的 during 裡也換（燈泡 Lv7：LEVEL UP 在列車停靠的 during 裡）
  const stop = { ...chipLike(), script: { grow: { 3: (e, s, c) => [c.B.trainStop({ during: [c.B.wait(0.5), c.B.together([c.B.levelUp('chip')])] })] } } };
  const t = between(buildTurn([grow('chip', 2, []), grow('chip', 3, [], { jump: true })], base([quietTower, stop]), fakeCtx()), 1).find(b => b.kind === 'trainStop');
  assert.equal(t.during[1].beats[0].twice, true, 'inside trainStop.during');
});

// 撲空拿掉了（唯一正解設計 R10，使用者 2026-10-31：走過去低頭嘆氣看不出意義）：wait 事件只剩 mark＋不閃白的 apply——
// 不平移、不走路、不嘆氣、沒有泡泡（舊的等待圖框也早拿掉了）
const anyBubble = beats => beats.some(b => b.kind === 'bubble' || (b.kind === 'together' && anyBubble(b.beats)));
test('a wait event plays only its mark and an apply without a blink: no pan, no walk, no gesture, no bubble', () => {
  const mods = ['milk', 'chip', 'bulb', 'token', 'boba'].map(id => ({ id, view() {}, visitSpot: () => null, script: {} }));
  const e = { kind: 'wait', item: 'chip', waits: ['chip', 'bulb', 'token'].map(item => ({ item, for: ['baseball', 'milk'] })) };
  const raw = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, e], base([tower, ...mods]), fakeCtx());
  const seg = between(raw, 1);
  // 劇本只有不閃白的 apply；後面是每個事件都補的 apply（劇本沒套到的零件閃白補上，沒剩就 0 秒）
  assert.deepEqual(seg.map(b => [b.kind, b.blink]), [['apply', false], ['apply', true]]);
  assert.deepEqual(marksOf(raw).map(m => m.e.kind), ['placed', 'wait']);
  assert.ok(marksOf(raw).every(m => !m.info.miss));
  assert.equal(anyBubble(raw), false, 'no bubble beat for a wait');
});
// 鎖住的反應（引擎 fx 事件帶 lock：大停電鎖燈泡、捷運站淹水鎖代幣、大巨蛋淹水鎖棒球）要讓玩家看到（協調者裁決 2026-10-31）：
// 平移到被鎖的那一格 → 閃白套用 → 等那個物品的名冊走到新站位（arriving 都清掉，上限 LOCK_HOLD 秒）；不冒字（鎖不是升降級，標題卡會講災難）。
// 帶 delta 的（大停電：鮮奶 −1）照舊在鮮奶格演 LEVEL DOWN（鮮奶真的降級），等待插在字之前。其他只有旗標的 fx 照舊 0 秒
test('a lock fx pans to the locked item, applies with a blink and holds until its roster has arrived (≤ LOCK_HOLD), with no label; other flag fx stay instant', () => {
  const { LOCK_HOLD } = turnModule;
  assert.equal(LOCK_HOLD, 2.0);
  const flood = { kind: 'fx', item: 'typhoon', cause: 'typhoon', lock: 'baseball', flag: { name: 'domeFlood', value: true } };
  const raw = buildTurn([flood], base([tower]), fakeCtx()), seg = between(raw, 0);
  assert.deepEqual(seg.map(b => b.kind), ['focus', 'apply', 'hold', 'apply']);
  assert.deepEqual(seg[0].target, cellOf('baseball'), 'pans to the locked item');
  assert.notEqual(seg[1].blink, false, 'the swap blinks');
  assert.equal(seg[2].dur, LOCK_HOLD);
  const players = [{ key: 'baseball.players', mode: 'home', arriving: true }, { key: 'baseball.players', mode: 'home', arriving: false }];
  const other = [{ key: 'milk.kids', mode: 'home', arriving: true }];
  const c = fakeCtx({ roster: { keys: () => ['baseball.players', 'milk.kids'], members: k => (k === 'milk.kids' ? other : players) } });
  assert.equal(seg[2].done(c), false, 'a player still climbing');
  players[0].arriving = false; assert.equal(seg[2].done(c), true, 'everyone of the locked item arrived (other rosters do not count)');
  assert.ok(!raw.some(b => b.kind === 'levelUp'), 'no label');
  // 大停電（lock + delta）：鮮奶格 LEVEL DOWN 照舊，等待在字之前
  const blackout = { kind: 'fx', item: 'milk', cause: 'typhoon', lock: 'bulb', flag: { name: 'blackout', value: true }, delta: { target: 'milk', from: 3, to: 2 } };
  const b2 = between(buildTurn([blackout], base([tower]), fakeCtx()), 0);
  assert.deepEqual(b2.map(b => b.kind), ['focus', 'apply', 'hold', 'levelUp', 'apply']);
  assert.deepEqual(b2[0].target, cellOf('milk')); assert.equal(b2[3].down, true);
  // 不帶 lock 的旗標 fx（鼠災）：0 秒、不平移
  const rats = { kind: 'fx', item: 'typhoon', cause: 'typhoon', flag: { name: 'domeRats', value: true } };
  assert.deepEqual(between(buildTurn([rats], base([tower]), fakeCtx()), 0).map(b => [b.kind, b.blink]), [['apply', false], ['apply', true]]);
});
// 第一批審稿 Minor（修正批次 2）：大停電時鮮奶還是 Lv1（delta 1 → 1，沒真的掉級、沒有 LEVEL DOWN）——鏡頭照鎖住的反應平移到被鎖的燈泡那格
test('a blackout that cannot lower milk (Lv1, delta 1 → 1) pans to the locked bulb like any lock fx, with no LEVEL DOWN', () => {
  const blackout = { kind: 'fx', item: 'milk', cause: 'typhoon', lock: 'bulb', flag: { name: 'blackout', value: true }, delta: { target: 'milk', from: 1, to: 1 } };
  const seg = between(buildTurn([blackout], base([tower]), fakeCtx()), 0);
  assert.deepEqual(seg.map(b => b.kind), ['focus', 'apply', 'hold', 'apply']);
  assert.deepEqual(seg[0].target, cellOf('bulb'), 'pans to the locked bulb, not the milk cell');
});
