// test/bubbles.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { installFakeDom } from './helpers/fakedom.js';
installFakeDom();
const { createBubbles, BUBBLE_KINDS } = await import('../src/show/bubbles.js');
const { createFlash, FLASH, FLASH_PEAK } = await import('../src/show/flash.js');
const setup = () => { const group = new THREE.Group(); return { group, bubbles: createBubbles(THREE, { group }), flash: createFlash(THREE, { group }) }; };
test('a bubble follows its head, shows the symbol, and leaves after dur', async () => {
  const { group, bubbles } = setup(); let p = { x: 0, y: 1, z: 0 };
  const h = bubbles.show(() => p, '♥', 1.0);
  assert.equal(group.children.length, 1); assert.equal(group.children[0].element.className, 'bubble'); assert.equal(group.children[0].element.textContent, '♥');
  p = { x: 2, y: 1, z: 0 }; bubbles.update(0.5); assert.equal(group.children[0].position.x, 2);
  bubbles.update(0.6); assert.equal(group.children.length, 0); await h.done;
});
test('an icon bubble embeds the item SVG; unknown kinds throw', () => {
  const { group, bubbles } = setup();
  bubbles.show(() => ({ x: 0, y: 0, z: 0 }), { icon: 'milk' }, 1); assert.match(group.children[0].element._html, /<svg/);
  bubbles.show(() => ({ x: 0, y: 0, z: 0 }), { icon: 'dome' }, 1); assert.match(group.children[1].element._html, /<svg/);
  assert.throws(() => bubbles.show(() => ({ x: 0, y: 0, z: 0 }), 'OK', 1), /bubble kind/);
  assert.deepEqual(BUBBLE_KINDS, ['！', '……', '♥', '♪', '？', '3', '2', '1']);
});
test('levelUp lasts 1 s; down variant has the down class; clear removes everything at once', () => {
  const { group, bubbles } = setup();
  bubbles.levelUp(() => ({ x: 0, y: 2, z: 0 })); bubbles.levelUp(() => ({ x: 0, y: 2, z: 0 }), { down: true, text: 'LEVEL DOWN' });
  assert.equal(group.children[0].element.className, 'levelup'); assert.equal(group.children[0].element.textContent, 'LEVEL UP');
  assert.equal(group.children[1].element.children[0].className, 'down'); assert.equal(group.children[1].element.textContent, 'LEVEL DOWN');
  bubbles.update(0.9); assert.equal(group.children.length, 2); bubbles.update(0.2); assert.equal(group.children.length, 0);
  bubbles.show(() => ({ x: 0, y: 0, z: 0 }), '！', 5); bubbles.clear(); assert.equal(group.children.length, 0); assert.equal(bubbles.count, 0);
});
test('flash resolves after FLASH, calls onPeak once at FLASH_PEAK, clear cancels', async () => {
  const { group, flash } = setup(); const peaks = []; let done = false;
  flash.at({ x: 1, y: 1, z: 1 }, { onPeak: () => peaks.push(1) }).then(() => { done = true; });
  assert.equal(group.children.length, 1); flash.update(FLASH_PEAK - 0.05); assert.deepEqual(peaks, []); flash.update(0.1); assert.deepEqual(peaks, [1]);
  flash.update(FLASH); await Promise.resolve(); assert.ok(done); assert.equal(group.children.length, 0);
  flash.at({ x: 0, y: 0, z: 0 }); flash.clear(); assert.equal(flash.count, 0);
});

test('flash delay: the flash waits hidden, counts at once, peaks at delay + FLASH_PEAK; clear still fires onPeak', () => {
  const { group, flash } = setup(); const peaks = [];
  flash.at({ x: 0, y: 0, z: 0 }, { delay: 0.3, onPeak: () => peaks.push('a') }); assert.equal(flash.count, 1); assert.equal(group.children[0].visible, false);
  flash.update(0.3 + FLASH_PEAK - 0.05); assert.deepEqual(peaks, []); assert.equal(group.children[0].visible, true);
  flash.update(0.1); assert.deepEqual(peaks, ['a']);
  flash.at({ x: 0, y: 0, z: 0 }, { delay: 5, onPeak: () => peaks.push('b') }); flash.clear(); assert.deepEqual(peaks, ['a', 'b']);
});
