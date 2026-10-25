// test/turn.test.js：事件 → 劇本 → 拍（預設劇本、模組劇本、蒙太奇、fx 掛在 cause 上）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { installFakeDom } from './helpers/fakedom.js';
installFakeDom();
const { buildTurn, estimateTurn, MONTAGE_CAP, MONTAGE_KEEP } = await import('../src/show/turn.js');
const { B } = await import('../src/show/beats.js');

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
  assert.equal(raw[0].kind, 'mark'); assert.deepEqual(raw.slice(-2).map(b => b.kind), ['home', 'world']);
  assert.doesNotThrow(() => marks[0].start({}), 'no onMark → no-op');
  const beats = noMarks(raw), kinds = kindsOf(raw);
  assert.deepEqual(kinds.filter(k => k !== 'apply' && k !== 'mark'), ['levelUp', 'levelUp', 'bubble', 'home', 'world']);
  assert.equal(beats[kinds.indexOf('levelUp') + 1].kind, 'apply', 'trailing apply after every script'); assert.equal(beats[kinds.lastIndexOf('levelUp')].down, true);
  assert.equal(beats[kinds.indexOf('levelUp')].down, false);
  // placed：預設 apply + 補的 apply；每個事件至少一個 apply
  assert.deepEqual(kinds.slice(0, 2), ['apply', 'apply']);
  assert.equal(kinds.filter(k => k === 'apply').length, 2 + 2 + 2 + 2 + 2);
});

test('only the last wait event of a turn shows the hint; the hint target falls back to the nearest islander', () => {
  const islander = { ...walker }, asked = [];
  const ctx = fakeCtx({ roster: { nearest: (key, p) => { asked.push([key, p]); return islander; }, keys: () => [], members: () => [] } });
  const w = item => ({ kind: 'wait', item, waits: [{ item, for: ['baseball', 'milk'] }] });
  const beats = buildTurn([w('chip'), w('bulb')], base(), ctx);
  const bubbles = beats.filter(b => b.kind === 'bubble');
  assert.equal(bubbles.length, 1); assert.equal(bubbles[0].dur, 1.5);
  // 沒有 rep 劇本 → 找離 bulb 錨點最近的島民；泡泡內容是第一個缺的幫手的圖框
  let shown = null;
  bubbles[0].start({ ...ctx, bubbles: { show: (head, kind, dur) => { shown = { head: head(), kind, dur }; return { cancel() {} }; } } });
  assert.equal(asked[0][0], 'landmarks.islanders'); assert.deepEqual(shown.kind, { icon: 'baseball' }); assert.deepEqual(shown.head, { x: 0, y: 1, z: 0 });
  // 模組 rep 劇本優先
  const rep = { ...walker, head: () => ({ x: 9, y: 9, z: 9 }) };
  const bulb = { id: 'bulb', view() {}, script: { rep: (s, c) => (s.lv && c ? rep : null) } };
  const [hint] = buildTurn([w('bulb')], base([tower, bulb]), ctx).filter(b => b.kind === 'bubble');
  hint.start({ ...ctx, bubbles: { show: head => { shown = head(); return { cancel() {} }; } } });
  assert.deepEqual(shown, { x: 9, y: 9, z: 9 });
});

test('a module script replaces the default and still gets a trailing apply', () => {
  const seen = [];
  const chip = { id: 'chip', view() {}, script: { grow: { 2: (e, s, ctx) => { seen.push({ e, s, ctx }); return [ctx.B.wait(1)]; } } } };
  const ctx = fakeCtx();
  const e = { kind: 'grow', item: 'chip', from: 1, to: 2 };
  const beats = buildTurn([e], base([tower, chip]), ctx);
  const kinds = kindsOf(beats);
  assert.deepEqual(kinds, ['wait', 'apply', 'home', 'world']);
  // s：這個事件套用後的等級；prev 是套用前；total／prevTotal 是總等級
  assert.equal(seen.length, 1); assert.equal(seen[0].e, e); assert.equal(seen[0].ctx, ctx);
  assert.equal(seen[0].s.lv.chip, 2); assert.equal(seen[0].s.prev.lv.chip, 1); assert.equal(seen[0].s.total, 2); assert.equal(seen[0].s.prevTotal, 1);
  // 其他等級沒有劇本 → 預設
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'grow', item: 'chip', from: 2, to: 3 }], base([tower, chip]), ctx)), ['apply', 'levelUp', 'apply', 'home', 'world']);
  // settle：交給 tower.script.settle，s.total 是結算後的總等級、prevTotal 是上次結算的
  let settled = null;
  const t2 = { id: 'tower', view() {}, script: { settle: (ev, s) => { settled = s; return []; } } };
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'settle' }], base([t2]), ctx)), ['apply', 'apply', 'apply', 'home', 'world']);
  assert.equal(settled.total, 2); assert.equal(settled.prevTotal, 1);
});

test('montage keeps only walk/apply/levelUp/spawn/home, prefixes 3-2-1 bubbles, and drops walks when over 20 s', () => {
  assert.equal(MONTAGE_CAP, 20); assert.deepEqual(MONTAGE_KEEP, ['walk', 'apply', 'levelUp', 'spawn', 'home', 'together']);
  const script = len => ({ placed: (e, s, ctx) => [ctx.B.walk(walker, { x: len, z: 0 }), ctx.B.bubble(walker, '！'), ctx.B.gesture(walker, 'wave'), ctx.B.together([ctx.B.walk(walker, { x: len, z: 0 }), ctx.B.wait(2)]), ctx.B.together([ctx.B.wait(1)]), ctx.B.levelUp('milk')] });
  const milk = len => ({ id: 'milk', view() {}, script: script(len) });
  const e = { kind: 'placed', item: 'milk', to: 1 };
  // 短路程：走路留著；bubble、gesture、wait 拿掉（together 裡也拿掉，空的 together 整個丟掉）
  const short = fakeCtx({ nav: navOf(2) });
  const beats = buildTurn([e], { ...base([tower, milk(2)]), montage: true }, short);
  assert.equal(short.montage, true);
  const kinds = kindsOf(beats);
  assert.deepEqual(kinds.slice(0, 3), ['bubble', 'bubble', 'bubble']);
  assert.deepEqual(beats.slice(0, 3).map(b => b.dur), [0.6, 0.6, 0.6]);
  assert.deepEqual(kinds.slice(3), ['walk', 'together', 'levelUp', 'apply', 'home', 'world']);
  assert.deepEqual(kindsOf(noMarks(beats)[4].beats), ['walk']);
  assert.ok(estimateTurn(beats, short) <= MONTAGE_CAP);
  // 3-2-1 掛在 101 頭上
  let shown = [];
  for (const b of beats.slice(0, 3)) b.start({ ...short, bubbles: { show: (head, kind) => { shown.push([head(), kind]); return { cancel() {} }; } } });
  assert.deepEqual(shown.map(s => s[1]), ['3', '2', '1']);
  // 長路程（每段 30 單位，蒙太奇走路兩倍速 → 15 s × 2 > 20 s）：連 walk 也拿掉
  const far = fakeCtx({ nav: navOf(30) });
  const long = buildTurn([e], { ...base([tower, milk(30)]), montage: true }, far);
  assert.deepEqual(kindsOf(long).slice(3), ['levelUp', 'apply', 'home', 'world']);
  assert.ok(estimateTurn(long, far) <= MONTAGE_CAP);
});

test('estimateTurn adds numeric durs, uses estimate for function durs, and takes the longest child of together', () => {
  const ctx = fakeCtx({ nav: navOf(3) });
  assert.equal(estimateTurn([B.wait(1), B.together([B.wait(2), B.wait(0.5)]), B.walk(walker, { x: 3, z: 0 }), B.apply({ kind: 'settle' })], ctx), 1 + 2 + 3 + 0.5, 'a flashing apply counts one flash');
  assert.equal(estimateTurn([B.apply({ kind: 'settle' }, { flash: false }), { kind: 'x', dur: () => 9 }], ctx), 0, 'function durs without estimate count 0');
});

test('fx scripts are looked up on the cause module and may return null to fall back', () => {
  const calls = [];
  const rat = { id: 'rat', view() {}, script: { fx: (e, s, ctx) => { calls.push(e.cause); return e.flag ? [ctx.B.wait(0.5)] : null; } } };
  const milk = { id: 'milk', view() {}, script: { fx: () => { throw new Error('target module must not be asked'); } } };
  const ctx = fakeCtx();
  const mods = [tower, rat, milk];
  // 有劇本 → 用劇本
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'fx', item: 'rat', cause: 'rat', flag: { name: 'nest', value: true } }], base(mods), ctx)), ['wait', 'apply', 'home', 'world']);
  // 回 null → 預設：正向 delta 升級、負向 LEVEL DOWN、沒有 delta 不閃白光
  const up = buildTurn([{ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 2 } }], base(mods), ctx);
  assert.deepEqual(kindsOf(up), ['apply', 'levelUp', 'apply', 'home', 'world']); assert.equal(noMarks(up)[1].down, false);
  const down = buildTurn([{ kind: 'fx', item: 'chip', cause: 'rat', delta: { target: 'chip', from: 1, to: 1 } }, { kind: 'after', item: 'chip', cause: 'rat', delta: { target: 'chip', from: 2, to: 1 } }], base(mods), ctx);
  assert.deepEqual(kindsOf(down), ['apply', 'apply', 'apply', 'levelUp', 'apply', 'home', 'world']); assert.equal(noMarks(down)[3].down, true);
  assert.deepEqual(calls, ['rat', 'rat', 'rat', 'rat']);
  // cause 模組沒有 fx 劇本（或 cause 是 'turn'）→ 預設
  assert.deepEqual(kindsOf(buildTurn([{ kind: 'after', item: 'turn', cause: 'turn', flag: { name: 'blackout', value: true } }], base(mods), ctx)), ['apply', 'apply', 'home', 'world']);
});

test('a part knocked askew last turn is righted with a flash at the start of this turn', () => {
  const obj = { position: { x: 1, y: 0, z: 2 }, rotation: { z: 0.25 } }, flashes = [];
  const ctx = fakeCtx(); ctx.stage.tilted = new Set(['boba.main']); ctx.stage.partObject = k => (k === 'boba.main' ? obj : null);
  const beats = buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), ctx);
  const [fix] = beats;
  assert.equal(fix.kind, 'apply'); assert.ok(fix.dur > 0); assert.equal(beats[1].kind, 'mark');
  fix.start({ ...ctx, flash: { at: (p, o) => { flashes.push(p); assert.equal(obj.rotation.z, 0.25, 'still askew until the peak'); o.onPeak(); } } });
  assert.equal(flashes.length, 1); assert.equal(flashes[0], obj.position); assert.equal(obj.rotation.z, 0); assert.equal(ctx.stage.tilted.size, 0);
  obj.rotation.z = 0.3; fix.end(ctx); assert.equal(obj.rotation.z, 0, 'end rights it too (skip)');
  assert.equal(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), ctx)[0].kind, 'mark', 'nothing askew → no beat');
  assert.equal(buildTurn([{ kind: 'placed', item: 'milk', to: 1 }], base(), fakeCtx())[0].kind, 'mark', 'stages without tilted are fine');
});
