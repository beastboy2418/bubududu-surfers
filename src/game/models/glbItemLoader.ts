import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * GLBItemLoader:
 * High-performance, mobile-optimized asset loader and instancing manager
 * for official 3D GLB in-game items, environment scenery, and vehicles:
 * 1. Stylized Coin (stylized_coin.glb)
 * 2. Modern Twin-Thruster Jetpack (jetpack_low_poly__modern_jetpack.glb)
 * 3. High-Top Super Sneakers (sneakers_-_game_ready_-_textured_mockup.glb)
 * 4. Pogo Stick / Power Jumper (animal_company_-_pogostick.glb)
 * 5. Mystery Gift Box (gift_box_4.glb)
 * 6. Street Skateboard / Hoverboard (skateboard.glb)
 * 7. 3D Subway Train (incoming-train.glb)
 * 8. Damaged Concrete Barricade (concrete_barricade_damaged.glb)
 * 9. Dudu & Bubu Car (dudu-bubu-car.glb)
 * 10. Boba Milk Tea (boba_tea.glb)
 * 11. Modern Skyscraper (building_05.glb)
 * 12. Classic City Building (old_building.glb)
 */

interface CachedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

class GLBItemLoaderManager {
  private loader: GLTFLoader;
  private cache: Map<string, CachedModel> = new Map();
  private loadPromises: Map<string, Promise<CachedModel | null>> = new Map();
  private isPreloaded = false;

  // Shared reusable glowing materials for maximum mobile performance (zero draw call waste)
  public matGoldAura: THREE.MeshBasicMaterial;
  public matEmeraldAura: THREE.MeshBasicMaterial;
  public matMagentaAura: THREE.MeshBasicMaterial;
  public matPurpleAura: THREE.MeshBasicMaterial;
  public matFlameCore: THREE.MeshBasicMaterial;
  public matFlameOuter: THREE.MeshBasicMaterial;
  public matSpringGold: THREE.MeshStandardMaterial;
  public matHeadlight: THREE.MeshBasicMaterial;
  public matHeadlightBeam: THREE.MeshBasicMaterial;
  public matUnderglow: THREE.MeshBasicMaterial;

  constructor() {
    this.loader = new GLTFLoader();

    this.matGoldAura = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });

    this.matEmeraldAura = new THREE.MeshBasicMaterial({
      color: 0x06d6a0,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.matMagentaAura = new THREE.MeshBasicMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.matPurpleAura = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.matFlameCore = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });

    this.matFlameOuter = new THREE.MeshBasicMaterial({
      color: 0xff6b35,
      transparent: true,
      opacity: 0.85,
    });

    this.matSpringGold = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      metalness: 0.85,
      roughness: 0.2,
    });

    this.matHeadlight = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
    });

    this.matHeadlightBeam = new THREE.MeshBasicMaterial({
      color: 0xfff3a8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });

    this.matUnderglow = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      transparent: true,
      opacity: 0.75,
    });
  }

  private getAssetUrl(filename: string): string {
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168.'))
    ) {
      return '/' + filename;
    }
    const base = import.meta.env.BASE_URL || './';
    const cleanBase = base.endsWith('/') ? base : base + '/';
    return cleanBase + filename;
  }

  public async preloadAll(): Promise<void> {
    if (this.isPreloaded) return;
    this.isPreloaded = true;

    const files = [
      { key: 'coin', file: 'stylized_coin.glb' },
      { key: 'jetpack', file: 'jetpack_low_poly__modern_jetpack.glb' },
      { key: 'sneakers', file: 'sneakers_-_game_ready_-_textured_mockup.glb' },
      { key: 'pogo', file: 'animal_company_-_pogostick.glb' },
      { key: 'giftbox', file: 'gift_box_4.glb' },
      { key: 'skateboard', file: 'skateboard.glb' },
      { key: 'train_incoming', file: 'incoming-train.glb' },
      { key: 'barricade', file: 'concrete_barricade_damaged.glb' },
      { key: 'car', file: 'dudu-bubu-car.glb' },
      { key: 'boba', file: 'boba_tea.glb' },
      { key: 'building_modern', file: 'building_05.glb' },
      { key: 'building_old', file: 'old_building.glb' },
    ];

    await Promise.allSettled(files.filter(item => ['coin', 'jetpack', 'pogo', 'car'].includes(item.key)).map((item) => this.loadModel(item.key, item.file)));
  }

  private loadModel(key: string, filename: string): Promise<CachedModel | null> {
    // Lightweight procedural versions replace the heavyweight decorative downloads.
    if (!['coin', 'jetpack', 'pogo', 'car'].includes(key)) return Promise.resolve(null);
    if (this.cache.has(key)) {
      return Promise.resolve(this.cache.get(key)!);
    }
    if (this.loadPromises.has(key)) {
      return this.loadPromises.get(key)!;
    }

    const url = this.getAssetUrl(filename);
    const p = new Promise<CachedModel | null>((resolve) => {
      this.loader.load(
        url,
        (gltf: GLTF) => {
          gltf.scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (mesh.material) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach((m) => {
                  if (m instanceof THREE.MeshStandardMaterial) {
                    m.roughness = Math.max(0.2, m.roughness * 0.85);
                    m.envMapIntensity = 1.2;
                  }
                });
              }
            }
          });

          const entry: CachedModel = {
            scene: gltf.scene,
            animations: gltf.animations,
          };
          this.cache.set(key, entry);
          resolve(entry);
        },
        undefined,
        (err) => {
          console.warn(`[GLBItemLoader] Could not load ${url}, falling back to procedural:`, err);
          resolve(null);
        }
      );
    });

    this.loadPromises.set(key, p);
    return p;
  }

  // --- FACTORY METHODS FOR TRACK & PLAYER ITEMS ---

  /**
   * 1. STYLIZED COIN:
   * Replaces procedural cylinder with authentic stylized 3D coin.
   * Auto-centered (Y offset -0.78), scaled for high visibility on mobile.
   */
  public createCoin(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBCoinRoot';

    const cached = this.cache.get('coin');
    if (cached) {
      const model = cached.scene.clone(true);
      model.position.set(0, -0.78, 0);
      model.scale.set(0.92, 0.92, 0.92);
      root.add(model);
    } else {
      const fallback = this.createFallbackCoin();
      root.add(fallback);
      this.loadModel('coin', 'stylized_coin.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          const model = c.scene.clone(true);
          model.position.set(0, -0.78, 0);
          model.scale.set(0.92, 0.92, 0.92);
          root.add(model);
        }
      });
    }

    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), this.matGoldAura);
    star.name = 'SparkleStar';
    root.add(star);

    return root;
  }





  /**
   * 2. MODERN JETPACK:
   * Used both on track as a floating collectible, and attached to Bubu/Dudu during flight.
   */
  public createJetpack(isEquipped = false): THREE.Group {
    const root = new THREE.Group();
    root.name = isEquipped ? 'EquippedJetpack' : 'GLBJetpackRoot';

    const cached = this.cache.get('jetpack');
    const scale = isEquipped ? 0.28 : 0.33;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.position.set(0, 0.073 * scale, -0.021 * scale);
      model.scale.set(scale, scale, scale);
      root.add(model);

      const nozzleL = new THREE.Group();
      nozzleL.name = 'NozzleFlameL';
      nozzleL.position.set(-0.25 * (scale / 0.28), -0.32 * (scale / 0.28), 0.02);
      this.attachFlameEffect(nozzleL);
      root.add(nozzleL);

      const nozzleR = new THREE.Group();
      nozzleR.name = 'NozzleFlameR';
      nozzleR.position.set(0.25 * (scale / 0.28), -0.32 * (scale / 0.28), 0.02);
      this.attachFlameEffect(nozzleR);
      root.add(nozzleR);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackJetpack();
      fallback.scale.set(scale * 3.2, scale * 3.2, scale * 3.2);
      root.add(fallback);
      this.loadModel('jetpack', 'jetpack_low_poly__modern_jetpack.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    if (!isEquipped) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24), this.matGoldAura);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.75;
      ring.name = 'BeaconRing';
      root.add(ring);
    }

    return root;
  }





  /**
   * 3. SUPER SNEAKERS:
   * Authentic game-ready textured high-tops with bouncy spring coils.
   */
  public createSneakers(isEquipped = false): THREE.Group {
    const root = new THREE.Group();
    root.name = isEquipped ? 'EquippedSneakers' : 'GLBSneakersRoot';

    const cached = this.cache.get('sneakers');
    const scale = isEquipped ? 0.038 : 0.046;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.position.set(0, -4.49 * scale, 0.03 * scale);
      model.scale.set(scale, scale, scale);
      root.add(model);

      [-0.19, 0.19].forEach((xPos) => {
        const spring = this.createCoilSpringMesh(0.065, 0.16);
        spring.position.set(xPos, -0.16, 0.02);
        spring.name = 'SpringCoil';
        root.add(spring);
      });
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackSneakers();
      root.add(fallback);
      this.loadModel('sneakers', 'sneakers_-_game_ready_-_textured_mockup.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    if (!isEquipped) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), this.matEmeraldAura);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.72;
      ring.name = 'BeaconRing';
      root.add(ring);
    }

    return root;
  }





  /**
   * 4. POGO STICK (Power Jumper):
   * High-jump launch device with bouncy suspension.
   */
  public createPogoStick(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBPogoRoot';

    const cached = this.cache.get('pogo');
    const scale = 1.85;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.position.set(0, -0.114 * scale, 0);
      model.scale.set(scale, scale, scale);
      root.add(model);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackPogo();
      root.add(fallback);
      this.loadModel('pogo', 'animal_company_-_pogostick.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24), this.matMagentaAura);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.68;
    ring.name = 'BeaconRing';
    root.add(ring);

    return root;
  }





  /**
   * 5. MYSTERY GIFT BOX:
   * Full 3D gift box with shiny ribbon, bow, and orbiting sparkles.
   */
  public createMysteryBox(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBMysteryBoxRoot';

    const cached = this.cache.get('giftbox');
    const scale = 0.38;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.scale.set(scale, scale, scale);
      root.add(model);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackGiftBox();
      root.add(fallback);
      this.loadModel('giftbox', 'gift_box_4.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    const orbitGroup = new THREE.Group();
    orbitGroup.name = 'OrbitStars';
    for (let s = 0; s < 3; s++) {
      const angle = (s / 3) * Math.PI * 2;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), this.matGoldAura);
      star.position.set(Math.cos(angle) * 0.48, 0.15 + (s % 2) * 0.1, Math.sin(angle) * 0.48);
      orbitGroup.add(star);
    }
    root.add(orbitGroup);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 24), this.matPurpleAura);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.65;
    ring.name = 'BeaconRing';
    root.add(ring);

    return root;
  }





  /**
   * 6. 3D SKATEBOARD / HOVERBOARD MODEL:
   * Authentic textured street skateboard with trucks, wheels, grip tape,
   * glowing underdeck neon light strips, and ground hover energy effect.
   */
  public createSkateboardModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBSkateboardRoot';

    const cached = this.cache.get('skateboard');
    const scale = 1.85;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      // Skateboard length is along X; rotate Y by 90deg to align length along Z (facing forward)
      model.rotation.y = Math.PI / 2;
      model.scale.set(scale, scale, scale);
      model.position.set(0, 0.02, 0);
      root.add(model);

      // Neon cyan underglow aura strip for high visibility on mobile
      const glowBarGeo = new THREE.BoxGeometry(0.32, 0.025, 1.25);
      const glowBar = new THREE.Mesh(glowBarGeo, this.matUnderglow);
      glowBar.position.set(0, 0.04, 0);
      glowBar.name = 'SkateboardUnderglow';
      root.add(glowBar);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackHoverboard();
      root.add(fallback);
      this.loadModel('skateboard', 'skateboard.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    return root;
  }





  /**
   * 7. 3D SUBWAY TRAIN MODEL:
   * Authentic textured subway train with driver cabin, passenger windows,
   * aerodynamic nose, roof highway, and high-intensity front headlights.
   */
  public createIncomingTrainModel(isMoving = true): THREE.Group {
    const root = new THREE.Group();
    root.name = isMoving ? 'GLBIncomingTrainRoot' : 'GLBStandingTrainRoot';

    const cached = this.cache.get('train_incoming');
    const s = 0.00085138; // Maps 2642.77 raw mm to exactly 2.25m height

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.scale.set(s, s, s);
      model.position.set(149.35 * s, -981.04 * s, 140.94 * s);
      root.add(model);

      // Front headlights facing oncoming player (-Z)
      const headlightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16);
      headlightGeo.rotateX(Math.PI / 2);

      const lightL = new THREE.Mesh(headlightGeo, this.matHeadlight);
      lightL.position.set(-0.48, 0.78, -3.34);
      root.add(lightL);

      const lightR = new THREE.Mesh(headlightGeo, this.matHeadlight);
      lightR.position.set(0.48, 0.78, -3.34);
      root.add(lightR);

      // Soft forward headlight beam
      const beamGeo = new THREE.ConeGeometry(0.75, 4.5, 16, 1, true);
      beamGeo.rotateX(-Math.PI / 2);
      const beamL = new THREE.Mesh(beamGeo, this.matHeadlightBeam);
      beamL.position.set(-0.48, 0.78, -5.6);
      root.add(beamL);

      const beamR = new THREE.Mesh(beamGeo, this.matHeadlightBeam);
      beamR.position.set(0.48, 0.78, -5.6);
      root.add(beamR);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackTrain();
      root.add(fallback);
      this.loadModel('train_incoming', 'incoming-train.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    return root;
  }





  /**
   * 8. 3D DAMAGED CONCRETE BARRICADE:
   * Authentic cracked weathered road barricade with exposed rebar and realistic textures.
   */
  public createBarricadeModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBBarricadeRoot';

    const cached = this.cache.get('barricade');

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.position.set(-3.323, 0.410, -2.560);
      root.add(model);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackBarricade();
      root.add(fallback);
      this.loadModel('barricade', 'concrete_barricade_damaged.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    return root;
  }





  /**
   * 9. 3D DUDU & BUBU CAR:
   * Authentic Bubu & Dudu themed street vehicle obstacle.
   */
  public createBubuDuduCarModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBCarRoot';

    const cached = this.cache.get('car');
    const s = 0.58;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.scale.set(s, s, s);
      model.position.set(0, 0.540 * s, 1.685 * s);
      root.add(model);

      const hlGeo = new THREE.SphereGeometry(0.12, 10, 10);
      const hlL = new THREE.Mesh(hlGeo, this.matHeadlight);
      hlL.position.set(-0.52, 0.55, -1.8);
      root.add(hlL);
      const hlR = new THREE.Mesh(hlGeo, this.matHeadlight);
      hlR.position.set(0.52, 0.55, -1.8);
      root.add(hlR);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackCar();
      root.add(fallback);
      this.loadModel('car', 'dudu-bubu-car.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    return root;
  }



  public createLoveCarPickupModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBLoveCarPickup';

    const carMini = this.createBubuDuduCarModel();
    carMini.scale.set(0.32, 0.32, 0.32);
    carMini.position.set(0, 0, 0);
    root.add(carMini);

    // Glowing pink heart aura ring
    const ringGeo = new THREE.TorusGeometry(0.55, 0.04, 12, 28);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3385, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'BeaconRing';
    ring.rotation.x = Math.PI / 2;
    root.add(ring);

    return root;
  }

  /**
   * 13. DUO TOGETHER HEART LOCK PICKUP:
   * Twin interlocking 3D love hearts with golden wings and pulsing beacon ring.
   */
  public createDuoPickupModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBDuoPickup';

    const lockGroup = new THREE.Group();
    lockGroup.name = 'TwinHeartLock';

    // Left Heart (Bubu pink)
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, 0.2);
    heartShape.bezierCurveTo(0, 0.35, -0.25, 0.45, -0.35, 0.25);
    heartShape.bezierCurveTo(-0.45, 0.05, -0.2, -0.15, 0, -0.35);
    heartShape.bezierCurveTo(0.2, -0.15, 0.45, 0.05, 0.35, 0.25);
    heartShape.bezierCurveTo(0.25, 0.45, 0, 0.35, 0, 0.2);

    const extrudeSettings = { depth: 0.12, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.04, bevelThickness: 0.04 };
    const heartGeo = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
    heartGeo.center();

    const bubuHeartMat = new THREE.MeshStandardMaterial({ color: 0xff3385, roughness: 0.25, metalness: 0.1 });
    const bubuHeart = new THREE.Mesh(heartGeo, bubuHeartMat);
    bubuHeart.scale.set(0.65, 0.65, 0.65);
    bubuHeart.position.set(-0.16, 0.05, 0);
    bubuHeart.rotation.z = 0.15;
    lockGroup.add(bubuHeart);

    // Right Heart (Dudu peach caramel)
    const duduHeartMat = new THREE.MeshStandardMaterial({ color: 0xfb8500, roughness: 0.25, metalness: 0.1 });
    const duduHeart = new THREE.Mesh(heartGeo, duduHeartMat);
    duduHeart.scale.set(0.65, 0.65, 0.65);
    duduHeart.position.set(0.16, 0.05, -0.04);
    duduHeart.rotation.z = -0.15;
    lockGroup.add(duduHeart);

    // Golden cartoon wings
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.2 });
    const wingGeo = new THREE.ConeGeometry(0.18, 0.55, 6);
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(-0.42, 0.08, 0);
    leftWing.rotation.z = Math.PI / 2.6;
    lockGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.set(0.42, 0.08, 0);
    rightWing.rotation.z = -Math.PI / 2.6;
    lockGroup.add(rightWing);

    lockGroup.position.set(0, 0, 0);
    root.add(lockGroup);

    // Glowing pink heart aura ring
    const ringGeo = new THREE.TorusGeometry(0.55, 0.04, 12, 28);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff1493, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'BeaconRing';
    ring.rotation.x = Math.PI / 2;
    root.add(ring);

    return root;
  }

  /**
   * 14. BOUNCY PEACH TRAMPOLINE:
   * Plush cartoon peach pad on a heavy coiled spring that launches the runner into the sky!
   */
  public createPeachTrampolineModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBPeachTrampoline';

    // 1. Metal base plate
    const baseGeo = new THREE.CylinderGeometry(0.55, 0.62, 0.10, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.05;
    root.add(baseMesh);

    // 2. Coiled metallic spring
    const springGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.35, 12);
    const springMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.3 });
    const springMesh = new THREE.Mesh(springGeo, springMat);
    springMesh.position.y = 0.27;
    root.add(springMesh);

    // 3. Giant plush peach pad
    const peachGeo = new THREE.SphereGeometry(0.52, 24, 20);
    peachGeo.scale(1.15, 0.68, 1.05);
    const peachMat = new THREE.MeshStandardMaterial({ color: 0xff758f, roughness: 0.5, metalness: 0.05 });
    const peachMesh = new THREE.Mesh(peachGeo, peachMat);
    peachMesh.position.y = 0.55;
    root.add(peachMesh);

    // 4. Two cute green leaves on the side
    const leafGeo = new THREE.ConeGeometry(0.12, 0.28, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.6 });
    const leaf1 = new THREE.Mesh(leafGeo, leafMat);
    leaf1.position.set(0.38, 0.62, 0.12);
    leaf1.rotation.z = -1.2;
    root.add(leaf1);

    const leaf2 = new THREE.Mesh(leafGeo, leafMat);
    leaf2.position.set(0.32, 0.60, -0.12);
    leaf2.rotation.z = -1.0;
    leaf2.rotation.y = 0.6;
    root.add(leaf2);

    return root;
  }



  /**
   * 10. 3D BOBA MILK TEA:
   * Authentic 3D Boba Cup with translucent cup, sweet milk tea, dome lid,
   * angled straw, and tapioca pearls!
   */
  public createBobaTeaModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBBobaRoot';

    const cached = this.cache.get('boba');
    const s = 0.16;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.scale.set(s, s, s);
      model.position.set(0.248 * s, 1.385 * s, 0.050 * s);
      root.add(model);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackBobaCup();
      root.add(fallback);
      this.loadModel('boba', 'boba_tea.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    // Radiant sparkle halo
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.52, 24), this.matGoldAura);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.05;
    ring.name = 'BeaconRing';
    root.add(ring);

    return root;
  }





  /**
   * 11. 3D MODERN HIGH-RISE SKYSCRAPER (building_05.glb)
   */
  public createModernBuildingModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBModernBuilding';

    const cached = this.cache.get('building_modern');
    const s = 2.5;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.scale.set(s, s, s);
      model.position.set(1.059 * s, 0.549 * s, 0.541 * s);
      root.add(model);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackBuilding(15.0, 0x48cae4);
      root.add(fallback);
      this.loadModel('building_modern', 'building_05.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    return root;
  }





  /**
   * 12. 3D CLASSIC CITY BUILDING (old_building.glb)
   */
  public createOldBuildingModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'GLBOldBuilding';

    const cached = this.cache.get('building_old');
    const s = 2.2;

    const setupModel = (srcScene: THREE.Group) => {
      const model = srcScene.clone(true);
      model.scale.set(s, s, s);
      model.position.set(-0.140 * s, 0, -0.014 * s);
      root.add(model);
    };

    if (cached) {
      setupModel(cached.scene);
    } else {
      const fallback = this.createFallbackBuilding(9.0, 0xd4a373);
      root.add(fallback);
      this.loadModel('building_old', 'old_building.glb').then((c) => {
        if (c) {
          root.remove(fallback);
          setupModel(c.scene);
        }
      });
    }

    return root;
  }





  // --- DYNAMIC PER-FRAME ANIMATION LOGIC ---
  public updateCollectibleAnimation(
    group: THREE.Group,
    type: string,
    dt: number,
    elapsedTime: number,
    id: number
  ): void {
    // 1. Continuous rotation
    group.rotation.y += dt * (type === 'coin' ? 3.8 : 2.5);

    // 2. Vertical hover bob
    const beacon = group.getObjectByName('BeaconRing');
    if (beacon) {
      const pulse = 1.0 + Math.sin(elapsedTime * 5.0 + id) * 0.12;
      beacon.scale.set(pulse, pulse, pulse);
    }

    const orbit = group.getObjectByName('OrbitStars');
    if (orbit) {
      orbit.rotation.y += dt * 3.2;
    }
  }

  // --- HELPER BUILDERS & PROCEDURAL FALLBACKS ---

  private attachFlameEffect(parent: THREE.Group) {
    const outerGeo = new THREE.ConeGeometry(0.06, 0.26, 12);
    outerGeo.rotateX(Math.PI);
    const outerMesh = new THREE.Mesh(outerGeo, this.matFlameOuter);
    outerMesh.position.y = -0.13;
    parent.add(outerMesh);

    const innerGeo = new THREE.ConeGeometry(0.035, 0.18, 10);
    innerGeo.rotateX(Math.PI);
    const innerMesh = new THREE.Mesh(innerGeo, this.matFlameCore);
    innerMesh.position.y = -0.09;
    parent.add(innerMesh);
  }

  private createCoilSpringMesh(radius: number, height: number): THREE.Mesh {
    const points: THREE.Vector3[] = [];
    const turns = 3.5;
    const count = 28;
    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2 * turns;
      const y = -height * (i / count);
      points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 24, 0.015, 6, false);
    return new THREE.Mesh(geo, this.matSpringGold);
  }

  private createFallbackCoin(): THREE.Group {
    const g = new THREE.Group();
    const coinGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 16);
    coinGeo.rotateZ(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.8, roughness: 0.2 });
    g.add(new THREE.Mesh(coinGeo, m));
    return g;
  }

  private createFallbackJetpack(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xef233c, metalness: 0.3, roughness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.15), m);
    g.add(box);
    return g;
  }

  private createFallbackSneakers(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x06d6a0, roughness: 0.4 });
    [-0.15, 0.15].forEach((x) => {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.32), m);
      shoe.position.set(x, 0, 0);
      g.add(shoe);
    });
    return g;
  }

  private createFallbackPogo(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xff3366, metalness: 0.5, roughness: 0.3 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 10), m);
    stick.position.y = 0.55;
    g.add(stick);
    return g;
  }

  private createFallbackGiftBox(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x9d4edd, roughness: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), m);
    g.add(box);
    return g;
  }

  private createFallbackHoverboard(): THREE.Group {
    const g = new THREE.Group();
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x00f5d4, metalness: 0.35, roughness: 0.2 });
    const deckGeo = new THREE.BoxGeometry(0.55, 0.08, 1.45);
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.y = 0.04;
    g.add(deck);
    return g;
  }

  private createFallbackTrain(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x48cae4, roughness: 0.3 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 6.6), bodyMat);
    body.position.set(0, 1.05, 0);
    g.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 6.6, 16, 1, false, 0, Math.PI), roofMat);
    roof.rotateZ(Math.PI / 2);
    roof.position.set(0, 2.25, 0);
    g.add(roof);
    return g;
  }

  private createFallbackBarricade(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x8d99ae, roughness: 0.7 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.85, 0.8), m);
    box.position.set(0, 0.425, 0);
    g.add(box);
    return g;
  }

  private createFallbackCar(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xfb8500, roughness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 3.2), m);
    box.position.set(0, 0.65, 0);
    g.add(box);
    return g;
  }

  private createFallbackBobaCup(): THREE.Group {
    const g = new THREE.Group();
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.65, 16), cupMat);
    cup.position.y = 0.325;
    g.add(cup);
    return g;
  }

  private createFallbackBuilding(height: number, color: number): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(5.0, height, 5.0), m);
    b.position.set(0, height / 2, 0);
    g.add(b);
    return g;
  }
}

export const glbItemLoader = new GLBItemLoaderManager();
