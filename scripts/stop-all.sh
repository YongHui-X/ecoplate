#!/bin/bash

echo "========================================"
echo "Stopping All EcoPlate Servers"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

./stop-backend.sh
./stop-frontend.sh
./stop-recommendation.sh

echo ""
echo "========================================"
echo "All servers stopped."
echo "========================================"
