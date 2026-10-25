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
test('the end card is a banner: title, line and restart, no level list (the item bar already shows levels)', async () => {
  installFakeDom(); const { showEndCard } = await import('../src/ui/cards.js');
  const root = document.createElement('div'); let restarted = false;
  const el = showEndCard(root, { title: '大停電', line: '全島黑掉', levels: [{ name: '鮮奶', lv: 4, max: 4 }], onRestart: () => { restarted = true; } });
  assert.equal(el.className, 'card end'); assert.match(el.textContent, /大停電/); assert.match(el.textContent, /全島黑掉/);
  assert.doesNotMatch(el.textContent, /Lv\./); assert.equal(el.querySelector('.levels'), null);
  el.querySelector('button').listeners.click(); assert.ok(restarted); assert.equal(root.children.length, 0);
});

// 計畫 3.6：物品列把「操作」和「世界」接起來——升級時那格跳一下，放置時圖示飛到島上
const slotItems = () => Object.entries(ICONS).map(([id, icon]) => ({ id, name: id, icon, max: 4 }));
test('setLevel bumps the slot only when its label changes; reset clears it', async () => {
  installFakeDom(); const { createSlots } = await import('../src/ui/slots.js');
  const root = document.createElement('div'), slots = createSlots(root, { items: slotItems(), onPick() {} });
  const btn = root.querySelector('.slots').children.find(b => b.dataset.id === 'milk');
  slots.setLevel('milk', 1); assert.ok(btn.classList.contains('bump')); assert.equal(btn.querySelector('.lv').textContent, 'Lv.1');
  btn.classList.remove('bump'); slots.setLevel('milk', 1); assert.ok(!btn.classList.contains('bump'), 'same level, no bump');
  slots.setLevel('milk', 4); assert.ok(btn.classList.contains('bump') && btn.classList.contains('max'));
  slots.reset(); assert.ok(!btn.classList.contains('bump')); assert.equal(btn.querySelector('.lv').textContent, '');
});
test('fly resolves at once when there is no target or no animation support', async () => {
  installFakeDom(); const { createSlots } = await import('../src/ui/slots.js');
  const slots = createSlots(document.createElement('div'), { items: slotItems(), onPick() {} });
  await slots.fly('milk', null); await slots.fly('milk', { x: 10, y: 10 });
});
test('land() and reset() finish icons still flying, so the show is not held up', async () => {
  installFakeDom(); const { createSlots } = await import('../src/ui/slots.js');
  const anims = []; const realCreate = document.createElement;
  document.createElement = tag => { const el = realCreate(tag); el.animate = () => { let done; const a = { finished: new Promise(r => { done = r; }), finish() { done(); } }; anims.push(a); return a; }; el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 64, height: 72 }); return el; };
  document.body = document.createElement('body');
  const slots = createSlots(document.createElement('div'), { items: slotItems(), onPick() {} });
  const p = slots.fly('milk', { x: 300, y: 200 }); assert.equal(document.body.children.length, 1);
  slots.land(); await p; assert.equal(document.body.children.length, 0);
  const q = slots.fly('chip', { x: 300, y: 200 }); slots.reset(); await q; assert.equal(document.body.children.length, 0);
});

// 泡泡圖框用的六個圖示：和物品圖示同一套 64 viewBox 白底墨線
test('six bubble icons in the same SVG style', () => {
  assert.deepEqual(Object.keys(BUBBLE_ICONS).sort(), ['dome','islet','lamp','mortar','school','train']);
  for (const s of Object.values(BUBBLE_ICONS)) { assert.match(s, /^<svg/); assert.match(s, /viewBox="0 0 64 64"/); }
});
