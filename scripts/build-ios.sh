#!/bin/bash

echo "========================================"
echo "Building EcoPlate for iOS"
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
echo "Checking for iOS platform..."
if [ ! -d "ios" ]; then
    echo "Adding iOS platform..."
    bunx cap add ios
    if [ $? -ne 0 ]; then
        echo "Failed to add iOS platform"
        exit 1
    fi
fi

echo ""
echo "Building frontend for mobile..."
bun run build:ios
if [ $? -ne 0 ]; then
    echo "Failed to build frontend"
    exit 1
fi

echo ""
echo "========================================"
echo "iOS build complete!"
echo ""
echo "To open in Xcode, run:"
echo "  cd frontend && bunx cap open ios"
echo ""
echo "Or open: frontend/ios/App/App.xcworkspace"
echo "========================================"
