// 導演：把引擎吐出的事件一個一個演。每個事件先演完，再停一段固定時間才換下一個（使用者 2026-10-25：一次只升一個、之間要有間隔）；
// 演員回 false（畫面上沒變）就不停。
// 跳過時正在等的那一段立刻結束，剩下的事件瞬間套用；reduced-motion 時全部瞬間。
// 中止（RESET）時剩下的事件全部丟掉。
// 演完之後的間隔；settle 是回合最後 101 跳階（計畫 3.6）；wait 事件畫面上不演
export const DURATIONS = { placed: 800, grow: 800, fx: 800, stall: 800, after: 700, settle: 800, wait: 0 };

export function createDirector({ wait = ms => new Promise(r => setTimeout(r, ms)), onFocus = () => {}, reducedMotion = false } = {}) {
  let busy = false, skipped = false, aborted = false, wake = () => {};

  async function run(events, onEvent) {
    try {
      for (const e of events) {
        if (aborted) break;
        const instant = reducedMotion || skipped;
        if (!instant) onFocus(e);
        // opts.instant 是活的：事件演到一半（例如物品還在飛）按跳過，接下來的步驟立刻套用
        const shown = await onEvent(e, { get instant() { return reducedMotion || skipped; } });
        if (!reducedMotion && !skipped && shown !== false && DURATIONS[e.kind] !== 0) await Promise.race([wait(DURATIONS[e.kind] ?? 600), new Promise(r => { wake = r; if (skipped) r(); })]);
      }
    } finally { busy = false; aborted = false; wake = () => {}; }
  }

  return {
    get busy() { return busy; },
    // 不是 async：忙碌中再呼叫要同步丟錯，呼叫端才擋得住連點
    play(events, onEvent) {
      if (busy) throw new Error('director busy');
      busy = true; skipped = false;
      return run(events, onEvent);
    },
    skip() { if (busy) { skipped = true; wake(); } },
    abort() { if (busy) { aborted = skipped = true; wake(); } },
    setReducedMotion(flag) { reducedMotion = flag; },
  };
}
