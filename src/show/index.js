// 演出層入口：把走路格、白光、泡泡、名冊、舞台、時間軸接起來，給遊戲一個 show.turn(events) 演一整回合。
// 每幀 update(dt, t) 推進；跳過、reduced-motion、RESET 一律立刻到最終狀態（§4.3）：
//   舞台全部 commit、名冊每個人瞬間到家、白光與泡泡收掉、鏡頭回全景、全島效果貼齊。
import { createNav } from './nav.js';
import { createFlash } from './flash.js';
import { createBubbles } from './bubbles.js';
import { createRoster } from './roster.js';
import { createTimeline } from './timeline.js';
import { buildTurn } from './turn.js';
import { B } from './beats.js';
import { createStage } from '../actors/stage.js';
import { worldEffects } from '../actors/world.js';

// rnd：走路格散步點、名冊停頓用的亂數（測試與 tools/pace.mjs 傳固定種子，秒數每次一樣）
export function createShow(THREE, { scene, spec, modules, ctx: parts, rig, world, reducedMotion = false, rnd = Math.random }) {
  const { people, assets, glow, weather, rail } = parts;
  const nav = createNav({ rnd });
  const labels = new THREE.Group(); labels.name = 'show:labels'; scene.add(labels);
  const flash = createFlash(THREE, { group: labels }), bubbles = createBubbles(THREE, { group: labels });
  // 名冊先建：模型成員的天線／眼睛要用舞台的零件工廠，等舞台建好才用得到（載入模型是非同步的，那時舞台早就在了）
  let stage = null;
  const roster = createRoster(THREE, { people, assets, build: s => stage.build(s), nav, flash, rail, rnd });
  scene.add(roster.group);
  stage = createStage(THREE, { scene, spec, modules, ctx: { people, assets, glow, weather, rail }, roster });

  // 鏡頭：拍會平移；記住這回合有沒有離開全景，reduced-motion 回合結束才知道要不要拉回來
  let panned = false;
  const camRig = {
    panTo(t, ms) { panned = true; rig.panTo(t, ms); },
    home(ms) { panned = false; rig.home(ms); },
  };
  const ctx = { stage, roster, nav, bubbles, flash, rig: camRig, rail, world, spec, montage: false, instant: false, now: 0, B };
  const timeline = createTimeline({ reducedMotion });
  let reduced = reducedMotion, playing = null;   // playing：這回合的記號；跳過／中止／RESET 後設成 null，回合結束就不再補做

  function refresh() { nav.setFootprints(stage.footprints()); }
  // 開局：舞台建好時島民已經先生出來了（那時走路格還不知道建築在哪，可能站進 101 工地裡）——
  // 先讓走路格認得建築，再讓每個人瞬間回家重挑位置；開局不用白光揭露，直接站在島上
  refresh(); roster.snap(); flash.clear();
  // 立刻到最終狀態（跳過、reduced-motion 回合結束、中止）
  function snap({ home = true } = {}) {
    stage.commitAll(); roster.showAll(); roster.snap(); flash.clear(); bubbles.clear();
    if (home) camRig.home(0);
    refresh();
    world(worldEffects(stage.lv, stage.flags, stage.meta), true);
  }

  function turn(events, { montage = false, onMark } = {}) {
    if (timeline.busy) throw new Error('show busy');
    ctx.instant = reduced; ctx.onMark = onMark ?? null; panned = false;
    roster.showAll();   // 上一回合躲進門裡的人（颱風登陸）這回合回到街上
    refresh();
    const beats = buildTurn(events, { modules, spec, lv: stage.lv, flags: stage.flags, meta: stage.meta, montage }, ctx);
    const me = playing = {};
    const done = timeline.play(beats, ctx);
    const end = () => {
      if (playing !== me) return;   // 已經跳過／中止／RESET：那邊已經收好了
      playing = null;
      if (ctx.instant) { snap({ home: panned }); return; }   // reduced-motion：瞬間演完；鏡頭只在拍移動過時才拉回
      // 照常演完：把還沒 commit 的換上、hold 住的名冊套用、走路格跟著新零件
      stage.commitAll(); roster.syncAll(); refresh();
    };
    return done.then(end, err => { end(); throw err; });
  }

  function skip() {
    if (!timeline.busy) return;
    ctx.instant = true;   // 鏡頭、全島效果的拍讀它：剩下的拍 start → end 都瞬間
    playing = null;
    // 某一拍的 end 丟錯也要收到最終狀態（錯照樣往外丟，回合的 Promise 也會 reject）
    try { timeline.skip(); } finally { snap(); }
  }
  function abort() {
    const was = timeline.busy;
    playing = null;
    try { timeline.abort(); } finally { if (was) snap(); }
  }

  return {
    turn, skip, abort,
    reset() {
      try { abort(); } finally {
        stage.reset();   // 舞台 reset 也清掉名冊
        flash.clear(); bubbles.clear(); camRig.home(0); refresh();
      }
    },
    update(dt, t) {
      ctx.now = t;
      flash.update(dt);   // 先推白光：這一幀才叫出來的白光不會當幀就前進
      timeline.update(dt);
      roster.update(dt, t);
      bubbles.update(dt);
      stage.update(dt, t);
    },
    setReducedMotion(flag) {
      reduced = flag;
      if (flag) skip();
      timeline.setReducedMotion(flag);
    },
    get busy() { return timeline.busy; },
    get elapsed() { return timeline.elapsed; },
    stage, roster, nav, bubbles, flash,
  };
}
