// 台北成長的規則資料（純資料，無邏輯）。引擎與求解器共用。
// up[n]：從 n−1 升到 n 的條件。fx：放置反應。onLevel[n]：升到 n 時的反應。
// 颱風檢查、老鼠分岔、過期旗標是謎題骨架；求解器的收緊器只調 up[]。
// 設計文件：docs/superpowers/specs/2026-10-24-grow-taipei-design.md §5、§6

export const ORDER = ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'];

const and = (...c) => ({ and: c });
const age = (id, n) => ({ age: [id, n] });
const min = (id, n) => ({ minLevel: [id, n] });
const max = (id, n) => ({ maxLevel: [id, n] });
const present = id => ({ present: id });

export const ITEMS = {
  milk: {
    name: '鮮奶', max: 4,
    // 小孩搭捷運來上學 → 喝久了長高（老鼠一來就咬鮮奶箱，長不高）→ 組少棒隊、學校蓋鐘塔
    up: { 2: present('token'), 3: and(age('milk', 2), max('rat', 0)), 4: min('baseball', 2) },
  },
  chip: {
    name: '晶片', max: 5,
    // 要有電 → 工程師要通勤 → 要有喝鮮奶長大的人才 → 颱風過後矽盾才經過考驗
    up: { 2: present('bulb'), 3: min('token', 2), 4: min('milk', 3), 5: min('typhoon', 3) },
  },
  bulb: {
    name: '燈泡', max: 4,
    up: { 2: { always: true }, 3: min('chip', 2), 4: min('chip', 3) },
  },
  token: {
    name: '代幣', max: 4,
    // 電聯車要電（一窩老鼠會咬電線）→ 學生通勤 → 無人駕駛要晶片
    up: { 2: and(min('bulb', 2), max('rat', 1)), 3: min('milk', 2), 4: min('chip', 3) },
  },
  typhoon: {
    name: '颱風', max: 3,
    // 有棒球場的話，颱風會賴在球場上不走
    up: { 2: age('typhoon', 1), 3: and(age('typhoon', 2), max('baseball', 0)) },
    onLevel: {
      2: [
        { when: and(present('bulb'), max('bulb', 2)), lock: 'bulb', flag: { name: 'blackout' }, delta: { target: 'milk', by: -1 }, story: '全島大停電！冰箱裡的鮮奶…' },
        { when: and(present('token'), max('token', 2)), lock: 'token', flag: { name: 'flooded' }, story: '捷運站變游泳池了' },
        { when: and(min('rat', 2), min('baseball', 2)), flag: { name: 'domeRats' }, story: '老鼠被大水沖進大巨蛋！' },
        { when: present('milk'), story: '颱風假！小朋友在家看電視' },
        { when: present('boba'), delta: { target: 'boba', by: 1 }, story: '颱風天珍奶外送爆單' },
      ],
    },
  },
  rat: {
    name: '老鼠', max: 4,
    up: { 2: age('rat', 1), 3: age('rat', 2), 4: age('rat', 3) },
    onLevel: {
      2: [
        { when: present('milk'), delta: { target: 'milk', by: -1 }, story: '老鼠咬破鮮奶箱' },
        { when: present('boba'), story: '珍奶攤被老鼠撞翻了（明天再開）' },
      ],
      4: [
        { branch: { flag: 'ratBranch', when: min('chip', 3), then: 'cyber', else: 'alien' }, story: '老鼠的命運分岔了' },
      ],
    },
  },
  boba: {
    name: '珍奶', max: 3,
    // 觀光客搭捷運來排隊 → 夜市霓虹亮了變噴泉廣場
    up: { 2: min('token', 2), 3: min('bulb', 3) },
    onLevel: {
      3: [{ when: max('milk', 1), flag: { name: 'bobaSugar' }, story: '全島糖分超標' }],
    },
  },
  baseball: {
    name: '棒球', max: 4,
    // 喝鮮奶的小孩來打球 → 捷運載觀眾開賽 → 燈光夠亮開演唱會
    up: { 2: min('milk', 2), 3: min('token', 2), 4: min('bulb', 3) },
  },
};

export const AFTER_TURN = [
  { when: and(present('milk'), max('milk', 1), age('milk', 4)), flag: { name: 'milkExpired' }, story: '鮮奶放到過期了…' },
];

export const STORIES = {
  placed: {
    milk: '一箱鮮奶送到了', chip: '北士科工地開工', bulb: '路邊亮起第一盞燈', token: '捷運站開張，投代幣喔',
    typhoon: '天邊飄來一朵烏雲', rat: '咦，有老鼠？', boba: '珍奶攤車來擺攤', baseball: '沙地球場整好了',
  },
  grow: {
    milk: { 2: '小學蓋好，小朋友來喝鮮奶', 3: '喝鮮奶長高高', 4: '學校有鐘塔了' },
    chip: { 2: '廠房冒煙，工程師上班', 3: '北士科園區成形', 4: '星群總部落成', 5: '矽盾待命' },
    bulb: { 2: '整條路都亮了', 3: '霓虹招牌點起來', 4: '全島 LED 燈光秀' },
    token: { 2: '列車開出來了', 3: '環狀線接到小島', 4: '無人駕駛霓虹列車' },
    typhoon: { 2: '颱風來了！全島檢查', 3: '雨過天晴，災後重建' },
    rat: { 2: '老鼠生了一窩', 3: '老鼠學會搭捷運', 4: '老鼠的命運分岔了' },
    boba: { 2: '排隊人龍出現', 3: '珍奶噴泉廣場' },
    baseball: { 2: '大巨蛋蓋好了', 3: '比賽開打', 4: '演唱會之夜' },
  },
};
