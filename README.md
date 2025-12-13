# PackZen

A mobile-first packing list web app for travel with all-items management, trip planning, and bag organization. Built with Astro, Solid.js, Tailwind CSS, Cloudflare D1, and Clerk Auth.

## Tech Stack

- **Frontend**: Astro.js + Solid.js + Tailwind CSS + TypeScript
- **Backend**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **ORM**: Drizzle ORM
- **Auth**: Clerk
- **Deployment**: Cloudflare Pages

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

### 4. Generate and Run Database Migrations

```bash
# Generate migrations from schema
bun run db:generate

# Apply migrations to local D1 database
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

# Format code with Prettier
bun run format

# Generate database migrations
bun run db:generate

# Apply migrations (local)
bun run db:migrate

# Apply migrations (production)
bun run db:migrate:prod

# Open Drizzle Studio (database GUI)
bun run db:studio
```

## Project Structure

```
├── db/                      # Database schema & migrations
│   ├── schema.ts            # Drizzle schema definitions
│   └── migrations/          # Generated SQL migrations
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
├── drizzle.config.ts        # Drizzle ORM configuration
├── wrangler.jsonc           # Cloudflare configuration
└── package.json
```

## Deployment to Cloudflare

### 1. Build and Deploy

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

## Implementation Phases

- ✅ **Phase 1**: Project Setup
- ✅ **Phase 2**: Database Schema & Auth
- ✅ **Phase 3**: All Items Management
- ✅ **Phase 4**: Trip Management
- ✅ **Phase 5**: Bag Management
- ✅ **Phase 6**: Trip Items & Packing
- ✅ **Phase 7**: Layout & Navigation
- ⏳ **Phase 8**: Polish & Optimization

## Mobile-First Design Principles

- Minimum 44x44px touch targets
- 16px base font size (prevents iOS zoom)
- Bottom navigation for easy thumb access
- Large, clear tap targets for checkboxes
- Generous spacing (16px minimum)
- Smooth animations and transitions

## Free Tier Limits

- **Cloudflare Pages**: Unlimited sites, 500 builds/month
- **Cloudflare Workers**: 100K requests/day
- **Cloudflare D1**: 5GB storage, 5M reads/day, 100K writes/day
- **Clerk**: 10K monthly active users

## License

MIT
