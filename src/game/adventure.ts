import { finiteNumber } from './rules';

export const safeStorage = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Session still playable. */ } },
};
export const DISTRICTS = [
  { name: 'Sakura Express', subtitle: 'Follow the petals. Find your rhythm.', color: '#ffb6c8', sky: 0xf8d6cb, fog: 0xf3c8c3, ground: 0x655a75, accent: 0xffa5bb, challenge: 'Clear 4 obstacles', target: 4 },
  { name: 'Midnight Boba', subtitle: 'A little neon. A little mischief.', color: '#67e8f9', sky: 0x171c3c, fog: 0x35315a, ground: 0x242b46, accent: 0x52e0df, challenge: 'Collect 20 coins', target: 20 },
  { name: 'Cloud Railway', subtitle: 'Take the leap. We have each other.', color: '#c4b5fd', sky: 0xb8d9f4, fog: 0xd4dafa, ground: 0x727f9e, accent: 0xb4a0ff, challenge: 'Clear 3 obstacles', target: 3 },
  { name: 'Moonlight Festival', subtitle: 'One more adventure, together.', color: '#fcd98a', sky: 0x141d38, fog: 0x343259, ground: 0x373350, accent: 0xffc16d, challenge: 'Collect 20 coins', target: 20 },
] as const;
export const DISTRICT_LENGTH = 600;
export function districtAt(distance: number) { return Math.floor(distance / DISTRICT_LENGTH) % DISTRICTS.length; }
export type Quality = 'auto' | 'low' | 'high';
export type Outfit = 'classic' | 'explorer' | 'starlight';
export interface Adventure {
  runs: number; bestDistance: number; totalCoins: number; visited: number[];
  decorations: string[]; outfit: Outfit; tutorialDone: boolean;
  quality: Quality; reducedMotion: boolean;
}
export const DECORATIONS = [
  { id: 'plant', name: 'Sakura planter', cost: 150, icon: '🌸' },
  { id: 'lamp', name: 'Moon lantern', cost: 250, icon: '🏮' },
  { id: 'boba', name: 'Boba for two', cost: 200, icon: '🧋' },
  { id: 'stars', name: 'Wishing stars', cost: 400, icon: '✨' },
] as const;
export function loadAdventure(): Adventure {
  let value: any = {};
  try { value = JSON.parse(safeStorage.get('bubududu_adventure') || '{}') || {}; } catch {}
  return {
    runs: finiteNumber(value.runs, 0), bestDistance: finiteNumber(value.bestDistance, 0), totalCoins: finiteNumber(value.totalCoins, 0),
    visited: Array.isArray(value.visited) ? [...new Set<number>(value.visited.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 4))] : [],
    decorations: Array.isArray(value.decorations) ? value.decorations.filter((id: string) => DECORATIONS.some(d => d.id === id)) : [],
    outfit: ['classic', 'explorer', 'starlight'].includes(value.outfit) ? value.outfit : 'classic',
    tutorialDone: value.tutorialDone === true,
    quality: ['auto', 'low', 'high'].includes(value.quality) ? value.quality : 'auto',
    reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
}
export function saveAdventure(value: Adventure) { safeStorage.set('bubududu_adventure', JSON.stringify(value)); }
