#!/usr/bin/env pwsh
# Script to rebuild and redeploy MCP Open Discovery server with modular architecture

Write-Host "🔄 Rebuilding and redeploying MCP Open Discovery Server..." -ForegroundColor Cyan

# Stop any running containers
Write-Host "🛑 Stopping any running containers..." -ForegroundColor Yellow
docker-compose down

# Build the new image with modular architecture
Write-Host "🏗️ Building Docker image..." -ForegroundColor Yellow
docker-compose build

# Start the containers
Write-Host "🚀 Starting containers..." -ForegroundColor Yellow
docker-compose up -d

# Pause to ensure services are up
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Show running containers
Write-Host "📊 Running containers:" -ForegroundColor Green
docker-compose ps

Write-Host "✅ Rebuild and redeploy complete!" -ForegroundColor Cyan
Write-Host "To view logs, use: docker-compose logs -f" -ForegroundColor Gray
docker-compose logs -f