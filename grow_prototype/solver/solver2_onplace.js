// GROW-style puzzle — on-placement effect model
// 規格化核心：每個物品 = {max, effects[]}，effect = 放置該物品時對場上目標的加成（可帶條件）。
// 唯一解保證：每個物品需要的升級量 == 它可能得到的全部效果量，
//            因此全滿 ⇔ 所有效果都命中 ⇔ 「給予者晚於接受者」的約束全部成立。
//            若這些約束構成全序，解必唯一（仍以暴力搜尋驗證）。

const SPEC = {
  theme: "勇者討伐魔王",
  items: [
    { id: "village", name: "村莊",     max: 3, effects: [] },
    { id: "spring",  name: "精靈之泉", max: 2, effects: [
      { target: "village", amount: 1, require: { present: "village" }, story: "泉水灌溉，村莊繁榮" },
    ]},
    { id: "fairy",   name: "精靈",     max: 3, effects: [
      { target: "spring",  amount: 1, require: { present: "spring" },  story: "精靈淨化泉水" },
      { target: "village", amount: 1, require: { present: "village" }, story: "精靈祝福村莊" },
    ]},
    { id: "hero",    name: "勇者",     max: 4, effects: [
      { target: "fairy",   amount: 1, require: { present: "fairy" },   story: "勇者與精靈結為夥伴" },
    ]},
    { id: "forge",   name: "鐵匠鋪",   max: 2, effects: [
      { target: "hero",    amount: 1, require: { present: "hero" },    story: "鐵匠為勇者打造護甲" },
    ]},
    { id: "sword",   name: "聖劍",     max: 2, effects: [
      { target: "hero",    amount: 1, require: { present: "hero" },    story: "勇者拔起聖劍" },
      { target: "forge",   amount: 1, require: { present: "forge" },   story: "鍛造技藝臻至大成" },
    ]},
    { id: "magic",   name: "魔導書",   max: 2, effects: [
      { target: "sword",   amount: 1, require: { present: "sword" },   story: "聖劍獲得附魔" },
      { target: "hero",    amount: 1, require: { present: "hero" },    story: "勇者習得魔法" },
      { target: "fairy",   amount: 1, require: { present: "fairy" },   story: "精靈之力被記載於書中" },
    ]},
    { id: "castle",  name: "魔王城",   max: 3, effects: [
      { target: "magic",   amount: 1, require: { present: "magic" },   story: "面對魔王，魔導書共鳴覺醒" },
      { target: "castle",  amount: 1, require: { minLevel: ["hero", 4] },  story: "滿級勇者突入魔王城！" },
      { target: "castle",  amount: 1, require: { and: [{ minLevel: ["sword", 2] }, { minLevel: ["magic", 2] }] }, story: "聖劍與魔法合擊，魔王被擊敗！" },
    ]},
  ],
};

// ---- 共用引擎語意 ----
function condMet(cond, state) {
  if (!cond) return true;
  if (cond.present) return state[cond.present] != null;
  if (cond.minLevel) { const [t, n] = cond.minLevel; return state[t] != null && state[t] >= n; }
  if (cond.and) return cond.and.every(c => condMet(c, state));
  return false;
}
function itemById(id) { return SPEC.items.find(i => i.id === id); }

function simulate(order) {
  const state = {};
  const log = [];
  for (const placedId of order) {
    state[placedId] = 1;
    const fired = [];
    for (const ef of itemById(placedId).effects) {
      if (!condMet(ef.require, state)) continue;
      if (state[ef.target] == null) continue;
      const max = itemById(ef.target).max;
      if (state[ef.target] >= max) continue;
      state[ef.target] = Math.min(max, state[ef.target] + ef.amount);
      fired.push(`${ef.target}+${ef.amount}`);
    }
    log.push({ placed: placedId, fired, snapshot: { ...state } });
  }
  return { state, log };
}
const isAllMax = s => SPEC.items.every(i => s[i.id] === i.max);

function* permutations(arr) {
  if (arr.length <= 1) { yield arr; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

const ids = SPEC.items.map(i => i.id);
const solutions = [];
for (const perm of permutations(ids)) {
  if (isAllMax(simulate(perm).state)) solutions.push([...perm]);
}
console.log("解的數量:", solutions.length);
solutions.slice(0, 10).forEach(s => console.log(" ", s.join(" → ")));
if (solutions.length === 1) {
  console.log("\n唯一解過程:");
  simulate(solutions[0]).log.forEach((t, i) =>
    console.log(`T${i + 1} 放[${t.placed}] 效果:[${t.fired.join(",")}]`, JSON.stringify(t.snapshot)));
}
// 統計各種結局分布（給壞結局設計參考）
let dist = {};
for (const perm of permutations(ids)) {
  const st = simulate(perm).state;
  const maxed = SPEC.items.filter(i => st[i.id] === i.max).length;
  dist[maxed] = (dist[maxed] || 0) + 1;
}
console.log("\n全排列中滿級物品數分布:", dist);
