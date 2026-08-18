---
name: Express Session Type Augmentation
description: How to add custom properties to express-session's SessionData without breaking the esbuild server bundle.
---

**Rule:** Put session type augmentation in `src/types/session.d.ts`. Do NOT import it with `import "./types/session"` in app.ts — esbuild cannot resolve .d.ts files and will crash the build.

**Why:** esbuild bundles the server and resolves all imports. A .d.ts-only file has no JS counterpart, so esbuild throws `Could not resolve "./types/session"`.

**How to apply:** The `tsconfig.json` for `artifacts/api-server` has `"include": ["src"]`, which automatically picks up all .d.ts files in `src/types/`. The TypeScript module augmentation (`declare module "express-session" { interface SessionData { isAdmin?: boolean } }`) takes effect without any explicit import.
