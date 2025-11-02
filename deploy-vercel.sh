#!/bin/bash

# Big Two Multiplayer - Vercel Deployment Script
# This script helps you deploy the frontend to Vercel

set -e

echo "🎮 Big Two Multiplayer - Vercel Deployment Script"
echo "=================================================="
echo ""

# Check if backend URL is provided
if [ -z "$1" ]; then
    echo "❌ ERROR: Backend URL is required!"
    echo ""
    echo "Usage: ./deploy-vercel.sh <backend-url>"
    echo ""
    echo "Example:"
    echo "  ./deploy-vercel.sh https://big2-backend.onrender.com"
    echo ""
    echo "📝 Don't have a backend deployed yet?"
    echo "   See DEPLOYMENT.md for backend deployment instructions."
    exit 1
fi

BACKEND_URL="$1"

# Remove trailing slash if present
BACKEND_URL="${BACKEND_URL%/}"

echo "🔍 Checking backend availability..."
echo "   URL: $BACKEND_URL"

# Check if backend is accessible
if curl -f -s -o /dev/null "$BACKEND_URL/healthz"; then
    echo "✅ Backend is accessible and healthy!"
else
    echo "⚠️  WARNING: Could not reach backend health check endpoint"
    echo "   Make sure your backend is deployed and running"
    echo "   Continuing anyway..."
fi

echo ""
echo "📦 Building client..."
cd client && npm run build && cd ..

echo ""
echo "🚀 Setting environment variable in Vercel..."
vercel env add VITE_BACKEND_URL production <<EOF
$BACKEND_URL
EOF

echo ""
echo "🌐 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Visit your Vercel URL"
echo "   2. Open browser DevTools (F12) and check console"
echo "   3. Join a game and test the connection"
echo ""
echo "🎮 Enjoy your game!"
