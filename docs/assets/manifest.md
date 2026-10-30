# 素材清單（物品 v2）

設計 §7.3：每一級一列。授權全是 CC0（逐包紀錄在 `assets/LICENSES.md`）；「程式」= `src/actors/<物品>.js` 的 view 用零件畫。
零件鍵今天程式裡還沒有的（例如 `token.cars`、`milk.lab`）是預定名稱，做的任務可以改。
狀態：**現有** = 今天的程式零件已經畫出這一級（舊階梯以內）；**待做** = 還沒做，來源欄是計畫要用的程式或 glb（glb 已由 `node tools/fetch-assets.mjs` 依 `tools/assets.json` 抓進 `assets/`）；**換新** = 原本是程式零件、改成 glb 之後。任務 4–9 做完一級就改這一列；任務 12 定稿（2026-10-27：沒有待做的列）。

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
| 代幣 | 8 | `token.shuttle` | 程式（接駁小車）；第二位站務員拿掉（人數預算，裁決 R16，站務員一直 1 人） | — | 現有 |
| 代幣 | 9 | `token.main`、`token.deck` | 程式霓虹站體（深藍、霓虹藍邊條、平屋頂、天線）；懸浮月台 `token.deck`（零件 kind `deck`，一起閃白、浮上來）＝`quat/cyberpunk/Platform_4x1_Empty.glb`（Texture_Signs 發藍光）＋`Rail_Long.glb`（欄杆，發粉紅光）＋`Sign_1.glb`（招牌，發粉紅光）；列車仍是高鐵（`monorail_*`、`TV_1` 沒用：整格 draw call ≤ 20） | CC0 | 換新 |
| 代幣 | 10 ◆ | `token.cars.0`–`token.cars.2` | `kenney/space/craft_speederA.glb`、`craft_speederB.glb`、`craft_speederC.glb`（一款一台，飾條珊瑚／藍／黃；零件 kind `orbit`：繞 101 一圈、停在賽博站屋頂） | CC0 | 換新 |
| 鮮奶 | 1 | `milk.crate` | 程式（牛奶箱） | — | 現有 |
| 鮮奶 | 2 | `milk.main`、`milk.yard` | `quat/buildings/1Story_Sign_Mat.glb`（早餐店，tint 奶油牆、珊瑚招牌）＋程式桌子 | CC0 | 換新 |
| 鮮奶 | 3 | `milk.main`、`milk.yard`、`milk.kids` | `kenney/commercial/building-e.glb`（一層教室＋兩層辦公室，視覺標準件：牆 `C.cream`、飾邊 `C.coral`、窗 `C.window`）＋程式操場；小孩 = 程式名冊 | CC0 | 換新 |
| 鮮奶 | 4 | `milk.main`、`milk.kids` | `kenney/commercial/building-e.glb`＋`building-c.glb`（加一棟兩層教室）；小孩長高 1.3 | CC0 | 換新 |
| 鮮奶 | 5 | `milk.main`、`milk.yard` | `kenney/commercial/building-e.glb`＋`building-a.glb`（三層教室）＋程式籃球架（柱、籃板、籃框，併在院子零件裡；2026-10-28 拿掉旗桿、旗子） | CC0 | 換新 |
| 鮮奶 | 6 | `milk.tower`、`milk.kids` | 程式鐘塔（三層樓頂；Quaternius `Bell_Tower.glb` 728 KB 超過單檔上限，沒收）；少棒隊 = 程式名冊 | — | 現有 |
| 鮮奶 | 7 ◆ | `milk.main`、`milk.tower`、`milk.gate` | `kenney/commercial/building-e.glb` ×2（大學兩翼，右翼轉 180°）＋程式鐘塔（兩翼中間）、拱門校門；學士帽 = 名冊配件 | CC0 | 換新 |
| 鮮奶 | 8 | `milk.main`、`milk.gate` | `kenney/commercial/low-detail-building-wide-b.glb`（玻璃研究大樓，帶狀玻璃 tint `C.blue`／`C.glass`，換掉大學左翼）＋程式 YouBike 站；白袍 = 名冊配件 | CC0 | 換新 |
| 鮮奶 | 9 | `milk.hats`、`milk.yard` | 程式（操場上的學士帽、紅布條；101 頭上「恭喜畢業」是劇本字卡） | — | 現有 |
| 鮮奶 | 10 ◆ | `milk.truck`、`milk.boat`、`milk.extraKids` | `kenney/car/truck.glb`（牛奶車，tint 白）、`quat/ships/Boat.glb`（西岸觀光船，tint 珊瑚／奶油）＋程式船上牛奶箱（併在 `milk.yard`）；鮮奶節多的 3 個小孩（鮮奶格、晶片格、溫泉格各一，裁決 R16）= 程式名冊 | CC0 | 換新 |
| 晶片 | 1 | `chip.main`、`chip.crane`、`chip.worker` | 程式（圍籬、三角錐、吊車＝tower.js 的 crane builder，吊臂會擺，和 101 工地同一個）；`kenney/factory/crane.glb` 沒用（留程式版是為了吊臂動畫） | — | 現有 |
| 晶片 | 2 | `chip.main`、`chip.smoke`、`chip.engineers` | `kenney/industrial/building-a.glb`（廠房：色票圖 tint 奶油牆、屋頂色飾條、珊瑚牆腳）＋`chimney-medium.glb`（立在廠房屋頂，珊瑚白條紋）；零件 kind `campus`（同鮮奶校舍）；煙 = 程式；工程師 = 程式名冊 | CC0 | 換新 |
| 晶片 | 3 | `chip.campus`、`chip.engineers` | 程式三棟玻璃盒（窗帶）＋招牌；工程師 4 人騎 YouBike（玻璃盒用程式畫才是一整塊玻璃色；`building-b/c/d.glb` 沒用） | — | 現有 |
| 晶片 | 4 | `chip.campus` | 程式（「星群」弧形玻璃圓頂總部，前排中間那棟玻璃盒換掉） | — | 現有 |
| 晶片 | 5 | `chip.solar`、`chip.substation` | `kenney/industrial/solar-panel-landscape.glb` ×3（廠房屋頂，tint 深藍板面）；程式變電站（小房子、礙子）＋兩根電線桿與下垂電線；煙囪不冒煙了（`water-tower.glb` 沒用） | CC0 | 換新 |
| 晶片 | 6 ★ | `chip.cable` | 程式（零件 kind `cable`，parts.js：風車島 → 主島南側海面 → 晶片格東岸登陸桿 → 變電站；暗管一個黏土 mesh，通電多一條自發光管、光從風車島跑過來）；燈泡 ≥8 時先鋪好（暗）；廠房窗、玻璃盒窗帶、總部大門亮暖光，礙子亮淡藍 | — | 現有 |
| 晶片 | 7 ★ | `tower.antenna` | `quat/cyberpunk/Antenna_1.glb`（細桿）、`Antenna_2.glb`（碟子）＋程式塔頂環（零件 kind `antenna`，tower.js） | CC0 | 換新 |
| 晶片 | 8 ★ | `tower.shield`（state `test`） | 程式（零件 kind `shield`，parts.js：半球半透明淡藍、六角格紋 DataTexture；閃三下後縮回地面） | — | 現有 |
| 晶片 | 9 ★◆ | `tower.shield`（state `standby`）、`tower.antenna`（pulse） | 程式（罩子淡淡常駐、格紋往上捲；天線環與塔身大環每 3 秒閃一圈）；結局用 `shieldSpec('full')` 全亮 | — | 現有 |
| 燈泡 | 1 | `bulb.main` | 程式（燈桿＋燈頭；`Streetlight_Single.glb` 沒換：15 盞路燈一盞一個 glb 會超 draw call，主燈和其他燈要同一款） | — | 現有（glb 未採用） |
| 燈泡 | 2 | `bulb.posts`、`bulb.lamps.<站>`、`bulb.market` | 程式（燈桿一個零件、燈頭一站一個零件；夜市 2 攤）；`Streetlight_Double`、`MarketStand_1/2` 沒換（夜市東攤離主路只剩 0.04，glb 攤子比程式攤大） | — | 現有（glb 未採用） |
| 燈泡 | 3 | `bulb.lamps.<站>`、`bulb.main` | 程式（霓虹：一站一色、沿路粉藍交錯——一站一個 draw call；傍晚） | — | 現有 |
| 燈泡 | 4 | `bulb.market` | 程式（四攤＋粉紅招牌板）；`display-fruit/bread` 沒用 | — | 現有（glb 未採用） |
| 燈泡 | 5 | `bulb.posts`、`tower.*` | 程式（全島 LED、101 燈光秀、夜晚） | — | 現有 |
| 燈泡 | 6 | `bulb.substation` | 程式（中心格 101 西邊：水泥台、兩座儲能櫃（指示燈）、變壓器＋三根礙子亮淡藍、矮圍籬）；沒配散熱塔 glb | — | 現有 |
| 燈泡 | 7 ★◆ | `sat.windmill`（speed 0 → 1）、`sat.lighthouse`、`sat.beam`、`sat.keeper`、`bulb.electrician`（家換到風車島） | 程式：風車塔身＋開關箱在 island.js 的 kit、葉片是 `blades` 演員；燈塔燈室改成不發光的 kit 球（開局暗），演員亮燈。`windturbine_tall.gltf` 沒用（可選；kit 塔身不花 draw call） | — | 現有 |
| 燈泡 | 8 ★ | `chip.cable` | 晶片的零件（任務 6，零件 kind `cable`）：燈泡 ≥8 鋪好（暗），晶片 ≥6 通電；燈泡不另畫纜線 | — | 現有 |
| 燈泡 | 9 ◆ | `bulb.neon.bridges`、`bulb.neon.station`、`bulb.neon.market`（零件 kind `neon`：燈條 compound＋glb） | 程式燈條（主島 12 座橋與階梯兩側霓虹藍、懸浮月台四邊粉紅、夜市屋簷霓虹藍）＋`quat/cyberpunk/TV_1.glb`（月台上，Texture_Signs 發藍光）、`Sign_2.glb`（夜市招牌，發粉紅光；換掉 Lv4 的招牌板） | CC0 | 換新 |
| 颱風 | 1 ◆ | `typhoon.main`、`typhoon.rain`、`typhoon.scooter` | 程式（暴風圈停在 101 旁邊上空＝颱風錨點、大雨；有珍奶就有外送機車在雨中繞；放下那回合全島跑去門口躲一下，2026-10-31 單一正解 §4.3） | — | 現有 |
| 颱風 | 2 | `typhoon.main`、`typhoon.rain`、`typhoon.scooter` | 程式（同一團暴風圈移到捷運站上空，雨小一點） | — | 現有 |
| 颱風 | 3 | `typhoon.main`、`typhoon.rain`、`typhoon.scooter` | 程式（暴風圈移到大巨蛋上空；巨蛋淹水時 `baseball.field` 泳池一圈、球員站上屋頂，在棒球的零件裡） | — | 現有 |
| 颱風 | 4 ◆ | `typhoon.rainbow`、`typhoon.park`、`typhoon.levee` | 程式（彩虹、河濱公園、沿水道的堤防一圈，留老鼠上岸的缺口） | — | 現有 |
| 老鼠 | 1 | `rat.pack` | `quat/enemies/Rat.glb`（動畫，不併；在舞台結算的 `meta.troubleAt` 那棟門口晃，沒有才在窩旁） | CC0 | 現有 |
| 老鼠 | 2 | `rat.main`、`rat.pack` | 程式鼠窩＋`quat/enemies/Rat.glb` ×3（同 Lv1，聚到出問題的那棟門口） | CC0 | 現有 |
| 老鼠 | 3 | `rat.pack` | `quat/enemies/Rat.glb` ×5（搭捷運／泡溫泉） | CC0 | 現有 |
| 老鼠 | 4 ◆ | `rat.pack`、`rat.king`、`rat.ufo`、`sat.rocksRing` | 分岔＝最終型態（2026-10-31 單一正解：原本的 Lv4 分岔＋Lv5 併成一級）。賽博：機器鼠軍團 10 隻＋站頂戴王冠的機器鼠 = `quat/enemies/Rat.glb`（天線、王冠程式）；外星（壞結局「變異鼠稱王」）：變異鼠三眼綠光加冕、小 UFO、石堆島綠光圈 = 程式（Quaternius `Pancake.glb` 3.5 MB 超過單檔上限，沒收） | CC0（Rat.glb；王冠、UFO 是程式） | 換新 |
| 珍奶 | 1 | `boba.main`、`boba.owner` | 程式（路邊攤車，錨點南邊 0.4：夜市第四攤擋不到） | — | 現有 |
| 珍奶 | 2 | `boba.queue`、`boba.yard` | 程式名冊（人龍 4 人一排，人數預算）＋程式立牌（鮮奶 ≥4 白底藍字） | — | 現有 |
| 珍奶 | 3 | `boba.main`、`boba.sign`、`boba.yard` | `quat/buildings/2Story_Sign_Mat.glb`（珍奶店，tint 牆奶油、磚與飾邊木色、招牌珊瑚）＋`kenney/food/cup-tea.glb`（屋頂招牌杯）＋程式遮雨棚、店前磚地 | CC0 | 換新 |
| 珍奶 | 4 | `boba.fountain` | 程式（噴泉在店東側、往北退 0.3：不在店與鏡頭之間；水面不發光，整局截圖 draw call ≤ 150） | — | 換新（挪到店側邊） |
| 珍奶 | 5 ★◆ | `sat.forest.stage1`（分店＋茶屋桌椅）、`sat.forest`、`sat.boats`、`boba.flagship`、`boba.ferry`、`boba.tourists`、`boba.drones.0/1` | 兩島同一級（2026-10-31 單一正解：原本的 Lv5 森林島分店＋Lv6 燈塔島旗艦店併成一級）。程式（小森林島分店、觀光客 2；觀光船 +2 = `quat/ships/BoatWSail.glb`／`Boat.glb`）；`quat/buildings/1Story_Sign_Mat.glb`（燈塔島旗艦店，同店面 tint）；`quat/ships/Boat.glb`（小船，載兩個觀光客從碼頭開過去、停在島西南岸）；無人機 = `kenney/space/craft_miner.glb` ×2（零件 kind `orbit`）；觀光客 = 程式名冊 | CC0 | 換新 |
| 珍奶 | 6 ◆ | `boba.yard`（氣球）、`boba.fleet` | 程式（主島 17 條靠海格邊各一束氣球——細繩＋三顆小球，併在院子零件裡；五艘小船桅杆頂掛圓燈籠，一個零件繞島轉；101「世界珍奶節」是劇本字卡；2026-10-28 拿掉所有旗子） | — | 換新 |
| 棒球 | 1 | `baseball.main`、`baseball.lines.*`、`baseball.players` | 程式（沙地球場；第一個球員放置時從看台後方進場跑壘，裁決 R16：球場格不住島民） | — | 現有 |
| 棒球 | 2 | `baseball.stands`、`baseball.players` | `kenney/racing/grandStand.glb` ×2（木看台，tint 座椅珊瑚、骨架木色；零件 kind `stands`）；球員 = 程式名冊 | CC0 | 換新 |
| 棒球 | 3 ◆ | `baseball.main`、`baseball.deco` | `kenney/space/hangar_roundA.glb`（大巨蛋，高 1.0，tint 圓頂白、殼奶油、飾條珊瑚）＋程式底座與門口；Quaternius `GeodesicDome` 是 Draco 壓縮，沒收 | CC0 | 換新 |
| 棒球 | 4 | `baseball.deco`、`baseball.crowd` | 程式（頂縫透光、觀眾 3） | — | 現有 |
| 棒球 | 5 | `baseball.deco`、`baseball.lawn` | 程式（藍色應援棒，頂縫改霓虹藍；觀眾 4＋草皮 1） | — | 現有 |
| 棒球 | 6 | `baseball.fireworks` | 程式（跨年煙火） | — | 現有 |
| 棒球 | 7 | `baseball.main`、`baseball.deco`、`baseball.crowd` | `kenney/space/hangar_roundB.glb`（擴建：同一個底、高 1.2）＋程式 LED 帶（`rail` 一圈霓虹藍）、觀眾 5（裁決 R13） | CC0 | 換新 |
| 棒球 | 8 ◆ | `baseball.platform`、`baseball.riders` | 程式（環狀線邊的高架月台、雨棚、站名牌、接到巨蛋門口的磚道；`Platform_4x1_Empty.glb` 沒用：月台要沿徑向斜放、一端接軌道一端上岸，程式畫比較好對齊）；坐新線來的觀眾 2（門口留 3，合計 5，裁決 R13）= 程式名冊 | — | 換新 |
| 結局／最終章 | 賽博尾聲 | `finale.car` | `kenney/space/craft_speederA.glb`（第四台飛天車，同代幣 Lv10 的款式；tint 紅 `0xe8322e`，`metalRed` 塗紅；零件 kind `orbit`：從海上飛進來繞 101 一圈、停上黑塔屋頂前緣，沒有 rest；?quality=low 照 orbit 的規矩不畫）。最終章其他東西（紅光、飛彈、水花、UFO、外星生物、母艦、黑塔螢幕）全是程式幾何 | CC0 | 新增（計畫 5） |
| 共用 | — | 蓋房子動作的工具 | 3.9 程式畫的鋤頭（沒有要換 glb，所以 Quaternius `Shovel.glb` 不收） | — | 現有 |

## 離島三段（計畫 6 §7，全是程式零件）

每座離島 = 空島（`src/scene/island.js` 的 kit）→ 第一段 → 第二段；觸發固定、兩段各自獨立（`src/actors/satellites.js` 的 `STAGE`）。
零件：一段一個零件 `sat.<島>.stage1／stage2`（裁決 R7：下一段出現時已經站著的不重閃）。同一級一起出現的基座併進第一段：階梯丘的營區（原 `sat.camp`）在 `sat.pyramid.stage1`、
小森林的分店（原 `sat.forestShop`）在 `sat.forest.stage1`——基座手機照畫、那一級的主角（不 tagAlong）；點綴零件標 `stage: 1／2` 與 `low: false`。鞦韆（架子＋座位）、兩支風機的轉子用 `rig` 各一個 mesh。
全 MAX 一般畫質 draw call：wide-end 249 → 245（≤ 246）。全部 `footprint: false`；沒有基座的段 `tagAlong: true`（跟同一拍第一個閃的零件一起閃、不多佔 stagger，劇本時間不變）、`low: false`（?quality=low 不畫，手機 draw call ≤ 150）。

（清單不用表格：上面那張表一級一列，assets.test 數列數）

- **燈塔島**——第一段：燈泡 Lv7 `sat.lighthouse.stage1`：守塔人小屋（白牆、紅四坡頂、門、煙囪；島東北）；第二段：珍奶 Lv5 `sat.lighthouse.stage2`：棧橋碼頭（板面＋橫板＋四根柱子，從西南岸朝 `boba.DOCK` 伸出去、側讓 0.5；珍奶 Lv5 小船開過去時閃白）
- **風車島**——第一段：燈泡 Lv7 `sat.windmill.stage1`：第二支風機塔身＋電池屋（通電時綠燈條發光）；葉片是 `sat.windmill` 的 `twin` 轉子（同速轉、颱風同樣搖，第一段不跟著重建）；第二段：晶片 Lv6 `sat.windmill.stage2`：變電小站（水泥墊、變壓箱、兩個霓虹藍礙子）
- **石堆島**——第一段：老鼠 Lv3 `sat.rocks.stage1`：鼠洞（最大石頭鏡頭側）＋曬太陽的石板；第二段：老鼠 Lv4 外星：綠光圈（現有 `sat.rocksRing`）；賽博沒有
- **階梯丘**——第一段：晶片 Lv3 `sat.pyramid.stage1`（跟營區同一個零件）：第二頂帳篷（第四層梯田）；第二段：晶片 Lv9 `sat.pyramid.stage2`：觀測站（圓頂淡淡發光＋望遠鏡）
- **遊樂場島**——第一段：代幣 Lv8 `sat.playground.stage1`：鞦韆（kind `swing`，座位會盪；架子和座位一個 mesh）；第二段：鮮奶 Lv10 `sat.playground.stage2`：旋轉木馬（kind `carousel`，8 秒一圈）
- **小森林**——第一段：珍奶 Lv5 `sat.forest.stage1`（跟分店同一個零件）：茶屋兩張圓桌、四張凳；第二段：燈泡 Lv9 `sat.forest.stage2`：燈籠串（兩棵樹之間 6 顆暖黃燈籠；大停電時暗）
- **寶箱島**——第一段：棒球 Lv6 `sat.chest.stage1`：一隻海鷗停在箱蓋上（開箱後站到箱旁）；第二段：全 MAX `sat.chest.stage2`：金幣噴泉（kind `coins`，6 枚金幣一個 InstancedMesh，2.4 秒一輪）

沒收的候選（單檔 ≥ 300 KB 或壓縮格式，`tools/fetch-assets.mjs` 會拒收）：Quaternius `Bell_Tower.glb`（728 KB）、`6Story_Stack_Mat.glb`（396 KB）、`Pancake.glb`（3.5 MB）、`GeodesicDome-transformed.glb`（Draco）。
