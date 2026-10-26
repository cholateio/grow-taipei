// 北側台地的常駐地標：陽明山（火山，山口冒煙）與北投溫泉（池子、小澡堂、蒸氣）。開局就在（§4.1）。
import { landmarkWorld, cellCentre } from './anchors.js';
import { offset } from './palette.js';

export const id = 'landmarks';

// 島民（§14.3 人分散）：五個人一個名冊，散步的家是溫泉格以外的六格（第 i 人用 home.at[i % 6]）；
// 最擠的珍奶格（人龍、閒晃的觀光客）排在第六個，五個人各住一格、不再往那裡擠。溫泉格住的是下面兩位溫泉客
const HOMES = [[0, 0], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]].map(cellCentre);
// 溫泉池（底座半徑 0.7，加上池邊的石頭到 0.75）、小澡堂、木牌各自的 footprint——不再用整個包圍盒（會把池邊整圈都擋掉）
const POOL_R = 0.75;
const SPRING_FP = [{ r: POOL_R }, { x: 0.95, z: -0.75, w: 0.6, d: 0.5 }, { x: -0.85, z: 0.75, w: 0.36, d: 0.04 }];
// 溫泉客：池邊靠鏡頭那側兩個位置（池子外擴 PAD 後 0.87 之外），夾在泡湯老鼠（池裡半徑 0.62）之間，離老鼠都 ≥ 0.25；面向池心
const BATHERS = [0.93, 2.0].map(a => { const p = { x: Math.cos(a) * 0.97, z: Math.sin(a) * 0.97 }; return { p, yaw: Math.atan2(-p.x, -p.z) }; });

const ROCK = 0xb8a892, CLIFF = 0xd2b48c, WALL = 0xf1e7da, YELLOW = 0xfcea8b, WATER = 0xa4d4da;

// 老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時池水變成淡綠色
export function view(lv = {}) {
  const v = landmarkWorld('volcano'), s = landmarkWorld('spring'), water = lv.rat >= 3 && !(lv.token >= 2) ? 0xbfd39c : WATER;
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
    'landmarks.islanders': { kind: 'roster', at: HOMES[0], n: 5, accessory: ['none', 'cap'], home: { kind: 'wander', at: HOMES, r: 1.8 } },
    // 溫泉客：站在池邊偶爾看一下池子；rescue：萬一池邊被擋住就站到最近的可走點（不站進池子裡）
    'landmarks.bathers': { kind: 'roster', at: s, n: 2, shirt: [WALL, 0xf2b5c6], home: { kind: 'stand', spots: BATHERS.map(({ p, yaw }) => ({ ...offset(s, p.x, p.z), yaw })), fidget: 'look', rescue: true } },
  };
}
