'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  autoDeploy, BattleMap, canPlace, cappedCasualties, countriesFor, createState, GameState,
  GameVersion, generateMap, placeUnit, removeUnitNear, spentPoints, startBattle, STATS, step,
  Team, TEAM_BUDGET, UNIT_TYPES, UnitType,
} from '@blue-vs-red/engine';
import { buildTerrainCanvas, Ghost, render, TEAM_COLORS } from './renderer';

const STEP_DT = 1 / 60;

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<BattleMap | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);

  const [, forceUi] = useReducer((x: number) => x + 1, 0);
  const [ready, setReady] = useState(false);
  const [team, setTeam] = useState<Team>('blue');
  const [unitType, setUnitType] = useState<UnitType>('infantry');
  // null until the player picks a version on the start screen
  const [version, setVersion] = useState<GameVersion | null>(null);
  const countries = countriesFor(version ?? '1.0.1');
  const [blueCountry, setBlueCountry] = useState(0);
  const [redCountry, setRedCountry] = useState(0);

  const switchVersion = (v: GameVersion) => {
    setVersion(v);
    const list = countriesFor(v);
    setBlueCountry(Math.max(0, list.findIndex((c) => c.name === 'United States')));
    setRedCountry(Math.max(0, list.findIndex((c) => c.name === 'Ukraine')));
    newBattle();
  };
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  const newBattle = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffffff);
    const map = generateMap(seed);
    mapRef.current = map;
    stateRef.current = createState(seed);
    terrainRef.current = buildTerrainCanvas(map);
    pausedRef.current = false;
    setPaused(false);
    setMessage(null);
    forceUi();
  }, []);

  useEffect(() => {
    newBattle();
    setReady(true);
  }, [newBattle]);

  // main loop
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const map = mapRef.current;
      const state = stateRef.current;
      const canvas = canvasRef.current;
      const terrain = terrainRef.current;
      if (!map || !state || !canvas || !terrain) return;
      if (!pausedRef.current && state.phase !== 'setup') {
        acc += dt * speedRef.current;
        const before = state.phase;
        while (acc > STEP_DT) {
          step(state, map, STEP_DT);
          acc -= STEP_DT;
        }
        if (state.phase !== before) forceUi();
      }
      const ctx = canvas.getContext('2d');
      if (ctx) render(ctx, map, state, terrain, now / 1000, ghostRef.current);
    };
    raf = requestAnimationFrame(frame);
    const hud = setInterval(forceUi, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hud);
    };
  }, [ready]);

  const canvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const map = mapRef.current;
    const state = stateRef.current;
    if (!map || !state || state.phase !== 'setup') return;
    const { x, y } = canvasPos(e);
    const check = canPlace(state, map, team, unitType, x, y);
    if (check.ok) {
      placeUnit(state, map, team, unitType, x, y);
      setMessage(null);
    } else {
      setMessage(check.reason ?? 'Cannot place here');
    }
    forceUi();
  };

  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const state = stateRef.current;
    if (!state || state.phase !== 'setup') return;
    const { x, y } = canvasPos(e);
    if (removeUnitNear(state, team, x, y)) forceUi();
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const map = mapRef.current;
    const state = stateRef.current;
    if (!map || !state || state.phase !== 'setup') {
      ghostRef.current = null;
      return;
    }
    const { x, y } = canvasPos(e);
    ghostRef.current = {
      x, y,
      ok: canPlace(state, map, team, unitType, x, y).ok,
      radius: STATS[unitType].radius,
    };
  };

  // start screen — the link opens here; pick a version to enter the game
  if (version === null) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center', padding: '40px 12px 12px' }}>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: 1 }}>
            <span style={{ color: TEAM_COLORS.blue.main }}>BLUE</span>
            <span style={{ opacity: 0.6, margin: '0 10px' }}>vs</span>
            <span style={{ color: TEAM_COLORS.red.main }}>RED</span>
          </div>
          <div style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}>
            Choose a version to play
          </div>
        </div>
        <div className="version-split">
          <button className="version-panel classic" onClick={() => switchVersion('0.1.0')}>
            <span
              style={{
                fontSize: 44, fontWeight: 900, letterSpacing: 2,
                color: TEAM_COLORS.blue.main,
              }}
            >
              BLUE
            </span>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#dce4f2' }}>
              Version 0.1.0
            </span>
            <span style={{ fontSize: 15, opacity: 0.8, maxWidth: 340, lineHeight: 1.5 }}>
              The classic version — the original 16 countries, no population limits.
            </span>
            <span
              style={{
                marginTop: 12, padding: '10px 26px', borderRadius: 8, fontWeight: 700,
                color: '#fff', background: TEAM_COLORS.blue.dark,
                border: `1px solid ${TEAM_COLORS.blue.main}`,
              }}
            >
              ▶ Play 0.1.0
            </span>
          </button>
          <button className="version-panel latest" onClick={() => switchVersion('1.0.1')}>
            <span
              style={{
                fontSize: 44, fontWeight: 900, letterSpacing: 2,
                color: TEAM_COLORS.red.main,
              }}
            >
              RED
            </span>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#dce4f2' }}>
              Version 1.0.1
            </span>
            <span style={{ fontSize: 15, opacity: 0.8, maxWidth: 340, lineHeight: 1.5 }}>
              The new version — more countries (all 197 of the world!) with real
              populations, so casualties can never exceed a country&apos;s population.
            </span>
            <span
              style={{
                marginTop: 12, padding: '10px 26px', borderRadius: 8, fontWeight: 700,
                color: '#fff', background: TEAM_COLORS.red.dark,
                border: `1px solid ${TEAM_COLORS.red.main}`,
              }}
            >
              ▶ Play 1.0.1
            </span>
          </button>
        </div>
      </div>
    );
  }

  const state = stateRef.current;
  const phase = state?.phase ?? 'setup';
  const alive = (t: Team) => state?.units.filter((u) => u.team === t).length ?? 0;
  const spent = (t: Team) => (state ? spentPoints(state, t) : 0);
  const blue = countries[blueCountry];
  const red = countries[redCountry];
  // the population cap on casualties is a v1.0.1 rule — v0.1.0 plays uncapped
  const capped = version === '1.0.1';
  const blueCasualties = capped
    ? cappedCasualties(state?.casualties.blue ?? 0, blue)
    : state?.casualties.blue ?? 0;
  const redCasualties = capped
    ? cappedCasualties(state?.casualties.red ?? 0, red)
    : state?.casualties.red ?? 0;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: 12 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', padding: '8px 4px',
        }}
      >
        <TeamBadge
          team="blue" flag={blue.flag} name={blue.name}
          population={capped ? blue.population : undefined}
          alive={alive('blue')} casualties={blueCasualties}
        />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
            <span style={{ color: TEAM_COLORS.blue.main }}>BLUE</span>
            <span style={{ opacity: 0.6, margin: '0 8px' }}>vs</span>
            <span style={{ color: TEAM_COLORS.red.main }}>RED</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {phase === 'setup' && 'Deploy your forces'}
            {phase === 'battle' && `Battle raging — t=${Math.floor(state?.time ?? 0)}s`}
            {phase === 'ended' && 'Battle over'}
          </div>
          <button
            onClick={() => setVersion(null)}
            style={{
              fontSize: 11, marginTop: 4, padding: '2px 10px', opacity: 0.7,
              background: 'transparent',
            }}
          >
            {version === '0.1.0' ? '🕹️' : '✨'} v{version} — switch
          </button>
        </div>
        <TeamBadge
          team="red" flag={red.flag} name={red.name}
          population={capped ? red.population : undefined}
          alive={alive('red')} casualties={redCasualties}
        />
      </div>

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={1152}
          height={720}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onMouseMove={onMove}
          onMouseLeave={() => (ghostRef.current = null)}
          style={{
            width: '100%', display: 'block', borderRadius: 12,
            border: '1px solid #2b3a55',
            cursor: phase === 'setup' ? 'crosshair' : 'default',
          }}
        />
        {phase === 'ended' && state && (
          <div
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(6,10,18,0.55)', borderRadius: 12,
            }}
          >
            <div
              style={{
                background: '#101a2e', border: '1px solid #2b3a55', borderRadius: 16,
                padding: '28px 40px', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 40 }}>
                {state.winner === 'blue' ? blue.flag : state.winner === 'red' ? red.flag : '🏳️'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0' }}>
                {state.winner === 'draw'
                  ? 'Mutual annihilation'
                  : state.winner === 'blue'
                    ? `${blue.name} wins!`
                    : `${red.name} wins!`}
              </div>
              <div style={{ opacity: 0.7, fontSize: 14, marginBottom: 16 }}>
                Casualties — {blue.flag} {blueCasualties.toLocaleString()} · {red.flag}{' '}
                {redCasualties.toLocaleString()}
              </div>
              <button className="active" onClick={newBattle}>
                ⚔️ New battle
              </button>
            </div>
          </div>
        )}
      </div>

      {phase === 'setup' && (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
            padding: '12px 4px',
          }}
        >
          <select value={blueCountry} onChange={(e) => setBlueCountry(+e.target.value)}>
            {countries.map((c, i) => (
              <option key={c.name} value={i}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
          <span style={{ opacity: 0.5 }}>vs</span>
          <select value={redCountry} onChange={(e) => setRedCountry(+e.target.value)}>
            {countries.map((c, i) => (
              <option key={c.name} value={i}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>

          <span style={{ width: 1, height: 24, background: '#2b3a55' }} />

          <button
            className={team === 'blue' ? 'active' : ''}
            style={{ color: TEAM_COLORS.blue.light }}
            onClick={() => setTeam('blue')}
          >
            Place for Blue ({TEAM_BUDGET - spent('blue')} pts)
          </button>
          <button
            className={team === 'red' ? 'active' : ''}
            style={{ color: TEAM_COLORS.red.light }}
            onClick={() => setTeam('red')}
          >
            Place for Red ({TEAM_BUDGET - spent('red')} pts)
          </button>

          <span style={{ width: 1, height: 24, background: '#2b3a55' }} />

          {UNIT_TYPES.map((t) => (
            <button
              key={t}
              className={unitType === t ? 'active' : ''}
              onClick={() => setUnitType(t)}
              title={`${STATS[t].name} — ${STATS[t].cost} pts${STATS[t].naval ? ' (naval)' : ''}`}
            >
              {STATS[t].icon} {STATS[t].name} · {STATS[t].cost}
            </button>
          ))}

          <span style={{ width: 1, height: 24, background: '#2b3a55' }} />

          <button
            onClick={() => {
              const s = stateRef.current;
              const m = mapRef.current;
              if (s && m) {
                autoDeploy(s, m, 'blue');
                autoDeploy(s, m, 'red');
                forceUi();
              }
            }}
          >
            🎲 Auto-deploy both
          </button>
          <button
            onClick={() => {
              const s = stateRef.current;
              if (s) {
                s.units = [];
                forceUi();
              }
            }}
          >
            🧹 Clear
          </button>
          <button
            className="active"
            disabled={!state || alive('blue') === 0 || alive('red') === 0}
            onClick={() => {
              const s = stateRef.current;
              if (s) {
                startBattle(s);
                forceUi();
              }
            }}
          >
            ▶️ Start battle
          </button>
        </div>
      )}

      {phase !== 'setup' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 4px' }}>
          <button
            onClick={() => {
              pausedRef.current = !pausedRef.current;
              setPaused(pausedRef.current);
            }}
          >
            {paused ? '▶️ Resume' : '⏸️ Pause'}
          </button>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              className={speed === s ? 'active' : ''}
              onClick={() => {
                speedRef.current = s;
                setSpeed(s);
              }}
            >
              {s}×
            </button>
          ))}
          <button onClick={newBattle}>🔄 Reset</button>
        </div>
      )}

      <div style={{ fontSize: 13, opacity: 0.65, padding: '0 4px 16px' }}>
        {phase === 'setup' ? (
          <>
            Pick a unit and click inside your zone to deploy — ships go on the sea, land units on
            dry ground. Right-click removes a unit. Infantry hiding in forests is much harder to
            hit. Land armies can only cross the river over bridges.
            {message && (
              <span style={{ color: '#fca5a5', marginLeft: 8 }}>⚠ {message}</span>
            )}
          </>
        ) : (
          'Casualties count personnel lost: infantry squads, vehicle crews and ship complements.'
        )}
      </div>
    </div>
  );
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function TeamBadge(props: {
  team: Team;
  flag: string;
  name: string;
  /** omitted in v0.1.0, where populations aren't part of the game */
  population?: number;
  alive: number;
  casualties: number;
}) {
  const c = TEAM_COLORS[props.team];
  const { population } = props;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px',
        border: `1px solid ${c.dark}`, borderRadius: 12, background: 'rgba(255,255,255,0.03)',
        minWidth: 220,
      }}
    >
      <span style={{ fontSize: 28 }}>{props.flag}</span>
      <div>
        <div style={{ fontWeight: 700, color: c.light }}>
          {props.name}
          {population !== undefined && (
            <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6, marginLeft: 6 }}>
              pop {compact.format(population)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {props.alive} units · ☠️ {props.casualties.toLocaleString()} casualties
        </div>
      </div>
    </div>
  );
}
