import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { normalizeHeight, convertMaterial } from '../src/scene/assets.js';
test('normalizeHeight', () => assert.equal(normalizeHeight({ x: 1, y: 4, z: 1 }, 2), 0.5));
test('convertMaterial keeps colour/map, sets clay params, applies tint and glow by material name', () => {
  const src = new THREE.MeshStandardMaterial({ color: 0x123456, name: 'leafsGreen', metalness: 1 });
  const m = convertMaterial(THREE, src); assert.equal(m.roughness, 0.78); assert.equal(m.metalness, 0); assert.equal(m.color.getHex(), 0x123456);
  assert.equal(convertMaterial(THREE, src, { tint: { leaf: 0x9bbd7e } }).color.getHex(), 0x9bbd7e);
  const g = convertMaterial(THREE, src, { glow: { leaf: 0xff3fa0 } }); assert.equal(g.emissive.getHex(), 0xff3fa0);
});
test('first asset batch is present, CC0-listed and small', () => {
  const files = ['assets/kenney/nature/tree_default.glb','assets/kenney/nature/tree_oak.glb','assets/kenney/nature/tree_detailed.glb','assets/kenney/nature/tree_fat.glb','assets/kenney/nature/tree_small.glb','assets/quat/ships/Boat.glb','assets/quat/ships/BoatWSail.glb'];
  let total = 0; for (const f of files) { assert.ok(existsSync(f), f); total += statSync(f).size; }
  assert.ok(total < 1_000_000);
  const lic = readFileSync('assets/LICENSES.md', 'utf8'); assert.match(lic, /Kenney/); assert.match(lic, /Quaternius/); assert.match(lic, /CC0/);
});
test('every assets/<source>/<pack>/ folder has a CC0 row in LICENSES.md, and the rat and shiba are shipped', async () => {
  const { readdirSync } = await import('node:fs');
  const lic = readFileSync('assets/LICENSES.md', 'utf8');
  for (const src of ['kenney', 'quat']) for (const pack of readdirSync(`assets/${src}`)) assert.ok(lic.includes(`\`${src}/${pack}/\``), `${src}/${pack}`);
  for (const f of ['assets/quat/enemies/Rat.glb', 'assets/quat/animals/ShibaInu.glb']) assert.ok(existsSync(f), f);
});
