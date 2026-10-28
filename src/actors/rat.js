// 老鼠（物品 v2 §4.6，max 5）：一隻在巨蛋附近晃（放置反應：鮮奶 ≤2 就咬牛奶箱、有珍奶就撞翻攤車）→ 一窩 5 隻
// → 搭捷運（列車有了：代幣 ≥4）或泡北投溫泉 → ◆ Lv4 分岔（引擎的 ratBranch）：機器鼠排隊跟偵防師（賽博）／變異鼠三眼綠光（外星）
// → ◆ Lv5：機器鼠軍團 10 隻繞 101、一隻戴王冠坐在捷運站頂 ／ 變異鼠加冕、石堆島綠光圈（satellites.js）、小 UFO 盤旋。
// 颱風把老鼠沖進大巨蛋：5 隻在巨蛋門口晃。模型用 Quaternius Easy Enemies 的 Rat。
// 全部老鼠是同一個名冊 rat.pack（§5.2：同一批老鼠上岸、生窩、上車、變身，不重生）；石堆小島上的兩隻是 satellites.js 的 rats 零件；
// 站頂的王冠鼠是零件（kind 'king'，不走路、不進名冊）。人數預算：名冊最多 10 隻＋王冠鼠（骨架動畫 ≤ 12，含柴犬）。
// 最終章 §7 賽博尾聲（flags.epilogue 'cyber'）：同一批 10 隻機器鼠的家搬到黑塔的平屋頂（ROOF_SPOTS，兩排各 5 隻面向鏡頭），
// 王冠鼠照舊坐站頂。屋頂在 101 的 footprint 裡、走不上去：finale.js 的尾聲劇本把牠們閃白放上去（不是走上去）。
// 最終章 §7 外星尾聲（flags.epilogue 'alien'）：變異鼠王的站位搬到 101 母艦的碟頂中心（SHIP_SPOT，面向鏡頭），頭上的小 UFO 不畫
// （三台大 UFO 取代它，finale.js）；碟頂走不上去，finale.js 的尾聲劇本把牠閃白放上去。
// 劇本（物品 v2 §6）：一級 3–5 秒；◆ Lv4、Lv5 6–10 秒（Lv5 回全景定格）。
import { anchorWorld, cellOf, landmarkWorld } from './anchors.js';
import { ENGINEER_ROUTE } from './chip.js';
import { CRATE } from './milk.js';
import { C, offset } from './palette.js';
import { ITEMS } from '../rules/spec.js';
import { compile } from '../rules/conditions.js';
import { trainCars, ROOF_Y, GAP, TRACK } from './token.js';
import { modelExtras } from '../show/roster.js';
import { body as towerBody, shipTop } from './tower.js';

export const id = 'rat';
export const labelY = 0.6;
const RAT = 'quat/enemies/Rat.glb', GREY = { Grey: 0xc0c8d0 };
const AT = anchorWorld('rat'), TOWER = anchorWorld('tower'), SPRING = landmarkWorld('spring'), DOME = anchorWorld('baseball');
const GATE = offset(DOME, 0, 1.1);                 // 巨蛋門口（鼠災時老鼠在這裡晃）
export const MUTANT = offset(SPRING, 0.1, 0.97, 0.05);  // 變異鼠站的溫泉邊：池子正前方（靠鏡頭）；原本 (−0.75, 0.55) 離木牌只有 0.22，錄影裡疊在一起（2026-10-27）；
// 牠在這裡時兩位溫泉客改站池子北側、離牠 ≥ 1.9（landmarks.js BATHERS_NORTH，2026-10-28）
const PARK = offset(anchorWorld('chip'), -0.5, 1.2);   // 園區門口（賽博 Lv4 老鼠在這裡變身）
// 王冠鼠坐的站頂：代幣 Lv9 起是賽博站的平屋頂（飛天車停在中線 z 0.02 的左中右、車身沿 ±z 長 0.3，牠坐空著的左後角、
// 面向站前廣場；天線在右後角）；之前是大車站圓頂外的簷角
const STATION = anchorWorld('token'), CORNICE_Y = 0.605;
export const kingSpot = token => (token >= 9 ? { ...offset(STATION, -0.48, -0.32, ROOF_Y), yaw: 0.8 } : { ...offset(STATION, -0.42, 0.32, CORNICE_Y), yaw: 0.6 });

// 黑塔屋頂上的站位（世界座標）：屋頂面高度、兩排各 5 隻（x 間距 0.26 ≥ 名冊的 0.25，不會被 separateStanding 推開），
// 前排 z +0.1、後排 z −0.26（離後緣的桅杆 0.36）；前緣 z +0.58 留給停好的紅色飛天跑車（finale.js CAR_PARK）。都面向 +z（鏡頭）
const ROOF = towerBody('lit', { dark: true }).roof;
export const ROOF_SPOTS = [0.1, -0.26].flatMap(z => [-0.52, -0.26, 0, 0.26, 0.52].map(x => ({ ...offset(TOWER, x, z, ROOF), yaw: 0 })));

// 母艦碟頂中心（世界座標，tower.js shipTop）
export const SHIP_SPOT = { x: TOWER.x, y: shipTop(), z: TOWER.z, yaw: 0 };
// 小 UFO 的零件（相對碟心）：銀色碟身＋碟緣＋綠色底光。finale.js 外星尾聲的三台大 UFO 照這個放大 2 倍
export const UFO_PARTS = [
  { kind: 'dome', pos: [0, 0, 0], scale: [0.9, 0.3, 0.9], color: 0xc0c8d0 }, { kind: 'cylinder', pos: [0, 0, 0], scale: [1.0, 0.04, 1.0], color: 0x9aa7b8 },
  { kind: 'sphere', pos: [0, -0.06, 0], scale: [0.35, 0.12, 0.35], color: C.alien, glow: C.alien },
];

// 依序判定；分岔旗標還沒到（同一回合稍晚的事件）時退回泡溫泉／搭捷運
export function ratMode(lv, flags) {
  if (!lv.rat) return null;
  if (flags.domeRats) return 'dome';
  if (lv.rat >= 4 && flags.ratBranch === 'alien') return 'alien';
  if (lv.rat >= 4 && flags.ratBranch === 'cyber') return 'cyber';
  if (lv.rat >= 3) return trainCars(lv.token) ? 'train' : 'spring';   // 物品 v2：列車代幣 Lv4 才有
  return lv.rat >= 2 ? 'nest' : 'one';
}

const wander = (at, r) => ({ kind: 'wander', at, r });
const pack = (at, n, home, model = {}) => ({ kind: 'roster', at, n, model: { path: RAT, h: 0.2, anim: 'Walk', ...model }, home });
// 泡溫泉：池子裡圍一圈五個位置，面向池心
const SPRING_SPOTS = Array.from({ length: 5 }, (_, i) => { const a = i / 5 * Math.PI * 2 + 0.3; return { ...offset(SPRING, Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.1), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) }; });

// 名冊入口（§13.2，view 的 home.entry）：補進來的老鼠從哪裡走來。泡溫泉：從窩那邊（溫泉格的格邊離池子都不到 1.5）；
// 賽博 Lv5 軍團：多的五隻從園區門口（原本五隻變身的地方）走去 101。其他模式用名冊預設（家那格邊上離家最遠的點）
export function view(lv, flags) {
  switch (ratMode(lv, flags)) {
    case null: return {};
    case 'one': return { 'rat.pack': pack(AT, 1, wander(AT, 0.7)) };
    // 鼠窩的 footprint 用圓（r 0.2 蓋住圓角盒）：包圍盒的角外擴 PAD 後會擦到窩邊那座橋上的電工主路（物品 v2：燈泡先放，電工繞島時老鼠正在生窩）
    case 'nest': return {
      'rat.main': { kind: 'compound', at: AT, footprint: { r: 0.2 }, parts: [{ kind: 'rbox', pos: [0, 0.12, 0], scale: [0.35, 0.24, 0.3], color: 0x9a6a3c }, { kind: 'sphere', pos: [0, 0.12, 0.15], scale: [0.12, 0.1, 0.04], color: C.ink }] },
      'rat.pack': pack(AT, 5, wander(AT, 0.7)),
    };
    case 'spring': return { 'rat.pack': pack(SPRING, 5, { kind: 'stand', spots: SPRING_SPOTS, entry: AT }) };
    case 'train': return { 'rat.pack': pack(AT, 5, { kind: 'ride', cars: trainCars(lv.token), speed: flags.flooded ? 0 : 0.35 }) };
    // Lv5 最終型態：機器鼠軍團 10 隻繞 101＋站頂一隻戴王冠（骨架動畫上限 12：10 + 王冠鼠 + 柴犬；石堆小島的兩隻這時不畫）
    // 賽博尾聲：軍團站上黑塔屋頂（同一個名冊、同一批老鼠，只是家搬了）
    case 'cyber': return lv.rat >= 5
      ? { 'rat.pack': pack(TOWER, 10, flags.epilogue === 'cyber' ? { kind: 'stand', spots: ROOF_SPOTS } : { ...wander(TOWER, 1.3), entry: PARK }, { tint: GREY, antenna: true }),
        'rat.king': { kind: 'king', at: kingSpot(lv.token), model: { path: RAT, h: 0.2, anim: 'Idle', tint: GREY, antenna: true, crown: true }, footprint: false } }
      : { 'rat.pack': pack(ENGINEER_ROUTE[0], 5, { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.6 }, { tint: GREY, antenna: true }) };
    case 'alien': {
      // Lv5 變異鼠加冕（戴王冠）、頭上盤旋一艘小 UFO（鋪外星結局）；石堆島的綠光圈在 satellites.js
      const crown = lv.rat >= 5 ? { crown: true } : {};
      // 外星尾聲：站位搬上母艦碟頂、小 UFO 不畫（同一隻、同一個模型）
      const ship = lv.rat >= 5 && flags.epilogue === 'alien';
      const v = { 'rat.pack': pack(MUTANT, 1, { kind: 'stand', spots: [ship ? SHIP_SPOT : { ...MUTANT, yaw: 0 }] }, { h: 0.5, tint: { Grey: C.alien }, glow: { Grey: C.alien }, eye: true, wave: true, ...crown }) };
      if (lv.rat >= 5 && !ship) v['rat.ufo'] = { kind: 'ufo', at: offset(MUTANT, 0, 0, 1.3), footprint: false };
      return v;
    }
    case 'dome': return { 'rat.pack': pack(GATE, 5, wander(GATE, 0.9)) };
  }
}

export const builders = {
  // 小 UFO：銀色碟 + 綠色底光，在原地小圓盤旋、上下飄
  ufo(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: UFO_PARTS }), object = new THREE.Group(); object.add(part.object);
    return { object, update(dt, t) { part.object.position.set(Math.cos(t * 0.8) * 0.3, Math.sin(t * 1.7) * 0.08, Math.sin(t * 0.8) * 0.3); part.object.rotation.y += dt * 2; }, dispose: part.dispose };
  },
  // 王冠鼠：一隻機器鼠（Idle）坐在站頂，天線＋王冠和名冊的模型配件同一套（roster.js modelExtras）
  king(THREE, spec, ctx) {
    const object = new THREE.Group(), md = spec.model;
    const subs = [ctx.build({ kind: 'glb', at: { x: 0, y: 0, z: 0 }, path: md.path, h: md.h, anim: md.anim, tint: md.tint }), ...modelExtras(md, md.h).map(x => ctx.build(x))];
    for (const sub of subs) object.add(sub.object);
    object.rotation.y = spec.at.yaw ?? 0;
    return { object, update(dt, t) { for (const sub of subs) sub.update?.(dt, t); }, dispose() { for (const sub of subs) sub.dispose?.(); } };
  },
  // 一小群站定的老鼠（石堆小島，satellites.js 用）：每個 spot 一隻
  rats(THREE, spec, ctx) {
    const object = new THREE.Group(), at = spec.at;
    const subs = spec.spots.slice(0, spec.n).map(spot => {
      const sub = ctx.build({ kind: 'glb', at: spot, path: spec.path, h: spec.h, anim: spec.anim, ry: spot.yaw ?? 0 });
      sub.object.position.sub(new THREE.Vector3(at.x, at.y, at.z));
      object.add(sub.object);
      return sub;
    });
    return {
      object,
      update(dt, t) { for (const s of subs) s.update?.(dt, t); },
      dispose() { for (const s of subs) s.dispose?.(); },
    };
  },
};

// ── 劇本（§8.6、物品 v2 §6：一級 3–5 秒；◆ Lv4、Lv5 6–10 秒）──
// 老鼠、偵防師、小學生都是演到那一拍才找（劇本在回合開始時一次建好）；once 找到第一次就記住，整段劇本同一隻。
// 一次只有一隻老鼠當主角（rat0），其他的一起冒同一種泡泡。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const KEY = 'rat.pack';
const rat = i => c => c.roster.members(KEY)[i] ?? null;
const RATS = c => c.roster.members(KEY);
const detective = c => c.roster.members('chip.detective')[0] ?? null;
const kid = i => c => c.roster.members('milk.kids')[i] ?? null;
// 島緣：某個方位上半徑 7（水裡）最近的可走點；footprint 會變，演到才算
const shoreAt = a => c => c.nav.nearestWalkable({ x: Math.cos(a) * 7.0, z: Math.sin(a) * 7.0 });
const bearing = p => Math.atan2(p.z, p.x);
const NEST_A = bearing(AT), PARK_A = bearing(PARK), SPRING_A = bearing(SPRING);
const NEST_SHORE = shoreAt(NEST_A), PARK_SHORE = shoreAt(PARK_A), SPRING_SHORE = shoreAt(SPRING_A);
// 巨蛋格東南岸（水裡）：第一隻老鼠從這裡爬上來（颱風 Lv3 的堤防在這裡留缺口，typhoon.js）
export const RAT_LANDING = offset(DOME, 2.0, 2.05);
const SCHOOL_GATE = offset(anchorWorld('milk'), 0, 0.1);
const JUMP = 0.5, FOLLOW = 0.15, DASH = 4.5;   // 跳一次的秒數、排隊跟著走的出發間隔（裁決 R17：0.3 → 0.15）、老鼠趕路（泡溫泉從窩跑上台地約 11 公尺，一級 3–5 秒）的速度
// 列車停靠：最多趕 TRAIN_IN 秒進站（車剛開過不到半圈就倒車回來），停到大家一起跳完（再多停 0.05 s 落地），跳的時候車不動
// （裁決 R15 一級 ≤ 4.5 s：落地 0.2 → 0.05；R17：最多趕 1.3 → 1.0 秒）
const TRAIN_IN = 1.0, TRAIN_BACK = Math.PI, HOLD = JUMP + 0.05;
// 搭車至少 CATCH_MIN 秒（含跳上車之後跟車走一小段）：選擇帶動升級之後老鼠放下當回合就 Lv2、下一回合 Lv3，
// 五隻還在窩邊、離島緣很近，列車最快 1.0 s 就到——不墊這一下整級只有 2.9 s（一級 3–5 s）
const CATCH_MIN = 2.1;
// 分岔（spec.js 老鼠 onLevel 4 的 ratBranch：條件照規則資料編譯，跟引擎同一個判斷，不寫死門檻）。分岔旗標是 grow 之後的 fx 事件才帶來的，
// grow 4 的劇本先用一個同值的 fx 事件套用（舞台 fold 旗標是冪等的，之後真的 fx 事件再套一次不會變），變身才演得在 LEVEL UP 前面
const BRANCH = ITEMS.rat.onLevel[4].find(a => a.branch).branch, BRANCH_TEST = compile(BRANCH.when, {});
export const branchOf = s => (BRANCH_TEST(s) ? BRANCH.then : BRANCH.else);
const branchEvent = value => ({ kind: 'fx', item: 'rat', cause: 'rat', flag: { name: BRANCH.flag, value } });
const riding = s => ratMode(s.prev.lv, s.prev.flags) === 'train';   // 這次升級前老鼠在車頂上

// 0 秒的小拍：把老鼠們拿到劇本手上、原地停下（名冊換家的時候它們才不會先瞬移上車）
const claim = who => ({ kind: 'claim', dur: 0, start(c) { for (const m of who(c)) { c.roster.claim(m); c.roster.setPose(m, { ...m.pos, walking: false }); } return false; } });
// 0 秒：走到目的地就藏起來（小學生躲進校舍；回合末的 apply 收掉藏著的人不閃白）
const hide = who => ({ kind: 'hide', dur: 0, start(c) { const m = who(c); if (m) c.roster.hide(m); return false; } });
// 偵防師 ！：晶片 ≥3 時老鼠一生窩，名冊就把一個工程師換成偵防師（晶片 grow 3 那邊也補這一拍，哪邊先成立哪邊演）
// 他是晶片格的工程師原地換的，鏡頭在老鼠窩格看不到：先回全景停一下再冒 ！（之後的 LEVEL UP 也在全景）
const detectiveBubble = (ctx, s) => (s.lv.chip >= 3 ? [ctx.B.focus('home', { hold: 0.6 }), ctx.B.bubble(detective, '！', 0.8)] : []);
// 列車停在 at 方位，車頂的老鼠一起跳到島緣 slots 裡自己的位置；這次升級前不在車上（鼠災後在巨蛋）就不等車
// 搭車時車頭停在窩的方位再往前半列車（列車的中間對著窩）：2026-10-28 列車加大之後間距 0.6 → 0.84，車頭對著窩的話
//   第五節離窩 3.4 公尺（0.41 rad），最後一隻要跳一大段；置中之後最遠 1.7 公尺
const centred = cars => NEST_A + (Math.max(1, cars) - 1) / 2 * GAP / TRACK.radius;
// 搭車（老鼠 Lv3）：五隻跑到窩那側島緣的 spots 上，列車同時趕來（最快 TRAIN_IN 秒，牠們還在跑就照牠們跑到的時間）；
// 到站後等最後一隻跑到再一起跳上車頂。拍長在 start 才知道（看牠們現在在哪、列車在哪）
function catchTrain(B, ids, spots, ctx, at = NEST_A) {
  let inner = null;
  return {
    kind: 'catchTrain',
    dur: c => (inner ? inner.dur(c) : 0),
    start(c) {
      const walks = ids.map(i => B.walk(rat(i), cc => spots(cc)[i])), wt = Math.max(0, ...walks.map(w => w.estimate(c))), within = Math.max(TRAIN_IN, wt);
      const pause = Math.max(0, wt - B.trainRun(c, at, { within, back: TRAIN_BACK }).arrive);
      inner = B.together([B.bubble(rat(0), '！', 0.8), ...walks, B.wait(CATCH_MIN),
        B.trainStop({ at, arrive: within, back: TRAIN_BACK, stop: pause + HOLD, during: [B.wait(pause), B.together(ids.map(i => B.jump(rat(i), B.seat(i, ctx), JUMP))), B.home(RATS)] })]);
      inner.start(c);
    },
    step(k, dt, c) { inner.step(k, dt, c); },
    end(c) { inner?.end(c); inner = null; },
  };
}
function hopOff(B, s, ids, at, centre, r) {
  if (!riding(s)) return [];
  const spots = once(c => c.nav.slots(centre(c), ids.length, r));
  return [B.trainStop({ at, arrive: TRAIN_IN, back: TRAIN_BACK, stop: HOLD, during: [B.together(ids.map((i, k) => B.jump(rat(i), c => spots(c)[k], JUMP)))] })];
}

// 咬鮮奶（放置反應，鮮奶 ≤2：牛奶箱／早餐店）：一隻走到牛奶箱 → 聞一聞 → ！ → 箱子翻倒（真的掉級才閃白換成側躺；
//   鮮奶 Lv1 掉不下去，只撞歪）→ 有小學生的話 ！ 跑回校門口躲進去 → LEVEL DOWN
function bite(e, ctx) {
  const { B } = ctx, r = once(c => c.roster.nearest(KEY, CRATE)), KIDS = [0, 1, 2], down = e.delta.to < e.delta.from;
  return [
    B.walk(r, offset(CRATE, 0.45, 0.2), { speed: 2.0 }), B.gesture(r, 'sniff'), B.bubble(r, '！'),
    // 沒掉級：箱子被撞歪（下一次鮮奶套用重建就回正）；掉級：閃白換成翻倒的箱子
    down ? B.apply(e, { only: ['milk.crate'] }) : B.tilt('milk.crate', { rz: 0.35, dur: 0.3 }),
    B.together(KIDS.map(i => B.bubble(kid(i), '！', 0.8))),
    B.together(KIDS.map(i => B.walk(kid(i), SCHOOL_GATE))), ...KIDS.map(i => hide(kid(i))),
    B.apply(e), B.home(r), ...(down ? [B.levelUp('milk', { down: true })] : []),
  ];
}
// 撞珍奶：一隻走到攤車旁 → 攤車歪掉（下一次重建回正）→ 老闆 ！（老闆名冊還沒有就跳過）
// 鏡頭自己先對著珍奶格：這個 fx 沒有 delta，turn.js 會照 e.item（老鼠）平移到老鼠格，攤車和老闆就在畫面外
function crash(e, ctx) {
  const { B } = ctx, BOBA = anchorWorld('boba'), r = once(c => c.roster.nearest(KEY, BOBA));
  return [
    B.focus(cellOf('boba')), B.walk(r, offset(BOBA, -0.5, 0.3)), B.tilt('boba.main', { rz: 0.25, dur: 0.3 }),
    B.bubble(c => c.roster.members('boba.owner')?.[0] ?? null, '！'), B.home(r),
  ];
}

export const script = {
  // 一隻老鼠從巨蛋格東南岸的海裡爬上來 → …… 喘口氣 → 聞一聞 → 轉頭看見巨蛋 ！ → 在巨蛋旁晃
  placed(e, s, ctx) {
    const { B } = ctx, r0 = rat(0);
    return [
      B.apply(e, { hold: [KEY] }), B.spawn(KEY, RAT_LANDING), B.walk(r0, c => c.nav.nearestWalkable(RAT_LANDING)),   // 從水裡爬上岸
      B.bubble(r0, '……', 0.8), B.gesture(r0, 'sniff'), B.gesture(r0, 'look', { at: DOME }), B.bubble(r0, '！', 0.8), B.home(r0),
    ];
  },
  grow: {
    // 一窩：♥ → 閃白鼠窩 → 四隻從窩邊跑出來 → 窩旁晃
    2(e, s, ctx) {
      const { B } = ctx, out = [1, 2, 3, 4], door = once(c => c.nav.slots(AT, 4, 0.3)), spot = once(c => c.nav.slots(AT, 4, 0.75));
      return [
        B.bubble(rat(0), '♥'), B.apply(e, { only: ['rat.main'] }),
        B.apply(e, { only: [KEY], hold: [KEY] }),
        B.together(out.map((i, k) => B.spawn(KEY, c => door(c)[k]))),
        B.together(out.map((i, k) => B.walk(rat(i), c => spot(c)[k]))),
        B.apply(e), ...detectiveBubble(ctx, s), B.home(RATS), B.levelUp('rat'),
      ];
    },
    3(e, s, ctx) {
      const { B } = ctx, mode = ratMode(s.lv, s.flags), ids = [0, 1, 2, 3, 4];
      // 搭捷運（列車有了）：五隻 ！ 跑到窩那側的島緣 → 列車趕過來停住 → 一起跳上車頂 → 跟車走（鏡頭對著老鼠窩格）
      // 新家（車頂）先 hold 著：跳上車的那隻 home 就坐好跟車走，還在岸上的不會被名冊瞬移上車
      if (mode === 'train') {
        const wait = once(c => c.nav.slots(NEST_SHORE(c), 5, 0.3));
        return [
          B.focus('rat'), claim(RATS), B.apply(e, { only: [KEY], hold: [KEY] }),
          // 老鼠跑到島緣的同時列車就趕過來（不是跑到了才叫車；裁決 R15 一級 ≤ 4.5 s）
          catchTrain(B, ids, wait, ctx, centred(trainCars(s.lv.token))),
          B.home(RATS), B.together([B.apply(e), B.levelUp('rat')]),   // 窩的其餘零件跟 LEVEL UP 一起閃
        ];
      }
      // 泡溫泉（列車還沒有）：五隻快跑上台地到池裡 → 池水閃白變綠、一起 ♥（鏡頭對著溫泉格）
      if (mode === 'spring') {
        return [
          B.focus(SPRING), claim(RATS), B.apply(e, { only: [KEY], hold: [KEY] }),
          // 快跑固定 DASH（以前蒙太奇倍速時減半；選擇帶動升級拿掉蒙太奇）
          B.together(ids.map(i => B.walk(rat(i), SPRING_SPOTS[i], { speed: DASH }))), B.together([B.apply(e), ...ids.map(i => B.bubble(rat(i), '♥', 0.5))]),
          B.home(RATS), B.levelUp('rat'),
        ];
      }
      return null;   // 鼠災後的老鼠留在巨蛋門口：預設劇本
    },
    // ◆ 分岔（引擎的 ratBranch，旗標條件見 branchOf）
    4(e, s, ctx) {
      const { B } = ctx, branch = branchOf(s), ids = [0, 1, 2, 3, 4], r0 = rat(0);
      if (s.flags.domeRats) return null;
      const transform = [B.apply(e), B.apply(branchEvent(branch))];
      // 賽博：偵防師走到園區那側島緣、列車進站，老鼠們一起跳下來 → 圖框「晶片」→ 排成一列跟著他走到園區門口 → 閃白變機器鼠（天線）
      // 鏡頭（§13.1）：整段在園區（晶片格）
      if (branch === 'cyber') {
        const gate = once(c => c.nav.slots(PARK, 5, 0.6));
        return [
          B.focus('chip'), B.together([B.walk(detective, PARK_SHORE), ...hopOff(B, s, ids, PARK_A, PARK_SHORE, 0.35)]),
          // 排成一列跟著他（每隻晚 FOLLOW 秒出發），他一邊走一邊冒圖框「晶片」（裁決 R17 ◆ ≤ 8 s）
          B.together([B.bubble(detective, { icon: 'chip' }, 0.8), B.walk(detective, offset(PARK, 0.5, 0.5)), ...ids.map(i => B.walk(rat(i), c => gate(c)[i], { delay: FOLLOW * (i + 1) }))]),
          ...transform, B.wait(0.2), B.home(c => [...RATS(c), detective(c)].filter(Boolean)), B.levelUp('rat'),
        ];
      }
      // 外星：一隻在溫泉那側跳下車、走到溫泉邊 …… → 閃白變異（放大、綠光、三眼；其餘的閃白後拿掉）→ 對天揮手 → ？（鏡頭對著溫泉格）
      return [
        B.focus(SPRING), ...hopOff(B, s, [0], SPRING_A, SPRING_SHORE, 0.1),
        // …… 0.7 → 0.5（2026-10-28 列車加大、搭車置中之後列車到溫泉那側要多趕 0.1 s，整段貼著 ◆ 8 s 的上限）
        B.walk(r0, MUTANT), B.bubble(r0, '……', 0.5),
        ...transform, B.home(r0), B.wait(0.2), B.together([B.bubble(r0, '？', 0.8), B.levelUp('rat')]),   // 裁決 R17 ◆ ≤ 8 s：？ 跟 LEVEL UP 一起
      ];
    },
    // ◆ 最終型態：回全景定格再 LEVEL UP
    5(e, s, ctx) {
      const { B } = ctx, r0 = rat(0);
      if (ratMode(s.lv, s.flags) === 'cyber') {
        // 軍團：補到 10 隻 → 列隊走到 101 腳下（鏡頭對著 101）→ 回全景 → 站頂閃白出現一隻戴王冠的機器鼠 → ！
        const ids = Array.from({ length: 10 }, (_, i) => i), slots = once(c => c.nav.slots(TOWER, 10, 1.3));
        return [
          // 新的五隻從園區門口（入口）走出來、不閃，一出來就跟著列隊；石堆小島的兩隻同時閃白收掉（骨架動畫 ≤ 12，LEVEL UP 之後不再閃）
          B.focus('tower'), B.apply(e, { only: [KEY, 'sat.rocks'] }),
          B.together(ids.map(i => B.walk(rat(i), c => slots(c)[i]))),
          B.home(RATS), B.focus('home', { hold: 0.6 }), B.apply(e, { only: ['rat.king'] }), B.bubble('rat.king', '！', 0.6),
          B.together([B.apply(e), B.levelUp('rat')]),   // 裁決 R17 ◆ ≤ 8 s
        ];
      }
      if (ratMode(s.lv, s.flags) === 'alien') {
        // 小 UFO 從天上降下停在變異鼠頭上 → 閃白戴上王冠 → 跳一下 ♥ → 回全景：石堆島亮起一圈綠光 → LEVEL UP（鏡頭先對著溫泉格）
        return [
          B.focus(SPRING), B.apply(e, { only: ['rat.ufo'], blink: false }), B.move('rat.ufo', { from: { dy: 6 }, to: {}, dur: 1.5 }),
          B.apply(e, { only: [KEY] }), B.gesture(r0, 'jump'), B.bubble(r0, '♥', 0.9),
          B.focus('home', { hold: 1.0 }), B.apply(e, { only: ['sat.rocksRing'] }), B.wait(0.4),
          B.apply(e), B.levelUp('rat'),
        ];
      }
      return null;
    },
  },
  // 放置反應（spec.js 老鼠 fx：鮮奶 ≤2 咬牛奶箱、有珍奶撞翻攤車）；分岔（onLevel 4）已經在 grow 4 演完
  fx(e, s, ctx) {
    if (e.flag?.name === BRANCH.flag) return [];
    if (e.delta?.target === 'milk') return bite(e, ctx);
    if (!e.delta && !e.flag && s.lv.boba > 0) return crash(e, ctx);
    return null;
  },
  rep: (s, ctx) => ctx.roster.members(KEY).find(m => !m.hidden) ?? null,   // 代表（拜訪、撲空找的人）：藏起來的人（躲進門裡）不算
};
// ◆ 關鍵節點（裁決 R11）：分岔與最終型態——跳級的第二級落在這兩級，也演完整劇本（turn.js）
script.grow[4].key = script.grow[5].key = true;

// 拜訪點（計畫 6 設計 §4）：看老鼠這一級住哪（ratMode）。一隻／鼠窩／搭捷運（窩在車站旁的岸邊等車）→ 鼠窩；泡溫泉、變異鼠 → 溫泉；
// 賽博（Lv4 在園區門口變身、Lv5 軍團從那裡走去 101）→ 園區門口；鼠災 → 巨蛋門口。s 是劇本收到的 { lv, flags }（lv.rat 已是 n）
export function visitSpot(n, s) {
  if (!(n >= 1 && n <= ITEMS.rat.max)) return null;
  switch (ratMode({ ...s.lv, rat: n }, s.flags)) {
    case 'spring': case 'alien': return { ...SPRING, r: 0.9 };
    case 'cyber': return { ...PARK, r: 0.5 };
    case 'dome': return { ...GATE, r: 0.5 };
    default: return { ...AT, r: 0.6 };
  }
}
