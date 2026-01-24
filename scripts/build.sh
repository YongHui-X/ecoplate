#!/bin/bash

echo "========================================"
echo "Building EcoPlate for Production"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo ""
echo "Installing backend dependencies..."
cd backend
bun install
if [ $? -ne 0 ]; then
    echo "Failed to install backend dependencies"
    exit 1
fi

echo ""
echo "Installing frontend dependencies..."
cd ../frontend
bun install
if [ $? -ne 0 ]; then
    echo "Failed to install frontend dependencies"
    exit 1
fi

echo ""
echo "Building frontend..."
bun run build
if [ $? -ne 0 ]; then
    echo "Failed to build frontend"
    exit 1
fi

echo ""
echo "========================================"
echo "Build complete!"
echo ""
echo "Frontend built to: backend/public/"
echo ""
echo "To start production server:"
echo "  cd backend"
echo "  bun run src/index.ts"
echo "========================================"
