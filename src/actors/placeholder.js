// 佔位角色：每個物品一個圓角方塊，高度跟等級走，頭上掛「名稱 Lv」標籤。計畫 3 換成真正的演員。
import { RoundedBoxGeometry } from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';
import { anchorWorld } from './anchors.js';
import { levelLabel } from '../ui/format.js';

const COLORS = { milk: 0xfff8f4, chip: 0x58a6a6, bulb: 0xfcea8b, token: 0x5a88b2, typhoon: 0x9aa7b8, rat: 0x8a8070, boba: 0xc9a27c, baseball: 0xdb6a41 };
const heightOf = lv => 0.25 + 0.25 * lv;
const easeOutBack = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

export function createPlaceholderActors(THREE, { scene, spec }) {
  const actors = {}, geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  for (const id of spec.ORDER) {
    const p = anchorWorld(id), mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLORS[id], roughness: 0.78, metalness: 0 }));
    mesh.castShadow = mesh.receiveShadow = true; mesh.visible = false;
    const holder = new THREE.Group(); holder.position.set(p.x, p.y, p.z); holder.add(mesh); scene.add(holder);
    // 標籤文字放在自己的 span，氣泡另外掛在 el 上：更新等級時才不會把氣泡一起洗掉
    const el = document.createElement('div'); el.className = 'actor-label';
    const name = document.createElement('span'), lvText = document.createElement('b');
    name.textContent = spec.ITEMS[id].name; el.append(name, lvText);
    const label = new CSS2DObject(el); label.visible = false; holder.add(label);
    actors[id] = { mesh, holder, el, lvText, label, lv: 0, anim: null, name: spec.ITEMS[id].name, max: spec.ITEMS[id].max };
  }

  function setLevel(a, lv, instant) {
    const from = a.lv ? heightOf(a.lv) : 0.01; a.lv = lv;
    a.mesh.visible = a.label.visible = lv > 0;
    a.lvText.textContent = levelLabel(lv, a.max);
    if (instant || lv === 0) { a.anim = null; size(a, heightOf(lv)); return Promise.resolve(); }
    return new Promise(done => { a.anim = { kind: 'grow', t: 0, from, to: heightOf(lv), done }; });
  }
  function size(a, h) { a.mesh.scale.set(0.5, h, 0.5); a.mesh.position.y = h / 2; a.label.position.y = h + 0.15; }
  function bubble(a, text, instant) {
    if (instant || !text) return;
    const b = document.createElement('div'); b.className = 'actor-bubble'; b.textContent = text; a.el.append(b);
    setTimeout(() => b.remove(), 1200);
  }

  return {
    apply(e, { instant = false } = {}) {
      if (e.kind === 'stall') { const a = actors[e.item]; bubble(a, e.story, instant); if (!instant) return new Promise(done => { a.anim = { kind: 'wobble', t: 0, done }; }); return Promise.resolve(); }
      const id = e.delta ? e.delta.target : e.item, a = actors[id];
      bubble(a, e.story, instant);
      if (e.kind === 'placed') return setLevel(a, 1, instant);
      if (e.kind === 'grow') return setLevel(a, e.to, instant);
      if (e.delta) return setLevel(a, e.delta.to, instant);
      return Promise.resolve();
    },
    update(dt) {
      for (const a of Object.values(actors)) {
        if (!a.anim) continue;
        a.anim.t = Math.min(1, a.anim.t + dt / 0.6);
        if (a.anim.kind === 'grow') size(a, a.anim.from + (a.anim.to - a.anim.from) * easeOutBack(a.anim.t));
        else a.holder.rotation.z = Math.sin(a.anim.t * Math.PI * 4) * 0.12 * (1 - a.anim.t);
        if (a.anim.t >= 1) { const done = a.anim.done; if (a.anim.kind === 'grow') size(a, a.anim.to); a.anim = null; done(); }
      }
    },
    reset() { for (const a of Object.values(actors)) { a.anim?.done(); a.holder.rotation.z = 0; setLevel(a, 0, true); } },
    levelOf: id => actors[id].lv,
  };
}
