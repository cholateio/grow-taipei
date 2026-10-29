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
const base = (modules = [tower]) => ({ modules, spec, lv: { ...zero, chip: 1 }, flags: {}, meta: { total: 1, landing: false } });
// 每個事件劇本前的 mark 拍（0 秒，給 pace 工具量每個事件的秒數）不算在拍型清單裡
const noMarks = beats => beats.filter(b => b.kind !== 'mark');
const kindsOf = beats => noMarks(beats).map(b => b.kind);
// 走路拍的長度用 nav 估：假成員 + 假 nav，每段路長 len
const walker = { pos: { x: 0, y: 0, z: 0 }, speed: 1, head: () => ({ x: 0, y: 1, z: 0 }) };
const navOf = len => ({ route: () => [{ x: 0, z: 0 }, { x: len, z: 0 }], routeLength: () => len });

test('default scripts: placed → apply; grow → apply + levelUp; knock-back → LEVEL DOWN; a wait without an item rep plays nothing', () => {
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
  // 每個有東西演的事件前面平移過去（不同物品之間空 GAP 0.4 s，裁決 R15）；等待事件不平移（撲空段自己平移，這裡燈泡沒有模組、沒有代表 → 沒有撲空）；回合最後回全景
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

// 物品 v2 跳級（§3、§6）：同一物品一回合連兩個 grow、第二個 jump: true——第二個 LEVEL UP 緊接著出，不重走路、不平移、不空拍、不查劇本
const between = (raw, k) => { const at = raw.flatMap((b, i) => (b.kind === 'mark' ? [i] : [])); return raw.slice(at[k] + 1, at[k + 1] ?? raw.length - 3); };
// 假模組：幫手（有代表、Lv2 劇本一拍）、晶片（沒有代表、Lv2／Lv3 劇本各一拍＋LEVEL UP）；grow 事件；一串拍裡每個 mark 的 info（start 一次就知道）
const helperLike = id => ({ id, view() {}, script: { rep: () => walker, grow: { 2: (e, s, c) => [c.B.wait(1)] } } });
const chipLike = () => ({ id: 'chip', view() {}, script: { rep: () => null, grow: { 2: (e, s, c) => [c.B.wait(1), c.B.levelUp('chip')], 3: (e, s, c) => [c.B.wait(1), c.B.levelUp('chip')] } } });
const grow = (item, to, via, extra = {}) => ({ kind: 'grow', item, from: to - 1, to, via, ...extra });
const marksOf = raw => raw.filter(b => b.kind === 'mark').map(b => { let got = null; b.start({ onMark: (e, info) => { got = { e, info }; } }); return got; });
test('two consecutive grow events of one item in a turn: the second plays only apply + LEVEL UP, no focus, no gap (review focus 2)', () => {
  const asked = [];
  const chip = { id: 'chip', view() {}, script: { grow: {
    4: (e, s, c) => { asked.push(e.to); return [c.B.wait(1), c.B.levelUp('chip')]; },
    5: (e, s, c) => { asked.push(e.to); return [c.B.wait(2), c.B.levelUp('chip')]; },
  } } };
  const jump = { kind: 'grow', item: 'chip', from: 4, to: 5, jump: true };
  const events = [{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'grow', item: 'chip', from: 3, to: 4 }, jump, { kind: 'settle' }];
  const raw = buildTurn(events, base([quietTower, chip]), fakeCtx());
  assert.deepEqual(asked, [4], 'the second level of a jump asks no script');
  // 第一級照常：換物品空 GAP、平移到晶片格、劇本、補的 apply
  assert.deepEqual(between(raw, 1).map(b => b.kind), ['wait', 'focus', 'wait', 'levelUp', 'apply']);
  // 第二級：只有 apply + LEVEL UP（+ 每個事件補的 apply）
  const second = between(raw, 2);
  assert.deepEqual(second.map(b => b.kind), ['apply', 'levelUp', 'apply']);
  assert.notEqual(second[0].blink, false, 'the jump level blinks its parts');
  // 只看 e.jump：中間被別的事件隔開（第一級的 fx 插進來）也一樣只演 apply + LEVEL UP
  const apart = buildTurn([{ kind: 'grow', item: 'chip', from: 3, to: 4 }, { kind: 'grow', item: 'milk', from: 1, to: 2 }, jump], base([quietTower, chip]), fakeCtx());
  assert.deepEqual(between(apart, 2).map(b => b.kind), ['apply', 'levelUp', 'apply']);
});

// 裁決 R11：◆ 關鍵節點（劇本函數帶 key: true）在正解裡也要看得到——跳級的第二級落在關鍵級就演完整劇本（第一級照常演自己的），
const keyChip = () => {
  const asked = [], five = (e, s, c) => { asked.push(e.to); return [c.B.wait(2), { kind: 'fly', dur: 3 }, c.B.walk(walker, { x: 40, y: 0, z: 0 }), c.B.levelUp('chip')]; };
  five.key = true;
  return { asked, mod: { id: 'chip', view() {}, script: { grow: { 4: (e, s, c) => { asked.push(e.to); return [c.B.wait(1), c.B.levelUp('chip')]; }, 5: five } } } };
};
test('R11: the second level of a jump plays its full script when it is a key node', () => {
  const { asked, mod } = keyChip(), jump = { kind: 'grow', item: 'chip', from: 4, to: 5, jump: true };
  const raw = buildTurn([{ kind: 'grow', item: 'chip', from: 3, to: 4 }, jump, { kind: 'settle' }], base([quietTower, mod]), fakeCtx({ nav: navOf(40) }));
  assert.deepEqual(asked, [4, 5], 'both levels ask their scripts');
  assert.deepEqual(between(raw, 1).map(b => b.kind), ['wait', 'fly', 'walk', 'levelUp', 'apply'], 'the key script, no extra focus on the same cell');
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

// 撲空（計畫 6 設計 §5，show/visit.js 的 miss）：wait 事件的前 MISS_PER_TURN 個 waits（照 ORDER）各一段——mark { miss, item }、（換物品空 GAP）、
// together(平移到代表那一格, 走過去)、失望 sigh、回日常；沒有泡泡、沒有圖框（舊的等待圖框拿掉）
const { MISS_PER_TURN, SIGH, MISS_WALK, MISS_CAP } = await import('../src/show/visit.js');
// 一串拍（together 裡也算）有沒有泡泡拍
const anyBubble = beats => beats.some(b => b.kind === 'bubble' || (b.kind === 'together' && anyBubble(b.beats)));
const waitOf = (...items) => ({ kind: 'wait', item: items[0], waits: items.map(item => ({ item, for: ['baseball', 'milk'] })) });
const repMods = (rep = () => walker) => ['chip', 'bulb', 'token', 'boba'].map(id => ({ id, view() {}, visitSpot: () => null, script: { rep } }));
test('wait event → up to MISS_PER_TURN miss segments in ORDER; no icon bubble anywhere', () => {
  assert.equal(MISS_PER_TURN, 2); assert.equal(SIGH, 1.0); assert.equal(MISS_CAP, 3);
  assert.ok(MISS_WALK + SIGH <= MISS_CAP, 'the walk cap leaves room for the sigh');
  const e = waitOf('chip', 'bulb', 'token');
  const raw = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, e], base([tower, ...repMods()]), fakeCtx());
  const marks = marksOf(raw);
  // 前兩個 waits 各一段撲空（照 ORDER：引擎的 waits 本來就照 ORDER 排），第三個不演；之後 wait 事件自己照舊一個 mark
  assert.deepEqual(marks.map(m => [m.e.kind, !!m.info.miss, m.info.item ?? null]), [['placed', false, null], ['wait', true, 'chip'], ['wait', true, 'bulb'], ['wait', false, null], ['settle', false, null]].slice(0, marks.length));
  assert.equal(marks.filter(m => m.info.miss).length, 2);
  assert.ok(Math.abs(marks[1].info.gap - GAP) < 1e-9 && Math.abs(marks[2].info.gap - GAP) < 1e-9, 'a new item: GAP before each miss');
  // 一段撲空：空拍（代表叫不到就跳過）、together(平移到代表那一格, 走過去)、失望 1.0 s、回日常
  const seg = between(raw, 1);
  assert.deepEqual(seg.map(b => b.kind), ['wait', 'together', 'gesture', 'home']);
  assert.equal(seg[0].dur, GAP);
  assert.deepEqual(seg[1].beats.map(b => b.kind), ['focus', 'walk']); assert.equal(typeof seg[1].beats[0].target, 'function', 'the pan target is the rep, found at beat time');
  assert.equal(seg[2].dur, SIGH);
  // wait 事件自己：只剩不閃白的套用（沒有泡泡、沒有平移）
  assert.deepEqual(between(raw, 3).map(b => [b.kind, b.blink]), [['apply', false], ['apply', true]], 'its own silent apply and the trailing apply');
  // 整回合沒有任何泡泡拍（等待圖框拿掉）
  assert.equal(anyBubble(raw), false, 'no bubble beat for a wait');
  // 等待物品沒有代表劇本（颱風、這裡的 milk 沒有模組）→ 那一項不插、照 ORDER 往後補（最終審稿 3：兩個位子留給叫得到人的）
  const some = buildTurn([waitOf('milk', 'chip', 'bulb')], base([tower, ...repMods()]), fakeCtx());
  assert.deepEqual(marksOf(some).filter(m => m.info.miss).map(m => m.info.item), ['chip', 'bulb']);
  // 颱風登陸之後（大家躲在屋裡）不演撲空
  const typhoon = { id: 'typhoon', view() {}, script: { rep: () => null } };
  const landed = buildTurn([{ kind: 'grow', item: 'typhoon', from: 1, to: 2 }, waitOf('chip', 'bulb')], base([tower, typhoon, ...repMods()]), fakeCtx());
  assert.ok(marksOf(landed).every(m => !m.info.miss), 'no misses after the landing');
  assert.equal(anyBubble(landed), false);
});

// 最終審稿 3：撲空的兩個位子在建串時就只給「這一級叫得到代表」的物品（各模組的 script.hasRep(lv)：鮮奶 Lv3 起才有小孩、代幣 Lv2 起才有站務員、
// 燈泡的電工 Lv7 起住在風車島上、颱風永遠沒有）——原本前兩個 waits 先佔位，鮮奶 < 棒球（Lv2 沒有小孩）吃掉一個位子演 0 秒，
// 叫得到人的燈泡 < 晶片反而被丟掉（EXAMPLE.deflect 第 7 回合五個 waits 只看到一次嘆氣）
test('miss slots go to the first MISS_PER_TURN waits whose item has a rep at its level (script.hasRep), in ORDER', async () => {
  const mods = ['milk', 'bulb', 'token', 'rat', 'boba'].map(id => ({ id, view() {}, visitSpot: () => null, script: { rep: () => walker, hasRep: { milk: lv => lv >= 3, token: lv => lv >= 2 }[id] ?? (() => true) } }));
  const lv = { ...zero, milk: 2, bulb: 3, token: 1, rat: 1, boba: 2, chip: 1 };
  const raw = buildTurn([waitOf('milk', 'bulb', 'token', 'rat', 'boba')], { ...base([tower, ...mods]), lv }, fakeCtx());
  assert.deepEqual(marksOf(raw).filter(m => m.info.miss).map(m => m.info.item), ['bulb', 'rat'], 'milk Lv2 and token Lv1 have nobody to send: the next two with reps play');
  // 等級夠了就排得上：鮮奶 Lv3 → 鮮奶、燈泡
  const up = buildTurn([waitOf('milk', 'bulb', 'token', 'rat', 'boba')], { ...base([tower, ...mods]), lv: { ...lv, milk: 3 } }, fakeCtx());
  assert.deepEqual(marksOf(up).filter(m => m.info.miss).map(m => m.info.item), ['milk', 'bulb']);
  // 真的模組：hasRep 照各自的名冊
  const real = Object.fromEntries(await Promise.all(spec.ORDER.map(async id => [id, (await import(`../src/actors/${id}.js`)).script.hasRep])));
  assert.deepEqual([real.milk(2), real.milk(3), real.token(1), real.token(2), real.typhoon(1), real.typhoon(5), real.bulb(6), real.bulb(7)], [false, true, false, true, false, false, true, false]);
  for (const id of ['chip', 'rat', 'boba', 'baseball']) assert.equal(real[id](1), true, `${id} Lv1 has a rep`);
});

// 審查重點 4（回到 GROW 計畫 8）：等待只剩阻擋——鮮奶 Lv2 等棒球時還沒有小孩（hasRep(2) 假），那一項不佔撲空的位子、照 ORDER 往後補
test('milk at Lv2 waiting for baseball has no rep (hasRep(2) false): its wait takes no miss slot, the next wait in ORDER plays', async () => {
  const milkMod = await import('../src/actors/milk.js');
  assert.equal(milkMod.script.hasRep(2), false); assert.equal(milkMod.script.hasRep(3), true);
  const raw = buildTurn([{ kind: 'wait', item: 'milk', waits: [{ item: 'milk', for: ['baseball'] }, { item: 'chip', for: ['milk'] }] }], { ...base([quietTower, milkMod, ...repMods()]), lv: { ...zero, milk: 2, chip: 2 } }, fakeCtx());
  assert.deepEqual(marksOf(raw).filter(m => m.info.miss).map(m => m.info.item), ['chip']);
});

test('miss beats: the rep is found once at beat time; nobody (hidden, busy, walking out) → every beat skipped, the GAP too', () => {
  const nav = { route: (a, b) => [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], routeLength: r => Math.hypot(r[1].x - r[0].x, r[1].z - r[0].z), nearestWalkable: p => ({ ...p }), walkable: () => true, inFootprint: () => false, groundY: () => 0, version: 0 };
  const claimed = [], homed = [], roster = { claim: m => claimed.push(m), home: m => homed.push(m), setPose() {}, setFocus() {}, members: () => [], keys: () => [] };
  for (const mode of ['script', 'exit']) {   // 劇本手上、正走出去（退場）的人都不是日常
    const busy = { ...walker, mode }, raw = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, waitOf('chip')], base([tower, ...repMods(() => busy)]), fakeCtx());
    const seg = between(raw, 1), c = fakeCtx({ roster, nav, rig: { grabbed: false, focus: () => true } });
    assert.equal(seg[0].start(c), false, `${mode}: the GAP is skipped`);
    assert.equal(seg[1].beats[0].start(c), false, `${mode}: no pan`); assert.equal(seg[1].beats[1].start(c), false, `${mode}: no walk`);
    assert.equal(seg[2].start(c), false, `${mode}: no sigh`);
  }
  assert.deepEqual(claimed, [], 'a busy rep is never taken'); assert.deepEqual(homed, []);
  // 叫得到：空拍那拍就定案、拿到劇本手上；平移對著他那一格；回日常
  let asked = 0;
  const rep = { ...walker, mode: 'home', pos: { x: 0, y: 0.65, z: 0 } };
  const raw = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, waitOf('chip')], base([tower, ...repMods(() => { asked++; return rep; })]), fakeCtx());
  const seg = between(raw, 1), cells = [], c = fakeCtx({ roster: { ...roster, setFocus: x => cells.push(x) }, nav, rig: { grabbed: false, focus: () => true } });
  assert.notEqual(seg[0].start(c), false); assert.deepEqual(claimed, [rep]);
  seg[1].beats[0].start(c); assert.deepEqual(cells, [[[0, 0]]], 'the pan goes to the rep\'s cell');
  seg[3].start(c); assert.deepEqual(homed, [rep]);
  assert.equal(asked, 1, 'the rep is asked once');
});
// 一回合兩段撲空、一段演了一段沒演（兩種順序）：沒演的那段整段 0 秒（連空拍）；之後的空拍看「真的演了的上一段」是哪個物品；
// 有一段演了，鏡頭就在代表那一格——下一個事件照樣空拍、平移回來
test('two misses in a turn, one played and one collapsed (both orders): the collapsed one waits nothing, the next event still pans back', () => {
  const nav = { route: (a, b) => [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], routeLength: r => Math.hypot(r[1].x - r[0].x, r[1].z - r[0].z), nearestWalkable: p => ({ ...p }), walkable: () => true, inFootprint: () => false, groundY: () => 0, version: 0 };
  const milk = { id: 'milk', view() {}, script: { placed: (e, s, c) => [c.B.wait(1)], grow: { 2: (e, s, c) => [c.B.wait(1)] } } };
  const events = [{ kind: 'placed', item: 'milk', to: 1 }, waitOf('chip', 'bulb'), grow('milk', 2, [])];
  for (const playing of ['chip', 'bulb']) {
    const reps = Object.fromEntries(['chip', 'bulb'].map(id => [id, { ...walker, mode: id === playing ? 'home' : 'script', pos: { x: 0, y: 0.65, z: 0 } }]));
    const mods = ['chip', 'bulb'].map(id => ({ id, view() {}, visitSpot: () => null, script: { rep: () => reps[id] } }));
    const raw = buildTurn(events, base([tower, milk, ...mods]), fakeCtx());
    const c = fakeCtx({ roster: { claim() {}, home() {}, setPose() {}, setFocus() {}, members: () => [], keys: () => [] }, nav, rig: { grabbed: false, focus: () => true } });
    const marks = raw.filter(b => b.kind === 'mark').map(b => { let got = null; b.start({ onMark: (e, info) => { got = info; } }); return got; });
    assert.deepEqual(marks.slice(1, 3).map(m => m.item), ['chip', 'bulb']);
    const seg = k => between(raw, k), gapOf = k => seg(k).find(b => b.kind === 'wait');
    // 第一段（晶片）：演了才等空拍
    assert.equal(gapOf(1).start(c) !== false, playing === 'chip', `${playing}: chip GAP`);
    for (const b of seg(1).slice(1)) b.start?.(c);
    // 第二段（燈泡）：演了的話，上一個演了的是晶片（或撲空之前的鮮奶），都不是燈泡 → 空拍；沒演 → 0 秒
    assert.equal(gapOf(2).start(c) !== false, playing === 'bulb', `${playing}: bulb GAP`);
    for (const b of seg(2).slice(1)) b.start?.(c);
    assert.deepEqual([marks[1].gap, marks[2].gap], playing === 'chip' ? [GAP, 0] : [0, GAP], `${playing}: the marks report what was waited`);
    // 下一個事件（鮮奶 2）：有一段撲空演了，鏡頭在代表那一格 → 空拍、平移回鮮奶格
    const [gap, pan] = seg(4);
    assert.deepEqual([gap.kind, pan.kind], ['wait', 'focus']);
    assert.notEqual(gap.start(c), false, `${playing}: GAP before the next item`); assert.notEqual(pan.start(c), false, `${playing}: pan back`);
    assert.equal(marks[4].gap, GAP);
  }
});
// 撲空沒演（代表叫不到，整段 0 秒）就不動鏡頭的帳（審稿）：下一個事件照撲空之前的帳——同一個物品不空拍、鏡頭本來就在那一格不再平移；
// 撲空真的演了：鏡頭在代表那一格，下一個事件空一拍、平移回來
test('a collapsed miss leaves the camera bookkeeping alone: the next event of the same item gets no GAP and no pan; a played miss does', () => {
  const nav = { route: (a, b) => [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], routeLength: r => Math.hypot(r[1].x - r[0].x, r[1].z - r[0].z), nearestWalkable: p => ({ ...p }), walkable: () => true, inFootprint: () => false, groundY: () => 0, version: 0 };
  const milk = { id: 'milk', view() {}, script: { placed: (e, s, c) => [c.B.wait(1)], grow: { 2: (e, s, c) => [c.B.wait(1)] } } };
  const events = [{ kind: 'placed', item: 'milk', to: 1 }, waitOf('chip'), grow('milk', 2, [])];
  for (const [mode, played] of [['script', false], ['home', true]]) {
    const rep = { ...walker, mode, pos: { x: 0, y: 0.65, z: 0 } }, focused = [];
    const raw = buildTurn(events, base([tower, milk, ...repMods(() => rep)]), fakeCtx());
    const c = fakeCtx({ roster: { claim() {}, home() {}, setPose() {}, setFocus: x => focused.push(x), members: () => [], keys: () => [] }, nav, rig: { grabbed: false, focus: () => true } });
    const marks = raw.filter(b => b.kind === 'mark').map(b => { let got = null; b.start({ onMark: (e, info) => { got = info; } }); return got; });
    const g = between(raw, 3), [gap, pan] = g;
    assert.deepEqual([gap.kind, pan.kind], ['wait', 'focus'], `${mode}: the GAP and the pan are there to decide at beat time`);
    for (const b of between(raw, 1)) b.start?.(c);   // 撲空段演到（定案代表）
    assert.equal(gap.start(c) !== false, played, `${mode}: GAP ${played ? 'kept' : 'skipped'}`);
    assert.equal(pan.start(c) !== false, played, `${mode}: pan ${played ? 'kept' : 'skipped'}`);
    assert.equal(marks[3].gap, played ? GAP : 0, `${mode}: the mark reports the GAP actually waited`);
  }
});
