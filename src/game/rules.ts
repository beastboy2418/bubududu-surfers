/** Deterministic rules shared by the simulation and regression tests. */
export const CHASE_SECONDS = 8;
export const RECOVERY_SECONDS = 1.25;
export class Pursuit {
  remaining = 0;
  recovery = 0;
  reset() { this.remaining = 0; this.recovery = 0; }
  update(dt: number) {
    this.remaining = Math.max(0, this.remaining - dt);
    this.recovery = Math.max(0, this.recovery - dt);
  }
  hit(): 'ignored' | 'stumble' | 'caught' {
    if (this.recovery > 0) return 'ignored';
    if (this.remaining > 0) return 'caught';
    this.remaining = CHASE_SECONDS;
    this.recovery = RECOVERY_SECONDS;
    return 'stumble';
  }
}
export function overlapsObstacle(px: number, z: number, laneX: number, depth: number) {
  return Math.abs(px - laneX) <= 0.8 && z - depth / 2 <= 0.45 && z + depth / 2 >= -0.45;
}
export function accrueScore(previous: number, distanceDelta: number, multiplier: number) {
  return previous + Math.max(0, distanceDelta) * multiplier;
}
export function finiteNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}
export function consumeBox(count: number) { return count > 0 ? count - 1 : null; }
export function chooseWaveLanes(random: () => number, two = true): number[] {
  const lanes = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes.slice(0, two && random() > 0.45 ? 2 : 1);
}
