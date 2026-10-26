// 老鼠（§5.1）：一隻 → 一窩 5 隻 → 搭捷運（代幣 ≥2）或泡北投溫泉 → Lv4 分岔：機器鼠排隊跟偵防師（賽博）／變異鼠在溫泉邊對天空揮手（外星）
// → Lv5 最終型態：機器鼠軍團繞 101 ／ 變異鼠頭上盤旋小 UFO。
// 颱風把老鼠沖進大巨蛋：5 隻在巨蛋門口晃。模型用 Quaternius Easy Enemies 的 Rat。
// 全部老鼠是同一個名冊 rat.pack（§5.2：同一批老鼠上岸、生窩、上車、變身，不重生）；石堆小島上的兩隻是 satellites.js 的 rats 零件。
// 劇本（§8.6）：一隻從巨蛋格岸邊爬上來 → 生窩、四隻跑出來 → 咬鮮奶／撞攤車 → 跳上捷運車頂（或泡溫泉）→ 跟偵防師去園區變機器鼠／溫泉邊變異 → 軍團／UFO。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { ENGINEER_ROUTE } from './chip.js';
import { CRATE } from './milk.js';
import { C, offset } from './palette.js';
import { ITEMS } from '../rules/spec.js';
import { clampLv } from './clamp.js';

export const id = 'rat';
export const labelY = 0.6;
const RAT = 'quat/enemies/Rat.glb', GREY = { Grey: 0xc0c8d0 };
const AT = anchorWorld('rat'), TOWER = anchorWorld('tower'), SPRING = landmarkWorld('spring'), DOME = anchorWorld('baseball');
const GATE = offset(DOME, 0, 1.1);                 // 巨蛋門口（鼠災時老鼠在這裡晃）
const MUTANT = offset(SPRING, -0.75, 0.55, 0.05);  // 變異鼠站的溫泉邊
const PARK = offset(anchorWorld('chip'), -0.5, 1.2);   // 園區門口（賽博 Lv4 老鼠在這裡變身）

// 依序判定；分岔旗標還沒到（同一回合稍晚的事件）時退回泡溫泉／搭捷運
export function ratMode(lv, flags) {
  if (!lv.rat) return null;
  if (flags.domeRats) return 'dome';
  if (lv.rat >= 4 && flags.ratBranch === 'alien') return 'alien';
  if (lv.rat >= 4 && flags.ratBranch === 'cyber') return 'cyber';
  if (lv.rat >= 3) return lv.token >= 2 ? 'train' : 'spring';
  return lv.rat >= 2 ? 'nest' : 'one';
}

const wander = (at, r) => ({ kind: 'wander', at, r });
const pack = (at, n, home, model = {}) => ({ kind: 'roster', at, n, model: { path: RAT, h: 0.2, anim: 'Walk', ...model }, home });
// 泡溫泉：池子裡圍一圈五個位置，面向池心
const SPRING_SPOTS = Array.from({ length: 5 }, (_, i) => { const a = i / 5 * Math.PI * 2 + 0.3; return { ...offset(SPRING, Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.1), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) }; });

// 名冊入口（§13.2，view 的 home.entry）：補進來的老鼠從哪裡走來。泡溫泉：從窩那邊（溫泉格的格邊離池子都不到 1.5）；
// 賽博 Lv5 軍團：多的五隻從園區門口（原本五隻變身的地方）走去 101。其他模式用名冊預設（家那格邊上離家最遠的點）
export function view(lv, flags) {
  lv = clampLv(lv);   // 過渡期：超過舊 max 的級數先照舊 max 畫（clamp.js）
  switch (ratMode(lv, flags)) {
    case null: return {};
    case 'one': return { 'rat.pack': pack(AT, 1, wander(AT, 0.7)) };
    // 鼠窩的 footprint 用圓（r 0.2 蓋住圓角盒）：包圍盒的角外擴 PAD 後會擦到窩邊那座橋上的電工主路（物品 v2：燈泡先放，電工繞島時老鼠正在生窩）
    case 'nest': return {
      'rat.main': { kind: 'compound', at: AT, footprint: { r: 0.2 }, parts: [{ kind: 'rbox', pos: [0, 0.12, 0], scale: [0.35, 0.24, 0.3], color: 0x9a6a3c }, { kind: 'sphere', pos: [0, 0.12, 0.15], scale: [0.12, 0.1, 0.04], color: C.ink }] },
      'rat.pack': pack(AT, 5, wander(AT, 0.7)),
    };
    case 'spring': return { 'rat.pack': pack(SPRING, 5, { kind: 'stand', spots: SPRING_SPOTS, entry: AT }) };
    case 'train': return { 'rat.pack': pack(AT, 5, { kind: 'ride', cars: lv.token >= 3 ? 5 : 3, speed: flags.flooded ? 0 : 0.35 }) };
    // Lv5 最終型態：機器鼠軍團 10 隻繞 101（骨架動畫上限 12：10 + 柴犬；石堆小島的兩隻這時不畫）
    case 'cyber': return lv.rat >= 5
      ? { 'rat.pack': pack(TOWER, 10, { ...wander(TOWER, 1.3), entry: PARK }, { tint: GREY, antenna: true }) }
      : { 'rat.pack': pack(ENGINEER_ROUTE[0], 5, { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.6 }, { tint: GREY, antenna: true }) };
    case 'alien': {
      const v = { 'rat.pack': pack(MUTANT, 1, { kind: 'stand', spots: [{ ...MUTANT, yaw: 0 }] }, { h: 0.5, tint: { Grey: C.alien }, glow: { Grey: C.alien }, eye: true, wave: true }) };
      if (lv.rat >= 5) v['rat.ufo'] = { kind: 'ufo', at: offset(MUTANT, 0, 0, 1.3), footprint: false };   // 變異鼠加冕：頭上盤旋一艘小 UFO（鋪外星結局）
      return v;
    }
    case 'dome': return { 'rat.pack': pack(GATE, 5, wander(GATE, 0.9)) };
  }
}

export const builders = {
  // 小 UFO：銀色碟 + 綠色底光，在原地小圓盤旋、上下飄
  ufo(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [
      { kind: 'dome', pos: [0, 0, 0], scale: [0.9, 0.3, 0.9], color: 0xc0c8d0 }, { kind: 'cylinder', pos: [0, 0, 0], scale: [1.0, 0.04, 1.0], color: 0x9aa7b8 },
      { kind: 'sphere', pos: [0, -0.06, 0], scale: [0.35, 0.12, 0.35], color: C.alien, glow: C.alien },
    ] }), object = new THREE.Group(); object.add(part.object);
    return { object, update(dt, t) { part.object.position.set(Math.cos(t * 0.8) * 0.3, Math.sin(t * 1.7) * 0.08, Math.sin(t * 0.8) * 0.3); part.object.rotation.y += dt * 2; }, dispose: part.dispose };
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

// ── 劇本（§8.6）──
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
const SHORE = shoreAt(bearing(anchorWorld('token'))), NEST_SHORE = shoreAt(NEST_A), PARK_SHORE = shoreAt(PARK_A), SPRING_SHORE = shoreAt(SPRING_A);
const LANDING = offset(DOME, 2.0, 2.05);   // 巨蛋格東南岸（水裡）：第一隻老鼠從這裡爬上來
const BEACH = offset(DOME, 0.25, 2.15);    // 沿岸往南角走一段（第一段）
const NEAR_DOME = offset(DOME, -0.9, 1.0); // 再沿岸往巨蛋走一小段（第二段，停在巨蛋西南）
const SCHOOL_GATE = offset(anchorWorld('milk'), 0, 0.1);
const JUMP = 0.5, HOP = 0.15, FOLLOW = 0.3;   // 跳一次的秒數、依序跳車的間隔、排隊跟著走的出發間隔
// 列車停到 n 隻依序跳完（再多停 0.2 s 落地），跳的時候車不動
const hold = n => n * JUMP + (n - 1) * HOP + 0.2;
// 分岔（spec.js 老鼠 onLevel 4：晶片夠高 → 賽博）。分岔旗標是 grow 之後的 fx 事件才帶來的，grow 4 的劇本先用一個同值的 fx 事件
// 套用（舞台 fold 旗標是冪等的，之後真的 fx 事件再套一次不會變），變身才演得在 LEVEL UP 前面；門檻照規則資料讀，不寫死
const [BRANCH_ID, BRANCH_MIN] = ITEMS.rat.onLevel[4].find(a => a.branch).branch.when.minLevel;
const branchOf = s => (s.lv[BRANCH_ID] >= BRANCH_MIN ? 'cyber' : 'alien');
const branchEvent = value => ({ kind: 'fx', item: 'rat', cause: 'rat', flag: { name: 'ratBranch', value } });
const riding = s => ratMode(s.prev.lv, s.prev.flags) === 'train';   // 這次升級前老鼠在車頂上

// 0 秒的小拍：把老鼠們拿到劇本手上、原地停下（名冊換家的時候它們才不會先瞬移上車）
const claim = who => ({ kind: 'claim', dur: 0, start(c) { for (const m of who(c)) { c.roster.claim(m); c.roster.setPose(m, { ...m.pos, walking: false }); } return false; } });
// 0 秒：走到目的地就藏起來（小學生躲進校舍；回合末的 apply 收掉藏著的人不閃白）
const hide = who => ({ kind: 'hide', dur: 0, start(c) { const m = who(c); if (m) c.roster.hide(m); return false; } });
// 偵防師 ！：晶片 ≥3 時老鼠一生窩，名冊就把一個工程師換成偵防師（晶片 grow 3 那邊也補這一拍，哪邊先成立哪邊演）
const detectiveBubble = (ctx, s) => (s.lv.chip >= 3 ? [ctx.B.bubble(detective, '！', 0.8)] : []);
// 列車停在 at 方位，車頂的老鼠依序跳到島緣 slots 裡自己的位置；這次升級前不在車上（鼠災後在巨蛋）就不等車
function hopOff(B, s, ids, at, centre, r) {
  if (!riding(s)) return [];
  const spots = once(c => c.nav.slots(centre(c), ids.length, r));
  return [B.trainStop({ at, stop: hold(ids.length), during: ids.flatMap((i, k) => [B.jump(rat(i), c => spots(c)[k], JUMP), ...(k < ids.length - 1 ? [B.wait(HOP)] : [])]) })];
}

// 咬鮮奶：一隻走到牛奶箱 → 聞一聞 → ！ → 箱子翻倒（真的掉級才閃白換成側躺；引擎裡被咬時鮮奶都還是 Lv1，不掉級，只撞歪）
//   → 小學生 ！ 跑回校門口躲進去 → LEVEL DOWN
function bite(e, ctx) {
  const { B } = ctx, r = once(c => c.roster.nearest(KEY, CRATE)), KIDS = [0, 1, 2], down = e.delta.to < e.delta.from;
  return [
    B.walk(r, offset(CRATE, 0.45, 0.2), { speed: 2.0 }), B.gesture(r, 'sniff'), B.bubble(r, '！'),
    // 沒掉級（引擎裡一定是這樣）：箱子被撞歪（下一次鮮奶套用重建就回正）；掉級：閃白換成翻倒的箱子
    down ? B.apply(e, { only: ['milk.crate'] }) : B.tilt('milk.crate', { rz: 0.35, dur: 0.3 }),
    B.together(KIDS.map(i => B.bubble(kid(i), '！', 0.8))),
    B.together(KIDS.map(i => B.walk(kid(i), SCHOOL_GATE))), ...KIDS.map(i => hide(kid(i))),
    B.apply(e), B.home(r), ...(down ? [B.levelUp('milk', { down: true })] : []),
  ];
}
// 撞珍奶：一隻走到攤車旁 → 攤車歪掉（下一次重建回正）→ 老闆 ！（老闆名冊還沒有就跳過）
function crash(e, ctx) {
  const { B } = ctx, BOBA = anchorWorld('boba'), r = once(c => c.roster.nearest(KEY, BOBA));
  return [
    B.walk(r, offset(BOBA, -0.5, 0.3)), B.tilt('boba.main', { rz: 0.25, dur: 0.3 }),
    B.bubble(c => c.roster.members('boba.owner')?.[0] ?? null, '！'), B.home(r),
  ];
}

export const script = {
  // 一隻老鼠從巨蛋格的岸邊爬上來 → …… 喘口氣 → 聞一聞 → 張望 101 → 沿岸走一段 → 看見巨蛋 ！ → 再往巨蛋走一小段 → 聞一聞 → ？ → 窩旁晃
  placed(e, s, ctx) {
    const { B } = ctx, r0 = rat(0);
    return [
      B.apply(e, { hold: [KEY] }), B.spawn(KEY, LANDING), B.walk(r0, c => c.nav.nearestWalkable(LANDING)),   // 從水裡爬上岸
      B.bubble(r0, '……'), B.gesture(r0, 'sniff'),
      B.gesture(r0, 'look', { at: TOWER }), B.walk(r0, BEACH), B.gesture(r0, 'look', { at: DOME }), B.bubble(r0, '！', 0.8),
      B.walk(r0, NEAR_DOME), B.gesture(r0, 'sniff'), B.bubble(r0, '？', 1.5), B.home(r0),
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
      const { B } = ctx, mode = ratMode(s.lv, s.flags);
      // 搭捷運：一隻 ！ 跑到站前島緣 …… → 列車進站，跳上第一節車頂 → 其餘 ！ 跑到窩那側島緣 → 列車繞到時依序跳上 → 車頂
      // 新家（車頂）先 hold 著：跳上車的那隻 home 就坐好跟車走，還在岸上的不會被名冊瞬移上車
      // 鏡頭（§13.1）：先對著捷運站（代幣格）看第一隻上車，其餘四隻跑向窩那側島緣時轉回老鼠窩格
      if (mode === 'train') {
        const r0 = rat(0), others = [1, 2, 3, 4], wait = once(c => c.nav.slots(NEST_SHORE(c), 4, 0.3));
        return [
          B.focus('token'), claim(RATS), B.apply(e, { only: [KEY], hold: [KEY] }),
          B.bubble(r0, '！', 0.8), B.walk(r0, SHORE), B.bubble(r0, '……'),
          B.trainStop({ stop: hold(1), during: [B.jump(r0, B.seat(0, ctx), JUMP), B.home(r0)] }),
          // 邊喊邊跑（列車剛離站，要趕在它繞到窩那側之前到岸邊）
          B.together([B.focus('rat'), ...others.map(i => B.bubble(rat(i), '！', 0.8)), ...others.map((i, k) => B.walk(rat(i), c => wait(c)[k]))]),
          B.trainStop({ at: NEST_A, stop: hold(4), during: others.flatMap((i, k) => [B.jump(rat(i), B.seat(i, ctx), JUMP), B.home(rat(i)), ...(k < 3 ? [B.wait(HOP)] : [])]) }),
          B.apply(e), B.home(RATS), B.levelUp('rat'),
        ];
      }
      // 泡溫泉（代幣 <2）：五隻走上台地到池邊 → 一起 ♥ → 池水閃白變綠 → 走進池子（鏡頭對著溫泉格）
      if (mode === 'spring') {
        const ids = [0, 1, 2, 3, 4];
        return [
          B.focus(SPRING), claim(RATS), B.apply(e, { only: [KEY], hold: [KEY] }),
          B.together(ids.map(i => B.walk(rat(i), SPRING_SPOTS[i]))), B.together(ids.map(i => B.bubble(rat(i), '♥'))),
          B.apply(e), B.home(RATS), B.levelUp('rat'),
        ];
      }
      return null;   // 鼠災後的老鼠留在巨蛋門口：預設劇本
    },
    4(e, s, ctx) {
      const { B } = ctx, branch = branchOf(s), ids = [0, 1, 2, 3, 4], r0 = rat(0);
      if (s.flags.domeRats) return null;
      const transform = [B.apply(e), B.apply(branchEvent(branch))];
      // 賽博：偵防師走到園區那側島緣、列車進站，老鼠們依序跳下來 → ！ → 圖框「晶片」→ 跟著他走到園區門口 → 依序閃白變機器鼠（天線）
      // 鏡頭（§13.1）：整段在園區（晶片格）
      if (branch === 'cyber') {
        const gate = once(c => c.nav.slots(PARK, 5, 0.6));
        return [
          B.focus('chip'), B.together([B.walk(detective, PARK_SHORE), ...hopOff(B, s, ids, PARK_A, PARK_SHORE, 0.35)]),
          B.bubble(detective, '！'), B.bubble(detective, { icon: 'chip' }),
          // 排成一列跟著他：每隻晚 0.3 s 出發
          B.together([B.walk(detective, offset(PARK, 0.5, 0.5)), ...ids.map(i => B.walk(rat(i), c => gate(c)[i], { delay: FOLLOW * (i + 1) }))]),
          ...transform, B.wait(0.8), B.home(c => [...RATS(c), detective(c)].filter(Boolean)), B.levelUp('rat'),
        ];
      }
      // 外星：一隻在溫泉那側跳下車、走到溫泉邊 …… → 閃白變異（放大、綠光、三眼；其餘的閃白後拿掉）→ 對天揮手 → ？（鏡頭對著溫泉格）
      return [
        B.focus(SPRING), ...hopOff(B, s, [0], SPRING_A, SPRING_SHORE, 0.1),
        B.walk(r0, MUTANT), B.bubble(r0, '……'),
        ...transform, B.home(r0), B.wait(0.8), B.bubble(r0, '？'), B.levelUp('rat'),
      ];
    },
    5(e, s, ctx) {
      const { B } = ctx, r0 = rat(0);
      if (ratMode(s.lv, s.flags) === 'cyber') {
        // 軍團：補到 10 隻 → 列隊走到 101 腳下 → 繞 101（鏡頭對著 101）
        const ids = Array.from({ length: 10 }, (_, i) => i), slots = once(c => c.nav.slots(TOWER, 10, 1.3));
        return [
          // 新的五隻從園區門口（入口）走出來、不閃，一出來就跟著列隊；石堆小島的兩隻同時閃白收掉（骨架動畫 ≤ 12，LEVEL UP 之後不再閃）
          B.focus('tower'), B.apply(e, { only: [KEY, 'sat.rocks'] }),
          B.together(ids.map(i => B.walk(rat(i), c => slots(c)[i]))),
          B.home(RATS), B.levelUp('rat'),
        ];
      }
      if (ratMode(s.lv, s.flags) === 'alien') {
        // 小 UFO 從天上降下停在變異鼠頭上 → ♥（鏡頭對著溫泉格）
        return [
          B.focus(SPRING), B.apply(e, { only: ['rat.ufo'], blink: false }), B.move('rat.ufo', { from: { dy: 6 }, to: {}, dur: 1.5 }),
          B.bubble(r0, '♥', 0.9), B.levelUp('rat'),
        ];
      }
      return null;
    },
  },
  // 生窩時的反應（spec.js 老鼠 onLevel 2）；分岔（onLevel 4）已經在 grow 4 演完
  fx(e, s, ctx) {
    if (e.flag?.name === 'ratBranch') return [];
    if (e.delta?.target === 'milk') return bite(e, ctx);
    if (!e.delta && !e.flag && s.lv.boba > 0) return crash(e, ctx);
    return null;
  },
  rep: (s, ctx) => ctx.roster.members(KEY).find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
