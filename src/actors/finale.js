// 最終章（計畫 5，設計 §3、§9）：飛彈倒數的宣告與數字、飛彈、真結局尾聲——都不是物品，是遊戲層合成的事件。
// 遊戲層（game.js）在每個倒數回合最前面插 countdown 事件（n = 3、2、1，flag alarm = n），第 8 個放完、倒數演完之後
// 演一個終局回合：missile 事件（flag missile = shield／deflect／hit），真結局再接 epilogue（flag epilogue = 結局 id）。
// 旗標只折進舞台（stage.flags，foldEvent 照 e.flag 折），引擎狀態不碰。turn.js 把這三種事件的劇本交給這個模組（script[e.kind]）。
// 任務 3：宣告（設計 §4）——倒數 3 的回合一開頭，鏡頭對面遠方的海平面亮起紅光（finale.flare），全島抬頭看、冒「！」，
// 101 頭上冒「3」；紅光整個倒數期間都在、越閃越快，飛彈發射時熄掉（flags.missile 一設就不畫）。
// missile／epilogue 還只套用事件（旗標進舞台；飛彈、尾聲的零件在後面的任務）。
import { lookUp, crowd, islanders } from '../show/crowd.js';

export const id = 'finale';

// 數字泡泡的真實秒數（設計 §4 第 3 步：「3」「2」「1」各 1.2 秒，取代以前每回合連冒 3、2、1 各 0.6 秒）
export const DIGIT = 1.2;
// 宣告：全島抬頭看紅光 1.2 秒、頭上「！」0.8 秒（真實秒數；倒數回合是蒙太奇 2 倍速，劇本乘回 ctx.speed）
export const LOOK = 1.2, SHOUT = 0.8;

// 紅光的位置：鏡頭對面（全景沿 −z 看過去）主島西北方、背景環山山腳前的海面上。
// 設計 §4 寫「背景山之外」，但環山（terrain.js 半徑 25–50 隆起、遠側不壓低）山脊以外的點在 16:9 全景一律投影到 NDC y > 1（出畫），
// 所以退到山腳前的海面（地形 y −0.6）、往 −x 偏開 101（16:9 全景裡 101 就在畫面正中，紅光放 x −6 會被塔身擋住）。
// 實測（點燈天際線 7.75）：16:9 NDC (−0.24, 0.61)、390×844 (−0.60, 0.39)；工地天際線 ≤ 3：16:9 (−0.27, 0.87)、390×844 (−0.70, 0.58)；
// 沿視線到鏡頭都不被地形擋（帶 app.js 的雜訊取樣）
export const FLARE_AT = { x: -12, y: 2.5, z: -23 };
export const FLARE_COLOR = 0xff5a3c, FLARE_R = 0.9, COLUMN_H = 6;
// 脈動頻率：倒數 3／2／1 → 1／2／3 Hz（越來越急）
export const flareHz = n => 4 - n;

export function view(lv, flags = {}) {
  const v = {};
  // 飛彈一發射紅光就熄（設計 §4、§6）；alarm 只會是 3、2、1
  if (flags.alarm && !flags.missile) v['finale.flare'] = { kind: 'flare', at: FLARE_AT, hz: flareHz(flags.alarm), shadow: false, footprint: false };
  return v;
}

export const builders = {
  // 紅光：發光的球（r 0.9）＋一道從海面往上的淡淡光柱（高 6、半透明、不寫深度）。不投影、不收影（遠方的光，不是實體）。
  // 自己建材質（不走 compound 的 glow 分組）：手機畫質（quality low）compound 會把發光併進 clay，紅光就不亮了。
  // 強度照 tower.js 矽盾天線的作法：底強度 1.2 不跟夜晚歸零（白天也看得到）＋ ctx.glow.intensity，再乘脈動。
  // 光柱：從海面（球心下 FLARE_AT.y + 0.18 ≈ 2.7）往上，總高 COLUMN_H
  flare(THREE, spec, ctx) {
    const object = new THREE.Group();
    const orbMat = new THREE.MeshStandardMaterial({ color: FLARE_COLOR, emissive: FLARE_COLOR, roughness: 0.6, metalness: 0 });
    const beamMat = new THREE.MeshBasicMaterial({ color: FLARE_COLOR, transparent: true, opacity: 0.35, depthWrite: false });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(FLARE_R, 20, 14), orbMat);
    const bottom = -(spec.at.y + 0.18), beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, COLUMN_H, 14, 1, true), beamMat);
    beam.position.y = bottom + COLUMN_H / 2;
    orb.name = 'orb'; beam.name = 'beam';
    for (const m of [orb, beam]) { m.castShadow = m.receiveShadow = false; object.add(m); }
    const hz = spec.hz ?? 1;
    const pose = t => {
      const k = (1 + Math.sin(t * Math.PI * 2 * hz)) / 2;
      orbMat.emissiveIntensity = (1.2 + ctx.glow.intensity) * (0.35 + 0.65 * k);
      beamMat.opacity = 0.15 + 0.3 * k;
    };
    pose(0);
    return {
      object, materials: [orbMat], update(dt, t) { pose(t); },
      dispose() { orb.geometry.dispose(); beam.geometry.dispose(); orbMat.dispose(); beamMat.dispose(); },
    };
  },
};

export const script = {
  // 倒數 3（設計 §4）：紅光閃白出現 → 全島（最多 24 人）轉頭看紅光、頭上一起冒「！」→ 101 頭上「3」→ 放回日常。
  // 倒數 2、1：只有數字（紅光早就在了，脈動頻率跟著 alarm 換）。
  // 倒數回合是蒙太奇 2 倍速（ctx.speed）——看與字是給玩家讀的，演出時間乘回倍速，真實秒數照舊。
  // together 裡「！」排在抬頭前面：together 依序 start，抬頭會把人 claim 走（mode 不再是 home），排後面的 islanders 就點不到他們了；
  // 「！」點的是 islanders 的前 24 個——跟 lookUp 同一刻、同一個順序點名，所以是同一批人
  countdown(e, s, ctx) {
    const { B } = ctx, digit = B.bubble('tower', String(e.n), DIGIT * ctx.speed);
    if (e.n !== 3) return [digit];
    const up = lookUp(B, FLARE_AT, LOOK * ctx.speed);
    const shout = crowd(B, c => islanders(c).slice(0, up.look.length).map(m => B.bubble(m, '！', SHOUT * ctx.speed)));
    return [B.apply(e, { only: ['finale.flare'] }), B.together([shout, ...up.look]), up.release, digit];
  },
  missile: (e, s, ctx) => [ctx.B.apply(e)],
  epilogue: (e, s, ctx) => [ctx.B.apply(e)],
};
