// 條件語言：把 spec 裡的條件物件編譯成 (state) => boolean。
// state 形狀：{ lv: {id: n}, age: {id: n|-1}, held: {id: n|-1}, flags: {}, locked: {id: bool} }，0 = 未放置。
export function compile(cond, ctx) {
  if (!cond || typeof cond !== 'object') throw new Error('bad cond ' + JSON.stringify(cond));
  if (cond.always) return () => true;
  if ('present' in cond) { const id = cond.present; return s => s.lv[id] > 0; }
  if ('absent' in cond) { const id = cond.absent; return s => s.lv[id] === 0; }
  if (cond.minLevel) { const [id, n] = cond.minLevel; return s => s.lv[id] >= n; }
  if (cond.maxLevel) { const [id, n] = cond.maxLevel; return s => s.lv[id] <= n; } // 絕對語意：未放置的 0 也算
  if (cond.ltPlus) { const [a, b, k] = cond.ltPlus; return s => s.lv[a] < s.lv[b] + k; }
  if (cond.age) { const [id, n] = cond.age; return s => s.lv[id] > 0 && s.age[id] >= n; }
  if ('flag' in cond) { const name = cond.flag; if ('is' in cond) { const v = cond.is; return s => s.flags[name] === v; } return s => !!s.flags[name]; }
  if ('locked' in cond) { const id = cond.locked; return s => !!s.locked[id]; }
  if (cond.and) { const fs = cond.and.map(c => compile(c, ctx)); return s => fs.every(f => f(s)); }
  if (cond.or) { const fs = cond.or.map(c => compile(c, ctx)); return s => fs.some(f => f(s)); }
  if (cond.not) { const f = compile(cond.not, ctx); return s => !f(s); }
  throw new Error('bad cond ' + JSON.stringify(cond));
}
