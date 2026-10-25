// 實例化零件庫：建模只推 {kind, 矩陣, 顏色}，build() 時每種 kind 一個 InstancedMesh。
// 靜態物件因此只要二三十個 draw call。材質是霧面黏土（政策島提示詞 §5）。
import { RoundedBoxGeometry } from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './random.js';

export const KINDS = ['box', 'rbox', 'cylinder', 'cone', 'cone6', 'sphere', 'ico', 'dome', 'torus', 'prism', 'hip', 'leaf', 'trunk', 'frustum', 'rail', 'glowbox', 'glowsphere'];
export const GLOW = 0xffc777;
const GLOW_KINDS = new Set(['glowbox', 'glowsphere']);
const JITTER = 0.0072;   // 每個 instance 縮放 ±0.72%，防 z-fighting

export function makeGeometry(THREE, kind) {
  switch (kind) {
    case 'box': case 'glowbox': return new THREE.BoxGeometry(1, 1, 1);
    case 'rbox': return new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 10);
    case 'cone6': return new THREE.ConeGeometry(0.5, 1, 6);
    case 'sphere': case 'glowsphere': return new THREE.SphereGeometry(0.5, 14, 10);
    case 'ico': return new THREE.IcosahedronGeometry(0.5, 1);
    case 'dome': return new THREE.SphereGeometry(0.5, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'torus': return new THREE.TorusGeometry(0.5, 0.055, 6, 24);
    case 'prism': return new THREE.CylinderGeometry(0.5, 0.5, 1, 3);
    // 四坡屋頂：底面剛好是軸對齊的 1×1 正方形，任意 w×d 縮放都還是乾淨的長方形
    case 'hip': return new THREE.ConeGeometry(0.5, 1, 4).rotateY(Math.PI / 4).scale(Math.SQRT2, 1, Math.SQRT2);
    case 'trunk': return new THREE.CylinderGeometry(0.32, 0.5, 1, 9);
    case 'frustum': return new THREE.CylinderGeometry(0.3, 0.5, 1, 10);          // 火山、101 的節
    case 'rail': return new THREE.TorusGeometry(0.5, 0.012, 4, 64);              // 高架軌道（直徑 1，用 scale 放大）
    case 'leaf': {
      // 抖動過的多面體樹葉團；用位置做雜湊，共用頂點抖得一樣，不會裂開
      const g = new THREE.IcosahedronGeometry(0.5, 1), p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = Math.sin(v.x * 12.9 + v.y * 78.2 + v.z * 37.7) * 43758.5;
        v.multiplyScalar(1 + (n - Math.floor(n) - 0.5) * 0.16);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    }
    default: throw new Error(`unknown kind ${kind}`);
  }
}

export function createKit(THREE, { seed = 1 } = {}) {
  const rnd = mulberry32(seed), batches = new Map(), meshes = new Map(), glowMaterials = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), color = new THREE.Color();

  function part(kind, { pos, scale = 1, rot = [0, 0, 0], color: hex }) {
    if (!KINDS.includes(kind)) throw new Error(`unknown kind ${kind}`);
    if (meshes.size) throw new Error('kit already built');
    const s = Array.isArray(scale) ? scale : [scale, scale, scale], j = 1 + (rnd() * 2 - 1) * JITTER;
    if (!batches.has(kind)) batches.set(kind, []);
    const list = batches.get(kind), entry = { kind, index: list.length, color: hex, pos, scale: s.map(x => x * j), rot };
    list.push(entry);
    return entry;
  }

  function build() {
    const group = new THREE.Group();
    for (const [kind, list] of batches) {
      const glow = GLOW_KINDS.has(kind);
      const material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, ...(glow ? { emissive: GLOW, emissiveIntensity: 0 } : {}) });
      if (glow) glowMaterials.push(material);
      const mesh = new THREE.InstancedMesh(makeGeometry(THREE, kind), material, list.length);
      mesh.castShadow = mesh.receiveShadow = true;
      for (const it of list) {
        q.setFromEuler(e.set(...it.rot));
        m4.compose(new THREE.Vector3(...it.pos), q, new THREE.Vector3(...it.scale));
        mesh.setMatrixAt(it.index, m4);
        mesh.setColorAt(it.index, color.setHex(it.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = `kit:${kind}`;
      meshes.set(kind, mesh);
      group.add(mesh);
    }
    return group;
  }

  function setColor(entry, hex) {
    entry.color = hex;
    const mesh = meshes.get(entry.kind);
    if (!mesh) return;
    mesh.setColorAt(entry.index, color.setHex(hex));
    mesh.instanceColor.needsUpdate = true;
  }

  return { part, build, setColor, count: kind => batches.get(kind)?.length ?? 0, glowMaterials };
}
