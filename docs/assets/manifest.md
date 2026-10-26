# 素材清單（物品 v2）

設計 §7.3：每一級一列。授權全是 CC0（逐包紀錄在 `assets/LICENSES.md`）；「程式」= `src/actors/<物品>.js` 的 view 用零件畫。
零件鍵今天程式裡還沒有的（例如 `token.cars`、`milk.lab`）是預定名稱，做的任務可以改。
狀態：**現有** = 今天的程式零件已經畫出這一級（舊階梯以內）；**待做** = 還沒做，來源欄是計畫要用的程式或 glb（glb 已由 `node tools/fetch-assets.mjs` 依 `tools/assets.json` 抓進 `assets/`）；**換新** = 原本是程式零件、改成 glb 之後。任務 4–9 做完一級就改這一列。

glb 一律經 `assets.spawn(path, { tint, glow })` 載入：整個模型併成 ≤ 2 個 draw call（不發光一個、發光一個），顏色進頂點色；
Kenney 新版套件（train、commercial、industrial、factory、food、market、car）與 KayKit 的顏色在色票圖裡，`tint` 的鍵可以寫色票格的 `'#rrggbb'`；
Quaternius 與 Kenney 舊版套件（space、racing、nature）照材質名上色。要播動畫或要分開轉的零件（風車葉片）用 `merge: false` 或自己拆。

| 物品 | 級 | 零件鍵 | 來源（程式／glb 路徑） | 授權 | 狀態 |
|---|---|---|---|---|---|
| 代幣 | 1 | `token.main` | 程式（站牌＋小月台、長椅） | — | 現有 |
| 代幣 | 2 | `token.main`、`token.staff` | 程式（月台、售票亭斜屋頂、售票機、站務員 1） | — | 現有 |
| 代幣 | 3 | `token.main` | 程式（站房＋圓頂、拱門入口、鐘、站前廣場）——設計 §7.2 把捷運站本體列在「找不到 CC0」；`low-detail-building-wide-a` 看過是窄高的辦公樓，不像車站，沒用 | — | 現有 |
| 代幣 | 4 | `token.track`、`token.train` | 程式環狀線；`kenney/train/train-electric-subway-a.glb`（車頭）、`-b.glb`（中間車）、車尾＝車頭轉半圈，3 節；色票圖 tint：白車身、藍飾條、淺色車窗 | CC0 | 換新 |
| 代幣 | 5 | `token.train` | `kenney/train/train-electric-subway-a/b/c.glb` 5 節（a b c b a） | CC0 | 換新 |
| 代幣 | 6 | `token.train` | `kenney/train/train-electric-bullet-a/b/c.glb` 5 節（白底橘線靠 tint：藍車頂與鼻換珊瑚橘、深色車窗） | CC0 | 換新 |
| 代幣 | 7 ★◆ | `token.spur.windmill`、`token.spur.playground` | 程式（支線架到**風車島**與遊樂場島，裁決 R10：燈塔島沒有支線；零件 kind `spur`，劇本沿徑向 scaleIn 長出去） | — | 現有 |
| 代幣 | 8 | `token.shuttle`、`token.staff` | 程式（接駁小車、站務員 2） | — | 現有 |
| 代幣 | 9 | `token.main`、`token.deck` | 程式霓虹站體（深藍、霓虹藍邊條、平屋頂、天線）；懸浮月台 `token.deck`（零件 kind `deck`，一起閃白、浮上來）＝`quat/cyberpunk/Platform_4x1_Empty.glb`（Texture_Signs 發藍光）＋`Rail_Long.glb`（欄杆，發粉紅光）＋`Sign_1.glb`（招牌，發粉紅光）；列車仍是高鐵（`monorail_*`、`TV_1` 沒用：整格 draw call ≤ 20） | CC0 | 換新 |
| 代幣 | 10 ◆ | `token.cars.0`–`token.cars.2` | `kenney/space/craft_speederA.glb`、`craft_speederB.glb`、`craft_speederC.glb`（一款一台，飾條珊瑚／藍／黃；零件 kind `orbit`：繞 101 一圈、停在賽博站屋頂） | CC0 | 換新 |
| 鮮奶 | 1 | `milk.crate` | 程式（牛奶箱） | — | 現有 |
| 鮮奶 | 2 | `milk.main`、`milk.yard` | `quat/buildings/1Story_Sign_Mat.glb`（早餐店，tint 奶油牆、珊瑚招牌）＋程式桌子 | CC0 | 換新 |
| 鮮奶 | 3 | `milk.main`、`milk.yard`、`milk.kids` | `kenney/commercial/building-e.glb`（一層教室＋兩層辦公室，視覺標準件：牆 `C.cream`、飾邊 `C.coral`、窗 `C.window`）＋程式操場；小孩 = 程式名冊 | CC0 | 換新 |
| 鮮奶 | 4 | `milk.main`、`milk.kids` | `kenney/commercial/building-e.glb`＋`building-c.glb`（加一棟兩層教室）；小孩長高 1.3 | CC0 | 換新 |
| 鮮奶 | 5 | `milk.main`、`milk.yard`、`milk.flag` | `kenney/commercial/building-e.glb`＋`building-a.glb`（三層教室）＋程式旗桿、旗子 | CC0 | 換新 |
| 鮮奶 | 6 | `milk.tower`、`milk.kids` | 程式鐘塔（三層樓頂；Quaternius `Bell_Tower.glb` 728 KB 超過單檔上限，沒收）；少棒隊 = 程式名冊 | — | 現有 |
| 鮮奶 | 7 ◆ | `milk.main`、`milk.tower`、`milk.gate` | `kenney/commercial/building-e.glb` ×2（大學兩翼，右翼轉 180°）＋程式鐘塔（兩翼中間）、拱門校門；學士帽 = 名冊配件 | CC0 | 換新 |
| 鮮奶 | 8 | `milk.main`、`milk.gate` | `kenney/commercial/low-detail-building-wide-b.glb`（玻璃研究大樓，帶狀玻璃 tint `C.blue`／`C.glass`，換掉大學左翼）＋程式 YouBike 站；白袍 = 名冊配件 | CC0 | 換新 |
| 鮮奶 | 9 | `milk.hats`、`milk.yard` | 程式（操場上的學士帽、紅布條；101 頭上「恭喜畢業」是劇本字卡） | — | 現有 |
| 鮮奶 | 10 ◆ | `milk.truck`、`milk.boat`、`milk.extraKids` | `kenney/car/truck.glb`（牛奶車，tint 白）、`quat/ships/Boat.glb`（西岸觀光船，tint 珊瑚／奶油）＋程式船上牛奶箱（併在 `milk.yard`）；全島六格各一個小孩 = 程式名冊 | CC0 | 換新 |
| 晶片 | 1 | `chip.main`、`chip.crane`、`chip.worker` | 程式（圍籬、三角錐、吊車＝tower.js 的 crane builder，吊臂會擺，和 101 工地同一個）；`kenney/factory/crane.glb` 沒用（留程式版是為了吊臂動畫） | — | 現有 |
| 晶片 | 2 | `chip.main`、`chip.smoke`、`chip.engineers` | `kenney/industrial/building-a.glb`（廠房：色票圖 tint 奶油牆、屋頂色飾條、珊瑚牆腳）＋`chimney-medium.glb`（立在廠房屋頂，珊瑚白條紋）；零件 kind `campus`（同鮮奶校舍）；煙 = 程式；工程師 = 程式名冊 | CC0 | 換新 |
| 晶片 | 3 | `chip.campus`、`chip.engineers` | 程式三棟玻璃盒（窗帶）＋招牌；工程師 4 人騎 YouBike（玻璃盒用程式畫才是一整塊玻璃色；`building-b/c/d.glb` 沒用） | — | 現有 |
| 晶片 | 4 | `chip.campus` | 程式（「星群」弧形玻璃圓頂總部，前排中間那棟玻璃盒換掉） | — | 現有 |
| 晶片 | 5 | `chip.solar`、`chip.substation` | `kenney/industrial/solar-panel-landscape.glb` ×3（廠房屋頂，tint 深藍板面）；程式變電站（小房子、礙子）＋兩根電線桿與下垂電線；煙囪不冒煙了（`water-tower.glb` 沒用） | CC0 | 換新 |
| 晶片 | 6 ★ | `chip.cable` | 程式（零件 kind `cable`，parts.js：風車島 → 主島南側海面 → 晶片格東岸登陸桿 → 變電站；暗管一個黏土 mesh，通電多一條自發光管、光從風車島跑過來）；燈泡 ≥8 時先鋪好（暗）；廠房窗、玻璃盒窗帶、總部大門亮暖光，礙子亮淡藍 | — | 現有 |
| 晶片 | 7 ★ | `tower.antenna` | `quat/cyberpunk/Antenna_1.glb`（細桿）、`Antenna_2.glb`（碟子）＋程式塔頂環（零件 kind `antenna`，tower.js） | CC0 | 換新 |
| 晶片 | 8 ★ | `tower.shield`（state `test`） | 程式（零件 kind `shield`，parts.js：半球半透明淡藍、六角格紋 DataTexture；閃三下後縮回地面） | — | 現有 |
| 晶片 | 9 ★◆ | `tower.shield`（state `standby`）、`tower.antenna`（pulse） | 程式（罩子淡淡常駐、格紋往上捲；天線環與塔身大環每 3 秒閃一圈）；結局用 `shieldSpec('full')` 全亮 | — | 現有 |
| 燈泡 | 1 | `bulb.main` | `quat/streets/Streetlight_Single.glb`（燈罩 glow） | CC0 | 待做（程式版現有） |
| 燈泡 | 2 | `bulb.posts`、`bulb.market` | `quat/streets/Streetlight_Double.glb`；夜市 2 攤 = `quat/village/MarketStand_1.glb`、`MarketStand_2.glb` | CC0 | 待做（程式版現有） |
| 燈泡 | 3 | `bulb.posts`、`bulb.market` | 程式（霓虹色燈頭、傍晚） | — | 現有 |
| 燈泡 | 4 | `bulb.market` | `kenney/market/display-fruit.glb`、`display-bread.glb`（加兩攤）、`quat/cyberpunk/Sign_2.glb`（霓虹招牌 glow） | CC0 | 待做（程式版現有） |
| 燈泡 | 5 | `bulb.posts`、`tower.*` | 程式（全島 LED、101 燈光秀、夜晚） | — | 現有 |
| 燈泡 | 6 | `bulb.substation` | 程式（儲能櫃、變壓器）；可配 `kenney/industrial/chimney-small.glb` 當散熱塔 | — | 待做 |
| 燈泡 | 7 ★◆ | `sat.windmill`、`sat.lighthouse`、`bulb.electrician` | `kaykit/spacebase/windturbine_tall.gltf`（可選；葉片是獨立節點，要轉就 `merge: false` 或拆開）；燈塔 = 程式 | CC0 | 待做 |
| 燈泡 | 8 ★ | `bulb.cable` | 程式（風車島到主島的發光纜線） | — | 待做 |
| 燈泡 | 9 ◆ | `bulb.neon` | 程式＋`quat/cyberpunk/Sign_1.glb`、`TV_1.glb`、`Platform_4x1_Empty.glb`（glow） | CC0 | 待做 |
| 颱風 | 1 | `typhoon.main` | 程式（灰雲） | — | 現有 |
| 颱風 | 2 | `typhoon.main`、`typhoon.rain`、`typhoon.scooter` | 程式（暴風圈、大雨、外送機車） | — | 現有 |
| 颱風 | 3 | `typhoon.rainbow`、`typhoon.park` | 程式（彩虹、河濱公園）；堤防一圈待做 | — | 現有（堤防待做） |
| 老鼠 | 1 | `rat.pack` | `quat/enemies/Rat.glb`（動畫，不併） | CC0 | 現有 |
| 老鼠 | 2 | `rat.pack` | `quat/enemies/Rat.glb` ×5 | CC0 | 現有 |
| 老鼠 | 3 | `rat.pack` | `quat/enemies/Rat.glb`（搭捷運／泡溫泉） | CC0 | 現有 |
| 老鼠 | 4 ◆ | `rat.pack` | `quat/enemies/Rat.glb`＋程式（機器鼠天線／三眼綠光） | CC0 | 現有 |
| 老鼠 | 5 ◆ | `rat.pack`、`rat.ufo` | 機器鼠軍團 10 隻 = `quat/enemies/Rat.glb`；王冠、UFO = 程式（Quaternius `Pancake.glb` 3.5 MB 超過單檔上限，沒收） | CC0（Rat.glb；王冠、UFO 是程式） | 現有（10 隻、王冠待做） |
| 珍奶 | 1 | `boba.main`、`boba.owner` | 程式（路邊攤車） | — | 現有 |
| 珍奶 | 2 | `boba.queue` | 程式名冊（人龍 6 人） | — | 現有 |
| 珍奶 | 3 | `boba.main` | `quat/buildings/2Story_Sign_Mat.glb`（珍奶店）＋`kenney/food/cup-tea.glb`（招牌杯） | CC0 | 待做 |
| 珍奶 | 4 | `boba.fountain` | 程式（噴泉在店側邊） | — | 現有（今天的噴泉在店的位置，要挪） |
| 珍奶 | 5 | `boba.branch` | `quat/buildings/3Story_Small_Mat.glb`（小森林島分店）＋`kenney/food/cup-tea.glb`；觀光船 = `quat/ships/BoatWSail.glb`（現有） | CC0 | 待做 |
| 珍奶 | 6 ★ | `boba.flagship`、`boba.drones` | `quat/buildings/1Story_Sign_Mat.glb`（燈塔島旗艦店）；無人機 = `kenney/space/craft_miner.glb` ×2 | CC0 | 待做 |
| 珍奶 | 7 ◆ | `boba.flags` | 程式（珍奶旗、船隊、101 廣告） | — | 待做 |
| 棒球 | 1 | `baseball.main` | 程式（沙地球場） | — | 現有 |
| 棒球 | 2 | `baseball.main`、`baseball.players` | `kenney/racing/grandStand.glb`（木看台）；球員 = 程式名冊 | CC0 | 待做（程式版現有） |
| 棒球 | 3 ◆ | `baseball.main` | `kenney/space/hangar_roundA.glb`（大巨蛋；Quaternius `GeodesicDome` 是 Draco 壓縮，沒收） | CC0 | 待做（程式版現有） |
| 棒球 | 4 | `baseball.main`、`baseball.crowd` | 程式（頂縫透光、觀眾 4）；可配 `kenney/racing/grandStandCovered.glb` | — | 現有 |
| 棒球 | 5 | `baseball.main`、`baseball.lawn` | 程式（藍色應援棒、觀眾 6） | — | 現有 |
| 棒球 | 6 | `baseball.fireworks` | 程式（跨年煙火） | — | 現有 |
| 棒球 | 7 | `baseball.main`、`baseball.crowd` | `kenney/space/hangar_roundB.glb`（更大的圓頂）＋程式 LED 帶、觀眾 8 | CC0 | 待做 |
| 棒球 | 8 ◆ | `baseball.platform` | 程式（月台連到巨蛋門口）＋`quat/cyberpunk/Platform_4x1_Empty.glb` | CC0 | 待做 |
| 共用 | — | 蓋房子動作的工具 | 3.9 程式畫的鋤頭（沒有要換 glb，所以 Quaternius `Shovel.glb` 不收） | — | 現有 |

沒收的候選（單檔 ≥ 300 KB 或壓縮格式，`tools/fetch-assets.mjs` 會拒收）：Quaternius `Bell_Tower.glb`（728 KB）、`6Story_Stack_Mat.glb`（396 KB）、`Pancake.glb`（3.5 MB）、`GeodesicDome-transformed.glb`（Draco）。
