<div align="center">
  <h2><code>KingJayan/workout-app</code></h2>
  <p>offline-first pwa training log with fatigue-aware prescription rewriting</p>
</div>

---

## features

- **set logging** - template-driven parser (`[sets]x[reps] [weight] @[rpe]`) with live preview; supports kg/lbs auto-conversion, duration, distance, set-type keywords (`warmup`, `amrap`, `dropset`, `failure`)
- **prescriptions** - daily workout plans with exercise, load, rpe targets; status: `pending → accepted | modified | skipped`
- **fatigue rewrite algorithm** - auto-reduces working sets and swaps compound barbell movements to isolated alternatives based on sleep < 6h, readiness ≤ 4/10, or high-intensity events within 48h
- **recovery tracking** - sleep hours + subjective readiness per day; drives the rewrite algorithm
- **gear profiles** - per-user equipment flags (barbell, cable, machines, dumbbells, etc.) used to pick viable exercise alternatives
- **events calendar** - sport events with intensity rating; factored into fatigue decisions
- **weekly stats** - rolling 7-day volume load (kg·reps), session count
- **offline sync** - dexie.js local store → `/api/sync` batch upload on reconnect; `synced` flag on workouts/sets
- **pwa** - standalone display mode, workbox pre-cache, add-to-home-screen install prompt

---

## stack
<!--
```
src/
├── lib/
│   ├── db/
│   │   ├── schema.ts      drizzle table definitions
│   │   ├── client.ts      turso libsql drizzle client
│   │   ├── local.ts       dexie.js indexed-db store for offline writes
│   │   └── write.ts       shared insert helpers
│   ├── auth.ts            lucia v3 adapter over drizzle
│   ├── parser.ts          token-map set input parser
│   ├── rewrite.ts         fatigue rules engine + prescription mutation
│   └── sync.ts            background sync (online event + /api/sync)
├── routes/
│   ├── +layout.svelte     responsive shell
│   ├── +page.svelte       today dashboard (stat strip, prescriptions, sets, parser panel)
│   ├── +page.server.ts    sveltekit load -- drizzle queries for today's data
│   ├── api/
│   │   ├── sync/          batch upsert workouts + sets
│   │   ├── auth/          login / register / logout
│   │   └── prescriptions/rewrite/  trigger fatigue rewrite for a prescription
│   └── hooks.server.ts    lucia session validation → locals.user
├── app.css                tailwind v4 @theme {} tokens (inter + jetbrains mono, monochrome)
└── app.d.ts               app.locals type augmentation
drizzle/                   generated migrations
drizzle.config.ts          turso dialect, points at schema.ts
vite.config.ts             sveltekit + tailwind + vite-plugin-pwa
``` -->

sveltekit 2 · svelte 5 · drizzle-orm · turso (libsql) · lucia v3 · dexie.js · tailwind v4 · vite-plugin-pwa · lucide-svelte · vitest

---

## setup

### 1. clone + install

```sh
git clone https://github.com/KingJayan/workout-app
cd workout-app
pnpm install
```

### 2. turso db

```sh
# install turso cli if needed
curl -sSfL https://get.tur.so/install.sh | bash
#OR
brew install tursodatabase/tap/turso

turso db create workout-app
```

### 3. env

```sh
cp .env.example .env

# copy these into .env (no quotes)
turso db show workout-app --url
turso db tokens create workout-app
```

### 4. migrate

```sh
# dev: push schema to turso
pnpm db:push
# for prod migrations:
pnpm db:generate      # gen sql in ./drizzle
pnpm db:migrate       # apply migrations
```

### 5. dev

```sh
pnpm dev
```

---

## other

read testing + architecture docs [here](https://github.com/KingJayan/workout-app/blob/main/src/moredocs.md)


---

## notes

**parser design** - template drives tokenization. the parser is user-configurable per-account (`users.parser_template`) without code changes

**rewrite algorithm** - rules are additive: multiple triggers merge by taking `max(setDropPct)` (capped at 50%) and `OR`-ing swap flags. no external calls

**offline-first** - writes go to dexie indexed-db first (`synced: false`), then `/api/sync` upserts them to turso on next `online` event. server-rendered pages still query turso directly (no local read path yet)

**auth** - lucia v3 with a custom drizzle adapter

**deps** - `--legacy-peer-deps` required at install time due to `lucide-svelte@1.x` peer range vs. svelte 5 minor version

<div align="center"><p>built with :) by jayan</p></div>
