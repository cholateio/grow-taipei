// 台北成長的規則資料（純資料，無邏輯）。引擎與求解器共用。
// up[n]：從 n−1 升到 n 的條件。jump[n]：在 n−2 時條件成立就一回合升到 n（+2，跳過的那一級不看 up）。
// delay[n]：成立時第 n 級要多等一回合。fx：放置反應。onLevel[n]：升到 n 時的反應（跳級跨過的那一級也算）。
// 颱風檢查、老鼠分岔、過期旗標是謎題骨架；求解器的收緊器只調 up[]。
// 物品 v2（2026-10-26）：合計 61 級、六個跳級（每物品最多一個）、離島鏈 代幣7 → 燈泡7 → 燈泡8 → 晶片6 → 7 → 8 → 9。
// 每回合每物品只走一步（+1 或跳級），剛放下的當回合不長，第 8 個放完後再長 CLOSING_TURNS 回合。
// 條件數字和設計表不同的地方都是求解器逼出來的（見任務 1 報告）：11 回合裡鮮奶、晶片、棒球都是零餘裕。
// 珍奶的跳級從設計的 2→4 移到 1→3：一回合 +2 上限（裁決 R4）下，第 7 個放的珍奶在颱風登陸那回合正好在 2，跳級和外送 +1 不能疊。
// 設計文件：docs/superpowers/specs/2026-10-26-items-v2-design.md §3、§4；主規格 2026-10-24 §6

export const ORDER = ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'];
// 飛彈倒數：第 8 個物品放完後，全島再自己長這麼多回合才迎接飛彈（晚放的東西才來得及長大）
export const CLOSING_TURNS = 3;

const auto = { always: true };   // 放下後自動長（剛放下那回合不長，引擎管）
const and = (...c) => ({ and: c });
const or = (...c) => ({ or: c });
const flagIs = (name, is) => ({ flag: name, is });
const age = (id, n) => ({ age: [id, n] });
const min = (id, n) => ({ minLevel: [id, n] });
const max = (id, n) => ({ maxLevel: [id, n] });
const present = id => ({ present: id });

export const ITEMS = {
  milk: {
    name: '鮮奶', max: 10,
    // 牛奶箱 → 早餐店 → 小學 → 兩層 → 三層（自己長）→ 鐘塔要有少棒隊 → 升格大學（北士科或捷運帶來學生；晶片夠高、大巨蛋也蓋好就直接跳）
    // → 研究大樓 → 畢業典禮（全島 LED）→ 鮮奶節（珍奶噴泉廣場）
    up: { 2: auto, 3: auto, 4: auto, 5: auto, 6: min('baseball', 2), 7: or(min('chip', 3), min('token', 4)), 8: min('token', 4), 9: min('bulb', 5), 10: min('boba', 4) },
    jump: { 7: and(min('chip', 5), min('baseball', 3)) },
  },
  chip: {
    name: '晶片', max: 9,
    // 工地 → 廠房 → 園區（自己長）→ 星群總部要有喝鮮奶長大的人才 → 太陽能＋變電站 → ★ 海底電纜接進來才通電
    // → ★ 矽盾天線（零件搭列車來）→ ★ 測試 → ★ 颱風下測過才待命
    up: { 2: auto, 3: auto, 4: min('milk', 4), 5: min('bulb', 3), 6: min('bulb', 8), 7: min('token', 7), 8: auto, 9: min('typhoon', 2) },
    jump: { 5: min('bulb', 5) },
  },
  bulb: {
    name: '燈泡', max: 9,
    // 路燈 → 整條路 → 霓虹 → 夜市（自己長）→ 全島 LED 要巨蛋夜場（捷運開了人潮夠就直接跳）→ 變電所 → ★ 離岸風電要列車載電工去 → ★ 海底電纜 → 全島賽博霓虹
    up: { 2: auto, 3: auto, 4: auto, 5: min('baseball', 4), 6: or(min('chip', 3), min('token', 3)), 7: min('token', 7), 8: min('chip', 5), 9: min('token', 9) },
    jump: { 5: min('token', 2) },
  },
  token: {
    name: '代幣', max: 10,
    // 站牌 → 小站 → 大車站 → 環狀線 → 加車廂（自己長）→ 高鐵 → ★ 通車到離島（變電所夠力直接跳）→ 接駁 → 豪華賽博站 → 飛天車
    up: { 2: auto, 3: auto, 4: auto, 5: auto, 6: min('chip', 3), 7: min('bulb', 4), 8: auto, 9: min('bulb', 7), 10: min('chip', 7) },
    jump: { 7: min('bulb', 6) },
  },
  typhoon: {
    name: '颱風', max: 3,
    // 烏雲 → 下一回合登陸 → 再下一回合放晴（抽水站要變電所供電：燈泡 ≥6，不然颱風一直不走、最後擋飛彈）；
    // 颱風賴在大巨蛋（棒球 ≥3）就多等一回合——除非矽盾已經測試過（晶片 ≥8），罩子一閃把颱風推走
    up: { 2: auto, 3: min('bulb', 6) },
    delay: { 3: and(min('baseball', 3), max('chip', 7)) },
    onLevel: {
      // 鼠災要老鼠已經分岔（≥4）才鬧得起來：照正解玩，颱風登陸時老鼠還小
      2: [
        { when: and(present('bulb'), max('bulb', 2)), lock: 'bulb', flag: { name: 'blackout' }, delta: { target: 'milk', by: -1 }, story: '全島大停電！冰箱裡的鮮奶…' },
        { when: and(present('token'), max('token', 2)), lock: 'token', flag: { name: 'flooded' }, story: '捷運站變游泳池了' },
        { when: and(min('rat', 4), min('baseball', 3)), flag: { name: 'domeRats' }, story: '老鼠被大水沖進大巨蛋！' },
        { when: present('milk'), story: '颱風假！小朋友在家看電視' },
        { when: present('boba'), delta: { target: 'boba', by: 1 }, story: '颱風天珍奶外送爆單' },
      ],
    },
  },
  rat: {
    name: '老鼠', max: 5,
    // 一隻 → 一窩 → 搭捷運（或泡溫泉，只是演出）→ 分岔（矽盾測試過、偵防師有裝備 → 機器鼠）→ 最終型態（機器鼠要列車到離島、變異鼠要颱風來過）
    up: { 2: auto, 3: auto, 4: auto, 5: or(and(flagIs('ratBranch', 'cyber'), min('token', 7)), and(flagIs('ratBranch', 'alien'), min('typhoon', 2))) },
    // 放下時鮮奶還是牛奶箱／早餐店（≤2）就咬一口；鮮奶蓋了學校就沒得咬
    fx: [
      { when: and(present('milk'), max('milk', 2)), delta: { target: 'milk', by: -1 }, story: '老鼠咬破鮮奶箱' },
      { when: present('boba'), story: '珍奶攤被老鼠撞翻了（明天再開）' },
    ],
    onLevel: {
      4: [
        { branch: { flag: 'ratBranch', when: min('chip', 8), then: 'cyber', else: 'alien' }, story: '老鼠的命運分岔了' },
      ],
    },
  },
  boba: {
    name: '珍奶', max: 7,
    // 攤車 →（鮮奶夠了直接跳：鮮奶珍奶）人龍 → 珍奶店 → 噴泉廣場要廠房的工程師 → 連鎖店 → ★ 燈塔島旗艦店 → 世界珍奶節
    up: { 2: auto, 3: auto, 4: min('chip', 2), 5: min('token', 4), 6: min('token', 7), 7: min('bulb', 5) },
    jump: { 3: min('milk', 4) },
    onLevel: {
      4: [{ when: max('milk', 2), flag: { name: 'bobaSugar' }, story: '全島糖分超標' }],
    },
  },
  baseball: {
    name: '棒球', max: 8,
    // 沙地 → 木看台 → 大巨蛋（要趕在捷運接駁到離島前）→ 比賽 → 演唱會（燈夠亮直接跳）→ 跨年煙火 → 擴建 → 巨蛋捷運站
    up: { 2: auto, 3: max('token', 7), 4: min('token', 4), 5: min('bulb', 3), 6: min('boba', 2), 7: min('token', 6), 8: min('token', 8) },
    jump: { 5: min('bulb', 5) },
  },
};

export const AFTER_TURN = [
  // 放了六回合還沒升格大學（≤6：少棒隊沒組成、被老鼠和停電拖累）→ 鮮奶過期
  { when: and(present('milk'), max('milk', 6), age('milk', 6)), flag: { name: 'milkExpired' }, story: '鮮奶放到過期了…' },
];

export const STORIES = {
  placed: {
    milk: '一箱鮮奶送到了', chip: '北士科工地開工', bulb: '路邊亮起第一盞燈', token: '捷運站開張，投代幣喔',
    typhoon: '天邊飄來一朵烏雲', rat: '咦，有老鼠？', boba: '珍奶攤車來擺攤', baseball: '沙地球場整好了',
  },
  grow: {
    milk: { 2: '牛奶箱旁開了早餐店', 3: '小學蓋好，小朋友繞操場跑', 4: '校舍蓋到兩層，小朋友長高了', 5: '校舍三層，升旗囉', 6: '鐘塔響了，少棒隊到巨蛋旁練球',
      7: '升格大學！戴上學士帽', 8: '研究大樓落成，學生穿白袍', 9: '畢業典禮，學士帽拋上天', 10: '鮮奶節！全島都是小朋友' },
    chip: { 2: '廠房冒煙，工程師上班', 3: '北士科園區成形', 4: '星群總部落成', 5: '太陽能屋頂和變電站蓋好了', 6: '海底電纜接進來，廠房通電',
      7: '101 長出矽盾天線', 8: '矽盾測試：罩子閃了三下', 9: '矽盾待命' },
    bulb: { 2: '整條路都亮了', 3: '霓虹點起來，天色變傍晚', 4: '夜市擴大到四攤', 5: '全島 LED、101 燈光秀', 6: '變電所嗡嗡作響',
      7: '電工搭車去開風電，燈塔亮了', 8: '海底電纜發光，接到主島', 9: '全島賽博霓虹' },
    token: { 2: '小站開張，站務員上班', 3: '大車站和站前廣場蓋好了', 4: '環狀線通車', 5: '列車加到五節', 6: '變身高鐵',
      7: '捷運通車到離島！', 8: '離島接駁車上路', 9: '車站變成賽博風', 10: '飛天車繞著 101 飛' },
    typhoon: { 2: '颱風來了！全島檢查', 3: '雨過天晴，彩虹出來了' },
    rat: { 2: '老鼠生了一窩', 3: '老鼠學會搭捷運', 4: '老鼠的命運分岔了', 5: '老鼠的最終型態' },
    boba: { 2: '排隊人龍出現', 3: '珍奶店開張', 4: '珍奶噴泉廣場', 5: '連鎖店開到小島上', 6: '燈塔島旗艦店，無人機外送', 7: '世界珍奶節' },
    baseball: { 2: '木看台搭好了', 3: '大巨蛋蓋好了', 4: '比賽開打', 5: '演唱會之夜', 6: '跨年煙火', 7: '大巨蛋擴建', 8: '巨蛋捷運站直通' },
  },
};
