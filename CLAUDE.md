# PackZen — notes for Claude

Mobile-first packing-list app at https://packzen.org. Astro 7 + SolidJS 1.9 +
Tailwind 4, one Cloudflare Worker with static assets, D1 via Drizzle, Clerk 4
auth. Single maintainer (Gary); the audience is phones first.

## Commands (bun, never npm)

- `bun run dev` — dev server on :4321 (runs in workerd; daemonizes — stop with
  `bunx astro dev stop`). Run `bun run db:migrate` first on a fresh checkout.
- `bun run test` — node test runner over `tests/*.test.ts`, D1 via
  better-sqlite3 with the schema built from `db/migrations/*.sql`.
- `bun run typecheck` — `tsc --noEmit` + `astro check`.
- `bun run build` — also checks the Clerk key, validates built-in data, and
  generates the service worker.
- Pre-commit hook runs `prettier --check .`; run `bunx prettier --write` on
  changed files.

**Local testing without Clerk:** `/dev/login?as=<name>&new=1&redirect=/trips`
(dev only; `new=1` = a fresh user, `&plan=free_user` for the free plan).

## Deploying — read DEPLOYMENT.md first

Pushing to `main` deploys to production within about a minute (Workers Builds).
Before any production step, follow DEPLOYMENT.md's release checklist. The rules
that have caused outages:

- **The Clerk publishable key lives only in the committed `.env.production`.**
  Never set `PUBLIC_CLERK_PUBLISHABLE_KEY` as a Worker secret/var: Clerk 4
  prefers Worker env on server-rendered pages (`/trips/[id]/pack`, `/print`),
  so a stale one silently breaks them while static pages keep working.
- **Secrets are runtime-only** (`wrangler secret put`); never build variables,
  and never deploy a locally built bundle (Astro inlines build-time env).
- **Migrations go first** and must work with the currently deployed code, so a
  `wrangler rollback` stays safe.
- After deploying, verify (DEPLOYMENT.md § Verifying) and roll back before
  debugging if sign-in is broken.
- Ask before running anything against production (`--remote`, `wrangler
deploy`, `wrangler secret …`, pushes to `main`).

## Architecture map

- `src/pages/api/**` — API routes built with `createGetHandler`/`createPostHandler`/
  `createPatchHandler`/`createDeleteHandler` (`src/lib/api-helpers.ts`); ownership via `requireOwnedTrip`; plan limits in
  `resource-limits.ts`; billing resolved lazily (`billing.ts`), no Clerk API
  call per request.
- `src/middleware.ts` — auth for `/api/*`: **state-changing requests require a
  Bearer token** (there is no CSRF machinery); security headers on every
  response; dev fake auth only under `import.meta.env.DEV`.
- `src/lib/api.ts` — client. **`api.*` never throws**: it returns
  `{success:false, error, statusCode}`; always check `.success`. It retries
  non-POSTs once on 5xx/network errors; a DELETE that 404s counts as success.
- `src/lib/trip-items-store.ts` — a trip's items: optimistic
  `patchItems`/`deleteItems` with rollback and Undo, sync buffering.
  `trip-item-adder.ts` — every add path; accepted rows are saved to My Items.
- Sync: `sync-manager.ts` polls `/api/sync/events` (change_log); the checkpoint
  is `Last-Event-ID`, including 0.
- UI primitives: `ui/Modal` (stack, `isDirty`), `ui/ConfirmDialog`
  (`confirmDialog()` — never `window.confirm`), `ui/BagFields`, `ui/Toast`
  (`showToast`). Signed-in pages use `layouts/AppLayout.astro` +
  `components/nav/mountApp.ts` (auth gate, toast host, bottom nav).
- Vocabulary: "My Items" (saved items), "Suggestions" (built-in), "My Bags"
  (saved bags), `NO_BAG_LABEL` ("Not in a bag") from `src/lib/vocabulary.ts`.

## Invariants

- D1 allows at most **100 bound parameters** per statement: chunk multi-row
  inserts and `inArray` lookups with `chunkRowsForInsert`/`selectByIds`
  (`src/lib/d1.ts`). Tests fail any statement
  over 100 (local SQLite would otherwise allow 32766).
- An item is unpacked, packed **or** skipped — never packed and skipped
  (server-enforced; counts come from `packingStats`).
- Containers can't nest; deleting a container deletes its contents.
- Migrations are hand-written SQL in `db/migrations/` (no drizzle-kit
  generate), additive or data-preserving; mirror them in `db/schema.ts`.

Review history: `code-review-2026-07-02.md`, `code-review-2026-09-27.md`
(untracked, in the repo root).
