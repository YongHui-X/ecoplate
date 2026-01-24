#!/bin/bash

echo "========================================"
echo "Starting Recommendation Engine (Flask)"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RECOMMENDATION_DIR="$PROJECT_ROOT/recommendation-engine"

cd "$RECOMMENDATION_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo ""
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt --quiet

# Start the Flask server
echo ""
echo "========================================"
echo "Recommendation Engine running at:"
echo "http://localhost:5000"
echo "========================================"
echo ""

export FLASK_ENV=development
export PORT=5000
python app.py
