import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, BUBBLE_ICONS } from '../src/ui/icons.js';
import { levelLabel, storageGet, storageSet } from '../src/ui/format.js';
test('eight inline SVG icons with the shared viewBox and ink stroke', () => {
  assert.deepEqual(Object.keys(ICONS).sort(), ['baseball','boba','bulb','chip','milk','rat','token','typhoon']);
  for (const s of Object.values(ICONS)) { assert.match(s, /^<svg/); assert.match(s, /viewBox="0 0 64 64"/); assert.match(s, /#211d1d/); }
});
test('levelLabel', () => { assert.equal(levelLabel(0, 4), ''); assert.equal(levelLabel(2, 4), 'Lv.2'); assert.equal(levelLabel(4, 4), 'Lv.MAX'); });
test('storage helpers never throw', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(storageGet('k', broken), null); assert.equal(storageSet('k', '1', broken), false);
  const mem = new Map(); const ok = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(storageSet('k', 'v', ok), true); assert.equal(storageGet('k', ok), 'v');
});
import { installFakeDom } from './helpers/fakedom.js';
// 結局卡 2026-11-01 拿掉了（使用者：直接用畫面呈現就好，不用文字描述）：cards.js 只剩怎麼玩與頂欄；重玩按頂欄 RESET
test('there is no end card any more: cards.js exports only the how-to card and the top bar', async () => {
  installFakeDom(); const cards = await import('../src/ui/cards.js');
  assert.deepEqual(Object.keys(cards).sort(), ['createTopBar', 'showHowTo']);
});

// 物品列只在回合結束靜靜寫 Lv.n（§9）：沒有飛入、跳動
const slotItems = () => Object.entries(ICONS).map(([id, icon]) => ({ id, name: id, icon, max: 4 }));
test('setLevel writes the label and max class without any animation class', async () => {
  installFakeDom(); const { createSlots } = await import('../src/ui/slots.js');
  const root = document.createElement('div'), slots = createSlots(root, { items: slotItems(), onPick() {} });
  const btn = root.querySelector('.slots').children.find(b => b.dataset.id === 'milk');
  slots.setLevel('milk', 1); assert.equal(btn.querySelector('.lv').textContent, 'Lv.1'); assert.equal(btn.className, 'slot');
  slots.setLevel('milk', 4); assert.equal(btn.querySelector('.lv').textContent, 'Lv.MAX'); assert.equal(btn.className, 'slot max');
  slots.setLevel('milk', 3); assert.equal(btn.className, 'slot');
  assert.equal(slots.fly, undefined); assert.equal(slots.land, undefined);
  slots.setPlaced('milk'); slots.setLevel('milk', 4); slots.reset();
  assert.equal(btn.className, 'slot'); assert.equal(btn.querySelector('.lv').textContent, ''); assert.equal(btn.disabled, false);
});

// 泡泡圖框用的六個圖示：和物品圖示同一套 64 viewBox 白底墨線
test('six bubble icons in the same SVG style', () => {
  assert.deepEqual(Object.keys(BUBBLE_ICONS).sort(), ['dome','islet','lamp','mortar','school','train']);
  for (const s of Object.values(BUBBLE_ICONS)) { assert.match(s, /^<svg/); assert.match(s, /viewBox="0 0 64 64"/); }
});

// 頂欄的跳過鍵（計畫 12 Task 1）：.tools 最左一顆 data-act=skip，預設藏著；setSkippable 顯示／隱藏，按下呼叫 onSkip
const topBar = async (opts = {}) => {
  installFakeDom(); const { createTopBar } = await import('../src/ui/cards.js');
  const root = document.createElement('div'), calls = [];
  const bar = createTopBar(root, { onReset: () => calls.push('reset'), onHowTo: () => calls.push('howto'), onSkip: () => calls.push('skip'), ...opts });
  return { root, bar, calls, btn: act => root.querySelector(`[data-act=${act}]`) };
};
test('the top bar has a hidden skip button first in the tools; setSkippable shows it and a press calls onSkip', async () => {
  const { bar, calls, btn } = await topBar();
  const skip = btn('skip');
  assert.ok(skip, 'skip button'); assert.equal(skip.tagName, 'button'); assert.equal(skip.textContent, '跳過');
  assert.deepEqual(skip.parent.children.map(b => b.dataset.act), ['skip', 'howto', 'reset'], 'skip is the leftmost tool');
  assert.equal(skip.hidden, true, 'hidden by default');
  bar.setSkippable(true); assert.equal(skip.hidden, false);
  skip.listeners.click(); assert.deepEqual(calls, ['skip']);
  bar.setSkippable(false); assert.equal(skip.hidden, true);
  btn('reset').listeners.click(); btn('howto').listeners.click(); assert.deepEqual(calls, ['skip', 'reset', 'howto']);
});
