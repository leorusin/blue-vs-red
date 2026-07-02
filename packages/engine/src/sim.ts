import {
  BattleMap, GameState, Projectile, Team, Terrain, TERRAIN, Unit, UnitType,
} from './types';
import {
  deployZones, isWaterTerrain, landPassable, navalPassable, riverSide, terrainAt,
} from './map';
import { STATS, TEAM_BUDGET } from './units';
import { mulberry32 } from './rng';

export function createState(seed: number): GameState {
  return {
    units: [],
    projectiles: [],
    explosions: [],
    corpses: [],
    casualties: { blue: 0, red: 0 },
    time: 0,
    phase: 'setup',
    winner: null,
    nextId: 1,
    rand: mulberry32(seed ^ 0x9e3779b9),
  };
}

export function spentPoints(state: GameState, team: Team): number {
  let sum = 0;
  for (const u of state.units) if (u.team === team) sum += STATS[u.type].cost;
  return sum;
}

export interface PlaceResult {
  ok: boolean;
  reason?: string;
}

export function canPlace(
  state: GameState, map: BattleMap, team: Team, type: UnitType, x: number, y: number,
): PlaceResult {
  const stats = STATS[type];
  const W = map.w * map.tile;
  const H = map.h * map.tile;
  if (x < 4 || y < 4 || x > W - 4 || y > H - 4) return { ok: false, reason: 'Out of bounds' };
  const zones = deployZones(map);
  const zone = zones[team];
  if (x < zone.x0 || x > zone.x1) {
    return { ok: false, reason: team === 'blue' ? 'Deploy in the western (left) zone' : 'Deploy in the eastern (right) zone' };
  }
  const t = terrainAt(map, x, y);
  if (stats.naval && !navalPassable(t)) return { ok: false, reason: 'Ships must be placed at sea' };
  if (!stats.naval && !landPassable(t)) return { ok: false, reason: 'Land units need dry ground' };
  if (spentPoints(state, team) + stats.cost > TEAM_BUDGET) return { ok: false, reason: 'Not enough points' };
  for (const u of state.units) {
    const minD = stats.radius + STATS[u.type].radius + 2;
    if (Math.hypot(u.x - x, u.y - y) < minD) return { ok: false, reason: 'Too close to another unit' };
  }
  return { ok: true };
}

export function placeUnit(
  state: GameState, map: BattleMap, team: Team, type: UnitType, x: number, y: number,
): Unit | null {
  if (!canPlace(state, map, team, type, x, y).ok) return null;
  const stats = STATS[type];
  const unit: Unit = {
    id: state.nextId++,
    team, type, x, y,
    vx: 0, vy: 0,
    hp: stats.hp, maxHp: stats.hp,
    cooldown: state.rand() * stats.reload,
    heading: team === 'blue' ? 0 : Math.PI,
    flash: 0,
    dead: false,
  };
  state.units.push(unit);
  return unit;
}

export function removeUnitNear(state: GameState, team: Team, x: number, y: number): boolean {
  let best: Unit | null = null;
  let bd = 14;
  for (const u of state.units) {
    if (u.team !== team) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) { bd = d; best = u; }
  }
  if (!best) return false;
  state.units = state.units.filter((u) => u !== best);
  return true;
}

/** Spend the remaining budget on a mixed force and place it in the team's zone. */
export function autoDeploy(state: GameState, map: BattleMap, team: Team): void {
  const rand = state.rand;
  const zones = deployZones(map)[team];
  const H = map.h * map.tile;
  const front = team === 'blue' ? zones.x1 : zones.x0;
  const back = team === 'blue' ? zones.x0 : zones.x1;

  const wanted: UnitType[] = [];
  let budget = TEAM_BUDGET - spentPoints(state, team);
  const tryBuy = (t: UnitType, n: number) => {
    for (let i = 0; i < n; i++) {
      if (budget >= STATS[t].cost) { wanted.push(t); budget -= STATS[t].cost; }
    }
  };
  tryBuy('battleship', 1);
  tryBuy('destroyer', 2 + Math.floor(rand() * 2));
  tryBuy('artillery', 3 + Math.floor(rand() * 2));
  tryBuy('tank', 6 + Math.floor(rand() * 3));
  tryBuy('infantry', budget);

  for (const type of wanted) {
    const stats = STATS[type];
    for (let attempt = 0; attempt < 200; attempt++) {
      let x: number;
      let y: number;
      if (stats.naval) {
        x = zones.x0 + rand() * (zones.x1 - zones.x0);
        y = 6 + rand() * (map.coastY[Math.floor(x / map.tile)] * map.tile - 18);
      } else {
        // infantry near the front, artillery at the back, tanks in between
        const depth = type === 'infantry' ? 0.15 : type === 'tank' ? 0.4 : 0.75;
        const jitter = (rand() - 0.5) * 0.25;
        x = front + (back - front) * Math.min(0.95, Math.max(0.05, depth + jitter));
        const landTop = map.coastY[Math.floor(x / map.tile)] * map.tile + map.tile * 2;
        y = landTop + rand() * (H - landTop - 12);
      }
      if (placeUnit(state, map, team, type, x, y)) break;
    }
  }
}

export function startBattle(state: GameState): void {
  if (state.phase !== 'setup') return;
  const blue = state.units.some((u) => u.team === 'blue');
  const red = state.units.some((u) => u.team === 'red');
  if (blue && red) state.phase = 'battle';
}

function effectiveRange(shooter: Unit, target: Unit, map: BattleMap): number {
  let r = STATS[shooter.type].range;
  // Units hiding in a forest are hard to spot and engage.
  if (!STATS[target.type].naval && terrainAt(map, target.x, target.y) === TERRAIN.FOREST) {
    r *= 0.55;
  }
  return r;
}

function nearestEnemy(state: GameState, u: Unit): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const e of state.units) {
    if (e.team === u.team || e.dead) continue;
    const d = Math.hypot(e.x - u.x, e.y - u.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const STEER_OFFSETS = [0, 0.45, -0.45, 0.95, -0.95, 1.55, -1.55, 2.2, -2.2];

function moveToward(map: BattleMap, u: Unit, destX: number, destY: number, dt: number): void {
  const stats = STATS[u.type];
  let speed = stats.speed;
  const here = terrainAt(map, u.x, u.y);
  if (!stats.naval) {
    if (here === TERRAIN.FOREST) speed *= 0.6;
    else if (here === TERRAIN.SAND) speed *= 0.85;
  }
  const base = Math.atan2(destY - u.y, destX - u.x);
  const W = map.w * map.tile;
  const H = map.h * map.tile;
  for (const off of STEER_OFFSETS) {
    const a = base + off;
    const step = speed * dt;
    const nx = u.x + Math.cos(a) * step;
    const ny = u.y + Math.sin(a) * step;
    if (nx < 4 || ny < 4 || nx > W - 4 || ny > H - 4) continue;
    // probe slightly ahead so units don't clip into impassable tiles
    const px = u.x + Math.cos(a) * (step + stats.radius);
    const py = u.y + Math.sin(a) * (step + stats.radius);
    const t = terrainAt(map, px, py);
    const ok = stats.naval ? navalPassable(t) : landPassable(t);
    if (!ok) continue;
    u.vx = (nx - u.x) / dt;
    u.vy = (ny - u.y) / dt;
    u.x = nx;
    u.y = ny;
    u.heading = a;
    return;
  }
  u.vx = 0;
  u.vy = 0;
}

/** Where a land unit should march: straight at the enemy, or via a bridge. */
function moveGoal(map: BattleMap, u: Unit, enemy: Unit): { x: number; y: number } {
  if (STATS[u.type].naval) return { x: enemy.x, y: enemy.y };
  const us = riverSide(map, u.x, u.y);
  const es = riverSide(map, enemy.x, enemy.y);
  if (us !== 0 && es !== 0 && us !== es && map.bridges.length > 0) {
    let best = map.bridges[0];
    let bd = Infinity;
    for (const b of map.bridges) {
      const bx = (b.x + 0.5) * map.tile;
      const by = (b.y + 0.5) * map.tile;
      const d = Math.hypot(u.x - bx, u.y - by) + Math.hypot(enemy.x - bx, enemy.y - by);
      if (d < bd) { bd = d; best = b; }
    }
    return { x: (best.x + 0.5) * map.tile, y: (best.y + 1) * map.tile };
  }
  return { x: enemy.x, y: enemy.y };
}

function fireAt(state: GameState, map: BattleMap, u: Unit, target: Unit, dist: number): void {
  const stats = STATS[u.type];
  const rand = state.rand;
  u.cooldown = stats.reload * (0.85 + rand() * 0.3);
  u.flash = 0.09;
  u.heading = Math.atan2(target.y - u.y, target.x - u.x);

  const flight = Math.max(0.08, dist / stats.projectileSpeed);
  // lead the target a little, with spread growing with distance and cover
  const inForest = !STATS[target.type].naval && terrainAt(map, target.x, target.y) === TERRAIN.FOREST;
  const spread = stats.spread * (0.4 + 0.6 * (dist / stats.range)) * (inForest ? 2.1 : 1);
  const gauss = () => (rand() + rand() - 1) * spread;
  const tx = target.x + target.vx * flight * 0.6 + gauss();
  const ty = target.y + target.vy * flight * 0.6 + gauss();

  const p: Projectile = {
    id: state.nextId++,
    team: u.team,
    kind: stats.projectile,
    sx: u.x, sy: u.y,
    tx, ty,
    x: u.x, y: u.y,
    t: 0,
    flight,
    damage: stats.damage,
    splash: stats.splash,
    arc: stats.arc * Math.min(1, dist / stats.range),
  };
  state.projectiles.push(p);
}

function applyDamage(state: GameState, map: BattleMap, u: Unit, dmg: number): void {
  if (dmg <= 0 || u.dead) return;
  u.hp -= dmg;
  if (u.hp <= 0) {
    u.dead = true;
    const stats = STATS[u.type];
    state.casualties[u.team] += stats.crew;
    const water = isWaterTerrain(terrainAt(map, u.x, u.y));
    state.corpses.push({
      id: state.nextId++, x: u.x, y: u.y, t: 0, team: u.team, type: u.type, water,
    });
    state.explosions.push({
      id: state.nextId++, x: u.x, y: u.y, t: 0,
      dur: u.type === 'infantry' ? 0.4 : 0.9,
      maxR: u.type === 'infantry' ? 8 : stats.radius * 2.6,
      water, big: u.type !== 'infantry',
    });
  }
}

function impact(state: GameState, map: BattleMap, p: Projectile): void {
  const t = terrainAt(map, p.tx, p.ty);
  const water = isWaterTerrain(t);
  if (p.kind === 'shell') {
    state.explosions.push({
      id: state.nextId++, x: p.tx, y: p.ty, t: 0,
      dur: water ? 0.55 : 0.65,
      maxR: Math.max(10, p.splash),
      water, big: p.splash >= 25,
    });
  }
  const r = Math.max(p.splash, 5);
  for (const u of state.units) {
    if (u.dead) continue;
    const stats = STATS[u.type];
    const d = Math.hypot(u.x - p.tx, u.y - p.ty);
    const hitR = r + stats.radius;
    if (d >= hitR) continue;
    let dmg = p.damage * (p.splash > 0 ? Math.max(0.25, 1 - d / hitR) : 1);
    if (p.kind === 'bullet') {
      if (u.team === p.team) continue; // riflemen don't shoot their own
      dmg *= stats.bulletResist;
    } else if (u.team === p.team) {
      dmg *= 0.5; // friendly splash still hurts, a bit less
    }
    applyDamage(state, map, u, dmg);
  }
}

export function step(state: GameState, map: BattleMap, dt: number): void {
  state.time += dt;

  if (state.phase === 'battle') {
    // unit AI: pick targets, move, shoot
    for (const u of state.units) {
      if (u.dead) continue;
      const stats = STATS[u.type];
      u.cooldown -= dt;
      u.flash = Math.max(0, u.flash - dt);
      u.vx = 0;
      u.vy = 0;

      const enemy = nearestEnemy(state, u);
      if (!enemy) continue;
      const dist = Math.hypot(enemy.x - u.x, enemy.y - u.y);
      const range = effectiveRange(u, enemy, map);

      if (dist < stats.minRange) {
        // too close for indirect fire — fall back
        moveToward(map, u, u.x + (u.x - enemy.x), u.y + (u.y - enemy.y), dt);
      } else if (dist > range * 0.92) {
        const goal = moveGoal(map, u, enemy);
        moveToward(map, u, goal.x, goal.y, dt);
      } else if (u.cooldown <= 0) {
        fireAt(state, map, u, enemy, dist);
      }
    }

    // gentle separation so units don't stack
    const units = state.units;
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (a.dead) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (b.dead) continue;
        const minD = STATS[a.type].radius + STATS[b.type].radius + 1;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minD || d === 0) continue;
        const push = (minD - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        nudge(map, a, -nx * push, -ny * push);
        nudge(map, b, nx * push, ny * push);
      }
    }
  }

  // projectiles fly regardless of phase so the last shells still land
  const survivors: Projectile[] = [];
  for (const p of state.projectiles) {
    p.t += dt;
    const prog = Math.min(1, p.t / p.flight);
    p.x = p.sx + (p.tx - p.sx) * prog;
    p.y = p.sy + (p.ty - p.sy) * prog;
    if (p.t >= p.flight) impact(state, map, p);
    else survivors.push(p);
  }
  state.projectiles = survivors;

  for (const e of state.explosions) e.t += dt;
  state.explosions = state.explosions.filter((e) => e.t < e.dur);

  for (const c of state.corpses) c.t += dt;
  state.corpses = state.corpses.filter((c) => c.t < 30);

  state.units = state.units.filter((u) => !u.dead);

  if (state.phase === 'battle') {
    const blue = state.units.some((u) => u.team === 'blue');
    const red = state.units.some((u) => u.team === 'red');
    if (!blue || !red) {
      state.phase = 'ended';
      state.winner = blue ? 'blue' : red ? 'red' : 'draw';
    }
  }
}

function nudge(map: BattleMap, u: Unit, dx: number, dy: number): void {
  const nx = u.x + dx;
  const ny = u.y + dy;
  const t = terrainAt(map, nx, ny);
  const ok = STATS[u.type].naval ? navalPassable(t) : landPassable(t);
  if (ok) {
    u.x = nx;
    u.y = ny;
  }
}
