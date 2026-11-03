import * as THREE from 'three';
import { DISTRICTS } from './adventure';

const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const palette = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number, glow = false) {
  const key = color + (glow ? 0x1000000 : 0);
  if (!palette.has(key)) palette.set(key, new THREE.MeshStandardMaterial({ color, roughness: .76, metalness: .05, emissive: glow ? color : 0, emissiveIntensity: glow ? .8 : 0 }));
  return palette.get(key)!;
}
function part(group: THREE.Group, geo: THREE.BufferGeometry, color: number, p: number[], s: number[], glow = false) {
  const mesh = new THREE.Mesh(geo, material(color, glow));
  mesh.position.set(p[0], p[1], p[2]); mesh.scale.set(s[0], s[1], s[2]);
  mesh.castShadow = !glow; mesh.receiveShadow = !glow; group.add(mesh); return mesh;
}
const labelCache = new Map<string, THREE.CanvasTexture>();
function sign(group: THREE.Group, text: string, x: number, y: number, z: number, color: string) {
  const key = text + color;
  let texture = labelCache.get(key);
  if (!texture) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#25253e'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = color; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 65); texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; labelCache.set(key, texture);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); mesh.rotation.y = Math.PI; group.add(mesh);
}

/** Shared geometry and instanced windows/petals keep each district inexpensive. */
export function createDistrictScenery(district: number, variant: number): THREE.Group {
  const group = new THREE.Group(); const theme = DISTRICTS[district];
  group.name = `District-${district}`;
  const night = district === 1 || district === 3;
  const windowMesh = new THREE.InstancedMesh(box, material(night ? 0xffdc9b : 0x9bc9d3, night), 96);
  const matrix = new THREE.Object3D(); let wi = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = side * (11.3 + (i % 2) * 2.5), z = -15 + i * 14;
      const h = 5 + ((variant + i) % 3) * 2;
      const colors = district === 0 ? [0xeabbb7, 0x9fbdb9, 0xc1acc7] : district === 1 ? [0x434266, 0x315365, 0x6c3f69] : district === 2 ? [0xc9d8ee, 0xb7bfdc, 0xd9c7df] : [0x4c4867, 0x555778, 0x68536e];
      part(group, box, colors[i], [x, h / 2, z], [4.8, h, 8]);
      part(group, box, theme.accent, [x, h + .15, z], [5.1, .3, 8.3]);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
        matrix.position.set(x - 1.65 + col * 1.1, 1.5 + row * 1.6, z - 4.03);
        matrix.scale.set(.55, .8, .07); matrix.updateMatrix(); windowMesh.setMatrixAt(wi++, matrix.matrix);
      }
      if (district === 0) {
        part(group, cylinder, 0x886478, [side * 6.9, 1.5, z], [.18, 3, .18]);
        for (let b = 0; b < 3; b++) part(group, sphere, b === 1 ? 0xffc5d1 : 0xeaa2bd, [side * 6.9 + Math.sin(b * 2.1), 3.4 + (b % 2) * .6, z + Math.cos(b * 2.1)], [1.45, 1.2, 1.4]);
      } else if (district === 1) {
        part(group, box, theme.accent, [side * 6.8, 2.8, z], [2.3, .22, 3.8], true);
        part(group, box, 0xff81b5, [side * 6.8, .8, z], [2.3, 1.5, 3.8]);
        part(group, cylinder, 0xeed5ba, [side * 6.8, 3.6, z], [.5, 1.2, .5]);
        part(group, cylinder, 0xff76a8, [side * 6.8, 4.4, z], [.07, .6, .07]);
      } else if (district === 2) {
        for (let b = 0; b < 3; b++) part(group, sphere, 0xeff5ff, [side * (6.5 + b), -.4 + b * .2, z], [1.7, .8, 2]);
        part(group, sphere, 0x9d95c9, [side * 10, -3, z], [3, 2.8, 4]);
        part(group, box, 0x92e5ed, [side * 9, -4, z], [.5, 8, 2], true);
      } else {
        part(group, cylinder, 0xa08a9a, [side * 6.3, 2, z], [.075, 4, .075]);
        part(group, sphere, 0xffc983, [side * 6.3, 4.2, z], [.55, .8, .55], true);
        part(group, box, 0xe8ad78, [side * 6.3, 3.2, z], [.035, .7, .035]);
      }
    }
  }
  windowMesh.count = wi; windowMesh.instanceMatrix.needsUpdate = true; group.add(windowMesh);
  if (district === 0 || district === 3) {
    // Overhead ribbons frame the route without concealing hazards.
    part(group, box, district === 0 ? 0xa97c8e : 0x80719c, [0, 7.5, 5], [17, .15, .15]);
    for (let i = -3; i <= 3; i++) part(group, sphere, theme.accent, [i * 2, 6.7 + Math.abs(i) * .16, 5], [.25, .4, .25], district === 3);
  }
  sign(group, ['SAKURA EXPRESS', 'BOBA AFTER DARK', 'NEXT STOP: SKY', 'MAKE A WISH'][district], -10.5, 4, -18, theme.color);
  return group;
}

export class AmbientField {
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private positions: THREE.Vector3[] = [];
  private time = 0;
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.16, .09), new THREE.MeshBasicMaterial({ color: 0xffc6d8, side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false }), 100);
    for (let i = 0; i < 100; i++) this.positions.push(new THREE.Vector3((Math.random()-.5)*24, 2+Math.random()*10, Math.random()*100));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  update(dt: number, speed: number, district: number, reduced: boolean) {
    this.mesh.visible = !reduced; if (reduced) return;
    this.time += dt;
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(DISTRICTS[district].accent);
    this.positions.forEach((p,i) => {
      p.z -= speed * dt * .8; if (p.z < -8) p.z += 108;
      this.dummy.position.set(p.x + Math.sin(this.time+i)*.5, p.y + Math.sin(this.time*.6+i)*.4, p.z);
      this.dummy.rotation.set(this.time*.5+i, this.time*.3, i); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i,this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
