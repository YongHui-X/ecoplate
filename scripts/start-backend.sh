#!/bin/bash

echo "========================================"
echo "Starting EcoPlate Backend Server"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../backend"

echo ""
echo "Installing dependencies..."
bun install
if [ $? -ne 0 ]; then
    echo "Failed to install dependencies"
    exit 1
fi

echo ""
echo "Running database migrations..."
bun run src/db/migrate.ts || echo "Warning: Migration failed, continuing anyway..."

echo ""
echo "Seeding database..."
bun run src/db/seed.ts || echo "Warning: Seeding failed, continuing anyway..."

echo ""
echo "Starting backend server on http://localhost:3000"
echo "Press Ctrl+C to stop the server"
echo ""

bun run src/index.ts
