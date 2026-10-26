# CC0 low-poly asset research (2026-10-26)

Verified by actually running curl / reading zip listings (not from memory).

## Download mechanics
- kenney.nl pages: `curl -sL https://kenney.nl/assets/<slug>` returns 200 text/html; the real zip URL is embedded in the page (hash dir changes on update, so scrape it):
  `curl -sL https://kenney.nl/assets/<slug> | grep -oE 'https://kenney.nl/media/[^"]+\.zip' | head -1`
- Direct zip tested: `curl -sIL https://kenney.nl/media/pages/assets/train-kit/cf8521d625-1727040883/kenney_train-kit.zip` -> HTTP/2 200, content-type application/zip, 5.2 MB. No login / click needed. (Guessing a /media/pages/assets/<slug>/ dir without the hash gives 403.)
- Every Kenney kit zip contains `Models/GLB format/*.glb` (plus FBX/OBJ/GLTF variants), a shared colormap.png, License.txt (CC0).
- Quaternius mirror raw file (tested 200): `https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/<dir>/<Name>.glb`. Mirror LICENSES.md (checked 2026-10-10) says all 32 packs are CC0-1.0 upstream. WARNING from that file: NEWER Quaternius releases use the Quaternius Asset License (QAL, no redistribution) - do not take anything beyond the packs below.
- KayKit GitHub repos (tested archive 302->200 zip): `https://github.com/KayKit-Game-Assets/KayKit-<Name>-1.0/archive/refs/heads/main.zip`; models in `addons/<pack>/Assets/gltf/*.gltf` (+bin, shared texture). LICENSE.txt in repo states CC0 (GitHub API shows NOASSERTION only because it is a .txt). Avoids the itch.io pay-what-you-want click.

## Packs found (21)

### School -> university, campus, clock tower, library
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Campus buildings, 2-6 floor stages | Kenney City Kit (Commercial) v2.1 | https://kenney.nl/assets/city-kit-commercial (zip: https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip) | CC0 | 50 models: building-a..n, building-skyscraper-a..e, low-detail-* variants, awnings/parasols. GLB+FBX+OBJ. Good for uni stage 2-3. |
| Small school/house stage | Kenney City Kit (Suburban) | https://kenney.nl/assets/city-kit-suburban (zip: .../city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip) | CC0 | 40 models, low houses + trees/fences. |
| Clock tower / library | Quaternius Medieval Village Pack (`medieval_village_pack`: Bell_Tower, Inn, Mill, Well, Gazebo, MarketStand_1/2, Sawmill, Stable, Blacksmith) | mirror dir `public/glb/medieval_village_pack/` | CC0 | Bell_Tower works as a clock tower once re-tinted. 44 models. |
| Chunky textured buildings 1-6 storey | Quaternius Ultimate Buildings (`buildings_pack_3` dir: 1Story..6Story_Stack, *_Sign_Mat, GableRoof/RoundRoof) | mirror dir `public/glb/buildings_pack_3/` | CC0 | 26 models; "_Mat" = material-coloured so re-tint friendly. Sign variants for shops. |

### MRT / metro station, trains
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Commuter, subway, bullet, tram, futuristic | Kenney Train Kit | https://kenney.nl/assets/train-kit (zip: https://kenney.nl/media/pages/assets/train-kit/cf8521d625-1727040883/kenney_train-kit.zip) | CC0 | 100 assets, GLB. train-electric-subway-a/b/c, train-electric-bullet-a/b/c (high-speed), train-electric-city-*, -double-*, -square-*, train-tram-modern/classic/round, locomotives, carriages, railroad-* tracks (straight/curve/bridge/hill). Covers train stages 1-3 completely. Also includes bridges/stations? only tracks and trains, no station building. |
| Futuristic monorail + track | Kenney Space Kit | https://kenney.nl/assets/space-kit (zip: .../space-kit/20874c75ac-1677698978/kenney_space-kit.zip) | CC0 | 150 assets; monorail_trainFront/Passenger/Cargo/End/Flat/Box, monorail_trackStraight/Corner/Slope/Support. Neon-train stand-in. GLB+GLTF+FBX+OBJ. |
| Station building small->large | Kenney City Kit Commercial (low-detail-building-wide-a/b, building-skyscraper-*) + Kenney Retro Urban Kit (shelters, fences) | https://kenney.nl/assets/retro-urban-kit (zip: .../retro-urban-kit/8314d4db22-1738147509/kenney_retro-urban-kit.zip) | CC0 | No dedicated metro-station model in any CC0 pack found; assemble from buildings + Space Kit platform_*/hangar_*/corridor_*. |
| Cyberpunk station | Quaternius Cyberpunk Game Kit (`cyberpunk_pack`) | mirror dir `public/glb/cyberpunk_pack/` | CC0 | see cyberpunk section. Platform_*, Rail_*, Support_*, Sign_* are useful for elevated platform. |

### Baseball stadium / dome
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Dome | Quaternius Ultimate Space Kit (`ultimate_space_pack`: GeodesicDome, Base_Large, Building_L, House_Cylinder) | mirror dir `public/glb/ultimate_space_pack/` (file names end in `-transformed.glb`) | CC0 | GeodesicDome = big-dome stage; also usable as holo dome/shield. |
| Dome / hangar round | Kenney Space Kit hangar_roundA/B/roundGlass, hangar_largeA/B | see Space Kit | CC0 | Round hangars read as small domes. |
| Stands / field | Kenney Racing Kit (grandstands, pits, flags, barriers) | https://kenney.nl/assets/racing-kit (zip: .../racing-kit/933b8fd9fd-1677580949/kenney_racing-kit.zip) | CC0 | 110 assets; grandstand-* + fence/barrier bits for stands. Not baseball-specific. Small field = procedural plane + Kenney nature. |
| Stadium alt | Quaternius Fantasy RTS (`real_time_strategy_pack`: Temple/TownCenter Level1-3) | mirror dir `public/glb/real_time_strategy_pack/` | CC0 | 128 models, 3 levels each of many buildings = ready-made "stages". |

### Dairy farm / milk
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Cow shed, barn, farm stages | Quaternius Fantasy RTS: Farm_Dirt/FirstAge/SecondAge_Level1-3 (+_Wheat), Stable, Storage_*; Medieval Village: Stable, Mill, Hay, Cart | mirror dirs above | CC0 | Level1-3 gives three visual stages. |
| Cow | Already have Quaternius Animals | - | CC0 | |
| Milk truck | Kenney Car Kit (truck, delivery, van) | https://kenney.nl/assets/car-kit (zip: .../car-kit/1a312ec241-1775131960/kenney_car-kit.zip) | CC0 | 45 assets. Also KayKit City Builder Bits car_* (hatchback/sedan/taxi/police/stationwagon). Plain truck + procedural white tank = milk truck. |
| Crops | Quaternius Ultimate Crops (`crops_pack`) | mirror dir `public/glb/crops_pack/` | CC0 | 102 models w/ growth stages _1.._4. |

### Chip fab / factory
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Industrial buildings, chimneys, tanks, solar, windmill, containers, water tower | Kenney City Kit Industrial v2.0 | https://kenney.nl/assets/city-kit-industrial (zip: https://kenney.nl/media/pages/assets/city-kit-industrial/0ec35b139d-1788171848/kenney_city-kit-industrial_2.0.zip) | CC0 | 40 models: building-a..t, chimney-basic/small/medium/large, detail-tank(-large), solar-panel-* (flat/landscape/portrait/groups), shipping-container-a..c, water-tower, windmill, windmill-low. Best single match for fab. |
| Interior machinery, pipes, cranes, cogs, catwalks | Kenney Factory Kit v3.0 | https://kenney.nl/assets/factory-kit (zip: https://kenney.nl/media/pages/assets/factory-kit/edaac9d4f6-1777639602/kenney_factory-kit_3.0.zip) | CC0 | crane, crane-lift, crane-magnet, machine*, pipe-*, conveyor-*, cog-*, catwalk-*, cone, robo-*. |
| Power lines / pylons | none dedicated (Cyberpunk Kit Cable_*/Support_* approximates) | - | - | see gaps |
| Wind turbines / solar | KayKit Space Base Bits (windturbine_low/tall, solarpanel, roofmodule_solarpanels) + Kenney Industrial windmill | https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0 | CC0 | 48+ models. |

### Bubble tea / shops / night market / lamps / neon
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Cart -> shop -> chain -> flagship | Quaternius Buildings `_Sign_Mat` variants + Kenney Commercial building-a..n + awnings | see above | CC0 | No bubble-tea-specific model exists; use a shop building + tinted awning + Kenney Food Kit cup/cup-tea/ice-cream-cup on top. |
| Cup / drink props | Kenney Food Kit | https://kenney.nl/assets/food-kit (zip: .../food-kit/83086fa91c-1719418518/kenney_food-kit.zip) | CC0 | 200 assets; cup, cup-tea, cup-coffee, ice-cream-cup, hot-dog, steamer etc. |
| Night-market stalls | Quaternius Medieval Village MarketStand_1/2; Kenney Mini Market (20); Kenney Retro Urban Kit (120) | https://kenney.nl/assets/mini-market ; https://kenney.nl/assets/retro-urban-kit | CC0 | Stalls re-tinted + paper-lantern spheres procedural. |
| Fountain | Quaternius Medieval Village Well; KayKit Medieval Hexagon building_well | - | CC0 | No true fountain found; Well + procedural water cylinder. |
| Street lamps | Quaternius Modular Streets (`street_pack`: Streetlight_Single/Double/Triple, TrafficLight, Sign_*) ; KayKit City Builder Bits streetlight, trafficlight_A/B/C ; Kenney Retro Urban detail-light-* | mirror dir `public/glb/street_pack/` | CC0 | |
| Neon signs / billboards | Quaternius Cyberpunk Kit Sign_1..4, Sign_Small_*, TV_1..3, Light_Square | mirror dir `public/glb/cyberpunk_pack/` | CC0 | emissive tinting on loader side. |
| Roads | Kenney City Kit Roads | https://kenney.nl/assets/city-kit-roads (zip: .../city-kit-roads/74288c9459-1791628607/kenney_city-kit-roads.zip) ; Quaternius street_pack Street_* ; KayKit road_* | CC0 | |

### Sci-fi / offshore / hover / UFO / dome
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Flying / hover car | Kenney Space Kit craft_speederA-D, craft_racer, craft_cargoA/B, craft_miner | see Space Kit | CC0 | speeders are the hover-car. |
| UFO | Quaternius Ultimate Spaceships (`spaceships_pack`: Bob, Challenger, Dispatcher, Executioner, Imperial, Insurgent, Omen, Pancake, Spitfire, Striker, Zenith) | mirror dir `public/glb/spaceships_pack/` | CC0 | "Pancake" is saucer-like; else disc procedural. Animated Mech/Tanks packs also CC0. |
| Holo dome/shield | procedural; GeodesicDome as frame | - | - | |
| Offshore | Kenney Watercraft Kit (zip: https://kenney.nl/media/pages/assets/watercraft-kit/a335cfed49-1713519620/kenney_watercraft-pack.zip) ; Kenney Pirate Kit | https://kenney.nl/assets/watercraft-kit | CC0 | We already have Quaternius Ships. |
| Cyberpunk city props (billboards, neon, antennas, AC units, cables, pipes, platforms, turrets) | Quaternius Cyberpunk Game Kit | https://quaternius.com/packs/cyberpunkgamekit.html ; files via mirror | CC0 | 71 GLBs incl. Antenna_1/2, AC*, Sign_*, TV_*, Platform_*, Pipe_*, Rail_*, Light_Street_*. Best cyberpunk match. |
| Sci-fi modular | Quaternius Ultimate Modular Sci-Fi (`modular_sci_fi`, 91), KayKit Space Base Bits, Kenney Space Kit | - | CC0 | |

### Small props (hoe, hammer, crane, scaffolding, cones)
| Need | Best pack | URL | Licence | Notes |
|---|---|---|---|---|
| Construction crane | Kenney Factory Kit crane / crane-lift | see Factory Kit | CC0 | |
| Scaffolding, cones, fences, barriers | Kenney Retro Urban Kit (scaffolding-floor/poles/structure) ; Kenney Factory Kit `cone`; Kenney Racing Kit cones/barriers | see above | CC0 | |
| Hammer, hoe/shovel, axe | Quaternius Survival Pack (Axe, Shovel, Pan, Torch, Tent, Raft, Trashcan, GasCan) ; Quaternius Ultimate RPG Pack (`rpg_items_pack`) ; Kenney Survival Kit | https://kenney.nl/assets/survival-kit | CC0 | Shovel stands in for hoe. |
| Lighthouse | Kenney Pirate Kit / Watercraft kit (tower-like pieces), Quaternius Modular Medieval Buildings (Watchtower/LargeTower) re-tinted | https://kenney.nl/assets/pirate-kit | CC0 | No true lighthouse; keep procedural. |

## Other CC0 packs checked (lower priority)
- Kenney Modular Buildings (https://kenney.nl/assets/modular-buildings, zip .../modular-buildings/3253b4219a-1707397411/kenney_modular-buildings.zip), Building Kit, Holiday Kit, Furniture Kit, Mini Characters, Fantasy Town Kit 2.0, Castle Kit, Hexagon Kit, Tower Defense Kit, Platformer Kit, Mini Arena, Mini Dungeon, Nature Kit (already used).
- KayKit City Builder Bits (32+ models: building_A..H with/without base, cars, roads, hydrant, watertower, streetlight, trafficlight, dumpster) https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 ; Space Base Bits https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0 (spacetruck, landingpad, drill, cargo, domes via roofmodule/basemodule) ; Prototype Bits (blocks/slopes/stairs, 80ish) ; Restaurant Bits (food/kitchen) ; Furniture Bits ; Medieval Hexagon Pack (buildings in 4 team colours, 29 MB). All CC0 per LICENSE.txt, glTF/FBX/OBJ. KayKit author asks not to resell unmodified copies.
- Quaternius Modular Streets, Modular Sci-Fi, Ultimate Space Kit, Survival, Crops, Buildings x2, Medieval Village, Modular Medieval Buildings (30, in mirror but no pack page), Ultimate Fantasy RTS, Animated Mech/Tanks.

## Gotchas
- Kenney zip hash dirs change per release; scrape the page each time. Kenney GLB share one `colormap.png` (already loadable; our loader re-tints anyway).
- Quaternius `ultimate_space_pack` files are named `*-transformed.glb` (gltf-transform-optimized) - may be Draco/meshopt compressed; check decoders in loader.
- Quaternius newer packs = QAL (not CC0, no redistribution). Only use the pack names above, all verified CC0 in mirror LICENSES.md as of 2026-10-10.
- itch.io KayKit page is "name your price" and needs a click; use the KayKit-Game-Assets GitHub repos instead (no login).
- Poly Pizza: mixed CC0 / CC-BY (CC-BY requires attribution) - filter per model; not used here because everything needed has a safe pack. Many itch.io "CC0 cyberpunk" packs (e.g. Cyber City by papptimus, Dida3d city) did not state CC0 clearly in search snippets; unverified, rejected.
- Kenney Train Kit has no station building; only tracks, locomotives, carriages.

## Gaps (no CC0 candidate found)
- Dedicated metro/MRT station building (assemble from buildings + Space Kit platforms + Cyberpunk Platform/Rail pieces)
- Baseball field / stadium / dome with seating (only Racing Kit grandstands + GeodesicDome)
- Cow shed specifically and milk truck/tank (use barn/Stable/Farm models + generic truck)
- Bubble-tea cart/shop/chain models and fountain (compose from stalls + cups + Well)
- Power lines / pylons / telephone poles
- Lighthouse (nice GLB), true UFO saucer (Pancake ship or procedural), holographic dome (procedural)
- Verified CC0 cyberpunk city *buildings* (only Quaternius Cyberpunk Game Kit props/platforms; no CC0 neon skyscraper set)
