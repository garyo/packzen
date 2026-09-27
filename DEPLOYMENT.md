# PackZen - Production Deployment Guide

This guide walks through deploying PackZen to **Cloudflare Workers with Static Assets** (the modern recommended approach as of 2025).

## Why Cloudflare Workers (Not Pages)?

As of 2025, **Cloudflare Workers with Static Assets** is the recommended deployment method:

- All future investment and features go into Workers (not Pages)
- Workers supports both static assets AND server-side rendering
- Same cost structure as Pages (static assets are free)
- More features: Durable Objects, Cron Triggers, better observability
- Pages is still supported but not where new development happens

Our `wrangler.jsonc` is already configured for the modern Workers approach with the `assets` binding.

## Prerequisites

1. Cloudflare account with Workers enabled
2. Clerk account with production app configured
3. Wrangler CLI authenticated (`npx wrangler login`)

## Step 1: Set Up Production Clerk App

1. Go to https://dashboard.clerk.com
2. Create a production application (or use existing one)
3. Copy your production keys:
   - **Publishable Key**: Starts with `pk_live_...`
   - **Secret Key**: Starts with `sk_live_...` (keep this secure!)

### NOTES:

Follow instructions at [https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google]

## Step 2: Create Production D1 Database ✅

**Already completed!** The production database is configured:

- Database name: `packzen-db`
- Region: ENAM (Eastern North America)

If you need to create a different database:

```bash
npx wrangler d1 create packzen-db
```

Then update the `database_id` in `wrangler.jsonc`.

## Step 3: Run Production Migrations ✅

**Already completed!** All migrations have been applied to the production database.

To apply new migrations (after a schema change):

```bash
bun run db:migrate:prod
```

## Step 4: Set Environment Variables (Secrets)

Set production secrets for your Worker using Wrangler CLI:

### Set Secrets via Wrangler

The Clerk publishable key is not a secret and is needed at **build** time
(static pages bake it in), so it lives in the committed `.env.production`. The
build fails if it's missing (`scripts/check-build-env.js`).

```bash
# Set Clerk secret key (private - server-side only)
npx wrangler secret put CLERK_SECRET_KEY
# When prompted, paste: sk_live_...

# Set the Clerk webhook signing secret (private - server-side only)
npx wrangler secret put CLERK_WEBHOOK_SECRET
# When prompted, paste: whsec_...
```

### Important Notes

- Use **production** Clerk keys (`pk_live_*`, `sk_live_*`), NOT test keys
- `CLERK_SECRET_KEY` is sensitive - never commit to git or expose publicly
- Secrets are encrypted and only available at runtime
- The Worker reads them at runtime (`env` from `cloudflare:workers`)
- Keep `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` as **runtime secrets
  only**, never as build variables (Workers Builds) or in a local `.env` you
  build for production from: Astro 6+ inlines build-time env into the server
  bundle, so a secret present at build time ends up in the deployed code

## Step 5: Deploy to Cloudflare Workers

### Continuous Deployment (Workers Builds)

Pushing to `main` deploys automatically through Cloudflare Workers Builds
(Workers & Pages → packzen → Settings → Build). Its settings:

- **Node version**: 22.12 or later (Astro 6+ requires it); set the
  `NODE_VERSION` build variable if the default is older
- **Build command**: `bun run build`
- **Deploy command**: `bun run deploy`, which applies pending D1 migrations
  (`wrangler d1 migrations apply packzen-db --remote`) and then runs
  `wrangler deploy`
- **API token**: needs D1 edit permission (for the migrations) as well as
  Workers deploy permission
- **Build variables**: no Clerk secrets (see Step 4)

### Deploying by hand

Only when Workers Builds is unavailable:

```bash
bun run build
bun run deploy
```

Never deploy a local build made with the live secret key in `.env` (or any
other env file Astro loads for production builds): it would be inlined into
the uploaded bundle.

A deploy:

1. Uploads your Worker script (`dist/server/`, via the config the build writes to `dist/server/wrangler.json`)
2. Uploads static assets from `dist/client/`
3. Binds the D1 database
4. Makes your app live at `https://packzen.<your-subdomain>.workers.dev`

## Step 6: Verify Deployment

After deployment, test the following:

- [ ] Sign up creates a new user
- [ ] Sign in works with existing credentials
- [ ] Users can only see their own data
- [ ] Creating trips, items, categories works
- [ ] Bag organization and packing works
- [ ] Trip copying works
- [ ] Data persists across page refreshes
- [ ] API returns 401 for unauthenticated requests

## Step 7: Configure Custom Domain (Optional)

1. Go to Cloudflare Workers & Pages → packzen → Settings → Domains & Routes
2. Add custom domain (e.g., packzen.com)
3. Cloudflare will automatically configure DNS if domain is in your account
4. Update Clerk's authorized domains to include your custom domain

## Troubleshooting

### "Authentication not configured" error

- Check that CLERK_SECRET_KEY is set as a Worker secret (`npx wrangler secret list`)
- Verify it's the production secret key (sk*live*\*)

### "Database not found" error

- Ensure database migrations ran: `bun run db:migrate:prod`
- Verify `database_id` in wrangler.jsonc matches your D1 database
- Check bindings in deployed Worker: `npx wrangler deployments list`

### Users can't sign in/sign up

- Check secrets are set: `npx wrangler secret list`
- Verify Clerk production app has correct authorized domains
- Check browser console for Clerk errors

### CORS errors

- Ensure your deployment domain is added to Clerk's authorized domains
- For custom domains, wait for DNS propagation (up to 24 hours)

## Environment Variables Reference

| Variable                     | Required | Example     | Description                           |
| ---------------------------- | -------- | ----------- | ------------------------------------- |
| PUBLIC_CLERK_PUBLISHABLE_KEY | Yes      | pk*live*... | Build-time, in `.env.production`      |
| CLERK_SECRET_KEY             | Yes      | sk*live*... | Clerk secret key (private)            |
| CLERK_WEBHOOK_SECRET         | Yes      | whsec\_...  | Clerk webhook signing secret          |
| DB                           | Auto     | -           | D1 database binding (auto-configured) |

## Maintenance

### Updating the Database Schema

Migrations are hand-written SQL (there is no generate step):

1. Add the next numbered `.sql` file to `db/migrations/` (additive or
   data-preserving only)
2. Mirror the change in `db/schema.ts`
3. Test locally: `bun run db:migrate`, then `bun run test`
4. Deploy: `bun run deploy` applies it before the new code goes live (or run
   `bun run db:migrate:prod` ahead of time)

### Monitoring

Cloudflare Workers provides:

- Real-time logs: `npx wrangler tail`
- Analytics in Cloudflare dashboard
- Observability enabled in wrangler.jsonc

For advanced monitoring, consider:

- Sentry for error tracking
- Cloudflare Web Analytics for user metrics
- Cloudflare Logpush for log storage

## Sources

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Astro Cloudflare Adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- [Deploy Astro to Cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [Full-Stack Development on Cloudflare Workers](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/)
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/compatibility-matrix/)
