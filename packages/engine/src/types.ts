export type Team = 'blue' | 'red';

export type UnitType = 'infantry' | 'tank' | 'artillery' | 'destroyer' | 'battleship';

export const TERRAIN = {
  DEEP: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  RIVER: 5,
  BRIDGE: 6,
} as const;

export type Terrain = (typeof TERRAIN)[keyof typeof TERRAIN];

export interface BattleMap {
  /** width/height in tiles */
  w: number;
  h: number;
  /** tile size in pixels */
  tile: number;
  terrain: Uint8Array;
  /** tile coordinates of bridge centers */
  bridges: { x: number; y: number }[];
  /** river center column per tile row, -1 where the river doesn't exist (open sea) */
  riverX: Int16Array;
  /** first land row (top of the beach) per column */
  coastY: Int16Array;
  seed: number;
}

export interface Unit {
  id: number;
  team: Team;
  type: UnitType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  heading: number;
  /** muzzle flash timer, seconds remaining */
  flash: number;
  dead: boolean;
}

export interface Projectile {
  id: number;
  team: Team;
  kind: 'bullet' | 'shell';
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  t: number;
  flight: number;
  damage: number;
  splash: number;
  /** peak arc height in px (0 = flat trajectory) */
  arc: number;
}

export interface Explosion {
  id: number;
  x: number;
  y: number;
  t: number;
  dur: number;
  maxR: number;
  water: boolean;
  big: boolean;
}

export interface Corpse {
  id: number;
  x: number;
  y: number;
  t: number;
  team: Team;
  type: UnitType;
  water: boolean;
}

export type Phase = 'setup' | 'battle' | 'ended';

export interface GameState {
  units: Unit[];
  projectiles: Projectile[];
  explosions: Explosion[];
  corpses: Corpse[];
  /** personnel lost per side */
  casualties: { blue: number; red: number };
  time: number;
  phase: Phase;
  winner: Team | 'draw' | null;
  nextId: number;
  rand: () => number;
}
