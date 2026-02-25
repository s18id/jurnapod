#!/bin/bash

# E2E Test Runner for Invoice Payment Default Feature
# Based on MANUAL_TESTING_GUIDE.md

set -e

echo "🧪 Jurnapod E2E Test Runner"
echo "============================"
echo ""

# Check if servers are running
echo "🔍 Checking if dev servers are running..."

if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "❌ API server not running at http://localhost:3001"
    echo "   Please start: cd apps/api && npm run dev"
    exit 1
fi
echo "✅ API server is running"

if ! curl -s http://localhost:3002 > /dev/null 2>&1; then
    echo "❌ Backoffice not running at http://localhost:3002"
    echo "   Please start: cd apps/backoffice && npm run dev"
    exit 1
fi
echo "✅ Backoffice is running"

echo ""
echo "🚀 Starting E2E tests..."
echo ""

# Run tests
cd e2e-tests

# Check if playwright is installed
if [ ! -d "node_modules/playwright" ]; then
    echo "📦 Installing Playwright..."
    npm install
    npx playwright install chromium
fi

# Run based on argument
case "${1:-headless}" in
    headed)
        echo "🖥️  Running in headed mode (browser visible)..."
        npm run test:headed
        ;;
    debug)
        echo "🐛 Running in debug mode..."
        npm run test:debug
        ;;
    *)
        echo "🤖 Running in headless mode..."
        npm run test
        ;;
esac

echo ""
echo "✅ E2E tests complete!"
