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
