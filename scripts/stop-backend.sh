#!/bin/bash

echo "========================================"
echo "Stopping EcoPlate Backend Server"
echo "========================================"

echo ""
echo "Finding backend processes on port 3000..."

# Find and kill process on port 3000
if command -v lsof &> /dev/null; then
    PID=$(lsof -ti:3000)
    if [ -n "$PID" ]; then
        echo "Killing process $PID"
        kill -9 $PID 2>/dev/null
    fi
fi

# Also try pkill for bun processes
pkill -f "bun.*src/index.ts" 2>/dev/null

echo ""
echo "Backend server stopped."
