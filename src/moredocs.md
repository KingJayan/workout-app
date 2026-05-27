## architecture

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
```

---

## tests + quality

```sh
# unit tests w/o db
npm test               # vitest watch mode
npm test -- --run      # single pass

# integration tests w/ db + creds
npm run dev      # in sep terminal first
TEST_BASE_URL=http://localhost:5173 npm run test:integration

# lint
npm run lint      # eslint across src/
```

**unit tests (`src/**/*.test.ts`):**
- `parser.test.ts` - set input parsing: standard templates, unit conversion, duration/distance, set-type keywords, rpe prefix, error/edge cases
- `rewrite.unit.test.ts` - fatigue logic with mocked db: sleep/readiness/event triggers, compound swap, set drop capping, multi-trigger merge, minimum set preservation

**integration tests (`src/integration/`, require `npm run dev` + `.env`):**
- `auth.test.ts` - register, login, logout: happy paths, validation errors (400/401/409), session cookie presence, session invalidation after logout
- `sync.test.ts` - `/api/sync` auth guards, userId ownership (401/403), upsert to turso, idempotency, field updates on re-sync; `syncNow()` client logic via mocked fetch
- `rewrite.test.ts` - `/api/prescriptions/rewrite` end-to-end: no-trigger identity, sleep/readiness triggers, compound swaps with gear, DB state assertions, ownership isolation
- `dexie.test.ts` - IndexedDB write helpers: `writeWorkout`, `writeSet`, `writeSets`, `deleteWorkout` (cascade), `deleteSet`, `getUnsyncedWorkouts/Sets`, `markSynced` (runs in `happy-dom`)

**linting:** eslint flat config with `@typescript-eslint` + `eslint-plugin-svelte`. runs as a pre-commit hook via husky + lint-staged (staged `.ts`/`.svelte` files only).

**ci (github actions):** on every push and pr to `main` -- install, lint, unit tests. integration tests are excluded from ci (require live db + server). see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
