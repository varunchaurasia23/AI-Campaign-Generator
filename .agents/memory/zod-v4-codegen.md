---
name: Zod v4 Codegen Compat
description: Orval v8.23 generates zod v4-style API calls (zod.email(), zod.int()) but the workspace catalog pins zod at ^3.25.x where these APIs live under the zod/v4 sub-path.
---

**Rule:** After running orval codegen, the generated `lib/api-zod/src/generated/api.ts` uses `import * as zod from 'zod'` but calls v4 APIs. Fix by post-processing the import.

**Why:** zod 3.25.x exposes v4 APIs at `zod/v4`, not at the root `zod` import. Orval v8.23 generates v4-style code unconditionally.

**How to apply:**
1. In `lib/api-spec/package.json`, the codegen script has a `sed` post-processor: `sed -i "s|from 'zod'|from 'zod/v4'|g" ../../lib/api-zod/src/generated/api.ts`
2. `lib/api-zod/tsconfig.json` has `paths: { "zod": ["./node_modules/zod/v4"] }` so TypeScript resolves the v4 types.
3. This runs automatically on every `pnpm --filter @workspace/api-spec run codegen` — no manual step needed.
