#!/bin/bash

echo "========================================"
echo "Starting EcoPlate Frontend Dev Server"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../frontend"

echo ""
echo "Installing dependencies..."
bun install
if [ $? -ne 0 ]; then
    echo "Failed to install dependencies"
    exit 1
fi

echo ""
echo "Starting frontend dev server on http://localhost:5173"
echo "Press Ctrl+C to stop the server"
echo ""

bun run dev
