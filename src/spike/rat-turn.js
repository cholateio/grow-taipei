// 【試作，拋棄式】老鼠回合：照 GROW Island 的做法把「放鮮奶」這一回合寫成一條主線（docs/research/2026-10-25-rat-turn-script.md）。
// 這裡是一個「腳本導演」：遊戲把這回合的事件交給它，它照自己的時間軸決定什麼時候套用哪個事件、角色怎麼走。
// 確認手感後要依這個做法重寫演出層，這個檔案就刪掉。
import { CSS2DObject } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';
import { anchorWorld, routeBetween } from '../actors/anchors.js';
import { TRACK, trainPose } from '../actors/token.js';
import { offset } from '../actors/palette.js';
import { createPathCursor, measurePath } from '../scene/path.js';
import { ringPath } from '../scene/people.js';

const RAT = 'quat/enemies/Rat.glb', RUN = 2.0, RIM = 6.9, TRAIN_SPEED = 0.35;
const STATION_A = Math.atan2(4.14, 2.39), NEST_A = Math.atan2(4.14, -2.39);   // 捷運站那格、老鼠窩那格對島心的方位
const rim = a => ({ x: Math.cos(a) * RIM, y: 0.65, z: Math.sin(a) * RIM });

export function createRatTurn(THREE, { scene, stage, assets, rail, people }) {
  const group = new THREE.Group(); group.name = 'spike:rat'; scene.add(group);
  let onEvent = null, events = [], resolve = null, busy = false;
  let T = 0, END = 0, now = 0;              // T：回合內時間；now：全域時間（列車用）
  const actions = [], tweens = [], labels = [];
  const rats = [];                           // 五隻老鼠：{ holder, cursor?, pos, yaw, mode }

  // ---- 時間軸小工具 ----
  const log = (...a) => console.warn(`[spike] T=${T.toFixed(1)}`, ...a);
  const at = (t, fn) => actions.push({ t, fn });
  const during = (t0, dur, fn, done, start) => tweens.push({ t0, t1: t0 + dur, fn, done, start, started: false });
  const fire = (kind, item) => { const e = events.find(x => x.kind === kind && (!item || x.item === item)); log('fire', kind, item ?? ''); if (e) onEvent(e, { instant: true }); };

  function label(cls, html, pos, dur, follow = null) {
    log(cls, html.replace(/<[^>]+>/g, ''), pos.x.toFixed(1), pos.z.toFixed(1));
    const el = document.createElement('div'); el.className = cls; el.innerHTML = html;
    const obj = new CSS2DObject(el); obj.position.set(pos.x, pos.y, pos.z); group.add(obj);
    labels.push({ obj, until: T + dur, follow });
  }
  const flash = p => label('flash', '', { x: p.x, y: p.y + 0.3, z: p.z }, 0.55);
  const levelUp = p => label('actor-float', '<span class="rise">LEVEL UP</span>', p, 2.2);
  const emote = (text, pos, dur, follow = null, cls = '') => label('emote', `<span class="${cls}">${text}</span>`, pos, dur, follow);

  // ---- 老鼠 ----
  const place = (r, p) => { r.pos = { x: p.x, y: p.y, z: p.z }; if (p.yaw !== undefined) r.yaw = p.yaw; if (r.holder) { r.holder.position.set(r.pos.x, r.pos.y, r.pos.z); r.holder.rotation.y = r.yaw; } };
  const head = r => ({ x: r.pos.x, y: r.pos.y + 0.35, z: r.pos.z });
  function spawnRats(nest) {
    const ring = ringPath(nest, 0.7, nest.y);
    for (let i = 0; i < 5; i++) {
      const r = { holder: null, cursor: createPathCursor(ring), pos: { ...ring[0] }, yaw: 0, mode: 'loiter', speed: 0.6 };
      r.cursor.advance(i * 0.2 * r.cursor.total);
      assets.spawn(RAT, { h: i ? 0.18 : 0.22, anim: 'Walk', parent: group }).then(m => { if (r.mode === 'gone') { assets.release(m); return; } r.holder = m; place(r, r.pos); }).catch(() => {});
      rats.push(r);
    }
  }
  // 沿路線走：pathFn 在出發那一刻才算（起點是老鼠當時的位置）；回傳要花的秒數（主線時間表靠這個排）
  function walk(r, t0, pathFn, speed = RUN) {
    const dur = measurePath(pathFn(), false).at(-1) / speed;
    let path = null;
    during(t0, dur, (k, dt) => { if (!r.cursor) return; r.cursor.advance(dt * speed); place(r, r.cursor.locate()); },
      () => { r.mode = 'stand'; r.cursor = null; place(r, { ...path.at(-1), yaw: r.yaw }); },
      () => { path = pathFn(); r.mode = 'walk'; r.cursor = createPathCursor(path, { loop: false }); log('walk', rats.indexOf(r), path.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' > '), dur.toFixed(1) + 's'); });
    return dur;
  }
  // 跳到會動的目標（列車車頂）：拋物線，目標每幀重算
  function jump(r, t0, target, dur = 0.5) {
    let p0 = null;
    during(t0, dur, k => { const q = target(); const y = p0.y + (q.y - p0.y) * k + Math.sin(Math.PI * k) * 0.7;
      place(r, { x: p0.x + (q.x - p0.x) * k, y, z: p0.z + (q.z - p0.z) * k, yaw: q.yaw }); },
      () => { r.mode = 'ride'; r.ride = target; }, () => { p0 = { ...r.pos }; r.mode = 'jump'; r.cursor = null; log('jump', rats.indexOf(r), p0.x.toFixed(1), p0.z.toFixed(1)); });
  }
  const roof = car => () => { const p = trainPose(now + rail.offset, car, { speed: TRAIN_SPEED }); return { x: p.x, y: p.y + 0.18, z: p.z, yaw: p.yaw }; };

  // ---- 腳本 ----
  function script() {
    const nest = anchorWorld('rat'), milk = anchorWorld('milk'), crate = offset(milk, -0.95, 0.75), token = anchorWorld('token');
    const chip = anchorWorld('chip'), dome = anchorWorld('baseball'), gate = offset(dome, 0, 1.1), center = { x: -0.6, y: 0.65, z: 0.9 };
    const platform = offset(token, 0.9, 0.9), stationRim = rim(STATION_A), nestRim = rim(NEST_A);
    const hero = rats[0], pack = rats.slice(1);
    const trainObj = () => stage.partObject('token.train'), packObj = () => stage.partObject('rat.pack');

    let t = 0.5;
    at(t, () => { flash(crate); fire('placed', 'milk'); });
    t += 1.0;
    at(t, () => { for (const r of rats) r.speed = 0; emote('！', head(hero), 1.0, () => head(hero)); });
    t += 1.0;
    t += walk(hero, t, () => routeBetween([-1, 1], hero.pos, [-1, 0], offset(crate, 0.35, 0.2)), RUN);   // 出窩跑去鮮奶箱
    at(t, () => { for (const r of pack) r.speed = 0.6; emote('♥', head(hero), 1.5, () => head(hero), 'heart'); });
    during(t, 1.5, k => place(hero, { ...hero.pos, yaw: hero.yaw + Math.sin(k * Math.PI * 6) * 0.05 }));   // 聞一聞
    t += 1.5;
    at(t, () => { flash(offset(chip, 0, 0, 0.6)); fire('grow', 'chip'); levelUp(offset(chip, 0, 0, 1.6)); });   // 北士科園區成形
    t += 2.5;
    t += walk(hero, t, () => routeBetween([-1, 0], hero.pos, [0, 0], center), RUN);   // 喝飽，往中央走
    const tOpen = t;
    at(tOpen, () => { flash(offset(token, 0, 0, 0.5)); fire('grow', 'token'); levelUp(offset(token, 0, 0, 1.3)); emote('！', head(hero), 1.0, () => head(hero));
      const track = stage.partObject('token.track'); if (track) track.scale.y = 1e-3;
      if (trainObj()) trainObj().visible = false; if (packObj()) packObj().visible = false; });
    during(tOpen, 0.8, k => { const track = stage.partObject('token.track'); if (track) track.scale.y = Math.max(1e-3, k); });   // 環狀線從海面升起
    const tTrain = tOpen + 1.0, tRun = tOpen + 1.5;
    const toRim = () => [...routeBetween([0, 0], center, [0, 1], platform), stationRim];
    const tBoard = tRun + walk(hero, tRun, toRim, RUN * 1.1) + 1.0;   // 改道跑去捷運站、島緣，等一秒
    // 列車出現在東邊，車頭剛好在老鼠等到的那一刻經過站前的島緣
    at(tTrain, () => { const a0 = STATION_A - (tBoard - tTrain) * TRAIN_SPEED; flash(trainPose(a0 / TRAIN_SPEED, 0)); rail.offset = a0 / TRAIN_SPEED - now; if (trainObj()) trainObj().visible = true; });
    at(tBoard - 1.0, () => emote('……', head(hero), 1.0, () => head(hero)));
    jump(hero, tBoard, roof(0));
    at(tBoard + 0.5, () => { fire('grow', 'rat'); if (packObj()) packObj().visible = false; levelUp(head(hero)); });   // 老鼠 3：整窩會坐上車頂，先藏著等牠們真的跳上去
    at(tBoard + 0.3, () => { for (const r of pack) emote('！', head(r), 0.8, () => head(r)); });
    pack.forEach((r, i) => {
      const t0 = tBoard + 0.6 + i * 0.15, dur = walk(r, t0, () => [r.pos, offset(nestRim, -i * 0.15, i * 0.1)], RUN);
      at(t0 + dur, () => emote('……', head(r), 0.8, () => head(r)));
    });
    const tPass = tBoard + (NEST_A - STATION_A) / TRAIN_SPEED;   // 車頭到老鼠窩那側
    pack.forEach((r, i) => jump(r, tPass + i * 0.15, roof((i + 1) % 3)));
    at(tPass + 1.2, () => { if (packObj()) packObj().visible = true; for (const r of rats) { r.mode = 'gone'; if (r.holder) assets.release(r.holder); } });   // 換回舞台的車頂老鼠
    at(tPass + 0.4, () => emote('♪', roof(0)(), 1.2, roof(0)));
    at(tPass + 1.4, () => { flash(gate); fire('grow', 'baseball'); levelUp(offset(dome, 0, 0, 1.3)); });   // 列車帶來觀眾，比賽開打
    END = tPass + 4.0;
    at(END, () => { fire('settle'); });
  }

  function update(dt, t) {
    now = t;
    if (!busy) return;
    T += dt;
    actions.sort((a, b) => a.t - b.t);
    while (actions.length && actions[0].t <= T) actions.shift().fn();
    for (const tw of tweens) {
      if (T < tw.t0 || tw.finished) continue;
      if (!tw.started) { tw.started = true; tw.start?.(); }
      const k = Math.min(1, (T - tw.t0) / (tw.t1 - tw.t0)); tw.fn(k, dt);
      if (k >= 1) { tw.finished = true; tw.done?.(); }
    }
    for (const r of rats) if (r.mode === 'loiter' && r.cursor) { r.cursor.advance(dt * r.speed); place(r, r.cursor.locate()); } else if (r.mode === 'ride') place(r, r.ride());
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i]; if (l.follow) { const p = l.follow(); l.obj.position.set(p.x, p.y, p.z); }
      if (T >= l.until) { group.remove(l.obj); l.obj.element.remove(); labels.splice(i, 1); }
    }
    if (T >= END && !actions.length) finish();
  }
  function finish() {
    busy = false;
    for (const l of labels) { group.remove(l.obj); l.obj.element.remove(); } labels.length = 0;
    for (const r of rats) if (r.holder && r.mode !== 'gone') assets.release(r.holder); rats.length = 0;
    const ok = resolve; resolve = null; ok?.();
  }

  const director = {
    get busy() { return busy; },
    play(evs, cb) {
      if (busy) throw new Error('spike busy');
      busy = true; events = evs; onEvent = cb; T = 0; actions.length = 0; tweens.length = 0;
      const nestPack = stage.partObject('rat.pack'); if (nestPack) nestPack.visible = false;
      spawnRats(anchorWorld('rat')); script();
      return new Promise(r => { resolve = r; });
    },
    skip() { if (busy) T = END; },   // 跳到最後：剩下的動作一口氣做完
    abort() { if (busy) { actions.length = 0; tweens.length = 0; END = 0; T = 0; finish(); } },
    setReducedMotion() {},
  };
  return { director, update };
}
