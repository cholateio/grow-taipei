// 無頭演出層：fakedom、真 THREE、真 people、假 assets（spawn → Group 帶 userData.mixer stub、release 記錄）、真 glow、
// 假 rig（記錄 panTo／focus／home）、world 記錄。測試與 tools/pace.mjs 都用它在 Node 裡把回合一幀一幀演完。
import * as THREE from '../../vendor/three/three.module.js';
import * as spec from '../../src/rules/spec.js';
import * as engine from '../../src/rules/engine.js';
import { installFakeDom } from './fakedom.js';
import { createGlowRegistry } from '../../src/scene/glow.js';
import { createPeople } from '../../src/scene/people.js';
import { mulberry32 } from '../../src/scene/random.js';
import { createCameraRig, OVERVIEW_DIR } from '../../src/scene/camera.js';
import { cellAt } from '../../src/scene/hex.js';
import { countdownEvent } from '../../src/game.js';

installFakeDom();
const { createShow } = await import('../../src/show/index.js');
const IDS = ['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon', 'satellites', 'finale'];
export const ALL = await Promise.all(IDS.map(id => import(`../../src/actors/${id}.js`)));

const DT = 1 / 30, LIMIT = 120;
// 裁決 R15：非關鍵劇本 ≤ 4.5 s（◆ 關鍵 6–10 s 另外量）。例外（主要是走路、R15 不准加快走路）：燈泡 Lv2 巡三站（裁決 R12 ≤ 8 s）、
// 棒球放置的跑壘（沿壘包慢走一圈 4 s，加上從入口走到本壘）、代幣放置（島民從鄰格走來月台，R16 之後代幣格不住島民）——
// tools/pace.mjs 的 SCRIPT_EXCEPT 同一張表
export const SCRIPT_MAX = 4.5, SCRIPT_EXCEPT = { 'bulb 2': 8, 'baseball 1': 6, 'token 1': 6 };
// 裁決 R17：◆ 關鍵劇本 live 6–8 s（原 6–10，裁決 R8）——單獨演的整段（含鏡頭平移、回全景，show.elapsed）≤ KEY_MAX
export const KEY_MAX = 8;

// seed：名冊與走路格的亂數種子，同一個種子每次演出的秒數一模一樣
// rig：換成真的鏡頭 rig（測試鏡頭最後停在哪）；run 每幀也推它
// quality：'low' 時零件與名冊省 draw call（手機畫質，裁決 R18），演出要照樣演完
export async function headlessShow({ modules = ALL, reducedMotion = false, seed = 21, rig: realRig = null, quality = 'high' } = {}) {
  const spawned = [], released = [];
  const assets = {
    spawned, released,
    spawn: async (path, opts = {}) => { const g = new THREE.Group(); g.userData.mixer = { timeScale: 1 }; opts.parent?.add(g); spawned.push(g); return g; },
    release: g => { released.push(g); g.removeFromParent(); },
    update() {},
  };
  const people = createPeople(THREE, { max: 48 });
  // 假 rig 跟真的一樣：拖過（cancel）之後 focus 不動、home 清掉、release 只清記號
  const rigLog = [];
  const rig = realRig ?? {
    log: rigLog, grabbed: false,
    panTo(t, ms) { rigLog.push(['panTo', t, ms]); }, home(ms) { rig.grabbed = false; rigLog.push(['home', ms]); },
    focus(t, opts) { if (!rig.grabbed) rigLog.push(['focus', t, opts]); }, cancel() { rig.grabbed = true; }, release() { rig.grabbed = false; },
  };
  const worldLog = [], bubblesLog = [], rail = { offset: 0 };
  const scene = new THREE.Scene(); scene.add(people.group);
  const show = createShow(THREE, {
    scene, spec, modules, ctx: { people, assets, glow: createGlowRegistry(), weather: { rain: 0 }, rail, quality },
    rig, world: (effects, instant) => worldLog.push([effects, instant]), reducedMotion, rnd: mulberry32(seed),
  });
  // 每次 bubbles.show／levelUp 記下 { kind | text, at }（at = 出現那一刻頭上的位置）
  const { show: showBubble, levelUp } = show.bubbles;
  show.bubbles.show = (head, kind, dur) => { bubblesLog.push({ kind, at: head() }); return showBubble(head, kind, dur); };
  show.bubbles.levelUp = (head, opts = {}) => { bubblesLog.push({ text: opts.text ?? 'LEVEL UP', down: !!opts.down, at: head() }); return levelUp(head, opts); };

  // 演一回合（onMark 照傳給 show.turn）：instant 包在 reduced-motion 裡瞬間跑完回 0；否則每幀 update(1/30) 到 Promise resolve，
  // 回傳劇本秒數：不含 focus 拍（回合補的鏡頭平移、回全景，§13.1）；整回合秒數看 show.elapsed。
  // scriptElapsed()：這回合到目前為止的劇本秒數（onMark 裡量某一段用）
  let cam = 0;   // 這回合花在 focus 拍的秒數：每幀的 dt 算給這一幀開頭正在演的拍（回合第一幀算給剛拉進來的那拍）
  const scriptElapsed = () => show.elapsed - cam;
  async function run(events, { montage = false, finale = false, instant = false, onMark } = {}) {
    cam = 0;
    if (instant) {
      show.setReducedMotion(true);
      try { await show.turn(events, { montage, finale, onMark }); } finally { show.setReducedMotion(false); }
      return 0;
    }
    const p = show.turn(events, { montage, finale, onMark });
    let t = 0, done = false, err = null;
    p.then(() => { done = true; }, e => { done = true; err = e; });
    while (!done) {
      const kind = show.currentKind;
      show.update(DT, t); rig.update?.(DT); t += DT;
      if ((kind ?? show.currentKind) === 'focus') cam += DT;
      await Promise.resolve();
      if (t > LIMIT) throw new Error(`turn exceeded ${LIMIT} s`);
    }
    if (err) throw err;
    return scriptElapsed();
  }

  return { show, people, assets, rig, worldLog, bubblesLog, run, scriptElapsed, scene, rail };
}

// 單獨演一級的劇本：拿掉 jump。turn.js 只看 e.jump 就把跳級的第二級演成 apply + LEVEL UP（任務 10），
// 單獨測那一級自己的劇本要當一般事件。燈泡 Lv5、晶片 Lv5、珍奶 Lv3、棒球 Lv5 在兩條正解裡都是跳級的第二級，正式演出時不演劇本；
// 不是正解的放法（+1 一級一級走到這級）才會演，所以單獨測
export const solo = ({ jump, ...e }) => e;

// 照 order 放完一局、再長 CLOSING_TURNS 回合（物品 v2：很多級落在倒數回合）：itemId 的 placed／grow 事件單獨 live 演並呼叫
// check(e, secs)，其他事件 instant；每回合最後 settle instant（單獨演一個事件沒問題：回合末的 apply 會補完剩下的零件，settle 瞬間結算）。
// 單獨演的跳級第二級拿掉 jump（solo）照一般事件演；跳級連著演的樣子由 turn／show 測試驗
export async function playItem(show, run, order, itemId, check) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (e.item === itemId && (e.kind === 'placed' || e.kind === 'grow')) { const secs = await run([solo(e)]); await check(e, secs); }
      else await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
}

// 倒數回合 i（0 起算）演的事件：最前面是遊戲層插的倒數字（countdownEvent(3 − i)，101 頭上 3、2、1），最後補 settle——同 game.js 的 pick()
export const closingEvents = (i, events) => [countdownEvent(3 - i), ...events, { kind: 'settle' }];
// 一局的每一回合：照 order 放完、再 CLOSING_TURNS 個倒數回合（step(s) → { state, events }）
export const turnSteps = order => [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
// 101 的階段在這一局哪一回合跨過（物品 v2 任務 10）：totals[i] = 第 i+1 回合結算後的總等級；at[stage] = 第一次到那個階段的回合（1 起算，含倒數回合）
export function towerCrossings(order) {
  const { stageOf } = ALL.find(m => m.id === 'tower'), totals = [], at = {};
  let s = engine.createState(spec);
  for (const step of turnSteps(order)) {
    s = step(s).state; totals.push(Object.values(s.lv).reduce((a, b) => a + b, 0));
    at[stageOf(totals.at(-1))] ??= totals.length;
  }
  return { totals, at };
}

// 兩條正解（放置 + 倒數三回合）每個事件瞬間演完後，用舞台當下的 footprint（show.nav）查 mod 的名冊入口（entryProblems）
export async function entriesThroughSolutions(mod, orders) {
  const { entryProblems } = await import('./actors.js');
  const { show, run } = await headlessShow(), bad = [];
  for (const order of orders) {
    show.reset();
    let s = engine.createState(spec);
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const step of steps) {
      const r = step(s); s = r.state;
      for (const e of [...r.events, { kind: 'settle' }]) {
        await run([e], { instant: true });
        const st = show.stage;
        bad.push(...entryProblems(mod.view(st.lv, st.flags, st.meta), show.nav, `${order.join('>')} ${JSON.stringify(st.lv)}`));
      }
    }
  }
  return [...new Set(bad)];
}

// ── 整局 live 的共用不變式（物品 v2 任務 11）──
// footprint 形狀裡（圓 r、橢圓 rx／rz、矩形 w／d；stage.footprints() 的世界座標）
export const inShape = (f, x, z) => (f.r != null ? Math.hypot(x - f.x, z - f.z) <= f.r : f.rx != null ? ((x - f.x) / f.rx) ** 2 + ((z - f.z) / f.rz) ** 2 <= 1 : Math.abs(x - f.x) <= f.w / 2 && Math.abs(z - f.z) <= f.d / 2);
// 真的鏡頭 rig（16:9 全景；controls.update 像 OrbitControls 一樣看著注視點）：headlessShow({ rig: cam.rig }) 用它；
// topNdc：101 頭頂在畫面上的 NDC（x, y）
export function overviewRig() {
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 320), controls = { target: new THREE.Vector3(), update() { camera.lookAt(controls.target); } };
  const rig = createCameraRig({ THREE, camera, controls }); rig.fit(16 / 9);
  const topNdc = show => { camera.lookAt(controls.target); camera.updateMatrixWorld(); const h = show.stage.headOf('tower'); return new THREE.Vector3(h.x, h.y, h.z).project(camera); };
  return { rig, camera, controls, topNdc };
}
// gameInvariants(show, { cam })：掛在 show.update 上每幀查（同 roster.test 的 live 探針，取三條最基本的）
//   walls：主島走路格上露出來的名冊成員在建築本身（stage.footprints()，不含 PAD）裡超過 CAUGHT_MAX 秒（坐車頂的 ride、
//          站位本來就畫在外擴 footprint 裡的 stand——泡溫泉的老鼠、攤車後的老闆——例外）
//   jumps：日常的人（前後兩幀都是 home、都露出來、不坐車頂）一幀走超過 max(自己的走路速度, 家的速度) × dt（瞬移）
//   camera：turnEnd(label) 在每回合演完後把鏡頭飛完（照樣推演出層），查在全景（注視點在島心正上方、沿 OVERVIEW_DIR 看）、101 頭頂在畫面裡（|x| ≤ 1、y ≤ 0.8）
//   labels（有 cam 才查）：每個 LEVEL UP 字樣與頭頂泡泡（bubbles.levelUp／show）活著的那幾秒（dur），頭上的點投影在 NDC [-1, 1] 裡的幀數
//          要 ≥ LABEL_ON（一半）——鏡頭沒跟上、演出的那一刻在畫面外（審稿：颱風登陸後的 LEVEL UP、101 頭上的字、撞攤車的 ！、等待圖框）
// label(text)：之後的問題都標這個字串（例如「第幾回合」）
export const CAUGHT_MAX = 1.5, LABEL_ON = 0.5;
export function gameInvariants(show, { cam = null } = {}) {
  const walls = new Set(), jumps = new Set(), camera = [], caught = new Map(), last = new Map(), update = show.update;
  let label = '', t = 0, viewKey = null, view = {};
  // 標籤：出現時記下 { head, until, n（活著的幀數）, out（在畫面外的幀數）}；過了 until 就結算
  const labels = [], live = [];
  if (cam) {
    const { show: showBubble, levelUp } = show.bubbles;
    const watch = (head, text, dur) => live.push({ head, until: t + dur, n: 0, out: 0, what: `${label}: "${text}"` });
    show.bubbles.show = (head, kind, dur) => { watch(head, typeof kind === 'string' ? kind : JSON.stringify(kind), dur); return showBubble(head, kind, dur); };
    show.bubbles.levelUp = (head, opts = {}) => { watch(head, opts.text ?? 'LEVEL UP', opts.dur ?? 1.0); return levelUp(head, opts); };
  }
  const ndc = p => { cam.camera.lookAt(cam.controls.target); cam.camera.updateMatrixWorld(); cam.camera.updateProjectionMatrix(); return new THREE.Vector3(p.x, p.y, p.z).project(cam.camera); };
  const settle = L => { live.splice(live.indexOf(L), 1); if (L.n && L.out / L.n > 1 - LABEL_ON) labels.push(`${L.what} off screen ${L.out}/${L.n} frames`); };
  const watchLabels = () => {
    for (const L of [...live]) {
      if (t > L.until + 1e-9) { settle(L); continue; }
      const p = ndc(L.head()); L.n++; if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) L.out++;
    }
  };
  const homeOf = k => {
    const st = show.stage;
    if (viewKey?.lv !== st.lv || viewKey.flags !== st.flags || viewKey.meta !== st.meta) { viewKey = { lv: st.lv, flags: st.flags, meta: st.meta }; view = Object.assign({}, ...ALL.map(mod => mod.view(st.lv, st.flags, st.meta))); }
    return view[k]?.home;
  };
  const authored = (h, i) => h?.kind === 'stand' && !h.rescue && show.nav.inFootprint(h.spots[i % h.spots.length].x, h.spots[i % h.spots.length].z);
  const check = dt => {
    const fps = show.stage.footprints();
    for (const k of show.roster.keys()) for (const m of show.roster.members(k)) {
      const h = homeOf(k), what = `${label} ${k}#${m.i} ${m.mode} (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`;
      const daily = !m.hidden && !m.gone && m.mode === 'home' && h?.kind !== 'ride', prev = last.get(m);
      if (daily && prev) {
        const d = Math.hypot(m.pos.x - prev.x, m.pos.z - prev.z), max = Math.max(m.speed, h?.speed ?? 0) * dt;
        if (d > max + 1e-6) jumps.add(`${what} moved ${d.toFixed(3)} > ${max.toFixed(3)}`);
      }
      if (daily) last.set(m, { ...m.pos }); else last.delete(m);
      const inWall = !m.hidden && !m.gone && h?.kind !== 'ride' && !authored(h, m.i) && cellAt(m.pos.x, m.pos.z) && fps.some(f => inShape(f, m.pos.x, m.pos.z));
      if (!inWall) { caught.delete(m); continue; }
      if (!caught.has(m)) caught.set(m, t);
      else if (t - caught.get(m) > CAUGHT_MAX) walls.add(`${what} inside a building for > ${CAUGHT_MAX} s`);
    }
  };
  show.update = (dt, tt) => { update(dt, tt); t += dt; check(dt); if (cam) watchLabels(); };
  return {
    walls, jumps, camera, labels,
    label(text) { label = text; },
    // 回合演完：鏡頭飛完（最多 3 秒，照樣推演出層），再查全景與 101 頭頂
    turnEnd() {
      if (!cam) return;
      for (let i = 0; i < 90 && cam.rig.flying; i++) { show.update(1 / 30, 1000 + t); cam.rig.update(1 / 30); }
      for (const L of [...live]) settle(L);
      const { camera: c, controls } = cam, dir = c.position.clone().sub(controls.target).normalize(), p = cam.topNdc(show);
      const off = Math.hypot(dir.x - OVERVIEW_DIR.x, dir.y - OVERVIEW_DIR.y, dir.z - OVERVIEW_DIR.z);
      if (cam.rig.flying || off > 1e-6 || Math.hypot(controls.target.x - 0.4, controls.target.z) > 1e-6) camera.push(`${label}: not at the overview (flying ${cam.rig.flying}, dir off ${off.toExponential(1)}, target ${controls.target.x.toFixed(2)}, ${controls.target.z.toFixed(2)})`);
      if (Math.abs(p.x) > 1 || p.y > 0.8 || p.y < -1) camera.push(`${label}: tower top at NDC (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    },
  };
}

// 整局 live 演完一條順序（種子 21，跟 tools/pace.mjs 同一把尺）：回傳每個事件 { turn, montage, e, key, secs, live, script }——
// secs：事件秒數（含平移、空拍）；live：扣掉物品之間的空拍；script：不含 focus 拍、扣掉空拍（各物品測試的劇本秒數）
export async function playLive(order, { seed = 21 } = {}) {
  const { show, run, scriptElapsed } = await headlessShow({ seed }), out = [];
  let s = engine.createState(spec);
  for (const [i, step] of turnSteps(order).entries()) {
    const r = step(s); s = r.state;
    const montage = i >= order.length, marks = [];
    await run(montage ? closingEvents(i - order.length, r.events) : [...r.events, { kind: 'settle' }], { montage, onMark: (e, info) => marks.push([e, show.elapsed, scriptElapsed(), info]) });
    marks.forEach(([e, at, sc, info], j) => {
      const next = marks[j + 1], secs = (next?.[1] ?? show.elapsed) - at, gap = info?.gap ?? 0;
      out.push({ turn: i + 1, montage, e, key: !!info?.key, secs, live: secs - gap, script: (next?.[2] ?? scriptElapsed()) - sc - gap });
    });
  }
  return out;
}
