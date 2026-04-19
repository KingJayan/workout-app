# integration Tests

these tests hit the **live turso db** and require a running dev env

they will fail without valid `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` env vars.

```sh
# run all integration tests (single pass, requires .env)
npm run test:integration

# run a specific file
npm run test:integration -- src/integration/auth.test.ts
```

test create and clean up their own data using randomised emails / UUIDs.
they do not mock the database or HTTP layer
