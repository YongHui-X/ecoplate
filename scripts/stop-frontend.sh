#!/bin/bash

echo "========================================"
echo "Stopping EcoPlate Frontend Dev Server"
echo "========================================"

echo ""
echo "Finding frontend processes on port 5173..."

# Find and kill process on port 5173
if command -v lsof &> /dev/null; then
    PID=$(lsof -ti:5173)
    if [ -n "$PID" ]; then
        echo "Killing process $PID"
        kill -9 $PID 2>/dev/null
    fi
fi

# Also try pkill for vite processes
pkill -f "vite" 2>/dev/null

echo ""
echo "Frontend dev server stopped."
