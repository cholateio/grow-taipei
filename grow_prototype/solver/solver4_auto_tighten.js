// ===== v2 自動收緊器：從鬆規則出發，貪婪加入窗口/干擾條款直到唯一解 =====
const BASE_ITEMS = [
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
const FX = {
  drop:   [ {t:"slime", d:+1, req:{present:"slime"}} ],
  horn:   [ {t:"ball",  d:-9, req:{present:"ball"}} ],
};
const N = BASE_ITEMS.length;
const IDX = Object.fromEntries(BASE_ITEMS.map((it,i)=>[it.id,i]));
const MAX = BASE_ITEMS.map(it=>it.max);
const IDS = BASE_ITEMS.map(it=>it.id);

function compile(c){
  if(!c) return ()=>true;
  if(c.always) return ()=>true;
  if(c.present){ const i=IDX[c.present]; return s=>s[i]>0 }
  if(c.absent){ const i=IDX[c.absent]; return s=>s[i]===0 }
  if(c.minLevel){ const [t,n]=c.minLevel, i=IDX[t]; return s=>s[i]>=n }
  if(c.maxLevel){ const [t,n]=c.maxLevel, i=IDX[t]; return s=>s[i]<=n } // 絕對上限（未放置=0 也算 ≤n）
  if(c.ltPlus){ const [a,b,k]=c.ltPlus, ia=IDX[a], ib=IDX[b]; return s=>s[ia]<s[ib]+k }
  if(c.and){ const fs=c.and.map(x=>compile(x)); return s=>{for(const f of fs) if(!f(s)) return false; return true} }
  throw new Error("bad cond "+JSON.stringify(c));
}

// extraClauses[i] = 額外 and 進第 i 項 tick 的條款陣列；extraStalls = [{ti, cond}]
function buildEngine(extraClauses, extraStalls){
  const tick = BASE_ITEMS.map((it,i)=>{
    const base=compile(it.tick);
    const extras=(extraClauses[i]||[]).map(compile);
    return s=>{ if(!base(s)) return false; for(const f of extras) if(!f(s)) return false; return true };
  });
  const stalls = [{ti:IDX.gear, f:compile({and:[{present:"slime"},{minLevel:["slime",1]},{maxLevel:["slime",1]}]})}]
    .concat(extraStalls.map(r=>({ti:r.ti, f:compile(r.cond)})));
  const fxc = BASE_ITEMS.map(it=>(FX[it.id]||[]).map(e=>({ti:IDX[e.t], d:e.d, f:compile(e.req)})));
  function step(s,pi){
    s[pi]=1;
    for(const e of fxc[pi]) if(s[e.ti]>0&&e.f(s)) s[e.ti]=Math.max(1,Math.min(MAX[e.ti],s[e.ti]+e.d));
    for(let i=0;i<N;i++){
      if(s[i]===0||s[i]>=MAX[i]) continue;
      let st=false; for(const r of stalls) if(r.ti===i&&r.f(s)){st=true;break}
      if(!st&&tick[i](s)) s[i]++;
    }
  }
  return step;
}
const maxedCount=s=>{let c=0;for(let i=0;i<N;i++) if(s[i]===MAX[i])c++;return c};

// DFS 解數（cap：數到 cap 就提前回傳）
function countSolutions(step, cap=Infinity, collect=null){
  let found=0;
  const fxPos = BASE_ITEMS.map(it=>(FX[it.id]||[]).filter(e=>e.d>0).map(e=>({ti:IDX[e.t],d:e.d})));
  function dfs(s,mask,t,order){
    if(found>=cap) return;
    if(t===N){ if(maxedCount(s)===N){found++; if(collect) collect.push(order.map(i=>IDS[i]))} return }
    const remaining=N-t;
    const pot=new Int32Array(N);
    for(let g=0;g<N;g++) if(!(mask>>g&1)) for(const e of fxPos[g]) pot[e.ti]+=e.d;
    for(let i=0;i<N;i++){
      const lv=s[i]===0?1:s[i];
      if(lv+remaining+pot[i]<MAX[i]) return;
    }
    for(let p=0;p<N;p++){
      if(mask>>p&1) continue;
      const s2=new Int8Array(s); step(s2,p);
      order.push(p); dfs(s2,mask|1<<p,t+1,order); order.pop();
      if(found>=cap) return;
    }
  }
  dfs(new Int8Array(N),0,0,[]);
  return found;
}

// ---- 貪婪收緊 ----
// 候選條款：對項 i 加 {maxLevel:[ref,n]}（ref 超過 n 後窗口永久關閉）或 {absent:ref}（ref 一放置就關閉）
function* candidateMods(){
  for(let i=0;i<N;i++){
    for(let r=0;r<N;r++){
      if(r===i) continue;
      yield {kind:"clause", i, c:{absent:IDS[r]}, label:`${IDS[i]} 只在 ${IDS[r]} 出現前成長`};
      for(let n=1;n<MAX[r];n++)
        yield {kind:"clause", i, c:{maxLevel:[IDS[r],n]}, label:`${IDS[i]} 只在 ${IDS[r]}≤${n} 時成長`};
    }
  }
}
function tighten(){
  let clauses=Array.from({length:N},()=>[]), stalls=[];
  const CAP_EVAL=1500, CAP_REPORT=500000;
  let step=buildEngine(clauses,stalls);
  let count=countSolutions(step, CAP_EVAL);
  console.log("初始解數:", count>=CAP_EVAL?`≥${CAP_EVAL}`:count);
  for(let round=1; round<=14 && count>1; round++){
    let best=null;
    const mods=[...candidateMods()];
    for(const m of mods){
      clauses[m.i].push(m.c);
      let c;
      try{ c=countSolutions(buildEngine(clauses,stalls), CAP_EVAL) }
      catch(e){ console.log("候選失敗:", m.label, e.message); c=0 }
      clauses[m.i].pop();
      if(c>=1 && (best===null || c<best.n)) best={i:m.i, c:m.c, label:m.label, n:c};
      if(best && best.n===1) break;
    }
    if(!best) { console.log("無可用條款"); break }
    clauses[best.i].push(best.c);
    step=buildEngine(clauses,stalls);
    count=countSolutions(step, CAP_EVAL);
    console.log(`round ${round}: +「${best.label}」→ 解數 ${count>=CAP_EVAL?`≥${CAP_EVAL}`:count}`);
  }
  if(count===1) count=countSolutions(step, CAP_REPORT); // 無上限確認
  return {clauses, stalls, step, count};
}

const t0=Date.now();
const R=tighten();
console.log("收緊完成，耗時", ((Date.now()-t0)/1000).toFixed(1)+"s");
if(R.count===1){
  const sols=[]; countSolutions(R.step, 2, sols);
  console.log("唯一解:", sols[0].join(" → "));
  // 逐回合
  const s=new Int8Array(N);
  sols[0].forEach((id,t)=>{ R.step(s,IDX[id]);
    console.log(` T${t+1} 放[${id}]`, IDS.map((d,i)=>`${d}:${s[i]}`).join(" ")); });
  // 難度統計（全排列）
  const idx=[...Array(N).keys()], dist=new Array(N+1).fill(0), c=new Array(N).fill(0);
  const firstMoveBest=new Array(N).fill(0);
  const count=arr=>{ const st=new Int8Array(N); for(const pi of arr) R.step(st,pi);
    const m=maxedCount(st); dist[m]++; if(m>firstMoveBest[arr[0]]) firstMoveBest[arr[0]]=m };
  count(idx); let i=0;
  while(i<N){ if(c[i]<i){ if(i%2===0){[idx[0],idx[i]]=[idx[i],idx[0]]}else{[idx[c[i]],idx[i]]=[idx[i],idx[c[i]]]}
      count(idx); c[i]++; i=0 } else { c[i]=0; i++ } }
  console.log("滿級數分布:", dist.map((v,k)=>k+":"+v).join("  "));
  console.log("≥8:", dist[8]+dist[9]+dist[10], " ≥9:", dist[9]+dist[10]);
  console.log("各首手可達最佳滿級數:", IDS.map((d,i)=>`${d}:${firstMoveBest[i]}`).join(" "));
  console.log("\n最終附加條款:");
  R.clauses.forEach((cs,i)=>{ if(cs.length) console.log(" ", IDS[i], JSON.stringify(cs)) });
}
