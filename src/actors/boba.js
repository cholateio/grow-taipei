// 珍奶（§5.1）：路邊攤車 → 6 個拿行李箱的觀光客排隊 → 珍奶噴泉廣場（有鮮奶 ≥2 → 招牌變「鮮奶珍奶」、排 10 人）。
// 老闆、觀光客是名冊（§8.7 的劇本讓同一批人走過來排隊）；老鼠撞翻攤車、颱風外送是那兩個模組的劇本，不在這裡。
import { anchorWorld } from './anchors.js';
import { C, offset } from './palette.js';
import { island } from './satellites.js';
import { ITEMS } from '../rules/spec.js';
import { BLINK } from '../show/blink.js';

export const id = 'boba';
export const labelY = 1.0;
const TEA = 0xc9a27c, SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// 排隊（§13.3，計畫 3.8 Task 7）：橫排一列沿 x 往 −x（捷運站那側）排，所有人同一個 z——沿 z 排的話在畫面上會疊成一條黑色長條。
// 攤車時排在攤車前方（+z 0.9）；噴泉廣場（plaza）時噴泉佔滿格子東半，改沿噴泉南緣外（+z 1.0）。
// 間距 0.25 = 站著的人的分離距離（nav.SEPARATION），站定不會再被擠開。都面向攤車／噴泉
const QUEUE_GAP = 0.25;
export function queue(at, n, plaza = false) {
  return Array.from({ length: n }, (_, i) => {
    const p = offset(at, 0.3 - QUEUE_GAP * i, plaza ? 1.0 : 0.9);
    return { ...p, yaw: Math.atan2(at.x - p.x, at.z - p.z) };
  });
}

const AT = anchorWorld('boba'), BEHIND = offset(AT, 0, -0.45), BESIDE = offset(AT, -1.0, -0.6);   // 老闆：攤車後面（面向 +z）／噴泉旁
// 碼頭（觀光客的入口，§13.2）：珍奶格靠海的東邊。東邊那條邊只有北段離兩種人龍都 ≥ 1.5，而夜市（燈泡 ≥2）蓋住那一段，
// 所以取那一段最近的可走點——格子東角、夜市北邊（夜市 footprint 外擴 PAD 之外）；三個點沿 −x 錯開 0.25（一批三個人一人一個）
export const PIER = [0, 1, 2].map(k => offset(AT, 0.35 - 0.25 * k, -1.7));

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
  // 噴泉的 footprint 0.8：外擴 PAD（0.12）後剛好蓋住矮台階（半徑 0.9），南緣外的人龍站得下（§14.1）
  v['boba.main'] = { kind: 'compound', at, parts, footprint: n < 3 ? { w: 0.7, d: 0.5 } : { r: 0.8 } };
  // 老闆日常：站著搖杯（每 3 秒揮一下手）
  // 攤車後面和夜市之間（夜市 ≥2 攤時）外擴 PAD 後沒有空隙：rescue 讓老闆站到最近的可走點，不從攤車中間穿過去（§14.1）
  v['boba.owner'] = { kind: 'roster', at, n: 1, accessory: 'apron', home: { kind: 'stand', spots: [{ ...(n < 3 ? BEHIND : BESIDE), yaw: 0 }], fidget: 'wave', rescue: true } };
  // 排隊的點都在噴泉／攤車外；萬一落進別的 footprint，rescue 讓名冊站到最近的可走點
  if (n >= 2) { const k = n >= 3 && fresh ? 10 : 6; v['boba.queue'] = { kind: 'roster', at, n: k, accessory: 'suitcase', shirt: SHIRTS, home: { kind: 'stand', spots: queue(at, k, n >= 3), rescue: true, entry: PIER } }; }
  return v;
}

// ── 劇本（§8.7）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const owner = c => c.roster.members('boba.owner')[0] ?? null;
const engineer = i => once(c => c.roster.members('chip.engineers').filter(m => !m.hidden)[i] ?? null);
const islander = i => c => c.roster.members('landmarks.islanders').filter(m => !m.hidden)[i] ?? null;
const FOREST = island('forest'), ISLANDERS = 10;   // 糖分超標時最多這麼多島民一起 ♥
// 推攤車：老闆從攤位北邊約 4.5 的地方出發（捷運站那側的路口），尋路最後一段從 −z 直直推進攤位，攤車停在 at 剛好接上。
// 攤車在他面前 HANDLE 的地方；攤車朝向追著老闆的朝向轉（每秒 TURN 的比例），轉彎時不會瞬間甩到旁邊
const FROM = offset(AT, -1.0, -4.5), HANDLE = 0.45, TURN = 12;
const start = c => { const p = c.nav.nearestWalkable(FROM); return { ...p, yaw: Math.atan2(BEHIND.x - p.x, BEHIND.z - p.z) }; };
const ahead = (p, yaw) => ({ x: p.x + Math.sin(yaw) * HANDLE, y: p.y, z: p.z + Math.cos(yaw) * HANDLE });
// 攤車在出發點（老闆面前）出現、閃白 BLINK 秒
function cartIn() {
  let obj = null;
  return {
    kind: 'cartIn', dur: BLINK,
    start(c) {
      obj = c.stage.partObject('boba.main'); if (!obj) return false;
      const p = start(c), q = ahead(p, p.yaw); obj.position.set(q.x, p.y, q.z); obj.visible = true;
      c.blink.part(obj);
    },
    end() { if (obj) obj.visible = true; },
  };
}
// 每幀把攤車放在老闆面前；end 停在 at（轉正）
function push(w) {
  let obj = null, yaw = 0;
  const dyaw = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return {
    kind: 'push', dur: () => w.dur(),
    start(c) { obj = c.stage.partObject('boba.main'); const m = owner(c); if (!obj || !m) return false; yaw = m.yaw; },
    step(k, dt, c) {
      const m = owner(c); if (!m) return;
      yaw += dyaw(yaw, m.yaw) * Math.min(1, dt * TURN);
      const q = ahead(m.pos, yaw); obj.position.set(q.x, m.pos.y, q.z); obj.rotation.y = 0;
    },
    end() { if (obj) { obj.position.set(AT.x, AT.y, AT.z); obj.rotation.z = 0; obj.visible = true; } },
  };
}
// 糖分超標：grow 3 的劇本建拍時旗標還沒折進來（是緊接著的 onLevel 事件），照規則資料自己判斷
const [SUGAR_ID, SUGAR_MAX] = ITEMS.boba.onLevel[3].find(a => a.flag?.name === 'bobaSugar').when.maxLevel;
const sugary = s => !!s.flags.bobaSugar || s.lv[SUGAR_ID] <= SUGAR_MAX;
// 觀光客從碼頭出來，一批三個一人一個入口點（被擋就站到最近的可走點）
const pier = k => c => c.nav.nearestWalkable(PIER[k]);

export const script = {
  // 老闆從捷運站北邊推著攤車走過來（常速約 3 s，攤車每幀都在他面前）→ 停好 → ♪
  placed(e, s, ctx) {
    const { B } = ctx, w = B.walk(owner, BEHIND);
    return [
      B.apply(e, { only: ['boba.owner'], hold: ['boba.owner'] }), B.apply(e, { only: ['boba.main'], blink: false }),
      B.together([B.spawn('boba.owner', start), cartIn()]),
      B.together([w, push(w)]),
      B.apply(e), B.bubble(owner, '♪', 0.9), B.home(owner),
    ];
  },
  grow: {
    // 人龍：6 個觀光客從碼頭分兩批（每批 3 個）走過來排隊
    2(e, s, ctx) {
      const { B } = ctx, spots = queue(AT, 6);
      const batch = js => { const sp = js.map((j, k) => B.spawn('boba.queue', pier(k))); return [...sp, B.together(js.map((j, k) => B.walk(() => sp[k].member, spots[j])))]; };
      return [B.apply(e, { hold: ['boba.queue'] }), ...batch([0, 1, 2]), ...batch([3, 4, 5]), B.home(c => c.roster.members('boba.queue')), B.levelUp('boba')];
    },
    // 噴泉：兩個工程師下班走到人龍尾 → ♥ ♥ → 老闆 ！ → 閃白噴泉廣場（人龍補到 10、老闆走到噴泉旁）；糖分超標：島民一起 ♥
    3(e, s, ctx) {
      const { B } = ctx, tail = queue(AT, 8).slice(6), engs = [0, 1].map(engineer);
      return [
        B.together(engs.map((g, i) => B.walk(g, tail[i]))), B.together(engs.map(g => B.bubble(g, '♥'))),
        B.bubble(owner, '！'), B.apply(e),
        ...(sugary(s) ? [B.together(Array.from({ length: ISLANDERS }, (_, i) => B.bubble(islander(i), '♥')))] : []),
        B.home(engs), B.levelUp('boba'),
      ];
    },
    // 分店：老闆 …… → 圖框「小島」→ 鏡頭到小森林島（focus，zoom 0.8）→ 閃白分店、觀光客 2 人 → 觀光船多 2 艘 →
    // 鏡頭跟 LEVEL UP 一起回珍奶格（levelUp 1 秒 ≥ focus 拍，不多佔時間）
    4(e, s, ctx) {
      const { B } = ctx;
      return [
        B.bubble(owner, '……'), B.bubble(owner, { icon: 'islet' }), B.focus(FOREST, { zoom: 0.8 }),
        B.apply(e, { only: ['sat.forestShop', 'sat.forest'] }), B.apply(e), B.together([B.focus('boba'), B.levelUp('boba')]),
      ];
    },
  },
  // 糖分超標在 grow 3 裡演了；這裡只把旗標折進來
  fx: (e, s, ctx) => (e.flag?.name === 'bobaSugar' ? [ctx.B.apply(e, { blink: false })] : null),
  rep: (s, ctx) => ctx.roster.members('boba.owner').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
