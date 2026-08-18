---
name: connect-pg-simple esbuild bundling
description: connect-pg-simple must be externalized in esbuild or createTableIfMissing fails at runtime
---

## Rule
Always add `"connect-pg-simple"` to the `external` array in `build.mjs` (esbuild config).

**Why:** `connect-pg-simple` reads `table.sql` via `fs.readFile(__dirname + '/table.sql')`.  When bundled by esbuild, `__dirname` becomes the `dist/` output directory — where the SQL file doesn't exist — so `createTableIfMissing: true` throws `ENOENT` at startup and the session store silently falls back, causing all sessions to fail.

**How to apply:** In `artifacts/api-server/build.mjs`, include `"connect-pg-simple"` in the `external` list alongside other CJS packages with runtime file reads (playwright, puppeteer, etc.).  The session table itself must be pre-created via a SQL migration (see `psql` command below) rather than relying on `createTableIfMissing`.

## Session table DDL
```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar   NOT NULL COLLATE "default",
  "sess"   json      NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

Note: PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS` — omit the `IF NOT EXISTS` clause on the ALTER TABLE.
