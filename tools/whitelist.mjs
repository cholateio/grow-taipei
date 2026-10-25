// 收緊規則時只准用的子句：每條都要說得出故事（GROW 的「某一級要在某個時間窗口」）。
// [物品, 等級, 條件, 理由]
const min = (id, n) => ({ minLevel: [id, n] }), max = (id, n) => ({ maxLevel: [id, n] });
export const WHITELIST = [
  ['milk', 4, max('rat', 1), '老鼠一窩來咬，校舍蓋不上第三層'],
  ['milk', 4, min('token', 2), '學生搭捷運來上學才擴班'],
  ['milk', 5, max('typhoon', 1), '鐘塔要在颱風前蓋好'],
  ['milk', 6, min('boba', 2), '大學城要有珍奶街'],
  ['chip', 3, max('rat', 1), '一窩老鼠咬電線，園區蓋不起來'],
  ['chip', 3, min('bulb', 2), '園區要整條路有電'],
  ['chip', 4, max('typhoon', 1), '總部要在暴風圈之前落成'],
  ['chip', 5, min('baseball', 3), '天線要借巨蛋的吊車'],
  ['bulb', 3, min('boba', 1), '珍奶攤的招牌帶起霓虹'],
  ['bulb', 3, min('boba', 2), '人龍擠滿路口才裝霓虹'],
  ['bulb', 4, min('milk', 3), '夜市要有學生來逛'],
  ['bulb', 4, max('typhoon', 1), '夜市擴大要趕在颱風前'],
  ['token', 3, min('milk', 2), '學生通勤才加車廂'],
  ['token', 3, min('bulb', 2), '加車廂要電'],
  ['token', 5, min('boba', 2), '接駁車載觀光客去排珍奶'],
  ['rat', 3, max('chip', 2), '園區成形後老鼠就不敢上車'],
  ['rat', 4, min('bulb', 2), '有夜市剩菜老鼠才會變異／被收編'],
  ['rat', 5, min('baseball', 4), '最終型態要在比賽中亮相'],
  ['boba', 2, min('token', 2), '觀光客搭捷運來排隊'],
  ['boba', 2, min('milk', 2), '放學的小孩先來排'],
  ['boba', 4, min('baseball', 5), '演唱會散場人潮讓珍奶開分店'],
  ['baseball', 2, max('rat', 0), '看台要在老鼠來之前搭'],
  ['baseball', 2, min('milk', 2), '要有小孩來打球'],
  ['baseball', 4, max('chip', 4), '開賽要趕在總部搶走工程師之前'],
  ['baseball', 5, min('milk', 4), '演唱會要學生來當工作人員'],
  ['typhoon', 2, min('milk', 1), '颱風假要有學校放'],
];
export const toCand = ([item, level, cond]) => ({ item, level, cond });
