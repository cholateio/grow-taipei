// 演出層入口：把走路格、閃白、泡泡、名冊、舞台、時間軸接起來，給遊戲一個 show.turn(events) 演一整回合。
// 每幀 update(dt, t) 推進；跳過、reduced-motion、RESET 一律立刻到最終狀態（§4.3）：
//   舞台全部 commit、名冊每個人瞬間到家、閃白與泡泡收掉、鏡頭回全景、名冊全部恢復日常、全島效果貼齊。
// 最終章（計畫 5，設計 §7、§9）：turn(events, { finale: true }) 演終局回合（turn.js 終局模式）；hold(s) 標題卡前停 s 秒——
//   播一個 wait 拍，期間 skip() 不作用（點畫面跳不過），reduced-motion 0 秒，abort／reset（RESET）照樣中止；停著的時候 busy 仍是 true。
import { createNav } from './nav.js';
import { createBlink } from './blink.js';
import { createBubbles } from './bubbles.js';
import { createRoster } from './roster.js';
import { createTimeline } from './timeline.js';
import { buildTurn } from './turn.js';
import { B } from './beats.js';
import { createStage } from '../actors/stage.js';
import { worldEffects } from '../actors/world.js';

// rnd：走路格散步點、名冊停頓用的亂數（測試與 tools/pace.mjs 傳固定種子，秒數每次一樣）
export function createShow(THREE, { scene, spec, modules, ctx: parts, rig, world, reducedMotion = false, rnd = Math.random }) {
  const { people, assets, glow, weather, rail, quality } = parts;   // quality：'low' 時零件與名冊省 draw call（裁決 R18）
  const nav = createNav({ rnd });
  const labels = new THREE.Group(); labels.name = 'show:labels'; scene.add(labels);
  const blink = createBlink(THREE, { people }), bubbles = createBubbles(THREE, { group: labels });
  // 名冊先建：模型成員的天線／眼睛要用舞台的零件工廠，等舞台建好才用得到（載入模型是非同步的，那時舞台早就在了）
  let stage = null;
  const roster = createRoster(THREE, { people, assets, build: s => stage.build(s), nav, blink, rail, rnd, quality });
  scene.add(roster.group);
  stage = createStage(THREE, { scene, spec, modules, ctx: { people, assets, glow, weather, rail, quality }, roster, blink });

  // 鏡頭：拍會平移／拉近；記住這回合有沒有離開全景，reduced-motion 回合結束才知道要不要拉回來。
  // 玩家拖過鏡頭（grabbed）focus 拍就跳過；回合開始 release 放開記號（§13.1，計畫 3.8 R4）
  let panned = false;
  const camRig = {
    focus(t, opts) { panned = true; return rig.focus(t, opts); },
    home(ms) { panned = false; rig.home(ms); },
    setSkyline(y) { rig.setSkyline?.(y); },   // 全景跟 101 頭頂高度（§14.4）
    get grabbed() { return !!rig.grabbed; },
    release() { rig.release?.(); },
  };
  const ctx = { stage, roster, nav, bubbles, blink, rig: camRig, rail, world, spec, instant: false, speed: 1, now: 0, B };
  const timeline = createTimeline({ reducedMotion });
  let reduced = reducedMotion, playing = null;   // playing：這回合的記號；跳過／中止／RESET 後設成 null，回合結束就不再補做
  let holding = null;   // 標題卡前的停格（hold）中：skip() 不作用。每個 hold 一個記號：中止過的舊 hold 晚一步收尾時不清掉新的

  function refresh() { nav.setFootprints(stage.footprints()); }
  // 全景跟舞台上 101 現在的頭頂走（§14.4）：開局、跳過／中止／RESET 回全景之前（回合最後那拍自己更新）
  const skyline = () => camRig.setSkyline(stage.headOf('tower').y);
  // 開局：舞台建好時島民已經先生出來了（那時走路格還不知道建築在哪，可能站進 101 工地裡）——
  // 先讓走路格認得建築，再讓每個人瞬間回家重挑位置；開局不閃，直接站在島上
  refresh(); roster.snap(); blink.clear(); skyline();
  // 立刻到最終狀態（跳過、reduced-motion 回合結束、中止）
  function snap({ home = true } = {}) {
    stage.commitAll(); roster.showAll(); roster.snap(); roster.setFocus(null); blink.clear(); bubbles.clear();
    skyline(); if (home) camRig.home(0);   // 跳過也更新天際線（review focus 5）
    refresh();
    world(worldEffects(stage.lv, stage.flags, stage.meta), true);
  }

  function turn(events, { finale = false, onMark } = {}) {
    if (timeline.busy) throw new Error('show busy');
    ctx.instant = reduced; ctx.onMark = onMark ?? null; panned = false;
    camRig.release(); roster.setFocus(null);   // 回合之間拖過鏡頭不影響這回合跟主線；焦點從全部的人開始
    roster.showAll({ walk: true });   // 上一回合躲進門裡的人（颱風登陸）從門口出來、走回家（不閃）
    refresh();
    const beats = buildTurn(events, { modules, spec, lv: stage.lv, flags: stage.flags, meta: stage.meta, finale }, ctx);
    const me = playing = {};
    const done = timeline.play(beats, ctx);
    const end = () => {
      if (playing !== me) return;   // 已經跳過／中止／RESET：那邊已經收好了
      playing = null;
      if (ctx.instant) { snap({ home: panned }); return; }   // reduced-motion：瞬間演完；鏡頭只在拍移動過時才拉回
      // 照常演完：把還沒 commit 的換上、hold 住的名冊套用、走路格跟著新零件；名冊全部恢復日常（某一拍丟錯沒演到 focus('home') 也一樣）
      stage.commitAll(); roster.syncAll(); roster.setFocus(null); refresh();
    };
    return done.then(end, err => { end(); throw err; });
  }

  // 停 s 秒（1 倍速的演出時間 = 真實秒數）；不碰舞台、名冊、鏡頭——畫面照終局回合留下的樣子。
  // reduced-motion：時間軸 play 當場跑完（0 秒）；停到一半打開 reduced-motion 也由時間軸的 setReducedMotion 收掉
  function hold(s) {
    if (timeline.busy) throw new Error('show busy');
    ctx.instant = reduced; ctx.speed = 1; ctx.onMark = null;
    const me = holding = {};
    const done = timeline.play([B.wait(reduced ? 0 : s)], ctx);
    const end = () => { if (holding === me) holding = null; };
    return done.then(end, err => { end(); throw err; });
  }

  function skip() {
    if (!timeline.busy || holding) return;
    ctx.instant = true;   // 鏡頭、全島效果的拍讀它：剩下的拍 start → end 都瞬間
    playing = null;
    // 某一拍的 end 丟錯也要收到最終狀態（錯照樣往外丟，回合的 Promise 也會 reject）
    try { timeline.skip(); } finally { snap(); }
  }
  function abort() {
    const was = timeline.busy;
    playing = null; holding = null;
    try { timeline.abort(); } finally { if (was) snap(); }
  }

  return {
    turn, hold, skip, abort,
    reset() {
      try { abort(); } finally {
        stage.reset();   // 舞台 reset 也清掉名冊（連焦點一起）
        // 重新宣告的開局島民是從入口點生出來的（§13.2 走進來）；RESET 要立刻到最終狀態：認得建築後瞬間回家（同開局）
        roster.setFocus(null); blink.clear(); bubbles.clear(); skyline(); camRig.home(0); refresh(); roster.snap();
      }
    },
    update(dt, t) {
      ctx.now = t;
      blink.update(dt);   // 先推閃白：這一幀才開始的閃白不會當幀就前進
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
    get currentKind() { return timeline.currentKind; },   // 正在演哪一種拍（測試把鏡頭 focus 的秒數從劇本秒數扣掉）
    stage, roster, nav, bubbles, blink,
  };
}
