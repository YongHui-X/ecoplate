#!/bin/bash

echo "========================================"
echo "Starting EcoPlate (All Services)"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "Starting recommendation engine in background..."
./start-recommendation.sh &
RECOMMENDATION_PID=$!

echo ""
echo "Waiting for recommendation engine to initialize..."
sleep 3

echo ""
echo "Starting backend server in background..."
./start-backend.sh &
BACKEND_PID=$!

echo ""
echo "Waiting for backend to initialize..."
sleep 3

echo ""
echo "Starting frontend dev server in background..."
./start-frontend.sh &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "All servers are running!"
echo ""
echo "Recommendation: http://localhost:5000 (PID: $RECOMMENDATION_PID)"
echo "Backend:        http://localhost:3000 (PID: $BACKEND_PID)"
echo "Frontend:       http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "Press Ctrl+C to stop both servers,"
echo "or run ./stop-all.sh"
echo "========================================"

# Wait for both processes
wait
