// 最小假 DOM：只夠 CSS2DObject 與舞台標籤用（從計畫 2 的佔位角色測試搬來）
export class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.className = ''; this._text = ''; this.parent = null; }
  setAttribute() {} addEventListener() {}
  append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  set textContent(v) { this._text = v; this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this._text = v.replace(/<[^>]+>/g, ''); this.children = []; }
  querySelector(sel) { const cls = sel.replace(/^\./, ''); const walk = e => e.children.find(c => c.className.split(' ').includes(cls)) ?? e.children.map(walk).find(Boolean); return walk(this) ?? null; }
}
export function installFakeDom() { globalThis.document = { createElement: tag => new El(tag) }; }
export const bubbles = el => { const out = []; const walk = e => { for (const c of e.children) { if (c.className === 'actor-bubble') out.push(c); walk(c); } }; walk(el); return out; };
