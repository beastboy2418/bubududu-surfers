# Bubu & Dudu Subway Runner 3D

A browser-based, three-lane endless runner featuring Bubu and Dudu, four themed districts, a railway inspector and bulldog pursuit, procedural environments, collectible power-ups, a Together ability, and a persistent little home. The interface uses React; Three.js renders and simulates the game directly.

This README documents the supplied source as reviewed on **3 November 2026**. Feature descriptions are based on implementation, not a claim that every interaction has been playtested. Known discrepancies and verification limits are recorded below.

## Run locally

Use **Node.js 22.12 or newer** and npm. The installed Vite package declares `^20.19.0 || >=22.12.0` support.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The development script binds to `0.0.0.0`, so it also permits LAN access where firewall rules allow it.

**No Gemini API key is required by the current game.** The previous README's API-key setup instructions were template leftovers. No Gemini calls or backend routes are implemented in `src`; the Gemini capability in `metadata.json` and some dependencies remain from the starter project.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite on port 3000 |
| `npm run lint` | Run TypeScript with `--noEmit`; this is a type check, not ESLint |
| `npm run build` | Generate the static production site in `dist/` |
| `npm run preview` | Serve the production build locally; use the URL printed by Vite |
| `npm test` | Run deterministic pursuit, collision, scoring, economy, and persistence tests |
| `npm run clean` | Execute `rm -rf dist server.js`; Unix-shell syntax, not portable to default Windows shells |

A WebGL-capable browser is required. Audio uses the Web Audio API and may require a user interaction before playback. Serve the game over HTTP(S), rather than opening `index.html` as a local file.

## Gameplay and screens

1. Choose Bubu or Dudu and select one of four destinations: Sakura Express, Midnight Boba, Cloud Railway, or Moonlight Festival. The destination changes scenery, color, lighting, and obstacle emphasis.
2. On a first run, complete the short interactive practice card. It explains movement and the pursuit rule without blocking later replay.
3. Start the skippable graffiti-at-the-depot cinematic, then change lanes, jump, slide, use train ramps and rooftops, and collect coins and power-ups as the track scrolls toward the camera.
4. Build Fever and Together charge through coins, clean clears, near misses, and perfectly timed character tags. Spend a full Together meter to summon the partner for a short rescue-and-collection run.
5. An unprotected collision causes a stumble. The inspector and bulldog return only after that stumble. Run clean for eight seconds to escape; a second separate unprotected stumble during that window starts the caught cinematic.
6. Complete district challenges, bring decorations back to the little home, unlock scarves and destinations, and spend wallet coins in the shop.

Engine states are `menu`, `intro`, `playing`, `paused`, `caught`, and `gameover`. Engine state changes are sent to React through one callback so keyboard pause, visibility pause, capture, and restart use the same overlay state.

### Controls

| Action | Keyboard / mouse | Touch / interface |
| --- | --- | --- |
| Change lane | Left/Right arrows or A/D | Swipe left/right or direction buttons |
| Jump | Up arrow or W; Space while grounded | Swipe up or Jump button |
| Slide / fast downward dive | Down arrow or S | Swipe down or Slide button |
| Activate hoverboard | B/H, Space while airborne, or double-click the game surface | Double-tap the game surface or hoverboard button |
| Switch character | C | Character-switch button |
| Activate duo companion | T/V | Duo button |
| Pause | Escape or P while playing | Pause button |
| Resume | Escape or P while paused | Resume button when pause overlay is visible |
| Skip intro | Space, Enter, or Escape | SKIP button |
| Start / replay | Space or Enter in menu/game-over engine states | Start / Play Again button |
| Mute / show controls | Interface buttons | Interface buttons |

Swipes require more than 25 pixels of movement. Double-tap detection uses a 320 ms interval. The keyboard start shortcut reaches the engine without first changing React to the intro screen; use the visible Start button for the intended screen flow.

### Characters and movement

- **Bubu:** white character with dark details and pink cheeks. Normal jump velocity is 13.5 units/second. Bubu gently attracts nearby coins, while the collected Magnet power-up reaches much farther.
- **Dudu:** caramel-colored character with yellow cheeks. Normal jump velocity is 14.8 units/second; wooden crates can be smashed safely for two coins.
- Character switching is available during a run and reattaches active equipment. It does not require active duo mode.
- Gravity is -32 units/second squared. Sliding lasts 0.85 seconds; sliding in midair sets downward velocity to -28.
- Jump input is buffered for 160 ms, with 120 ms of coyote time around ledges. Train and car roofs provide elevated running surfaces.
- Lane coordinates are `[2.2, 0, -2.2]`, ordered screen-left to screen-right because of the camera orientation. Lane changes use damped interpolation.

### Obstacles and world generation

Six reusable 40-unit track segments provide open streets, bridges, and tunnels/stations. The theme cycle is `open, open, bridge, open, tunnel, tunnel, open, bridge`. Sky, fog, and lighting shift between daytime, sunset, and night based on progress.

Waves choose one or two obstacle lanes, leaving at least one lane free **within that wave**. This is not an end-to-end guarantee that moving trains and adjacent waves always form a solvable route. Spawns use `Math.random()` without seeded replays.

| Obstacle | Interaction |
| --- | --- |
| Wooden crate | Jump over it; Dudu can smash it |
| Low barrier | Jump over it |
| High barrier | Slide underneath |
| Train | Avoid its body or use a suitable ramp/roof; moving trains have an extra speed of 9.5 |
| Car | Jump over or land on its roof |
| Trampoline | Launch upward at velocity 23.5 and spawn a sky coin trail |

Stationary trains have a 60% ramp chance. Train roofs are at height 2.25; car roofs at 1.84. Train and car spawns also place elevated coins. New waves appear ahead at Z=135, with randomized spacing. Each selected obstacle lane rolls trampoline 10%, crate 18%, low barrier 18%, high barrier 16%, train 20%, or car 18%.

An open lane rolls Jetpack, Magnet, Sneakers, or 2x at 7% each; Pogo, Love Car, Duo, Mystery Box, or Boba at 6% each; otherwise it receives a three-coin trail (42%). These are conditional per-lane probabilities, not per-second drop rates.

### Power-ups and special modes

| Item / mode | Implemented effect | Base duration |
| --- | --- | --- |
| Jetpack | Flight, obstacle immunity, attached jetpack, and sky coins | 6 s; upgradeable |
| Magnet | Pulls coins from nearby lanes within a 14-unit radius; does not pull other items | 8 s; upgradeable |
| Super Sneakers | Jump velocity becomes 20.5 | 8 s; upgradeable |
| 2x multiplier | Doubles the distance multiplier and player/companion coin yield | 8 s; upgradeable |
| Pogo | One launch at velocity 23.5 with a sky coin cluster | Instant |
| Boba | Doubles player coin pickups, fires obstacle-breaking pearls about every 0.65 s, and absorbs one collision | 8 s, or until shield is consumed |
| Hoverboard | Inventory item that absorbs one collision; break grants 1.4 s temporary immunity | Up to 30 s |
| Headstart | Pre-run flight at speed 70 | 5 s |
| Score Booster | Pre-run consumable raises base score multiplier from 1x to 4x | Whole run |
| Love Car | Obstacle destruction and faster track movement | 12 s |
| Together | Charge to 100 through coins, clears, near misses, and perfect tags; summons the companion, collects adjacent-lane coins, and can sacrifice itself to prevent a collision | 15 s |
| Fever | Obstacle destruction, faster track movement, and doubled coin yield | 6.5 s |
| Mystery Box | Random reward via the unboxing interface | Inventory/accounting issues noted below |

The companion's base coin yield is two, further doubled by 2x and Fever. A duo save grants 25 coins and 1.8 seconds of immunity. Together cannot be activated below full charge or refreshed while already active. Switching during the one-second perfect-tag window grants charge and brief protection.

Collision protection is checked in this order: flight/headstart/temporary immunity and high elevation, Love Car/Fever, terrain-specific checks, Dudu's crate ability, jump/slide clearance, hoverboard, Boba, then duo save. An otherwise unprotected hit immediately triggers capture; the guard is primarily a visual chaser rather than a multi-hit health system.

### Score, difficulty, combos, and missions

The score is accumulated from travel segments and coin total:

```text
activeMultiplier = (scoreBoosterSelectedAndConsumed ? 4 : 1) * (2xActive ? 2 : 1)
score = floor(accumulatedDistancePoints + runCoins * 15)
normalSpeed = min(19 + distance * 0.007, 34)
```

Distance points are accumulated as the multiplier changes, so the score never drops when a 2x effect expires. The recorded high score keeps the highest observed value. Coins represent awarded value, including bonuses, rather than simply the number of coin objects collected.

Track movement adds 6.5 speed during Fever, otherwise 6 during Love Car, otherwise 3.5 during Duo. These bonuses do not stack and are not included in the distance accumulator, which uses `currentSpeed`.

A player coin pickup adds one combo and four Fever charge; a cleared jump/slide obstacle adds two combo and eight charge. The combo window is 2.8 seconds. At 100 charge, Fever activates and grants five combo. Companion coin pickups do not advance the player's coin mission, combo, or Fever charge.

One mission is randomly assigned at the start of each run:

- Collect 35 coins (awarded player coin value counts).
- Leap over four obstacles.
- Ignite Fever mode once.
- Sprint 350 distance units, displayed as metres.

Completion automatically credits **250 wallet coins**. There is no implemented mission chain or daily reset system.

## Shop, rewards, and persistence

A fresh browser profile starts with **500 wallet coins, three hoverboards, two headstarts, two score boosters, and one mystery box**. All four upgrade categories start at level 1 and cap at level 5.

| Upgrade | Durations at levels 1–5 (seconds) | Costs for 1→2, 2→3, 3→4, 4→5 |
| --- | --- | --- |
| Jetpack | 6 / 9 / 13 / 17 / 22 | 300 / 600 / 1200 / 2500 |
| Magnet | 8 / 12 / 16 / 20 / 25 | 250 / 500 / 1000 / 2000 |
| Sneakers | 8 / 12 / 16 / 20 / 25 | 250 / 500 / 1000 / 2000 |
| 2x | 8 / 12 / 16 / 20 / 25 | 300 / 600 / 1200 / 2500 |

Consumables cost 300 coins per hoverboard, 400 per headstart, 350 per score booster, and 500 per mystery box. These are local in-game purchases; no real-money payment system is present.

Mystery-box rolls award 300–800 coins in 100-coin steps (40%), one or two hoverboards (25%), one or two headstarts (20%), or one or two score boosters (15%). A collected box enters the persistent inventory, and opening debits exactly one box before granting a reward.

| Local-storage key | Data |
| --- | --- |
| `bubududu_high_score` | Highest observed score |
| `bubududu_wallet_coins` | Spendable wallet balance |
| `bubududu_upgrades` | JSON upgrade levels |
| `bubududu_consumables` | JSON consumable counts |
| `bubududu_muted` | Audio preference |

Progress belongs to the browser origin/profile. Clearing site storage removes it; another host or port has separate storage. There is no account, cloud save, server validation, multiplayer, or online leaderboard. Saved JSON is merged without schema/range validation, and storage access is not consistently guarded against browser failures. `window.__engine` exposes the engine for debugging, so local scores and balances are not tamper-resistant.

## Code and asset architecture

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | Mount React and load global CSS |
| `src/App.tsx` | Create/dispose the engine; bridge callbacks, screen state, shop actions, and controls |
| `src/components/UIOverlay.tsx` | Destination menu, practice tutorial, HUD, pursuit warning, Together meter, touch buttons, shop, home, settings, pause, and results |
| `src/game/gameEngine.ts` | Game state, render loop, movement, collisions, cinematics, camera, particles, score, missions, economy, and persistence |
| `src/game/trackManager.ts` | Track recycling, waves, obstacles, collectibles, and coin attraction |
| `src/game/rules.ts` | Deterministic pursuit, collision, scoring, lane, and save-data rules |
| `src/game/adventure.ts` | District definitions, home progression, outfits, quality settings, and safe persistence |
| `src/game/districtScenery.ts` | Instanced district scenery, signs, windows, and ambient fields |
| `src/game/models/characterBuilder.ts` | Procedural characters, inspector, bulldog, poses, outlines, and accessory builders |
| `src/game/models/faceTextures.ts` | 1024×1024 canvas-generated facial expressions |
| `src/game/models/glbItemLoader.ts` | Async model cache, GLB cloning, procedural fallbacks, equipment, and item animation |
| `src/audio/soundManager.ts` | Synthesized music/effects, decoded voice clips, mute state, and jetpack loop |
| `src/index.css` | Full-viewport layout, safe-area padding, and touch/overscroll restrictions |
| `vite.config.ts` | React/Tailwind plugins, relative deployment base, root alias, and optional HMR disabling |
| `.github/workflows/deploy.yml` | Static build and GitHub Pages deployment |

The main flow is input → engine update → track/physics/collision evaluation → stats callbacks → React overlay, with Three.js rendering on each tick. The engine owns simulation state; React owns presentation state and mirrors selected game data. There is no separate physics library or React Three Fiber layer.

Declared runtime packages include React 19, Three.js 0.186, Vite 8, Tailwind 4, Lucide React, and canvas-confetti. `@google/genai`, Express, dotenv, and motion are declared but not imported by the current application source. TypeScript is the only configured code-validation command. Both npm and Bun lockfiles exist; CI uses npm.

### Visuals and loading

The scene uses perspective projection, ACES tone mapping, atmospheric fog, a generated environment map, directional/hemisphere lighting, shadows, clouds, camera shake, speed-sensitive framing, and particle effects. The menu and game include procedural character animation; reference JPEGs are not loaded as the live character models.

The loader keeps the lightweight coin, jetpack, pogo, and car models available while procedural fallbacks cover decorative scenery, barricades, shops, and pickups. This keeps the first playable scene from requesting the full original model library. There is no explicit loading-progress screen or retry policy for failed cached requests.

| GLB file | Role |
| --- | --- |
| `stylized_coin.glb` | Coin |
| `jetpack_low_poly__modern_jetpack.glb` | Jetpack |
| `sneakers_-_game_ready_-_textured_mockup.glb` | Sneakers |
| `animal_company_-_pogostick.glb` | Pogo |
| `gift_box_4.glb` | Mystery box |
| `skateboard.glb` | Hoverboard |
| `incoming-train.glb` | Train |
| `concrete_barricade_damaged.glb` | Barricade |
| `dudu-bubu-car.glb` | Car obstacle / Love Car |
| `boba_tea.glb` | Boba pickup |
| `building_05.glb` / `old_building.glb` | Scenery |

Assets reside in `public/`, with three voice clips in `public/audio-tracks/` and four reference JPEGs in `public/assets/reference-images/`. The GLBs total **52,638,704 bytes (52.64 MB / 50.20 MiB)**. Sneakers account for 16.69 MB and the barricade for 12.96 MB; together they exceed half the model payload.

### Audio

Most effects and background music are synthesized through oscillators/noise and gain envelopes. Three `.mpeg` voice files supply Bubu's start, Dudu's start, and capture dialogue. Voice data is fetched and decoded into cached audio buffers. The sound manager's header comment claiming “zero external audio assets” is outdated. Google Fonts supplies Fredoka and Nunito through `index.html`; no service worker or offline asset cache is configured.

## Performance, accessibility, and maintainability

Existing optimizations include track recycling, cached GLBs/shared resources, instanced railway sleepers and windows, preallocated math objects, capped pixel ratio (at most 1.5 by default), lower shadow maps, adaptive resolution, bounded particles, and a fixed 60 Hz simulation accumulator. A quality setting supports Adaptive, Battery saver, and Beautiful modes; reduced motion removes camera shake, most particles, and interface animation. Software-renderer detection disables antialiasing and shadows. The game renders independently from the fixed simulation, so temporary render slowdowns do not change movement rules.

Areas to measure or improve:

- Compress/simplify large models and textures; defer nonessential asset loading. The production JS chunk is about 1.06 MB minified before gzip, separate from model downloads.
- HUD callbacks are throttled to presentation updates while the simulation remains fixed-step.
- High-score records may write to synchronous local storage every frame; coin pickups also persist immediately. Batch saves at suitable checkpoints.
- Particles and procedural meshes create GPU resources; removed objects are not comprehensively disposed. Track recycling alone does not address all resource lifetimes.
- Outlined meshes and transparent effects still deserve profiling on actual mobile hardware. No FPS or memory measurements were collected in this review.
- Safe-area classes, responsive controls, and several accessible button labels exist. However, global zoom restrictions, animated effects, canvas-only gameplay, and the lack of explicit reduced-motion/modal-focus handling limit accessibility. A keyboard and screen-reader audit remains necessary.
- Simulation, persistence, economy, and cinematics are concentrated in a roughly 98 KB engine file; the overlay is roughly 63 KB. Smaller domain modules and deterministic simulation tests would make changes easier to verify.

## Known issues from source review

These are remaining implementation findings, not browser-reproduced bug reports. The major pursuit, collision, score, pause, reward, and loading issues found in the previous review have been addressed in this overhaul.

| Priority | Finding and consequence | Source location / suggested direction |
| --- | --- | --- |
| Medium | The main Three.js bundle is still about 1.04 MB minified, and the repository still contains the original 52.6 MB GLB library even though decorative downloads are skipped during startup. | Split UI/game modules and replace retained GLBs with KTX2/Meshopt delivery assets when the source art pipeline is available. |
| Medium | Browser verification covered startup, menu/tutorial DOM flow, typecheck, build, and deterministic rules; it did not measure FPS, GPU memory, touch latency, or long-run heap growth on a real phone. | Profile on target devices before publishing a 60 FPS claim. |
| Medium | Procedural district scenery is intentionally stylized; the next visual ceiling is authored character animation, baked lighting, and compressed production art per district. | Replace placeholder district props incrementally while preserving the shared palette and silhouettes. |
| Low | No service worker or offline cache is configured, and Google Fonts remain a network dependency. | Add an intentional offline/loading strategy if the game must work without a network after first visit. |
| Low | No software license file or asset-attribution manifest was found in the supplied project. | Confirm provenance and add attribution before distributing publicly. |

Other review limits: the random lane shuffle is not uniform, moving-train roof coins do not share the train's extra movement speed, and headstart/power-up overlap, rapid retries, touch interactions, and long-session memory behavior warrant targeted playtesting. No software license file or asset-attribution manifest was found in the supplied project; comments describing assets as “official” are not evidence of their provenance or permissions.

## Build and deploy

```sh
npm run lint
npm run build
npm run preview
```

Deploy the contents of `dist/` to static hosting. `base: './'` and base-aware asset paths support relative hosting; local hostnames receive root-relative model/audio paths. Validate assets at the actual deployment URL, especially under a subdirectory. `public/.nojekyll` is copied into the build for GitHub Pages.

The live repository is published through GitHub Pages' branch-based publisher. The compiled production entry point and hashed bundle are committed at the repository root so `https://beastboy2418.github.io/bubududu-surfers/` can serve the game directly. For source development, use `npm run dev`; after changes, run `npm run build` and publish the resulting `dist/` contents to the Pages source.

The local source folder may be used without Git metadata; the GitHub repository is the deployment source. The existing AI Studio project identifier is `d5697be7-a76d-4b3f-a093-f96d36b8cfe5`; its hosted state was not inspected.

## Verification record

Checks performed on 3 November 2026 using the already-installed dependencies:

| Check | Result |
| --- | --- |
| Source/configuration/asset review | Inspected application modules, gameplay logic, persistence, asset loader, audio, scripts, and deployment workflow |
| `npm run lint` | PASS: TypeScript completed without reported errors |
| `npm test` | PASS: 20 deterministic gameplay tests passed, including the two-stumble chase, spatial collision protection, score accumulation, mystery-box consumption, pause transitions, and save-data sanitization |
| `npm run build` | PASS: Vite 8.3.5 transformed 1,676 modules and built in 2.96 seconds |
| Build sizes | HTML 1.85 kB; CSS 32.08 kB (8.15 kB gzip); JS 1,042.35 kB (277.39 kB gzip), as reported by Vite |
| Bundle warning | Vite warned that a minified chunk exceeds 500 kB |
| `npm run dev` | Vite reported ready on port 3000 |
| Interactive browser test | PASS for startup/menu/tutorial DOM flow on `http://192.168.1.6:3000/`; gameplay performance and touch behavior still need device testing |
| Test suite | `tests/gameplay.test.ts` with 20 deterministic tests |
| Fresh dependency installation / deployment | Local clean install passed; GitHub Pages branch publication passed for the public URL |

The verification environment reported Node **26.7.0** and npm **12.0.2**. Build/type-check success does not establish runtime collision accuracy, audio playback, mobile usability, or a particular frame rate.

### Suggested manual acceptance pass

1. Start with a fresh test browser profile; verify initial balances and reload persistence.
2. Play both characters through intro, skip, capture, replay, pause/resume, and menu transitions using buttons and keyboard separately.
3. Exercise every lane, jump/slide clearance, train ramp/roof, and cross-lane trampoline interaction.
4. Check each power-up, duration upgrade, combined effect, hoverboard break, duo save, and character switch.
5. Verify mission rewards, score behavior when 2x expires, wallet saving after destruction rewards, and single-use mystery-box accounting.
6. Test touch gestures, small portrait/landscape layouts, audio mute/unlock, and repeated runs on real mobile hardware.
7. Profile loading, frame timing, and GPU/heap growth; test missing assets, blocked storage, and the deployed subdirectory URL.

