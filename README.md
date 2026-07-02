# Blue vs Red — Battle Simulator

**▶ Play it: <https://leorusin.github.io/blue-vs-red/>**

A realtime battle simulator that runs entirely in the browser. Pick two countries,
deploy armies and navies on a procedurally generated map, then watch them fight.

## Features

- 🌍 Country selection with flags (cosmetic — every army fights with the same hardware)
- 🪖 Five unit types: infantry, tanks, artillery, destroyers, battleships
- 💥 Realtime ballistics — tracer bullets, arcing artillery shells, splash damage, explosions
- ❤️ Unit health bars and a personnel casualty counter per side
- 🌲 Procedural maps with forests to hide in (units in cover are much harder to hit),
  beaches, a meandering river with bridges, and open sea
- ⚓ Naval battles on the sea and shore bombardment near the beaches
- ⏯️ Pause and 1×/2×/4× battle speed

## Structure

pnpm monorepo:

- `packages/engine` — pure TypeScript game engine (map generation, unit AI, ballistics, simulation)
- `apps/web` — Next.js app (static export) with a canvas renderer

## Development

```sh
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # static export to apps/web/out
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which builds the static
export and publishes it to the `gh-pages` branch. The site is served at
`https://<user>.github.io/blue-vs-red/`.

One-time setup: in the repository **Settings → Pages**, set **Source** to
*Deploy from a branch* and pick the `gh-pages` branch (root). After that every
push deploys automatically.
