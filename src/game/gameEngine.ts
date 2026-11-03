import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createBubuModel,
  createDuduModel,
  createGuardModel,
  createBulldogModel,
  createSprayCanModel,
  createHoverboardModel,
  AnimatedCharacter,
  CharacterType,
} from './models/characterBuilder';
import { glbItemLoader } from './models/glbItemLoader';
import { TrackManager, LANES, LaneIndex } from './trackManager';
import { soundManager } from '../audio/soundManager';
import { Pursuit, overlapsObstacle, accrueScore, finiteNumber, consumeBox } from './rules';
import { Adventure, loadAdventure, saveAdventure, safeStorage, DISTRICTS, DISTRICT_LENGTH, districtAt, DECORATIONS, Quality, Outfit } from './adventure';
import { AmbientField } from './districtScenery';

// Software WebGL Detection for performance & headless guard
const isSoftwareGl = (() => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

// Pre-allocated math objects to avoid garbage collection inside render loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _boxPlayer = new THREE.Box3();

export interface PowerUpUpgrades {
  jetpack: number;
  magnet: number;
  sneakers: number;
  multiplier2x: number;
}

export interface ConsumableInventory {
  hoverboards: number;
  headstarts: number;
  scoreBoosters: number;
  mysteryBoxes: number;
}

export const UPGRADE_DURATIONS: Record<keyof PowerUpUpgrades, number[]> = {
  jetpack: [6, 9, 13, 17, 22],
  magnet: [8, 12, 16, 20, 25],
  sneakers: [8, 12, 16, 20, 25],
  multiplier2x: [8, 12, 16, 20, 25],
};

export const UPGRADE_COSTS: Record<keyof PowerUpUpgrades, number[]> = {
  jetpack: [300, 600, 1200, 2500],
  magnet: [250, 500, 1000, 2000],
  sneakers: [250, 500, 1000, 2000],
  multiplier2x: [300, 600, 1200, 2500],
};

export const CONSUMABLE_COSTS: Record<keyof ConsumableInventory, number> = {
  hoverboards: 300,
  headstarts: 400,
  scoreBoosters: 350,
  mysteryBoxes: 500,
};

export interface GameStats {
  chaseTimeLeft: number;
  togetherCharge: number;
  district: number;
  districtProgress: number;
  districtChallenge: number;
  districtChallengeDone: boolean;
  feedback: string;
  score: number;
  distance: number;
  coins: number;
  walletCoins: number;
  speed: number;
  bobaTimeLeft: number;
  magnetTimeLeft: number;
  jetpackTimeLeft: number;
  sneakersTimeLeft: number;
  multiplierTimeLeft: number;
  hoverboardTimeLeft: number;
  hoverboardActive: boolean;
  scoreMultiplier: number;
  mysteryBoxesCount: number;
  hoverboardsCount: number;
  headstartsCount: number;
  scoreBoostersCount: number;
  highScore: number;
  guardDistance: number;
  comboCount: number;
  feverCharge: number;
  feverActive: boolean;
  feverTimeLeft: number;
  loveCarTimeLeft: number;
  loveCarActive: boolean;
  duoActive: boolean;
  duoTimeLeft: number;
  mission: ActiveMission;
}

export interface ActiveMission {
  id: string;
  title: string;
  current: number;
  target: number;
  completed: boolean;
  rewardClaimed: boolean;
}

export type GameState = 'menu' | 'intro' | 'playing' | 'paused' | 'caught' | 'gameover';

export class GameEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private trackManager: TrackManager;

  // Characters
  private playerCharacter: AnimatedCharacter | null = null;
  private guardCharacter: AnimatedCharacter | null = null;
  private bulldogCharacter: AnimatedCharacter | null = null;
  public selectedCharacterType: CharacterType = 'bubu';

  // Intro Depot & Graffiti Scene
  private introPlatformGroup: THREE.Group | null = null;
  private sprayCan: THREE.Group | null = null;
  private sprayCanVel = new THREE.Vector3();
  private sprayCanDropped = false;
  private introTimer = 0;
  private introRattleTimer = 0;
  private onIntroComplete?: () => void;

  // Game physics state
  private _gameState: GameState = 'menu';
  public get gameState() { return this._gameState; }
  public set gameState(value: GameState) { this._gameState = value; this.onStateChange?.(value); }
  private onStateChange?: (state: GameState) => void;
  private onCharacterChange?: (type: CharacterType) => void;
  private pursuit = new Pursuit();
  private stumbleTimer = 0;
  private distanceScore = 0;
  private togetherCharge = 30;
  private perfectSwapWindow = 0;
  private swapCooldown = 0;
  private district = 0;
  private districtChallenge = 0;
  private districtChallengeDone = false;
  private feedback = '';
  private feedbackTimer = 0;
  private statsTimer = 0;
  private saveTimer = 0;
  private disposed = false;
  private inputAbort = new AbortController();
  private ambient!: AmbientField;
  private adventure = loadAdventure();
  private frameTime = 0;
  private elapsedTime = 0;
  private accumulator = 0;
  private renderAccumulator = 0;
  private performanceTime = 0;
  private performanceFrames = 0;
  private renderScale = 1.25;
  private _startDistrict = 0;
  public get startDistrict() { return this._startDistrict; }
  public set startDistrict(value: number) {
    this._startDistrict = Math.max(0, Math.min(3, Math.floor(value)));
    if (this.gameState === 'menu') { this.district = this._startDistrict; this.trackManager.setDistrict(this.district); }
  }
  private currentLane: LaneIndex = 1; // 0: Left, 1: Center, 2: Right
  private targetX: number = 0;
  private playerY: number = 0;
  private playerYVelocity: number = 0;
  private isGrounded: boolean = true;
  private isSliding: boolean = false;
  private slideTimer: number = 0;
  private readonly SLIDE_DURATION = 0.85;
  private readonly GRAVITY = -32;
  private readonly JUMP_FORCE = 13.5;
  private jumpBufferTimer: number = 0;
  private coyoteTimer: number = 0;
  private isFastDiving: boolean = false;
  private landingSquashTimer: number = 0;

  // Guard tracking
  private guardZ: number = -4.5;
  private guardTargetZ: number = -4.5;
  private guardX: number = 0;
  private guardStumbleTimer: number = 0;

  // Game progression & powerups
  private baseSpeed = 19;
  private currentSpeed = 19;
  private distance = 0;
  private coins = 0;
  private bobaTimer = 0;
  private magnetTimer = 0;
  private highScore = 0;

  // Wallet, Upgrades & Consumables
  private walletCoins: number = 500;
  private upgrades: PowerUpUpgrades = {
    jetpack: 1,
    magnet: 1,
    sneakers: 1,
    multiplier2x: 1,
  };
  private consumables: ConsumableInventory = {
    hoverboards: 3,
    headstarts: 2,
    scoreBoosters: 2,
    mysteryBoxes: 1,
  };
  public preRunHeadstart = false;
  public preRunScoreBooster = false;
  private mysteryBoxesCollected = 0;
  private baseMultiplier = 1;

  // Active Power-up Timers & Visuals
  private jetpackTimer = 0;
  private isFlyingJetpack = false;
  private jetpackAttachment: THREE.Group | null = null;

  private sneakersTimer = 0;
  private sneakersAttachment: THREE.Group | null = null;

  private multiplier2xTimer = 0;

  private hoverboardActive = false;
  private hoverboardTimer = 0;
  private hoverboardModel: THREE.Group | null = null;

  // Signature Bubu & Dudu Love-Car Overdrive System
  private loveCarActive = false;
  private loveCarTimer = 0;
  private loveCarModel: THREE.Group | null = null;
  private loveCarHonkTimer = 0;

  // Signature Duo Tag-Team / Together System
  public duoActive = false;
  private duoTimer = 0;
  private companionCharacter: AnimatedCharacter | null = null;
  private companionX = 0;
  private companionTargetX = 0;
  private companionY = 0;

  // Boba Pearl Cannon Projectiles
  private bobaShootTimer = 0;
  private bobaPearls: { mesh: THREE.Mesh; z: number; x: number; y: number }[] = [];
  private bobaPearlMat = new THREE.MeshStandardMaterial({ color: 0x241424, roughness: 0.2, metalness: 0.1 });
  private bobaPearlGeo = new THREE.SphereGeometry(0.18, 12, 12);

  // Dynamic Biome Lights
  private sunLight!: THREE.DirectionalLight;
  private frontFillLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;

  private headstartActive = false;
  private headstartTimer = 0;
  private tempInvincibleTimer = 0;
  private startingVoicePlayed = false;

  // Camera dynamics & juice
  private normalCamOffset = new THREE.Vector3(0, 4.8, -6.8);
  private normalCamLookAt = new THREE.Vector3(0, 1.4, 7.0);
  private currentCamPos = new THREE.Vector3(0, 4.8, -6.8);
  private currentCamLookAt = new THREE.Vector3(0, 1.4, 7.0);
  private cameraTrauma = 0;
  private cameraShakeOffset = new THREE.Vector3();
  private cinematicTimer = 0;

  // Sky dome & Clouds
  private skyDome: THREE.Mesh | null = null;
  private cloudsGroup: THREE.Group = new THREE.Group();
  private clouds: { mesh: THREE.Group; speed: number; resetZ: number }[] = [];

  // Particles (dust, sparkles, coin burst)
  private particleGroup = new THREE.Group();
  private particles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = [];

  // Combo & Fever System
  private comboCount = 0;
  private comboTimer = 0;
  private feverCharge = 0; // 0 to 100
  private feverActive = false;
  private feverTimer = 0;
  private readonly FEVER_DURATION = 6.5;

  // Dynamic Drop Shadow
  private playerShadow: THREE.Mesh | null = null;

  // Active In-Run Mission
  private currentMission: ActiveMission = {
    id: 'coins_1',
    title: 'Collect 35 Coins',
    current: 0,
    target: 35,
    completed: false,
    rewardClaimed: false,
  };

  // Animation Loop variables
  private clock = new THREE.Clock();
  private animFrameId: number = 0;
  private onStatsUpdate?: (stats: GameStats) => void;
  private onGameOver?: (finalStats: GameStats) => void;

  constructor(
    container: HTMLElement,
    callbacks?: {
      onStatsUpdate?: (stats: GameStats) => void;
      onGameOver?: (finalStats: GameStats) => void;
      onIntroComplete?: () => void;
      onStateChange?: (state: GameState) => void;
      onCharacterChange?: (type: CharacterType) => void;
    }
  ) {
    this.container = container;
    this.onStatsUpdate = callbacks?.onStatsUpdate;
    this.onGameOver = callbacks?.onGameOver;
    this.onIntroComplete = callbacks?.onIntroComplete;
    this.onStateChange = callbacks?.onStateChange;
    this.onCharacterChange = callbacks?.onCharacterChange;

    // Load persisted high score
    const saved = safeStorage.get('bubududu_high_score');
    if (saved) this.highScore = parseInt(saved, 10) || 0;

    // Load persisted wallet balance
    const savedWallet = safeStorage.get('bubududu_wallet_coins');
    if (savedWallet !== null) {
      this.walletCoins = parseInt(savedWallet, 10) || 0;
    } else {
      this.walletCoins = 500;
      safeStorage.set('bubududu_wallet_coins', '500');
    }

    // Load persisted upgrades
    const savedUpgrades = safeStorage.get('bubududu_upgrades');
    if (savedUpgrades) {
      try {
        this.upgrades = { ...this.upgrades, ...JSON.parse(savedUpgrades) };
      } catch {}
    }

    // Load persisted consumables
    const savedConsumables = safeStorage.get('bubududu_consumables');
    if (savedConsumables) {
      try {
        this.consumables = { ...this.consumables, ...JSON.parse(savedConsumables) };
      } catch {}
    }

    for (const key of Object.keys(this.upgrades) as (keyof PowerUpUpgrades)[]) this.upgrades[key] = finiteNumber(this.upgrades[key], 1, 1, 5);
    for (const key of Object.keys(this.consumables) as (keyof ConsumableInventory)[]) this.consumables[key] = finiteNumber(this.consumables[key], 0);
    this.walletCoins = finiteNumber(this.walletCoins, 500);
    this.highScore = finiteNumber(this.highScore, 0);

    // Preload 3D GLB items and voice audio asynchronously for mobile performance
    glbItemLoader.preloadAll();
    soundManager.preloadVoiceAudio();

    // 1. Scene setup with cinematic atmospheric sky dome & warm peach fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfed7aa); // Warm peach horizon
    this.scene.fog = new THREE.FogExp2(0xfed7aa, 0.0068); // Soft depth haze over 180m

    // 2. Camera setup - responsive to aspect ratio
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 300);
    this.updateCameraForAspect(aspect);

    // 3. Renderer setup with preserveDrawingBuffer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: !isSoftwareGl,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 4. Procedural Vibrant Sky Dome & Low-Poly Clouds
    this.skyDome = this.createSkyDome();
    this.scene.add(this.skyDome);
    this.createClouds();

    // 5. Environment & Lighting
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Warm Sun Key Light with high-res crisp shadows
    this.sunLight = new THREE.DirectionalLight(0xfff6ea, 2.3);
    this.sunLight.position.set(16, 28, -14);
    this.sunLight.castShadow = !isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 80;
    this.sunLight.shadow.camera.left = -14;
    this.sunLight.shadow.camera.right = 14;
    this.sunLight.shadow.camera.top = 22;
    this.sunLight.shadow.camera.bottom = -8;
    this.sunLight.shadow.bias = -0.0004;
    this.scene.add(this.sunLight);

    // Front Warm Fill Light for vibrant cartoon illumination
    this.frontFillLight = new THREE.DirectionalLight(0xfff8f0, 1.3);
    this.frontFillLight.position.set(-4, 14, 18);
    this.scene.add(this.frontFillLight);

    // Cool Sky & Ground Hemisphere Light
    this.hemiLight = new THREE.HemisphereLight(0xffe8ed, 0x98b9cb, 1.4);
    this.hemiLight.position.set(0, 30, 0);
    this.scene.add(this.hemiLight);

    // 6. Track Manager
    this.trackManager = new TrackManager(this.scene);
    this.scene.add(this.particleGroup);
    this.ambient = new AmbientField(this.scene);
    this.applyQuality();
    this.trackManager.setDistrict(0);

    // 7. Spawn Characters
    this.setPlayerCharacter(this.selectedCharacterType);
    this.guardCharacter = createGuardModel();
    this.guardCharacter.group.position.set(0, 0, this.guardZ);
    this.scene.add(this.guardCharacter.group);

    this.bulldogCharacter = createBulldogModel();
    this.bulldogCharacter.group.position.set(-0.72, 0, this.guardZ + 0.35);
    this.scene.add(this.bulldogCharacter.group);

    // 8. Dynamic Ground Drop Shadow (gives perfect depth & landing precision)
    const shadowGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(0, 0.02, 0);
    this.scene.add(this.playerShadow);

    // 9. Setup Event Listeners & Resize
    this.setupInputs();
    window.addEventListener('resize', this.onWindowResize);

    // Pre-warm shaders
    if (!isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Start loop
    this.clock.start();
    this.tick();
  }

  public setPlayerCharacter(type: CharacterType) {
    this.selectedCharacterType = type;
    const currentX = this.playerCharacter ? this.playerCharacter.group.position.x : this.targetX;
    const currentY = this.playerY;
    if (this.playerCharacter) {
      this.scene.remove(this.playerCharacter.group);
    }
    this.playerCharacter = type === 'bubu' ? createBubuModel() : createDuduModel();
    this.playerCharacter.group.position.set(currentX, currentY, 0);
    this.applyOutfit();
    this.onCharacterChange?.(type);
    this.scene.add(this.playerCharacter.group);
  }

  public switchDuoCharacter(): CharacterType {
    if (this.gameState !== 'playing' || this.swapCooldown > 0) return this.selectedCharacterType;
    this.swapCooldown = .55;
    if (this.perfectSwapWindow > 0) {
      this.togetherCharge = Math.min(100, this.togetherCharge + 25);
      this.tempInvincibleTimer = Math.max(this.tempInvincibleTimer, .6);
      this.perfectSwapWindow = 0;
      this.say('PERFECT TAG · +25 Together');
      soundManager.playDuoSpark();
    }
    const nextType: CharacterType = this.selectedCharacterType === 'bubu' ? 'dudu' : 'bubu';
    this.setPlayerCharacter(nextType);

    // Reattach any active power-up attachments to new character model
    if (this.hoverboardActive) {
      this.hoverboardModel = null;
      this.attachHoverboard();
    }
    if (this.isFlyingJetpack) {
      this.jetpackAttachment = null;
      this.attachJetpack();
    }
    if (this.sneakersTimer > 0) {
      this.sneakersAttachment = null;
      this.attachSneakers();
    }
    if (this.loveCarActive) {
      this.loveCarModel = null;
      this.attachLoveCar();
    }

    if (this.duoActive) {
      if (this.companionCharacter) this.scene.remove(this.companionCharacter.group);
      this.companionCharacter = nextType === 'bubu' ? createDuduModel() : createBubuModel();
      this.scene.add(this.companionCharacter.group);
    }
    soundManager.playSwitchDuo();
    soundManager.playCharacterStartVoice(nextType);
    if (this.playerCharacter) {
      this.spawnHeartBurst(new THREE.Vector3(this.playerCharacter.group.position.x, this.playerY + 0.8, 0));
    }
    return nextType;
  }

  // --- Input Handling (Keyboard & Touch Gestures) ---
  private setupInputs() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest('button, input, select, textarea, [role="dialog"]')) return;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && (this.gameState === 'playing' || this.gameState === 'paused')) {
        this.togglePause(); return;
      }
      if (this.gameState === 'intro') {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
          this.skipIntro();
        }
        return;
      }

      if (this.gameState !== 'playing') {
        if ((e.code === 'Space' || e.code === 'Enter') && (this.gameState === 'menu' || this.gameState === 'gameover')) {
          this.startGame();
        }
        return;
      }

      if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.shiftLane(-1);
      } else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.shiftLane(1);
      } else if (e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        this.jump();
      } else if (e.code === 'Space') {
        if (this.isGrounded) {
          this.jump();
        } else {
          this.activateHoverboard();
        }
      } else if (e.code === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        this.slide();
      } else if (e.code === 'KeyB' || e.code === 'KeyH') {
        this.activateHoverboard();
      } else if (e.code === 'KeyT' || e.code === 'KeyV') {
        this.activateDuoMode();
      } else if (e.code === 'KeyC') {
        this.switchDuoCharacter();
      } else if (e.code === 'Escape' || e.key === 'p' || e.key === 'P') {
        this.togglePause();
      }
    }, { signal: this.inputAbort.signal });

    document.addEventListener('visibilitychange', () => { if (document.hidden && this.gameState === 'playing') this.togglePause(); }, { signal: this.inputAbort.signal });
    window.addEventListener('pagehide', () => this.persist(), { signal: this.inputAbort.signal });

    // Double click to activate hoverboard on desktop
    this.container.addEventListener('dblclick', () => {
      if (this.gameState === 'playing') {
        this.activateHoverboard();
      }
    }, { signal: this.inputAbort.signal });

    // Touch Swipe Gestures & Double-Tap detection
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let lastTapTime = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();

        // Double-tap to activate hoverboard!
        const now = Date.now();
        if (now - lastTapTime < 320) {
          if (this.gameState === 'playing') {
            this.activateHoverboard();
          }
        }
        lastTapTime = now;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length === 0) return;
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const dt = Date.now() - touchStartTime;

      if (this.gameState !== 'playing') return;

      const minSwipeDist = 25;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        if (Math.abs(dx) > minSwipeDist) {
          if (dx < 0) this.shiftLane(-1);
          else this.shiftLane(1);
        }
      } else {
        // Vertical swipe
        if (Math.abs(dy) > minSwipeDist) {
          if (dy < 0) this.jump();
          else this.slide();
        }
      }
    };

    this.container.addEventListener('touchstart', onTouchStart, { passive: true, signal: this.inputAbort.signal });
    this.container.addEventListener('touchend', onTouchEnd, { passive: true, signal: this.inputAbort.signal });
  }

  public shiftLane(direction: -1 | 1) {
    if (this.gameState !== 'playing') return;

    if (direction === -1 && this.currentLane > 0) {
      // Shift Left: Lane 0 is X = +2.2 (Screen Left)
      this.currentLane = (this.currentLane - 1) as LaneIndex;
      this.targetX = LANES[this.currentLane];
      this.playerCharacter?.setTilt(0.28);
      this.spawnSlideDust();
    } else if (direction === 1 && this.currentLane < 2) {
      // Shift Right: Lane 2 is X = -2.2 (Screen Right)
      this.currentLane = (this.currentLane + 1) as LaneIndex;
      this.targetX = LANES[this.currentLane];
      this.playerCharacter?.setTilt(-0.28);
      this.spawnSlideDust();
    }
  }

  public jump() {
    if (this.gameState !== 'playing') return;

    if (this.isGrounded || this.coyoteTimer > 0) {
      this.executeJump();
    } else {
      // Buffer jump for up to 160ms so player can queue jump just before touching ground!
      this.jumpBufferTimer = 0.16;
    }
  }

  private executeJump() {
    this.isGrounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.isFastDiving = false;
    const baseJump = this.selectedCharacterType === 'dudu' ? 14.8 : this.JUMP_FORCE;
    const jumpForce = this.sneakersTimer > 0 ? 20.5 : baseJump;
    this.playerYVelocity = jumpForce;
    this.isSliding = false;
    if (this.sneakersTimer > 0) {
      soundManager.playSpringBoing();
    } else {
      soundManager.playJump();
    }
    this.spawnSlideDust();
  }

  public slide() {
    if (this.gameState !== 'playing') return;

    if (!this.isGrounded) {
      // Aerodynamic in-air supersonic fast-fall dive!
      this.playerYVelocity = -28.0;
      this.isFastDiving = true;
      soundManager.playAirDive();
      if (this.playerCharacter) {
        this.spawnBurstParticles(
          new THREE.Vector3(this.playerCharacter.group.position.x, this.playerY + 0.3, 0),
          0xffffff,
          6
        );
      }
    } else {
      soundManager.playSlide();
      this.spawnSlideDust();
    }
    this.isSliding = true;
    this.slideTimer = this.SLIDE_DURATION;
  }

  public startGame() {
    this.startIntro();
  }

  // --- Subway Surfers Opening Graffiti Cinematic Sequence ---
  public startIntro() {
    this.persist();
    this.removeAttachments();
    this.gameState = 'intro';
    if (this.guardCharacter) this.guardCharacter.group.visible = true;
    if (this.bulldogCharacter) this.bulldogCharacter.group.visible = true;
    this.introTimer = 0;
    this.introRattleTimer = 0;
    this.sprayCanDropped = false;
    this.startingVoicePlayed = false;
    this.currentLane = 1;
    this.targetX = 0;
    this.playerY = 0;
    this.playerYVelocity = 0;
    this.distance = 0;
    this.coins = 0;
    this.bobaTimer = 0;
    this.magnetTimer = 0;
    this.currentSpeed = this.baseSpeed;

    this.trackManager.reset();
    soundManager.stopBGM();

    // 1. Create or ensure Intro Platform & Graffiti Car
    if (!this.introPlatformGroup) {
      this.introPlatformGroup = this.createIntroDepotPlatform();
    }
    this.scene.add(this.introPlatformGroup);

    // 2. Create spray can
    if (!this.sprayCan) {
      this.sprayCan = createSprayCanModel();
    }
    this.scene.add(this.sprayCan);

    // 3. Position Player Character on concrete platform facing the graffiti car
    // Platform is at X = 1.4, Y = 0.45. Player stands on platform facing +X towards subway car
    if (this.playerCharacter) {
      this.playerCharacter.group.position.set(1.4, 0.45, 0);
      this.playerCharacter.group.rotation.set(0, Math.PI / 2, 0);
      this.playerCharacter.updateAnimation('paint', 0, 0);
    }

    // Attach spray can high up at right hand (hand is at X=1.92, Y=1.28, Z=0.08)
    this.sprayCan.position.set(1.92, 1.28, 0.08);
    this.sprayCan.rotation.set(0.15, 0, -0.32);

    // 4. Position Guard & Bulldog further back down the line (Z = -9.0)
    if (this.guardCharacter) {
      this.guardCharacter.group.position.set(1.3, 0.45, -9.0);
      this.guardCharacter.group.rotation.set(0, 0, 0);
      this.guardCharacter.resetAnimation();
    }
    if (this.bulldogCharacter) {
      this.bulldogCharacter.group.position.set(0.65, 0.45, -8.6);
      this.bulldogCharacter.group.rotation.set(0, 0, 0);
      this.bulldogCharacter.resetAnimation();
    }

    // 5. Cinematic morning sunlight camera framing Bubu/Dudu painting
    const isPortrait = this.camera.aspect < 1.0;
    if (isPortrait) {
      this.camera.position.set(-1.8, 1.9, 4.2);
      this.camera.lookAt(2.1, 1.1, 0.0);
    } else {
      this.camera.position.set(-0.8, 1.5, 3.2);
      this.camera.lookAt(2.0, 1.1, 0.1);
    }
  }

  public skipIntro() {
    if (this.gameState === 'intro') {
      this.finishIntroAndStartPlaying();
    }
  }

  private finishIntroAndStartPlaying() {
    if (this.introPlatformGroup) {
      this.scene.remove(this.introPlatformGroup);
    }
    if (this.sprayCan) {
      this.scene.remove(this.sprayCan);
    }

    this.gameState = 'playing';
    this.pursuit.reset(); this.stumbleTimer = 0; this.distanceScore = 0;
    this.togetherCharge = 30; this.perfectSwapWindow = 0; this.swapCooldown = 0;
    this.district = this.startDistrict; this.districtChallenge = 0; this.districtChallengeDone = false;
    this.trackManager.setDistrict(this.district);
    this.visitDistrict();
    this.say(DISTRICTS[this.district].name + ' · Run free');
    this.guardCharacter!.group.visible = false; this.bulldogCharacter!.group.visible = false;
    this.trackManager.reset();
    this.currentLane = 1;
    this.targetX = 0;
    this.playerY = 0;
    this.playerYVelocity = 0;
    this.isGrounded = true;
    this.isSliding = false;
    this.slideTimer = 0;
    this.distance = 0;
    this.coins = 0;
    this.bobaTimer = 0;
    this.magnetTimer = 0;
    this.jetpackTimer = 0;
    this.isFlyingJetpack = false;
    this.sneakersTimer = 0;
    this.multiplier2xTimer = 0;
    this.hoverboardActive = false;
    this.hoverboardTimer = 0;
    this.loveCarActive = false;
    this.loveCarTimer = 0;
    this.headstartActive = false;
    this.headstartTimer = 0;
    this.tempInvincibleTimer = 0;
    this.mysteryBoxesCollected = 0;
    this.removeAttachments();

    // Reset Combo & Fever Mechanics
    this.comboCount = 0;
    this.comboTimer = 0;
    this.feverCharge = 0;
    this.feverActive = false;
    this.feverTimer = 0;

    // Randomize a fresh active in-run mission
    const missionOptions: ActiveMission[] = [
      { id: 'coins_1', title: 'Collect 35 Coins', current: 0, target: 35, completed: false, rewardClaimed: false },
      { id: 'jumps_1', title: 'Leap over 4 Obstacles', current: 0, target: 4, completed: false, rewardClaimed: false },
      { id: 'fever_1', title: 'Ignite Fever Mode', current: 0, target: 1, completed: false, rewardClaimed: false },
      { id: 'distance_1', title: 'Sprint 350m', current: 0, target: 350, completed: false, rewardClaimed: false },
    ];
    this.currentMission = missionOptions[Math.floor(Math.random() * missionOptions.length)];

    // Consume pre-run boosters if selected
    if (this.preRunScoreBooster && this.consumables.scoreBoosters > 0) {
      this.consumables.scoreBoosters--;
      this.saveConsumables();
      this.baseMultiplier = 4; // +3X Booster active for the whole run!
    } else {
      this.baseMultiplier = 1;
    }

    if (this.preRunHeadstart && this.consumables.headstarts > 0) {
      this.consumables.headstarts--;
      this.saveConsumables();
      this.startHeadstart();
    } else {
      this.currentSpeed = this.baseSpeed;
      soundManager.startBGM();
    }

    if (!this.startingVoicePlayed) {
      this.startingVoicePlayed = true;
      soundManager.playCharacterStartVoice(this.selectedCharacterType);
    }

    this.guardZ = -12;
    this.guardTargetZ = -12;
    this.guardX = 0;
    this.guardStumbleTimer = 0;
    this.cinematicTimer = 0;

    this.playerCharacter?.resetAnimation();
    this.guardCharacter?.resetAnimation();
    this.bulldogCharacter?.resetAnimation();

    if (this.playerCharacter) {
      this.playerCharacter.group.position.set(0, 0, 0);
      this.playerCharacter.group.rotation.set(0, 0, 0);
    }
    if (this.guardCharacter) {
      this.guardCharacter.group.position.set(0, 0, this.guardZ);
      this.guardCharacter.group.rotation.set(0, 0, 0);
    }
    if (this.bulldogCharacter) {
      this.bulldogCharacter.group.position.set(-0.72, 0, this.guardZ + 0.35);
      this.bulldogCharacter.group.rotation.set(0, 0, 0);
    }

    this.currentCamPos.copy(this.normalCamOffset);
    this.currentCamLookAt.copy(this.normalCamLookAt);
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentCamLookAt);

    if (this.onIntroComplete) {
      this.onIntroComplete();
    }
  }

  // Pre-Run Headstart Supersonic flight
  private startHeadstart() {
    this.headstartActive = true;
    this.headstartTimer = 5.0;
    this.currentSpeed = 70;
    this.isFlyingJetpack = true;
    this.playerY = 5.8;
    this.attachJetpack();
    soundManager.playHeadstartRocket();
    soundManager.startJetpackLoop();
    this.trackManager.spawnSkyCoinCluster(20, 16);
  }

  // Attachments Management
  private attachJetpack() {
    if (!this.playerCharacter || this.jetpackAttachment) return;
    this.jetpackAttachment = glbItemLoader.createJetpack(true);
    this.jetpackAttachment.position.set(0, 0.65, -0.32);
    this.playerCharacter.group.add(this.jetpackAttachment);
  }

  private removeJetpack() {
    if (this.jetpackAttachment && this.playerCharacter) {
      this.playerCharacter.group.remove(this.jetpackAttachment);
      this.jetpackAttachment = null;
    }
  }

  private attachSneakers() {
    if (!this.playerCharacter || this.sneakersAttachment) return;
    this.sneakersAttachment = glbItemLoader.createSneakers(true);
    this.sneakersAttachment.position.set(0, 0.05, 0.02);
    this.playerCharacter.group.add(this.sneakersAttachment);
  }

  private removeSneakers() {
    if (this.sneakersAttachment && this.playerCharacter) {
      this.playerCharacter.group.remove(this.sneakersAttachment);
      this.sneakersAttachment = null;
    }
  }

  public activateHoverboard(): boolean {
    if (this.gameState !== 'playing') return false;
    if (this.hoverboardActive) return false;
    if (this.consumables.hoverboards <= 0) return false;

    this.consumables.hoverboards--;
    this.saveConsumables();
    this.hoverboardActive = true;
    this.hoverboardTimer = 30.0;
    this.attachHoverboard();
    soundManager.playHoverboardOn();
    if (this.playerCharacter) {
      this.spawnBurstParticles(this.playerCharacter.group.position, 0x00f5d4, 25);
    }
    return true;
  }

  private attachHoverboard() {
    if (!this.playerCharacter || this.hoverboardModel) return;
    this.hoverboardModel = glbItemLoader.createSkateboardModel();
    this.hoverboardModel.position.set(0, 0.02, 0.0);
    this.playerCharacter.group.add(this.hoverboardModel);
  }

  private removeHoverboard() {
    if (this.hoverboardModel && this.playerCharacter) {
      this.playerCharacter.group.remove(this.hoverboardModel);
      this.hoverboardModel = null;
    }
  }

  public activateLoveCar() {
    if (this.gameState !== 'playing') return;
    this.loveCarActive = true;
    this.loveCarTimer = 12.0;
    this.loveCarHonkTimer = 0;
    this.attachLoveCar();
    soundManager.playCarHorn();
    if (this.playerCharacter) {
      this.spawnHeartBurst(this.playerCharacter.group.position);
    }
  }

  private attachLoveCar() {
    if (!this.playerCharacter || this.loveCarModel) return;
    this.loveCarModel = glbItemLoader.createBubuDuduCarModel();
    this.loveCarModel.position.set(0, 0.04, 0.12);
    this.playerCharacter.group.add(this.loveCarModel);
  }

  private removeLoveCar() {
    if (this.loveCarModel && this.playerCharacter) {
      this.playerCharacter.group.remove(this.loveCarModel);
      this.loveCarModel = null;
    }
  }

  public activateDuoMode(duration = 15.0, pickup = false) {
    if (this.gameState !== 'playing' || this.duoActive) return;
    if (!pickup && this.togetherCharge < 100) { this.say('Build Together with coins, dodges & perfect tags'); return; }
    this.togetherCharge = 0;
    this.say('BETTER TOGETHER · Partner ready');
    this.duoActive = true;
    this.duoTimer = duration;

    // Remove existing companion if any
    if (this.companionCharacter) {
      this.scene.remove(this.companionCharacter.group);
      this.companionCharacter = null;
    }

    // Companion is the OTHER character
    const partnerType = this.selectedCharacterType === 'bubu' ? 'dudu' : 'bubu';
    this.companionCharacter = partnerType === 'bubu' ? createBubuModel() : createDuduModel();

    // Position in adjacent lane
    const partnerLane = this.currentLane === 0 ? 1 : (this.currentLane === 2 ? 1 : 0);
    this.companionTargetX = LANES[partnerLane];
    this.companionX = this.companionTargetX;
    this.companionY = this.playerY;
    this.companionCharacter.group.position.set(this.companionX, this.companionY, 0.0);
    this.scene.add(this.companionCharacter.group);

    // Audio & Particles
    soundManager.playCharacterStartVoice(partnerType);
    soundManager.playDuoSpark();
    if (this.playerCharacter) {
      this.spawnHeartBurst(this.playerCharacter.group.position);
    }
  }

  public deactivateDuoMode() {
    this.duoActive = false;
    this.duoTimer = 0;
    if (this.companionCharacter) {
      this.spawnBurstParticles(this.companionCharacter.group.position, 0xff69b4, 25);
      this.scene.remove(this.companionCharacter.group);
      this.companionCharacter = null;
    }
  }

  private removeAttachments() {
    this.removeJetpack();
    this.removeSneakers();
    this.removeHoverboard();
    this.removeLoveCar();
    this.deactivateDuoMode();
    this.bobaPearls.forEach((p) => this.scene.remove(p.mesh));
    this.bobaPearls = [];
  }

  private createIntroDepotPlatform(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'IntroDepotPlatform';

    // 1. Concrete Railway Platform
    const platformGeo = new THREE.BoxGeometry(2.4, 0.45, 22);
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x828a96, roughness: 0.9 });
    const platformMesh = new THREE.Mesh(platformGeo, concreteMat);
    platformMesh.position.set(1.5, 0.225, 0);
    platformMesh.receiveShadow = true;
    group.add(platformMesh);

    // Yellow warning safety edge line along track
    const edgeGeo = new THREE.BoxGeometry(0.14, 0.02, 22);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    edgeMesh.position.set(0.35, 0.46, 0);
    group.add(edgeMesh);

    // 2. Parked Rusted Subway Car
    const carGeo = new THREE.BoxGeometry(1.7, 2.3, 16);
    const rustMat = new THREE.MeshStandardMaterial({
      color: 0x516170,
      metalness: 0.3,
      roughness: 0.7,
    });
    const carBody = new THREE.Mesh(carGeo, rustMat);
    carBody.position.set(3.4, 1.15, 0);
    carBody.castShadow = true;
    group.add(carBody);

    const roofGeo = new THREE.CylinderGeometry(0.85, 0.85, 16, 16, 1, false, 0, Math.PI);
    roofGeo.rotateZ(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, rustMat);
    roof.position.set(3.4, 2.3, 0);
    group.add(roof);

    // 3. Vibrant Colorful Graffiti Canvas Decal on subway car side
    const graffitiCanvas = document.createElement('canvas');
    graffitiCanvas.width = 1024;
    graffitiCanvas.height = 384;
    const gctx = graffitiCanvas.getContext('2d')!;

    // Weathered metal background
    gctx.fillStyle = '#455361';
    gctx.fillRect(0, 0, 1024, 384);

    // Panel seams
    gctx.strokeStyle = '#2d3742';
    gctx.lineWidth = 4;
    gctx.strokeRect(4, 4, 1016, 376);
    for (let x = 256; x < 1024; x += 256) {
      gctx.beginPath();
      gctx.moveTo(x, 0);
      gctx.lineTo(x, 384);
      gctx.stroke();
    }

    // Paint splashes & splatters
    const splashColors = ['#ff007f', '#00f5d4', '#fee440', '#9d4edd', '#ff5400'];
    for (let i = 0; i < 45; i++) {
      gctx.fillStyle = splashColors[i % splashColors.length];
      const sx = 80 + Math.random() * 864;
      const sy = 40 + Math.random() * 280;
      const sr = 6 + Math.random() * 18;
      gctx.beginPath();
      gctx.arc(sx, sy, sr, 0, Math.PI * 2);
      gctx.fill();

      // Drip
      if (Math.random() > 0.4) {
        gctx.beginPath();
        gctx.moveTo(sx - sr * 0.4, sy);
        gctx.lineTo(sx, sy + sr * 2.5 + Math.random() * 20);
        gctx.lineTo(sx + sr * 0.4, sy);
        gctx.fill();
      }
    }

    // Bold Bubble Graffiti: "BUBU & DUDU"
    gctx.save();
    gctx.font = '900 88px "Fredoka", "Arial Black", sans-serif';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'middle';

    // 3D Drop shadow
    gctx.fillStyle = '#111111';
    for (let off = 10; off >= 1; off--) {
      gctx.fillText('BUBU & DUDU', 512 + off, 190 + off);
    }

    // Bold black outline
    gctx.strokeStyle = '#1a0c06';
    gctx.lineWidth = 20;
    gctx.lineJoin = 'round';
    gctx.strokeText('BUBU & DUDU', 512, 190);

    // Neon Gradient Fill
    const grad = gctx.createLinearGradient(150, 100, 874, 260);
    grad.addColorStop(0.0, '#ff007f');
    grad.addColorStop(0.3, '#ff5400');
    grad.addColorStop(0.6, '#fee440');
    grad.addColorStop(1.0, '#00f5d4');
    gctx.fillStyle = grad;
    gctx.fillText('BUBU & DUDU', 512, 190);

    // Glossy highlights
    gctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    gctx.font = '900 84px "Fredoka", "Arial Black", sans-serif';
    gctx.fillText('BUBU & DUDU', 508, 184);

    // Hearts & Stars
    gctx.fillStyle = '#ff007f';
    gctx.beginPath();
    gctx.arc(140, 120, 24, 0, Math.PI * 2);
    gctx.fill();
    gctx.beginPath();
    gctx.arc(884, 120, 24, 0, Math.PI * 2);
    gctx.fill();

    gctx.restore();

    const graffitiTexture = new THREE.CanvasTexture(graffitiCanvas);
    graffitiTexture.colorSpace = THREE.SRGBColorSpace;

    const decalGeo = new THREE.PlaneGeometry(7.2, 2.0);
    const decalMat = new THREE.MeshStandardMaterial({
      map: graffitiTexture,
      roughness: 0.5,
      metalness: 0.1,
    });
    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
    decalMesh.position.set(2.54, 1.25, 0);
    decalMesh.rotation.y = -Math.PI / 2;
    group.add(decalMesh);

    return group;
  }

  private spawnSprayMist(pos: THREE.Vector3, vel: THREE.Vector3) {
    const colors = [0xff007f, 0x00f5d4, 0xfee440, 0x9d4edd];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const geo = new THREE.SphereGeometry(0.045, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.particleGroup.add(mesh);

    this.particles.push({
      mesh,
      vel: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)),
      life: 0,
      maxLife: 0.3,
    });
  }

  private afterDraw(cb: () => void) {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        this.animFrameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.animFrameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.animFrameId = window.setTimeout(cb, 80);
        }
      };
      this.animFrameId = window.setTimeout(poll, 5);
    } catch {
      this.animFrameId = window.setTimeout(cb, 80);
    }
  }

  // --- Main Tick Game Loop ---
  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = this.frameTime ? Math.min((now - this.frameTime) / 1000, .1) : 1 / 60;
    this.frameTime = now; this.elapsedTime += rawDt; this.accumulator += rawDt;
    this.performanceTime += rawDt; this.performanceFrames++;
    if (this.performanceTime >= 3 && this.adventure.quality === 'auto') {
      const fps = this.performanceFrames / this.performanceTime;
      const next = THREE.MathUtils.clamp(this.renderScale + (fps < 45 ? -.15 : fps > 57 ? .05 : 0), .75, 1.5);
      if (Math.abs(next - this.renderScale) > .01) { this.renderScale = next; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, next)); }
      this.performanceTime = 0; this.performanceFrames = 0;
    }
    while (this.accumulator >= 1 / 60) {
      const dt = 1 / 60; this.accumulator -= dt;
      if (this.gameState === 'intro') this.updateIntro(dt);
      else if (this.gameState === 'playing') this.updatePlaying(dt);
      else if (this.gameState === 'caught') this.updateCaughtCinematic(dt);
      else if (this.gameState === 'menu') this.updateMenuAnimation(dt);
      if (this.gameState !== 'paused') {
        this.updateParticles(dt); this.updateClouds(dt);
        this.ambient.update(dt, this.gameState === 'playing' ? this.currentSpeed : 2, this.district, this.adventure.reducedMotion || this.adventure.quality === 'low');
      }
    }
    this.renderAccumulator += rawDt;
    if (this.adventure.quality !== 'low' || this.renderAccumulator >= 1 / 30) {
      this.renderer.render(this.scene, this.camera); this.renderAccumulator = 0;
    }
    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private updateIntro(dt: number) {
    this.introTimer += dt;
    const t = this.introTimer;

    // --- PHASE 1: Spraying the Subway Car (0.0s to 1.8s) ---
    // Morning sun cuts through depot air; character standing on concrete platform shaking spray can
    if (t < 1.8) {
      const armShake = Math.sin(t * 22) * 0.06;

      if (this.playerCharacter) {
        this.playerCharacter.group.position.set(1.4, 0.45, 0);
        this.playerCharacter.group.rotation.set(0, Math.PI / 2, 0);
        this.playerCharacter.updateAnimation('paint', dt, 0);
      }

      if (this.sprayCan && !this.sprayCanDropped) {
        this.sprayCan.position.set(1.92, 1.28 + armShake, 0.08);
        this.sprayCan.rotation.set(0.15, 0, -0.32 + armShake * 0.4);
      }

      // Audio: rattle of spray can marble + aerosol hiss
      this.introRattleTimer += dt;
      if (this.introRattleTimer > 0.32) {
        this.introRattleTimer = 0;
        soundManager.playSprayRattle();
        if (Math.random() > 0.3) {
          soundManager.playSprayHiss();
        }
      }

      // Vibrant splashes of spray paint emitting from top nozzle towards subway car graffiti!
      if (Math.random() > 0.15) {
        this.spawnSprayMist(
          new THREE.Vector3(1.96, 1.36 + armShake, 0.08),
          new THREE.Vector3(2.2 + Math.random() * 0.8, (Math.random() - 0.2) * 0.6, (Math.random() - 0.5) * 0.5)
        );
      }

      // Slow cinematic camera dolly in morning sunlight framing depot platform, subway car & character
      const isPortrait = this.camera.aspect < 1.0;
      if (isPortrait) {
        this.camera.position.set(-1.8 + t * 0.08, 1.9 + t * 0.04, 4.2 - t * 0.06);
        this.camera.lookAt(2.1, 1.1, 0.0);
      } else {
        this.camera.position.set(-0.8 + t * 0.08, 1.5 + t * 0.04, 3.2 - t * 0.06);
        this.camera.lookAt(2.0, 1.1, 0.1);
      }
    }

    // --- PHASE 2: Piercing Whistle & Panic Jump & Dropping Spray Can (1.8s to 2.5s) ---
    else if (t >= 1.8 && t < 2.5) {
      const pTime = t - 1.8;

      // Startle event triggered at 1.8s
      if (!this.sprayCanDropped) {
        this.sprayCanDropped = true;
        soundManager.playWhistle();
        soundManager.playCanClatter();
        this.playerCharacter?.faceTexture?.setExpression('caught');
        this.sprayCanVel.set(-0.8, 2.2, -0.5);
      }

      // Spray can drops with metallic clatter onto concrete platform
      if (this.sprayCan) {
        this.sprayCanVel.y -= 22 * dt;
        this.sprayCan.position.addScaledVector(this.sprayCanVel, dt);
        this.sprayCan.rotation.x += dt * 9;
        this.sprayCan.rotation.z += dt * 7;
        if (this.sprayCan.position.y <= 0.52) {
          this.sprayCan.position.y = 0.52;
          this.sprayCanVel.y = -this.sprayCanVel.y * 0.35;
          this.sprayCanVel.x *= 0.6;
          this.sprayCanVel.z *= 0.6;
        }
      }

      // Character jumps in sheer panic
      const jumpProgress = pTime / 0.7;
      const jumpY = Math.sin(jumpProgress * Math.PI) * 0.42;
      if (this.playerCharacter) {
        this.playerCharacter.group.position.set(1.4, 0.45 + jumpY, 0);
        this.playerCharacter.updateAnimation('jump', dt, 0);
        // Whipping around to look back!
        const rotY = Math.PI / 2 + Math.min(pTime * 3.6, 1.0) * Math.PI;
        this.playerCharacter.group.rotation.set(0, rotY, 0);
      }

      // Camera pulls out dramatically framing the startle jump
      const isPortrait = this.camera.aspect < 1.0;
      if (isPortrait) {
        this.camera.position.lerp(new THREE.Vector3(-2.2, 2.2, 3.8), dt * 4.5);
        this.camera.lookAt(1.5, 1.0, -1.0);
      } else {
        this.camera.position.lerp(new THREE.Vector3(-1.2, 1.9, 2.8), dt * 4.5);
        this.camera.lookAt(1.4, 1.05, -0.5);
      }
    }

    // --- PHASE 3: Inspector and Bulldog Charging (2.5s to 3.4s) ---
    else if (t >= 2.5 && t < 3.4) {
      const cTime = t - 2.5;
      const chargeProgress = cTime / 0.9;
      const curZ = THREE.MathUtils.lerp(-9.0, -2.4, chargeProgress);

      // Guard running furious with flailing arms
      if (this.guardCharacter) {
        this.guardCharacter.group.position.set(1.3, 0.45, curZ);
        this.guardCharacter.updateAnimation('run', dt, 32);
      }
      // Bulldog running furiously alongside
      if (this.bulldogCharacter) {
        this.bulldogCharacter.group.position.set(0.65, 0.45, curZ + 0.4);
        this.bulldogCharacter.updateAnimation('run', dt, 34);
      }

      // Audio alerts
      if (cTime > 0.15 && cTime < 0.20) {
        soundManager.playDogBark();
      }
      if (cTime > 0.45 && cTime < 0.50) {
        soundManager.playWhistle();
      }

      // Character frozen/trembling facing them in shock
      if (this.playerCharacter) {
        this.playerCharacter.group.position.set(1.4 + (Math.random() - 0.5) * 0.03, 0.45, 0);
        this.playerCharacter.group.rotation.set(0, -Math.PI / 2, 0); // facing -Z
        this.playerCharacter.faceTexture?.setExpression('caught');
      }

      const isPortrait = this.camera.aspect < 1.0;
      if (isPortrait) {
        this.camera.position.lerp(new THREE.Vector3(-2.4, 2.3, 2.2), dt * 5.0);
        this.camera.lookAt(1.4, 1.0, -1.8);
      } else {
        this.camera.position.lerp(new THREE.Vector3(-1.4, 2.0, 1.8), dt * 5.0);
        this.camera.lookAt(1.35, 1.05, -1.5);
      }
    }

    // --- PHASE 4: Leaping off Platform onto Tracks & High-Speed Dash (3.4s to 4.3s) ---
    else if (t >= 3.4 && t < 4.3) {
      const lTime = t - 3.4;
      const leapProgress = Math.min(lTime / 0.85, 1.0);

      if (!this.startingVoicePlayed) {
        this.startingVoicePlayed = true;
        soundManager.playCharacterStartVoice(this.selectedCharacterType);
      }

      // Leaping off platform onto center rails (X: 1.4 -> 0.0, Y: 0.45 -> 0.0, Z: 0.0 -> 1.8)
      const arcY = Math.sin(leapProgress * Math.PI) * 0.65;
      const curX = THREE.MathUtils.lerp(1.4, 0.0, leapProgress);
      const curY = THREE.MathUtils.lerp(0.45, 0.0, leapProgress) + (leapProgress < 1 ? arcY : 0);
      const curZ = THREE.MathUtils.lerp(0.0, 1.8, leapProgress);

      if (this.playerCharacter) {
        this.playerCharacter.group.position.set(curX, curY, curZ);
        this.playerCharacter.group.rotation.set(0, 0, 0); // facing +Z running forward!
        if (leapProgress < 0.75) {
          this.playerCharacter.updateAnimation('jump', dt, 24);
        } else {
          this.playerCharacter.updateAnimation('run', dt, 26);
        }
      }

      // Landing dust puff
      if (leapProgress > 0.72 && leapProgress < 0.80) {
        this.spawnSlideDust();
      }

      // Guard and Bulldog jumping down onto tracks to give chase!
      if (this.guardCharacter) {
        const gX = THREE.MathUtils.lerp(1.3, 0.0, leapProgress);
        const gY = THREE.MathUtils.lerp(0.45, 0.0, leapProgress);
        const gZ = THREE.MathUtils.lerp(-2.4, -4.5, leapProgress);
        this.guardCharacter.group.position.set(gX, gY, gZ);
        this.guardCharacter.group.rotation.set(0, 0, 0);
        this.guardCharacter.updateAnimation('run', dt, 26);
      }
      if (this.bulldogCharacter) {
        const dX = THREE.MathUtils.lerp(0.65, -0.72, leapProgress);
        const dY = THREE.MathUtils.lerp(0.45, 0.0, leapProgress);
        const dZ = THREE.MathUtils.lerp(-2.0, -4.1, leapProgress);
        this.bulldogCharacter.group.position.set(dX, dY, dZ);
        this.bulldogCharacter.group.rotation.set(0, 0, 0);
        this.bulldogCharacter.updateAnimation('run', dt, 28);
      }

      // Camera swoops smoothly into normal runner view
      this.currentCamPos.lerp(this.normalCamOffset, dt * 4.8);
      this.currentCamLookAt.lerp(this.normalCamLookAt, dt * 4.8);
      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLookAt);
    }

    // --- PHASE 5: Chase Officially Begins ---
    else {
      this.finishIntroAndStartPlaying();
    }
  }

  private updateMenuAnimation(dt: number) {
    this.updateAtmosphere(dt);
    const time = this.elapsedTime;
    const isPortrait = this.camera.aspect < 1.0;
    const baseZ = isPortrait ? 4.2 : 4.4;
    const baseY = isPortrait ? 1.6 : 1.9;
    const lookY = 1.10;
    // Front camera looking right at Bubu/Dudu's cute face & paws!
    this.camera.position.set(
      Math.sin(time * 0.4) * 0.35,
      baseY + Math.sin(time * 0.3) * 0.08,
      baseZ + Math.cos(time * 0.25) * 0.15
    );
    this.camera.lookAt(isPortrait ? 0 : -.85, lookY, 0);

    // Bubu / Dudu front face is at +Z, facing directly towards camera at +Z!
    if (this.playerCharacter) {
      this.playerCharacter.group.position.set(0, 0, 0);
      this.playerCharacter.group.rotation.set(0, Math.sin(time * 0.8) * 0.15, 0);
      this.playerCharacter.updateAnimation('run', dt, 6);
    }

    if (this.guardCharacter) this.guardCharacter.group.visible = false;
    if (this.bulldogCharacter) this.bulldogCharacter.group.visible = false;
    // Keep guard further back so he doesn't block the view
    if (this.guardCharacter) {
      this.guardCharacter.group.position.set(0, 0, -6.5);
      this.guardCharacter.group.rotation.set(0, 0, 0);
      this.guardCharacter.updateAnimation('run', dt, 6);
    }

    if (this.bulldogCharacter) {
      this.bulldogCharacter.group.position.set(-0.7, 0, -6.2);
      this.bulldogCharacter.group.rotation.set(0, 0, 0);
      this.bulldogCharacter.updateAnimation('run', dt, 6);
    }

    // Track scroll gently
    _vec3A.set(0, 0, 0);
    this.trackManager.update(dt, 5, false, _vec3A);
  }

  private updateAtmosphere(dt: number) {
    const theme = DISTRICTS[this.district];
    const target = new THREE.Color(theme.sky);
    (this.scene.background as THREE.Color).lerp(target, Math.min(1, dt * .8));
    (this.scene.fog as THREE.FogExp2).color.lerp(new THREE.Color(theme.fog), Math.min(1, dt * .8));
    this.sunLight.intensity = THREE.MathUtils.damp(this.sunLight.intensity, this.district % 2 ? 1.1 : 2.4, 1, dt);
    this.hemiLight.color.lerp(new THREE.Color(theme.accent), dt * .5);
    // The sky dome is a CanvasTexture-backed MeshBasicMaterial. Keep the
    // district transition on scene background/fog; shader uniforms do not
    // exist on this material.
  }

  private updatePlaying(dt: number) {
    this.updateAtmosphere(dt);

    // 1. Difficulty & Multipliers
    const activeMultiplier = this.baseMultiplier * (this.multiplier2xTimer > 0 ? 2 : 1);
    const travelSpeed = this.currentSpeed + (this.feverActive ? 6.5 : this.loveCarActive ? 6 : this.duoActive ? 3.5 : 0);
    this.distance += travelSpeed * dt;
    this.distanceScore = accrueScore(this.distanceScore, travelSpeed * dt, activeMultiplier);
    this.pursuit.update(dt);
    this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    this.perfectSwapWindow = Math.max(0, this.perfectSwapWindow - dt);
    this.swapCooldown = Math.max(0, this.swapCooldown - dt);
    this.feedbackTimer = Math.max(0, this.feedbackTimer - dt);
    if (this.feedbackTimer === 0) this.feedback = '';
    const nextDistrict = districtAt(this.distance + this.startDistrict * DISTRICT_LENGTH);
    if (nextDistrict !== this.district) {
      this.district = nextDistrict; this.districtChallenge = 0; this.districtChallengeDone = false;
      this.trackManager.setDistrict(nextDistrict); this.visitDistrict();
      this.say(DISTRICTS[nextDistrict].name + ' · ' + DISTRICTS[nextDistrict].challenge);
      soundManager.playMissionComplete();
    }
    this.statsTimer += dt; this.saveTimer += dt;
    if (this.saveTimer >= 2) { this.persist(); this.saveTimer = 0; }
    if (!this.headstartActive) {
      this.currentSpeed = Math.min(this.baseSpeed + this.distance * 0.007, 34);
    }

    // 2. Power-up timers
    if (this.headstartActive) {
      this.headstartTimer -= dt;
      this.currentSpeed = 70;
      this.playerY = THREE.MathUtils.lerp(this.playerY, 5.8, dt * 6);
      this.playerYVelocity = 0;
      this.isGrounded = false;
      this.spawnJetFlames();

      if (this.headstartTimer <= 0) {
        this.headstartActive = false;
        this.isFlyingJetpack = false;
        this.currentSpeed = this.baseSpeed;
        this.removeJetpack();
        soundManager.stopJetpackLoop();
        soundManager.startBGM();
      }
    } else if (this.jetpackTimer > 0) {
      this.jetpackTimer -= dt;
      this.playerY = THREE.MathUtils.lerp(this.playerY, 5.8, dt * 6);
      this.playerYVelocity = 0;
      this.isGrounded = false;
      this.spawnJetFlames();

      if (this.jetpackTimer <= 0) {
        this.jetpackTimer = 0;
        this.isFlyingJetpack = false;
        this.removeJetpack();
        soundManager.stopJetpackLoop();
      }
    }

    if (this.jetpackAttachment) {
      glbItemLoader.updateCollectibleAnimation(
        this.jetpackAttachment,
        'jetpack',
        dt,
        this.elapsedTime,
        0
      );
    }

    if (this.sneakersTimer > 0) {
      this.sneakersTimer -= dt;
      if (this.sneakersAttachment) {
        glbItemLoader.updateCollectibleAnimation(
          this.sneakersAttachment,
          'sneakers',
          dt,
          this.elapsedTime,
          0
        );
      }
      if (this.sneakersTimer <= 0) {
        this.sneakersTimer = 0;
        this.removeSneakers();
      }
    }

    if (this.multiplier2xTimer > 0) {
      this.multiplier2xTimer -= dt;
      if (this.multiplier2xTimer <= 0) {
        this.multiplier2xTimer = 0;
      }
    }

    if (this.hoverboardActive) {
      this.hoverboardTimer -= dt;
      if (Math.random() < 0.4) {
        this.spawnHoverboardSpark();
      }
      if (this.hoverboardTimer <= 0) {
        this.hoverboardActive = false;
        this.hoverboardTimer = 0;
        this.removeHoverboard();
      }
    }

    if (this.loveCarActive) {
      this.loveCarTimer -= dt;
      this.loveCarHonkTimer += dt;
      if (this.loveCarHonkTimer >= 3.2) {
        this.loveCarHonkTimer = 0;
        soundManager.playCarHorn();
      }
      if (Math.random() < 0.35 && this.playerCharacter) {
        this.spawnBurstParticles(
          new THREE.Vector3(this.playerCharacter.group.position.x + (Math.random() - 0.5) * 0.4, 0.15, -0.6),
          0xff69b4,
          2
        );
      }
      if (this.loveCarTimer <= 0) {
        this.loveCarActive = false;
        this.loveCarTimer = 0;
        this.removeLoveCar();
      }
    }

    // Signature Duo Together System Update
    if (this.duoActive && this.companionCharacter) {
      this.duoTimer -= dt;
      const targetPartnerLane = this.currentLane === 0 ? 1 : (this.currentLane === 2 ? 1 : (this.targetX > 0 ? 0 : 2));
      this.companionTargetX = LANES[targetPartnerLane];
      this.companionX = THREE.MathUtils.damp(this.companionX, this.companionTargetX, 11.5, dt);
      this.companionY = this.playerY;
      this.companionCharacter.group.position.set(this.companionX, this.companionY, 0.0);

      let cAnim: 'run' | 'jump' | 'slide' | 'hoverboard' = 'run';
      if (this.hoverboardActive && this.isGrounded) cAnim = 'hoverboard';
      else if (!this.isGrounded) cAnim = 'jump';
      else if (this.isSliding) cAnim = 'slide';
      this.companionCharacter.updateAnimation(cAnim, dt, this.currentSpeed);

      // Sweet pink heart sparkles connecting Bubu & Dudu
      if (Math.random() < 0.35 && this.playerCharacter) {
        const midX = (this.playerCharacter.group.position.x + this.companionX) * 0.5 + (Math.random() - 0.5) * 0.25;
        const midY = this.playerY + 0.6 + Math.random() * 0.35;
        this.spawnBurstParticles(new THREE.Vector3(midX, midY, -0.1), 0xff1493, 2);
      }

      if (this.duoTimer <= 0) {
        this.deactivateDuoMode();
      }
    }

    if (this.tempInvincibleTimer > 0) {
      this.tempInvincibleTimer -= dt;
      if (this.playerCharacter) {
        this.playerCharacter.group.visible = Math.floor(this.tempInvincibleTimer * 16) % 2 === 0;
      }
      if (this.tempInvincibleTimer <= 0) {
        this.tempInvincibleTimer = 0;
        if (this.playerCharacter) this.playerCharacter.group.visible = true;
      }
    }

    // Boba Milk Tea Pearl Cannon: shoots delicious bouncing tapioca pearls forward
    if (this.bobaTimer > 0) {
      this.bobaTimer -= dt;
      this.bobaShootTimer += dt;
      if (this.bobaShootTimer >= 0.65 && this.playerCharacter) {
        this.bobaShootTimer = 0;
        const pearl = new THREE.Mesh(this.bobaPearlGeo, this.bobaPearlMat);
        const pearlX = this.playerCharacter.group.position.x;
        const pearlY = this.playerY + 0.6;
        const pearlZ = 0.8;
        pearl.position.set(pearlX, pearlY, pearlZ);
        this.scene.add(pearl);
        this.bobaPearls.push({ mesh: pearl, x: pearlX, y: pearlY, z: pearlZ });
        soundManager.playBobaPop();
      }
      if (this.bobaTimer <= 0) this.bobaTimer = 0;
    }

    // Advance and collide active tapioca pearls
    for (let pIdx = this.bobaPearls.length - 1; pIdx >= 0; pIdx--) {
      const p = this.bobaPearls[pIdx];
      p.z += (this.currentSpeed + 35) * dt;
      p.mesh.position.z = p.z;
      p.mesh.position.y = p.y + Math.sin(p.z * 1.5) * 0.15;

      let hit = false;
      for (const obs of this.trackManager.obstacles) {
        if (obs.passed) continue;
        const distZ = Math.abs(obs.group.position.z - p.z);
        const distX = Math.abs(obs.laneX - p.x);
        if (distZ < 1.4 && distX < 0.85) {
          obs.passed = true;
          this.scene.remove(obs.group);
          this.spawnBurstParticles(obs.group.position, 0x4a154b, 22);
          soundManager.playBobaPop();
          soundManager.playCrash();
          this.coins += 5;
          this.walletCoins += 5;
          hit = true;
          break;
        }
      }

      if (hit || p.z > 70) {
        this.scene.remove(p.mesh);
        this.bobaPearls.splice(pIdx, 1);
      }
    }
    if (this.magnetTimer > 0) {
      this.magnetTimer -= dt;
      if (this.magnetTimer <= 0) this.magnetTimer = 0;
    }

    // 3. Player X Lane Smooth Interpolation & Dynamic Surfing Bank
    if (this.playerCharacter) {
      const prevX = this.playerCharacter.group.position.x;
      this.playerCharacter.group.position.x = THREE.MathUtils.damp(
        prevX,
        this.targetX,
        13.5,
        dt
      );
      const xDiff = this.targetX - this.playerCharacter.group.position.x;
      const targetTilt = -THREE.MathUtils.clamp(xDiff * 0.12, -0.22, 0.22);
      this.playerCharacter.setTilt(targetTilt);
    }

    // 4. Player Jump & Slide Physics (Responsive Ground Height for Tracks & Train Roofs)
    if (!this.isFlyingJetpack && !this.headstartActive) {
      const surfaceGroundY = this.getGroundYAtPlayer();
      const hoverOffset = this.hoverboardActive ? (0.22 + Math.sin(this.elapsedTime * 9) * 0.04) : 0;
      const targetGroundY = surfaceGroundY + hoverOffset;

      // Update coyote timer & jump buffer timer
      if (this.isGrounded) {
        this.coyoteTimer = 0.12;
      } else {
        if (this.coyoteTimer > 0) this.coyoteTimer -= dt;
      }
      if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer -= dt;
      }

      if (this.isGrounded) {
        // If ground beneath us dropped (e.g. ran off end of train or switched lane), we must fall briskly!
        if (this.playerY > targetGroundY + 0.15) {
          this.isGrounded = false;
          this.playerYVelocity = -4.5;
          this.coyoteTimer = 0.12; // Allow coyote time leap off train ledge!
        } else {
          // Keep character firmly on target ground level
          this.playerY = targetGroundY;
          this.playerYVelocity = 0;
        }
      }

      if (!this.isGrounded) {
        this.playerYVelocity += this.GRAVITY * dt;
        this.playerY += this.playerYVelocity * dt;

        // Check landing on ground or train roof
        if (this.playerY <= targetGroundY) {
          this.playerY = targetGroundY;
          this.playerYVelocity = 0;
          this.isGrounded = true;
          this.coyoteTimer = 0.12;
          this.landingSquashTimer = 0.12;
          this.spawnSlideDust();
          if (this.isFastDiving) {
            this.isFastDiving = false;
            this.addCameraTrauma(0.24);
            soundManager.playSlide();
          } else {
            this.addCameraTrauma(0.14);
          }

          // Check if a jump was buffered during airborne descent!
          if (this.jumpBufferTimer > 0) {
            this.executeJump();
          }
        }
      }

      if (this.isSliding) {
        this.slideTimer -= dt;
        if (this.slideTimer <= 0) {
          this.isSliding = false;
        }
      }
    }

    if (this.playerCharacter) {
      this.playerCharacter.group.position.y = this.playerY;

      // Dynamic Flight Posture & Banking Roll for Jetpack Realism
      if (this.isFlyingJetpack || this.headstartActive) {
        // Aerodynamic forward pitch (20 degrees)
        this.playerCharacter.group.rotation.x = THREE.MathUtils.damp(
          this.playerCharacter.group.rotation.x,
          0.35,
          8.0,
          dt
        );
        // High-speed flight roll into lane shifts
        const xDiff = this.targetX - this.playerCharacter.group.position.x;
        const targetRoll = -THREE.MathUtils.clamp(xDiff * 0.28, -0.45, 0.45);
        this.playerCharacter.group.rotation.z = THREE.MathUtils.damp(
          this.playerCharacter.group.rotation.z,
          targetRoll,
          12.0,
          dt
        );
      } else {
        // Smoothly restore upright posture when running
        this.playerCharacter.group.rotation.x = THREE.MathUtils.damp(
          this.playerCharacter.group.rotation.x,
          0,
          10.0,
          dt
        );
        this.playerCharacter.group.rotation.z = THREE.MathUtils.damp(
          this.playerCharacter.group.rotation.z,
          0,
          10.0,
          dt
        );
      }

      // Dynamic cartoon squash & stretch for authentic Subway Surfers physics feel
      if (this.landingSquashTimer > 0) {
        this.landingSquashTimer -= dt;
        const progress = this.landingSquashTimer / 0.12;
        const squash = Math.sin(progress * Math.PI);
        this.playerCharacter.group.scale.set(1.0 + squash * 0.08, 1.0 - squash * 0.12, 1.0 + squash * 0.08);
      } else if (!this.isGrounded && !this.isFlyingJetpack && !this.headstartActive) {
        const stretch = Math.min(Math.abs(this.playerYVelocity) * 0.006, 0.10);
        this.playerCharacter.group.scale.set(1.0 - stretch * 0.4, 1.0 + stretch, 1.0 - stretch * 0.4);
      } else {
        this.playerCharacter.group.scale.set(1, 1, 1);
      }

      // Update character running/jumping/sliding animation
      let animState: 'run' | 'jump' | 'slide' | 'hoverboard' | 'stumble' = 'run';
      if (this.hoverboardActive && this.isGrounded) animState = 'hoverboard';
      else if (this.isFlyingJetpack || this.headstartActive) animState = 'jump';
      else if (!this.isGrounded) animState = 'jump';
      else if (this.isSliding) animState = 'slide';

      if (this.stumbleTimer > 0) animState = 'stumble';
      this.playerCharacter.updateAnimation(animState, dt, this.currentSpeed);
    }

    // Inspector only rejoins after a stumble, then retreats after a clean escape.
    const chasing = this.pursuit.remaining > 0;
    this.guardTargetZ = chasing ? -1.65 : -12;
    this.guardZ = THREE.MathUtils.damp(this.guardZ, this.guardTargetZ, 3, dt);
    const playerX = this.playerCharacter?.group.position.x || 0;
    this.guardX = THREE.MathUtils.damp(this.guardX, playerX, 7.5, dt);
    if (this.guardCharacter) {
      this.guardCharacter.group.visible = chasing || this.guardZ > -7;
      this.guardCharacter.group.position.set(this.guardX, 0, this.guardZ);
      if (this.guardCharacter.group.visible) this.guardCharacter.updateAnimation('run', dt, this.currentSpeed);
    }
    if (this.bulldogCharacter) {
      this.bulldogCharacter.group.visible = chasing || this.guardZ > -7;
      this.bulldogCharacter.group.position.set(this.guardX - .72, 0, this.guardZ + .35);
      if (this.bulldogCharacter.group.visible) this.bulldogCharacter.updateAnimation('run', dt, this.currentSpeed);
    }

    // 6. Track, Obstacles & Collectibles Update (ONLY actual collected magnet power-up activates coin magnet!)
    _vec3A.set(playerX, this.playerY, 0);
    const magnetActive = this.magnetTimer > 0;
    const effectiveSpeed = this.currentSpeed + (this.feverActive ? 6.5 : (this.loveCarActive ? 6.0 : (this.duoActive ? 3.5 : 0)));
    this.trackManager.update(dt, effectiveSpeed, magnetActive, _vec3A, this.selectedCharacterType === 'bubu');

    // Update dynamic ground drop shadow
    if (this.playerShadow && this.playerCharacter) {
      const groundY = this.getGroundYAtPlayer();
      this.playerShadow.position.set(playerX, groundY + 0.02, 0);
      const airHeight = Math.max(0, this.playerY - groundY);
      const shadowScale = Math.max(0.35, 1.0 - airHeight * 0.18);
      this.playerShadow.scale.set(shadowScale, shadowScale * 1.25, 1);
      (this.playerShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.45 - airHeight * 0.07);
    }

    // Combo streak decay
    if (this.comboCount > 0 && !this.feverActive) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }

    // Fever Mode Timer & Golden Rainbow Particle Trail
    if (this.feverActive) {
      this.feverTimer -= dt;
      if (this.playerCharacter && Math.random() > 0.3) {
        this.spawnBurstParticles(
          new THREE.Vector3(playerX + (Math.random() - 0.5) * 0.4, this.playerY + 0.4, -0.6),
          Math.random() > 0.5 ? 0xfacc15 : 0xec4899,
          3
        );
      }
      if (this.feverTimer <= 0) {
        this.feverActive = false;
        this.feverTimer = 0;
        this.feverCharge = 0;
        soundManager.playFeverEnd();
      }
    }

    // Advance distance mission
    if (this.currentMission.id === 'distance_1' && !this.currentMission.completed) {
      this.advanceMission(travelSpeed * dt);
    }

    // 7. Collision Detection with Obstacles
    this.checkObstacleCollisions();

    // 8. Collision Detection with Collectibles
    this.checkCollectibleCollisions();

    // 9. Dynamic Cinematic Camera Polish (FOV speed kick, high-altitude flight tracking & screen shake)
    const isHighFlight = this.isFlyingJetpack || this.headstartActive;
    const targetCamY = isHighFlight ? 8.4 : this.normalCamOffset.y + this.playerY * 0.35;
    const targetCamZ = isHighFlight ? this.normalCamOffset.z - 1.2 : this.normalCamOffset.z;
    const targetLookY = isHighFlight ? 5.8 : this.normalCamLookAt.y + this.playerY * 0.2;

    this.currentCamPos.x = THREE.MathUtils.damp(this.currentCamPos.x, playerX * 0.38, 9.0, dt);
    this.currentCamPos.y = THREE.MathUtils.damp(this.currentCamPos.y, targetCamY, 8.0, dt);
    this.currentCamPos.z = THREE.MathUtils.damp(this.currentCamPos.z, targetCamZ, 6.0, dt);

    this.currentCamLookAt.x = THREE.MathUtils.damp(this.currentCamLookAt.x, playerX * 0.22, 9.0, dt);
    this.currentCamLookAt.y = THREE.MathUtils.damp(this.currentCamLookAt.y, targetLookY, 8.0, dt);

    // Dynamic FOV kick for exhilarating speed sensation
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const baseFov = aspect < 1.0 ? 70 : 58;
    const speedBoostFov = (this.currentSpeed - this.baseSpeed) * 0.4;
    const powerupFov = (this.isFlyingJetpack || this.headstartActive ? 8 : 0) + (this.hoverboardActive ? 4 : 0);
    const feverFov = this.feverActive ? 8 : 0;
    const targetFov = baseFov + speedBoostFov + powerupFov + feverFov;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6);
    this.camera.updateProjectionMatrix();

    // Screen shake trauma decay
    if (this.cameraTrauma > 0) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.8);
      const shake = this.cameraTrauma * this.cameraTrauma;
      this.cameraShakeOffset.set(
        (Math.random() - 0.5) * 0.38 * shake,
        (Math.random() - 0.5) * 0.38 * shake,
        (Math.random() - 0.5) * 0.2 * shake
      );
    } else {
      this.cameraShakeOffset.set(0, 0, 0);
    }

    this.camera.position.copy(this.currentCamPos).add(this.cameraShakeOffset);
    this.camera.lookAt(this.currentCamLookAt);

    // 10. Update stats callback
    const totalScore = Math.floor(this.distanceScore + this.coins * 15);
    if (totalScore > this.highScore) {
      this.highScore = totalScore;
      // Persisted periodically and at state transitions.
    }

    if (this.onStatsUpdate && this.statsTimer >= .1) {
      this.statsTimer = 0;
      this.onStatsUpdate({
        ...this.extraStats(),
        score: totalScore,
        distance: Math.floor(this.distance),
        coins: this.coins,
        walletCoins: this.walletCoins,
        speed: Math.round(this.currentSpeed),
        bobaTimeLeft: Math.ceil(this.bobaTimer),
        magnetTimeLeft: Math.ceil(this.magnetTimer),
        jetpackTimeLeft: Math.ceil(this.jetpackTimer),
        sneakersTimeLeft: Math.ceil(this.sneakersTimer),
        multiplierTimeLeft: Math.ceil(this.multiplier2xTimer),
        hoverboardTimeLeft: Math.ceil(this.hoverboardTimer),
        hoverboardActive: this.hoverboardActive,
        scoreMultiplier: activeMultiplier,
        mysteryBoxesCount: this.mysteryBoxesCollected,
        hoverboardsCount: this.consumables.hoverboards,
        headstartsCount: this.consumables.headstarts,
        scoreBoostersCount: this.consumables.scoreBoosters,
        highScore: this.highScore,
        guardDistance: Math.abs(this.guardZ),
        comboCount: this.comboCount,
        feverCharge: Math.round(this.feverCharge),
        feverActive: this.feverActive,
        feverTimeLeft: Math.ceil(this.feverTimer),
        loveCarTimeLeft: Math.ceil(this.loveCarTimer),
        loveCarActive: this.loveCarActive,
        duoTimeLeft: Math.ceil(this.duoTimer),
        duoActive: this.duoActive,
        mission: { ...this.currentMission },
      });
    }
  }

  private triggerFeverMode() {
    this.feverActive = true;
    this.feverTimer = this.FEVER_DURATION;
    this.feverCharge = 100;
    this.comboCount += 5;
    soundManager.playFeverStart();
    this.addCameraTrauma(0.45);

    if (this.currentMission.id === 'fever_1' && !this.currentMission.completed) {
      this.advanceMission(1);
    }
  }

  private advanceMission(amount: number) {
    if (this.currentMission.completed) return;
    this.currentMission.current = Math.min(this.currentMission.target, this.currentMission.current + amount);
    if (this.currentMission.current >= this.currentMission.target) {
      this.currentMission.completed = true;
      this.walletCoins += 250;
      this.saveWalletCoins();
      soundManager.playMissionComplete();
      this.addCameraTrauma(0.3);
    }
  }

  /**
   * Calculates the dynamic surface elevation underneath the runner.
   * If running or jumping on a train roof or climbing a train ramp, returns correct Y.
   * As soon as the train passes or player shifts lanes, returns 0.0m (tracks).
   */
  private getGroundYAtPlayer(): number {
    let groundY = 0.0;
    const px = this.playerCharacter ? this.playerCharacter.group.position.x : this.targetX;
    const targetLaneX = this.targetX;

    for (const obs of this.trackManager.obstacles) {
      if (obs.passed) continue;
      if ((obs.type === 'train' || obs.type === 'car') && obs.roofY) {
        // In the vehicle's lane?
        const inLane = Math.abs(px - obs.laneX) < 0.85 || Math.abs(targetLaneX - obs.laneX) < 0.85;
        if (!inLane) continue;

        const obsZ = obs.group.position.z;

        // 1. Train Ramp Climb Physics:
        // Ramp starts at obsZ - 6.915 (ground) and reaches obsZ - 3.315 (train roof Y=2.25)
        // Runner is at Z = 0
        if (obs.hasRamp) {
          if (obsZ >= 3.2 && obsZ <= 7.0) {
            const rampProgress = (6.915 - obsZ) / 3.6;
            if (rampProgress >= 0 && rampProgress <= 1.0) {
              groundY = Math.max(groundY, rampProgress * obs.roofY);
              continue;
            }
          }
        }

        // 2. Train & Vehicle roof surface
        const halfDepth = obs.hasRamp ? 3.315 : (obs.obstacleDepth / 2);
        const isOverRoofZ = (obsZ >= -halfDepth - 0.25) && (obsZ <= halfDepth + 0.25);

        if (isOverRoofZ) {
          if (this.playerY >= obs.roofY - 0.45) {
            groundY = Math.max(groundY, obs.roofY);
          }
        }
      }
    }

    return groundY;
  }

  private checkObstacleCollisions() {
    if (!this.playerCharacter) return;
    if (this.isFlyingJetpack || this.headstartActive || this.tempInvincibleTimer > 0 || this.pursuit.recovery > 0) return;
    const px = this.playerCharacter.group.position.x;
    const py = this.playerY;

    // High elevation immunity
    if (py >= 4.2) return;

    for (const obs of this.trackManager.obstacles) {
      if (obs.passed) continue;

      const obsZ = obs.group.position.z;
      const halfDepth = obs.obstacleDepth / 2;

      // Mark obstacle passed only once its entire depth has moved behind the runner
      if (obsZ + halfDepth < -0.8) {
        obs.passed = true;
        continue;
      }

      if (!overlapsObstacle(px, obsZ, obs.laneX, obs.obstacleDepth)) {
        if (!obs.nearMissAwarded && obsZ < -.5 && obsZ > -2 && Math.abs(px - obs.laneX) > .8 && Math.abs(px - obs.laneX) < 2.8) {
          obs.nearMissAwarded = true; this.togetherCharge = Math.min(100, this.togetherCharge + 8);
          this.perfectSwapWindow = 1; this.say('CLOSE CALL · Tag now for a perfect swap');
        }
        continue;
      }

      // 0. Love-Car & Fever Mode: Unstoppable obstacle smash!
      if (this.loveCarActive || this.feverActive) {
        obs.passed = true;
        this.scene.remove(obs.group);
        const particleColor = this.loveCarActive ? 0xff3385 : 0xfacc15;
        this.spawnBurstParticles(obs.group.position, particleColor, 25);
        soundManager.playCrash();
        if (this.loveCarActive) {
          soundManager.playCarHorn();
        }
        this.addCameraTrauma(0.28);
        this.coins += 5;
        this.walletCoins += 5;
        continue;
      }

      // 1. Train Ramp Climb Immunity: Runner effortlessly runs straight up ramp onto roof!
      if (obs.type === 'train' && obs.hasRamp) {
        if (obsZ >= 3.0 && obsZ <= 7.1) {
          continue;
        }
      }

      // Only evaluate collision when the obstacle is within the player's active Z depth zone
      const isWithinZ = (obsZ - halfDepth <= 0.45) && (obsZ + halfDepth >= -0.45);
      if (!isWithinZ) {
        continue;
      }

      // Peach Trampoline Super Jump Pad:
      if (obs.type === 'trampoline') {
        if (py > .85) continue;
        if (!obs.cleared) {
          obs.cleared = true;
          this.playerYVelocity = 23.5;
          this.isGrounded = false;
          soundManager.playSpringBoing();
          this.spawnBurstParticles(obs.group.position, 0xff758f, 30);
          this.addCameraTrauma(0.22);
          this.comboCount += 3;
          this.trackManager.spawnSkyCoinCluster(28, 8);
        }
        continue;
      }

      // 1. Lane Check: Is player actually in this obstacle's lane?
      const distToLane = Math.abs(px - obs.laneX);
      if (distToLane > 0.8) {
        continue;
      }

      // Dudu Specialty: Bear strength smashes wooden crates safely!
      if (this.selectedCharacterType === 'dudu' && obs.type === 'crate') {
        obs.passed = true;
        this.scene.remove(obs.group);
        this.spawnBurstParticles(obs.group.position, 0xd97706, 20);
        soundManager.playCrash();
        this.addCameraTrauma(0.2);
        this.coins += 2;
        this.walletCoins += 2;
        continue;
      }

      // 2. Train & Vehicle Roof Highway: Landing and running on top of train cars and vehicles!
      if ((obs.type === 'train' || obs.type === 'car') && obs.roofY) {
        if (py >= obs.roofY - 0.25) {
          continue;
        }
      }

      // 3. Jump Clearance Check:
      if (obs.canJumpOver) {
        if (py >= obs.jumpClearanceY) {
          if (!obs.cleared) {
            obs.cleared = true;
            this.comboCount += 2;
            this.togetherCharge = Math.min(100, this.togetherCharge + 12);
            this.perfectSwapWindow = 1;
            this.progressDistrict(false, 1);
            this.comboTimer = 2.8;
            if (!this.feverActive) {
              this.feverCharge = Math.min(100, this.feverCharge + 8);
              if (this.feverCharge >= 100) this.triggerFeverMode();
            }
            if (this.currentMission.id === 'jumps_1' && !this.currentMission.completed) {
              this.advanceMission(1);
            }
          }
          continue;
        }
      }

      // 4. Slide / Duck Clearance Check:
      if (obs.mustSlideUnder) {
        if (this.isSliding && py <= 0.35) {
          if (!obs.cleared) {
            obs.cleared = true;
            this.comboCount += 2;
            this.togetherCharge = Math.min(100, this.togetherCharge + 12);
            this.perfectSwapWindow = 1;
            this.progressDistrict(false, 1);
            this.comboTimer = 2.8;
            if (!this.feverActive) {
              this.feverCharge = Math.min(100, this.feverCharge + 8);
              if (this.feverCharge >= 100) this.triggerFeverMode();
            }
          }
          continue;
        }
      }

      // 5. Hoverboard Life-Saving Shield:
      if (this.hoverboardActive) {
        this.hoverboardActive = false;
        this.hoverboardTimer = 0;
        this.removeHoverboard();
        soundManager.playHoverboardBreak();
        this.addCameraTrauma(0.55);
        this.spawnBurstParticles(obs.group.position, 0x00f5d4, 30);
        this.scene.remove(obs.group);
        obs.passed = true;
        this.tempInvincibleTimer = 1.4;
        this.guardStumbleTimer = 2.0;
        soundManager.playWhistle();
        continue;
      }

      // 6. Boba Shield Power-up Check:
      if (this.bobaTimer > 0) {
        this.bobaTimer = 0;
        this.spawnBurstParticles(obs.group.position, 0xff6b8b, 20);
        soundManager.playCrash();
        this.addCameraTrauma(0.4);
        this.scene.remove(obs.group);
        obs.passed = true;
        this.guardStumbleTimer = 2.0;
        soundManager.playWhistle();
        continue;
      }

      // 7. Duo Guardian Save: Partner heroically shoves obstacle away!
      if (this.duoActive && this.companionCharacter) {
        this.deactivateDuoMode();
        obs.passed = true;
        this.scene.remove(obs.group);
        this.spawnBurstParticles(obs.group.position, 0xff1493, 35);
        soundManager.playCrash();
        soundManager.playDuoSpark();
        this.addCameraTrauma(0.4);
        this.tempInvincibleTimer = 1.8;
        this.guardStumbleTimer = 2.5;
        this.coins += 25;
        this.walletCoins += 25;
        soundManager.playWhistle();
        continue;
      }

      // Hit Obstacle: Trigger cinematic Subway Surfers caught sequence!
      this.addCameraTrauma(0.65);
      const hit = this.pursuit.hit();
      if (hit === 'caught') { this.triggerCaughtSequence(); break; }
      if (hit === 'stumble') {
        obs.passed = true; this.scene.remove(obs.group);
        this.stumbleTimer = .65; this.comboCount = 0; this.comboTimer = 0;
        this.guardZ = -6; this.guardTargetZ = -1.65;
        this.guardCharacter!.group.visible = true; this.bulldogCharacter!.group.visible = true;
        this.say('STUMBLE! · Run clean for 8s to escape');
        soundManager.playCrash(); soundManager.playWhistle();
      }
      break;
    }
  }

  private checkCollectibleCollisions() {
    if (!this.playerCharacter) return;
    const px = this.playerCharacter.group.position.x;
    const py = this.playerY;

    for (let i = 0; i < this.trackManager.collectibles.length; i++) {
      const col = this.trackManager.collectibles[i];
      if (col.collected) continue;

      const cPos = col.group.position;
      const dx = px - cPos.x;
      const dy = py + 0.8 - cPos.y;
      const dz = -cPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      const isCoin = col.type === 'coin';
      const inLane = Math.abs(px - col.laneX) < 0.85;

      // Power-ups and items MUST be in the player's exact lane (inLane) to be collected!
      // Only coins can be pulled in by an active Magnet item:
      const magnetPullsThisCoin = (this.magnetTimer > 0 || this.selectedCharacterType === 'bubu') && isCoin;
      const canCollect = isCoin ? (inLane || magnetPullsThisCoin) : inLane;

      if (canCollect && distSq < 1.6) {
        col.collected = true;
        this.scene.remove(col.group);

        if (col.type === 'coin') {
          const coinInc = (this.bobaTimer > 0 ? 2 : 1) * (this.multiplier2xTimer > 0 ? 2 : 1) * (this.feverActive ? 2 : 1);
          this.coins += coinInc;
          this.walletCoins += coinInc;
          this.saveWalletCoins();

          this.comboCount++;
          this.togetherCharge = Math.min(100, this.togetherCharge + 4);
          this.progressDistrict(true, coinInc);
          this.comboTimer = 2.8;

          if (!this.feverActive) {
            this.feverCharge = Math.min(100, this.feverCharge + 4);
            if (this.feverCharge >= 100) {
              this.triggerFeverMode();
            }
          }

          soundManager.playCoin();
          this.spawnBurstParticles(cPos, 0xffd166, 10);

          if (this.comboCount > 0 && this.comboCount % 5 === 0) {
            soundManager.playComboCheer();
          }

          if (this.currentMission.id === 'coins_1' && !this.currentMission.completed) {
            this.advanceMission(coinInc);
          }
        } else if (col.type === 'jetpack') {
          const duration = UPGRADE_DURATIONS.jetpack[this.upgrades.jetpack - 1];
          this.jetpackTimer = duration;
          this.isFlyingJetpack = true;
          this.attachJetpack();
          soundManager.playBoba();
          soundManager.startJetpackLoop();
          this.trackManager.spawnSkyCoinCluster(35, 12);
          this.spawnBurstParticles(cPos, 0xef233c, 25);
        } else if (col.type === 'sneakers') {
          const duration = UPGRADE_DURATIONS.sneakers[this.upgrades.sneakers - 1];
          this.sneakersTimer = duration;
          this.attachSneakers();
          soundManager.playSpringBoing();
          this.spawnBurstParticles(cPos, 0x06d6a0, 25);
        } else if (col.type === 'magnet') {
          const duration = UPGRADE_DURATIONS.magnet[this.upgrades.magnet - 1];
          this.magnetTimer = duration;
          soundManager.playBoba();
          this.spawnBurstParticles(cPos, 0xef233c, 25);
        } else if (col.type === 'multiplier2x') {
          const duration = UPGRADE_DURATIONS.multiplier2x[this.upgrades.multiplier2x - 1];
          this.multiplier2xTimer = duration;
          soundManager.playMultiplierChime();
          this.spawnBurstParticles(cPos, 0xffd166, 30);
        } else if (col.type === 'pogo') {
          this.playerYVelocity = 23.5;
          this.isGrounded = false;
          soundManager.playPogoLaunch();
          this.trackManager.spawnSkyCoinCluster(30, 8);
          this.spawnBurstParticles(cPos, 0xff3366, 30);
        } else if (col.type === 'mysterybox') {
          this.mysteryBoxesCollected++;
          this.consumables.mysteryBoxes++;
          this.saveConsumables();
          soundManager.playBoba();
          this.spawnBurstParticles(cPos, 0x9d4edd, 30);
        } else if (col.type === 'boba') {
          this.bobaTimer = 8;
          soundManager.playBoba();
          this.spawnBurstParticles(cPos, 0xff69b4, 25);
        } else if (col.type === 'lovecar') {
          this.activateLoveCar();
          this.spawnBurstParticles(cPos, 0xff3385, 30);
        } else if (col.type === 'duo') {
          this.activateDuoMode(15.0, true);
          this.spawnBurstParticles(cPos, 0xff1493, 35);
        }
      }

      // Partner companion only sweeps coins in their specific adjacent lane!
      if (this.duoActive && this.companionCharacter && !col.collected && col.type === 'coin') {
        const inCompanionLane = Math.abs(this.companionX - col.laneX) < 0.85;
        const cdx = this.companionX - cPos.x;
        const cdy = this.companionY + 0.8 - cPos.y;
        const cdz = -cPos.z;
        if (inCompanionLane && (cdx * cdx + cdy * cdy + cdz * cdz < 1.8)) {
          col.collected = true;
          this.scene.remove(col.group);
          if (col.type === 'coin') {
            const coinInc = 2 * (this.multiplier2xTimer > 0 ? 2 : 1) * (this.feverActive ? 2 : 1);
            this.coins += coinInc;
            this.walletCoins += coinInc;
            this.saveWalletCoins();
            soundManager.playCoin();
            this.spawnBurstParticles(cPos, 0xffd166, 10);
          }
        }
      }
    }
  }

  // --- Subway Surfers Cinematic Caught Sequence ---
  private triggerCaughtSequence() {
    this.persist();
    this.gameState = 'caught';
    this.guardCharacter!.group.visible = true;
    this.bulldogCharacter!.group.visible = true;
    this.cinematicTimer = 0;
    this.playerY = 0;
    this.playerYVelocity = 0;
    this.isGrounded = true;
    this.isSliding = false;

    soundManager.stopBGM();
    soundManager.stopJetpackLoop();
    soundManager.playCrash();
    soundManager.playWhistle();
    soundManager.playCaughtVoice();

    // Guard lunges forward right to the player!
    this.guardTargetZ = -0.7;

    // Immediately trigger defeated sitting pose with tears
    if (this.playerCharacter) {
      this.playerCharacter.group.position.y = 0;
      this.playerCharacter.updateAnimation('caught', 0.016, 0);
      this.spawnBurstParticles(this.playerCharacter.group.position, 0xff5964, 24);
    }
  }

  private updateCaughtCinematic(dt: number) {
    this.cinematicTimer += dt;

    // Slow-motion guard approach
    this.guardZ = THREE.MathUtils.lerp(this.guardZ, -0.75, dt * 4.5);
    const px = this.playerCharacter?.group.position.x || 0;
    this.guardX = THREE.MathUtils.lerp(this.guardX, px, dt * 6.0);

    if (this.guardCharacter) {
      this.guardCharacter.group.position.set(this.guardX, 0, this.guardZ);
      this.guardCharacter.updateAnimation('caught', dt, 0);
    }

    if (this.bulldogCharacter) {
      this.bulldogCharacter.group.position.set(this.guardX - 0.65, 0, this.guardZ + 0.25);
      this.bulldogCharacter.updateAnimation('caught', dt, 0);
    }

    if (this.playerCharacter) {
      this.playerCharacter.group.position.y = 0;
      this.playerCharacter.updateAnimation('caught', dt, 0);
    }

    // Cinematic slow-motion camera pan from behind to dramatic front-angle view!
    const targetCamX = px + 1.8;
    const targetCamY = 2.4;
    const targetCamZ = 4.6;

    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, dt * 3.0);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, dt * 3.0);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, dt * 3.0);

    _vec3B.set(px, 1.0, -0.2);
    this.camera.lookAt(_vec3B);

    // After 1.6s of cinematic catch sequence, show Game Over screen!
    if (this.cinematicTimer > 1.6) {
      this.adventure.runs++;
      this.adventure.bestDistance = Math.max(this.adventure.bestDistance, Math.floor(this.distance));
      this.adventure.totalCoins += this.coins;
      this.persist();
      this.gameState = 'gameover';
      const activeMultiplier = this.baseMultiplier * (this.multiplier2xTimer > 0 ? 2 : 1);
      const totalScore = Math.floor(this.distanceScore + this.coins * 15);
      if (this.onGameOver) {
        this.onGameOver({
          ...this.extraStats(),
          score: totalScore,
          distance: Math.floor(this.distance),
          coins: this.coins,
          walletCoins: this.walletCoins,
          speed: Math.round(this.currentSpeed),
          bobaTimeLeft: 0,
          magnetTimeLeft: 0,
          jetpackTimeLeft: 0,
          sneakersTimeLeft: 0,
          multiplierTimeLeft: 0,
          hoverboardTimeLeft: 0,
          hoverboardActive: false,
          scoreMultiplier: 1,
          mysteryBoxesCount: this.mysteryBoxesCollected,
          hoverboardsCount: this.consumables.hoverboards,
          headstartsCount: this.consumables.headstarts,
          scoreBoostersCount: this.consumables.scoreBoosters,
          highScore: this.highScore,
          guardDistance: 0,
          comboCount: 0,
          feverCharge: 0,
          feverActive: false,
          feverTimeLeft: 0,
          loveCarTimeLeft: 0,
          loveCarActive: false,
          duoTimeLeft: 0,
          duoActive: false,
          mission: this.currentMission,
        });
      }
    }
  }

  // --- Upgrades & Consumables API methods ---
  public getUpgrades(): PowerUpUpgrades {
    return { ...this.upgrades };
  }

  public upgradePowerUp(key: keyof PowerUpUpgrades): boolean {
    const curLevel = this.upgrades[key];
    if (curLevel >= 5) return false;
    const cost = UPGRADE_COSTS[key][curLevel - 1];
    if (this.walletCoins < cost) return false;

    this.walletCoins -= cost;
    this.upgrades[key] = (curLevel + 1) as 1 | 2 | 3 | 4 | 5;
    this.saveWalletCoins();
    this.saveUpgrades();
    soundManager.playCoin();
    return true;
  }

  public getConsumables(): ConsumableInventory {
    return { ...this.consumables };
  }

  public buyConsumable(key: keyof ConsumableInventory): boolean {
    const cost = CONSUMABLE_COSTS[key];
    if (this.walletCoins < cost) return false;

    this.walletCoins -= cost;
    this.consumables[key]++;
    this.saveWalletCoins();
    this.saveConsumables();
    soundManager.playCoin();
    return true;
  }

  public getWalletCoins(): number {
    return this.walletCoins;
  }

  public addWalletCoins(amt: number) {
    this.walletCoins += amt;
    this.saveWalletCoins();
  }

  private saveWalletCoins() {
    safeStorage.set('bubududu_wallet_coins', String(this.walletCoins));
  }

  private saveUpgrades() {
    safeStorage.set('bubududu_upgrades', JSON.stringify(this.upgrades));
  }

  private saveConsumables() {
    safeStorage.set('bubududu_consumables', JSON.stringify(this.consumables));
  }

  // Interactive Mystery Box Unboxing
  public openMysteryBox(): { type: 'coins' | 'hoverboards' | 'headstarts' | 'scoreBoosters'; amount: number; label: string } | null {
    const remaining = consumeBox(this.consumables.mysteryBoxes);
    if (remaining === null) return null;
    this.consumables.mysteryBoxes = remaining;
    this.mysteryBoxesCollected = Math.max(0, this.mysteryBoxesCollected - 1);
    this.saveConsumables();
    soundManager.playMysteryBoxOpen();
    const roll = Math.random();
    if (roll < 0.40) {
      const amount = Math.floor(Math.random() * 6 + 3) * 100; // 300 to 800 coins
      this.walletCoins += amount;
      this.saveWalletCoins();
      return { type: 'coins', amount, label: `🪙 +${amount} Coins!` };
    } else if (roll < 0.65) {
      const amount = Math.floor(Math.random() * 2) + 1; // 1 to 2 hoverboards
      this.consumables.hoverboards += amount;
      this.saveConsumables();
      return { type: 'hoverboards', amount, label: `🛹 +${amount} Hoverboard${amount > 1 ? 's' : ''}!` };
    } else if (roll < 0.85) {
      const amount = Math.floor(Math.random() * 2) + 1; // 1 to 2 headstarts
      this.consumables.headstarts += amount;
      this.saveConsumables();
      return { type: 'headstarts', amount, label: `🚀 +${amount} Headstart${amount > 1 ? 's' : ''}!` };
    } else {
      const amount = Math.floor(Math.random() * 2) + 1; // 1 to 2 score boosters
      this.consumables.scoreBoosters += amount;
      this.saveConsumables();
      return { type: 'scoreBoosters', amount, label: `⚡ +${amount} Score Booster${amount > 1 ? 's' : ''}!` };
    }
  }

  public resetToMenu() {
    this.persist();
    this.pursuit.reset();
    this.gameState = 'menu';
    this.removeAttachments();
    this.jetpackTimer = 0;
    this.isFlyingJetpack = false;
    this.sneakersTimer = 0;
    this.multiplier2xTimer = 0;
    this.hoverboardActive = false;
    this.headstartActive = false;
    this.tempInvincibleTimer = 0;
    soundManager.stopJetpackLoop();
    soundManager.stopBGM();
    this.currentLane = 1;
    this.targetX = 0;
    this.playerY = 0;
    this.playerYVelocity = 0;
    this.isGrounded = true;
    this.isSliding = false;
    if (this.introPlatformGroup) {
      this.scene.remove(this.introPlatformGroup);
    }
    if (this.sprayCan) {
      this.scene.remove(this.sprayCan);
    }
    this.district = this.startDistrict; this.trackManager.setDistrict(this.district);
    this.trackManager.reset();
  }

  public togglePause() {
    this.persist();
    if (this.gameState === 'playing') {
      this.gameState = 'paused';
      soundManager.stopBGM();
      soundManager.stopJetpackLoop();
    } else if (this.gameState === 'paused') {
      this.gameState = 'playing';
      if (this.isFlyingJetpack || this.headstartActive) {
        soundManager.startJetpackLoop();
      } else {
        soundManager.startBGM();
      }
    }
  }

  private spawnJetFlames() {
    if (this.particles.length > 100 || this.adventure.reducedMotion) return;
    if (!this.playerCharacter) return;
    const pPos = this.playerCharacter.group.position;
    [-0.22, 0.22].forEach((xOff) => {
      // 1. Inner ultra-bright cyan core exhaust
      const coreGeo = new THREE.SphereGeometry(0.065, 6, 6);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95 });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.set(pPos.x + xOff, pPos.y + 0.35, pPos.z - 0.38);
      this.particleGroup.add(coreMesh);
      this.particles.push({
        mesh: coreMesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, -5.5 - Math.random() * 2, -2.5),
        life: 0,
        maxLife: 0.18,
      });

      // 2. Outer roaring orange/gold flame and smoke plume with wind drag
      const flameGeo = new THREE.SphereGeometry(0.11, 6, 6);
      const color = Math.random() > 0.4 ? 0xff5400 : 0xfacc15;
      const flameMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      flameMesh.position.set(pPos.x + xOff, pPos.y + 0.35, pPos.z - 0.42);
      this.particleGroup.add(flameMesh);
      this.particles.push({
        mesh: flameMesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -4.0 - Math.random() * 2, -this.currentSpeed * 0.35),
        life: 0,
        maxLife: 0.32,
      });
    });
  }

  private spawnHoverboardSpark() {
    if (this.particles.length > 100 || this.adventure.reducedMotion) return;
    if (!this.playerCharacter) return;
    const pPos = this.playerCharacter.group.position;
    const geo = new THREE.SphereGeometry(0.06, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pPos.x + (Math.random() - 0.5) * 0.4, pPos.y + 0.05, pPos.z - 0.5);
    this.particleGroup.add(mesh);
    this.particles.push({
      mesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5 + 0.5, -3.0),
      life: 0,
      maxLife: 0.25,
    });
  }

  // --- Particle Systems ---
  private spawnSlideDust() {
    if (this.particles.length > 100 || this.adventure.reducedMotion) return;
    if (!this.playerCharacter) return;
    const pPos = this.playerCharacter.group.position;
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.DodecahedronGeometry(0.09, 0);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        pPos.x + (Math.random() - 0.5) * 0.4,
        0.08,
        pPos.z - 0.2 + (Math.random() - 0.5) * 0.2
      );
      this.particleGroup.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5 + 0.5, -Math.random() * 2),
        life: 0,
        maxLife: 0.35,
      });
    }
  }

  private spawnBurstParticles(pos: THREE.Vector3, color: number, count: number) {
    count = Math.min(count, Math.max(0, (this.adventure.quality === 'low' ? 45 : 120) - this.particles.length));
    if (this.adventure.reducedMotion) count = Math.min(count, 3);
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.1, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.particleGroup.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.random() * 4 + 2,
          Math.sin(angle) * speed
        ),
        life: 0,
        maxLife: 0.6,
      });
    }
  }

  public spawnHeartBurst(pos: THREE.Vector3) {
    this.spawnBurstParticles(pos, 0xff69b4, 25);
    this.spawnBurstParticles(pos, 0xffb6c1, 15);
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particleGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 9.8 * dt; // gravity

      const progress = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
      const s = 1 - progress * 0.5;
      p.mesh.scale.set(s, s, s);
    }
  }

  private updateCameraForAspect(aspect: number) {
    if (aspect < 1.0) {
      // Mobile Portrait (e.g. 9:16 aspect):
      // Widen vertical FOV dynamically so the horizontal field of view preserves all 3 lanes without cropping
      const targetHFov = THREE.MathUtils.degToRad(78);
      const vFov = 2 * Math.atan(Math.tan(targetHFov / 2) / aspect);
      this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vFov), 58, 86);
      this.normalCamOffset.set(0, 5.8, -9.2);
      this.normalCamLookAt.set(0, 1.4, 7.0);
    } else {
      // Desktop / Tablet Landscape
      this.camera.fov = 58;
      this.normalCamOffset.set(0, 4.8, -6.8);
      this.normalCamLookAt.set(0, 1.4, 7.0);
    }
    this.camera.updateProjectionMatrix();
  }

  private onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.updateCameraForAspect(aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public addCameraTrauma(amount: number) {
    if (this.adventure.reducedMotion) return;
    this.cameraTrauma = Math.min(1.0, this.cameraTrauma + amount);
  }

  private createSkyDome(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, '#1d4ed8'); // Deep vibrant cartoon cobalt blue zenith
      grad.addColorStop(0.3, '#38bdf8'); // Bright azure sky
      grad.addColorStop(0.6, '#bae6fd'); // Soft atmospheric cyan
      grad.addColorStop(0.82, '#fef08a'); // Warm golden sun glow
      grad.addColorStop(0.94, '#fed7aa'); // Warm peach horizon
      grad.addColorStop(1.0, '#fecdd3'); // Soft rose ground blend
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 512);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geom = new THREE.SphereGeometry(220, 24, 16);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.y = Math.PI / 2;
    return mesh;
  }

  private createClouds() {
    this.cloudsGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    });

    const sphereGeom = new THREE.DodecahedronGeometry(1.0, 1);

    for (let i = 0; i < 14; i++) {
      const cluster = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      for (let p = 0; p < numPuffs; p++) {
        const puff = new THREE.Mesh(sphereGeom, cloudMat);
        const radius = 1.8 + Math.random() * 2.2;
        puff.scale.set(radius * (1.2 + Math.random() * 0.4), radius * 0.85, radius);
        puff.position.set(
          (p - numPuffs / 2) * 2.2 + (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 1.8
        );
        puff.castShadow = false;
        puff.receiveShadow = false;
        cluster.add(puff);
      }

      const xPos = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 32);
      const yPos = 24 + Math.random() * 16;
      const zPos = -30 + (i / 14) * 210;
      cluster.position.set(xPos, yPos, zPos);
      this.cloudsGroup.add(cluster);

      this.clouds.push({
        mesh: cluster,
        speed: 1.2 + Math.random() * 1.8,
        resetZ: 180,
      });
    }

    this.scene.add(this.cloudsGroup);
  }

  private updateClouds(dt: number) {
    const cloudSpeed = (this.gameState === 'playing' ? this.currentSpeed * 0.15 : 2.0);
    for (const cloud of this.clouds) {
      cloud.mesh.position.z -= (cloudSpeed + cloud.speed) * dt;
      if (cloud.mesh.position.z < -40) {
        cloud.mesh.position.z = cloud.resetZ;
        cloud.mesh.position.x = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 32);
      }
    }
  }

  private extraStats() {
    return { chaseTimeLeft: this.pursuit.remaining, togetherCharge: Math.floor(this.togetherCharge), district: this.district,
      districtProgress: (this.distance % DISTRICT_LENGTH) / DISTRICT_LENGTH, districtChallenge: this.districtChallenge,
      districtChallengeDone: this.districtChallengeDone, feedback: this.feedback };
  }
  private say(message: string) { this.feedback = message; this.feedbackTimer = 2.5; }
  private visitDistrict() {
    if (!this.adventure.visited.includes(this.district)) this.adventure.visited.push(this.district);
    saveAdventure(this.adventure);
  }
  private progressDistrict(coin: boolean, amount: number) {
    if (this.districtChallengeDone || coin !== (this.district % 2 === 1)) return;
    this.districtChallenge = Math.min(DISTRICTS[this.district].target, this.districtChallenge + amount);
    if (this.districtChallenge >= DISTRICTS[this.district].target) {
      this.districtChallengeDone = true; this.walletCoins += 150; this.saveWalletCoins();
      this.say('DISTRICT COMPLETE · +150 coins'); soundManager.playMissionComplete();
    }
  }
  private persist() {
    this.saveWalletCoins(); safeStorage.set('bubududu_high_score', String(this.highScore)); saveAdventure(this.adventure);
  }
  public getAdventure(): Adventure { return { ...this.adventure, visited: [...this.adventure.visited], decorations: [...this.adventure.decorations] }; }
  public decorate(id: string): boolean {
    const item = DECORATIONS.find(d => d.id === id);
    if (!item || this.adventure.decorations.includes(id) || this.walletCoins < item.cost) return false;
    this.walletCoins -= item.cost; this.adventure.decorations.push(id); this.persist(); return true;
  }
  public setOutfit(outfit: Outfit): boolean {
    if (outfit === 'explorer' && this.adventure.bestDistance < 600) return false;
    if (outfit === 'starlight' && this.adventure.visited.length < 4) return false;
    this.adventure.outfit = outfit; saveAdventure(this.adventure); this.applyOutfit(); return true;
  }
  private applyOutfit() {
    if (!this.playerCharacter) return;
    const old = this.playerCharacter.group.getObjectByName('AdventureScarf');
    if (old) { this.playerCharacter.group.remove(old); old.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); }
    if (this.adventure.outfit === 'classic') return;
    const scarf = new THREE.Group(); scarf.name = 'AdventureScarf';
    const color = this.adventure.outfit === 'explorer' ? 0x45c9b6 : 0xbba3ff;
    const band = new THREE.Mesh(new THREE.TorusGeometry(.25, .065, 6, 16), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
    band.rotation.x = Math.PI / 2; band.position.y = .8; scarf.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.13, .36, .05), new THREE.MeshStandardMaterial({ color }));
    tail.position.set(.16, .63, -.25); tail.rotation.z = -.2; scarf.add(tail);
    this.playerCharacter.group.add(scarf);
  }
  public configure(quality: Quality, reducedMotion: boolean) {
    this.adventure.quality = quality; this.adventure.reducedMotion = reducedMotion; saveAdventure(this.adventure); this.applyQuality();
  }
  public finishTutorial() { this.adventure.tutorialDone = true; saveAdventure(this.adventure); }
  private applyQuality() {
    const high = this.adventure.quality === 'high'; const low = this.adventure.quality === 'low' || isSoftwareGl;
    this.renderScale = low ? 1 : high ? 1.75 : 1.25;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.renderScale));
    this.renderer.shadowMap.enabled = !low;
  }

  public dispose() {
    this.disposed = true; this.persist(); this.inputAbort.abort();
    soundManager.stopJetpackLoop(); soundManager.stopVoice();
    this.renderer.domElement.remove();
    cancelAnimationFrame(this.animFrameId);
    clearTimeout(this.animFrameId);
    window.removeEventListener('resize', this.onWindowResize);
    soundManager.stopBGM();
    this.renderer.dispose();
  }
}
