import {
  BattleMap, Corpse, DeployZones, Explosion, GameState, Projectile, STATS, Team,
  TERRAIN, tileHash, Unit, deployZones, terrainAt, isWaterTerrain,
} from '@blue-vs-red/engine';

export const TEAM_COLORS: Record<Team, { main: string; dark: string; light: string }> = {
  blue: { main: '#3b82f6', dark: '#1d4ed8', light: '#93c5fd' },
  red: { main: '#ef4444', dark: '#b91c1c', light: '#fca5a5' },
};

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

const TERRAIN_COLORS: Record<number, string> = {
  [TERRAIN.DEEP]: '#0f4a73',
  [TERRAIN.WATER]: '#1e6b9e',
  [TERRAIN.SAND]: '#dfcf9b',
  [TERRAIN.GRASS]: '#6da34d',
  [TERRAIN.FOREST]: '#557f3a',
  [TERRAIN.RIVER]: '#2b77ab',
  [TERRAIN.BRIDGE]: '#8a6238',
};

/** Render the static terrain once into an offscreen canvas. */
export function buildTerrainCanvas(map: BattleMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map.w * map.tile;
  canvas.height = map.h * map.tile;
  const ctx = canvas.getContext('2d')!;
  const ts = map.tile;

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.terrain[y * map.w + x];
      const noise = 0.93 + tileHash(x, y) * 0.14;
      ctx.fillStyle = shade(TERRAIN_COLORS[t], noise);
      ctx.fillRect(x * ts, y * ts, ts, ts);

      if (t === TERRAIN.BRIDGE) {
        ctx.strokeStyle = 'rgba(70,45,20,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x * ts, y * ts + ts / 2);
        ctx.lineTo(x * ts + ts, y * ts + ts / 2);
        ctx.stroke();
      }
    }
  }

  // wet sand edge next to water
  ctx.fillStyle = 'rgba(120,110,70,0.35)';
  for (let y = 1; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.terrain[y * map.w + x];
      const above = map.terrain[(y - 1) * map.w + x];
      if (t === TERRAIN.SAND && (above === TERRAIN.WATER || above === TERRAIN.DEEP)) {
        ctx.fillRect(x * ts, y * ts, ts, 3);
      }
    }
  }

  // trees on forest tiles
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.terrain[y * map.w + x] !== TERRAIN.FOREST) continue;
      const h1 = tileHash(x, y);
      const h2 = tileHash(x + 991, y + 313);
      const cx = x * ts + 3 + h1 * (ts - 6);
      const cy = y * ts + 3 + h2 * (ts - 6);
      const r = 2.5 + h1 * 2.5;
      ctx.fillStyle = 'rgba(30,50,20,0.45)';
      ctx.beginPath();
      ctx.ellipse(cx + 1.5, cy + 1.5, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade('#2f6323', 0.85 + h2 * 0.4);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas;
}

function drawWaves(ctx: CanvasRenderingContext2D, map: BattleMap, time: number): void {
  const ts = map.tile;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1.2;
  for (let row = 0; row < 5; row++) {
    const y0 = (2 + row * 2.4) * ts;
    ctx.beginPath();
    for (let x = 0; x <= map.w * ts; x += 6) {
      const y = y0 + Math.sin(x * 0.045 + time * 1.4 + row * 1.7) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, u: Unit): void {
  const c = TEAM_COLORS[u.team];
  const stats = STATS[u.type];
  ctx.save();
  ctx.translate(u.x, u.y);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 2, stats.radius * 1.1, stats.radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(u.heading);

  switch (u.type) {
    case 'infantry': {
      ctx.fillStyle = c.main;
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      break;
    }
    case 'tank': {
      ctx.fillStyle = c.dark;
      ctx.fillRect(-6, -4.5, 12, 9);
      ctx.fillStyle = c.main;
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      break;
    }
    case 'artillery': {
      ctx.fillStyle = c.dark;
      ctx.fillRect(-5, -4, 9, 8);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();
      ctx.fillStyle = c.main;
      ctx.beginPath();
      ctx.arc(-1, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'destroyer': {
      ctx.fillStyle = '#9aa5b1';
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.main;
      ctx.fillRect(-4, -1.8, 8, 3.6);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      break;
    }
    case 'battleship': {
      ctx.fillStyle = '#8b95a3';
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.main;
      ctx.fillRect(-8, -2.6, 16, 5.2);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, -1.5);
      ctx.lineTo(14, -1.5);
      ctx.moveTo(4, 1.5);
      ctx.lineTo(14, 1.5);
      ctx.stroke();
      break;
    }
  }

  // muzzle flash
  if (u.flash > 0) {
    const tip = u.type === 'infantry' ? 8 : u.type === 'battleship' ? 15 : 12;
    ctx.fillStyle = 'rgba(255,220,110,0.9)';
    ctx.beginPath();
    ctx.arc(tip, 0, 2.5 + u.flash * 25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // health bar
  if (u.hp < u.maxHp) {
    const w = Math.max(10, stats.radius * 2.4);
    const frac = Math.max(0, u.hp / u.maxHp);
    const y = u.y - stats.radius - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(u.x - w / 2, y, w, 3);
    ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#facc15' : '#f87171';
    ctx.fillRect(u.x - w / 2, y, w * frac, 3);
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const prog = Math.min(1, p.t / p.flight);
  if (p.kind === 'bullet') {
    const dx = p.tx - p.sx;
    const dy = p.ty - p.sy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    ctx.strokeStyle = 'rgba(255,240,180,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x - nx * 7, p.y - ny * 7);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else {
    const lift = p.arc * Math.sin(Math.PI * prog);
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.2, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#26221c';
    ctx.strokeStyle = 'rgba(255,190,90,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y - lift, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawExplosion(ctx: CanvasRenderingContext2D, e: Explosion): void {
  const p = Math.min(1, e.t / e.dur);
  const alpha = 1 - p;
  const r = e.maxR * (0.35 + 0.65 * p);
  if (e.water) {
    ctx.fillStyle = `rgba(220,240,255,${0.7 * alpha})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    g.addColorStop(0, `rgba(255,236,160,${0.95 * alpha})`);
    g.addColorStop(0.4, `rgba(255,140,40,${0.8 * alpha})`);
    g.addColorStop(1, `rgba(60,50,40,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (e.big) {
      ctx.strokeStyle = `rgba(90,80,70,${0.5 * alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.15, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawCorpse(ctx: CanvasRenderingContext2D, c: Corpse): void {
  const alpha = Math.max(0, 1 - c.t / 30) * 0.7;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (c.water) {
    ctx.fillStyle = 'rgba(20,20,25,0.8)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 9 + c.t * 0.3, 4 + c.t * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.type === 'infantry') {
    ctx.strokeStyle = '#3a3530';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(c.x - 3, c.y - 3);
    ctx.lineTo(c.x + 3, c.y + 3);
    ctx.moveTo(c.x + 3, c.y - 3);
    ctx.lineTo(c.x - 3, c.y + 3);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#33302b';
    ctx.fillRect(c.x - 5, c.y - 4, 10, 8);
    ctx.fillStyle = 'rgba(80,70,60,0.8)';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 4 - Math.min(4, c.t), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface Ghost {
  x: number;
  y: number;
  ok: boolean;
  radius: number;
}

export function render(
  ctx: CanvasRenderingContext2D,
  map: BattleMap,
  state: GameState,
  terrainCanvas: HTMLCanvasElement,
  time: number,
  ghost: Ghost | null,
): void {
  ctx.drawImage(terrainCanvas, 0, 0);
  drawWaves(ctx, map, time);

  if (state.phase === 'setup') {
    const zones: DeployZones = deployZones(map);
    const H = map.h * map.tile;
    ctx.fillStyle = 'rgba(59,130,246,0.10)';
    ctx.fillRect(zones.blue.x0, 0, zones.blue.x1 - zones.blue.x0, H);
    ctx.fillStyle = 'rgba(239,68,68,0.10)';
    ctx.fillRect(zones.red.x0, 0, zones.red.x1 - zones.red.x0, H);
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(59,130,246,0.6)';
    ctx.strokeRect(zones.blue.x0 + 1, 1, zones.blue.x1 - zones.blue.x0 - 2, H - 2);
    ctx.strokeStyle = 'rgba(239,68,68,0.6)';
    ctx.strokeRect(zones.red.x0 + 1, 1, zones.red.x1 - zones.red.x0 - 2, H - 2);
    ctx.setLineDash([]);
  }

  for (const c of state.corpses) drawCorpse(ctx, c);

  const sorted = [...state.units].sort((a, b) => a.y - b.y);
  for (const u of sorted) drawUnit(ctx, u);

  for (const p of state.projectiles) drawProjectile(ctx, p);
  for (const e of state.explosions) drawExplosion(ctx, e);

  if (ghost && state.phase === 'setup') {
    ctx.strokeStyle = ghost.ok ? 'rgba(80,255,120,0.9)' : 'rgba(255,80,80,0.9)';
    ctx.fillStyle = ghost.ok ? 'rgba(80,255,120,0.2)' : 'rgba(255,80,80,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, Math.max(5, ghost.radius + 3), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export { isWaterTerrain, terrainAt };
