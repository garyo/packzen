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

All 5 tables created: `bags`, `categories`, `master_items`, `trip_items`, `trips`

To run migrations again (if schema changes):

```bash
bun run db:migrate:prod
```

## Step 4: Set Environment Variables (Secrets)

Set production secrets for your Worker using Wrangler CLI:

### Set Secrets via Wrangler

```bash
# Set Clerk publishable key (public - will be in client bundle)
npx wrangler secret put PUBLIC_CLERK_PUBLISHABLE_KEY
# When prompted, paste: pk_live_...

# Set Clerk secret key (private - server-side only)
npx wrangler secret put CLERK_SECRET_KEY
# When prompted, paste: sk_live_...
```

### Important Notes

- Use **production** Clerk keys (`pk_live_*`, `sk_live_*`), NOT test keys
- `CLERK_SECRET_KEY` is sensitive - never commit to git or expose publicly
- Secrets are encrypted and only available at runtime
- These variables are available to your Astro app via `import.meta.env`

## Step 5: Deploy to Cloudflare Workers

### Deploy the Worker

```bash
# Build the application
bun run build

# Deploy to Cloudflare Workers
npx wrangler deploy
```

This will:

1. Upload your Worker script (`dist/_worker.js/index.js`)
2. Upload static assets from `dist/` directory
3. Bind the D1 database
4. Make your app live at `https://packzen.<your-subdomain>.workers.dev`

### Continuous Deployment

For automatic deployments, use GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Workers
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

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

- Check that CLERK_SECRET_KEY is set in Cloudflare Pages environment variables
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
| PUBLIC_CLERK_PUBLISHABLE_KEY | Yes      | pk*live*... | Clerk publishable key (public)        |
| CLERK_SECRET_KEY             | Yes      | sk*live*... | Clerk secret key (private)            |
| DB                           | Auto     | -           | D1 database binding (auto-configured) |

## Maintenance

### Updating the Database Schema

1. Modify `db/schema.ts`
2. Generate migration: `bun run db:generate`
3. Test locally: `bun run db:migrate`
4. Deploy to production: `bun run db:migrate:prod`
5. Redeploy Worker: `npx wrangler deploy`

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
