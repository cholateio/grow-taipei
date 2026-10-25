// 無頭演出層：fakedom、真 THREE、真 people、假 assets（spawn → Group 帶 userData.mixer stub、release 記錄）、真 glow、
// 假 rig（記錄 panTo／home）、world 記錄。測試與 tools/pace.mjs 都用它在 Node 裡把回合一幀一幀演完。
import * as THREE from '../../vendor/three/three.module.js';
import * as spec from '../../src/rules/spec.js';
import { installFakeDom } from './fakedom.js';
import { createGlowRegistry } from '../../src/scene/glow.js';
import { createPeople } from '../../src/scene/people.js';

installFakeDom();
const { createShow } = await import('../../src/show/index.js');
const IDS = ['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon', 'satellites'];
export const ALL = await Promise.all(IDS.map(id => import(`../../src/actors/${id}.js`)));

const DT = 1 / 30, LIMIT = 120;

export async function headlessShow({ modules = ALL, reducedMotion = false } = {}) {
  const spawned = [], released = [];
  const assets = {
    spawned, released,
    spawn: async (path, opts = {}) => { const g = new THREE.Group(); g.userData.mixer = { timeScale: 1 }; opts.parent?.add(g); spawned.push(g); return g; },
    release: g => { released.push(g); g.removeFromParent(); },
    update() {},
  };
  const people = createPeople(THREE, { max: 48 });
  const rigLog = [];
  const rig = { log: rigLog, panTo(t, ms) { rigLog.push(['panTo', t, ms]); }, home(ms) { rigLog.push(['home', ms]); } };
  const worldLog = [], bubblesLog = [];
  const scene = new THREE.Scene(); scene.add(people.group);
  const show = createShow(THREE, {
    scene, spec, modules, ctx: { people, assets, glow: createGlowRegistry(), weather: { rain: 0 }, rail: { offset: 0 } },
    rig, world: (effects, instant) => worldLog.push([effects, instant]), reducedMotion,
  });
  // 每次 bubbles.show／levelUp 記下 { kind | text, at }（at = 出現那一刻頭上的位置）
  const { show: showBubble, levelUp } = show.bubbles;
  show.bubbles.show = (head, kind, dur) => { bubblesLog.push({ kind, at: head() }); return showBubble(head, kind, dur); };
  show.bubbles.levelUp = (head, opts = {}) => { bubblesLog.push({ text: opts.text ?? 'LEVEL UP', down: !!opts.down, at: head() }); return levelUp(head, opts); };

  // 演一回合（onMark 照傳給 show.turn）：instant 包在 reduced-motion 裡瞬間跑完回 0；否則每幀 update(1/30) 到 Promise resolve，回傳秒數
  async function run(events, { montage = false, instant = false, onMark } = {}) {
    if (instant) {
      show.setReducedMotion(true);
      try { await show.turn(events, { montage, onMark }); } finally { show.setReducedMotion(false); }
      return 0;
    }
    const p = show.turn(events, { montage, onMark });
    let t = 0, done = false, err = null;
    p.then(() => { done = true; }, e => { done = true; err = e; });
    while (!done) {
      show.update(DT, t); t += DT;
      await Promise.resolve();
      if (t > LIMIT) throw new Error(`turn exceeded ${LIMIT} s`);
    }
    if (err) throw err;
    return show.elapsed;
  }

  return { show, people, assets, rig, worldLog, bubblesLog, run, scene };
}

// TODO(Task 11)：playItem(show, run, order, itemId, check /* (e, secs) */)
//   照 order 放完一局：itemId 的 placed／grow 事件單獨 live 演並呼叫 check，其他事件 instant；每回合最後 settle instant
