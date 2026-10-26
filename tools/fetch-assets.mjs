// 抓 CC0 模型：node tools/fetch-assets.mjs [--only <pack>] [--tmp <dir>]
//   讀 tools/assets.json 的每一包 { source: 'kenney'|'quat'|'kaykit', pack, files: [...], into }，
//   下載到暫存資料夾，只把列出的檔（連同它引用的貼圖／.bin）放進 assets/<into>/，
//   並在 assets/LICENSES.md 的表格裡每包新增或更新一列（重跑結果相同）。
//   每包都先核對授權原文：Kenney zip 的 License.txt、Quaternius 鏡像的 LICENSES.md、KayKit repo 的 LICENSE.txt，不是 CC0 整包不收。
//   不收的檔：Draco／meshopt 壓縮（載入器不加解碼器）、單檔 ≥ 300 KB、包裡找不到。有任何一檔不收就 exit 1，請改 assets.json。
//   下載的檔是不受信任的資料：只當位元組讀，不執行。
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

export const MAX_FILE = 300_000;
const MIRROR = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/';
const UNSUPPORTED = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

// ── zip：只讀中央目錄，支援 stored／deflate（Kenney 與 GitHub 封存檔都只用這兩種）──
export function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(eocd + 10), out = new Map();
  for (let i = 0, p = buf.readUInt32LE(eocd + 16); i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extra + comment;
    if (name.endsWith('/')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), raw = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`zip method ${method} (${name})`);
    out.set(name, { method, raw });
  }
  // 用到才解壓
  const get = k => { const x = out.get(k); return x && (x.method === 0 ? x.raw : inflateRawSync(x.raw)); };
  return { has: k => out.has(k), keys: () => out.keys(), get };
}

// glb 的 JSON 區塊；.gltf 本身就是 JSON
export function glbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) return JSON.parse(buf.toString('utf8'));
  return JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
}
// 這個模型還引用哪些外部檔（貼圖、.bin），相對路徑
const dependencies = json => [...(json.images ?? []), ...(json.buffers ?? [])].map(x => x.uri).filter(u => u && !/^data:|^[a-z]+:\/\//i.test(u)).map(decodeURIComponent);

const httpGet = async url => {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
};
const isCC0 = text => /Creative Commons Zero|CC0/.test(text) && /creativecommons\.org\/publicdomain\/zero/.test(text);
// 「\tTrain Kit (1.1)」→「Train Kit 1.1」；KayKit 寫成「KayKit : Space Base Bits (1.0)」
const titleOf = text => text.split('\n').map(l => l.trim()).find(Boolean).replace(/^KayKit\s*:\s*/, '').replace(/\s*\(([\d.]+)\)$/, ' $1');

// 每種來源：拿到「名稱 → 位元組」的取檔函式、授權核對結果、LICENSES.md 那一列的來源欄
const SOURCES = {
  async kenney(e, { get, tmp }) {
    const page = `https://kenney.nl/assets/${e.pack}`;
    const url = (await get(page)).toString('utf8').match(/https:\/\/kenney\.nl\/media\/[^"'\s]+\.zip/)?.[0];
    if (!url) throw new Error(`no zip link on ${page}`);
    const zipBuf = await get(url); writeFileSync(join(tmp, posix.basename(url)), zipBuf);
    const zip = readZip(zipBuf), names = [...zip.keys()];
    const licence = zip.get(names.find(k => /(^|\/)License\.txt$/i.test(k)) ?? '')?.toString('utf8') ?? '';
    // 新版套件放 Models/GLB format/，舊版（Space、Racing）放 Models/GLTF format/*.glb
    const find = f => names.filter(k => k.startsWith('Models/') && posix.basename(k) === f).sort((a, b) => b.includes('GLB format') - a.includes('GLB format'))[0];
    return {
      cc0: isCC0(licence),
      file: f => { const k = find(f); return k && { buf: zip.get(k), dep: d => zip.get(posix.join(posix.dirname(k), d)) }; },
      credit: `Kenney — ${titleOf(licence)}（${page}），zip 內 License.txt 載明 CC0`,
    };
  },
  async quat(e, { get }) {
    // 鏡像 LICENSES.md：先查目錄 → 包名對照表（有些包的目錄名不同），再看那包的授權欄
    const md = (await get(MIRROR + 'LICENSES.md')).toString('utf8');
    const id = md.match(new RegExp('\\| `([\\w-]+)` \\| `public/glb/' + e.pack + '/` \\|'))?.[1] ?? e.pack;
    const row = md.split('\n').find(l => l.startsWith('| `' + id + '` |'))?.split('|').map(s => s.trim());
    const base = `${MIRROR}public/glb/${e.pack}/`;
    const fetchOr = async u => { try { return await get(u); } catch { return undefined; } };
    const bufs = new Map();
    for (const f of e.files) bufs.set(f, await fetchOr(base + f));
    return {
      cc0: row?.[3] === 'CC0-1.0',
      file: f => bufs.get(f) && { buf: bufs.get(f), dep: () => undefined },
      credit: `Quaternius — ${row?.[2]}（${row?.[4]}），經 https://github.com/trebeljahr/quaternius-showcase 鏡像取得，鏡像 LICENSES.md 載明 CC0-1.0`,
    };
  },
  async kaykit(e, { get, tmp }) {
    const repo = `https://github.com/KayKit-Game-Assets/KayKit-${e.pack}-1.0`;
    const zipBuf = await get(`${repo}/archive/refs/heads/main.zip`); writeFileSync(join(tmp, `kaykit-${e.pack}.zip`), zipBuf);
    const zip = readZip(zipBuf), names = [...zip.keys()];
    const licence = zip.get(names.find(k => /\/Assets\/LICENSE\.txt$/i.test(k)) ?? names.find(k => /LICENSE\.txt$/i.test(k)) ?? '')?.toString('utf8') ?? '';
    const find = f => names.find(k => /\/Assets\/gltf\//.test(k) && posix.basename(k) === f);
    return {
      cc0: isCC0(licence),
      file: f => { const k = find(f); return k && { buf: zip.get(k), dep: d => zip.get(posix.join(posix.dirname(k), d)) }; },
      credit: `KayKit — ${titleOf(licence)}（Kay Lousberg，${repo}），repo 內 LICENSE.txt 載明 CC0`,
    };
  },
};

// LICENSES.md：以「| `<into>/` |」開頭的列就地換掉，沒有就接在表格最後一列後面
export function upsertRow(md, into, credit) {
  const row = `| \`${into}/\` | ${credit} | CC0 1.0 |`, lines = md.split('\n');
  const at = lines.findIndex(l => l.startsWith(`| \`${into}/\` |`));
  if (at >= 0) lines[at] = row;
  else { let last = -1; lines.forEach((l, i) => { if (l.startsWith('|')) last = i; }); lines.splice(last + 1, 0, row); }
  return lines.join('\n');
}

export async function fetchAssets({ entries, root = '.', tmp = mkdtempSync(join(tmpdir(), 'grow-assets-')), get = httpGet, log = console.log }) {
  mkdirSync(tmp, { recursive: true });
  const written = [], rejected = [], licPath = join(root, 'assets/LICENSES.md');
  let md = readFileSync(licPath, 'utf8');
  for (const e of entries) {
    const src = await SOURCES[e.source]?.(e, { get, tmp });
    if (!src) { rejected.push({ file: e.into, why: `unknown source ${e.source}` }); continue; }
    if (!src.cc0) { rejected.push({ file: e.into, why: `licence text of ${e.pack} does not say CC0` }); log(`✖ ${e.into}: 授權不是 CC0，整包不收`); continue; }
    let shipped = 0;
    for (const f of e.files) {
      const got = src.file(f);
      if (!got?.buf) { rejected.push({ file: f, why: `not in ${e.pack}` }); log(`✖ ${e.into}/${f}: 包裡沒有`); continue; }
      let json;
      try { json = glbJson(got.buf); } catch { rejected.push({ file: f, why: 'not a glb/gltf' }); continue; }
      const ext = [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])].find(x => UNSUPPORTED.includes(x));
      if (ext) { rejected.push({ file: f, why: `${ext} is unsupported (no decoder)` }); log(`✖ ${e.into}/${f}: ${ext} 壓縮，不收`); continue; }
      const deps = dependencies(json).map(d => [d, got.dep(d)]);
      const missing = deps.find(([, b]) => !b);
      if (missing) { rejected.push({ file: f, why: `missing dependency ${missing[0]}` }); continue; }
      const big = [[f, got.buf], ...deps].find(([, b]) => b.length >= MAX_FILE);
      if (big) { rejected.push({ file: f, why: `${big[0]} is ${big[1].length} bytes (limit ${MAX_FILE})` }); log(`✖ ${e.into}/${f}: ${big[1].length} bytes ≥ 300 KB，不收`); continue; }
      for (const [name, b] of [[f, got.buf], ...deps]) {
        const out = join(root, 'assets', e.into, name); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, b);
        written.push({ path: `${e.into}/${name}`, bytes: b.length });
      }
      shipped++;
    }
    if (shipped) { md = upsertRow(md, e.into, src.credit); log(`✔ ${e.into}: ${shipped}/${e.files.length} 檔（${src.credit}）`); }
  }
  writeFileSync(licPath, md);
  return { written, rejected };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const only = opt('--only'), entries = JSON.parse(readFileSync('tools/assets.json', 'utf8')).filter(e => !only || e.pack === only);
  const { written, rejected } = await fetchAssets({ entries, ...(opt('--tmp') ? { tmp: opt('--tmp') } : {}) });
  const unique = new Map(written.map(w => [w.path, w.bytes]));
  console.log(`寫入 ${unique.size} 檔，共 ${[...unique.values()].reduce((s, b) => s + b, 0)} bytes`);
  for (const r of rejected) console.log(`不收 ${r.file}: ${r.why}`);
  process.exit(rejected.length ? 1 : 0);
}
