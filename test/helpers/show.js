// 無頭演出層：fakedom、真 THREE、真 people、假 assets（spawn → Group 帶 userData.mixer stub、release 記錄）、真 glow、
// 假 rig（記錄 panTo／focus／home）、world 記錄。測試與 tools/pace.mjs 都用它在 Node 裡把回合一幀一幀演完。
import * as THREE from '../../vendor/three/three.module.js';
import * as spec from '../../src/rules/spec.js';
import * as engine from '../../src/rules/engine.js';
import { installFakeDom } from './fakedom.js';
import { createGlowRegistry } from '../../src/scene/glow.js';
import { createPeople } from '../../src/scene/people.js';
import { mulberry32 } from '../../src/scene/random.js';

installFakeDom();
const { createShow } = await import('../../src/show/index.js');
const IDS = ['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon', 'satellites'];
export const ALL = await Promise.all(IDS.map(id => import(`../../src/actors/${id}.js`)));

const DT = 1 / 30, LIMIT = 120;

// seed：名冊與走路格的亂數種子，同一個種子每次演出的秒數一模一樣
// rig：換成真的鏡頭 rig（測試鏡頭最後停在哪）；run 每幀也推它
export async function headlessShow({ modules = ALL, reducedMotion = false, seed = 21, rig: realRig = null } = {}) {
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
    scene, spec, modules, ctx: { people, assets, glow: createGlowRegistry(), weather: { rain: 0 }, rail },
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
  async function run(events, { montage = false, instant = false, onMark } = {}) {
    cam = 0;
    if (instant) {
      show.setReducedMotion(true);
      try { await show.turn(events, { montage, onMark }); } finally { show.setReducedMotion(false); }
      return 0;
    }
    const p = show.turn(events, { montage, onMark });
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

// 照 order 放完一局：itemId 的 placed／grow 事件單獨 live 演並呼叫 check(e, secs)，其他事件 instant；每回合最後 settle instant
// （單獨演一個事件沒問題：回合末的 apply 會補完剩下的零件，settle 瞬間結算）
export async function playItem(show, run, order, itemId, check) {
  let s = engine.createState(spec);
  for (const id of order) {
    const r = engine.place(s, id, spec); s = r.state;
    for (const e of r.events) {
      if (e.item === itemId && (e.kind === 'placed' || e.kind === 'grow')) { const secs = await run([e]); await check(e, secs); }
      else await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
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
