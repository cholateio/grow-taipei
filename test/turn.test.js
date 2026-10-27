// test/turn.test.js：事件 → 劇本 → 拍（預設劇本、模組劇本、蒙太奇、fx 掛在 cause 上）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { installFakeDom } from './helpers/fakedom.js';
installFakeDom();
const { buildTurn, estimateTurn, MONTAGE_CAP, MONTAGE_KEEP, MONTAGE_SPEED, GAP, RUSH_BUILD, RUSH_WALK } = await import('../src/show/turn.js');
const { cellAt } = await import('../src/scene/hex.js');
const { B } = await import('../src/show/beats.js');
const { cellOf, anchorWorld, frontOf } = await import('../src/actors/anchors.js');
const finale = await import('../src/actors/finale.js');
const { countdownEvent, finaleEvents } = await import('../src/game.js');

const zero = Object.fromEntries(spec.ORDER.map(id => [id, 0]));
const fakeCtx = (extra = {}) => ({
  stage: { headOf: () => ({ x: 0, y: 1, z: 0 }), lv: {}, flags: {}, meta: {} },
  roster: { nearest: () => null, keys: () => [], members: () => [] },
  B, ...extra,
});
const tower = { id: 'tower', view() {} };
const base = (modules = [tower]) => ({ modules, spec, lv: { ...zero, chip: 1 }, flags: {}, meta: { total: 1, landing: false }, montage: false });
// 每個事件劇本前的 mark 拍（0 秒，給 pace 工具量每個事件的秒數）不算在拍型清單裡
const noMarks = beats => beats.filter(b => b.kind !== 'mark');
const kindsOf = beats => noMarks(beats).map(b => b.kind);
// 走路拍的長度用 nav 估：假成員 + 假 nav，每段路長 len
const walker = { pos: { x: 0, y: 0, z: 0 }, speed: 1, head: () => ({ x: 0, y: 1, z: 0 }) };
const navOf = len => ({ route: () => [{ x: 0, z: 0 }, { x: len, z: 0 }], routeLength: () => len });

test('default scripts: placed → apply; grow → apply + levelUp; knock-back → LEVEL DOWN; the wait hint is one bubble', () => {
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
  // 每個有東西演的事件前面平移過去（不同物品之間空 GAP 0.4 s，裁決 R15）；等待事件只在演圖框時平移到代表角色（不空拍）；回合最後回全景
  assert.deepEqual(kinds.filter(k => k !== 'apply' && k !== 'mark'), ['focus', 'wait', 'focus', 'levelUp', 'wait', 'focus', 'levelUp', 'focus', 'bubble', 'wait', 'focus', 'home', 'world', 'focus']);
  assert.equal(beats[kinds.indexOf('levelUp') + 1].kind, 'apply', 'trailing apply after every script'); assert.equal(beats[kinds.lastIndexOf('levelUp')].down, true);
  assert.equal(beats[kinds.indexOf('levelUp')].down, false);
  // placed：平移 + 預設 apply + 補的 apply；每個事件至少一個 apply
  assert.deepEqual(kinds.slice(0, 3), ['focus', 'apply', 'apply']);
  assert.equal(kinds.filter(k => k === 'apply').length, 2 + 2 + 2 + 2 + 2);
});

test('only the last wait event of a turn shows the hint; the hint target falls back to the nearest islander', () => {
  const islander = { ...walker }, asked = [];
  const ctx = fakeCtx({ roster: { nearest: (key, p, opts) => { asked.push([key, p, opts]); return islander; }, keys: () => [], members: () => [] } });
  const w = item => ({ kind: 'wait', item, waits: [{ item, for: ['baseball', 'milk'] }] });
  const beats = buildTurn([w('chip'), w('bulb')], base(), ctx);
  const bubbles = beats.filter(b => b.kind === 'bubble');
  assert.equal(bubbles.length, 1); assert.equal(bubbles[0].dur, 1.2);
  // 沒有 rep 劇本 → 找離 bulb 錨點最近的島民；泡泡內容是第一個缺的幫手的圖框
  let shown = null;
  bubbles[0].start({ ...ctx, bubbles: { show: (head, kind, dur) => { shown = { head: head(), kind, dur }; return { cancel() {} }; } } });
  assert.equal(asked[0][0], 'landmarks.islanders'); assert.deepEqual(asked[0][2], { visible: true }, 'hidden islanders do not count'); assert.deepEqual(shown.kind, { icon: 'baseball' }); assert.deepEqual(shown.head, { x: 0, y: 1, z: 0 });
  // 圖框前面鏡頭先平移到代表角色身上（審稿：兩條正解唯一的等待圖框在畫面外）；只有演圖框的那個 wait 平移
  assert.equal(noMarks(beats).filter(b => b.kind === 'focus' && !b.final).length, 1, 'one pan for the hint, none for the silent wait');
  const pan = noMarks(beats)[noMarks(beats).indexOf(bubbles[0]) - 1], got = [];
  assert.equal(pan.kind, 'focus');
  pan.start({ ...ctx, roster: { ...ctx.roster, setFocus: c => got.push(['cells', c]) }, rig: { grabbed: false, focus: (p, o) => got.push(['rig', { ...p }, o.zoom]) } });
  assert.deepEqual(got, [['cells', [[0, 0]]], ['rig', { x: 0, y: 0, z: 0 }, 0.6]], 'the camera centres on the islander');
  // 模組 rep 劇本優先
  const rep = { ...walker, head: () => ({ x: 9, y: 9, z: 9 }) };
  const bulb = { id: 'bulb', view() {}, script: { rep: (s, c) => (s.lv && c ? rep : null) } };
  const [hint] = buildTurn([w('bulb')], base([tower, bulb]), ctx).filter(b => b.kind === 'bubble');
  hint.start({ ...ctx, bubbles: { show: head => { shown = head(); return { cancel() {} }; } } });
  assert.deepEqual(shown, { x: 9, y: 9, z: 9 });
  // 蒙太奇裡等待圖框是給玩家讀的提示：倍速除回來，真實秒數照舊 1.2
  const mctx = fakeCtx({ roster: ctx.roster }), [mhint] = buildTurn([w('chip')], { ...base(), montage: true }, mctx).filter(b => b.kind === 'bubble' && typeof b.dur === 'number' && b.dur > 2);
  assert.equal(mhint?.dur / MONTAGE_SPEED, 1.2);
});

// 外面一個看得到的人都沒有（颱風登陸大家躲進門裡）：等待圖框掛在物品頭上（終審 Important 2）
test('the wait hint hangs over the item when no visible islander is around', () => {
  const ctx = fakeCtx({ stage: { headOf: id => ({ x: id === 'bulb' ? 7 : 0, y: 2, z: 0 }), lv: {}, flags: {}, meta: {} } });
  const [hint] = buildTurn([{ kind: 'wait', item: 'bulb', waits: [{ item: 'bulb', for: ['baseball'] }] }], base(), ctx).filter(b => b.kind === 'bubble');
  let shown = null;
  assert.notEqual(hint.start({ ...ctx, bubbles: { show: head => { shown = head(); return { cancel() {} }; } } }), false, 'the hint still shows');
  assert.deepEqual(shown, { x: 7, y: 2, z: 0 });
  // 鏡頭平移到物品的格子
  const pan = buildTurn([{ kind: 'wait', item: 'bulb', waits: [{ item: 'bulb', for: ['baseball'] }] }], base(), ctx).find(b => b.kind === 'focus');
  let cells = null;
  pan.start({ ...ctx, roster: { ...ctx.roster, setFocus: c => { cells = c; } }, rig: { grabbed: false, focus() {} } });
  assert.deepEqual(cells, [cellOf('bulb')]);
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

test('montage keeps only walk/apply/levelUp/spawn/home/focus and drops walks when over 26 s', () => {
  // 最終章設計 §5：MONTAGE_CAP 20 → 26 秒真實時間（倒數 2 加上趕工會先撞到 20）
  assert.equal(MONTAGE_CAP, 26); assert.deepEqual(MONTAGE_KEEP, ['walk', 'apply', 'levelUp', 'spawn', 'home', 'together', 'focus']);
  const script = len => ({ placed: (e, s, ctx) => [ctx.B.walk(walker, { x: len, z: 0 }), ctx.B.bubble(walker, '！'), ctx.B.gesture(walker, 'wave'), ctx.B.together([ctx.B.walk(walker, { x: len, z: 0 }), ctx.B.wait(2)]), ctx.B.together([ctx.B.wait(1)]), ctx.B.levelUp('milk')] });
  const milk = len => ({ id: 'milk', view() {}, script: script(len) });
  const e = { kind: 'placed', item: 'milk', to: 1 };
  // 短路程：走路留著；bubble、gesture、wait 拿掉（together 裡也拿掉，空的 together 整個丟掉）
  const short = fakeCtx({ nav: navOf(2) });
  const beats = buildTurn([e], { ...base([tower, milk(2)]), montage: true }, short);
  assert.equal(short.montage, true); assert.equal(MONTAGE_SPEED, 2); assert.equal(short.speed, MONTAGE_SPEED, 'R15: the montage plays at ×2');
  const kinds = kindsOf(beats);
  // 最終章（計畫 5）：蒙太奇不再自己在開頭冒 3、2、1——數字是遊戲層插的 countdown 事件（下一個測試）
  assert.deepEqual(kinds, ['focus', 'walk', 'together', 'levelUp', 'apply', 'home', 'world', 'focus']);
  assert.deepEqual(kindsOf(noMarks(beats)[2].beats), ['walk']);
  assert.ok(estimateTurn(beats, short) <= MONTAGE_CAP);
  // 長路程（每段 30 單位，兩段 60 s 演出時間、蒙太奇兩倍速 → 30 s 真實 > 26 s）：連 walk 也拿掉
  const far = fakeCtx({ nav: navOf(30) });
  const long = buildTurn([e], { ...base([tower, milk(30)]), montage: true }, far);
  assert.deepEqual(kindsOf(long), ['focus', 'levelUp', 'apply', 'home', 'world', 'focus']);
  assert.ok(estimateTurn(long, far) <= MONTAGE_CAP);
});

test('montage turns no longer prepend 3-2-1; a countdown event plays the finale module script (one digit, 1.2 s real)', () => {
  const ctx = fakeCtx();
  const placed = { kind: 'placed', item: 'milk', to: 1 };
  // 沒有 countdown 事件：蒙太奇回合開頭沒有任何泡泡
  assert.ok(!kindsOf(buildTurn([placed], { ...base(), montage: true }, fakeCtx())).includes('bubble'));
  // 倒數 2、1 只有數字（倒數 3 另外有宣告：紅光、全島抬頭——finale.test）
  const cd = countdownEvent(2);
  const beats = buildTurn([cd, placed], { ...base([tower, finale]), montage: true }, ctx), kinds = kindsOf(beats);
  // countdown：先 mark、劇本一個數字泡泡（蒙太奇過濾不拿掉）、補的 apply；不補鏡頭平移
  assert.equal(beats[0].kind, 'mark');
  assert.deepEqual(kinds.slice(0, 2), ['bubble', 'apply']);
  assert.equal(kinds.filter(k => k === 'bubble').length, 1, 'one digit');
  const digit = noMarks(beats)[0];
  assert.equal(digit.dur / MONTAGE_SPEED, 1.2, 'the digit reads 1.2 s real at ×2');
  assert.equal(estimateTurn([digit], ctx), 1.2);
  let shown = null;
  digit.start({ ...ctx, bubbles: { show: (head, kind, dur) => { shown = { head: head(), kind, dur }; return { cancel() {} }; } } });
  assert.equal(shown.kind, '2'); assert.deepEqual(shown.head, { x: 0, y: 1, z: 0 }, 'over the tower');
  assert.equal(shown.dur, 1.2, 'bubbles get real seconds');
  // 鮮奶的事件照常平移（countdown 不算「上一個物品」：不空拍）
  assert.deepEqual(kinds.slice(2, 4), ['focus', 'apply']);
  // 舞台旗標：foldEvent 折進 e.flag（alarm = n）
  const seen = [];
  const spy = { id: 'finale', view() { return {}; }, script: { countdown: (e, s) => { seen.push(s.flags.alarm); return []; } } };
  buildTurn([countdownEvent(2)], { ...base([tower, spy]), montage: true }, fakeCtx());
  assert.deepEqual(seen, [2]);
  // 倒數 3：紅光（只套 finale.flare）→ 抬頭＋「！」→ 放回日常 → 數字「3」，每一拍標 keep（蒙太奇不過濾）
  const three = noMarks(buildTurn([countdownEvent(3)], { ...base([tower, finale]), montage: true }, fakeCtx()));
  assert.deepEqual(three.slice(0, 4).map(b => b.kind), ['apply', 'together', 'home', 'bubble']);
  assert.deepEqual(three[0].only, ['finale.flare']); assert.ok(three.slice(0, 4).every(b => b.keep));
  // 沒有 finale 模組：只有 apply
  assert.deepEqual(kindsOf(buildTurn([cd], { ...base(), montage: true }, fakeCtx())), ['apply', 'apply', 'home', 'world', 'focus']);
});

test('missile / epilogue events look up finale.script[kind]; finale mode adds no lead focus, no GAP, no upright', () => {
  const calls = [];
  const fin = { id: 'finale', view() { return {}; }, script: {
    missile: (e, s, c) => { calls.push(['missile', e.outcome, s.flags.missile, c.speed, c.montage]); return [c.B.wait(1)]; },
    epilogue: (e, s, c) => { calls.push(['epilogue', e.ending, s.flags.epilogue]); return [c.B.wait(2)]; },
  } };
  const events = finaleEvents({ id: 'cyber', missile: 'shield' });
  const tilted = () => ({ stage: { headOf: () => ({ x: 0, y: 1, z: 0 }), lv: {}, flags: {}, meta: {}, tilted: new Set(['milk.cart']) } });
  const ctx = fakeCtx(tilted());
  const beats = buildTurn(events, { ...base([tower, fin]), finale: true }, ctx);
  assert.equal(ctx.speed, 1); assert.equal(ctx.montage, false);
  assert.deepEqual(calls, [['missile', 'shield', 'shield', 1, false], ['epilogue', 'cyber', 'cyber']]);
  // 不扶正（第一拍就是 mark）、不補 focus、不空拍；收尾照舊
  assert.equal(beats[0].kind, 'mark');
  assert.deepEqual(kindsOf(beats), ['wait', 'apply', 'wait', 'apply', 'home', 'world', 'focus']);
  assert.equal(noMarks(beats).at(-1).final, true);
  assert.equal(estimateTurn(beats.filter(b => b.kind === 'wait'), ctx), 3, 'speed 1: show seconds are real seconds');
  // 終局模式即使有人說 montage 也是 1 倍速
  const both = fakeCtx(); buildTurn(events, { ...base([tower, fin]), finale: true, montage: true }, both);
  assert.equal(both.speed, 1); assert.equal(both.montage, false);
  // 沒有劇本：[apply]（加補的 apply）
  assert.deepEqual(kindsOf(buildTurn(events, { ...base(), finale: true }, fakeCtx())), ['apply', 'apply', 'apply', 'apply', 'home', 'world', 'focus']);
  // 對照：一般回合會先扶正被撞歪的零件
  assert.equal(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), fakeCtx(tilted()))[0].kind, 'apply');
  // 一般模式下的 missile 事件也查 finale 劇本、不補平移（劇本自己管鏡頭）
  assert.deepEqual(kindsOf(buildTurn([events[0]], base([tower, fin]), fakeCtx())), ['wait', 'apply', 'home', 'world', 'focus']);
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
// 倒數蒙太奇裡關鍵劇本的拍都帶 keep、不被過濾，超過 MONTAGE_CAP 拿掉走路時也不拿它們
const keyChip = () => {
  const asked = [], five = (e, s, c) => { asked.push(e.to); return [c.B.wait(2), { kind: 'fly', dur: 3 }, c.B.walk(walker, { x: 40, y: 0, z: 0 }), c.B.levelUp('chip')]; };
  five.key = true;
  return { asked, mod: { id: 'chip', view() {}, script: { grow: { 4: (e, s, c) => { asked.push(e.to); return [c.B.wait(1), c.B.levelUp('chip')]; }, 5: five } } } };
};
test('R11: the second level of a jump plays its full script when it is a key node; a montage keeps every beat of a key script', () => {
  const { asked, mod } = keyChip(), jump = { kind: 'grow', item: 'chip', from: 4, to: 5, jump: true };
  const raw = buildTurn([{ kind: 'grow', item: 'chip', from: 3, to: 4 }, jump, { kind: 'settle' }], base([quietTower, mod]), fakeCtx({ nav: navOf(40) }));
  assert.deepEqual(asked, [4, 5], 'both levels ask their scripts');
  assert.deepEqual(between(raw, 1).map(b => b.kind), ['wait', 'fly', 'walk', 'levelUp', 'apply'], 'the key script, no extra focus on the same cell');
  // 蒙太奇：fly、wait 不在 MONTAGE_KEEP 也留著；走 40 公尺超過上限也不拿掉（keep）
  const walkMilk = { id: 'milk', view() {}, script: { placed: (e, s, c) => [c.B.walk(walker, { x: 40, y: 0, z: 0 }), c.B.levelUp('milk')] } };
  const ctx = fakeCtx({ nav: navOf(40) }), m = noMarks(buildTurn([{ kind: 'grow', item: 'chip', from: 4, to: 5 }, { kind: 'placed', item: 'milk', to: 1 }], { ...base([quietTower, mod, walkMilk]), montage: true }, ctx));
  for (const k of ['wait', 'fly']) assert.ok(m.some(b => b.kind === k && b.keep), `${k} kept`);
  assert.equal(m.filter(b => b.kind === 'walk').length, 1, 'only the key walk survives the walk-strip');
  assert.ok(m.find(b => b.kind === 'walk').keep);
});
test('R11: key nodes are flagged on token Lv7/Lv10 and milk Lv7/Lv10 only; token Lv10 in a countdown montage still flies the speeders in', async () => {
  const token = await import('../src/actors/token.js'), milkMod = await import('../src/actors/milk.js');
  for (const [mod, keys] of [[token, [7, 10]], [milkMod, [7, 10]]]) assert.deepEqual(Object.entries(mod.script.grow).filter(([, f]) => f.key).map(([n]) => +n), keys, mod.id);
  const ctx = fakeCtx({ roster: { members: () => [], nearest: () => null, keys: () => [] } });
  const beats = buildTurn([{ kind: 'grow', item: 'token', from: 9, to: 10 }], { ...base([quietTower, token]), lv: { ...zero, token: 9 }, montage: true }, ctx);
  assert.ok(beats.some(b => b.kind === 'fly'), 'fly beat kept in the montage');
});

// ── 最終章（計畫 5 任務 2，設計 §5）：倒數回合的趕工 ──
// 假模組：grow[2] 普通劇本（rushSite 回點 → 趕工）、grow[3] ◆ 關鍵、grow[4] 劇本裡有作者標 keep 的拍、grow[5] 普通但 rushSite 回 null
const SITE = { ...anchorWorld('chip'), r: 1.3 };
const rushChip = () => {
  const plain = (e, s, c) => [c.B.wait(1), c.B.bubble(walker, '！'), c.B.levelUp('chip')];
  const key = (e, s, c) => [c.B.wait(2), { kind: 'fly', dur: 1 }, c.B.levelUp('chip')]; key.key = true;
  const keep = (e, s, c) => [c.B.wait(1), Object.assign(c.B.bubble(walker, '……', 0.8), { keep: true }), c.B.levelUp('chip')];
  return { id: 'chip', view() {}, script: { grow: { 2: plain, 3: key, 4: keep, 5: plain } }, rushSite: n => (n === 2 || n === 3 || n === 4 ? SITE : null) };
};
// 主島上的假島民（people walker、日常裡）；名冊只有一格 landmarks.islanders
const islanderAt = (x, z, extra = {}) => ({ walker: {}, mode: 'home', hidden: false, arriving: false, pos: { x, y: SITE.y, z }, yaw: 0, speed: 1.6, head: () => ({ x, y: 1, z }), ...extra });
const crowdCtx = (members, nav = { route: (a, b) => [{ ...a }, { ...b }], routeLength: r => Math.hypot(r[1].x - r[0].x, r[1].z - r[0].z), nearestWalkable: p => p }) => fakeCtx({
  nav, roster: { nearest: () => null, keys: () => ['landmarks.islanders'], members: () => members, claim() {}, home() {}, setPose(m, p) { Object.assign(m.pos, p); } },
});
const growChip = (from, to, extra = {}) => ({ kind: 'grow', item: 'chip', from, to, ...extra });
const rushTurn = (e, ctx) => buildTurn([e], { ...base([quietTower, rushChip()]), lv: { ...zero, chip: e.from }, montage: true }, ctx);
test('montage grow: key → full script; jump → apply+levelUp; keep beat in script → filtered script; rushSite point → walk+build+apply+levelUp+home; rushSite null → filtered script', () => {
  const hero = islanderAt(SITE.x - 1, SITE.z + 0.5), ctx = () => crowdCtx([hero]);
  // ◆ 關鍵級：整串照演（rushSite 回點也不趕工）
  assert.deepEqual(between(rushTurn(growChip(2, 3), ctx()), 0).map(b => b.kind), ['focus', 'wait', 'fly', 'levelUp', 'apply']);
  // 跳級的第二級：[apply, LEVEL UP]（不查劇本、不趕工）
  assert.deepEqual(between(rushTurn(growChip(1, 2, { jump: true }), ctx()), 0).map(b => b.kind), ['apply', 'levelUp', 'apply']);
  // 劇本裡有 keep 的拍：照今天的蒙太奇過濾（wait 拿掉，keep 的泡泡留著），rushSite 回點也不趕工
  const kept = between(rushTurn(growChip(3, 4), ctx()), 0);
  assert.deepEqual(kept.map(b => b.kind), ['focus', 'bubble', 'levelUp', 'apply']); assert.ok(kept[1].keep);
  // rushSite 回點：趕工五拍（+ 每個事件補的 apply）；前面照常平移到晶片格
  const rush = between(rushTurn(growChip(1, 2), ctx()), 0);
  assert.deepEqual(rush.map(b => b.kind), ['focus', 'walk', 'gesture', 'apply', 'levelUp', 'home', 'apply']);
  assert.equal(rush[2].dur, RUSH_BUILD); assert.equal(RUSH_BUILD, 1.6);
  // rushSite 回 null：蒙太奇過濾（普通劇本的 wait、泡泡拿掉）
  assert.deepEqual(between(rushTurn(growChip(4, 5), ctx()), 0).map(b => b.kind), ['focus', 'levelUp', 'apply']);
  // 模組沒寫 rushSite：同上
  const noSite = { ...rushChip(), rushSite: undefined };
  assert.deepEqual(between(buildTurn([growChip(1, 2)], { ...base([quietTower, noSite]), montage: true }, ctx()), 0).map(b => b.kind), ['focus', 'levelUp', 'apply']);
  // 不是蒙太奇：照演劇本（趕工只在倒數回合）
  assert.deepEqual(between(buildTurn([growChip(1, 2)], base([quietTower, rushChip()]), ctx()), 0).map(b => b.kind), ['focus', 'wait', 'bubble', 'levelUp', 'apply']);
  // 演起來：hero 是最近的島民，走到 frontOf(site, r) 的鏡頭側、朝 site 揮鋤頭
  const c = ctx(), [walk, gesture] = rush.slice(1, 3);
  c.speed = MONTAGE_SPEED;
  walk.start(c); walk.step(1, 100, c); walk.end(c);
  const front = frontOf(SITE, SITE.r);
  assert.ok(Math.hypot(hero.pos.x - front.x, hero.pos.z - front.z) < 1e-6, 'hero stands in front of the site');
});

test('rush with no hero near (empty roster) → apply + levelUp only', () => {
  // hero 演到才找（名冊在建拍與演出之間會變）：五拍照排，找不到人時走路、揮鋤頭、回家都是 0 秒的空拍（start 回 false），
  // 演出來就只剩 apply + LEVEL UP
  const ctx = crowdCtx([]), rush = between(rushTurn(growChip(1, 2), ctx), 0);
  assert.deepEqual(rush.map(b => b.kind), ['focus', 'walk', 'gesture', 'apply', 'levelUp', 'home', 'apply']);
  assert.equal(rush[1].start(ctx), false, 'walk skips'); assert.equal(rush[2].start(ctx), false, 'gesture skips');
  assert.doesNotThrow(() => rush[5].start(ctx), 'home with nobody is a no-op');
  assert.equal(rush[1].estimate(ctx), 0);
  // 只有衛星島上、躲起來、走回家路上、劇本手上的人，或不是 people walker 的模型：一樣找不到
  const nobody = crowdCtx([islanderAt(40, 40), islanderAt(SITE.x, SITE.z, { hidden: true }), islanderAt(SITE.x, SITE.z, { arriving: true }), islanderAt(SITE.x, SITE.z, { mode: 'script' }), islanderAt(SITE.x, SITE.z, { walker: null })]);
  const r2 = between(rushTurn(growChip(1, 2), nobody), 0);
  assert.equal(r2[1].start(nobody), false); assert.equal(r2[2].start(nobody), false);
  // 主島上、日常裡，但走到站位要超過 RUSH_WALK 秒真實時間（速度 1.6、2 倍速）：一樣不叫——直線就太遠、直線近但路要繞、到不了
  assert.equal(RUSH_WALK, 1.5);
  const front = frontOf(SITE, SITE.r), far = islanderAt(front.x - 1.6 * 2 * RUSH_WALK - 0.3, front.z);
  assert.ok(cellAt(far.pos.x, far.pos.z), 'the far islander is on the main island');
  const farCtx = crowdCtx([far]), r3 = between(rushTurn(growChip(1, 2), farCtx), 0);
  assert.equal(r3[1].start(farCtx), false); assert.equal(r3[2].start(farCtx), false);
  const near = islanderAt(front.x - 1, front.z);
  const detour = crowdCtx([near], { route: (a, b) => [{ ...a }, { x: a.x, z: a.z + 4 }, { ...b }], routeLength: r => r.slice(1).reduce((t, q, i) => t + Math.hypot(q.x - r[i].x, q.z - r[i].z), 0), nearestWalkable: p => p });
  const r5 = between(rushTurn(growChip(1, 2), detour), 0);
  assert.equal(r5[1].start(detour), false, 'a 1 m neighbour behind a 9 m detour is too far');
  const walled = crowdCtx([near], { route: a => [{ ...a }], routeLength: () => 0, nearestWalkable: p => p });
  const r6 = between(rushTurn(growChip(1, 2), walled), 0);
  assert.equal(r6[2].start(walled), false, 'someone who cannot reach the site is not the hero');
  // 點名在演到第一個趕工拍的那一刻：建拍時（estimateTurn 估走路）看到的人之後被劇本拉走了，換演出當下最近的人；之後的拍同一個人
  const a = islanderAt(SITE.x - 1, SITE.z), b = islanderAt(SITE.x + 1.5, SITE.z + 0.5), members = [a], live = crowdCtx(members);
  const r4 = between(rushTurn(growChip(1, 2), live), 0);
  a.mode = 'script'; members.push(b);
  r4[1].start(live); members.push(islanderAt(SITE.x, SITE.z + 0.1));   // 走路之後才出現、更近的人不換
  r4[2].start(live); r4[2].step(0.5, 0.1, live);
  assert.ok(b.walker.gesture?.kind === 'build', 'the hero picked at play time swings');
});

test('rush beats are tagged rush; over MONTAGE_CAP the rush walk is dropped but the build gesture stays', () => {
  const hero = islanderAt(SITE.x - 1, SITE.z + 0.5), near = crowdCtx([hero]);
  const rush = between(rushTurn(growChip(1, 2), near), 0).slice(1, 6);
  assert.ok(rush.every(b => b.rush === true), 'every rush beat is tagged');
  assert.ok(rush.every(b => !b.keep), 'rush beats are not keep (the over-cap strip may drop the walk)');
  // 趕工自己的走路 ≤ RUSH_WALK，撞上限的是同一回合別的事件：前面放鮮奶的劇本走 100 單位（速度 1、2 倍速 → 50 s 真實 > 26）
  // ——整回合拿掉走路，趕工的走路也拿掉；揮鋤頭、apply、LEVEL UP、回家留著
  const walkMilk = { id: 'milk', view() {}, script: { placed: (e, s, c) => [c.B.walk(walker, { x: 100, y: 0, z: 0 }), c.B.levelUp('milk')] } };
  const ctx = crowdCtx([hero]);
  const raw = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, growChip(1, 2)], { ...base([quietTower, walkMilk, rushChip()]), montage: true }, ctx);
  assert.ok(!raw.some(b => b.kind === 'walk'), 'no walk over the cap');
  const left = between(raw, 1);
  assert.deepEqual(left.map(b => b.kind), ['focus', 'gesture', 'apply', 'levelUp', 'home', 'apply']);
  // hero 站在原地朝 site 揮鋤頭（build 帶 at：轉向 site）
  const g = left[1], c = { ...ctx, speed: MONTAGE_SPEED };
  g.start(c); g.step(0.5, 0.1, c);
  assert.equal(hero.walker.gesture.kind, 'build');
  assert.ok(Math.abs(hero.walker.gesture.yaw - Math.atan2(SITE.x - hero.pos.x, SITE.z - hero.pos.z)) < 1e-9, 'turns toward the site');
  g.end(c);
  assert.ok(Math.hypot(hero.pos.x - (SITE.x - 1), hero.pos.z - (SITE.z + 0.5)) < 1e-9, 'swings where they stand');
});
