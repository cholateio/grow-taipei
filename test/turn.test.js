// test/turn.test.js：事件 → 劇本 → 拍（預設劇本、模組劇本、蒙太奇、fx 掛在 cause 上）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { installFakeDom } from './helpers/fakedom.js';
installFakeDom();
const { buildTurn, estimateTurn, MONTAGE_CAP, MONTAGE_KEEP, MONTAGE_SPEED, GAP } = await import('../src/show/turn.js');
const { B } = await import('../src/show/beats.js');
const { cellOf } = await import('../src/actors/anchors.js');

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

test('montage keeps only walk/apply/levelUp/spawn/home/focus, prefixes 3-2-1 bubbles, and drops walks when over 20 s', () => {
  assert.equal(MONTAGE_CAP, 20); assert.deepEqual(MONTAGE_KEEP, ['walk', 'apply', 'levelUp', 'spawn', 'home', 'together', 'focus']);
  const script = len => ({ placed: (e, s, ctx) => [ctx.B.walk(walker, { x: len, z: 0 }), ctx.B.bubble(walker, '！'), ctx.B.gesture(walker, 'wave'), ctx.B.together([ctx.B.walk(walker, { x: len, z: 0 }), ctx.B.wait(2)]), ctx.B.together([ctx.B.wait(1)]), ctx.B.levelUp('milk')] });
  const milk = len => ({ id: 'milk', view() {}, script: script(len) });
  const e = { kind: 'placed', item: 'milk', to: 1 };
  // 短路程：走路留著；bubble、gesture、wait 拿掉（together 裡也拿掉，空的 together 整個丟掉）
  const short = fakeCtx({ nav: navOf(2) });
  const beats = buildTurn([e], { ...base([tower, milk(2)]), montage: true }, short);
  assert.equal(short.montage, true); assert.equal(MONTAGE_SPEED, 2); assert.equal(short.speed, MONTAGE_SPEED, 'R15: the montage plays at ×2');
  const kinds = kindsOf(beats);
  assert.deepEqual(kinds.slice(0, 3), ['bubble', 'bubble', 'bubble']);
  // 3、2、1 是給玩家讀的字：倍速除回來，真實秒數照舊 0.6（演出時間 0.6 × MONTAGE_SPEED）
  assert.deepEqual(beats.slice(0, 3).map(b => b.dur / MONTAGE_SPEED), [0.6, 0.6, 0.6]);
  assert.deepEqual(kinds.slice(3), ['focus', 'walk', 'together', 'levelUp', 'apply', 'home', 'world', 'focus']);
  assert.deepEqual(kindsOf(noMarks(beats)[5].beats), ['walk']);
  assert.ok(estimateTurn(beats, short) <= MONTAGE_CAP);
  // 3-2-1 掛在 101 頭上
  let shown = [];
  for (const b of beats.slice(0, 3)) b.start({ ...short, bubbles: { show: (head, kind) => { shown.push([head(), kind]); return { cancel() {} }; } } });
  assert.deepEqual(shown.map(s => s[1]), ['3', '2', '1']);
  // 長路程（每段 30 單位，蒙太奇走路兩倍速 → 15 s × 2 > 20 s）：連 walk 也拿掉
  const far = fakeCtx({ nav: navOf(30) });
  const long = buildTurn([e], { ...base([tower, milk(30)]), montage: true }, far);
  assert.deepEqual(kindsOf(long).slice(3), ['focus', 'levelUp', 'apply', 'home', 'world', 'focus']);
  assert.ok(estimateTurn(long, far) <= MONTAGE_CAP);
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
