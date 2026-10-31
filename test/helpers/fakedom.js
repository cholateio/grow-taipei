// 最小假 DOM：只夠 CSS2DObject 與舞台標籤用（從計畫 2 的佔位角色測試搬來）
export class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.className = ''; this._text = ''; this.parent = null; }
  // CSS2DObject 被移除時會查 element.ownerDocument.defaultView.Element
  get ownerDocument() { return { defaultView: { Element: El } }; }
  // hidden：記下寫了幾次（setSkippable 連續同值不該碰 DOM）
  get hidden() { return this._hidden ?? false; } set hidden(v) { this._hidden = v; this.hiddenWrites = (this.hiddenWrites ?? 0) + 1; }
  setAttribute() {} addEventListener(type, fn) { (this.listeners ??= {})[type] = fn; }
  append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  set textContent(v) { this._text = v; this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  // innerHTML：文字留下、<button> 變成子元素（卡片測試要點按鈕）
  set innerHTML(v) {
    this._html = v;
    this._text = v.replace(/<button[^>]*>[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, '');
    // 按鈕的 data-* 進 dataset、hidden 屬性進 hidden（頂欄的跳過鍵預設藏著）
    this.children = [...v.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(m => {
      const b = new El('button'); b.className = /class="([^"]*)"/.exec(m[1])?.[1] ?? ''; b._text = m[2]; b.parent = this;
      for (const [, k, val] of m[1].matchAll(/data-([\w-]+)="([^"]*)"/g)) b.dataset[k] = val;
      if (/(^|\s)hidden(\s|=|$)/.test(m[1])) b.hidden = true;
      return b;
    });
  }
  get classList() {
    const list = () => this.className.split(' ').filter(Boolean), set = cs => { this.className = cs.join(' '); };
    return {
      add: (...c) => set([...new Set([...list(), ...c])]), remove: (...c) => set(list().filter(x => !c.includes(x))),
      toggle: (c, on = !list().includes(c)) => (on ? set([...new Set([...list(), c])]) : set(list().filter(x => x !== c))),
      contains: c => list().includes(c),
    };
  }
  // 支援 'tag'、'.cls'、'tag.cls1.cls2'、尾巴一個 '[data-k=v]'（'[data-act=reset]'、'button[data-act=skip]'）
  querySelector(sel) {
    const attr = /\[data-([\w-]+)=["']?([^"'\]]*)["']?\]$/.exec(sel);
    const [tag, ...cls] = (attr ? sel.slice(0, attr.index) : sel).split('.');
    const hit = e => (!tag || e.tagName === tag) && cls.every(c => e.className.split(' ').includes(c)) && (!attr || e.dataset[attr[1]] === attr[2]);
    const walk = e => e.children.find(hit) ?? e.children.map(walk).find(Boolean); return walk(this) ?? null;
  }
}
export function installFakeDom() { globalThis.document = { createElement: tag => new El(tag) }; }
