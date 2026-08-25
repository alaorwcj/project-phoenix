#!/bin/bash

# Docker Platform - Database Setup Script
# Runs: docker-compose up, prisma migrate, and seed

set -e

echo "🚀 Docker Platform - Database Setup"
echo "===================================="

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker and Docker Compose."
    exit 1
fi

# Start PostgreSQL
echo ""
echo "📦 Starting PostgreSQL..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo ""
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check connection
if ! docker-compose exec -T postgres pg_isready -U postgres -d docker_platform &> /dev/null; then
    echo "⏳ Still waiting..."
    sleep 5
fi

echo "✅ PostgreSQL is ready"

# Navigate to control-plane
cd control-plane

# Install dependencies (if needed)
echo ""
echo "📚 Installing dependencies..."
npm install

# Generate Prisma client
echo ""
echo "🔧 Generating Prisma client..."
npm run db:generate

# Run migrations
echo ""
echo "🗄️  Running database migrations..."
npm run db:migrate -- --name init

# Seed database
echo ""
echo "🌱 Seeding database with test data..."
npm run db:seed

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📋 Test Credentials:"
echo "   Tenant: Acme Corporation"
echo ""
echo "   Admin:    admin@acme.local / admin123456"
echo "   Operator: operator@acme.local / operator123456"
echo "   Viewer:   viewer@acme.local / viewer123456"
echo ""
echo "🎯 Next Steps:"
echo "   1. Start Control Plane: npm run dev"
echo "   2. View database (optional): docker-compose up pgadmin"
echo "   3. Start Host Agent (in another terminal): cd agent && ./bin/agent"
echo ""
