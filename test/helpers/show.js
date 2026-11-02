// 無頭演出層：fakedom、真 THREE、真 people、假 assets（spawn → Group 帶 userData.mixer stub、release 記錄）、真 glow、
// 假 rig（記錄 panTo／focus／home）、world 記錄（心情照 app 交給 people.setMood）。測試與 tools/pace.mjs 都用它在 Node 裡把回合一幀一幀演完。
import * as THREE from '../../vendor/three/three.module.js';
import * as spec from '../../src/rules/spec.js';
import * as engine from '../../src/rules/engine.js';
import { installFakeDom } from './fakedom.js';
import { createGlowRegistry } from '../../src/scene/glow.js';
import { createPeople } from '../../src/scene/people.js';
import { mulberry32 } from '../../src/scene/random.js';
import { createCameraRig, OVERVIEW_DIR } from '../../src/scene/camera.js';
import { cellAt, cellTop } from '../../src/scene/hex.js';

installFakeDom();
const { createShow } = await import('../../src/show/index.js');
const IDS = ['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon', 'satellites', 'finale'];
export const ALL = await Promise.all(IDS.map(id => import(`../../src/actors/${id}.js`)));

const DT = 1 / 30, LIMIT = 120;
// 裁決 R15：非關鍵劇本 ≤ 4.5 s（◆ 關鍵 6–10 s 另外量）。例外（主要是走路、R15 不准加快走路）：燈泡 Lv2 巡三站（裁決 R12 ≤ 8 s）、
// 棒球放置的跑壘（沿壘包慢走一圈 4 s，加上從入口走到本壘）、代幣放置（島民從鄰格走來月台，R16 之後代幣格不住島民）、
// 代幣 Lv2（裁決 R23：站長是離車站最近的島民，同樣從鄰格走到崗位才換制服，不再從站後面生一個）——
// tools/pace.mjs 的 SCRIPT_EXCEPT 同一張表
export const SCRIPT_MAX = 4.5, SCRIPT_EXCEPT = { 'bulb 2': 8, 'baseball 1': 6, 'token 1': 6, 'token 2': 6 };
// 裁決 R17：◆ 關鍵劇本 live 6–8 s（原 6–10，裁決 R8）——單獨演的整段（含鏡頭平移、回全景，show.elapsed）≤ KEY_MAX
export const KEY_MAX = 8;

// seed：名冊與走路格的亂數種子，同一個種子每次演出的秒數一模一樣
// rig：換成真的鏡頭 rig（測試鏡頭最後停在哪）；run 每幀也推它
// quality：'low' 時零件與名冊省 draw call（手機畫質，裁決 R18），演出要照樣演完
// compile：回合預熱的零件模型載好後收到的物件陣列（app 拿去 renderer.compileAsync，計畫 15 C）；沒給就不編
export async function headlessShow({ modules = ALL, reducedMotion = false, seed = 21, rig: realRig = null, quality = 'high', compile = null } = {}) {
  const spawned = [], released = [], paths = [];   // paths：每次 spawn 要的模型路徑（tools/startup-bytes.mjs 量開局載入）
  const assets = {
    spawned, released, paths,
    spawn: async (path, opts = {}) => { paths.push(path); const g = new THREE.Group(); g.userData.mixer = { timeScale: 1 }; opts.parent?.add(g); spawned.push(g); return g; },
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
    scene, spec, modules, ctx: { people, assets, glow: createGlowRegistry(), weather: { rain: 0 }, rail, quality, compile },
    // world 跟 app 的 showWorld 一樣把心情交給 people.setMood（命中躺平時名冊讀 people.mood 停住日常，測試才看得到）
    rig, world: (effects, instant) => { worldLog.push([effects, instant]); if (effects.mood) people.setMood(effects.mood); }, reducedMotion, rnd: mulberry32(seed),
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
  // eventHead(id)：最近一次 run 裡最後一個 id 的事件（item 或 delta.target）變了的零件頭上——LEVEL UP 該冒的地方（計畫 15 D，stage.headOfEvent）；
  // 那次 run 沒有 id 的事件就是 headOf(id)
  let played = [];
  const eventHead = id => { const e = played.findLast(x => x.item === id || x.delta?.target === id); return e ? show.stage.headOfEvent(e, id) : show.stage.headOf(id); };
  async function run(events, { finale = false, instant = false, onMark } = {}) {
    cam = 0; played = events;
    if (instant) {
      show.setReducedMotion(true);
      try { await show.turn(events, { finale, onMark }); } finally { show.setReducedMotion(false); }
      return 0;
    }
    const p = show.turn(events, { finale, onMark });
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

  return { show, people, assets, rig, worldLog, bubblesLog, run, scriptElapsed, scene, rail, eventHead };
}

// 單獨演一級的劇本：拿掉 jump。turn.js 只看 e.jump 就把跳級的第二級演成 apply + LEVEL UP（任務 10），
// 單獨測那一級自己的劇本要當一般事件。計畫 5b 之後跳級很多（例：燈泡 4／6／8、晶片 4、珍奶 4、棒球 7 在唯一正解裡都是跳級的第二級），正式演出時不演劇本；
// 不是正解的放法（+1 一級一級走到這級）才會演，所以單獨測。
// via 也拿掉：via 是演出層看的原因（計畫 6 的拜訪 2026-10-29 拿掉了），不算進那一級自己劇本的秒數——單獨測一級的劇本就只演劇本
export const solo = ({ jump, via, ...e }) => e;

// 照 order 放完一局、再長 CLOSING_TURNS 回合（最後一輪）：itemId 的 placed／grow 事件單獨 live 演並呼叫
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

// 一局的每一回合：照 order 放完、再 CLOSING_TURNS 個最後一輪（step(s) → { state, events }）。
// 最後一輪照一般回合演（選擇帶動升級 §4）：事件後面補 settle，跟放置回合一樣
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

// 唯一正解（放置 + 最後一輪）每個事件瞬間演完後，用舞台當下的 footprint（show.nav）查 mod 的名冊入口（entryProblems）
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
//   jumps：日常的人（前後兩幀都是 home、都露出來、不坐車頂）一幀走超過 max(自己的走路速度, 家的速度) × dt（瞬移）；
//          例外只有一種：被新建築蓋到、當幀閃白換到外面（名冊的 cover，2026-10-31 錄影修正，裁決 R3 的閃白換位）——
//          上一幀的位置在外擴 footprint 裡、這一幀他正在閃白
//   camera：turnEnd(label) 在每回合演完後把鏡頭飛完（照樣推演出層），查在全景（注視點在島心正上方、沿 OVERVIEW_DIR 看）、101 頭頂在畫面裡（|x| ≤ 1、y ≤ 0.8）；
//          每幀也查鏡頭沒有在飛行之外瞬間跳開：演出層這一幀（show.update，拍的 start／end）讓鏡頭位置一次移動超過 CAM_JUMP 公尺就記一筆
//          ——飛行的內插在 rig.update 裡（正常最大一幀約 2.8，那是飛，不算）；最終審稿 2：天際線在全景裡重算原本一幀跳 5.66
//   labels（有 cam 才查）：每個 LEVEL UP 字樣與頭頂泡泡（bubbles.levelUp／show）活著的那幾秒（dur），頭上的點投影在 NDC [-1, 1] 裡的幀數
//          要 ≥ LABEL_ON（一半）——鏡頭沒跟上、演出的那一刻在畫面外（審稿：颱風登陸後的 LEVEL UP、101 頭上的字、撞攤車的 ！、等待圖框）
//   pops（計畫 6 裁決 R3）：劇本手上（'script'）的人（這一幀或上一幀；劇本放回日常那一幀模式已經是 home）
//          一幀突然跳開超過 POP_MAX——那一幀他一定在閃白
//          （show.blink 正閃著他的小人實例或模型 holder），或藏著、還沒畫出來（模型 holder 還沒到）；不准靜靜地瞬移。
//          「突然」＝這一幀的位移跟上一幀的位移差超過 POP_MAX：坐在趕路的列車車頂（一幀 0.44）是連續的快，不是換位置
// label(text)：之後的問題都標這個字串（例如「第幾回合」）
export const CAUGHT_MAX = 1.5, LABEL_ON = 0.5, POP_MAX = 0.3, CAM_JUMP = 1.0;
export function gameInvariants(show, { cam = null } = {}) {
  const walls = new Set(), jumps = new Set(), pops = new Set(), camera = [], caught = new Map(), last = new Map(), seen = new Map(), update = show.update;
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
        const covered = show.nav.inFootprint(prev.x, prev.z) && show.blink.has(m.walker ?? m.holder);
        if (d > max + 1e-6 && !covered) jumps.add(`${what} moved ${d.toFixed(3)} > ${max.toFixed(3)}`);
      }
      if (daily) last.set(m, { ...m.pos }); else last.delete(m);
      const was = seen.get(m), step = was ? { x: m.pos.x - was.p.x, z: m.pos.z - was.p.z } : { x: 0, z: 0 };
      seen.set(m, { p: { ...m.pos }, step, mode: m.mode });
      // 上一幀的模式也算：劇本放回日常那一刻模式同一幀翻成 home——看這一幀的模式會漏掉那一幀的換位置
      const acting = mode => mode === 'script';
      if (was && !m.hidden && !m.gone && (acting(m.mode) || acting(was.mode)) && (m.walker || m.holder)) {
        const jerk = Math.hypot(step.x - was.step.x, step.z - was.step.z);
        if (jerk > POP_MAX && !show.blink.has(m.walker ?? m.holder)) pops.add(`${what} jumped ${Math.hypot(step.x, step.z).toFixed(2)} without a blink`);
      }
      const inWall = !m.hidden && !m.gone && h?.kind !== 'ride' && !authored(h, m.i) && cellAt(m.pos.x, m.pos.z) && fps.some(f => inShape(f, m.pos.x, m.pos.z));
      if (!inWall) { caught.delete(m); continue; }
      if (!caught.has(m)) caught.set(m, t);
      else if (t - caught.get(m) > CAUGHT_MAX) walls.add(`${what} inside a building for > ${CAUGHT_MAX} s`);
    }
  };
  show.update = (dt, tt) => {
    const p0 = cam && cam.camera.position.clone();
    update(dt, tt); t += dt; check(dt);
    if (cam) {
      const d = cam.camera.position.distanceTo(p0);
      if (d > CAM_JUMP) camera.push(`${label}: camera jumped ${d.toFixed(2)} in one frame outside a flight`);
      watchLabels();
    }
  };
  return {
    walls, jumps, pops, camera, labels,
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

// 整局 live 演完一條順序（種子 21，跟 tools/pace.mjs 同一把尺）：回傳每個事件 { turn, closing, e, key, secs, live, script }（closing：最後一輪）——
// secs：事件秒數（含平移、空拍）；live：扣掉物品之間的空拍；script：不含 focus 拍、扣掉空拍（各物品測試的劇本秒數）
export async function playLive(order, { seed = 21 } = {}) {
  const { show, run, scriptElapsed } = await headlessShow({ seed }), out = [];
  let s = engine.createState(spec);
  for (const [i, step] of turnSteps(order).entries()) {
    const r = step(s); s = r.state;
    const closing = i >= order.length, marks = [];
    await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => marks.push([e, show.elapsed, scriptElapsed(), info]) });
    marks.forEach(([e, at, sc, info], j) => {
      const next = marks[j + 1], secs = (next?.[1] ?? show.elapsed) - at, gap = info?.gap ?? 0, script = (next?.[2] ?? scriptElapsed()) - sc - gap;
      out.push({ turn: i + 1, closing, e, key: !!info?.key, secs, live: secs - gap, script });
    });
  }
  return out;
}

// 拜訪點（計畫 6 設計 §4、§5；拜訪 2026-10-29、撲空 2026-10-31 都拿掉了，只剩 stage.troubleSpot〔老鼠指標〕用它）：照唯一正解一個事件一個事件瞬間演，mod 自己的 placed（Lv1）與 grow（Lv n）事件，
// 在演完之後問一次
// visitSpot(n, { lv, flags })——spot 要有 y（＝那一格的 cellTop）、r > 0、落在 cells(n, s) 列的主島格（或給的衛星判定）裡；frontOf(spot, r, nav) 被 nearestWalkable
// 拉回來不超過 tol。回傳 { bad, seen }：seen 是問到非 null 的「級」（排序過的數字陣列），測試寫死，少一級、多一級都看得到
export async function visitSpotsThroughSolutions(mod, orders, { cells, tol = 0.6 }) {
  const { frontOf } = await import('../../src/actors/anchors.js');
  const bad = [], seen = new Set();
  for (const order of orders) {
    const { show, run } = await headlessShow();
    let s = engine.createState(spec);
    const check = (n, when) => {
      const st = show.stage, sv = { lv: { ...st.lv, [mod.id]: n }, flags: st.flags }, spot = mod.visitSpot(n, sv);
      if (!spot) return;
      seen.add(n);
      const what = `${order.join('>')} ${mod.id} Lv${n} (${when})`;
      if (!Number.isFinite(spot.y) || !(spot.r > 0)) { bad.push(`${what}: spot needs y and r > 0`); return; }
      const cell = cellAt(spot.x, spot.z), ok = cells(n, sv);
      if (!cell || !ok.some(c => c[0] === cell[0] && c[1] === cell[1])) bad.push(`${what}: spot (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)}) in ${cell ?? 'no main cell'}, want ${ok.join(' | ')}`);
      // y 釘在那一格的地面（cellTop：台地格比較高）——拜訪的人站在地上敲門，不是屋頂或半空
      else if (Math.abs(spot.y - cellTop(cell)) > 1e-9) bad.push(`${what}: spot y ${spot.y.toFixed(3)} ≠ cell top ${cellTop(cell)}`);
      const req = frontOf(spot, spot.r), got = frontOf(spot, spot.r, show.nav), d = Math.hypot(got.x - req.x, got.z - req.z);
      if (d > tol) bad.push(`${what}: frontOf pulled ${d.toFixed(2)} > ${tol}`);
    };
    for (const step of turnSteps(order)) {
      const r = step(s); s = r.state;
      for (const e of [...r.events, { kind: 'settle' }]) {
        const n = e.item === mod.id && (e.kind === 'placed' ? 1 : e.kind === 'grow' ? e.to : 0);
        if (n) check(n, 'before');
        await run([e], { instant: true });
        if (n) check(n, 'after');
      }
    }
  }
  return { bad: [...new Set(bad)], seen: [...seen].sort((a, b) => a - b) };
}

// 亮一下量表（計畫 11 Task 1）：掛在 show.blink 上，記下每一次 part／grow／shrink 的呼叫（各自一筆；fn 'grow' 就是 blink.grow——
//   使用者 2026-10-31「閃一下」之後長出來的建築不再同時 blink.part，所以 part 和 grow 不再配對）——
// { label, key（舞台零件鍵；名冊模型是 `<鍵>#<i> (roster)`；找不到是 null）, fn, dur, member（名冊的人的模型 holder，不是零件）, from（呼叫端的檔案:行號）}。
// 零件物件 → 鍵每幀更新一次（舊零件 swap 時已經離開舞台，靠上一幀記下的對照找回來）。label(text)：之後的呼叫都標這個字串
export function blinkLog(show) {
  const calls = [], keyOf = new Map(), holders = new WeakSet(), blink = show.blink, update = show.update;
  let label = '';
  const snap = () => {
    for (const k of show.stage.partKeys()) { const o = show.stage.partObject(k); if (o) keyOf.set(o, k); }
    for (const k of show.roster.keys()) for (const m of show.roster.members(k)) if (m.holder) { keyOf.set(m.holder, `${k}#${m.i} (roster)`); holders.add(m.holder); }
  };
  const from = () => (new Error().stack.split('\n').slice(3).find(l => !l.includes('/helpers/show.js') && !l.includes('/show/blink.js')) ?? '').replace(/^.*\/(src|test)\//, '').replace(/\)$/, '').trim();
  const hook = fn => {
    const orig = blink[fn];
    if (!orig) return;
    blink[fn] = (o, dur, ...rest) => {
      if (!keyOf.has(o)) snap();
      calls.push({ label, object: o, key: keyOf.get(o) ?? null, fn, dur, member: holders.has(o), from: from() });
      return orig(o, dur, ...rest);
    };
  };
  for (const fn of ['part', 'grow', 'shrink']) hook(fn);
  show.update = (dt, t) => { snap(); return update(dt, t); };
  return { calls, label(text) { label = text; } };
}
