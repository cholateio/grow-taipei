// 颱風（§5.1）：灰雲 → 暴風圈與大雨（有珍奶就有外送機車在雨中繞）→ 雨過天晴：彩虹、河濱公園。
// 「所有房子換新屋頂」由各模組的 roofColor(…, rebuilt(lv)) 處理。
// 劇本（§8.5）：颱風雲是主角——飄進來 → 登陸、全島躲雨 → 全島檢查（大停電、淹水、鼠災、颱風假、外送）→ 雨過天晴；賴著不走就飄到巨蛋上空。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { TOP, cellAt } from '../scene/hex.js';
import { LAMP_STOPS } from './bulb.js';
import { mulberry32 } from '../scene/random.js';
import { C, offset } from './palette.js';

export const id = 'typhoon';
export const labelY = 1.0;
const CLOUD = 0x9aa7b8, STORM = 0x6b7280, SCOOTER_R = 1.95;

// 颱風賴在巨蛋（§8.5）：棒球 ≥3 時 Lv3 長不出來（要棒球 ≤2），引擎也沒有 stall 事件——登陸回合過後，
// 暴風雲改停在巨蛋上空（下一回合第一次套用時舞台白光換到那裡），玩家看得到它卡在什麼上面
const lingers = (lv, meta) => lv.typhoon === 2 && lv.baseball >= 3 && !meta.landing;

export function view(lv, flags, meta = {}) {
  const n = lv.typhoon, at = anchorWorld('typhoon'), v = {};
  if (!n) return v;
  if (n === 1) v['typhoon.main'] = { kind: 'cloud', at, labelY: 3.9, footprint: false, parts: [
    { kind: 'sphere', pos: [0, 4.5, 0], scale: 1.4, color: CLOUD }, { kind: 'sphere', pos: [0.8, 4.35, 0.1], scale: 1.0, color: CLOUD }, { kind: 'sphere', pos: [-0.75, 4.4, -0.1], scale: 0.9, color: CLOUD },
  ] };
  else if (n === 2) v['typhoon.main'] = { kind: 'cloud', at: lingers(lv, meta) ? anchorWorld('baseball') : at, labelY: 3.9, spin: 0.5, footprint: false, parts: [
    { kind: 'sphere', pos: [0, 4.6, 0], scale: 1.6, color: STORM },
    ...Array.from({ length: 7 }, (_, i) => { const a = i / 7 * Math.PI * 2; return { kind: 'sphere', pos: [Math.cos(a) * 2.2, 4.4 + (i % 2) * 0.2, Math.sin(a) * 2.2], scale: 1.1 - (i % 3) * 0.12, color: STORM }; }),
  ] };
  else {
    // 彩虹：細環（rail）半截沉在水下，立在台地後面當背景，不擋住火山。自己一個零件（雲散了沒有 main）：Lv3 劇本讓它從台地後升起
    v['typhoon.rainbow'] = { kind: 'compound', at, shadow: false, footprint: false, parts: [C.coral, C.yellow, C.blue].map((c, i) => ({ kind: 'rail', pos: [0.6, -0.3, -5.2], scale: 11 - i * 0.6, rot: [0, 0.2, 0], color: c })) };
    const park = landmarkWorld('park');
    v['typhoon.park'] = { kind: 'compound', at: park, parts: [
      { kind: 'box', pos: [0, 0.01, 0], scale: [1.1, 0.02, 0.3], rot: [0, 0.6, 0], color: C.sand },
      ...[[-0.35, 0.25], [0.35, -0.2]].flatMap(([x, z]) => [{ kind: 'box', pos: [x, 0.1, z], scale: [0.36, 0.04, 0.12], rot: [0, 0.6, 0], color: C.wood }, { kind: 'box', pos: [x, 0.05, z], scale: [0.3, 0.1, 0.03], rot: [0, 0.6, 0], color: C.ink }]),
      ...[[0.3, 0.35, 0xf2b5c6], [0.45, 0.2, C.yellow], [-0.2, -0.35, 0xf2b5c6]].flatMap(([x, z, c]) => [{ kind: 'cylinder', pos: [x, 0.08, z], scale: [0.015, 0.16, 0.015], color: 0x6f9560 }, { kind: 'sphere', pos: [x, 0.17, z], scale: 0.07, color: c }]),
      { kind: 'trunk', pos: [-0.45, 0.2, -0.1], scale: [0.1, 0.4, 0.1], color: C.wood }, { kind: 'leaf', pos: [-0.45, 0.55, -0.1], scale: 0.5, color: 0x8aaf70 },
    ] };
  }
  if (n === 2) {
    v['typhoon.rain'] = { kind: 'rain', at: { x: 0, y: 0, z: 0 }, footprint: false };
    if (lv.boba >= 1) v['typhoon.scooter'] = { kind: 'scooter', at: { x: 0, y: TOP, z: 0 }, footprint: false };
  }
  return v;
}

export const builders = {
  // 雲：上下漂；暴風圈整團繞 y 轉
  cloud(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts }), object = new THREE.Group();
    object.add(part.object);
    return { object, update(dt, t) { part.object.position.y = Math.sin(t * 0.8) * 0.08; if (spec.spin) part.object.rotation.y += dt * spec.spin; }, dispose: part.dispose };
  },
  // 大雨：240 根半透明雨絲在半徑 8 內從 6 落到 0 循環，不投影。ctx.weather.rain（0–1，app 每幀淡入）決定下幾根、多濃
  rain(THREE, spec, ctx) {
    const N = 240, rnd = mulberry32(5), object = new THREE.Group();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.35, 0.02), new THREE.MeshBasicMaterial({ color: 0xa4d4da, transparent: true, opacity: 0.6, depthWrite: false }), N);
    mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false; object.add(mesh);
    const drops = Array.from({ length: N }, () => { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 8; return { x: Math.cos(a) * r, z: Math.sin(a) * r, ph: rnd() }; });
    const m = new THREE.Matrix4(), tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0.1)), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    return {
      object,
      update(dt, t) {
        const k = ctx.weather?.rain ?? 1;
        mesh.count = Math.round(N * k); mesh.material.opacity = 0.6 * Math.min(1, 0.4 + k * 0.6);
        drops.forEach((d, i) => { const y = 6 - ((d.ph + t) * 6 % 6); mesh.setMatrixAt(i, m.compose(p.set(d.x, y, d.z), tilt, one)); });
        mesh.instanceMatrix.needsUpdate = true;
      },
      dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
    };
  },
  // 颱風天外送：珊瑚色機車載著戴黃安全帽的騎士，沿中心格的步道繞圈
  scooter(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [
      { kind: 'box', pos: [0, 0.14, 0], scale: [0.14, 0.12, 0.42], color: C.coral },
      { kind: 'box', pos: [0, 0.24, -0.12], scale: [0.2, 0.12, 0.16], color: C.ink },
      { kind: 'torus', pos: [0, 0.07, 0.17], scale: 0.13, rot: [0, Math.PI / 2, 0], color: C.ink }, { kind: 'torus', pos: [0, 0.07, -0.17], scale: 0.13, rot: [0, Math.PI / 2, 0], color: C.ink },
      { kind: 'box', pos: [0, 0.3, 0.02], scale: [0.1, 0.16, 0.08], color: C.blue },
      { kind: 'sphere', pos: [0, 0.43, 0.02], scale: 0.12, color: C.skin }, { kind: 'dome', pos: [0, 0.44, 0.02], scale: 0.15, color: C.yellow },
    ] }), object = new THREE.Group();
    object.add(part.object);
    return {
      object,
      update(dt, t) { const a = t * 1.2; part.object.position.set(Math.cos(a) * SCOOTER_R, 0, Math.sin(a) * SCOOTER_R); part.object.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); },
      dispose: part.dispose,
    };
  },
};

// ── 劇本（§8.5）──
// 名單、位置都是演到那一拍才查（劇本在回合開始時一次建好，那時還不知道誰在哪）；once 查到第一次就記住，整段同一批人。
const AT = anchorWorld('typhoon'), DOME = anchorWorld('baseball'), GATE = offset(DOME, 0, 1.1), BOBA = anchorWorld('boba');
const CLOUD_Y = 3.9, HURRY = 2.0, FLUSHED = 4.0;   // 雲頭上的泡泡高度；趕著躲雨的走路速度；老鼠被大水沖（兩倍速）
const DOOR_MIN = 0.35;   // 算「建築」的 footprint 最小半寬（路燈 0.15、牛奶箱 0.3 不算門）
const FLASH = 0.5;       // 白光長度（同 show/flash.js）
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };

// 全島看得見的小人：所有名冊裡 people 的成員（模型的老鼠不算），躲起來的不算
const everyone = c => c.roster.keys().flatMap(k => c.roster.members(k)).filter(m => m.kind === 'people' && !m.hidden);
// 最近的建築門口：離 pos 最近的主島建築（footprint 中心），從它面向 pos 那一側找最近的可走點；沒有建築就原地
function nearestDoor(c, pos) {
  const ext = f => f.r ?? Math.min(f.w, f.d) / 2;
  const fps = c.stage.footprints().filter(f => ext(f) >= DOOR_MIN && cellAt(f.x, f.z));
  if (!fps.length) return pos;
  const f = fps.reduce((a, b) => (Math.hypot(b.x - pos.x, b.z - pos.z) < Math.hypot(a.x - pos.x, a.z - pos.z) ? b : a));
  const d = Math.hypot(pos.x - f.x, pos.z - f.z) || 1, k = ext(f) * 0.9 / d;
  return c.nav.nearestWalkable({ x: f.x + (pos.x - f.x) * k, z: f.z + (pos.z - f.z) * k });
}
// 一群人同時演，名單演到才算：together 要在建拍時給齊子拍，這裡在 start 才建（名單空的就跳過）
function crowd(B, fn) {
  let inner = null;
  return {
    kind: 'crowd',
    dur: c => (inner ? inner.dur(c) : 0),
    start(c) { const beats = fn(c); if (!beats.length) return false; inner = B.together(beats); inner.start(c); },
    step(k, dt, c) { inner.step(k, dt, c); },
    end(c) { inner?.end(c); inner = null; },
  };
}
// 走到門口就躲進去（藏起來，整回合躲著；下一回合開始 show.turn 會 showAll，跳過時 snap 也會全部露出來）
function toDoor(B, m) {
  const w = B.walk(m, c => nearestDoor(c, m.pos), { speed: HURRY }), end = w.end;
  w.end = c => { end(c); c.roster.hide(m); };
  return w;
}
// 名冊成員露出來（0 秒）：躲進門裡的人出來演自己的戲（淹水的站務員、換身分後的泳客）
const reveal = who => ({ kind: 'unhide', dur: 0, start(c) { for (const m of who(c) ?? []) c.roster.show(m); return false; } });
// 外送機車：登陸時先建好藏著（零件鍵 0 秒），外送那一拍才在攤車白光、最亮時露出來
function flashIn(key, at) {
  let obj = null;
  return {
    kind: 'flashIn', dur: FLASH,
    start(c) { obj = c.stage.partObject(key); if (!obj || obj.visible) return false; c.flash.at(at, { onPeak: () => { if (obj) obj.visible = true; } }); },
    end() { if (obj) obj.visible = true; obj = null; },
  };
}
const cloudHead = ctx => ctx.B.partHead('typhoon.main', CLOUD_Y, ctx);

// 大停電：路燈從主路最後一站往回一站站熄 → 燈泡本身、夜市、燈塔、風車 → 101 頂 ！ → 全島發光歸零 →
// 牛奶箱變灰（和剩下的零件同一次套用：鮮奶掉級的校舍等等，LEVEL DOWN 之後就沒有白光了）→ LEVEL DOWN
function blackout(e, ctx) {
  const { B } = ctx, n = LAMP_STOPS.length;
  return [
    ...Array.from({ length: n }, (_, i) => B.apply(e, { only: [`bulb.lamps.${n - 1 - i}`] })),
    B.apply(e, { only: ['bulb.main', 'bulb.market', 'sat.lighthouse', 'sat.windmill'] }),
    B.bubble('tower', '！', 0.8), B.world({ glowScale: 0 }),
    B.apply(e), B.levelUp('milk', { down: true }),
  ];
}
// 捷運淹水：站務員從門裡出來 ！ → 站體白光變泳池、站務員原地換成泳客（staff 和 swimmers 同一次套用，不然 flush 會補出幽靈站務員）、列車停駛
function flooded(e, ctx) {
  const { B } = ctx, st = once(c => c.roster.members('token.staff')[0] ?? null);   // 他登陸時躲起來了：不濾 hidden
  return [
    reveal(c => [].concat(st(c) ?? [])), B.bubble(st, '！', 0.8),
    B.apply(e, { only: ['token.main', 'token.swimmers', 'token.staff', 'token.train', 'token.shuttle'] }),
    reveal(c => c.roster.members('token.swimmers')),   // hidden 跟著成員走：保險起見泳客全部露出來
  ];
}
// 大巨蛋鼠災：老鼠們被大水沖到巨蛋門口（兩倍速）→ 兩個工作人員從巨蛋門口出來追
function domeRats(e, ctx) {
  const { B } = ctx, staff = i => c => c.roster.members('baseball.staff')[i] ?? null;
  return [
    crowd(B, c => { const rats = c.roster.members('rat.pack'), slots = c.nav.slots(GATE, rats.length, 0.6); return rats.map((m, i) => B.walk(m, slots[i], { speed: FLUSHED })); }),
    B.apply(e, { hold: ['baseball.staff'] }),
    B.spawn('baseball.staff', GATE), B.spawn('baseball.staff', GATE),
    B.together([0, 1].map(i => B.walk(staff(i), c => c.nav.slots(GATE, 2, 0.6)[i]))),
    B.home([staff(0), staff(1)]),
  ];
}

export const script = {
  // 烏雲從台地後面飄進來停在島上空 → ……
  placed(e, s, ctx) {
    const { B } = ctx;
    return [B.apply(e, { flash: false }), B.move('typhoon.main', { from: { dx: -6, dy: 0, dz: -5 }, to: 0, dur: 4 }), B.bubble(cloudHead(ctx), '……', 1.5)];
  },
  grow: {
    // 登陸：雲鼓脹 → 白光變暴風圈、下大雨 → 全島小人 ！ → 各自快走到最近的建築門口、到了就躲進去（整回合躲著）→
    // 船消失、風車狂轉（外送機車先建好藏著，等外送那一拍）→ LEVEL UP。全島檢查是之後的 fx 事件
    2(e, s, ctx) {
      const { B } = ctx, cast = once(c => everyone(c));
      return [
        B.gesture('typhoon.main', 'puff'),
        B.apply(e, { only: ['typhoon.main', 'typhoon.rain'] }), B.world({ storm: 1, rain: 1 }),
        crowd(B, c => cast(c).map(m => B.bubble(m, '！', 0.8))),
        crowd(B, c => cast(c).filter(m => cellAt(m.pos.x, m.pos.z)).map(m => toDoor(B, m))),   // 衛星島上的人不走（走路格只有主島）
        B.apply(e, { only: ['typhoon.scooter'], flash: false }), B.hideParts('typhoon.scooter'),
        B.apply(e), B.levelUp('typhoon'),
      ];
    },
    // 雨過天晴：雲、雨、機車白光散掉 → 天晴 → 彩虹從台地後升起 → 河濱公園 → 小人一起 ♪ 回日常 → 屋頂依序換色 → LEVEL UP
    // （人在回合開始時已經 showAll 出來了）
    3(e, s, ctx) {
      const { B } = ctx;
      return [
        B.apply(e, { only: ['typhoon.main', 'typhoon.rain', 'typhoon.scooter'] }), B.world({ storm: 0, rain: 0 }),
        B.apply(e, { only: ['typhoon.rainbow'], flash: false }), B.scaleIn('typhoon.rainbow', { dur: 1.5 }),
        B.apply(e, { only: ['typhoon.park'] }),
        crowd(B, c => everyone(c).map(m => B.bubble(m, '♪', 1.0))), B.home(everyone),
        B.apply(e), B.levelUp('typhoon'),
      ];
    },
  },
  // 登陸後的全島檢查（spec.js 颱風 onLevel 2，事件的 cause 都是 typhoon）
  fx(e, s, ctx) {
    const { B } = ctx;
    if (e.flag?.name === 'blackout') return blackout(e, ctx);
    if (e.flag?.name === 'flooded') return flooded(e, ctx);
    if (e.flag?.name === 'domeRats') return domeRats(e, ctx);
    if (e.delta?.target === 'boba') return [flashIn('typhoon.scooter', BOBA), B.apply(e), B.levelUp('boba')];   // 外送爆單：機車從攤車白光出現、繞圈 → 珍奶升級
    if (e.story?.includes('颱風假')) return [B.apply(e), B.bubble(B.partHead('milk.main', 1.2, ctx), '♪', 1.0)];
    return null;
  },
  // 賴著不走（stall 事件；現在的規則不會出，賴在巨蛋改由 view 的 lingers 處理）：雲飄到巨蛋上空停著（move 的偏移留在零件上）→ ……
  stall(e, s, ctx) {
    const { B } = ctx;
    return [B.move('typhoon.main', { to: { dx: DOME.x - AT.x, dy: 0, dz: DOME.z - AT.z }, dur: 2 }), B.bubble(cloudHead(ctx), '……', 1.0)];
  },
  rep: () => null,   // 颱風沒有等待
};
