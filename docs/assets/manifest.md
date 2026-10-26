# 素材清單（物品 v2）

設計 §7.3：每一級一列。授權全是 CC0（逐包紀錄在 `assets/LICENSES.md`）；「程式」= `src/actors/<物品>.js` 的 view 用零件畫。
零件鍵今天程式裡還沒有的（例如 `token.cars`、`milk.lab`）是預定名稱，做的任務可以改。
狀態：**現有** = 今天的程式零件已經畫出這一級（舊階梯以內）；**待做** = 還沒做，來源欄是計畫要用的程式或 glb（glb 已由 `node tools/fetch-assets.mjs` 依 `tools/assets.json` 抓進 `assets/`）；**換新** = 原本是程式零件、改成 glb 之後。任務 4–9 做完一級就改這一列。

glb 一律經 `assets.spawn(path, { tint, glow })` 載入：整個模型併成 ≤ 2 個 draw call（不發光一個、發光一個），顏色進頂點色；
Kenney 新版套件（train、commercial、industrial、factory、food、market、car）與 KayKit 的顏色在色票圖裡，`tint` 的鍵可以寫色票格的 `'#rrggbb'`；
Quaternius 與 Kenney 舊版套件（space、racing、nature）照材質名上色。要播動畫或要分開轉的零件（風車葉片）用 `merge: false` 或自己拆。

| 物品 | 級 | 零件鍵 | 來源（程式／glb 路徑） | 授權 | 狀態 |
|---|---|---|---|---|---|
| 代幣 | 1 | `token.main` | 程式（站牌＋小月台） | — | 現有 |
| 代幣 | 2 | `token.main`、`token.staff` | 程式（小站、售票機、站務員 1） | — | 現有 |
| 代幣 | 3 | `token.main` | `kenney/commercial/low-detail-building-wide-a.glb`、`low-detail-building-wide-b.glb`（站體）＋程式站前廣場 | CC0 | 待做 |
| 代幣 | 4 | `token.track`、`token.train` | 程式環狀線；`kenney/train/train-electric-subway-a.glb`（車頭）、`-b.glb`（中間車）、`-c.glb`（車尾）3 節 | CC0 | 待做 |
| 代幣 | 5 | `token.train` | `kenney/train/train-electric-subway-a/b/c.glb` 5 節 | CC0 | 待做 |
| 代幣 | 6 | `token.train` | `kenney/train/train-electric-bullet-a.glb`、`-b.glb`、`-c.glb`（白底橘線靠 tint） | CC0 | 待做 |
| 代幣 | 7 ★◆ | `token.spur.*` | 程式（支線架到風車島與燈塔島） | — | 現有 |
| 代幣 | 8 | `token.shuttle`、`token.staff` | 程式（接駁小車、站務員 2） | — | 現有（站務員 2 待做） |
| 代幣 | 9 | `token.main`、`token.train` | `kenney/space/monorail_trainFront.glb`、`monorail_trainPassenger.glb`、`monorail_trainEnd.glb`；`quat/cyberpunk/Platform_4x1_Empty.glb`、`Rail_Long.glb`、`Sign_1.glb`、`TV_1.glb`（glow） | CC0 | 待做 |
| 代幣 | 10 ◆ | `token.cars` | `kenney/space/craft_speederA.glb`、`craft_speederB.glb`、`craft_speederC.glb` | CC0 | 待做 |
| 鮮奶 | 1 | `milk.crate` | 程式（牛奶箱） | — | 現有 |
| 鮮奶 | 2 | `milk.main` | `quat/buildings/1Story_Sign_Mat.glb`（早餐店）＋程式桌子 | CC0 | 待做 |
| 鮮奶 | 3 | `milk.main`、`milk.kids` | `kenney/commercial/building-a.glb`（一層米色校舍，視覺標準件）＋程式操場；小孩 = 程式名冊 | CC0 | 待做 |
| 鮮奶 | 4 | `milk.main`、`milk.kids` | `kenney/commercial/building-b.glb`（兩層） | CC0 | 待做 |
| 鮮奶 | 5 | `milk.main`、`milk.flag` | `kenney/commercial/building-c.glb`（三層）＋程式旗桿 | CC0 | 待做 |
| 鮮奶 | 6 | `milk.main`、`milk.kids` | 程式鐘塔（Quaternius `Bell_Tower.glb` 728 KB 超過單檔上限，沒收）；少棒隊 = 程式名冊 | — | 待做 |
| 鮮奶 | 7 ◆ | `milk.main`、`milk.gate` | `kenney/commercial/building-d.glb`、`building-e.glb`（拉長校舍）＋程式拱門校門 | CC0 | 待做 |
| 鮮奶 | 8 | `milk.lab` | `kenney/commercial/building-f.glb`（玻璃盒研究大樓）＋程式 YouBike 站 | CC0 | 待做 |
| 鮮奶 | 9 | `milk.kids` | 程式（拋學士帽、101 螢幕字） | — | 待做 |
| 鮮奶 | 10 ◆ | `milk.truck`、`milk.kids` | `kenney/car/truck.glb`（牛奶車）＋程式；觀光船 = `quat/ships/Boat.glb`（現有） | CC0 | 待做 |
| 晶片 | 1 | `chip.main`、`chip.crane`、`chip.worker` | `kenney/factory/crane.glb`＋程式圍籬、三角錐 | CC0 | 待做（程式版現有） |
| 晶片 | 2 | `chip.main`、`chip.smoke`、`chip.engineers` | `kenney/industrial/building-a.glb`、`chimney-medium.glb`、`pipe-large.glb`、`pipe-large-bend.glb`；煙 = 程式 | CC0 | 待做（程式版現有） |
| 晶片 | 3 | `chip.main`、`chip.engineers` | `kenney/industrial/building-b.glb`、`building-c.glb`、`building-d.glb`（三棟）、`chimney-small.glb`、`chimney-large.glb` | CC0 | 待做（程式版現有） |
| 晶片 | 4 | `chip.main` | 程式（「星群」弧形玻璃總部） | — | 待做 |
| 晶片 | 5 | `chip.solar`、`chip.substation` | `kenney/industrial/solar-panel-flat.glb`、`solar-panel-landscape.glb`、`water-tower.glb`＋程式變電站、電線桿 | CC0 | 待做 |
| 晶片 | 6 ★ | `chip.cable` | 程式（海底電纜發光、廠房燈全亮） | — | 待做 |
| 晶片 | 7 ★ | `tower.antenna` | `quat/cyberpunk/Antenna_1.glb`、`Antenna_2.glb` | CC0 | 待做 |
| 晶片 | 8 ★ | `chip.shield` | 程式（半圓半透明罩、六角格紋） | — | 待做 |
| 晶片 | 9 ★◆ | `chip.shield`、`tower.antenna` | 程式（罩子常駐、101 每 3 秒閃一圈） | — | 待做 |
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
| 老鼠 | 5 ◆ | `rat.pack`、`rat.ufo` | 機器鼠軍團 10 隻＋王冠 = 程式；UFO = 程式（Quaternius `Pancake.glb` 3.5 MB 超過單檔上限，沒收） | CC0 | 現有（10 隻、王冠待做） |
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
| 共用 | — | 蓋房子動作的工具 | 3.9 程式畫的鋤頭；備用 `quat/survival/Shovel.glb` | CC0 | 現有 |

沒收的候選（單檔 ≥ 300 KB 或壓縮格式，`tools/fetch-assets.mjs` 會拒收）：Quaternius `Bell_Tower.glb`（728 KB）、`6Story_Stack_Mat.glb`（396 KB）、`Pancake.glb`（3.5 MB）、`GeodesicDome-transformed.glb`（Draco）。
