// 開局載入量表（計畫 12 Task 4）：第一次打開連結、還沒放任何物品時，瀏覽器要抓多少東西。
//   glb：無頭演出層開局（headlessShow，lv 全 0）要求的模型 + app.js 開局直接 spawn 的點綴（treeSpawns、柴犬）；
//        DEFERRED_DECOR（第一幀畫出來之後才載）另列、不算進開局。同一個路徑只抓一次（assets.js 以 path 快取）。
//   JS：從 src/main.js 沿 import 走到的每個模組（含 vendor/three）；GitHub Pages 會 gzip，順便列 gzip 後的大小。
// npm run startup
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const GOAL = 1.5e6;   // 開局 glb 目標 ≤ 1.5 MB
const DRACO = ['vendor/three/draco/draco_wasm_wrapper.js', 'vendor/three/draco/draco_decoder.wasm'];

// 一個模型實際要抓的檔：glb 本身（用到 Draco 就加解碼器）；.gltf 加上它引用的 .bin／貼圖
function filesOf(path) {
  const file = join('assets', path), abs = join(ROOT, file), out = [file];
  if (path.endsWith('.gltf')) {
    const j = JSON.parse(readFileSync(abs, 'utf8'));
    for (const r of [...(j.buffers ?? []), ...(j.images ?? [])]) if (r.uri && !r.uri.startsWith('data:')) out.push(join(dirname(file), decodeURIComponent(r.uri)));
  } else {
    const b = readFileSync(abs), len = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
    if (json.extensionsUsed?.includes('KHR_draco_mesh_compression')) out.push(...DRACO);
  }
  return out;
}
const sizeOf = f => statSync(join(ROOT, f)).size;

// 從 src/main.js 沿靜態與動態 import（字面字串）走
function jsGraph(entry = 'src/main.js') {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(join(ROOT, f), 'utf8');
    // 靜態：from '…'、import '…'；動態：import( 到行尾之間的相對路徑字串（main.js 的 import 是三元式）
    const specs = [...src.matchAll(/(?:\bfrom|^\s*import)\s*['"](\.{1,2}\/[^'"]+)['"]/gm)].map(m => m[1]);
    for (const m of src.matchAll(/\bimport\(([^\n]*)/g)) specs.push(...[...m[1].matchAll(/['"](\.{1,2}\/[^'"]+)['"]/g)].map(x => x[1]));
    for (const spec of specs) {
      const next = relative(ROOT, resolve(ROOT, dirname(f), spec));
      if (existsSync(join(ROOT, next))) todo.push(next);
    }
  }
  return [...seen].sort();
}

export async function measure() {
  const { headlessShow } = await import('../test/helpers/show.js');
  const { treeSpawns, SHIBA, DEFERRED_DECOR } = await import('../src/app.js');
  const { assets } = await headlessShow();
  const asked = new Set([...assets.paths, ...treeSpawns().map(t => t.path), SHIBA.path]);
  const deferred = [...asked].filter(p => DEFERRED_DECOR.includes(p));
  const row = p => ({ path: p, bytes: filesOf(p).reduce((s, f) => s + sizeOf(f), 0) });
  const startup = [...asked].filter(p => !DEFERRED_DECOR.includes(p)).map(row).sort((a, b) => b.bytes - a.bytes);
  const shared = new Set(startup.flatMap(r => filesOf(r.path)));   // Draco 解碼器只抓一次
  const glbBytes = [...shared].reduce((s, f) => s + sizeOf(f), 0);
  const js = jsGraph().map(f => { const b = readFileSync(join(ROOT, f)); return { path: f, bytes: b.length, gzip: gzipSync(b).length }; });
  return { startup, deferred: deferred.map(row), glbBytes, js };
}

const kb = n => `${(n / 1024).toFixed(0).padStart(6)} KB`, mb = n => `${(n / 1e6).toFixed(2)} MB`;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { startup, deferred, glbBytes, js } = await measure();
  console.log('開局模型（lv 全 0，同路徑只算一次）');
  for (const r of startup) console.log(`  ${kb(r.bytes)}  ${r.path}`);
  console.log(`  合計 ${startup.length} 個 ${mb(glbBytes)}（目標 ≤ ${mb(GOAL)}）${glbBytes > GOAL ? ' ⚠ 超過；最大的三個：' + startup.slice(0, 3).map(r => r.path).join('、') : ''}`);
  console.log(`延後（第一幀之後）：${deferred.length ? deferred.map(r => `${r.path} ${(r.bytes / 1024).toFixed(0)} KB`).join('、') : '沒有'}`);
  const three = js.find(r => r.path === 'vendor/three/three.module.js'), sum = k => js.reduce((s, r) => s + r[k], 0);
  console.log(`JS（從 src/main.js 的 import 圖）：${js.length} 檔 ${mb(sum('bytes'))}，gzip 後 ${mb(sum('gzip'))}`);
  if (three) console.log(`  其中 three.module.js ${mb(three.bytes)}，gzip 後 ${mb(three.gzip)}`);
  process.exit(0);
}
