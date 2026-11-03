import * as THREE from 'three';
import { CharacterFaceTexture, FaceExpression } from './faceTextures';

export type CharacterType = 'bubu' | 'dudu';
export type AnimationState = 'run' | 'jump' | 'slide' | 'stumble' | 'caught' | 'hoverboard' | 'paint';

export interface AnimatedCharacter {
  group: THREE.Group;
  type: CharacterType | 'guard' | 'bulldog';
  updateAnimation: (
    state: AnimationState,
    dt: number,
    speed: number
  ) => void;
  setTilt: (targetTilt: number) => void;
  resetAnimation: () => void;
  faceTexture?: CharacterFaceTexture;
}

// Official color palette directly sampled from reference images:
// bubu-front.jpeg, bubu-back.jpeg, dudu-front.jpeg, dudu-back.jpeg
export const BUBU_COLORS = {
  furWhite: 0xffffff,       // Pure milk-white
  darkChocolate: 0x3c1b14,  // Deep warm dark chocolate (ears, bowtie, collar, tail, soles, outline)
  blushPink: 0xfecace,      // Soft baby petal pink
  tonguePink: 0xfc7e81,     // Sweet coral-rose pink
  outline: 0x3c1b14,        // Dark chocolate outline
};

export const DUDU_COLORS = {
  furCaramel: 0xdca17f,     // Warm teddy peach caramel (sampled from dudu-front.jpeg)
  darkInnerEar: 0x3c1b14,   // Deep dark chocolate inner ear recess (front only)
  blushYellow: 0xfec576,    // Vibrant sunny golden honey yellow blush
  tonguePink: 0xfc7e81,     // Sweet coral-rose pink
  outline: 0x3c1b14,        // Dark chocolate outline
};

/**
 * Creates a stylized soft-diffuse material with zero plastic sheen
 */
const createToonMaterial = (color: number | string, roughness = 0.88) => {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness: 0.0,
  });
};

/**
 * Inverted-Hull Cartoon Outline Generator:
 * Creates a paired mesh with THREE.BackSide scaled slightly outward, producing
 * the exact crisp dark chocolate cartoon outline present in the reference images.
 */
function createToonPart(
  geometry: THREE.BufferGeometry,
  fillMaterial: THREE.Material,
  outlineThickness = 0.032,
  outlineColor = 0x3c1b14
): THREE.Group {
  const container = new THREE.Group();

  // 1. Core mesh
  const coreMesh = new THREE.Mesh(geometry, fillMaterial);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  container.add(coreMesh);

  // 2. Inverted hull outline mesh
  const outlineMat = new THREE.MeshBasicMaterial({
    color: outlineColor,
    side: THREE.BackSide,
  });
  const outlineMesh = new THREE.Mesh(geometry, outlineMat);
  const s = 1 + outlineThickness;
  outlineMesh.scale.set(s, s, s);
  container.add(outlineMesh);

  return container;
}

/**
 * Creates the authentic, plush, cute teddy bear head geometry:
 * A smooth, gently wide teddy bear sphere facing forward along +Z.
 * - Width (X) = 1.16x
 * - Height (Y) = 1.0x
 * - Depth (Z) = 0.98x
 */
function createTeddyBearHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.72, 48, 36);
  geo.scale(1.16, 1.0, 0.98);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates cute chubby teddy bear paws with mitten thumb and pads
 */
function createPawGroup(charType: 'bubu' | 'dudu', isLeft: boolean): THREE.Group {
  const paw = new THREE.Group();
  paw.name = isLeft ? 'LeftPaw' : 'RightPaw';
  const furColor = charType === 'bubu' ? BUBU_COLORS.furWhite : DUDU_COLORS.furCaramel;
  const furMat = createToonMaterial(furColor, 0.9);
  const padColor = charType === 'bubu' ? BUBU_COLORS.darkChocolate : DUDU_COLORS.darkInnerEar;
  const padMat = createToonMaterial(padColor, 0.82);

  // 1. Chubby rounded main paw sphere - enlarged for clear visibility!
  const pawGeo = new THREE.SphereGeometry(0.155, 20, 18);
  pawGeo.scale(1.05, 1.0, 1.15);
  const mainPaw = createToonPart(pawGeo, furMat, 0.038);
  paw.add(mainPaw);

  // 2. Cute mitten thumb pointing slightly inwards and forward
  const thumbGeo = new THREE.SphereGeometry(0.075, 14, 12);
  thumbGeo.scale(0.9, 1.25, 0.95);
  const thumb = createToonPart(thumbGeo, furMat, 0.038);
  const thumbX = isLeft ? 0.11 : -0.11;
  thumb.position.set(thumbX, 0.02, 0.06);
  thumb.rotation.z = isLeft ? -0.45 : 0.45;
  thumb.rotation.x = 0.25;
  paw.add(thumb);

  // 3. Cute paw pad on front palm (high contrast dark chocolate)
  const palmPadGeo = new THREE.SphereGeometry(0.065, 14, 12);
  palmPadGeo.scale(1.0, 0.85, 0.2);
  const palmPad = new THREE.Mesh(palmPadGeo, padMat);
  palmPad.position.set(0, -0.01, 0.15);
  paw.add(palmPad);

  // 4. Three tiny cute toe beans
  const beanGeo = new THREE.SphereGeometry(0.026, 10, 8);
  beanGeo.scale(1.0, 0.85, 0.2);
  const beanXs = [-0.048, 0.0, 0.048];
  beanXs.forEach((bx, idx) => {
    const bean = new THREE.Mesh(beanGeo, padMat);
    const by = idx === 1 ? 0.07 : 0.058;
    bean.position.set(bx, by, 0.145);
    paw.add(bean);
  });

  return paw;
}

/**
 * Creates high-fidelity, glossy 3D facial feature rig for Bubu & Dudu:
 * - Glossy dark chocolate button eyes with dual specular catchlights (twinkle glints)
 * - Soft plush blush cheeks (baby petal pink for Bubu, sunny honey yellow for Dudu)
 * - Soft rounded snout with signature 'ω' bear smile & cute coral pink tongue
 */
function createTeddyBearFaceRig(charType: 'bubu' | 'dudu'): THREE.Group {
  const faceGroup = new THREE.Group();
  faceGroup.name = 'FaceRig';

  // 1. Glossy Dark Chocolate Button Eyes
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1f0f09,
    roughness: 0.18,
    metalness: 0.1,
  });

  const eyeGeo = new THREE.SphereGeometry(0.075, 24, 20);
  eyeGeo.scale(1.0, 1.05, 0.35);

  const catchlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const catchlightGeo1 = new THREE.SphereGeometry(0.024, 12, 12);
  const catchlightGeo2 = new THREE.SphereGeometry(0.012, 8, 8);

  // Left Eye
  const leftEyeGroup = new THREE.Group();
  leftEyeGroup.position.set(-0.175, 0.02, 0.69);
  leftEyeGroup.rotation.y = -0.12;
  leftEyeGroup.add(new THREE.Mesh(eyeGeo, eyeMat));

  const leftGlint1 = new THREE.Mesh(catchlightGeo1, catchlightMat);
  leftGlint1.position.set(0.022, 0.025, 0.025);
  leftEyeGroup.add(leftGlint1);

  const leftGlint2 = new THREE.Mesh(catchlightGeo2, catchlightMat);
  leftGlint2.position.set(-0.022, -0.022, 0.025);
  leftEyeGroup.add(leftGlint2);
  faceGroup.add(leftEyeGroup);

  // Right Eye
  const rightEyeGroup = new THREE.Group();
  rightEyeGroup.position.set(0.175, 0.02, 0.69);
  rightEyeGroup.rotation.y = 0.12;
  rightEyeGroup.add(new THREE.Mesh(eyeGeo, eyeMat));

  const rightGlint1 = new THREE.Mesh(catchlightGeo1, catchlightMat);
  rightGlint1.position.set(0.022, 0.025, 0.025);
  rightEyeGroup.add(rightGlint1);

  const rightGlint2 = new THREE.Mesh(catchlightGeo2, catchlightMat);
  rightGlint2.position.set(-0.022, -0.022, 0.025);
  rightEyeGroup.add(rightGlint2);
  faceGroup.add(rightEyeGroup);

  // 2. Signature Blush Cheeks
  const blushColor = charType === 'bubu' ? 0xffb6c1 : 0xfec576;
  const blushMat = new THREE.MeshBasicMaterial({
    color: blushColor,
    transparent: true,
    opacity: 0.95,
  });
  const blushGeo = new THREE.SphereGeometry(0.13, 20, 16);
  blushGeo.scale(1.15, 0.85, 0.18);

  const leftBlush = new THREE.Mesh(blushGeo, blushMat);
  leftBlush.position.set(-0.35, -0.08, 0.62);
  leftBlush.rotation.y = -0.25;
  faceGroup.add(leftBlush);

  const rightBlush = new THREE.Mesh(blushGeo, blushMat);
  rightBlush.position.set(0.35, -0.08, 0.62);
  rightBlush.rotation.y = 0.25;
  faceGroup.add(rightBlush);

  // 3. Cute Bear Snout & 'ω' Smile with Pink Tongue
  const snoutColor = charType === 'bubu' ? BUBU_COLORS.furWhite : DUDU_COLORS.furCaramel;
  const snoutMat = createToonMaterial(snoutColor, 0.92);
  const snoutGeo = new THREE.SphereGeometry(0.16, 24, 18);
  snoutGeo.scale(1.15, 0.72, 0.35);
  const snoutMesh = createToonPart(snoutGeo, snoutMat, 0.035);
  snoutMesh.position.set(0, -0.07, 0.66);
  faceGroup.add(snoutMesh);

  // Signature 'ω' mouth curves (dark chocolate)
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x3c1b14 });
  const curveL = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16, Math.PI), mouthMat);
  curveL.position.set(-0.04, -0.065, 0.725);
  curveL.rotation.z = Math.PI;
  faceGroup.add(curveL);

  const curveR = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16, Math.PI), mouthMat);
  curveR.position.set(0.04, -0.065, 0.725);
  curveR.rotation.z = Math.PI;
  faceGroup.add(curveR);

  // Sweet coral-rose tongue peeking out
  const tongueGeo = new THREE.SphereGeometry(0.042, 16, 14);
  tongueGeo.scale(1.0, 0.9, 0.3);
  const tongueMat = new THREE.MeshBasicMaterial({ color: 0xfc7e81 });
  const tongue = new THREE.Mesh(tongueGeo, tongueMat);
  tongue.position.set(0, -0.11, 0.725);
  faceGroup.add(tongue);

  return faceGroup;
}

/**
 * Creates Bubu: 100% authentic to bubu-front.jpeg and bubu-back.jpeg
 * - Pure milky-white teddy bear fur
 * - Solid dark chocolate circular bear ears on front AND back
 * - Dark chocolate collar band circling the neck (visible from front & back)
 * - Soft rounded dark chocolate bowtie at the front collar
 * - Solid dark chocolate round ball tail on lower back
 * - Dark chocolate soles under both feet
 * - 3D glossy button eyes with twin white catchlights, cute 'ω' snout & sweet pink tongue
 * - Fully modeled plush teddy bear paws with mitten thumbs and pads
 */
export function createBubuModel(): AnimatedCharacter {
  const group = new THREE.Group();
  group.name = 'Bubu';

  const faceTexture = new CharacterFaceTexture('bubu');

  // Materials
  const whiteFurMat = createToonMaterial(BUBU_COLORS.furWhite, 0.92);
  const darkChocoMat = createToonMaterial(BUBU_COLORS.darkChocolate, 0.82);

  const characterRoot = new THREE.Group();
  group.add(characterRoot);

  // 1. Chubby Pear Torso with Toon Outline
  const torsoGeo = new THREE.SphereGeometry(0.56, 36, 28);
  torsoGeo.scale(1.08, 0.98, 0.92);
  const torso = createToonPart(torsoGeo, whiteFurMat, 0.035);
  torso.position.set(0, 0.62, 0);
  characterRoot.add(torso);

  // 2. Cute Teddy Bear Head with Toon Outline & 3D Feature Rig
  const headGeo = createTeddyBearHeadGeometry();
  const headContainer = new THREE.Group();
  headContainer.position.set(0, 1.34, 0.02);
  headContainer.rotation.set(0, 0, 0);

  const headMesh = createToonPart(headGeo, whiteFurMat, 0.032);
  headContainer.add(headMesh);

  // 3. 3D Geometric Face Rig
  const faceRig = createTeddyBearFaceRig('bubu');
  headContainer.add(faceRig);

  // 4. Cute Circular Bear Ears (attached directly to headContainer!)
  const earGeo = new THREE.SphereGeometry(0.20, 24, 20);
  earGeo.scale(1.0, 1.0, 0.55);

  const leftEar = createToonPart(earGeo, darkChocoMat, 0.035);
  leftEar.position.set(-0.62, 0.60, 0.02);
  leftEar.rotation.z = -0.20;
  headContainer.add(leftEar);

  const rightEar = createToonPart(earGeo, darkChocoMat, 0.035);
  rightEar.position.set(0.62, 0.60, 0.02);
  rightEar.rotation.z = 0.20;
  headContainer.add(rightEar);

  characterRoot.add(headContainer);

  // 5. Dark Chocolate Neck Collar Band
  const collarGeo = new THREE.CylinderGeometry(0.44, 0.46, 0.07, 32);
  const collarMesh = new THREE.Mesh(collarGeo, darkChocoMat);
  collarMesh.position.set(0, 0.84, 0.02);
  characterRoot.add(collarMesh);

  // 6. Soft Rounded Dark Chocolate Bowtie
  const bowTieGroup = new THREE.Group();
  bowTieGroup.position.set(0, 0.83, 0.50);

  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 16), darkChocoMat);
  bowTieGroup.add(knot);

  const wingGeo = new THREE.SphereGeometry(0.09, 16, 14);
  wingGeo.scale(1.2, 0.8, 0.4);

  const leftWing = createToonPart(wingGeo, darkChocoMat, 0.035);
  leftWing.position.set(-0.11, 0, -0.01);
  leftWing.rotation.z = 0.15;
  bowTieGroup.add(leftWing);

  const rightWing = createToonPart(wingGeo, darkChocoMat, 0.035);
  rightWing.position.set(0.11, 0, -0.01);
  rightWing.rotation.z = -0.15;
  bowTieGroup.add(rightWing);

  characterRoot.add(bowTieGroup);

  // 7. Solid Dark Chocolate Round Tail on Lower Back
  const tailGeo = new THREE.SphereGeometry(0.14, 20, 18);
  const tail = createToonPart(tailGeo, darkChocoMat, 0.04);
  tail.position.set(0, 0.36, -0.46);
  characterRoot.add(tail);

  // 8. Stubby Arms with Fully Modeled Teddy Bear Paws & Thumbs
  const armGeo = new THREE.CapsuleGeometry(0.115, 0.20, 12, 16);
  armGeo.translate(0, -0.10, 0);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.62, 0.84, 0.04);
  const leftArm = createToonPart(armGeo, whiteFurMat, 0.035);
  leftArmPivot.add(leftArm);
  const leftPaw = createPawGroup('bubu', true);
  leftPaw.position.set(-0.02, -0.25, 0.05);
  leftArmPivot.add(leftPaw);
  characterRoot.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.62, 0.84, 0.04);
  const rightArm = createToonPart(armGeo, whiteFurMat, 0.035);
  rightArmPivot.add(rightArm);
  const rightPaw = createPawGroup('bubu', false);
  rightPaw.position.set(0.02, -0.25, 0.05);
  rightArmPivot.add(rightPaw);
  characterRoot.add(rightArmPivot);

  // 8. Stubby Legs with Dark Chocolate Soles (bubu-front.jpeg & bubu-back.jpeg)
  const legGeo = new THREE.CapsuleGeometry(0.14, 0.22, 12, 16);
  legGeo.translate(0, -0.11, 0);

  const soleGeo = new THREE.CylinderGeometry(0.142, 0.142, 0.06, 16);
  soleGeo.translate(0, -0.21, 0.01);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.25, 0.35, 0.0);
  const leftLeg = createToonPart(legGeo, whiteFurMat, 0.035);
  leftLegPivot.add(leftLeg);
  const leftSole = new THREE.Mesh(soleGeo, darkChocoMat);
  leftSole.castShadow = true;
  leftLegPivot.add(leftSole);
  characterRoot.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.25, 0.35, 0.0);
  const rightLeg = createToonPart(legGeo, whiteFurMat, 0.035);
  rightLegPivot.add(rightLeg);
  const rightSole = new THREE.Mesh(soleGeo, darkChocoMat);
  rightSole.castShadow = true;
  rightLegPivot.add(rightSole);
  characterRoot.add(rightLegPivot);

  // Animation controllers
  let runTime = 0;
  let currentTilt = 0;

  const updateAnimation = (
    state: AnimationState,
    dt: number,
    speed: number
  ) => {
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, currentTilt, 0.22);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, -currentTilt * 0.35, 0.22);

    if (state === 'run') {
      faceTexture.setExpression('normal');
      runTime += dt * Math.min(speed, 35);
      const cycle = runTime * 0.75;

      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0, 0);
      characterRoot.rotation.set(0, 0, 0);

      leftLegPivot.rotation.x = Math.sin(cycle) * 0.75;
      rightLegPivot.rotation.x = -Math.sin(cycle) * 0.75;
      leftLegPivot.rotation.y = 0;
      rightLegPivot.rotation.y = 0;
      leftLegPivot.rotation.z = 0;
      rightLegPivot.rotation.z = 0;

      leftArmPivot.rotation.x = -Math.sin(cycle) * 0.75;
      rightArmPivot.rotation.x = Math.sin(cycle) * 0.75;
      leftArmPivot.rotation.y = 0.15;
      rightArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = -0.28 - Math.abs(Math.sin(cycle)) * 0.06;
      rightArmPivot.rotation.z = 0.28 + Math.abs(Math.sin(cycle)) * 0.06;

      characterRoot.position.y = Math.abs(Math.sin(cycle * 2)) * 0.08;
      headContainer.rotation.x = Math.sin(cycle * 2) * 0.04;
    } else if (state === 'jump') {
      faceTexture.setExpression('jump');
      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0, 0);
      characterRoot.rotation.set(0, 0, 0);

      leftArmPivot.rotation.x = THREE.MathUtils.lerp(leftArmPivot.rotation.x, -2.1, 0.25);
      rightArmPivot.rotation.x = THREE.MathUtils.lerp(rightArmPivot.rotation.x, -2.1, 0.25);
      leftArmPivot.rotation.y = 0.15;
      rightArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = -0.45;
      rightArmPivot.rotation.z = 0.45;

      leftLegPivot.rotation.x = THREE.MathUtils.lerp(leftLegPivot.rotation.x, 0.65, 0.25);
      rightLegPivot.rotation.x = THREE.MathUtils.lerp(rightLegPivot.rotation.x, 0.45, 0.25);
      headContainer.rotation.x = -0.15;
    } else if (state === 'slide') {
      faceTexture.setExpression('slide');
      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, -0.26, 0.08);
      characterRoot.rotation.set(0.12, 0, 0);

      rightLegPivot.rotation.x = -1.45;
      rightLegPivot.rotation.y = 0.08;
      rightLegPivot.rotation.z = 0.12;

      leftLegPivot.rotation.x = 0.9;
      leftLegPivot.rotation.y = -0.1;
      leftLegPivot.rotation.z = -0.15;

      leftArmPivot.rotation.x = 0.85;
      rightArmPivot.rotation.x = 0.85;
      leftArmPivot.rotation.y = 0.15;
      rightArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = -0.40;
      rightArmPivot.rotation.z = 0.40;

      headContainer.rotation.x = -0.08;
    } else if (state === 'hoverboard') {
      faceTexture.setExpression('happy');
      runTime += dt * 4.5;
      const surfBob = Math.sin(runTime) * 0.025;
      const surfSway = Math.sin(runTime * 0.8) * 0.04;

      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0.04 + surfBob, 0);
      // Authentic skater/surfer stance: angled 20deg sideways, knees bent, arms out for athletic balance
      characterRoot.rotation.set(0.04, 0.32, surfSway);

      leftLegPivot.rotation.set(-0.25, 0.1, -0.15);
      rightLegPivot.rotation.set(0.28, -0.1, 0.15);

      leftArmPivot.rotation.set(-0.45, 0.1, -0.55 + surfSway);
      rightArmPivot.rotation.set(0.45, -0.1, 0.55 - surfSway);

      // Head cancels out the body 0.32 rad rotation so eyes look straight down the track!
      headContainer.rotation.set(-0.06, -0.32, 0);
    } else if (state === 'paint') {
      faceTexture.setExpression('happy');
      runTime += dt * 8.0;
      const sprayShake = Math.sin(runTime) * 0.16;
      const wristWobble = Math.cos(runTime * 0.8) * 0.10;

      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0, 0);
      characterRoot.rotation.set(0, 0.12, 0);

      // Right arm raised high to chest/shoulder level pointing forward at train wall!
      rightArmPivot.rotation.x = -1.45 + sprayShake;
      rightArmPivot.rotation.y = 0.22 + wristWobble;
      rightArmPivot.rotation.z = -0.32;

      // Left arm casually held back on hip for balance
      leftArmPivot.rotation.x = 0.35;
      leftArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = 0.40;

      // Natural artist stance
      rightLegPivot.rotation.set(0.12, 0, 0.05);
      leftLegPivot.rotation.set(-0.15, 0, -0.05);

      // Head tilted up looking proudly at the graffiti artwork!
      headContainer.rotation.set(-0.25, 0.18, 0.08);
    } else if (state === 'caught' || state === 'stumble') {
      faceTexture.setExpression('caught');
      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, -0.26, 0.12);
      characterRoot.rotation.set(-0.35, 0, 0);

      leftLegPivot.rotation.x = -1.35;
      rightLegPivot.rotation.x = -1.35;
      leftLegPivot.rotation.y = 0;
      rightLegPivot.rotation.y = 0;
      leftLegPivot.rotation.z = -0.32;
      rightLegPivot.rotation.z = 0.32;

      leftArmPivot.rotation.x = -0.7;
      rightArmPivot.rotation.x = -0.7;
      leftArmPivot.rotation.z = -0.4;
      rightArmPivot.rotation.z = 0.4;

      headContainer.rotation.x = 0.15;
    }
  };

  const setTilt = (targetTilt: number) => {
    currentTilt = targetTilt;
  };

  const resetAnimation = () => {
    runTime = 0;
    currentTilt = 0;
    group.rotation.set(0, 0, 0);
    characterRoot.scale.set(1, 1, 1);
    characterRoot.position.set(0, 0, 0);
    characterRoot.rotation.set(0, 0, 0);
    headContainer.rotation.set(0, 0, 0);
    faceTexture.setExpression('normal');
  };

  return {
    group,
    type: 'bubu',
    updateAnimation,
    setTilt,
    resetAnimation,
    faceTexture,
  };
}

/**
 * Creates Dudu: 100% authentic to dudu-front.jpeg and dudu-back.jpeg
 * - Warm teddy peach caramel fur (sampled #dca17f)
 * - Caramel outer ear with dark chocolate inner recess on FRONT ONLY
 * - Back of ears is 100% solid caramel (dudu-back.jpeg)
 * - NO collar, NO bowtie (clean caramel neck)
 * - Round caramel peach ball tail with dark chocolate outline (dudu-back.jpeg)
 * - Solid caramel peach feet (NO dark soles - dudu-front & dudu-back)
 * - Low-placed eyes and cute bear snout with pink tongue (zero nose dot)
 */
export function createDuduModel(): AnimatedCharacter {
  const group = new THREE.Group();
  group.name = 'Dudu';

  const faceTexture = new CharacterFaceTexture('dudu');

  // Materials
  const caramelFurMat = createToonMaterial(DUDU_COLORS.furCaramel, 0.88);
  const darkInnerEarMat = createToonMaterial(DUDU_COLORS.darkInnerEar, 0.82);

  const headMat = new THREE.MeshStandardMaterial({
    map: faceTexture.texture,
    roughness: 0.88,
    metalness: 0.0,
  });

  const characterRoot = new THREE.Group();
  group.add(characterRoot);

  // 1. Chubby Caramel Torso with Toon Outline
  const torsoGeo = new THREE.SphereGeometry(0.56, 36, 28);
  torsoGeo.scale(1.08, 0.98, 0.92);
  const torso = createToonPart(torsoGeo, caramelFurMat, 0.035);
  torso.position.set(0, 0.62, 0);
  characterRoot.add(torso);

  // 2. Cute Teddy Bear Head with Toon Outline & 3D Feature Rig
  const headGeo = createTeddyBearHeadGeometry();
  const headContainer = new THREE.Group();
  headContainer.position.set(0, 1.34, 0.02);
  headContainer.rotation.set(0, 0, 0);

  const headMesh = createToonPart(headGeo, caramelFurMat, 0.032);
  headContainer.add(headMesh);

  // 3. 3D Geometric Face Rig (Glossy button eyes, snout, smile & sunny golden blush)
  const faceRig = createTeddyBearFaceRig('dudu');
  headContainer.add(faceRig);

  // 4. Caramel Ears with Dark Chocolate Inner Cavity (attached directly to headContainer!)
  const earGeo = new THREE.SphereGeometry(0.20, 24, 20);
  earGeo.scale(1.0, 1.0, 0.55);

  const innerGeo = new THREE.SphereGeometry(0.12, 18, 16);
  innerGeo.scale(1.0, 1.0, 0.25);

  // Left ear assembly
  const leftEarGroup = new THREE.Group();
  leftEarGroup.position.set(-0.62, 0.60, 0.02);
  leftEarGroup.rotation.z = -0.20;
  const leftEar = createToonPart(earGeo, caramelFurMat, 0.035);
  leftEarGroup.add(leftEar);
  const leftInner = new THREE.Mesh(innerGeo, darkInnerEarMat);
  leftInner.position.set(0, 0, 0.07);
  leftEarGroup.add(leftInner);
  headContainer.add(leftEarGroup);

  // Right ear assembly
  const rightEarGroup = new THREE.Group();
  rightEarGroup.position.set(0.62, 0.60, 0.02);
  rightEarGroup.rotation.z = 0.20;
  const rightEar = createToonPart(earGeo, caramelFurMat, 0.035);
  rightEarGroup.add(rightEar);
  const rightInner = new THREE.Mesh(innerGeo, darkInnerEarMat);
  rightInner.position.set(0, 0, 0.07);
  rightEarGroup.add(rightInner);
  headContainer.add(rightEarGroup);

  characterRoot.add(headContainer);

  // 5. Caramel Round Tail on Lower Back
  const tailGeo = new THREE.SphereGeometry(0.14, 20, 18);
  const tail = createToonPart(tailGeo, caramelFurMat, 0.04);
  tail.position.set(0, 0.36, -0.46);
  characterRoot.add(tail);

  // 6. Short Stubby Caramel Arms with Fully Modeled Teddy Bear Paws & Thumbs
  const armGeo = new THREE.CapsuleGeometry(0.115, 0.20, 12, 16);
  armGeo.translate(0, -0.10, 0);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.62, 0.84, 0.04);
  const leftArm = createToonPart(armGeo, caramelFurMat, 0.035);
  leftArmPivot.add(leftArm);
  const leftPaw = createPawGroup('dudu', true);
  leftPaw.position.set(-0.02, -0.25, 0.05);
  leftArmPivot.add(leftPaw);
  characterRoot.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.62, 0.84, 0.04);
  const rightArm = createToonPart(armGeo, caramelFurMat, 0.035);
  rightArmPivot.add(rightArm);
  const rightPaw = createPawGroup('dudu', false);
  rightPaw.position.set(0.02, -0.25, 0.05);
  rightArmPivot.add(rightPaw);
  characterRoot.add(rightArmPivot);

  // 6. Stubby Caramel Legs (NO dark soles - dudu-front.jpeg & dudu-back.jpeg)
  const legGeo = new THREE.CapsuleGeometry(0.14, 0.22, 12, 16);
  legGeo.translate(0, -0.11, 0);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.25, 0.35, 0.0);
  const leftLeg = createToonPart(legGeo, caramelFurMat, 0.035);
  leftLegPivot.add(leftLeg);
  characterRoot.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.25, 0.35, 0.0);
  const rightLeg = createToonPart(legGeo, caramelFurMat, 0.035);
  rightLegPivot.add(rightLeg);
  characterRoot.add(rightLegPivot);

  // Animation controllers
  let runTime = 0;
  let currentTilt = 0;

  const updateAnimation = (
    state: AnimationState,
    dt: number,
    speed: number
  ) => {
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, currentTilt, 0.22);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, -currentTilt * 0.35, 0.22);

    if (state === 'run') {
      faceTexture.setExpression('normal');
      runTime += dt * Math.min(speed, 35);
      const cycle = runTime * 0.75;

      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0, 0);
      characterRoot.rotation.set(0, 0, 0);

      leftLegPivot.rotation.x = Math.sin(cycle) * 0.75;
      rightLegPivot.rotation.x = -Math.sin(cycle) * 0.75;
      leftLegPivot.rotation.y = 0;
      rightLegPivot.rotation.y = 0;
      leftLegPivot.rotation.z = 0;
      rightLegPivot.rotation.z = 0;

      leftArmPivot.rotation.x = -Math.sin(cycle) * 0.75;
      rightArmPivot.rotation.x = Math.sin(cycle) * 0.75;
      leftArmPivot.rotation.y = 0.15;
      rightArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = -0.28 - Math.abs(Math.sin(cycle)) * 0.06;
      rightArmPivot.rotation.z = 0.28 + Math.abs(Math.sin(cycle)) * 0.06;

      characterRoot.position.y = Math.abs(Math.sin(cycle * 2)) * 0.08;
      headContainer.rotation.x = Math.sin(cycle * 2) * 0.04;
    } else if (state === 'jump') {
      faceTexture.setExpression('jump');
      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0, 0);
      characterRoot.rotation.set(0, 0, 0);

      leftArmPivot.rotation.x = THREE.MathUtils.lerp(leftArmPivot.rotation.x, -2.1, 0.25);
      rightArmPivot.rotation.x = THREE.MathUtils.lerp(rightArmPivot.rotation.x, -2.1, 0.25);
      leftArmPivot.rotation.y = 0.15;
      rightArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = -0.45;
      rightArmPivot.rotation.z = 0.45;

      leftLegPivot.rotation.x = THREE.MathUtils.lerp(leftLegPivot.rotation.x, 0.65, 0.25);
      rightLegPivot.rotation.x = THREE.MathUtils.lerp(rightLegPivot.rotation.x, 0.45, 0.25);
      headContainer.rotation.x = -0.15;
    } else if (state === 'slide') {
      faceTexture.setExpression('slide');
      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, -0.26, 0.08);
      characterRoot.rotation.set(0.12, 0, 0);

      rightLegPivot.rotation.x = -1.45;
      rightLegPivot.rotation.y = 0.08;
      rightLegPivot.rotation.z = 0.12;

      leftLegPivot.rotation.x = 0.9;
      leftLegPivot.rotation.y = -0.1;
      leftLegPivot.rotation.z = -0.15;

      leftArmPivot.rotation.x = 0.85;
      rightArmPivot.rotation.x = 0.85;
      leftArmPivot.rotation.y = 0.15;
      rightArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = -0.40;
      rightArmPivot.rotation.z = 0.40;

      headContainer.rotation.x = -0.08;
    } else if (state === 'hoverboard') {
      faceTexture.setExpression('happy');
      runTime += dt * 4.5;
      const surfBob = Math.sin(runTime) * 0.025;
      const surfSway = Math.sin(runTime * 0.8) * 0.04;

      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0.04 + surfBob, 0);
      // Authentic skater/surfer stance: angled 20deg sideways, knees bent, arms out for athletic balance
      characterRoot.rotation.set(0.04, 0.32, surfSway);

      leftLegPivot.rotation.set(-0.25, 0.1, -0.15);
      rightLegPivot.rotation.set(0.28, -0.1, 0.15);

      leftArmPivot.rotation.set(-0.45, 0.1, -0.55 + surfSway);
      rightArmPivot.rotation.set(0.45, -0.1, 0.55 - surfSway);

      // Head cancels out the body 0.32 rad rotation so eyes look straight down the track!
      headContainer.rotation.set(-0.06, -0.32, 0);
    } else if (state === 'paint') {
      faceTexture.setExpression('happy');
      runTime += dt * 8.0;
      const sprayShake = Math.sin(runTime) * 0.16;
      const wristWobble = Math.cos(runTime * 0.8) * 0.10;

      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, 0, 0);
      characterRoot.rotation.set(0, 0.12, 0);

      // Right arm raised high to chest/shoulder level pointing forward at train wall!
      rightArmPivot.rotation.x = -1.45 + sprayShake;
      rightArmPivot.rotation.y = 0.22 + wristWobble;
      rightArmPivot.rotation.z = -0.32;

      // Left arm casually held back on hip for balance
      leftArmPivot.rotation.x = 0.35;
      leftArmPivot.rotation.y = -0.15;
      leftArmPivot.rotation.z = 0.40;

      // Natural artist stance
      rightLegPivot.rotation.set(0.12, 0, 0.05);
      leftLegPivot.rotation.set(-0.15, 0, -0.05);

      // Head tilted up looking proudly at the graffiti artwork!
      headContainer.rotation.set(-0.25, 0.18, 0.08);
    } else if (state === 'caught' || state === 'stumble') {
      faceTexture.setExpression('caught');
      characterRoot.scale.set(1, 1, 1);
      characterRoot.position.set(0, -0.26, 0.12);
      characterRoot.rotation.set(-0.35, 0, 0);

      leftLegPivot.rotation.x = -1.35;
      rightLegPivot.rotation.x = -1.35;
      leftLegPivot.rotation.y = 0;
      rightLegPivot.rotation.y = 0;
      leftLegPivot.rotation.z = -0.32;
      rightLegPivot.rotation.z = 0.32;

      leftArmPivot.rotation.x = -0.7;
      rightArmPivot.rotation.x = -0.7;
      leftArmPivot.rotation.z = -0.4;
      rightArmPivot.rotation.z = 0.4;

      headContainer.rotation.x = 0.15;
    }
  };

  const setTilt = (targetTilt: number) => {
    currentTilt = targetTilt;
  };

  const resetAnimation = () => {
    runTime = 0;
    currentTilt = 0;
    group.rotation.set(0, 0, 0);
    characterRoot.scale.set(1, 1, 1);
    characterRoot.position.set(0, 0, 0);
    characterRoot.rotation.set(0, 0, 0);
    headContainer.rotation.set(0, 0, 0);
    faceTexture.setExpression('normal');
  };

  return {
    group,
    type: 'dudu',
    updateAnimation,
    setTilt,
    resetAnimation,
    faceTexture,
  };
}

/**
 * Creates the Security Guard (Subway Inspector) Chaser
 */
export function createGuardModel(): AnimatedCharacter {
  const group = new THREE.Group();
  group.name = 'SecurityGuard';

  const uniformMat = createToonMaterial(0x1d3557, 0.6);
  const guardSkinMat = createToonMaterial(0x7f4f3b, 0.7);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4a261, metalness: 0.5, roughness: 0.2 });
  const blackVisorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.25 });
  const whistleMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.7, roughness: 0.2 });

  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const torsoGeo = new THREE.CylinderGeometry(0.55, 0.45, 1.0, 16);
  const torso = createToonPart(torsoGeo, uniformMat, 0.035);
  torso.position.set(0, 0.95, 0);
  bodyRoot.add(torso);

  for (let b = 0; b < 3; b++) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), goldMat);
    button.rotation.x = Math.PI / 2;
    button.position.set(0, 1.25 - b * 0.18, 0.48);
    bodyRoot.add(button);
  }

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 16), blackVisorMat);
  belt.position.set(0, 0.55, 0);
  bodyRoot.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.04), goldMat);
  buckle.position.set(0, 0.55, 0.49);
  bodyRoot.add(buckle);

  const headGeo = new THREE.SphereGeometry(0.55, 20, 18);
  const head = createToonPart(headGeo, guardSkinMat, 0.035);
  head.position.set(0, 1.75, 0.02);
  bodyRoot.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), eyeMat);
  leftEye.position.set(-0.2, 1.78, 0.5);
  bodyRoot.add(leftEye);

  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), eyeMat);
  rightEye.position.set(0.2, 1.78, 0.5);
  bodyRoot.add(rightEye);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), guardSkinMat);
  snout.scale.set(1.2, 0.8, 1.0);
  snout.position.set(0, 1.62, 0.48);
  bodyRoot.add(snout);

  const whistle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), whistleMat);
  whistle.rotation.x = 0.5;
  whistle.position.set(0, 1.48, 0.5);
  bodyRoot.add(whistle);

  const capGroup = new THREE.Group();
  capGroup.position.set(0, 2.15, 0);

  const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.44, 0.26, 16), uniformMat);
  capGroup.add(capCrown);

  const capVisor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.54, 0.04, 16, 1, false, 0, Math.PI),
    blackVisorMat
  );
  capVisor.position.set(0, -0.08, 0.12);
  capVisor.rotation.x = 0.25;
  capGroup.add(capVisor);

  const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), goldMat);
  badge.scale.set(1, 1.4, 0.3);
  badge.position.set(0, 0.02, 0.48);
  capGroup.add(badge);
  bodyRoot.add(capGroup);

  const armGeo = new THREE.CapsuleGeometry(0.16, 0.45, 10, 16);
  armGeo.translate(0, -0.22, 0);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.65, 1.25, 0);
  const leftArm = createToonPart(armGeo, uniformMat, 0.035);
  leftArmPivot.add(leftArm);
  group.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.65, 1.25, 0);
  const rightArm = createToonPart(armGeo, uniformMat, 0.035);
  rightArmPivot.add(rightArm);
  group.add(rightArmPivot);

  const legGeo = new THREE.CapsuleGeometry(0.18, 0.4, 10, 16);
  legGeo.translate(0, -0.2, 0);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.28, 0.5, 0);
  const leftLeg = createToonPart(legGeo, uniformMat, 0.035);
  leftLegPivot.add(leftLeg);
  group.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.28, 0.5, 0);
  const rightLeg = createToonPart(legGeo, uniformMat, 0.035);
  rightLegPivot.add(rightLeg);
  group.add(rightLegPivot);

  let runTime = 0;
  let currentTilt = 0;

  const updateAnimation = (
    state: AnimationState,
    dt: number,
    speed: number
  ) => {
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, currentTilt, 0.15);

    if (state === 'caught') {
      leftArmPivot.rotation.x = -0.4;
      leftArmPivot.rotation.z = -0.55;
      rightArmPivot.rotation.x = -0.4;
      rightArmPivot.rotation.z = 0.55;
      leftLegPivot.rotation.set(0, 0, 0);
      rightLegPivot.rotation.set(0, 0, 0);
      bodyRoot.position.set(0, 0, 0);
      bodyRoot.rotation.set(0.12, 0, 0);
    } else {
      runTime += dt * Math.min(speed, 35);
      const cycle = runTime * 0.75;
      leftLegPivot.rotation.x = Math.sin(cycle) * 0.9;
      rightLegPivot.rotation.x = -Math.sin(cycle) * 0.9;
      leftArmPivot.rotation.x = -Math.sin(cycle) * 1.0;
      rightArmPivot.rotation.x = Math.sin(cycle) * 1.0;
      bodyRoot.position.y = Math.abs(Math.sin(cycle * 2)) * 0.1;
      bodyRoot.rotation.x = 0.22;
    }
  };

  const setTilt = (targetTilt: number) => {
    currentTilt = targetTilt;
  };

  const resetAnimation = () => {
    runTime = 0;
    currentTilt = 0;
    group.rotation.set(0, 0, 0);
    bodyRoot.position.set(0, 0, 0);
    bodyRoot.rotation.set(0, 0, 0);
  };

  return {
    group,
    type: 'guard',
    updateAnimation,
    setTilt,
    resetAnimation,
  };
}

/**
 * Creates the Inspector's loyal, chunky Subway Surfers Bulldog
 */
export function createBulldogModel(): AnimatedCharacter {
  const group = new THREE.Group();
  group.name = 'Bulldog';

  const fawnMat = createToonMaterial(0xc49a6c, 0.85); // Warm tan/fawn bulldog coat
  const darkJowlMat = createToonMaterial(0x3c1b14, 0.80); // Dark chocolate snout & jowls
  const collarMat = createToonMaterial(0xe63946, 0.60); // Red spiked collar
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.8, roughness: 0.2 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

  const root = new THREE.Group();
  group.add(root);

  // 1. Chunky barrel body
  const bodyGeo = new THREE.SphereGeometry(0.32, 18, 14);
  bodyGeo.scale(1.25, 0.95, 0.88);
  const body = createToonPart(bodyGeo, fawnMat, 0.035);
  body.position.set(0, 0.42, 0);
  root.add(body);

  // 2. Chunky broad head
  const headGeo = new THREE.SphereGeometry(0.28, 18, 14);
  headGeo.scale(1.15, 0.95, 0.92);
  const head = createToonPart(headGeo, fawnMat, 0.035);
  head.position.set(0, 0.62, 0.28);
  root.add(head);

  // 3. Dark wrinkly jowls & snout
  const snoutGeo = new THREE.SphereGeometry(0.16, 14, 12);
  snoutGeo.scale(1.22, 0.72, 0.85);
  const snout = createToonPart(snoutGeo, darkJowlMat, 0.035);
  snout.position.set(0, 0.54, 0.48);
  root.add(snout);

  // Black button nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), eyeMat);
  nose.position.set(0, 0.58, 0.61);
  root.add(nose);

  // Eyes
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  leftEye.position.set(-0.11, 0.68, 0.51);
  root.add(leftEye);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  rightEye.position.set(0.11, 0.68, 0.51);
  root.add(rightEye);

  // 4. Floppy dark ears
  const earGeo = new THREE.SphereGeometry(0.09, 12, 10);
  earGeo.scale(0.8, 1.25, 0.35);

  const leftEar = createToonPart(earGeo, darkJowlMat, 0.035);
  leftEar.position.set(-0.25, 0.74, 0.28);
  leftEar.rotation.set(0.4, 0, -0.6);
  root.add(leftEar);

  const rightEar = createToonPart(earGeo, darkJowlMat, 0.035);
  rightEar.position.set(0.25, 0.74, 0.28);
  rightEar.rotation.set(0.4, 0, 0.6);
  root.add(rightEar);

  // 5. Spiked red collar
  const collarGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.07, 16);
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.set(0, 0.52, 0.20);
  collar.rotation.x = 0.25;
  root.add(collar);

  // Gold spikes
  for (let s = 0; s < 5; s++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), spikeMat);
    const angle = (s / 5) * Math.PI - Math.PI / 2;
    spike.position.set(Math.sin(angle) * 0.27, 0.52, 0.20 + Math.cos(angle) * 0.27);
    spike.rotation.set(Math.PI / 2, 0, -angle);
    root.add(spike);
  }

  // 6. Curled pig tail on rump
  const tailGeo = new THREE.TorusGeometry(0.055, 0.025, 8, 12, Math.PI * 1.5);
  const tail = new THREE.Mesh(tailGeo, fawnMat);
  tail.position.set(0, 0.52, -0.36);
  tail.rotation.set(0.5, 0, 0);
  root.add(tail);

  // 7. Four stubby legs
  const legGeo = new THREE.CapsuleGeometry(0.065, 0.16, 8, 12);
  legGeo.translate(0, -0.08, 0);

  const frontLeftLeg = new THREE.Group();
  frontLeftLeg.position.set(-0.18, 0.30, 0.18);
  frontLeftLeg.add(createToonPart(legGeo, fawnMat, 0.035));
  root.add(frontLeftLeg);

  const frontRightLeg = new THREE.Group();
  frontRightLeg.position.set(0.18, 0.30, 0.18);
  frontRightLeg.add(createToonPart(legGeo, fawnMat, 0.035));
  root.add(frontRightLeg);

  const backLeftLeg = new THREE.Group();
  backLeftLeg.position.set(-0.18, 0.28, -0.18);
  backLeftLeg.add(createToonPart(legGeo, fawnMat, 0.035));
  root.add(backLeftLeg);

  const backRightLeg = new THREE.Group();
  backRightLeg.position.set(0.18, 0.28, -0.18);
  backRightLeg.add(createToonPart(legGeo, fawnMat, 0.035));
  root.add(backRightLeg);

  let runTime = 0;
  let currentTilt = 0;

  const updateAnimation = (
    state: AnimationState,
    dt: number,
    speed: number
  ) => {
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, currentTilt, 0.2);

    if (state === 'caught') {
      // Standing proudly next to inspector, head raised and tail wagging!
      frontLeftLeg.rotation.set(0, 0, 0);
      frontRightLeg.rotation.set(0, 0, 0);
      backLeftLeg.rotation.set(0, 0, 0);
      backRightLeg.rotation.set(0, 0, 0);
      head.position.y = 0.65;
      tail.rotation.y = Math.sin(dt * 15) * 0.4;
    } else {
      runTime += dt * Math.min(speed, 35);
      const cycle = runTime * 1.1;

      // Galloping four-legged run
      frontLeftLeg.rotation.x = Math.sin(cycle) * 0.9;
      frontRightLeg.rotation.x = -Math.sin(cycle) * 0.9;
      backLeftLeg.rotation.x = -Math.sin(cycle) * 0.9;
      backRightLeg.rotation.x = Math.sin(cycle) * 0.9;

      // Energetic body bounce & tail wag
      root.position.y = Math.abs(Math.sin(cycle * 2)) * 0.07;
      tail.rotation.y = Math.sin(cycle * 3) * 0.6;
      head.rotation.x = Math.sin(cycle * 2) * 0.06;
    }
  };

  const setTilt = (targetTilt: number) => {
    currentTilt = targetTilt;
  };

  const resetAnimation = () => {
    runTime = 0;
    currentTilt = 0;
    group.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0);
  };

  return {
    group,
    type: 'bulldog',
    updateAnimation,
    setTilt,
    resetAnimation,
  };
}

/**
 * Creates the Rattling Graffiti Spray Can
 */
export function createSprayCanModel(): THREE.Group {
  const can = new THREE.Group();
  can.name = 'SprayCan';

  // Bright magenta/pink aluminum body
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff3366, metalness: 0.4, roughness: 0.3 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.85, roughness: 0.2 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.4 });

  // Main cylinder
  const bodyGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.20, 16);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.10;
  can.add(bodyMesh);

  // Top and bottom metal rims
  const rimTop = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.02, 16), metalMat);
  rimTop.position.y = 0.20;
  can.add(rimTop);

  const rimBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.067, 0.067, 0.02, 16), metalMat);
  rimBottom.position.y = 0.01;
  can.add(rimBottom);

  // Dome top
  const domeGeo = new THREE.SphereGeometry(0.063, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, metalMat);
  dome.position.y = 0.21;
  can.add(dome);

  // Spray actuator button
  const nozzleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.035, 12);
  const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzle.position.set(0, 0.25, 0);
  can.add(nozzle);

  // Yellow cap resting loosely or attached
  const capGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.09, 16);
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.set(0, 0.26, 0);
  cap.visible = false; // Cap is off when spraying!
  can.add(cap);

  return can;
}

/**
 * Creates the Twin-Thruster Subway Surfers Jetpack Model
 */
export function createJetpackModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Jetpack';

  const redMat = new THREE.MeshStandardMaterial({ color: 0xef233c, roughness: 0.35, metalness: 0.2 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.85, roughness: 0.2 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2b2d42, metalness: 0.7, roughness: 0.3 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

  // Central mounting plate
  const plateGeo = new THREE.BoxGeometry(0.32, 0.45, 0.08);
  const plate = new THREE.Mesh(plateGeo, chromeMat);
  plate.position.set(0, 0, 0);
  group.add(plate);

  // Left & Right Rocket Cannons
  [-0.18, 0.18].forEach((xPos) => {
    // Red cylinder body
    const tubeGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.52, 16);
    const tube = new THREE.Mesh(tubeGeo, redMat);
    tube.position.set(xPos, 0, 0.04);
    group.add(tube);

    // White racing stripe
    const stripeGeo = new THREE.CylinderGeometry(0.092, 0.092, 0.12, 16);
    const stripe = new THREE.Mesh(stripeGeo, whiteMat);
    stripe.position.set(xPos, 0.05, 0.04);
    group.add(stripe);

    // Top Dome Cone
    const domeGeo = new THREE.SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, chromeMat);
    dome.position.set(xPos, 0.26, 0.04);
    group.add(dome);

    // Exhaust Nozzle at bottom
    const nozzleGeo = new THREE.CylinderGeometry(0.065, 0.095, 0.14, 16);
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(xPos, -0.32, 0.04);
    group.add(nozzle);

    // Jet Flame Glow
    const flameGeo = new THREE.ConeGeometry(0.075, 0.32, 12);
    flameGeo.rotateX(Math.PI);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9f1c });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(xPos, -0.52, 0.04);
    group.add(flame);
  });

  // Harness Straps
  [-0.14, 0.14].forEach((xPos) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.18), strapMat);
    strap.position.set(xPos, 0.05, -0.06);
    group.add(strap);
  });

  return group;
}

/**
 * Creates the Super Sneakers (High Tops with Golden Coil Springs) Model
 */
export function createSuperSneakersModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SuperSneakers';

  const redMat = new THREE.MeshStandardMaterial({ color: 0xef233c, roughness: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.8, roughness: 0.2 });

  // Left & right high-top shoes
  [-0.16, 0.16].forEach((xPos) => {
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(xPos, 0, 0);

    // Chunky sneaker body
    const bodyGeo = new THREE.BoxGeometry(0.18, 0.16, 0.34);
    const body = new THREE.Mesh(bodyGeo, redMat);
    body.position.set(0, 0.12, 0.04);
    shoeGroup.add(body);

    // High top collar
    const collarGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12);
    const collar = new THREE.Mesh(collarGeo, redMat);
    collar.position.set(0, 0.24, -0.04);
    shoeGroup.add(collar);

    // White toe cap
    const toeGeo = new THREE.SphereGeometry(0.095, 12, 8, 0, Math.PI, 0, Math.PI / 2);
    toeGeo.rotateX(-Math.PI / 2);
    const toe = new THREE.Mesh(toeGeo, whiteMat);
    toe.position.set(0, 0.08, 0.20);
    shoeGroup.add(toe);

    // White rubber sole
    const soleGeo = new THREE.BoxGeometry(0.20, 0.05, 0.36);
    const sole = new THREE.Mesh(soleGeo, whiteMat);
    sole.position.set(0, 0.03, 0.04);
    shoeGroup.add(sole);

    // Futuristic Golden Coil Spring underneath sole
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const springRadius = 0.07;
    const turns = 3.5;
    const height = 0.14;
    const points: THREE.Vector3[] = [];
    const count = 30;
    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2 * turns;
      const y = -height * (i / count);
      points.push(new THREE.Vector3(Math.cos(angle) * springRadius, y, Math.sin(angle) * springRadius));
    }
    const catmull = new THREE.CatmullRomCurve3(points);
    const springGeo = new THREE.TubeGeometry(catmull, 24, 0.016, 6, false);
    const spring = new THREE.Mesh(springGeo, goldMat);
    spring.position.set(0, 0, 0.04);
    shoeGroup.add(spring);

    // Spring base pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12), goldMat);
    pad.position.set(0, -0.15, 0.04);
    shoeGroup.add(pad);

    group.add(shoeGroup);
  });

  return group;
}

/**
 * Creates the Futuristic Hoverboard Model
 */
export function createHoverboardModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Hoverboard';

  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4, // Vibrant electric cyan
    metalness: 0.35,
    roughness: 0.2,
    emissive: 0x00b4d8,
    emissiveIntensity: 0.35,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xff007f, // Hot neon pink
    roughness: 0.3,
    emissive: 0xff007f,
    emissiveIntensity: 0.6,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x00f5d4,
  });
  const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.85, roughness: 0.2 });

  // Wide, high-visibility tapered deck (Width: 0.76m, Length: 1.50m, Thickness: 0.08m)
  const deckGeo = new THREE.BoxGeometry(0.76, 0.08, 1.50);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.castShadow = true;
  group.add(deck);

  // Curved nose kick
  const noseGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 16, 1, false, 0, Math.PI);
  const nose = new THREE.Mesh(noseGeo, deckMat);
  nose.position.set(0, 0.03, 0.75);
  nose.rotation.x = -0.22;
  group.add(nose);

  // Curved tail kick
  const tail = new THREE.Mesh(noseGeo, deckMat);
  tail.position.set(0, 0.03, -0.75);
  tail.rotation.y = Math.PI;
  tail.rotation.x = -0.22;
  group.add(tail);

  // Neon Edge Glow Strips
  [-0.39, 0.39].forEach((xPos) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 1.42), trimMat);
    strip.position.set(xPos, 0, 0);
    group.add(strip);

    const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 1.36), glowMat);
    lightStrip.position.set(xPos + (xPos > 0 ? 0.02 : -0.02), 0, 0);
    group.add(lightStrip);
  });

  // Black textured grip tape on top with glowing neon racing stripe
  const gripGeo = new THREE.BoxGeometry(0.58, 0.02, 1.20);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.set(0, 0.045, 0);
  group.add(grip);

  // Center racing stripe on grip
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 1.15), trimMat);
  stripe.position.set(0, 0.046, 0);
  group.add(stripe);

  // Dual Under-Deck Anti-Gravity Thruster Pods
  [-0.42, 0.42].forEach((zPos) => {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.09, 16), thrusterMat);
    pod.position.set(0, -0.06, zPos);
    group.add(pod);

    // Glowing plasma core ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 16), glowMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, -0.10, zPos);
    group.add(ring);
  });

  // Under-deck anti-gravity point light (illuminates the ground/rails in electric cyan)
  const underlight = new THREE.PointLight(0x00f5d4, 2.2, 4.0);
  underlight.position.set(0, -0.12, 0);
  group.add(underlight);

  return group;
}

/**
 * Creates the Pogo Stick (Power Jumper) Model
 */
export function createPogoStickModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'PogoStick';

  const redMat = new THREE.MeshStandardMaterial({ color: 0xff3366, metalness: 0.3, roughness: 0.4 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.85, roughness: 0.2 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.7, roughness: 0.3 });

  // Main vertical shaft
  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 12);
  const shaft = new THREE.Mesh(shaftGeo, chromeMat);
  shaft.position.y = 0.6;
  group.add(shaft);

  // Red Outer Sleeve
  const sleeveGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12);
  const sleeve = new THREE.Mesh(sleeveGeo, redMat);
  sleeve.position.y = 0.65;
  group.add(sleeve);

  // Horizontal Handlebar
  const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 12);
  barGeo.rotateZ(Math.PI / 2);
  const bar = new THREE.Mesh(barGeo, chromeMat);
  bar.position.y = 1.15;
  group.add(bar);

  // Rubber Grips
  [-0.24, 0.24].forEach((xPos) => {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12), gripMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(xPos, 1.15, 0);
    group.add(grip);
  });

  // Foot Pegs
  const pegsGeo = new THREE.BoxGeometry(0.44, 0.05, 0.12);
  const pegs = new THREE.Mesh(pegsGeo, redMat);
  pegs.position.set(0, 0.38, 0);
  group.add(pegs);

  // Heavy Duty Spring at base
  const springPoints: THREE.Vector3[] = [];
  const turns = 4;
  const height = 0.28;
  for (let i = 0; i <= 30; i++) {
    const angle = (i / 30) * Math.PI * 2 * turns;
    const y = 0.32 - height * (i / 30);
    springPoints.push(new THREE.Vector3(Math.cos(angle) * 0.06, y, Math.sin(angle) * 0.06));
  }
  const springCurve = new THREE.CatmullRomCurve3(springPoints);
  const springMesh = new THREE.Mesh(new THREE.TubeGeometry(springCurve, 24, 0.016, 6, false), goldMat);
  group.add(springMesh);

  // Bottom rubber tip
  const footTip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.06, 12), gripMat);
  footTip.position.y = 0.03;
  group.add(footTip);

  return group;
}

/**
 * Creates the Collectible Mystery Box Model (Gift Cube with ? Ribbon)
 */
export function createMysteryBoxModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'MysteryBox';

  const boxMat = new THREE.MeshStandardMaterial({ color: 0x9d4edd, roughness: 0.35, metalness: 0.1 });
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.6, roughness: 0.25 });
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff3b0,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });

  // Cube box
  const boxGeo = new THREE.BoxGeometry(0.68, 0.68, 0.68);
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.castShadow = true;
  group.add(boxMesh);

  // Golden Ribbons wrapping all 4 sides
  const ribH = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.14, 0.70), ribbonMat);
  group.add(ribH);
  const ribV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.70, 0.70), ribbonMat);
  group.add(ribV);

  // Top Bow
  const bowL = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), ribbonMat);
  bowL.position.set(-0.10, 0.42, 0);
  bowL.rotation.y = 0.4;
  group.add(bowL);

  const bowR = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), ribbonMat);
  bowR.position.set(0.10, 0.42, 0);
  bowR.rotation.y = -0.4;
  group.add(bowR);

  // Question mark badge symbol in center
  const badgeGeo = new THREE.OctahedronGeometry(0.15);
  const badge = new THREE.Mesh(badgeGeo, starMat);
  badge.position.set(0, 0, 0.36);
  group.add(badge);

  return group;
}

/**
 * Creates the 2X Multiplier Star Badge Model
 */
export function createMultiplier2xModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Multiplier2x';

  const starMat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0xffa500,
    emissiveIntensity: 0.3,
  });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xef233c, roughness: 0.3 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });

  // Outer circular ring shield
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 12, 24), ringMat);
  group.add(ring);

  // Star emblem in center
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), starMat);
  group.add(star);

  // "2" shape constructed cleanly out of stylized blocks
  const twoTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.08), whiteMat);
  twoTop.position.set(0, 0.12, 0.24);
  group.add(twoTop);

  const twoRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.08), whiteMat);
  twoRight.position.set(0.065, 0.06, 0.24);
  group.add(twoRight);

  const twoMid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.08), whiteMat);
  twoMid.position.set(0, 0, 0.24);
  group.add(twoMid);

  const twoLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.08), whiteMat);
  twoLeft.position.set(-0.065, -0.06, 0.24);
  group.add(twoLeft);

  const twoBot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.08), whiteMat);
  twoBot.position.set(0, -0.12, 0.24);
  group.add(twoBot);

  // "X" cross
  const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.08), whiteMat);
  x1.position.set(0.22, 0, 0.24);
  x1.rotation.z = Math.PI / 4;
  group.add(x1);

  const x2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.08), whiteMat);
  x2.position.set(0.22, 0, 0.24);
  x2.rotation.z = -Math.PI / 4;
  group.add(x2);

  return group;
}

