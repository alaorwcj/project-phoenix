# Docker Platform - Database Setup Script (Windows)
# Runs: docker-compose up, prisma migrate, and seed

param(
    [switch]$SkipCompose = $false,
    [switch]$SkipSeed = $false
)

$ErrorActionPreference = 'Stop'

Write-Host "🚀 Docker Platform - Database Setup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Check if docker exists
try {
    $null = docker --version 2>$null
}
catch {
    Write-Host "❌ Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

if (-not $SkipCompose) {
    # Start PostgreSQL
    Write-Host ""
    Write-Host "📦 Starting PostgreSQL..." -ForegroundColor Yellow
    docker-compose up -d postgres

    # Wait for PostgreSQL to be ready
    Write-Host ""
    Write-Host "⏳ Waiting for PostgreSQL to be ready (10 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    Write-Host "✅ PostgreSQL started" -ForegroundColor Green
}

# Navigate to control-plane
Push-Location control-plane

try {
    # Install dependencies
    Write-Host ""
    Write-Host "📚 Installing npm dependencies..." -ForegroundColor Yellow
    npm install

    # Generate Prisma client
    Write-Host ""
    Write-Host "🔧 Generating Prisma client..." -ForegroundColor Yellow
    npm run db:generate

    # Run migrations
    Write-Host ""
    Write-Host "🗄️  Running database migrations..." -ForegroundColor Yellow
    npm run db:migrate -- --name init

    # Seed database (optional)
    if (-not $SkipSeed) {
        Write-Host ""
        Write-Host "🌱 Seeding database with test data..." -ForegroundColor Yellow
        npm run db:seed
    }

    Write-Host ""
    Write-Host "✅ Database setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Test Credentials:" -ForegroundColor Cyan
    Write-Host "   Tenant: Acme Corporation" -ForegroundColor White
    Write-Host ""
    Write-Host "   Admin:    admin@acme.local / admin123456" -ForegroundColor White
    Write-Host "   Operator: operator@acme.local / operator123456" -ForegroundColor White
    Write-Host "   Viewer:   viewer@acme.local / viewer123456" -ForegroundColor White
    Write-Host ""
    Write-Host "🎯 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Start Control Plane: npm run dev" -ForegroundColor White
    Write-Host "   2. View database (optional): docker-compose up pgadmin" -ForegroundColor White
    Write-Host "   3. Start Host Agent (in another terminal): cd agent; go run cmd/agent/main.go" -ForegroundColor White
    Write-Host ""
}
finally {
    Pop-Location
}
