// 時間軸：把一串拍（beat）照順序演，由繪製迴圈每幀呼叫 update(dt) 推進（取代 director.js 的 Promise 等待）。
// 不靠計時器，所以 Node 可以無頭模擬整局（pace 工具就是這樣量回合長度）。
// 拍 = { kind, dur, start?(ctx), step?(k, dt, ctx), end?(ctx), estimate? }；dur 是數字或 ctx => 數字，start 之後才算。
// start 回 false 或 dur ≤ 0 → 這拍沒東西演，直接 end、不佔時間，同一幀接著處理下一拍。
// 跳過：正在演的拍 end，剩下的每拍 start → end（不 step）；reduced-motion 時 play 整串都這樣同步跑完。
// 中止（RESET）：正在演的拍 end，剩下的丟掉。不管哪種結束，play 的 Promise 一定有結果，不留懸掛：
// 演完、跳過、中止 → resolve；某一拍丟錯 → 收掉正在演的拍、reject，update／skip／abort 也把錯往外丟。

const resolveDur = (beat, ctx) => {
  const d = typeof beat.dur === 'function' ? beat.dur(ctx) : beat.dur;
  return d > 0 ? d : 0;
};

export function createTimeline({ reducedMotion = false } = {}) {
  let queue = [], ctx = null, current = null, busy = false, elapsed = 0, settle = () => {};

  // 拉下一個要佔時間的拍；沒東西演的拍就地 start → end。
  // start 期間 current 就先指著它：start 丟錯時 fail 才收得到它；start 自己跳過／中止這條時間軸也一樣
  function next() {
    while (queue.length) {
      const beat = queue.shift();
      current = { beat, t: 0, dur: 0 };
      const shown = beat.start?.(ctx);
      if (!busy) return;
      const dur = shown === false ? 0 : resolveDur(beat, ctx);
      if (dur > 0) { current.dur = dur; return; }
      current = null;
      beat.end?.(ctx);
      if (!busy) return;
    }
    current = null;
  }

  function finish(err) {
    const s = settle;
    queue = []; current = null; busy = false; settle = () => {};
    s(err);
  }

  // 某一拍丟錯：收掉正在演的拍、丟掉剩下的、play 的 Promise reject，時間軸回到閒置可以再用（不留懸掛）
  function fail(err) {
    if (!busy) return;
    const c = current; current = null;
    try { c?.beat.end?.(ctx); } catch { /* 原本的錯比較重要 */ }
    finish(err);
  }

  const guarded = fn => (...args) => {
    try { return fn(...args); } catch (err) { fail(err); throw err; }
  };

  // 推進正在演的拍；演完就 end、拉下一拍，新拍只 step(0, 0)，剩下的 dt 丟掉（不滾到下一拍）
  function advance(dt) {
    const c = current;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    c.beat.step?.(k, dt, ctx);
    if (current !== c || k < 1) return;
    // 先清掉 current 再 end：end 或下一拍的 start 丟錯時，不會再演一次已經結束的拍
    current = null;
    c.beat.end?.(ctx);
    if (!busy) return;
    next();
    if (!busy) return;
    if (current) current.beat.step?.(0, 0, ctx);
    else finish();
  }

  // 跳過：正在演的拍 end，剩下的每拍 start → end（不 step）
  const skip = guarded(() => {
    if (!busy) return;
    const c = current; current = null;
    c?.beat.end?.(ctx);
    while (busy && queue.length) {
      const beat = queue.shift();
      current = { beat, t: 0, dur: 0 };
      beat.start?.(ctx);
      if (!busy) return;
      current = null;
      beat.end?.(ctx);
    }
    if (busy) finish();
  });

  return {
    get busy() { return busy; },
    get elapsed() { return elapsed; },
    get currentDur() { return current ? current.dur : 0; },
    get currentKind() { return current ? current.beat.kind : null; },
    // 不是 async：忙碌中再呼叫要同步丟錯，呼叫端才擋得住連點
    play(beats, playCtx) {
      if (busy) throw new Error('timeline busy');
      elapsed = 0;
      queue = [...beats]; ctx = playCtx; current = null; busy = true;
      const done = new Promise((resolve, reject) => { settle = err => (err === undefined ? resolve() : reject(err)); });
      // reduced-motion：當場全部 start → end；丟錯就交給 Promise（skip 已經 reject 了），不再同步丟
      if (reducedMotion) { try { skip(); } catch { /* 已經 reject */ } }
      return done;
    },
    update: guarded(dt => {
      if (!busy) return;
      elapsed += dt;
      if (!current) next();
      if (!busy) return;
      if (current) advance(dt);
      else finish();
    }),
    skip,
    abort: guarded(() => {
      if (!busy) return;
      const c = current; current = null;
      c?.beat.end?.(ctx);
      if (busy) finish();
    }),
    // reduced-motion 一律立刻到最終狀態：演到一半打開也一樣（app 會即時切換）
    setReducedMotion(flag) { reducedMotion = flag; if (flag) skip(); },
  };
}

// 同時演好幾拍：長度取子拍最長的（函數 dur 在 start 時各自算），每個子拍用自己的 k 推進，到 1 就 end；
// 被跳過時 end 會把還沒演完的子拍收掉。
export function together(beats) {
  let live = [], dur = 0;
  return {
    kind: 'together',
    dur: () => dur,
    start(ctx) {
      live = []; dur = 0;
      for (const beat of beats) {
        const shown = beat.start?.(ctx);
        const d = shown === false ? 0 : resolveDur(beat, ctx);
        if (d > 0) { live.push({ beat, dur: d }); dur = Math.max(dur, d); } else beat.end?.(ctx);
      }
    },
    step(k, dt, ctx) {
      // 用 k × dur 換回經過的秒數：k 到 1 時最長的子拍剛好也到 1，不怕浮點累加差一點
      const t = k * dur;
      for (const sub of [...live]) {
        const sk = Math.min(1, t / sub.dur);
        sub.beat.step?.(sk, dt, ctx);
        if (sk >= 1) { live.splice(live.indexOf(sub), 1); sub.beat.end?.(ctx); }
      }
    },
    end(ctx) {
      for (const sub of live) sub.beat.end?.(ctx);
      live = [];
    },
  };
}
