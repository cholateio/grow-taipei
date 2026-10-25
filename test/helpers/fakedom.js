// 最小假 DOM：只夠 CSS2DObject 與舞台標籤用（從計畫 2 的佔位角色測試搬來）
export class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.className = ''; this._text = ''; this.parent = null; }
  // CSS2DObject 被移除時會查 element.ownerDocument.defaultView.Element
  get ownerDocument() { return { defaultView: { Element: El } }; }
  setAttribute() {} addEventListener(type, fn) { (this.listeners ??= {})[type] = fn; }
  append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  set textContent(v) { this._text = v; this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  // innerHTML：文字留下、<button> 變成子元素（卡片測試要點按鈕）
  set innerHTML(v) {
    this._html = v;
    this._text = v.replace(/<button[^>]*>[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, '');
    this.children = [...v.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(m => { const b = new El('button'); b.className = /class="([^"]*)"/.exec(m[1])?.[1] ?? ''; b._text = m[2]; b.parent = this; return b; });
  }
  get classList() {
    const list = () => this.className.split(' ').filter(Boolean), set = cs => { this.className = cs.join(' '); };
    return {
      add: (...c) => set([...new Set([...list(), ...c])]), remove: (...c) => set(list().filter(x => !c.includes(x))),
      toggle: (c, on = !list().includes(c)) => (on ? set([...new Set([...list(), c])]) : set(list().filter(x => x !== c))),
      contains: c => list().includes(c),
    };
  }
  // 支援 'tag'、'.cls'、'tag.cls1.cls2'
  querySelector(sel) {
    const [tag, ...cls] = sel.split('.');
    const hit = e => (!tag || e.tagName === tag) && cls.every(c => e.className.split(' ').includes(c));
    const walk = e => e.children.find(hit) ?? e.children.map(walk).find(Boolean); return walk(this) ?? null;
  }
}
export function installFakeDom() { globalThis.document = { createElement: tag => new El(tag) }; }
