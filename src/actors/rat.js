// 老鼠（唯一正解 §4.4，max 4）：一隻在巨蛋附近晃（放置反應：鮮奶 ≤2 就咬牛奶箱；撞翻攤車 §5.2 拿掉了）→ 一窩 3 隻（計畫 9 §5）
// → 搭捷運（列車有了：代幣 ≥4）或泡北投溫泉（窩裡再鑽出兩隻，5 隻）
// → ◆ Lv4 分岔＝最終型態（引擎的 ratBranch；原本的 Lv4 分岔＋Lv5 最終型態併成一級）：
//   賽博＝機器鼠排隊跟偵防師走到 101 腳下變身、軍團 10 隻繞 101、一隻戴王冠坐在捷運站頂；
//   外星（壞結局「變異鼠稱王」）＝變異鼠三眼綠光加冕、石堆島綠光圈（satellites.js）、小 UFO 盤旋。
// 颱風把老鼠沖進大巨蛋：5 隻在巨蛋門口晃。模型用 Quaternius Easy Enemies 的 Rat。
// 老鼠當指標（唯一正解 §5.2）：Lv1 一隻、Lv2 一窩在舞台結算的 meta.trouble 那棟門口晃（沒有 trouble 才在窩旁）；放下那回合有 trouble 就跑過去聞一聞。
// 全部老鼠是同一個名冊 rat.pack（§5.2：同一批老鼠上岸、生窩、上車、變身，不重生）；石堆小島上的兩隻是 satellites.js 的 rats 零件；
// 站頂的王冠鼠是零件（kind 'king'，不走路、不進名冊）。人數預算：名冊最多 10 隻＋王冠鼠（骨架動畫 ≤ 12，含柴犬）。
// 最終章 §7 賽博尾聲（flags.epilogue 'cyber'）：同一批 10 隻機器鼠的家搬到黑塔的平屋頂（ROOF_SPOTS，兩排各 5 隻面向鏡頭），
// 王冠鼠照舊坐站頂。屋頂在 101 的 footprint 裡、走不上去：finale.js 的尾聲劇本把牠們閃白放上去（不是走上去）。
// 最終章 §7 外星尾聲（flags.epilogue 'alien'）：變異鼠王的站位搬到 101 母艦的碟頂中心（SHIP_SPOT，面向鏡頭），頭上的小 UFO 不畫
// （三台大 UFO 取代它，finale.js）；碟頂走不上去，finale.js 的尾聲劇本把牠閃白放上去。唯一正解之後外星是壞結局、不演尾聲——
// 這一段到不了，留給圖鑑（finale.js 檔頭）。
// 劇本（物品 v2 §6）：一級 ≤ 4.5 秒；◆ Lv4 ≤ 8 秒（回全景定格）。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { CRATE } from './milk.js';
import { C, offset } from './palette.js';
import { ITEMS } from '../rules/spec.js';
import { compile } from '../rules/conditions.js';
import { trainCars, GAP, TRACK, DECK_AT, PLATFORM } from './token.js';
import { modelExtras } from '../show/roster.js';
import { body as towerBody, shipTop } from './tower.js';

export const id = 'rat';
export const labelY = 0.6;
const RAT = 'quat/enemies/Rat.glb', GREY = { Grey: 0xc0c8d0 };
const AT = anchorWorld('rat'), TOWER = anchorWorld('tower'), SPRING = landmarkWorld('spring'), DOME = anchorWorld('baseball');
const GATE = offset(DOME, 0, 1.1);                 // 巨蛋門口（鼠災時老鼠在這裡晃）
export const MUTANT = offset(SPRING, 0.1, 0.97, 0.05);  // 變異鼠站的溫泉邊：池子正前方（靠鏡頭）；原本 (−0.75, 0.55) 離木牌只有 0.22，錄影裡疊在一起（2026-10-27）；
// 牠在這裡時兩位溫泉客改站池子北側、離牠 ≥ 1.9（landmarks.js BATHERS_NORTH，2026-10-28）
const PARK = offset(anchorWorld('chip'), -0.5, 1.2);   // 園區門口（賽博 Lv4 補進軍團的五隻機器鼠從這裡走出來）
// 補進來的五隻各自的入口（計畫 11 最終修正 #4：以前五隻同一幀從同一點冒出來、一起走，之後彼此疊著 5–20 幀）：園區門口沿 x 排一列、
// 間距 PARK_STEP（≥ 兩隻的半徑相加 0.26），名冊依序輪流（rat#5 在最西邊、最靠 101，先走在前面）
const PARK_STEP = 0.3;
export const PARK_ENTRIES = [-2, -1, 0, 1, 2].map(k => offset(PARK, k * PARK_STEP, 0));
// 王冠鼠的站位（看 lv.token）：代幣 Lv9 起坐在賽博站前的懸浮月台上（token.js DECK_AT／PLATFORM：招牌右邊、欄杆後面，身體斜斜面向鏡頭）——
// 站頂平屋頂 Lv10 停滿三台 Roadster 和三條起飛坡道，沒有牠的位子（計畫 8 任務 5 裁決 (a)）；代幣 Lv9 以前（偏離正解的放法，
// 賽博 Lv4 可能碰上代幣 4–8）沒有月台也沒有坡道，坐大車站圓頂外的簷角
const STATION = anchorWorld('token'), CORNICE_Y = 0.605;
export const KING_DECK = { x: (PLATFORM.signW / 2 + PLATFORM.w / 2) / 2 + 0.01, z: -0.03, yaw: 0.5 };   // 相對 DECK_AT；招牌右緣到月台右緣的中間
export const kingSpot = lv => (lv.token >= 9
  ? { ...offset(DECK_AT, KING_DECK.x, KING_DECK.z, PLATFORM.top), yaw: KING_DECK.yaw }
  : { ...offset(STATION, -0.42, 0.32, CORNICE_Y), yaw: 0.6 });

// 黑塔屋頂上的站位（世界座標）：屋頂面高度、兩排各 5 隻（x 間距 0.26 ≥ 名冊的 0.25，不會被 separateStanding 推開），
// 前排 z +0.1、後排 z −0.26（離後緣的桅杆 0.36）；前緣 z +0.58 留給停好的紅色飛天跑車（finale.js CAR_PARK）。都面向 +z（鏡頭）
const ROOF = towerBody('lit', { dark: true }).roof;
export const ROOF_SPOTS = [0.1, -0.26].flatMap(z => [-0.52, -0.26, 0, 0.26, 0.52].map(x => ({ ...offset(TOWER, x, z, ROOF), yaw: 0 })));

// 母艦碟頂中心（世界座標，tower.js shipTop；外星尾聲在單一正解下到不了，留給圖鑑：finale.js）
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
// 一窩 3 隻（計畫 9 §5：5 → 3，巨蛋旁那格太擠）；泡溫泉、搭車、賽博 Lv4、鼠災仍是 5 隻——Lv3 的劇本先從窩裡再鑽出兩隻（GROW_TO）才一起出發
const NEST_N = 3, GROW_TO = 5;
const pack = (at, n, home, model = {}) => ({ kind: 'roster', at, n, model: { path: RAT, h: 0.2, anim: 'Walk', ...model }, home });
// 泡溫泉：池子裡圍一圈五個位置，面向池心
const SPRING_SPOTS = Array.from({ length: 5 }, (_, i) => { const a = i / 5 * Math.PI * 2 + 0.3; return { ...offset(SPRING, Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.1), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) }; });

// 名冊入口（§13.2，view 的 home.entry）：補進來的老鼠從哪裡走來。泡溫泉：從窩那邊（溫泉格的格邊離池子都不到 1.5）；
// 賽博 Lv4 軍團：多的五隻從園區門口走去 101。其他模式用名冊預設（家那格邊上離家最遠的點）
// 老鼠當指標（唯一正解 §5.2）：Lv1 一隻、Lv2 一窩的家跟著舞台結算的 meta.trouble 走——有出問題的那棟，就在那棟門口
// （meta.troubleAt，stage.js troubleSpot）附近繞 TROUBLE_R；沒有就在窩旁晃。家換位置時名冊讓牠們走過去（roster.js apply 的 moved，不閃白）
export const TROUBLE_R = 0.4;
const daily = meta => (meta?.troubleAt ? wander(meta.troubleAt, TROUBLE_R) : wander(AT, 0.7));
export function view(lv, flags, meta) {
  switch (ratMode(lv, flags)) {
    case null: return {};
    case 'one': return { 'rat.pack': pack(AT, 1, daily(meta)) };
    // 鼠窩的 footprint 用圓（r 0.2 蓋住圓角盒）：包圍盒的角外擴 PAD 後會擦到窩邊那座橋上的電工主路（物品 v2：燈泡先放，電工繞島時老鼠正在生窩）
    case 'nest': return {
      'rat.main': { kind: 'compound', at: AT, footprint: { r: 0.2 }, parts: [{ kind: 'rbox', pos: [0, 0.12, 0], scale: [0.35, 0.24, 0.3], color: 0x9a6a3c }, { kind: 'sphere', pos: [0, 0.12, 0.15], scale: [0.12, 0.1, 0.04], color: C.ink }] },
      'rat.pack': pack(AT, NEST_N, daily(meta)),
    };
    case 'spring': return { 'rat.pack': pack(SPRING, 5, { kind: 'stand', spots: SPRING_SPOTS, entry: AT }) };
    case 'train': return { 'rat.pack': pack(AT, 5, { kind: 'ride', cars: trainCars(lv.token), speed: flags.flooded ? 0 : 0.35 }) };
    // Lv4 最終型態（原本的 Lv5）：機器鼠軍團 10 隻繞 101＋站頂一隻戴王冠（骨架動畫上限 12：10 + 王冠鼠 + 柴犬；石堆小島的兩隻這時不畫）
    // 賽博尾聲：軍團站上黑塔屋頂（同一個名冊、同一批老鼠，只是家搬了）
    case 'cyber': return {
      'rat.pack': pack(TOWER, 10, flags.epilogue === 'cyber' ? { kind: 'stand', spots: ROOF_SPOTS } : { ...wander(TOWER, 1.3), entry: PARK_ENTRIES }, { tint: GREY, antenna: true }),
      'rat.king': { kind: 'king', at: kingSpot(lv), model: { path: RAT, h: 0.2, anim: 'Idle', tint: GREY, antenna: true, crown: true }, footprint: false },
    };
    case 'alien': {
      // Lv4 最終型態（壞結局「變異鼠稱王」）：變異鼠加冕（戴王冠）、頭上盤旋一艘小 UFO；石堆島的綠光圈在 satellites.js
      // 外星尾聲（單一正解下到不了，留給圖鑑）：站位搬上母艦碟頂、小 UFO 不畫（同一隻、同一個模型）
      const ship = flags.epilogue === 'alien';
      const v = { 'rat.pack': pack(MUTANT, 1, { kind: 'stand', spots: [ship ? SHIP_SPOT : { ...MUTANT, yaw: 0 }] }, { h: 0.5, tint: { Grey: C.alien }, glow: { Grey: C.alien }, eye: true, wave: true, crown: true }) };
      if (!ship) v['rat.ufo'] = { kind: 'ufo', at: offset(MUTANT, 0, 0, 1.3), footprint: false };
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

// ── 劇本（§8.6、物品 v2 §6：一級 ≤ 4.5 秒；◆ Lv4 ≤ 8 秒）──
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
const NEST_A = bearing(AT), SPRING_A = bearing(SPRING);
const NEST_SHORE = shoreAt(NEST_A), SPRING_SHORE = shoreAt(SPRING_A);
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
// 咬鮮奶（spec.js 老鼠 fx：鮮奶 ≤2）：放下那回合接著就要咬——上岸直接跑去牛奶箱旁（BITE_AT，咬的劇本從這裡開始），不先跑去出問題的那棟
// （修正批次 2：颱風放下那回合就淹水，trouble 常常是車站，從車站再走到牛奶箱的咬鮮奶要 8.7 s）
const BITE = ITEMS.rat.fx.find(a => a.delta?.target === 'milk' && a.delta.by < 0), BITE_TEST = BITE ? compile(BITE.when, {}) : () => false;
const BITE_AT = offset(CRATE, 0.45, 0.2);
export const branchOf = s => (BRANCH_TEST(s) ? BRANCH.then : BRANCH.else);
const branchEvent = value => ({ kind: 'fx', item: 'rat', cause: 'rat', flag: { name: BRANCH.flag, value } });
const riding = s => ratMode(s.prev.lv, s.prev.flags) === 'train';   // 這次升級前老鼠在車頂上

// 0 秒的小拍：把老鼠們拿到劇本手上、原地停下（名冊換家的時候它們才不會先瞬移上車）
const claim = who => ({ kind: 'claim', dur: 0, start(c) { for (const m of who(c)) { c.roster.claim(m); c.roster.setPose(m, { ...m.pos, walking: false }); } return false; } });
// 0 秒：一窩只有 NEST_N 隻——新家（GROW_TO 隻）hold 住之後，缺的從窩邊鑽出來（劇本手上、不閃到家），再跟大家一起出發
function fill() {
  let door = null;
  return { kind: 'spawn', dur: 0, start(c) { door ??= c.nav.slots(AT, GROW_TO, 0.3); for (let k = c.roster.members(KEY).length; k < GROW_TO; k++) c.roster.spawnHeld(KEY, door[k]); } };
}
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
    B.walk(r, BITE_AT, { speed: 2.0 }), B.gesture(r, 'sniff'), B.bubble(r, '！'),
    // 沒掉級：箱子被撞歪（下一次鮮奶套用重建就回正）；掉級：閃白換成翻倒的箱子
    down ? B.apply(e, { only: ['milk.crate'] }) : B.tilt('milk.crate', { rz: 0.35, dur: 0.3 }),
    B.together(KIDS.map(i => B.bubble(kid(i), '！', 0.8))),
    B.together(KIDS.map(i => B.walk(kid(i), SCHOOL_GATE))), ...KIDS.map(i => hide(kid(i))),
    B.apply(e), B.home(r), ...(down ? [B.levelUp('milk', { down: true })] : []),
  ];
}
export const script = {
  // 一隻老鼠從巨蛋格東南岸的海裡爬上來 → …… 喘口氣 → 聞一聞 → 轉頭看見巨蛋 ！ → 在巨蛋旁晃。
  // 老鼠當指標（§5.2）：上一回合結算出有出問題的那棟（meta.troubleAt；劇本在回合開頭建，這時的 meta 就是上一回合的結算）
  //   → 爬上岸直接跑過去（鏡頭同時平移到那裡）聞一聞，在那棟門口晃
  placed(e, s, ctx) {
    // 有 trouble 但這回合就要咬鮮奶：跑去的是牛奶箱旁（見 BITE_AT），咬的劇本接著聞、！
    const { B } = ctx, r0 = rat(0), trouble = ctx.stage?.meta?.troubleAt ?? null, biting = !!trouble && BITE_TEST({ lv: s.lv, flags: s.flags ?? {} });
    const at = biting ? BITE_AT : trouble;
    const ashore = [B.apply(e, { hold: [KEY] }), B.spawn(KEY, RAT_LANDING), B.walk(r0, c => c.nav.nearestWalkable(RAT_LANDING))];   // 從水裡爬上岸
    if (biting) return [...ashore, B.together([B.focus(at), B.walk(r0, c => c.nav.nearestWalkable(at), { speed: DASH })])];
    if (at) return [...ashore, B.together([B.focus(at), B.walk(r0, c => c.nav.nearestWalkable(at), { speed: DASH })]), B.gesture(r0, 'sniff'), B.home(r0)];
    return [...ashore, B.bubble(r0, '……', 0.8), B.gesture(r0, 'sniff'), B.gesture(r0, 'look', { at: DOME }), B.bubble(r0, '！', 0.8), B.home(r0)];
  },
  grow: {
    // 一窩：♥ → 閃白鼠窩 → 兩隻從窩邊跑出來（一窩 3 隻）→ 窩旁晃
    // ♥ 冒在窩上（rat.main 的頭；窩還沒閃出來時退回老鼠格的頭頂，同一點）：老鼠 0 可能正在遠處出問題的那棟門口，
    // 鏡頭平移去的是老鼠格（最終修正：順序 milk,baseball,chip,token,typhoon,bulb,boba,rat 的 ♥ 整段在畫面外）；門口那隻留在原地
    2(e, s, ctx) {
      const { B } = ctx, out = Array.from({ length: NEST_N - 1 }, (_, k) => k + 1), door = once(c => c.nav.slots(AT, out.length, 0.3)), spot = once(c => c.nav.slots(AT, out.length, 0.75));
      return [
        B.bubble(B.partHead('rat.main', labelY, ctx), '♥'), B.apply(e, { only: ['rat.main'] }),
        B.apply(e, { only: [KEY], hold: [KEY] }),
        B.together(out.map((i, k) => B.spawn(KEY, c => door(c)[k]))),
        B.together(out.map((i, k) => B.walk(rat(i), c => spot(c)[k]))),
        B.apply(e), ...detectiveBubble(ctx, s), B.home(RATS), B.levelUp('rat'),
      ];
    },
    3(e, s, ctx) {
      const { B } = ctx, mode = ratMode(s.lv, s.flags), ids = Array.from({ length: GROW_TO }, (_, i) => i);
      // 搭捷運（列車有了）：五隻 ！ 跑到窩那側的島緣 → 列車趕過來停住 → 一起跳上車頂 → 跟車走（鏡頭對著老鼠窩格）
      // 新家（車頂）先 hold 著：跳上車的那隻 home 就坐好跟車走，還在岸上的不會被名冊瞬移上車
      if (mode === 'train') {
        const wait = once(c => c.nav.slots(NEST_SHORE(c), GROW_TO, 0.3));
        return [
          B.focus('rat'), claim(RATS), B.apply(e, { only: [KEY], hold: [KEY] }), fill(),
          // 老鼠跑到島緣的同時列車就趕過來（不是跑到了才叫車；裁決 R15 一級 ≤ 4.5 s）
          catchTrain(B, ids, wait, ctx, centred(trainCars(s.lv.token))),
          B.home(RATS), B.together([B.apply(e), B.levelUp('rat')]),   // 窩的其餘零件跟 LEVEL UP 一起閃
        ];
      }
      // 泡溫泉（列車還沒有）：五隻快跑上台地到池裡 → 池水閃白變綠、一起 ♥（鏡頭對著溫泉格）
      if (mode === 'spring') {
        return [
          B.focus(SPRING), claim(RATS), B.apply(e, { only: [KEY], hold: [KEY] }), fill(),
          // 快跑固定 DASH（以前蒙太奇倍速時減半；選擇帶動升級拿掉蒙太奇）
          B.together(ids.map(i => B.walk(rat(i), SPRING_SPOTS[i], { speed: DASH }))), B.together([B.apply(e), ...ids.map(i => B.bubble(rat(i), '♥', 0.5))]),
          B.home(RATS), B.levelUp('rat'),
        ];
      }
      return null;   // 鼠災後的老鼠留在巨蛋門口：預設劇本
    },
    // ◆ 分岔＝最終型態（引擎的 ratBranch，旗標條件見 branchOf）。唯一正解 §5.3：原本的 Lv4（排隊跟偵防師／變異）是前半、
    // 原本的 Lv5（軍團＋王冠鼠／UFO＋加冕）是後半，併成一段 ≤ 8 s（拿掉停頓與多的泡泡，走路速度不變）
    4(e, s, ctx) {
      const { B } = ctx, branch = branchOf(s), ids = Array.from({ length: GROW_TO }, (_, i) => i), r0 = rat(0), flag = branchEvent(branch);
      if (s.flags.domeRats) return null;
      // 老鼠的名冊先 hold 住、等分岔事件一起套用：從一窩 3 隻跳級上來（2 → 4 合併跳級）時，中間那份「搭車／泡溫泉 5 隻」不套用——
      // 不然多出來的兩隻會冒出來 0.3 秒又走掉（計畫 9 任務 3 審稿）。變身只套老鼠的名冊（only）：沒有分岔旗標的中間那份 view 裡
      // 石堆島的老鼠（老鼠 ≥3）會先閃出來再被軍團收掉；王冠鼠、UFO、綠光圈、偵防師、窩這些零件後半才套
      const transform = [B.apply(e, { only: [KEY], hold: [KEY] }), B.apply(flag, { only: [KEY] })];
      // 賽博：偵防師（老鼠在窩裡時他就站在隔壁格盯著）領頭走到 101 腳下，老鼠們排成一列跟著他（每隻晚 FOLLOW 秒出發），他一邊走一邊冒圖框「晶片」
      //   → 閃白變機器鼠（天線）；軍團補到 10 隻（新的五隻從園區門口走出來、不閃）、石堆小島的兩隻同時收掉（骨架動畫 ≤ 12）
      //   → 回全景，站頂閃白出現一隻戴王冠的機器鼠 → LEVEL UP。
      // 原本在園區門口變身（偵防師走到園區那側島緣接車）：正解第 9 回合老鼠從窩裡 2 → 4，窩到園區、園區到 101 兩段路一共 13 s，
      //   ◆ 8 s 裝不下；改成直接走到 101 腳下（窩到 101 一段）。鏡頭（§13.1）整段對著 101。
      // 賽博只會從一窩 2 → 4 合併跳級來（晶片 8 要代幣 7，老鼠早就搭上車、晶片 ≥3 就分岔；4 萬局列舉裡 50 局全是從 Lv2）：
      //   搭車來的分支（先等列車停在窩那側）正式演出到不了，只在單獨演一級時出現（約 9 s）
      if (branch === 'cyber') {
        const foot = once(c => { const sl = c.nav.slots(TOWER, 10, 1.3), from = RATS(c)[0]?.pos ?? AT; return sl.sort((p, q) => Math.hypot(p.x - from.x, p.z - from.z) - Math.hypot(q.x - from.x, q.z - from.z)); });
        // 從一窩 3 隻直接跳上來（2 → 4 合併跳級）：先 hold 住、缺的兩隻從窩邊鑽出來，五隻一起排隊（不然多的兩隻變身後才從格邊走進來、
        // 家在橋上的那隻直接冒出來）
        const short = ratMode(s.prev.lv, s.prev.flags) === 'nest' ? [B.apply(e, { only: [KEY], hold: [KEY] }), fill()] : [];
        const march = [B.bubble(detective, { icon: 'chip' }, 0.8), B.walk(detective, c => foot(c)[GROW_TO]), ...ids.map(i => B.walk(rat(i), c => foot(c)[i], { delay: FOLLOW * (i + 1) }))];
        // 鏡頭平移跟排隊出發同時（正解：從窩裡出發，不用等車）；搭車來的先對著 101、等列車停在窩那側讓牠們跳下來
        const open = riding(s) ? [B.together([B.focus('tower'), ...hopOff(B, s, ids, NEST_A, NEST_SHORE, 0.35)]), B.together(march)] : [B.together([...short, B.focus('tower'), ...march])];
        return [
          // 石堆小島的兩隻（搭車來的才有）跟軍團同一次收掉；偵防師的家同時換成跟著老鼠（不然他先走回窩邊）
          ...open, ...transform, B.apply(e, { only: [KEY, 'sat.rocks', 'chip.detective'] }), B.home(c => [...RATS(c), detective(c)].filter(Boolean)),
          // 回全景時站頂的王冠鼠和剩下的零件（窩收掉）一起閃完，LEVEL UP 之後不再閃；王冠鼠的 ！ 跟 LEVEL UP 一起（◆ ≤ 8 s：不另外停）
          B.together([B.focus('home', { hold: 0.6 }), B.apply(e, { only: ['rat.king'] })]), B.apply(e),
          B.together([B.bubble('rat.king', '！', 0.6), B.levelUp('rat')]),
        ];
      }
      // 外星：一隻走到溫泉邊，小 UFO 同時從天上降下停在溫泉上空 → 閃白變異（放大、綠光、三眼、戴王冠；
      //   其餘的閃白後拿掉）→ 回全景：石堆島亮起一圈綠光 → ？ 跟 LEVEL UP 一起（鏡頭對著溫泉格）。
      // 從窩裡 2 → 4 合併跳級（外星壞局都是這樣）時窩到溫泉邊一段路約 10 公尺（5 s）：鏡頭平移、UFO 降下都跟走路同時（◆ ≤ 8 s），
      //   老鼠們先拿到劇本手上——hold 住的新家（搭車）會把還在日常的老鼠直接放上車頂（名冊照待套用的宣告過日常）。
      //   搭車來的（外星壞局約三成）：鏡頭平移跟列車進站同時，跳下車就變身
      //   這一段只 hold 老鼠的名冊、套 UFO（不閃）：其餘零件（窩收掉、石堆島的老鼠）留給後面的 apply 閃
      const hold = B.apply(e, { only: [KEY], hold: [KEY] }), ufo = B.apply(flag, { only: ['rat.ufo'], blink: false }), down = B.move('rat.ufo', { from: { dy: 6 }, to: {}, dur: 1.5 });
      const mutate = B.apply(flag, { only: [KEY] });
      // 泡湯客先讓位（2026-10-31 唯一正解收尾，roster.test 變異鼠擦身）：變異鼠站的溫泉邊在池子正前方，泡湯客的家搬到池子北側
      //   要從這裡繞過去——以前跟「剩下的零件」最後才套，變異鼠已經站好，繞池子的那條窄路被牠堵住，泡湯客直直走過牠身上（0.10 m）。
      //   改成老鼠一出發就套（不閃），泡湯客趁老鼠還在路上先走到北側
      const room = B.apply(flag, { only: ['landmarks.bathers'], blink: false });
      // 搭車來的：其餘的老鼠還坐在車頂上跟車走（日常是搭車），分岔旗標一套就不再是搭車的家——跳下車就閃白變身（車頂上的閃白拿掉），
      //   變異鼠再走到溫泉邊、UFO 同時降下
      const open = riding(s)
        ? [B.together([room, B.focus(SPRING), ...hopOff(B, s, [0], SPRING_A, SPRING_SHORE, 0.1)]), hold, mutate, ufo, B.together([B.walk(r0, MUTANT), down])]
        : [B.together([claim(RATS), hold, ufo, room, B.focus(SPRING), B.walk(r0, MUTANT), down]), mutate];
      return [
        ...open, B.home(r0),
        // 綠光圈先閃、剩下的零件（窩收掉、石堆島的老鼠）接著閃完，LEVEL UP 之後不再閃
        B.together([B.focus('home', { hold: 0.6 }), B.apply(e, { only: ['sat.rocksRing'] })]), B.apply(e),
        B.together([B.bubble(r0, '？', 0.8), B.levelUp('rat')]),
      ];
    },
  },
  // 放置反應（spec.js 老鼠 fx：鮮奶 ≤2 咬牛奶箱；撞翻珍奶攤車唯一正解 §5.2 拿掉了）；分岔（onLevel 4）已經在 grow 4 演完
  fx(e, s, ctx) {
    if (e.flag?.name === BRANCH.flag) return [];
    if (e.delta?.target === 'milk') return bite(e, ctx);
    return null;
  },
};
// ◆ 關鍵節點（裁決 R11）：分岔＝最終型態——跳級的第二級落在這一級，也演完整劇本（turn.js；正解第 9 回合 2 → 4）
script.grow[4].key = true;

// 拜訪點（計畫 6 設計 §4）：看老鼠這一級住哪（ratMode）。一隻／鼠窩／搭捷運（窩在車站旁的岸邊等車）→ 鼠窩；泡溫泉、變異鼠 → 溫泉；
// 賽博（Lv4 軍團繞 101；補進來的五隻從園區門口走過去）→ 園區門口；鼠災 → 巨蛋門口。s 是劇本收到的 { lv, flags }（lv.rat 已是 n）
export function visitSpot(n, s) {
  if (!(n >= 1 && n <= ITEMS.rat.max)) return null;
  switch (ratMode({ ...s.lv, rat: n }, s.flags)) {
    case 'spring': case 'alien': return { ...SPRING, r: 0.9 };
    case 'cyber': return { ...PARK, r: 0.5 };
    case 'dome': return { ...GATE, r: 0.5 };
    default: return { ...AT, r: 0.6 };
  }
}
