// 導演：把引擎吐出的事件一個一個演。每個事件先對焦、再交給演員、再等一段固定時間。
// 跳過時正在等的那一段立刻結束，剩下的事件瞬間套用；reduced-motion 時全部瞬間。
// 中止（RESET）時剩下的事件全部丟掉。
export const DURATIONS = { placed: 850, grow: 700, fx: 700, stall: 950, after: 600 };

export function createDirector({ wait = ms => new Promise(r => setTimeout(r, ms)), onFocus = () => {}, reducedMotion = false } = {}) {
  let busy = false, skipped = false, aborted = false, wake = () => {};

  async function run(events, onEvent) {
    try {
      for (const e of events) {
        if (aborted) break;
        const instant = reducedMotion || skipped;
        if (!instant) onFocus(e);
        await onEvent(e, { instant });
        if (!instant) await Promise.race([wait(DURATIONS[e.kind] ?? 600), new Promise(r => { wake = r; if (skipped) r(); })]);
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
