import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createPeople } from '../src/scene/people.js';
import { createNav } from '../src/show/nav.js';
import { createFlash } from '../src/show/flash.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { mulberry32 } from '../src/scene/random.js';
installFakeDom();
const { createRoster } = await import('../src/show/roster.js');

const AT = anchorWorld('milk');
const kids = n => ({ kind: 'roster', at: AT, n, shirt: 0xfcea8b, home: { kind: 'wander', at: AT, r: 1.0 } });

// 真 people、真 nav、真 flash；假 assets（holder 帶一個假 mixer，記錄 spawn／release）
function setup() {
  const people = createPeople(THREE, { max: 48 }), spawned = [], released = [];
  const assets = {
    spawned, released,
    spawn: async (path, opts) => { const g = new THREE.Group(); g.userData.mixer = { timeScale: 1 }; opts.parent?.add(g); spawned.push(g); return g; },
    release: g => { released.push(g); g.removeFromParent(); },
  };
  const nav = createNav({ rnd: mulberry32(7) }), flash = createFlash(THREE, { group: new THREE.Group() }), rail = { offset: 0 };
  const roster = createRoster(THREE, { people, assets, build: null, nav, flash, rail, rnd: mulberry32(11) });
  return { roster, people, assets, flash, nav, rail };
}

test('declare spawns n members at home with a flash each; members wander on the grid', () => {
  const { roster, people, flash, nav } = setup(); roster.declare('milk.kids', kids(3));
  assert.equal(roster.members('milk.kids').length, 3); assert.equal(people.walkers.length, 3); assert.equal(flash.count, 3);
  for (let i = 0; i < 60; i++) roster.update(1 / 30, i / 30);
  for (const m of roster.members('milk.kids')) { assert.ok(nav.walkable(m.pos.x, m.pos.z)); assert.ok(Math.hypot(m.pos.x - AT.x, m.pos.z - AT.z) <= 1.0 + 0.3); }
});
test('re-declaring the same key keeps the same members: n up adds, n down removes, accessory swaps in place', () => {
  const { roster } = setup(); roster.declare('k', kids(3)); const first = roster.members('k');
  roster.declare('k', kids(5)); assert.equal(roster.members('k').length, 5); assert.ok(first.every(m => roster.members('k').includes(m)));
  roster.declare('k', { ...kids(2), accessory: 'cap' }); const left = roster.members('k'); assert.equal(left.length, 2); assert.ok(left.every(m => m.walker.accessory === 'cap' && first.includes(m)));
});
test('from transfers a member between keys without respawning; removals wait for flush', () => {
  const { roster, people } = setup(); roster.declare('chip.engineers', kids(4)); const four = [...roster.members('chip.engineers')];
  roster.declare('chip.engineers', kids(3)); roster.declare('chip.detective', { ...kids(1), accessory: 'glass', from: 'chip.engineers' }); roster.flush();
  assert.equal(people.walkers.length, 4, 'nobody left, nobody new');
  assert.equal(roster.members('chip.engineers').length, 3); const det = roster.members('chip.detective'); assert.equal(det.length, 1);
  assert.ok(four.includes(det[0])); assert.equal(det[0].walker.accessory, 'glass'); assert.equal(det[0].key, 'chip.detective');
  roster.declare('chip.engineers', kids(2)); roster.flush(); assert.equal(people.walkers.length, 3, 'a plain shrink removes one at flush');
});
test('hold: nothing spawns until spawnHeld/sync; spawnHeld places members where the script wants', () => {
  const { roster, people } = setup(); roster.declare('k', kids(3), { hold: true }); assert.equal(people.walkers.length, 0);
  const m = roster.spawnHeld('k', { x: 1, y: 0.65, z: 1 }); assert.deepEqual(m.pos, { x: 1, y: 0.65, z: 1 }); assert.equal(roster.members('k').length, 1);
  roster.sync('k'); assert.equal(roster.members('k').length, 3); assert.throws(() => roster.spawnHeld('k', AT), /held/);
});
test('claim stops idling; home resumes; snap puts scripted members back home instantly', () => {
  const { roster } = setup(); roster.declare('k', { ...kids(1), home: { kind: 'stand', spots: [{ x: 1, y: 0.65, z: 1, yaw: 0 }] } }); const m = roster.members('k')[0];
  roster.claim(m); roster.setPose(m, { x: 0, y: 0.65, z: 0, walking: true }); for (let i = 0; i < 30; i++) roster.update(1 / 30, i / 30); assert.deepEqual([m.pos.x, m.pos.z], [0, 0]);
  roster.home(m); for (let i = 0; i < 150; i++) roster.update(1 / 30, i / 30); assert.ok(Math.hypot(m.pos.x - 1, m.pos.z - 1) < 0.1, 'walked back to the spot at WANDER_SPEED');
  roster.claim(m); roster.setPose(m, { x: 0, y: 0.65, z: 0 }); roster.snap(); assert.deepEqual([m.pos.x, m.pos.z, m.mode], [1, 1, 'home']);
});
test('model members ride the train roof in seats, idle animation pauses while standing', async () => {
  const { roster, rail, assets } = setup(); rail.offset = 0;
  roster.declare('rat.pack', { kind: 'roster', at: AT, n: 5, model: { path: 'quat/enemies/Rat.glb', h: 0.2, anim: 'Walk' }, home: { kind: 'ride', cars: 3, speed: 0.35 } });
  await new Promise(r => setTimeout(r, 0)); roster.update(1 / 30, 1);
  const ms = roster.members('rat.pack'); assert.equal(ms.length, 5); assert.equal(assets.spawned.length, 5);
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(Math.hypot(ms[i].pos.x - ms[j].pos.x, ms[i].pos.z - ms[j].pos.z) > 0.2, 'no two rats share a seat');
  assert.ok(ms.every(m => Math.abs(Math.hypot(m.pos.x, m.pos.z) - 8.3) < 0.2), 'on the ring');
  assert.equal(ms[0].holder.userData.mixer.timeScale, 0);
});
test('reset releases every walker and model', async () => {
  const { roster, people, assets } = setup(); roster.declare('a', kids(3)); roster.declare('b', { kind: 'roster', at: AT, n: 2, model: { path: 'x.glb', h: 0.2 }, home: { kind: 'wander', at: AT, r: 1 } });
  await new Promise(r => setTimeout(r, 0)); roster.reset(); assert.equal(people.walkers.length, 0); assert.equal(assets.released.length, 2); assert.equal(roster.count, 0);
});
test('a model that arrives after reset or retire is released, never shown', async () => {
  const { roster, assets } = setup(), model = n => ({ kind: 'roster', at: AT, n, model: { path: 'x.glb', h: 0.2 }, home: { kind: 'wander', at: AT, r: 1 } });
  roster.declare('a', model(2)); roster.declare('b', model(1)); roster.retire('b'); roster.flush(); roster.reset();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(assets.spawned.length, 3); assert.equal(assets.released.length, 3); assert.equal(roster.group.children.length, 0); assert.deepEqual(roster.keys(), []);
});
