import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';

// 最小假 DOM：只夠 CSS2DObject 與佔位角色用
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.className = ''; this._text = ''; this.parent = null; }
  setAttribute() {} addEventListener() {}
  append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  set textContent(v) { this._text = v; this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this._text = v.replace(/<[^>]+>/g, ''); this.children = []; }
  querySelector(sel) { const cls = sel.replace(/^\./, ''); const walk = e => e.children.find(c => c.className.split(' ').includes(cls)) ?? e.children.map(walk).find(Boolean); return walk(this) ?? null; }
}
globalThis.document = { createElement: tag => new El(tag) };
const { createPlaceholderActors } = await import('../src/actors/placeholder.js');
const bubbles = el => { const out = []; const walk = e => { for (const c of e.children) { if (c.className === 'actor-bubble') out.push(c); walk(c); } }; walk(el); return out; };

test('a story bubble survives the level update of the same event (review #2)', () => {
  const scene = new THREE.Scene(), actors = createPlaceholderActors(THREE, { scene, spec });
  actors.apply({ kind: 'placed', item: 'bulb', to: 1, story: '路邊亮起第一盞燈' }, { instant: false });
  const label = scene.children.find(h => h.children.some(c => c.isCSS2DObject)).children.find(c => c.isCSS2DObject).element;
  actors.apply({ kind: 'grow', item: 'bulb', from: 1, to: 2, story: '整條路都亮了' }, { instant: false });
  const bs = bubbles(scene.children.flatMap(h => h.children).find(c => c.isCSS2DObject && c.element.textContent.includes('燈泡')).element);
  assert.ok(bs.some(b => b.textContent === '整條路都亮了'), 'grow bubble still in the DOM');
  assert.ok(label);
});
test('delta events bubble on the target actor and update its level text', () => {
  const scene = new THREE.Scene(), actors = createPlaceholderActors(THREE, { scene, spec });
  actors.apply({ kind: 'placed', item: 'boba', to: 1 }, { instant: true });
  actors.apply({ kind: 'fx', item: 'boba', cause: 'typhoon', delta: { target: 'boba', from: 1, to: 2 }, story: '颱風天珍奶外送爆單' }, { instant: false });
  const el = scene.children.flatMap(h => h.children).find(c => c.isCSS2DObject && c.element.textContent.includes('珍奶')).element;
  assert.ok(bubbles(el).some(b => b.textContent === '颱風天珍奶外送爆單'));
  assert.match(el.textContent, /Lv\.2/); assert.equal(actors.levelOf('boba'), 2);
});
