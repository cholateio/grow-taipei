import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople, ringPath } from '../src/scene/people.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createPathCursor } from '../src/scene/path.js';

const setup = (extra = {}) => {
  const glow = createGlowRegistry(), people = createPeople(THREE, { max: 8 });
  const loaded = [];
  const assets = { spawn: async (path, o) => { const g = new THREE.Group(); g.name = path; o.parent?.add(g); loaded.push(g); return g; } };
  return { glow, people, assets, loaded, f: createPartFactory(THREE, { people, assets, glow, builders: {}, ...extra }) };
};
const at = { x: 1, y: 2, z: 3 };

test('compound: non-glow parts merge into one clay mesh, glow parts into their own registered mesh; dispose unregisters', () => {
  const { f, glow } = setup();
  const p = f.build({ kind: 'compound', at, parts: [{ kind: 'box', pos: [0, 0.5, 0], scale: 1, color: 0xff0000 }, { kind: 'sphere', pos: [0, 1, 0], scale: 0.3, color: 0xfcea8b, glow: 0xfcea8b }] });
  assert.equal(p.object.children.length, 2); assert.deepEqual(p.object.position.toArray(), [1, 2, 3]); assert.equal(glow.size, 1);
  assert.ok(p.object.children.every(m => m.castShadow));
  p.dispose(); assert.equal(glow.size, 0);
});
test('compound: same-material parts collapse into one mesh and the clay material is shared across compounds', () => {
  const { f } = setup();
  const box = c => ({ kind: 'box', pos: [0, 0, 0], scale: 1, color: c });
  const a = f.build({ kind: 'compound', at, parts: [box(0xff0000), box(0x00ff00), { kind: 'cone', pos: [0, 1, 0], scale: 1, color: 0x0000ff }] });
  const b = f.build({ kind: 'compound', at, parts: [box(0xff0000)] });
  assert.equal(a.object.children.length, 1); assert.equal(a.object.children[0].material, b.object.children[0].material);
  assert.ok(a.object.children[0].geometry.attributes.color, 'vertex colours carry the part colours');
});
test('compound applies part position, scale and rotation to the merged geometry', () => {
  const { f } = setup();
  const p = f.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [{ kind: 'box', pos: [5, 0, 0], scale: [2, 1, 1], color: 0xffffff }] });
  const box = new THREE.Box3().setFromObject(p.object); assert.ok(Math.abs(box.min.x - 4) < 1e-6 && Math.abs(box.max.x - 6) < 1e-6);
});
test('people part spawns n walkers and removes them on dispose', () => {
  const { f, people } = setup();
  const p = f.build({ kind: 'people', at, n: 3, path: ringPath({ x: 0, z: 0 }, 1, 0.65), speed: 0.4, accessory: 'cap' });
  assert.equal(people.walkers.length, 3); p.dispose(); assert.equal(people.walkers.length, 0);
});
test('glb part: model loads under a holder at spec.at; a model arriving after dispose is dropped', async () => {
  const { f, loaded } = setup();
  const p = f.build({ kind: 'glb', at, path: 'quat/enemies/Rat.glb', h: 0.2 });
  await new Promise(r => setTimeout(r, 0)); assert.equal(loaded.length, 1); assert.ok(p.object.getObjectByName('quat/enemies/Rat.glb'));
  const q = f.build({ kind: 'glb', at, path: 'x.glb', h: 0.2 }); q.dispose(); await new Promise(r => setTimeout(r, 0));
  assert.equal(loaded[1].parent?.parent ?? null, null, 'late model not attached to a live holder');
});
test('glb loop: the model walks the world-space path (offset by spec.at)', async () => {
  const { f } = setup();
  const p = f.build({ kind: 'glb', at, path: 'a.glb', h: 0.2, loop: { path: ringPath({ x: 1, z: 3 }, 1, 2), speed: 1 } });
  await new Promise(r => setTimeout(r, 0)); p.update(0.3, 0.3);
  const m = p.object.children[0], w = new THREE.Vector3(); p.object.updateMatrixWorld(true); m.getWorldPosition(w);
  assert.ok(Math.abs(Math.hypot(w.x - 1, w.z - 3) - 1) < 0.05, 'stays on the ring');
});
test('smoke: puffs rise and fade, then wrap', () => {
  const { f } = setup();
  const p = f.build({ kind: 'smoke', at, n: 4, size: 0.3, rise: 1.8 });
  assert.equal(p.object.children.length, 4); p.update(0, 0);
  const y0 = p.object.children[0].position.y; p.update(0.5, 0.5);
  const c = p.object.children[0]; assert.ok(c.position.y > y0); assert.ok(c.material.opacity > 0 && c.material.opacity < 1);
});
test('module builders are dispatched by kind with (THREE, spec, ctx)', () => {
  let got; const { f } = setup({ builders: { crane: (T, spec, ctx) => { got = [T, spec, ctx]; return { object: new T.Group() }; } } });
  const p = f.build({ kind: 'crane', at }); assert.equal(got[0], THREE); assert.deepEqual(p.object.position.toArray(), [1, 2, 3]);
});
test('unknown kind throws with the kind name', () => { const { f } = setup(); assert.throws(() => f.build({ kind: 'nope', at }), /nope/); });
test('createPathCursor walks a closed loop and bounces on an open path', () => {
  const sq = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }];
  const c = createPathCursor(sq, { loop: true }); c.advance(1.5); const p = c.locate(); assert.ok(Math.abs(p.x - 1) < 1e-9 && Math.abs(p.z - 0.5) < 1e-9);
  c.advance(4); assert.ok(Math.abs(c.locate().x - 1) < 1e-9 && Math.abs(c.locate().z - 0.5) < 1e-9, 'wraps after 4');
  const o = createPathCursor(sq.slice(0, 2), { loop: false }); o.advance(1.5); assert.ok(Math.abs(o.locate().x - 0.5) < 1e-9, 'bounced back');
});
test('glb part releases its model from the asset system on dispose, and releases a model that loads after dispose (review #2)', async () => {
  const released = [], assets = { spawn: async () => new THREE.Group(), release: m => released.push(m) };
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), assets, builders: {} });
  const a = f.build({ kind: 'glb', at, path: 'a.glb', h: 1 }); await new Promise(r => setTimeout(r, 0)); a.dispose();
  const b = f.build({ kind: 'glb', at, path: 'b.glb', h: 1 }); b.dispose(); await new Promise(r => setTimeout(r, 0));
  assert.equal(released.length, 2);
});
