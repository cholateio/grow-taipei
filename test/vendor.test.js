import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
const files = ['vendor/three/three.module.js','vendor/three/addons/controls/OrbitControls.js','vendor/three/addons/renderers/CSS2DRenderer.js',
  'vendor/three/addons/geometries/RoundedBoxGeometry.js','vendor/three/addons/utils/BufferGeometryUtils.js','vendor/three/addons/utils/SkeletonUtils.js',
  'vendor/three/addons/math/SimplexNoise.js','vendor/three/addons/loaders/GLTFLoader.js','vendor/three/addons/loaders/DRACOLoader.js',
  'vendor/three/draco/draco_decoder.wasm','vendor/three/draco/draco_wasm_wrapper.js'];
for (const f of files) test(`${f} vendored and non-empty`, () => { assert.ok(existsSync(f), f); assert.ok(statSync(f).size > 1000, f); });
test('three is r170 and importable in Node', async () => {
  const THREE = await import('../vendor/three/three.module.js');
  assert.equal(THREE.REVISION, '170'); assert.ok(new THREE.Vector3(1, 2, 3).length() > 3.7);
});
test('vendored addons import three relatively so Node can load them', async () => {
  const { RoundedBoxGeometry } = await import('../vendor/three/addons/geometries/RoundedBoxGeometry.js');
  assert.ok(new RoundedBoxGeometry(1, 1, 1, 2, 0.12).attributes.position.count > 0);
});
test('index.html importmap points three and three/addons/ at vendor', () => {
  const html = readFileSync('index.html', 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.imports.three, './vendor/three/three.module.js');
  assert.equal(map.imports['three/addons/'], './vendor/three/addons/');
  assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg|cdnjs/);
});
test('vendored BufferGeometryUtils exports mergeGeometries (assets.js merges each glb with it) and it runs in Node', async () => {
  const THREE = await import('../vendor/three/three.module.js');
  const { mergeGeometries } = await import('../vendor/three/addons/utils/BufferGeometryUtils.js');
  const a = new THREE.BoxGeometry().toNonIndexed(), b = new THREE.BoxGeometry().toNonIndexed();
  assert.equal(mergeGeometries([a, b]).attributes.position.count, a.attributes.position.count * 2);
});
