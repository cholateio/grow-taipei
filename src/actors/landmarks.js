// 北側台地的常駐地標：陽明山（火山，山口冒煙）與北投溫泉（池子、小澡堂、蒸氣）。開局就在（§4.1）。
import { landmarkWorld, cellCentre } from './anchors.js';
import { offset } from './palette.js';
import { trainCars } from './token.js';

export const id = 'landmarks';

// 島民（§14.3 人分散）：最多四個人一個名冊，一人住一格散步（第 i 人用 home.at[i]）——人數預算（裁決 R16）：
// 最擠的球場格（球員、觀眾、草皮、搭車來的球迷）與珍奶格（人龍、站務員）不住島民；溫泉格住的是下面兩位溫泉客
export const HOME_R = 1.8;   // 散步半徑：格子中心常被建築蓋住，要夠大才挑得到走得到的點（鮮奶節的小孩同一個半徑，milk.js）
export const HOMES = [[0, 0], [1, 0], [-1, 0], [0, -1]].map(cellCentre);
// 溫泉池（底座半徑 0.7，加上池邊的石頭到 0.75）、小澡堂、木牌各自的 footprint——不再用整個包圍盒（會把池邊整圈都擋掉）。
// 颱風登陸時池子不能躲（door: false），小澡堂可以（door: true，比一般的門小）
const POOL_R = 0.75;
export const BATHHOUSE = { x: 0.95, z: -0.75, w: 0.6, d: 0.5, door: true };
const SPRING_FP = [{ r: POOL_R, door: false }, BATHHOUSE, { x: -0.85, z: 0.75, w: 0.36, d: 0.04 }];
// 溫泉客泡在池裡（計畫 13 §設計 3，使用者 2026-11-01「溫泉區可以有人進去泡」）：池心半徑 0.3、靠鏡頭那側兩點（角度 0.93、2.0），面向池心；
// y 壓到池水面（底座頂 0.13）下 0.15——水淹到胸口，只露頭肩與手臂（計畫寫 0.22，截圖裡只剩一顆頭）。站位在池子 footprint 裡又不帶 rescue（同淹水的泳客）：
// 名冊補人、颱風躲完雨回來都是走到池邊最近的可走點、最後一段直直走進池裡（roster 的 authored 站位）。
// 泡湯老鼠（rat.js SPRING_SPOTS：池心半徑 0.62、5 隻）離每位溫泉客 ≥ 0.37（≥ 0.25）；
// 外星的變異鼠站在池子前緣（rat.js MUTANT）時離兩人都 0.73（≥ 0.6），溫泉客在池裡不換位置——
// 計畫寫的「改用北側的角度」要先從池裡走出來（nav 從 footprint 裡逃到最近的可走點，正好是變異鼠站的池子前緣）再繞一圈，反而貼著牠走
const SOAK_R = 0.3, WATER_TOP = 0.13, SOAK = 0.15;
const BATHERS = [0.93, 2.0].map(a => { const p = { x: Math.cos(a) * SOAK_R, z: Math.sin(a) * SOAK_R }; return { p, yaw: Math.atan2(-p.x, -p.z) }; });

// 島民人數：四個人減掉轉成角色的（代幣 ≥2 的站長）。flush() 會把不夠的名冊補滿，所以宣告的人數一定要跟著減。
// 鮮奶不再借島民（計畫 13 §設計 1：兩個小學生都從校門外走進來）
export const islanderCount = (lv = {}) => HOMES.length - (lv.token >= 2 ? 1 : 0);

const ROCK = 0xb8a892, CLIFF = 0xd2b48c, WALL = 0xf1e7da, YELLOW = 0xfcea8b, WATER = 0xa4d4da;

// 老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時池水變成淡綠色
export function view(lv = {}, flags = {}) {
  const v = landmarkWorld('volcano'), s = landmarkWorld('spring'), water = lv.rat >= 3 && !trainCars(lv.token) ? 0xbfd39c : WATER;
  return {
    'landmarks.volcano': {
      kind: 'compound', at: v, parts: [
        { kind: 'frustum', pos: [0, 0.75, 0], scale: [2.6, 1.5, 2.6], color: CLIFF },
        { kind: 'cylinder', pos: [0, 1.5, 0], scale: [1.5, 0.04, 1.5], color: 0x8f7a62 },
        { kind: 'sphere', pos: [0, 1.5, 0], scale: [0.7, 0.14, 0.7], color: 0xdb6a41, glow: 0xdb6a41 },
        ...[[1.1, 0.5], [-0.9, 0.8], [0.4, -1.15], [-1.2, -0.4]].map(([x, z], i) => ({ kind: 'ico', pos: [x, 0.12, z], scale: [0.32, 0.24, 0.3], rot: [0, i, 0], color: ROCK })),
      ],
    },
    'landmarks.volcanoSmoke': { kind: 'smoke', at: v, n: 6, size: 0.3, rise: 1.8, offsetY: 1.55 },
    'landmarks.spring': {
      kind: 'compound', at: s, parts: [
        { kind: 'cylinder', pos: [0, 0.06, 0], scale: [1.4, 0.12, 1.4], color: CLIFF },
        { kind: 'cylinder', pos: [0, 0.08, 0], scale: [1.16, 0.1, 1.16], color: water, glow: water },
        ...[[0.62, 0.3], [-0.55, 0.42], [0.2, -0.66], [-0.4, -0.5]].map(([x, z], i) => ({ kind: 'ico', pos: [x, 0.14, z], scale: 0.18, rot: [0, i * 2, 0], color: ROCK })),
        { kind: 'box', pos: [0.95, 0.2, -0.75], scale: [0.5, 0.4, 0.4], color: WALL },
        { kind: 'hip', pos: [0.95, 0.52, -0.75], scale: [0.6, 0.24, 0.5], color: YELLOW },
        { kind: 'box', pos: [-0.85, 0.25, 0.75], scale: [0.04, 0.5, 0.04], color: 0x9c7a4e },
        { kind: 'box', pos: [-0.85, 0.48, 0.75], scale: [0.36, 0.18, 0.04], color: 0x9c7a4e },
      ],
      footprint: SPRING_FP,
    },
    'landmarks.springSteam': { kind: 'smoke', at: s, n: 3, size: 0.14, rise: 0.9, offsetY: 0.1 },
    // 被轉走的島民不補（裁決 R23）：代幣 ≥2 一個變站長（token.staff，from 這裡 pick 'nearest'）；鮮奶不再借島民（計畫 13）
    'landmarks.islanders': { kind: 'roster', at: HOMES[0], n: islanderCount(lv), accessory: ['none', 'cap'], home: { kind: 'wander', at: HOMES, r: HOME_R } },
    // 溫泉客：泡在池裡偶爾看一下（fidget look）；站位在池子 footprint 裡、不帶 rescue（計畫 13 §設計 3）
    'landmarks.bathers': { kind: 'roster', at: s, n: 2, shirt: [WALL, 0xf2b5c6], home: { kind: 'stand', spots: BATHERS.map(({ p, yaw }) => ({ ...offset(s, p.x, p.z, WATER_TOP - SOAK), yaw })), fidget: 'look' } },
  };
}
