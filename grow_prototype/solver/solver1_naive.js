// GROW-style puzzle spec + brute-force solver
// 規格化重點：引擎固定，謎題全部由這份 spec（資料）定義。

const SPEC = {
  theme: "勇者討伐魔王",
  // 固定成長判定順序 = items 陣列順序
  items: [
    { id: "village", name: "村莊",   max: 4, grow: { always: true } },                 // 每回合建設
    { id: "hero",    name: "勇者",   max: 4, grow: { present: "village" } },           // 有村莊才能修行
    { id: "forge",   name: "鐵匠鋪", max: 3, grow: { minLevel: ["village", 2] } },     // 村莊夠大才有生意
    { id: "sword",   name: "聖劍",   max: 2, grow: { atMax: "forge" } },               // 鐵匠滿級才能鍛出
    { id: "magic",   name: "魔導書", max: 3, grow: { present: "fairy" } },             // 精靈教導魔法
    { id: "fairy",   name: "精靈",   max: 3, grow: { atMax: "spring" } },              // 泉水滿溢精靈現身
    { id: "spring",  name: "精靈之泉", max: 2, grow: { always: true } },               // 自然湧出
    { id: "castle",  name: "魔王城", max: 3, grow: { always: true } },                 // 魔王也在變強
  ],
};

// ---- 引擎（與遊戲端共用同一套語意）----
function condMet(cond, state) {
  if (cond.always) return true;
  if (cond.present) return state[cond.present] != null;
  if (cond.atMax) {
    const t = cond.atMax;
    const it = SPEC.items.find(i => i.id === t);
    return state[t] != null && state[t] >= it.max;
  }
  if (cond.minLevel) {
    const [t, n] = cond.minLevel;
    return state[t] != null && state[t] >= n;
  }
  return false;
}

function simulate(order) {
  const state = {}; // id -> level (null = 未放置)
  const log = [];
  for (const placedId of order) {
    state[placedId] = 1;
    const turnEvents = [];
    for (const item of SPEC.items) { // 依固定順序逐一判定（使用即時狀態）
      if (state[item.id] == null) continue;
      if (state[item.id] >= item.max) continue;
      if (condMet(item.grow, state)) {
        state[item.id]++;
        turnEvents.push(item.id);
      }
    }
    log.push({ placed: placedId, grew: turnEvents, snapshot: { ...state } });
  }
  return { state, log };
}

function isAllMax(state) {
  return SPEC.items.every(i => state[i.id] === i.max);
}

// ---- 暴力搜尋 8! = 40320 ----
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
  const { state } = simulate(perm);
  if (isAllMax(state)) solutions.push([...perm]);
}

console.log("解的數量:", solutions.length);
for (const s of solutions.slice(0, 20)) console.log(" ", s.join(" → "));

if (solutions.length === 1) {
  console.log("\n唯一解模擬過程:");
  const { log } = simulate(solutions[0]);
  log.forEach((t, i) =>
    console.log(`T${i + 1} 放[${t.placed}] 升級:[${t.grew.join(",")}]`,
      JSON.stringify(t.snapshot)));
}
