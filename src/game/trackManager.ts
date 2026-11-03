import * as THREE from 'three';
import {
  createMultiplier2xModel,
} from './models/characterBuilder';
import { glbItemLoader } from './models/glbItemLoader';
import { soundManager } from '../audio/soundManager';
import { createDistrictScenery } from './districtScenery';
import { DISTRICTS } from './adventure';
import { chooseWaveLanes } from './rules';

// LANES calibrated so Lane 0 is Screen Left, Lane 1 is Screen Center, Lane 2 is Screen Right
export const LANES = [2.2, 0.0, -2.2] as const;
export type LaneIndex = 0 | 1 | 2; // 0: Left, 1: Center, 2: Right

export type ObstacleType = 'crate' | 'barrier_low' | 'barrier_high' | 'train' | 'car' | 'trampoline';
export type CollectibleType =
  | 'coin'
  | 'boba'
  | 'magnet'
  | 'jetpack'
  | 'sneakers'
  | 'multiplier2x'
  | 'pogo'
  | 'mysterybox'
  | 'lovecar'
  | 'duo';

export interface ActiveObstacle {
  id: number;
  type: ObstacleType;
  group: THREE.Group;
  lane: LaneIndex;
  laneX: number;
  passed: boolean;
  canJumpOver: boolean;
  jumpClearanceY: number;
  mustSlideUnder: boolean;
  obstacleHeight: number;
  obstacleDepth: number;
  roofY?: number;
  selfSpeed?: number;
  hasRamp?: boolean;
  cleared?: boolean;
  nearMissAwarded?: boolean;
}

export interface ActiveCollectible {
  id: number;
  type: CollectibleType;
  group: THREE.Group;
  lane: LaneIndex;
  laneX: number;
  collected: boolean;
  value: number;
  selfSpeed?: number;
}

export type SegmentTheme = 'open' | 'bridge' | 'tunnel';

export const THEME_CYCLE: SegmentTheme[] = [
  'open',
  'open',
  'bridge',
  'open',
  'tunnel',
  'tunnel',
  'open',
  'bridge',
];

export interface TrackSegment {
  group: THREE.Group;
  z: number;
  openGroup: THREE.Group;
  bridgeGroup: THREE.Group;
  tunnelGroup: THREE.Group;
  setTheme: (theme: SegmentTheme) => void;
  districtGroups: THREE.Group[];
}

export class TrackManager {
  private scene: THREE.Scene;
  private district = 0;
  private runDistance = 0;
  public obstacles: ActiveObstacle[] = [];
  public collectibles: ActiveCollectible[] = [];
  private trackSegments: TrackSegment[] = [];
  private segmentLength = 40;
  private segmentCount = 6;
  private nextObstacleZ = 45;
  private idCounter = 0;
  private elapsedTime = 0;
  private totalSegmentsSpawned = 0;

  // Track & Environment Materials
  private matRail = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.94, roughness: 0.12 });
  private matTie = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.85 });
  private matGround = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 });
  private matCurb = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 });
  private matSidewalk = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
  private matWall = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 });
  private matWallCoping = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 });
  private matHazardYellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  private matHazardBlack = new THREE.MeshBasicMaterial({ color: 0x09090b });
  private matGantrySteel = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 });
  private matSignalGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  private matSignalYellow = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  private matDecalCyan = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
  private matDecalPink = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
  private matDecalYellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  private matTreeTrunk = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.9 });
  private matSakuraFoliage = new THREE.MeshStandardMaterial({ color: 0xffa5ba, roughness: 0.6 });
  private matLampPole = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
  private matLampLight = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

  // Bridge Overpass Materials
  private matBridgeTruss = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
  private matBridgePillar = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });
  private matBridgeRoad = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 });
  private matBridgeRailing = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.85, roughness: 0.25 });
  private matBridgeWarningBanner = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  private matBridgeBeacon = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

  // Subway Tunnel & Station Materials
  private matTunnelTile = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.15, metalness: 0.05 });
  private matTunnelStripe = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.3 });
  private matTunnelGreenExit = new THREE.MeshBasicMaterial({ color: 0x10b981 });
  private matTunnelStationPlate = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
  private matStationColumn = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.4, roughness: 0.6 });
  private matStationArchBeam = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
  private matStationWarmLight = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });

  // Obstacle & Item Materials
  private matWoodCrate = new THREE.MeshStandardMaterial({ color: 0xc89666, roughness: 0.7 });
  private matCrateBrace = new THREE.MeshStandardMaterial({ color: 0x936538, roughness: 0.8 });
  private matBarrierBar = new THREE.MeshStandardMaterial({ color: 0xff5964, roughness: 0.4 });
  private matBarrierWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  private matTrainBody = new THREE.MeshStandardMaterial({ color: 0x48cae4, roughness: 0.3, metalness: 0.1 });
  private matTrainRoof = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.4 });
  private matTrainWindow = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.1 });
  private matGoldCoin = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.8, roughness: 0.2 });
  private matBobaCup = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.85 });
  private matBobaTea = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.3 });
  private matBobaStraw = new THREE.MeshStandardMaterial({ color: 0xff477e, roughness: 0.3 });
  private matPearl = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.1 });
  private matMagnetRed = new THREE.MeshStandardMaterial({ color: 0xef233c, roughness: 0.3 });
  private matMagnetSilver = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.8, roughness: 0.2 });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initTrack();
  }

  private initTrack() {
    this.totalSegmentsSpawned = 0;
    for (let i = 0; i < this.segmentCount; i++) {
      const segZ = i * this.segmentLength - 20;
      const theme = THEME_CYCLE[this.totalSegmentsSpawned % THEME_CYCLE.length];
      this.totalSegmentsSpawned++;
      const seg = this.createTrackSegment(segZ, theme);
      this.trackSegments.push(seg);
      this.scene.add(seg.group);
    }
  }

  private createTrackSegment(zPos: number, initialTheme: SegmentTheme): TrackSegment {
    const group = new THREE.Group();
    group.position.z = zPos;

    // Main 3-lane road platform
    const groundGeo = new THREE.PlaneGeometry(10.2, this.segmentLength);
    const ground = new THREE.Mesh(groundGeo, this.matGround);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    group.add(ground);

    // Decorative side curbs
    const curbGeo = new THREE.BoxGeometry(0.5, 0.2, this.segmentLength);
    const leftCurb = new THREE.Mesh(curbGeo, this.matCurb);
    leftCurb.position.set(-4.85, 0.1, 0);
    group.add(leftCurb);

    const rightCurb = new THREE.Mesh(curbGeo, this.matCurb);
    rightCurb.position.set(4.85, 0.1, 0);
    group.add(rightCurb);

    // Sidewalk platforms
    const sidewalkGeo = new THREE.BoxGeometry(3.6, 0.25, this.segmentLength);
    const swLeft = new THREE.Mesh(sidewalkGeo, this.matSidewalk);
    swLeft.position.set(-6.8, 0.12, 0);
    swLeft.receiveShadow = true;
    group.add(swLeft);

    const swRight = new THREE.Mesh(sidewalkGeo, this.matSidewalk);
    swRight.position.set(6.8, 0.12, 0);
    swRight.receiveShadow = true;
    group.add(swRight);

    // Rails & Sleepers on each of the 3 lanes
    LANES.forEach((laneX) => {
      const railGeo = new THREE.BoxGeometry(0.08, 0.09, this.segmentLength);
      const railL = new THREE.Mesh(railGeo, this.matRail);
      railL.position.set(laneX - 0.5, 0.045, 0);
      group.add(railL);

      const railR = new THREE.Mesh(railGeo, this.matRail);
      railR.position.set(laneX + 0.5, 0.045, 0);
      group.add(railR);

      const tieCount = 16;
      const tieGeo = new THREE.BoxGeometry(1.35, 0.045, 0.32);
      const ties = new THREE.InstancedMesh(tieGeo, this.matTie, tieCount);
      const transform = new THREE.Object3D();
      for (let t = 0; t < tieCount; t++) {
        transform.position.set(laneX, 0.02, -this.segmentLength / 2 + (t + .5) * this.segmentLength / tieCount);
        transform.updateMatrix(); ties.setMatrixAt(t, transform.matrix);
      }
      group.add(ties);
    });

    // Theme Sub-Groups (Pre-allocated for optimal mobile performance and zero garbage collection)
    const openGroup = new THREE.Group();
    const districtGroups = DISTRICTS.map((_, i) => createDistrictScenery(i, this.totalSegmentsSpawned));
    districtGroups.forEach((g, i) => { g.visible = i === this.district; openGroup.add(g); });
    const bridgeGroup = this.createBridgeGroup();
    const tunnelGroup = this.createTunnelGroup();

    group.add(openGroup);
    group.add(bridgeGroup);
    group.add(tunnelGroup);

    const setTheme = (theme: SegmentTheme) => {
      openGroup.visible = theme === 'open';
      bridgeGroup.visible = theme === 'bridge';
      tunnelGroup.visible = theme === 'tunnel';
    };

    setTheme(initialTheme);

    return { group, z: zPos, openGroup, bridgeGroup, tunnelGroup, setTheme, districtGroups };
  }

  private createOpenGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'OpenCityGroup';

    // Continuous Urban Retaining Walls on both sides!
    const wallL = this.createRetainingWall(-8.6, 'left');
    group.add(wallL);
    const wallR = this.createRetainingWall(8.6, 'right');
    group.add(wallR);

    // Wall-mounted glowing railway signals on both side retaining walls
    const sigL = this.createWallSignal(-8.4, 0);
    group.add(sigL);
    const sigR = this.createWallSignal(8.4, 0);
    group.add(sigR);

    // 3D City Skyline Buildings towering behind retaining walls
    if (Math.random() > 0.5) {
      const bL = glbItemLoader.createModernBuildingModel();
      bL.position.set(-13.2, 0.15, 4);
      group.add(bL);

      const bR = glbItemLoader.createOldBuildingModel();
      bR.position.set(13.8, 0.15, -4);
      group.add(bR);
    } else {
      const bL = glbItemLoader.createOldBuildingModel();
      bL.position.set(-13.8, 0.15, -2);
      group.add(bL);

      const bR = glbItemLoader.createModernBuildingModel();
      bR.position.set(13.2, 0.15, 6);
      group.add(bR);
    }

    // Sakura cherry blossom tree along sidewalk
    const treeGroup = new THREE.Group();
    treeGroup.position.set(6.6, 0.25, 8);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.5, 8), this.matTreeTrunk);
    trunk.position.y = 1.75;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 1), this.matSakuraFoliage);
    foliage.position.y = 4.2;
    foliage.castShadow = true;
    treeGroup.add(foliage);
    group.add(treeGroup);

    // Street lamp on left sidewalk
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-6.2, 0.25, 14);
    const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8), this.matLampPole);
    lampPole.position.y = 2.25;
    lampGroup.add(lampPole);
    const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), this.matLampLight);
    lampHead.position.set(0.3, 4.4, 0);
    lampGroup.add(lampHead);
    group.add(lampGroup);

    return group;
  }

  private createBridgeGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BridgeOverpassGroup';

    // Urban retaining walls on both sides
    const wallL = this.createRetainingWall(-8.6, 'left');
    group.add(wallL);
    const wallR = this.createRetainingWall(8.6, 'right');
    group.add(wallR);

    // Wall signals
    group.add(this.createWallSignal(-8.4, 0));
    group.add(this.createWallSignal(8.4, 0));

    // Heavy concrete bridge piers on outer sidewalk edges (X = -6.4 and +6.4, clear of lanes)
    const pillarGeo = new THREE.BoxGeometry(1.2, 6.4, 2.4);
    const pillarL = new THREE.Mesh(pillarGeo, this.matBridgePillar);
    pillarL.position.set(-6.4, 3.2, 0);
    pillarL.castShadow = true;
    group.add(pillarL);

    const pillarR = new THREE.Mesh(pillarGeo, this.matBridgePillar);
    pillarR.position.set(6.4, 3.2, 0);
    pillarR.castShadow = true;
    group.add(pillarR);

    // Upper steel bridge deck spanning across all 3 tracks: Width 15.6m, Depth 5.4m, Elevation Y=6.4m
    const deckGeo = new THREE.BoxGeometry(15.6, 0.75, 5.4);
    const bridgeDeck = new THREE.Mesh(deckGeo, this.matBridgeTruss);
    bridgeDeck.position.set(0, 6.4, 0);
    bridgeDeck.castShadow = true;
    group.add(bridgeDeck);

    // Asphalt roadway on top of bridge
    const roadGeo = new THREE.BoxGeometry(15.4, 0.08, 4.8);
    const road = new THREE.Mesh(roadGeo, this.matBridgeRoad);
    road.position.set(0, 6.8, 0);
    group.add(road);

    // Safety guardrails & Warren cross struts on bridge
    [-2.5, 2.5].forEach((zOff) => {
      const railGeo = new THREE.BoxGeometry(15.4, 0.6, 0.12);
      const rail = new THREE.Mesh(railGeo, this.matBridgeRailing);
      rail.position.set(0, 7.1, zOff);
      group.add(rail);

      for (let x = -6.0; x <= 6.0; x += 3.0) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6), this.matBridgeTruss);
        post.position.set(x, 7.1, zOff);
        group.add(post);
      }
    });

    // Street lamps mounted on top of bridge
    [-5.5, 5.5].forEach((xOff) => {
      const lampP = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), this.matLampPole);
      lampP.position.set(xOff, 7.9, -2.4);
      group.add(lampP);
      const lampH = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), this.matLampLight);
      lampH.position.set(xOff, 9.0, -2.4);
      group.add(lampH);
    });

    // Heavy underbridge crossbeams
    const girderGeo = new THREE.BoxGeometry(12.8, 0.45, 0.4);
    [-2.2, 0, 2.2].forEach((zOff) => {
      const girder = new THREE.Mesh(girderGeo, this.matBridgeTruss);
      girder.position.set(0, 5.85, zOff);
      group.add(girder);
    });

    // Overhead Subway Clearance Warning Sign suspended from bridge front
    const signGroup = new THREE.Group();
    signGroup.position.set(0, 5.4, -2.8);

    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.65, 0.15), this.matHazardBlack);
    signGroup.add(signBoard);

    const signBanner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.52), this.matBridgeWarningBanner);
    signBanner.position.z = -0.09;
    signBanner.rotation.y = Math.PI;
    signGroup.add(signBanner);

    for (let s = -2.1; s <= 2.1; s += 0.6) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.54, 0.16), this.matHazardBlack);
      stripe.position.set(s, 0, 0);
      stripe.rotation.z = 0.45;
      signGroup.add(stripe);
    }

    [-2.2, 2.2].forEach((bx) => {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this.matBridgeBeacon);
      beacon.position.set(bx, 0.38, -0.06);
      signGroup.add(beacon);
    });
    group.add(signGroup);

    // Skyline buildings towering in background
    const bL = glbItemLoader.createModernBuildingModel();
    bL.position.set(-13.4, 0.15, -6);
    group.add(bL);

    const bR = glbItemLoader.createOldBuildingModel();
    bR.position.set(13.4, 0.15, 6);
    group.add(bR);

    return group;
  }

  private createTunnelGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SubwayStationGroup';

    // 1. Subway Station Retaining Walls on both sides with glossy ceramic subway tiling
    const wallL = this.createSubwayStationWall(-8.6, 'left');
    group.add(wallL);
    const wallR = this.createSubwayStationWall(8.6, 'right');
    group.add(wallR);

    // 2. City Skyline Buildings towering in the background (fully visible, zero obstruction!)
    const bL = glbItemLoader.createModernBuildingModel();
    bL.position.set(-13.4, 0.15, 6);
    group.add(bL);

    const bR = glbItemLoader.createOldBuildingModel();
    bR.position.set(13.4, 0.15, -6);
    group.add(bR);

    // 3. Stately Overhead Subway Portal Arches spanning across the 3 tracks
    // (Arches pass overhead at Z = -12 and Z = 12 with clearance Y = 5.8m so view is completely open!)
    [-12, 12].forEach((zOff) => {
      const archPortal = this.createStationArchPortal(zOff);
      group.add(archPortal);
    });

    return group;
  }

  private createSubwayStationWall(xPos: number, side: 'left' | 'right'): THREE.Group {
    const wallGroup = new THREE.Group();
    wallGroup.position.x = xPos;

    // Main 4.4m tall concrete foundation wall
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, this.segmentLength), this.matWall);
    wall.position.set(0, 2.2, 0);
    wall.receiveShadow = true;
    wallGroup.add(wall);

    // Stone coping ledge on top
    const coping = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, this.segmentLength), this.matWallCoping);
    coping.position.set(0, 4.45, 0);
    wallGroup.add(coping);

    // Platform hazard curb at bottom
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, this.segmentLength), this.matCurb);
    curb.position.set(side === 'left' ? 0.2 : -0.2, 0.1, 0);
    wallGroup.add(curb);

    // Glossy White Subway Tile Panels facing the track
    const tileMesh = new THREE.Mesh(new THREE.PlaneGeometry(this.segmentLength, 3.4), this.matTunnelTile);
    tileMesh.position.set(side === 'left' ? 0.26 : -0.26, 2.0, 0);
    tileMesh.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    wallGroup.add(tileMesh);

    // Horizontal Turquoise Metro Stripe at Y = 2.2
    const stripeMesh = new THREE.Mesh(new THREE.PlaneGeometry(this.segmentLength, 0.35), this.matTunnelStripe);
    stripeMesh.position.set(side === 'left' ? 0.27 : -0.27, 2.2, 0);
    stripeMesh.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    wallGroup.add(stripeMesh);

    // Subway Station Nameplates, Emergency Exit Signs & Sconce Lamps
    const posterZ = [-14, -4, 6, 15];
    posterZ.forEach((zOff, idx) => {
      if (idx % 2 === 0) {
        // Royal Blue Station Nameplate: "LINE 1 CENTRAL"
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.75), this.matTunnelStationPlate);
        plate.position.set(side === 'left' ? 0.28 : -0.28, 2.7, zOff);
        plate.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
        wallGroup.add(plate);
      } else {
        // Emerald Green Exit Sign
        const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), this.matTunnelGreenExit);
        exitSign.position.set(side === 'left' ? 0.28 : -0.28, 2.7, zOff);
        exitSign.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
        wallGroup.add(exitSign);
      }

      // Warm Wall Sconce Lamp above each signboard
      const lampArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), this.matLampPole);
      lampArm.position.set(side === 'left' ? 0.38 : -0.38, 3.4, zOff);
      wallGroup.add(lampArm);

      const lampSconce = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this.matStationWarmLight);
      lampSconce.position.set(side === 'left' ? 0.50 : -0.50, 3.4, zOff);
      wallGroup.add(lampSconce);
    });

    return wallGroup;
  }

  private createStationArchPortal(z: number): THREE.Group {
    const portal = new THREE.Group();
    portal.position.z = z;

    // Upright support pillars on sidewalk platforms (X = -6.2 and +6.2, completely clear of tracks)
    const colGeo = new THREE.BoxGeometry(0.6, 5.6, 0.8);
    const colL = new THREE.Mesh(colGeo, this.matStationColumn);
    colL.position.set(-6.2, 2.8, 0);
    colL.castShadow = true;
    portal.add(colL);

    const colR = new THREE.Mesh(colGeo, this.matStationColumn);
    colR.position.set(6.2, 2.8, 0);
    colR.castShadow = true;
    portal.add(colR);

    // Cross arch beam spanning overhead at Y = 5.6m to 6.2m
    const beamGeo = new THREE.BoxGeometry(13.0, 0.55, 0.8);
    const beam = new THREE.Mesh(beamGeo, this.matStationArchBeam);
    beam.position.set(0, 5.8, 0);
    beam.castShadow = true;
    portal.add(beam);

    // Stately illuminated Subway Station overhead sign
    const signBox = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.16), this.matHazardBlack);
    signBox.position.set(0, 5.8, -0.42);
    portal.add(signBox);

    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.55), this.matTunnelStationPlate);
    signFace.position.set(0, 5.8, -0.51);
    signFace.rotation.y = Math.PI;
    portal.add(signFace);

    // 3 Warm Glowing Pendant Lamps hanging from the arch over each lane!
    LANES.forEach((laneX) => {
      const dropCord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), this.matLampPole);
      dropCord.position.set(laneX, 5.25, 0);
      portal.add(dropCord);

      const lampGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this.matStationWarmLight);
      lampGlobe.position.set(laneX, 4.9, 0);
      portal.add(lampGlobe);
    });

    return portal;
  }

  private createWallSignal(xPos: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(xPos, 0, z);

    // Steel signal post mounted to retaining wall
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 8), this.matGantrySteel);
    post.position.y = 1.9;
    group.add(post);

    // Signal housing box
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.22), this.matHazardBlack);
    box.position.set(xPos < 0 ? 0.2 : -0.2, 3.2, 0);
    group.add(box);

    // Green and Yellow signal lenses
    const greenLens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), this.matSignalGreen);
    greenLens.position.set(xPos < 0 ? 0.2 : -0.2, 3.35, -0.12);
    group.add(greenLens);

    const amberLens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), this.matSignalYellow);
    amberLens.position.set(xPos < 0 ? 0.2 : -0.2, 3.05, -0.12);
    group.add(amberLens);

    return group;
  }

  private createRetainingWall(xPos: number, side: 'left' | 'right'): THREE.Group {
    const wallGroup = new THREE.Group();
    wallGroup.position.x = xPos;

    // Main 4.2m tall concrete trench wall spanning entire 40m segment
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, this.segmentLength), this.matWall);
    wall.position.set(0, 2.2, 0);
    wall.receiveShadow = true;
    wallGroup.add(wall);

    // Top stone coping ledge
    const coping = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, this.segmentLength), this.matWallCoping);
    coping.position.set(0, 4.45, 0);
    wallGroup.add(coping);

    // Hazard base curb
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, this.segmentLength), this.matCurb);
    curb.position.set(side === 'left' ? 0.2 : -0.2, 0.1, 0);
    wallGroup.add(curb);

    // Colorful urban decals / graffiti posters on wall
    const decalZ = [-14, -4, 6, 15];
    const decalMats = [this.matDecalCyan, this.matDecalPink, this.matDecalYellow, this.matDecalCyan];
    decalZ.forEach((zOff, idx) => {
      const decalW = 1.4 + (idx % 2) * 0.8;
      const decalH = 1.0 + (idx % 3) * 0.4;
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(decalW, decalH),
        decalMats[idx % decalMats.length]
      );
      decal.position.set(side === 'left' ? 0.26 : -0.26, 1.8 + (idx % 2) * 0.6, zOff);
      decal.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
      wallGroup.add(decal);
    });

    return wallGroup;
  }

  public update(dt: number, speed: number, magnetActive = false, playerPos: THREE.Vector3, isBubuPassive = false) {
    const moveDist = speed * dt;
    this.runDistance += moveDist;

    // 1. Move track segments backwards
    this.trackSegments.forEach((seg) => {
      seg.group.position.z -= moveDist;
      seg.z = seg.group.position.z;
    });

    // Recycle track segments that passed behind camera
    this.trackSegments.sort((a, b) => a.z - b.z);
    if (this.trackSegments[0].z < -40) {
      const first = this.trackSegments[0];
      const last = this.trackSegments[this.trackSegments.length - 1];
      first.group.position.z = last.z + this.segmentLength;
      first.z = first.group.position.z;
      const nextTheme = THEME_CYCLE[this.totalSegmentsSpawned % THEME_CYCLE.length];
      this.totalSegmentsSpawned++;
      first.setTheme(nextTheme);
    }

    // 2. Move obstacles backwards
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      const extraSpeed = obs.selfSpeed || 0;
      obs.group.position.z -= (moveDist + extraSpeed * dt);

      // Mark passed once entire obstacle depth has moved behind player (player is at Z = 0)
      const halfDepth = obs.obstacleDepth / 2;
      if (obs.group.position.z + halfDepth < -0.8) {
        obs.passed = true;
      }

      // Despawn when far behind
      if (obs.group.position.z < -25) {
        this.scene.remove(obs.group);
        this.obstacles.splice(i, 1);
      }
    }

    // 3. Move collectibles & magnet pull
    this.elapsedTime += dt;
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const col = this.collectibles[i];
      col.group.position.z -= moveDist + (col.selfSpeed || 0) * dt;
      glbItemLoader.updateCollectibleAnimation(col.group, col.type, dt, this.elapsedTime, col.id);

      // Magnet STRICTLY pulls coins ONLY (col.type === 'coin')! Power-ups, sneakers, jetpacks, etc. are NEVER pulled by magnet!
      if ((magnetActive || isBubuPassive) && !col.collected && col.type === 'coin') {
        const pullRadius = magnetActive ? 14 : 2.6;
        const dist = col.group.position.distanceTo(playerPos);
        if (dist < pullRadius) {
          const pullSpeed = dt * 11;
          col.group.position.x = THREE.MathUtils.lerp(col.group.position.x, playerPos.x, pullSpeed);
          col.group.position.y = THREE.MathUtils.lerp(col.group.position.y, playerPos.y + 0.8, pullSpeed);
          col.group.position.z = THREE.MathUtils.lerp(col.group.position.z, playerPos.z, pullSpeed);
        }
      }

      if (col.group.position.z < -20) {
        this.scene.remove(col.group);
        this.collectibles.splice(i, 1);
      }
    }

    // 4. Procedural waves (clean, fair spacing)
    this.nextObstacleZ -= moveDist;
    if (this.nextObstacleZ < 100) {
      this.spawnWave(135);
      this.nextObstacleZ = 135 + Math.random() * 30;
    }
  }

  private spawnWave(spawnZ: number) {
    const laneIndices: LaneIndex[] = [0, 1, 2];
    // Pick 1 or 2 obstacle lanes (ALWAYS leave at least 1 lane completely free!)
    const chosenObsLanes = chooseWaveLanes(Math.random, this.runDistance > 180) as LaneIndex[];

    chosenObsLanes.forEach((laneIdx) => {
      const roll = Math.random();
      if (roll < (this.district === 2 ? 0.32 : 0.10)) {
        this.createTrampolineObstacle(laneIdx, spawnZ);
      } else if (roll < 0.28) {
        this.createCrateObstacle(laneIdx, spawnZ);
      } else if (roll < 0.46) {
        this.createBarrierLowObstacle(laneIdx, spawnZ);
      } else if (roll < (this.district === 1 ? 0.76 : 0.62)) {
        this.createBarrierHighObstacle(laneIdx, spawnZ);
      } else if (roll < 0.82) {
        const isMoving = this.runDistance > 300 && this.district !== 2 && Math.random() > 0.6;
        this.createTrainObstacle(laneIdx, spawnZ, isMoving);
        if (isMoving) {
          soundManager.playTrainHorn();
        }
      } else {
        this.createCarObstacle(laneIdx, spawnZ);
      }
    });

    // On remaining open lanes, spawn collectibles & power-ups!
    const openLanes = laneIndices.filter((idx) => !chosenObsLanes.includes(idx));
    openLanes.forEach((laneIdx) => {
      const itemRoll = Math.random();
      if (itemRoll < 0.07) {
        this.createJetpackCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.14) {
        this.createMagnetCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.21) {
        this.createSneakersCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.28) {
        this.createMultiplierCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.34) {
        this.createPogoCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.40) {
        this.createLoveCarCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.46) {
        this.createDuoCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.52) {
        this.createMysteryBoxCollectible(laneIdx, spawnZ);
      } else if (itemRoll < 0.58) {
        this.createBobaCollectible(laneIdx, spawnZ);
      } else {
        // High density coin trails with gentle arches
        for (let c = 0; c < 3; c++) {
          const coinY = 0.75 + Math.sin((c / 2) * Math.PI) * 0.45;
          this.createCoinCollectible(laneIdx, spawnZ + c * 3.2, coinY);
        }
      }
    });
  }

  // Spawns sky-high lines of coins for Jetpack & Pogo flights
  public spawnSkyCoinCluster(startZ: number, count = 12) {
    const lane: LaneIndex = (Math.floor(Math.random() * 3)) as LaneIndex;
    for (let c = 0; c < count; c++) {
      const zPos = startZ + c * 4.0;
      const yPos = 5.8 + Math.sin(c * 0.5) * 0.6;
      this.createCoinCollectible(lane, zPos, yPos);
    }
  }

  // --- Obstacle Builders with precise clearance stats ---

  private createCrateObstacle(lane: LaneIndex, z: number) {
    const group = new THREE.Group();
    const laneX = LANES[lane];
    group.position.set(laneX, 0, z);

    // Crate box (Height: 0.85, Width: 1.2, Depth: 1.2) - comfortably jumpable
    const crateGeo = new THREE.BoxGeometry(1.2, 0.85, 1.2);
    const crate = new THREE.Mesh(crateGeo, this.matWoodCrate);
    crate.position.y = 0.425;
    crate.castShadow = true;
    group.add(crate);

    const braceGeo = new THREE.BoxGeometry(0.1, 0.86, 1.22);
    const brace = new THREE.Mesh(braceGeo, this.matCrateBrace);
    brace.position.y = 0.425;
    group.add(brace);

    this.scene.add(group);

    this.obstacles.push({
      id: ++this.idCounter,
      type: 'crate',
      group,
      lane,
      laneX,
      passed: false,
      canJumpOver: true,
      jumpClearanceY: 0.65, // If playerY >= 0.65, safely cleared!
      mustSlideUnder: false,
      obstacleHeight: 0.85,
      obstacleDepth: 1.2,
    });
  }

  private createBarrierLowObstacle(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createBarricadeModel();
    const laneX = LANES[lane];
    group.position.set(laneX, 0, z);
    this.scene.add(group);

    this.obstacles.push({
      id: ++this.idCounter,
      type: 'barrier_low',
      group,
      lane,
      laneX,
      passed: false,
      canJumpOver: true,
      jumpClearanceY: 0.55, // If playerY >= 0.55, safely cleared!
      mustSlideUnder: false,
      obstacleHeight: 0.88,
      obstacleDepth: 1.53,
    });
  }

  private createBarrierHighObstacle(lane: LaneIndex, z: number) {
    const group = new THREE.Group();
    const laneX = LANES[lane];
    group.position.set(laneX, 0, z);

    // High Overhead Sign: Clearance underneath is open from Y=0 to Y=1.1!
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8);
    const poleL = new THREE.Mesh(poleGeo, this.matBarrierWhite);
    poleL.position.set(-0.75, 1.3, 0);
    group.add(poleL);

    const poleR = new THREE.Mesh(poleGeo, this.matBarrierWhite);
    poleR.position.set(0.75, 1.3, 0);
    group.add(poleR);

    // Overhead sign block suspended between Y = 1.15 and 2.1
    const signGeo = new THREE.BoxGeometry(1.6, 0.95, 0.12);
    const sign = new THREE.Mesh(signGeo, this.matBarrierBar);
    sign.position.set(0, 1.65, 0);
    sign.castShadow = true;
    group.add(sign);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.14), this.matBarrierWhite);
    stripe.position.set(0, 1.65, 0);
    group.add(stripe);

    this.scene.add(group);

    this.obstacles.push({
      id: ++this.idCounter,
      type: 'barrier_high',
      group,
      lane,
      laneX,
      passed: false,
      canJumpOver: false,
      jumpClearanceY: 999, // Cannot jump over high sign!
      mustSlideUnder: true, // Must slide underneath!
      obstacleHeight: 2.1,
      obstacleDepth: 0.5,
    });
  }

  private createTrainRampMesh(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TrainRamp';

    // Wedge ramp geometry: Width 1.4m, Length 3.6m, Rising from Y=0 to Y=2.25
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, 0.04);
    shape.lineTo(3.6, 2.25);
    shape.lineTo(3.6, 0);
    shape.closePath();

    const extrude = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 1.4,
      bevelEnabled: false,
    });
    extrude.rotateY(Math.PI / 2);
    extrude.translate(0.7, 0, -1.8);

    const rampMesh = new THREE.Mesh(extrude, this.matWoodCrate);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    group.add(rampMesh);

    // Yellow and black warning stripes on the incline
    for (let s = 0; s < 6; s++) {
      const prog = (s + 0.5) / 6;
      const stripeY = prog * 2.25 + 0.02;
      const stripeZ = -1.8 + prog * 3.6;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.04, 0.22),
        s % 2 === 0 ? this.matHazardYellow : this.matHazardBlack
      );
      stripe.position.set(0, stripeY, stripeZ);
      stripe.rotation.x = Math.atan2(2.25, 3.6);
      group.add(stripe);
    }

    return group;
  }

  private createTrainObstacle(lane: LaneIndex, z: number, isMoving = false) {
    const group = glbItemLoader.createIncomingTrainModel(isMoving);
    const laneX = LANES[lane];
    group.position.set(laneX, 0, z);

    // 60% of stationary trains have ramps attached to the front!
    const hasRamp = !isMoving && Math.random() > 0.4;
    if (hasRamp) {
      const ramp = this.createTrainRampMesh();
      // Ramp attaches to front of train (-Z end)
      ramp.position.set(0, 0, -5.1);
      group.add(ramp);
    }

    this.scene.add(group);

    // High-value coin trail on train roof
    for (let c = -2.4; c <= 2.4; c += 1.2) {
      this.createCoinCollectible(lane, z + c, 2.75);
      this.collectibles[this.collectibles.length - 1].selfSpeed = isMoving ? 9.5 : 0;
    }

    this.obstacles.push({
      id: ++this.idCounter,
      type: 'train',
      group,
      lane,
      laneX,
      passed: false,
      canJumpOver: false,
      jumpClearanceY: 999,
      mustSlideUnder: false,
      obstacleHeight: 2.3,
      obstacleDepth: hasRamp ? 13.8 : 6.63,
      roofY: 2.25,
      selfSpeed: isMoving ? 9.5 : 0,
      hasRamp,
    });
  }

  private createCarObstacle(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createBubuDuduCarModel();
    const laneX = LANES[lane];
    group.position.set(laneX, 0, z);
    this.scene.add(group);

    // Coin above car roof
    this.createCoinCollectible(lane, z, 2.35);

    this.obstacles.push({
      id: ++this.idCounter,
      type: 'car',
      group,
      lane,
      laneX,
      passed: false,
      canJumpOver: true,
      jumpClearanceY: 1.55,
      mustSlideUnder: false,
      obstacleHeight: 1.84,
      obstacleDepth: 3.56,
      roofY: 1.84,
    });
  }

  // --- Collectibles ---

  private createCoinCollectible(lane: LaneIndex, z: number, y: number) {
    const group = glbItemLoader.createCoin();
    const laneX = LANES[lane];
    group.position.set(laneX, y, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'coin',
      group,
      lane,
      laneX,
      collected: false,
      value: 1,
    });
  }

  private createBobaCollectible(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createBobaTeaModel();
    const laneX = LANES[lane];
    group.position.set(laneX, 0.85, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'boba',
      group,
      lane,
      laneX,
      collected: false,
      value: 10,
    });
  }

  private createMagnetCollectible(lane: LaneIndex, z: number) {
    const group = new THREE.Group();
    const laneX = LANES[lane];
    group.position.set(laneX, 0.95, z);

    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-0.32, -0.22, 0),
      new THREE.Vector3(-0.32, 0.38, 0),
      new THREE.Vector3(0.32, 0.38, 0),
      new THREE.Vector3(0.32, -0.22, 0)
    );
    const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.08, 8, false);
    const magnetMesh = new THREE.Mesh(tubeGeo, this.matMagnetRed);
    group.add(magnetMesh);

    const tipGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8);
    const tipL = new THREE.Mesh(tipGeo, this.matMagnetSilver);
    tipL.position.set(-0.32, -0.22, 0);
    group.add(tipL);

    const tipR = new THREE.Mesh(tipGeo, this.matMagnetSilver);
    tipR.position.set(0.32, -0.22, 0);
    group.add(tipR);

    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'magnet',
      group,
      lane,
      laneX,
      collected: false,
      value: 5,
    });
  }

  private createJetpackCollectible(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createJetpack(false);
    const laneX = LANES[lane];
    group.position.set(laneX, 0.95, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'jetpack',
      group,
      lane,
      laneX,
      collected: false,
      value: 15,
    });
  }

  private createSneakersCollectible(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createSneakers(false);
    const laneX = LANES[lane];
    group.position.set(laneX, 0.85, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'sneakers',
      group,
      lane,
      laneX,
      collected: false,
      value: 15,
    });
  }

  private createMultiplierCollectible(lane: LaneIndex, z: number) {
    const group = createMultiplier2xModel();
    const laneX = LANES[lane];
    group.position.set(laneX, 0.95, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'multiplier2x',
      group,
      lane,
      laneX,
      collected: false,
      value: 20,
    });
  }

  private createPogoCollectible(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createPogoStick();
    const laneX = LANES[lane];
    group.position.set(laneX, 0.85, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'pogo',
      group,
      lane,
      laneX,
      collected: false,
      value: 20,
    });
  }

  private createMysteryBoxCollectible(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createMysteryBox();
    const laneX = LANES[lane];
    group.position.set(laneX, 0.95, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'mysterybox',
      group,
      lane,
      laneX,
      collected: false,
      value: 50,
    });
  }

  private createLoveCarCollectible(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createLoveCarPickupModel();
    const laneX = LANES[lane];
    group.position.set(laneX, 0.95, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'lovecar',
      group,
      lane,
      laneX,
      collected: false,
      value: 60,
    });
  }

  private createDuoCollectible(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createDuoPickupModel();
    const laneX = LANES[lane];
    group.position.set(laneX, 1.05, z);
    this.scene.add(group);

    this.collectibles.push({
      id: ++this.idCounter,
      type: 'duo',
      group,
      lane,
      laneX,
      collected: false,
      value: 80,
    });
  }

  private createTrampolineObstacle(lane: LaneIndex, z: number) {
    const group = glbItemLoader.createPeachTrampolineModel();
    const laneX = LANES[lane];
    group.position.set(laneX, 0, z);
    this.scene.add(group);

    this.obstacles.push({
      id: ++this.idCounter,
      type: 'trampoline',
      group,
      lane,
      laneX,
      passed: false,
      canJumpOver: true,
      jumpClearanceY: 0,
      mustSlideUnder: false,
      obstacleHeight: 0.7,
      obstacleDepth: 1.2,
    });
  }

  public setDistrict(index: number) {
    this.district = index;
    this.matGround.color.set(DISTRICTS[index].ground);
    this.matSidewalk.color.set(DISTRICTS[index].ground).multiplyScalar(1.3);
    this.matTunnelStripe.color.set(DISTRICTS[index].accent);
    this.trackSegments.forEach(seg => seg.districtGroups.forEach((g, i) => { g.visible = i === index; }));
  }

  public reset() {
    this.runDistance = 0;
    this.obstacles.forEach((obs) => this.scene.remove(obs.group));
    this.collectibles.forEach((col) => this.scene.remove(col.group));
    this.obstacles = [];
    this.collectibles = [];
    this.nextObstacleZ = 45;
    this.totalSegmentsSpawned = 0;

    for (let i = 0; i < this.trackSegments.length; i++) {
      const seg = this.trackSegments[i];
      const segZ = i * this.segmentLength - 20;
      seg.group.position.z = segZ;
      seg.z = segZ;
      const theme = THEME_CYCLE[this.totalSegmentsSpawned % THEME_CYCLE.length];
      this.totalSegmentsSpawned++;
      seg.setTheme(theme);
    }
  }
}
