import { UnitType } from './types';

export interface UnitStats {
  name: string;
  icon: string;
  hp: number;
  range: number;
  minRange: number;
  damage: number;
  splash: number;
  reload: number;
  speed: number;
  projectile: 'bullet' | 'shell';
  projectileSpeed: number;
  arc: number;
  naval: boolean;
  radius: number;
  cost: number;
  /** aim spread in px at max range */
  spread: number;
  /** personnel represented by one unit — used for the casualty counter */
  crew: number;
  /** multiplier applied to incoming bullets (armor) */
  bulletResist: number;
}

export const STATS: Record<UnitType, UnitStats> = {
  infantry: {
    name: 'Infantry', icon: '🪖', hp: 30, range: 95, minRange: 0,
    damage: 5, splash: 0, reload: 0.9, speed: 26,
    projectile: 'bullet', projectileSpeed: 340, arc: 0,
    naval: false, radius: 3.5, cost: 1, spread: 7, crew: 8, bulletResist: 1,
  },
  tank: {
    name: 'Tank', icon: '🛡️', hp: 130, range: 160, minRange: 0,
    damage: 26, splash: 14, reload: 2.4, speed: 38,
    projectile: 'shell', projectileSpeed: 240, arc: 10,
    naval: false, radius: 6, cost: 5, spread: 9, crew: 4, bulletResist: 0.12,
  },
  artillery: {
    name: 'Artillery', icon: '💣', hp: 55, range: 330, minRange: 70,
    damage: 32, splash: 28, reload: 4.5, speed: 16,
    projectile: 'shell', projectileSpeed: 150, arc: 60,
    naval: false, radius: 5.5, cost: 6, spread: 24, crew: 6, bulletResist: 0.5,
  },
  destroyer: {
    name: 'Destroyer', icon: '🚢', hp: 200, range: 220, minRange: 0,
    damage: 20, splash: 12, reload: 1.8, speed: 42,
    projectile: 'shell', projectileSpeed: 260, arc: 14,
    naval: true, radius: 9, cost: 8, spread: 11, crew: 120, bulletResist: 0.1,
  },
  battleship: {
    name: 'Battleship', icon: '⚓', hp: 420, range: 400, minRange: 60,
    damage: 48, splash: 32, reload: 5.5, speed: 22,
    projectile: 'shell', projectileSpeed: 170, arc: 70,
    naval: true, radius: 13, cost: 14, spread: 20, crew: 900, bulletResist: 0.05,
  },
};

export const UNIT_TYPES: UnitType[] = ['infantry', 'tank', 'artillery', 'destroyer', 'battleship'];

export const TEAM_BUDGET = 150;
