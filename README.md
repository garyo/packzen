# PackZen

[![Build](https://github.com/garyo/packzen/actions/workflows/build.yml/badge.svg)](https://github.com/garyo/packzen/actions/workflows/build.yml)

A mobile-first packing list web app for travel with all-items management, trip planning, and bag organization. Built with Astro, Solid.js, Tailwind CSS, Cloudflare D1, and Clerk Auth.

## Tech Stack

- **Frontend**: Astro.js + Solid.js + Tailwind CSS + TypeScript
- **Backend**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **ORM**: Drizzle ORM
- **Auth**: Clerk
- **Deployment**: Cloudflare Workers, auto-deployed on push to `main`

## Features

- 📝 All items list with categories for your packing items
- 🧳 Trip-specific packing lists
- 👜 Bag organization (carry-on, checked, personal item)
- ✅ Pack/unpack tracking
- 📱 Mobile-first design with large touch targets
- 🔄 Multi-device sync via Cloudflare D1
- 🔐 Secure authentication with Clerk

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Clerk account](https://clerk.com/)

### 1. Install Dependencies

```bash
bun install
```

### 2. Set Up Clerk Auth

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Create a new application
3. Copy your Publishable Key and Secret Key
4. Create a `.env` file:

```bash
cp .env.example .env
```

5. Update `.env` with your Clerk keys:

```env
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
```

### 3. Set Up Cloudflare D1 Database

```bash
# Login to Cloudflare (if you haven't already)
npx wrangler login

# Create D1 database
npx wrangler d1 create packzen-db
```

This will output something like:

```
✅ Successfully created DB 'packzen-db' in region WEUR
Created your database using D1's new storage backend.

[[d1_databases]]
binding = "DB"
database_name = "packzen-db"
database_id = "your-database-id-here"
```

Copy the `database_id` and update `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "packzen-db",
      "database_id": "paste-your-database-id-here",
    },
  ],
}
```

### 4. Apply Database Migrations

```bash
# Apply migrations to the local D1 database
bun run db:migrate
```

### 5. Start Development Server

```bash
bun run dev
```

The app will be available at [http://localhost:4321](http://localhost:4321)

## Development Commands

```bash
# Start dev server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview

# Run tests
bun run test

# Format code with Prettier
bun run format

# Apply migrations (local)
bun run db:migrate

# Apply migrations (production)
bun run db:migrate:prod

# Open Drizzle Studio on the local database
bun run db:studio
```

### Changing the Database Schema

Migrations are hand-written SQL, applied in order by wrangler (and by the tests,
which build their database from them):

1. Add the next numbered file to `db/migrations/`, e.g. `0010_add_widgets.sql`.
   Make it additive or data-preserving — never drop user data.
2. Mirror the change in `db/schema.ts` (tables and indexes).
3. `bun run db:migrate` locally, then `bun run test`.
4. Apply to production with `bun run db:migrate:prod` before deploying code that
   needs it.

## Project Structure

```
├── db/                      # Database schema & migrations
│   ├── schema.ts            # Drizzle schema definitions
│   └── migrations/          # Hand-written SQL migrations
├── src/
│   ├── components/          # Solid.js components
│   ├── layouts/             # Astro layouts
│   ├── lib/                 # Utilities
│   ├── middleware.ts        # Astro middleware for auth
│   ├── pages/               # Astro routes & API endpoints
│   ├── stores/              # Solid stores
│   └── styles/              # Global CSS
├── public/                  # Static assets
├── astro.config.mjs         # Astro configuration
├── drizzle.config.ts        # Drizzle Studio configuration
├── wrangler.jsonc           # Cloudflare configuration
└── package.json
```

## Deployment to Cloudflare

This is a **Worker**, not a Pages project — `wrangler.jsonc` is the
serving config, and it is committed and load-bearing. Pushing to `main`
auto-deploys via Cloudflare Workers Builds.

### 1. Deploying by hand

Only needed if Workers Builds is unavailable, or to ship without a push:

```bash
# Build the project
bun run build

# Deploy to Cloudflare Workers (includes static assets)
npx wrangler deploy
```

The first deployment will create a new Worker in your Cloudflare account.

### 2. Set Production Secrets

```bash
# Set Clerk secret key
npx wrangler secret put CLERK_SECRET_KEY
# Paste your Clerk secret key when prompted
```

### 3. Set Environment Variables

Update `wrangler.jsonc` with your production values:

```jsonc
{
  "vars": {
    "PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_your_production_key",
  },
}
```

Then redeploy: `npx wrangler deploy`

### 4. Apply Database Migrations to Production

```bash
bun run db:migrate:prod
```

## Mobile-First Design Principles

- Minimum 44x44px touch targets
- 16px base font size (prevents iOS zoom)
- Large, clear tap targets for checkboxes
- Generous spacing (16px minimum)
- Smooth animations and transitions

## Free Tier Limits

- **Cloudflare Workers**: 100K requests/day
- **Cloudflare D1**: 5GB storage, 5M reads/day, 100K writes/day
- **Clerk**: 10K monthly active users

## License

MIT
