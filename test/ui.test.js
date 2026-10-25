import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS } from '../src/ui/icons.js';
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
