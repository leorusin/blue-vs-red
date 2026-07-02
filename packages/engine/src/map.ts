import { BattleMap, Terrain, TERRAIN } from './types';
import { mulberry32 } from './rng';

export const MAP_W = 96;
export const MAP_H = 60;
export const TILE = 12;

export function generateMap(seed: number): BattleMap {
  const w = MAP_W;
  const h = MAP_H;
  const rand = mulberry32(seed);
  const terrain = new Uint8Array(w * h).fill(TERRAIN.GRASS);
  const coastY = new Int16Array(w);
  const riverX = new Int16Array(h).fill(-1);

  // Ocean along the top with a wavy coastline, then a sand beach strip.
  const oceanBase = 13;
  const phase = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  for (let x = 0; x < w; x++) {
    const wave =
      Math.sin(x * 0.13 + phase) * 2.2 + Math.sin(x * 0.31 + phase2) * 1.2;
    const coast = Math.max(8, Math.round(oceanBase + wave));
    coastY[x] = coast;
    for (let y = 0; y < coast; y++) {
      terrain[y * w + x] = y < coast - 5 ? TERRAIN.DEEP : TERRAIN.WATER;
    }
    for (let y = coast; y < Math.min(h, coast + 3); y++) {
      terrain[y * w + x] = TERRAIN.SAND;
    }
  }

  // River: meanders from the sea down to the bottom edge, splitting the land.
  let cx = Math.round(w / 2 + (rand() - 0.5) * 8);
  const minX = Math.round(w * 0.36);
  const maxX = Math.round(w * 0.64);
  for (let y = 0; y < h; y++) {
    riverX[y] = cx;
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= w) continue;
      const t = terrain[y * w + x];
      if (t === TERRAIN.GRASS || t === TERRAIN.SAND || t === TERRAIN.FOREST) {
        terrain[y * w + x] = TERRAIN.RIVER;
      }
    }
    if (rand() < 0.45) {
      cx += rand() < 0.5 ? -1 : 1;
      cx = Math.max(minX, Math.min(maxX, cx));
    }
  }
  // Rows fully in the sea carry no river side information.
  for (let y = 0; y < h; y++) {
    let allWater = true;
    for (let x = 0; x < w; x++) {
      const t = terrain[y * w + x];
      if (t !== TERRAIN.DEEP && t !== TERRAIN.WATER) {
        allWater = false;
        break;
      }
    }
    if (allWater) riverX[y] = -1;
  }

  // Bridges across the river.
  const landTop = Math.max(...Array.from(coastY)) + 3;
  const bridges: { x: number; y: number }[] = [];
  const bridgeRows = [
    landTop + 5,
    Math.round((landTop + h) / 2),
    h - 8,
  ];
  for (const by of bridgeRows) {
    const y = Math.max(landTop, Math.min(h - 2, by));
    const bx = riverX[y];
    if (bx < 0) continue;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = bx + dx;
        const yy = y + dy;
        if (x < 0 || x >= w || yy < 0 || yy >= h) continue;
        if (terrain[yy * w + x] === TERRAIN.RIVER || Math.abs(dx) <= 1) {
          terrain[yy * w + x] = TERRAIN.BRIDGE;
        }
      }
    }
    bridges.push({ x: bx, y });
  }

  // Forest clusters on grass — cover to hide behind.
  const clusters = 12 + Math.floor(rand() * 6);
  for (let i = 0; i < clusters; i++) {
    const fx = Math.floor(rand() * w);
    const fy = landTop + 2 + Math.floor(rand() * (h - landTop - 4));
    const r = 2 + rand() * 4;
    for (let y = Math.floor(fy - r); y <= fy + r; y++) {
      for (let x = Math.floor(fx - r); x <= fx + r; x++) {
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const d = Math.hypot(x - fx, y - fy);
        if (d <= r * (0.7 + rand() * 0.4) && terrain[y * w + x] === TERRAIN.GRASS) {
          terrain[y * w + x] = TERRAIN.FOREST;
        }
      }
    }
  }

  return { w, h, tile: TILE, terrain, bridges, riverX, coastY, seed };
}

export function terrainAtTile(map: BattleMap, tx: number, ty: number): Terrain {
  const x = Math.max(0, Math.min(map.w - 1, tx));
  const y = Math.max(0, Math.min(map.h - 1, ty));
  return map.terrain[y * map.w + x] as Terrain;
}

/** terrain at a pixel position */
export function terrainAt(map: BattleMap, px: number, py: number): Terrain {
  return terrainAtTile(map, Math.floor(px / map.tile), Math.floor(py / map.tile));
}

export function isWaterTerrain(t: Terrain): boolean {
  return t === TERRAIN.DEEP || t === TERRAIN.WATER || t === TERRAIN.RIVER;
}

export function landPassable(t: Terrain): boolean {
  return t === TERRAIN.GRASS || t === TERRAIN.FOREST || t === TERRAIN.SAND || t === TERRAIN.BRIDGE;
}

export function navalPassable(t: Terrain): boolean {
  return t === TERRAIN.DEEP || t === TERRAIN.WATER;
}

/**
 * Which side of the river a pixel position is on: -1 west, +1 east,
 * 0 when on/next to the river itself or on open sea rows.
 */
export function riverSide(map: BattleMap, px: number, py: number): number {
  const ty = Math.max(0, Math.min(map.h - 1, Math.floor(py / map.tile)));
  const rx = map.riverX[ty];
  if (rx < 0) return 0;
  const dx = Math.floor(px / map.tile) - rx;
  if (Math.abs(dx) <= 1) return 0;
  return dx < 0 ? -1 : 1;
}

export interface DeployZones {
  /** pixel x range for each team (applies to both land and water) */
  blue: { x0: number; x1: number };
  red: { x0: number; x1: number };
}

export function deployZones(map: BattleMap): DeployZones {
  const W = map.w * map.tile;
  return {
    blue: { x0: 0, x1: W * 0.42 },
    red: { x0: W * 0.58, x1: W },
  };
}
