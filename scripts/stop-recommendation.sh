#!/bin/bash

echo "Stopping Recommendation Engine..."

# Find and kill process on port 5000
PID=$(lsof -ti:5000)

if [ -n "$PID" ]; then
    echo "Stopping process on port 5000 (PID: $PID)"
    kill -9 $PID
    echo "Recommendation Engine stopped."
else
    echo "No Recommendation Engine process found on port 5000."
fi
