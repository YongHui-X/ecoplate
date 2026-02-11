#!/bin/sh
set -e

DB_PATH="${DATABASE_PATH:-/app/data/ecoplate.db}"

# Fix ownership on Docker volumes (mounted as root, app runs as ecoplate)
echo "[entrypoint] Fixing volume permissions..."
chown -R ecoplate:ecoplate /app/data /app/public/uploads 2>/dev/null || true

# Check if database exists
if [ -f "$DB_PATH" ]; then
    echo "[entrypoint] Database exists, preserving data..."
else
    echo "[entrypoint] No database found, will create new one..."
fi

# Run migrations (safe - only applies new changes)
echo "[entrypoint] Running database migrations..."
su-exec ecoplate bun run src/db/migrate.ts

# Run seed (safe - skips if data exists, use --force to reset)
echo "[entrypoint] Running database seed..."
su-exec ecoplate bun run src/db/seed.ts

echo "[entrypoint] Database initialization complete."

echo "[entrypoint] Starting server..."
exec su-exec ecoplate bun run src/index.ts
