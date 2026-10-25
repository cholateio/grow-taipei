import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlowRegistry } from '../src/scene/glow.js';
test('registry sets intensity on add, follows night and scale, and forgets removed materials', () => {
  const g = createGlowRegistry(); const m = { emissiveIntensity: 0 };
  g.setNight(0.5); g.add(m); assert.ok(Math.abs(m.emissiveIntensity - 1.6) < 1e-9);
  g.setScale(0); assert.equal(m.emissiveIntensity, 0); assert.equal(g.intensity, 0);
  g.setScale(1); g.remove(m); g.setNight(1); assert.ok(Math.abs(m.emissiveIntensity - 1.6) < 1e-9); assert.equal(g.size, 0);
  assert.ok(Math.abs(g.intensity - 3.2) < 1e-9);
});
