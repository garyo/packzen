#!/bin/bash
set -e

echo "📦 Building PackZen for production..."

# Check for production keys file
if [ ! -f ".env.production.local" ]; then
  echo "❌ Error: .env.production.local not found"
  echo "Create it with: PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_..."
  exit 1
fi

# Load production key
source .env.production.local

# Build with production key
PUBLIC_CLERK_PUBLISHABLE_KEY=$PUBLIC_CLERK_PUBLISHABLE_KEY bun run build

echo "🗄️  Running database migrations..."
npx wrangler d1 migrations apply packzen-db --remote

echo "🚀 Deploying to Cloudflare Workers..."
npx wrangler deploy

echo "✅ Deployed to https://packzen.org"
