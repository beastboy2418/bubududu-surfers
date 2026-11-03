import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pursuit, CHASE_SECONDS, RECOVERY_SECONDS, accrueScore, overlapsObstacle, chooseWaveLanes, finiteNumber } from '../src/game/rules';
import { districtAt, loadAdventure, safeStorage } from '../src/game/adventure';

// The simulation is exercised without a renderer. Audio is isolated from the
// environment; collision/economy methods are the actual GameEngine methods.
const saved = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
}});
const { GameEngine } = await import('../src/game/gameEngine');
const { soundManager } = await import('../src/audio/soundManager');
for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(soundManager))) {
  if (/^(play|start|stop)/.test(key)) (soundManager as any)[key] = () => {};
}
function obstacle(type = 'barrier_low', laneX = 0, z = 0): any {
  const group = new THREE.Group(); group.position.set(laneX, 0, z);
  return { group, type, laneX, obstacleDepth: 1, passed: false, cleared: false,
    canJumpOver: type === 'barrier_low' || type === 'crate', jumpClearanceY: .55,
    mustSlideUnder: type === 'barrier_high', obstacleHeight: .88 };
}
function engine(): any {
  const value = Object.create(GameEngine.prototype);
  Object.assign(value, {
    _gameState: 'playing', playerCharacter: { group: new THREE.Group() },
    guardCharacter: { group: new THREE.Group() }, bulldogCharacter: { group: new THREE.Group() },
    scene: new THREE.Scene(), trackManager: { obstacles: [], collectibles: [], spawnSkyCoinCluster() {} },
    pursuit: new Pursuit(), selectedCharacterType: 'bubu', playerY: 0, playerYVelocity: 0,
    isFlyingJetpack: false, headstartActive: false, tempInvincibleTimer: 0,
    hoverboardActive: false, loveCarActive: false, feverActive: false, duoActive: false,
    bobaTimer: 0, magnetTimer: 0, multiplier2xTimer: 0, isSliding: false,
    coins: 0, walletCoins: 500, comboCount: 0, feverCharge: 0, togetherCharge: 30,
    currentMission: { id: 'distance_1', current: 0, target: 350, completed: false },
    district: 0, districtChallenge: 0, districtChallengeDone: false,
    consumables: { mysteryBoxes: 1, hoverboards: 3, headstarts: 2, scoreBoosters: 2 },
    mysteryBoxesCollected: 0, adventure: loadAdventure(),
    spawnBurstParticles() {}, addCameraTrauma() {}, removeHoverboard() {},
    triggerCaughtSequence() { this._gameState = 'caught'; },
    persist() {},
  });
  value.guardCharacter.group.visible = false; value.bulldogCharacter.group.visible = false;
  return value;
}

test('clean runs have no pursuit; first hit summons inspector, second separate hit catches', () => {
  const e = engine(); assert.equal(e.pursuit.remaining, 0);
  const first = obstacle(); e.trackManager.obstacles = [first]; e.checkObstacleCollisions();
  assert.equal(e.gameState, 'playing'); assert.equal(e.pursuit.remaining, CHASE_SECONDS);
  assert.equal(e.guardCharacter.group.visible, true); assert.equal(first.passed, true);
  e.pursuit.update(RECOVERY_SECONDS + .01);
  e.trackManager.obstacles.push(obstacle()); e.checkObstacleCollisions();
  assert.equal(e.gameState, 'caught');
});
test('repeated collision in recovery is not a second stumble', () => {
  const e = engine(); e.trackManager.obstacles = [obstacle(), obstacle()];
  e.checkObstacleCollisions(); e.checkObstacleCollisions();
  assert.equal(e.gameState, 'playing'); assert.equal(e.pursuit.remaining, CHASE_SECONDS);
});
test('eight clean seconds escape; the next collision is a fresh first stumble', () => {
  const e = engine(); e.trackManager.obstacles = [obstacle()]; e.checkObstacleCollisions();
  e.pursuit.update(CHASE_SECONDS);
  e.trackManager.obstacles.push(obstacle()); e.checkObstacleCollisions();
  assert.equal(e.gameState, 'playing'); assert.equal(e.pursuit.remaining, CHASE_SECONDS);
});
test('hoverboard absorbs collision without summoning inspector', () => {
  const e = engine(); e.hoverboardActive = true; e.trackManager.obstacles = [obstacle()]; e.checkObstacleCollisions();
  assert.equal(e.hoverboardActive, false); assert.equal(e.pursuit.remaining, 0);
  assert.equal(e.tempInvincibleTimer, 1.4); assert.equal(e.guardCharacter.group.visible, false);
});
test('Boba and Dudu crate specialties prevent unprotected stumbles', () => {
  const e = engine(); e.bobaTimer = 5; e.trackManager.obstacles = [obstacle()]; e.checkObstacleCollisions();
  assert.equal(e.bobaTimer, 0); assert.equal(e.pursuit.remaining, 0);
  e.selectedCharacterType = 'dudu'; e.trackManager.obstacles = [obstacle('crate')]; e.checkObstacleCollisions();
  assert.equal(e.coins, 2); assert.equal(e.pursuit.remaining, 0);
});
test('distant or adjacent-lane obstacles are not destroyed by Fever or Love Car', () => {
  for (const power of ['feverActive', 'loveCarActive']) {
    const e = engine(); e[power] = true;
    const far = obstacle('crate', 0, 50), adjacent = obstacle('crate', 2.2, 0), near = obstacle('crate');
    e.trackManager.obstacles = [far, adjacent, near]; e.checkObstacleCollisions();
    assert.equal(far.passed, false); assert.equal(adjacent.passed, false); assert.equal(near.passed, true); assert.equal(e.coins, 5);
  }
});
test('trampolines require same-lane contact near the ground', () => {
  const e = engine(); e.trackManager.obstacles = [obstacle('trampoline', 2.2)]; e.checkObstacleCollisions();
  assert.equal(e.playerYVelocity, 0);
  e.trackManager.obstacles = [obstacle('trampoline')]; e.playerY = 2; e.checkObstacleCollisions();
  assert.equal(e.playerYVelocity, 0);
  e.playerY = 0; e.checkObstacleCollisions(); assert.equal(e.playerYVelocity, 23.5);
});
test('jump clearance awards charge once for an obstacle', () => {
  const e = engine(); e.playerY = 1; e.trackManager.obstacles = [obstacle()];
  e.checkObstacleCollisions(); e.checkObstacleCollisions();
  assert.equal(e.togetherCharge, 42); assert.equal(e.districtChallenge, 1); assert.equal(e.pursuit.remaining, 0);
});
test('slide clearance keeps the run safe', () => {
  const e = engine(); e.isSliding = true; e.trackManager.obstacles = [obstacle('barrier_high')]; e.checkObstacleCollisions();
  assert.equal(e.pursuit.remaining, 0); assert.equal(e.togetherCharge, 42);
});
test('player coin collection charges Together and persists wallet', () => {
  const e = engine(); const group = new THREE.Group(); group.position.set(0, .8, 0);
  e.trackManager.collectibles = [{group, type:'coin', laneX:0, collected:false}];
  e.checkCollectibleCollisions(); e.checkCollectibleCollisions();
  assert.equal(e.coins, 1); assert.equal(e.walletCoins, 501); assert.equal(e.togetherCharge, 34);
  assert.equal(saved.get('bubududu_wallet_coins'), '501');
});
test('mystery-box pickup enters persistent inventory and cannot be collected twice', () => {
  const e = engine(); const group = new THREE.Group(); group.position.set(0,.8,0);
  e.trackManager.collectibles = [{group, type:'mysterybox', laneX:0, collected:false}];
  e.checkCollectibleCollisions(); e.checkCollectibleCollisions();
  assert.equal(e.consumables.mysteryBoxes, 2); assert.equal(e.mysteryBoxesCollected, 1);
  assert.equal(JSON.parse(saved.get('bubududu_consumables')!).mysteryBoxes, 2);
});
test('opening the final mystery box debits inventory and repeated opening grants nothing', () => {
  const e = engine(); const result = e.openMysteryBox(); assert.ok(result);
  assert.equal(e.consumables.mysteryBoxes, 0);
  const after = JSON.stringify([e.walletCoins, e.consumables]);
  assert.equal(e.openMysteryBox(), null); assert.equal(JSON.stringify([e.walletCoins,e.consumables]),after);
  assert.equal(JSON.parse(saved.get('bubududu_consumables')!).mysteryBoxes, 0);
});
test('Together cannot start below charge threshold or refresh while active', () => {
  const e = engine(); e.activateDuoMode(); assert.equal(e.duoActive, false); assert.equal(e.togetherCharge,30);
  e.duoActive = true; e.duoTimer = 3; e.togetherCharge = 100; e.activateDuoMode();
  assert.equal(e.duoTimer,3); assert.equal(e.togetherCharge,100);
});
test('pause and resume notify the same state callback', () => {
  const e = engine(), states: string[] = []; e.onStateChange = (state: string) => states.push(state);
  e.togglePause(); assert.equal(e.gameState,'paused'); e.togglePause(); assert.equal(e.gameState,'playing');
  assert.deepEqual(states,['paused','playing']);
});
test('cumulative points never decrease when multiplier expires', () => {
  let score = accrueScore(0,100,2); assert.equal(score,200);
  score = accrueScore(score,1,1); assert.equal(score,201);
  assert.equal(accrueScore(score,-10,1),201);
});
test('wave generation always leaves a free lane and avoids duplicate obstacle lanes', () => {
  let seed = 127;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for(let i=0;i<1000;i++) {
    const lanes = chooseWaveLanes(random); assert.ok(lanes.length >= 1 && lanes.length <= 2);
    assert.equal(new Set(lanes).size, lanes.length); assert.ok(lanes.every(n=>n>=0&&n<=2));
    assert.equal(chooseWaveLanes(random,false).length,1);
  }
});
test('spatial bounds include long vehicles but reject other lanes', () => {
  assert.equal(overlapsObstacle(0,5,0,13.8),true); assert.equal(overlapsObstacle(0,20,0,13.8),false);
  assert.equal(overlapsObstacle(0,0,2.2,1),false);
});
test('district boundaries wrap predictably', () => {
  assert.equal(districtAt(0),0); assert.equal(districtAt(599.9),0); assert.equal(districtAt(600),1);
  assert.equal(districtAt(1800),3); assert.equal(districtAt(2400),0);
});
test('malformed saved adventure is sanitized', () => {
  saved.set('bubududu_adventure',JSON.stringify({runs:-1,bestDistance:'bad',visited:[0,0,2,8,'1'],decorations:['lamp','invalid'],quality:'ultra',outfit:'invalid'}));
  const a=loadAdventure(); assert.equal(a.runs,0); assert.equal(a.bestDistance,0); assert.deepEqual(a.visited,[0,2]);
  assert.deepEqual(a.decorations,['lamp']); assert.equal(a.quality,'auto'); assert.equal(a.outfit,'classic');
  saved.delete('bubududu_adventure');
});
test('invalid numeric save values are clamped', () => {
  assert.equal(finiteNumber(Infinity,1,1,5),1); assert.equal(finiteNumber(99,1,1,5),5);
  assert.equal(finiteNumber(null,500),500); assert.equal(finiteNumber(-2,3),0);
});
