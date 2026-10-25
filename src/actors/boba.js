// 珍奶（§5.1）：路邊攤車 → 6 個拿行李箱的觀光客排隊 → 珍奶噴泉廣場（有鮮奶 ≥2 → 招牌變「鮮奶珍奶」、排 10 人）。
// 老闆、觀光客是名冊（§8.7 的劇本讓同一批人走過來排隊）；老鼠撞翻攤車、颱風外送是那兩個模組的劇本，不在這裡。
import { anchorWorld } from './anchors.js';
import { C, offset } from './palette.js';
import { island } from './satellites.js';
import { ITEMS } from '../rules/spec.js';

export const id = 'boba';
export const labelY = 1.0;
const TEA = 0xc9a27c, SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// 排隊：從攤車左側往南（+z，遠離捷運站）排 6 個，再往 −x 轉彎；都面向攤車
function queue(at, n) {
  return Array.from({ length: n }, (_, i) => {
    const p = i < 6 ? offset(at, -0.4, 0.15 + 0.22 * i) : offset(at, -0.4 - 0.22 * (i - 5), 0.15 + 0.22 * 5);
    return { ...p, yaw: Math.atan2(at.x - p.x, at.z - p.z) };
  });
}

const AT = anchorWorld('boba'), BEHIND = offset(AT, 0, -0.45), BESIDE = offset(AT, -1.0, -0.6);   // 老闆：攤車後面（面向 +z）／噴泉旁

export function view(lv) {
  const n = lv.boba, at = AT, v = {};
  if (!n) return v;
  const fresh = lv.milk >= 2;
  const parts = n < 3 ? [
    { kind: 'box', pos: [0, 0.35, 0], scale: [0.6, 0.5, 0.4], color: C.wall },
    { kind: 'hip', pos: [0, 0.75, 0], scale: [0.75, 0.25, 0.55], color: C.coral },
    { kind: 'torus', pos: [-0.2, 0.1, 0.21], scale: 0.2, color: C.ink }, { kind: 'torus', pos: [0.2, 0.1, 0.21], scale: 0.2, color: C.ink },
    { kind: 'cylinder', pos: [0, 1.0, 0], scale: [0.2, 0.25, 0.2], color: TEA },
    { kind: 'sphere', pos: [0, 0.92, 0.1], scale: 0.05, color: C.ink },
  ] : [
    { kind: 'cylinder', pos: [0, 0.03, 0], scale: [1.8, 0.06, 1.8], color: C.curb },
    { kind: 'cylinder', pos: [0, 0.07, 0], scale: [1.3, 0.04, 1.3], color: 0xa4d4da, glow: 0xa4d4da },
    { kind: 'cylinder', pos: [0, 0.48, 0], scale: [0.6, 0.8, 0.6], color: TEA },
    { kind: 'dome', pos: [0, 0.88, 0], scale: 0.62, color: C.cream },
    { kind: 'cylinder', pos: [0.08, 1.25, 0], scale: [0.05, 0.6, 0.05], rot: [0, 0, 0.2], color: C.coral },
    ...[0, 1, 2].map(i => ({ kind: 'sphere', pos: [Math.cos(i * 2.1) * 0.22, 0.16, Math.sin(i * 2.1) * 0.22], scale: 0.09, color: C.ink })),
    { kind: 'box', pos: [0, 0.3, 0.88], scale: [0.6, 0.2, 0.04], color: fresh ? C.white : C.coral, sign: true },
    { kind: 'box', pos: [0, 0.3, 0.9], scale: [0.4, 0.06, 0.02], color: fresh ? C.blue : C.cream },
  ];
  v['boba.main'] = { kind: 'compound', at, parts, footprint: n < 3 ? { w: 0.7, d: 0.5 } : { r: 0.95 } };
  // 老闆日常：站著搖杯（每 3 秒揮一下手）
  v['boba.owner'] = { kind: 'roster', at, n: 1, accessory: 'apron', home: { kind: 'stand', spots: [{ ...(n < 3 ? BEHIND : BESIDE), yaw: 0 }], fidget: 'wave' } };
  // 排隊的點在格子上、footprint 外的走路格救得回來（名冊的 stand 日常走回去時尋路）
  if (n >= 2) { const k = n >= 3 && fresh ? 10 : 6; v['boba.queue'] = { kind: 'roster', at, n: k, accessory: 'suitcase', shirt: SHIRTS, home: { kind: 'stand', spots: queue(at, k) } }; }
  return v;
}

// ── 劇本（§8.7）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const owner = c => c.roster.members('boba.owner')[0] ?? null;
const engineer = i => once(c => c.roster.members('chip.engineers').filter(m => !m.hidden)[i] ?? null);
const islander = i => c => c.roster.members('landmarks.islanders').filter(m => !m.hidden)[i] ?? null;
const STATION_SIDE = offset(anchorWorld('token'), 1.2, 1.0), PIER = offset(AT, 1.6, 1.4), FOREST = island('forest');
const PUSH = 0.4, ISLANDERS = 10;   // 推攤車慢慢走（約 3 s）；糖分超標時最多這麼多島民一起 ♥
// 糖分超標：grow 3 的劇本建拍時旗標還沒折進來（是緊接著的 onLevel 事件），照規則資料自己判斷
const [SUGAR_ID, SUGAR_MAX] = ITEMS.boba.onLevel[3].find(a => a.flag?.name === 'bobaSugar').when.maxLevel;
const sugary = s => !!s.flags.bobaSugar || s.lv[SUGAR_ID] <= SUGAR_MAX;
// 觀光客從碼頭（珍奶格靠海那側，在水裡）最近的可走點出來，一批三個左右錯開
const pier = k => c => c.nav.nearestWalkable(offset(PIER, -0.25 * k, 0));

export const script = {
  // 老闆從捷運站那邊推著攤車走到定位（攤車和老闆同時、同向移動）→ ♪
  placed(e, s, ctx) {
    const { B } = ctx, off = { dx: STATION_SIDE.x - BEHIND.x, dz: STATION_SIDE.z - BEHIND.z }, w = B.walk(owner, BEHIND, { speed: PUSH });
    return [
      B.apply(e, { only: ['boba.owner'], hold: ['boba.owner'] }), B.spawn('boba.owner', STATION_SIDE),
      B.apply(e, { only: ['boba.main'], flash: false }), B.move('boba.main', { from: off, to: off, dur: 0 }),   // 攤車停在老闆前面
      B.together([w, B.move('boba.main', { from: off, to: 0, dur: () => w.dur() })]),
      B.apply(e), B.bubble(owner, '♪'), B.home(owner),
    ];
  },
  grow: {
    // 人龍：6 個觀光客從碼頭分兩批（每批 3 個）走過來排隊
    2(e, s, ctx) {
      const { B } = ctx, spots = queue(AT, 6);
      const batch = js => { const sp = js.map((j, k) => B.spawn('boba.queue', pier(k))); return [...sp, B.together(js.map((j, k) => B.walk(() => sp[k].member, spots[j])))]; };
      return [B.apply(e, { hold: ['boba.queue'] }), ...batch([0, 1, 2]), ...batch([3, 4, 5]), B.home(c => c.roster.members('boba.queue')), B.levelUp('boba')];
    },
    // 噴泉：兩個工程師下班走到人龍尾 → ♥ ♥ → 老闆 ！ → 白光噴泉廣場（人龍補到 10、老闆走到噴泉旁）；糖分超標：島民一起 ♥
    3(e, s, ctx) {
      const { B } = ctx, tail = queue(AT, 8).slice(6), engs = [0, 1].map(engineer);
      return [
        B.together(engs.map((g, i) => B.walk(g, tail[i]))), B.together(engs.map(g => B.bubble(g, '♥'))),
        B.bubble(owner, '！'), B.apply(e),
        ...(sugary(s) ? [B.together(Array.from({ length: ISLANDERS }, (_, i) => B.bubble(islander(i), '♥')))] : []),
        B.home(engs), B.levelUp('boba'),
      ];
    },
    // 分店：老闆 …… → 圖框「小島」→ 鏡頭到小森林島 → 白光分店、觀光客 2 人 → 觀光船多 2 艘 → 鏡頭回家
    4(e, s, ctx) {
      const { B } = ctx;
      return [
        B.bubble(owner, '……'), B.bubble(owner, { icon: 'islet' }), B.camera(FOREST),
        B.apply(e, { only: ['sat.forestShop', 'sat.forest'] }), B.apply(e), B.camera('home'), B.levelUp('boba'),
      ];
    },
  },
  // 糖分超標在 grow 3 裡演了；這裡只把旗標折進來
  fx: (e, s, ctx) => (e.flag?.name === 'bobaSugar' ? [ctx.B.apply(e, { flash: false })] : null),
  rep: (s, ctx) => ctx.roster.members('boba.owner')[0] ?? null,
};
