// ===== GROW v2：tick 雙軌引擎 + 求解器 / 難度測量儀 =====
// 語意（遊戲端共用）：
//   回合 t：放入 X（lv=1）
//   Phase A（放置反應）：X.fx 依序套用 {t,d,req}，delta 可為負，夾在 [1,max]
//   Phase B（全場 tick）：依 items 順序，逐一（即時狀態）：
//       若有 stall 規則命中 → 卡住（不成長）
//       否則 tick 條件成立且 lv<max → +1
// 條件：always / present / absent / minLevel[id,n] / maxLevel[id,n] / ltPlus[a,b,k](lv(a)<lv(b)+k) / and / or

const ITEMS = [
  { id:"stone",  name:"石頭", max:4, tick:{always:true} },
  { id:"drop",   name:"水滴", max:3, tick:{ltPlus:["drop","stone",0]} },
  { id:"seed",   name:"種子", max:4, tick:{and:[{present:"drop"},{ltPlus:["seed","drop",2]}]} },
  { id:"slime",  name:"黏液", max:3, tick:{present:"drop"} },
  { id:"gear",   name:"齒輪", max:4, tick:{minLevel:["stone",2]} },
  { id:"box",    name:"箱子", max:3, tick:{minLevel:["gear",2]} },
  { id:"ball",   name:"球",   max:3, tick:{minLevel:["gear",3]} },
  { id:"rope",   name:"繩子", max:3, tick:{and:[{minLevel:["seed",3]},{present:"box"}]} },
  { id:"horn",   name:"喇叭", max:2, tick:{minLevel:["box",3]} },
  { id:"magnet", name:"磁鐵", max:2, tick:{and:[{minLevel:["gear",4]},{minLevel:["ball",3]}]} },
];
const FX = { // 放置反應
  drop:   [ {t:"slime", d:+1, req:{present:"slime"}, story:"水花濺起，黏液咕嚕咕嚕地喝了起來！"} ],
  horn:   [ {t:"ball",  d:-9, req:{present:"ball"},  story:"喇叭巨響——球嚇得縮回了原形！"},
            {t:"seed",  d:+1, req:{present:"seed"},  story:"音樂催芽，種子聽得很開心。"} ],
  magnet: [],
};
const STALL = [ // 干擾：條件成立時 target 本回合不成長
  { target:"gear", when:{and:[{present:"slime"},{maxLevel:["slime",1]}]}, story:"齒輪被黏液黏住了…" },
];
const N = ITEMS.length;
const IDX = Object.fromEntries(ITEMS.map((it,i)=>[it.id,i]));
const MAX = ITEMS.map(it=>it.max);

// ---- 條件編譯為函式（state: Int8Array, 0=未放置, 否則等級） ----
function compile(c){
  if(!c) return ()=>true;
  if(c.always) return ()=>true;
  if(c.present){ const i=IDX[c.present]; return s=>s[i]>0 }
  if(c.absent){ const i=IDX[c.absent]; return s=>s[i]===0 }
  if(c.minLevel){ const [t,n]=c.minLevel, i=IDX[t]; return s=>s[i]>=n }
  if(c.maxLevel){ const [t,n]=c.maxLevel, i=IDX[t]; return s=>s[i]>0 && s[i]<=n }
  if(c.ltPlus){ const [a,b,k]=c.ltPlus, ia=IDX[a], ib=IDX[b]; return s=>s[ia]<s[ib]+k }
  if(c.and){ const fs=c.and.map(compile); return s=>fs.every(f=>f(s)) }
  if(c.or){ const fs=c.or.map(compile); return s=>fs.some(f=>f(s)) }
  throw new Error("bad cond "+JSON.stringify(c));
}
const TICK = ITEMS.map(it=>compile(it.tick));
const STALLC = STALL.map(r=>({ti:IDX[r.target], f:compile(r.when)}));
const FXC = ITEMS.map(it=>(FX[it.id]||[]).map(e=>({ti:IDX[e.t], d:e.d, f:compile(e.req)})));

function stepInPlace(s, pi){ // 放入 index pi 並走完一回合
  s[pi]=1;
  for(const e of FXC[pi]){
    if(s[e.ti]>0 && e.f(s)) s[e.ti]=Math.max(1,Math.min(MAX[e.ti], s[e.ti]+e.d));
  }
  for(let i=0;i<N;i++){
    if(s[i]===0||s[i]>=MAX[i]) continue;
    let st=false;
    for(const r of STALLC) if(r.ti===i && r.f(s)){st=true;break}
    if(!st && TICK[i](s)) s[i]++;
  }
}
function simulate(order){ const s=new Int8Array(N); for(const pi of order) stepInPlace(s,pi); return s }
const maxedCount = s=>{let c=0;for(let i=0;i<N;i++) if(s[i]===MAX[i])c++;return c};

// ---- 正解數：DFS + 可達性剪枝 ----
// 樂觀上界：lv + 剩餘回合（每回合都 tick 成功）+ 未放置者的正向 fx 潛力
const FX_POT = new Int32Array(N); // potential positive on-place delta toward each target, per giver
const FX_GIVE = ITEMS.map((it,gi)=>(FX[it.id]||[]).filter(e=>e.d>0).map(e=>({ti:IDX[e.t],d:e.d})));
let SOLUTIONS=[];
function dfs(s, placedMask, t, order){
  if(t===N){ if(maxedCount(s)===N) SOLUTIONS.push([...order]); return }
  const remaining=N-t;
  // 剪枝：每個物品的樂觀上界
  const pot=new Int32Array(N);
  for(let g=0; g<N; g++) if(!(placedMask>>g&1)) for(const e of FX_GIVE[g]) pot[e.ti]+=e.d;
  for(let i=0;i<N;i++){
    const lv = s[i]===0 ? 1 : s[i];
    const chances = s[i]===0 ? remaining : remaining; // 未放置者最快下一手放入，當回合即可 tick
    if(lv + chances + pot[i] < MAX[i]) return;
  }
  for(let p=0;p<N;p++){
    if(placedMask>>p&1) continue;
    const s2=new Int8Array(s); stepInPlace(s2,p);
    order.push(p); dfs(s2, placedMask|1<<p, t+1, order); order.pop();
  }
}

// ---- 全排列難度統計（Heap's algorithm，計分分布） ----
function fullStats(){
  const idx=[...Array(N).keys()];
  const dist=new Array(N+1).fill(0);
  let best=[], total=0;
  const c=new Array(N).fill(0);
  const t0=Date.now();
  const count=arr=>{ const m=maxedCount(simulate(arr)); dist[m]++; total++; if(m===N) best.push([...arr]) };
  count(idx);
  let i=0;
  while(i<N){
    if(c[i]<i){
      if(i%2===0){[idx[0],idx[i]]=[idx[i],idx[0]]}else{[idx[c[i]],idx[i]]=[idx[i],idx[c[i]]]}
      count(idx); c[i]++; i=0;
    } else { c[i]=0; i++ }
  }
  return {dist,best,total,ms:Date.now()-t0};
}

// ---- 執行 ----
const intended = ["stone","drop","seed","slime","gear","box","horn","ball","rope","magnet"].map(id=>IDX[id]);
{
  const s=new Int8Array(N);
  console.log("預定解逐回合：");
  intended.forEach((pi,t)=>{ stepInPlace(s,pi);
    console.log(` T${t+1} 放[${ITEMS[pi].id}]`, ITEMS.map((it,i)=>`${it.id}:${s[i]}`).join(" "));
  });
  console.log("預定解滿級數:", maxedCount(s), "/", N);
}
SOLUTIONS=[];
dfs(new Int8Array(N), 0, 0, []);
console.log("\nDFS 正解數:", SOLUTIONS.length);
SOLUTIONS.slice(0,8).forEach(o=>console.log("  "+o.map(i=>ITEMS[i].id).join("→")));

const st=fullStats();
console.log("\n全排列", st.total, "耗時", st.ms+"ms");
console.log("滿級數分布:", st.dist.map((v,k)=>k+":"+v).join("  "));
console.log("≥8/10 的排列:", st.dist[8]+st.dist[9]+st.dist[10], " ≥9/10:", st.dist[9]+st.dist[10]);
