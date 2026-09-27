# PackZen — Deployment Runbook

PackZen is a **Cloudflare Worker** (with static assets) at **https://packzen.org**,
backed by the D1 database `packzen-db` and Clerk auth. Pushing to `main`
deploys it through Cloudflare Workers Builds, usually within a minute.

## How the app is served

- **Static pages** (landing, `/trips`, `/all-items`, sign-in/up, pricing, …) are
  built once and served as files. The Worker never runs for them.
- **Server-rendered pages**: `/trips/[id]/pack` and `/trips/[id]/print`
  (`prerender = false`), plus every `/api/*` route. These run in the Worker, go
  through `src/middleware.ts`, and read runtime secrets.
- Build output (Astro 7 + `@astrojs/cloudflare` 14): `dist/client/` (static
  assets) and `dist/server/` (the Worker, with a generated `wrangler.json`).
  `wrangler deploy` finds it on its own; `wrangler.jsonc` `main` points at the
  adapter's entrypoint.

## Configuration: where each value lives

| Value                          | Where                                | Notes                                                                                                                                                        |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | committed `.env.production` **only** | Public by design. Baked in at build time; the build fails without it (`scripts/check-build-env.js`). **Never** set it as a Worker secret or var — see below. |
| `CLERK_SECRET_KEY`             | Worker runtime secret                | `wrangler secret put CLERK_SECRET_KEY`. Never a build variable.                                                                                              |
| `CLERK_WEBHOOK_SECRET`         | Worker runtime secret                | Verifies Clerk webhooks (`/api/webhooks/clerk`, `user.created`/`user.deleted`).                                                                              |
| Clerk fallback redirects       | `wrangler.jsonc` `vars`              | `CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `…SIGN_UP…` = `/trips`.                                                                                              |
| `DB` (D1 binding)              | `wrangler.jsonc` `d1_databases`      | `packzen-db`, id `7adf70b9-…`; migrations in `db/migrations/`.                                                                                               |
| Node version (Workers Builds)  | Workers Builds settings              | ≥ 22.12 (Astro 6+). Set `NODE_VERSION` if the default is older.                                                                                              |

**Why the publishable key must not be a Worker secret:** Clerk 4 looks up
`PUBLIC_CLERK_PUBLISHABLE_KEY` at runtime in this order: Worker env
(`cloudflare:workers`) → `process.env` → the value baked in at build. A Worker
secret therefore _overrides_ the built-in key on server-rendered pages only.
On 2026-09-27 a stale secret (the old key for `clerk.packzen.garyo.workers.dev`)
did exactly that: `/trips` worked but every pack page failed with
`ERR_SSL_VERSION_OR_CIPHER_MISMATCH` loading `clerk.packzen.garyo.workers.dev`.
The fix was `wrangler secret delete PUBLIC_CLERK_PUBLISHABLE_KEY`.

**Why secrets must not be build variables:** Astro 6+ inlines build-time env
into the server bundle, so a secret present at build time ends up in the
deployed code. For the same reason, never deploy a build made locally: your
`.env` holds dev keys and `.env.production.local` holds live values, and Vite
loads both.

## Continuous deployment (Workers Builds)

Dashboard: Workers & Pages → packzen → Settings → Build.

- **Build command:** `bun run build`
- **Deploy command:** `bun run deploy` — applies pending D1 migrations
  (`wrangler d1 migrations apply packzen-db --remote`), then `wrangler deploy`.
  The Workers Builds API token needs **D1 edit** permission for that step.
  (Not verified from the repo; if the deploy command is plain
  `npx wrangler deploy`, migrations don't run automatically — the release
  checklist applies them by hand first, which is safe either way.)
- **Build variables:** none are needed. No secrets here.
- Build logs are only visible in the dashboard; the wrangler OAuth token has no
  Workers Builds scope, so the API returns 403 for them.

GitHub Actions (`.github/workflows/build.yml`) runs tests, typecheck and a
build on pushes to `main` and on PRs. It does not deploy.

## Release checklist

1. **Local checks** (all must pass):

   ```bash
   bun run test && bun run typecheck && bun run build
   ```

2. **Migrations first.** See what production is missing, read the SQL, and
   estimate how many rows it touches:

   ```bash
   bunx wrangler d1 migrations list packzen-db --remote
   bunx wrangler d1 execute packzen-db --remote --command "select count(*) from …"
   bun run db:migrate:prod
   ```

   Migrations must be additive or data-preserving **and** work with the code
   currently deployed, so they can run before the new code and survive a
   rollback. D1 Time Travel can restore the database to a point in time if a
   migration goes wrong.

3. **Ship:** fast-forward `main`, tag the release (the About screen shows the
   tag via `git describe --exact-match`), and push both:

   ```bash
   git tag -a vX.Y.Z -m "…"
   git push --atomic origin main vX.Y.Z
   ```

4. **Watch for the deployment** (usually < 1 minute after the push):

   ```bash
   bunx wrangler deployments list --json   # newest by created_on
   ```

5. **Verify** (next section). If anything is wrong, **roll back first**, then
   debug.

## Verifying a deployment

Without an account:

```bash
curl -sI https://packzen.org/ | grep -iE 'content-security|nosniff|referrer|permissions'  # 4 headers
curl -s -X POST -H 'content-type: application/json' -d '{}' -w ' %{http_code}\n' https://packzen.org/api/trips  # 401
curl -sL https://packzen.org/dashboard | grep -o 'url=/trips'   # retired page redirects

# Which Clerk domain a server-rendered page uses — must be clerk.packzen.org only:
curl -s https://packzen.org/trips/<any-trip-id>/pack \
  | grep -oE 'pk_live_[A-Za-z0-9]+' | sort -u \
  | while read k; do echo "${k#pk_live_}==" | base64 -d 2>/dev/null; echo; done
```

In a browser (signed out is enough): `/sign-in` must show the Clerk form, and a
pack URL must redirect to sign-in — not show "Couldn't load sign-in". Check the
console for Clerk errors.

With a real account (the agent can't do this): sign in, open a trip, add, pack,
edit and print items; check plan limits and the pricing table.

## Rollback

```bash
bunx wrangler deployments list --json          # find the previous version_id
bunx wrangler rollback <version-id> --message "why" -y
```

This switches the Worker and its static assets back immediately. Database
migrations stay applied, which is why they must be compatible with the previous
code. Later pushes deploy normally again.

## Troubleshooting

**"Couldn't load sign-in" / console says "Clerk did not load".** Clerk's
script never loaded. Look at the network tab: which `clerk.*` host does it
request?

- **Nothing requested:** the build had no publishable key. The build guard
  should now prevent this; check `.env.production`.
- **A wrong host** (e.g. `clerk.packzen.garyo.workers.dev`,
  `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`): a publishable key for another domain is
  winning. Decode it (`echo <part after pk_live_>== | base64 -d`), then run
  `bunx wrangler secret list` and delete any `PUBLIC_CLERK_PUBLISHABLE_KEY` secret.

**Signed-in API calls return 401.** Check that `CLERK_SECRET_KEY` is set
(`bunx wrangler secret list`) and belongs to the same Clerk instance as the
publishable key (`clerk.packzen.org`).

**Logs:** `bunx wrangler tail` streams live Worker logs (observability is on in
`wrangler.jsonc`).

## Changing the database schema

Migrations are hand-written SQL; there is no generate step.

1. Add the next numbered file to `db/migrations/` (additive or data-preserving).
2. Mirror the change in `db/schema.ts`.
3. `bun run db:migrate` (local), then `bun run test` — tests build their
   schema from the migration files.
4. Apply to production as in the release checklist.

## One-time setup (already done; for rebuilding from scratch)

1. Clerk: a production instance whose frontend API is `clerk.packzen.org`;
   Google sign-in per
   <https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google>;
   a webhook to `https://packzen.org/api/webhooks/clerk` for `user.*` events.
2. D1: `bunx wrangler d1 create packzen-db`, put the id in `wrangler.jsonc`,
   then `bun run db:migrate:prod`.
3. Secrets: `bunx wrangler secret put CLERK_SECRET_KEY` and
   `CLERK_WEBHOOK_SECRET`. The publishable key goes in `.env.production`.
4. Workers Builds: connect the GitHub repo and use the settings above.
5. Custom domain: Worker → Settings → Domains & Routes → `packzen.org`; add it to
   Clerk's allowed domains.
