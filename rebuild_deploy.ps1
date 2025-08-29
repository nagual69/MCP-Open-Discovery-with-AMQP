#!/usr/bin/env pwsh
# Script to rebuild and redeploy MCP Open Discovery server with modular architecture

param(
    [switch]$BuildAll,
    [switch]$Help,
    [switch]$NoLogs
)

if ($Help) {
    Write-Host "MCP Open Discovery Rebuild Script" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\rebuild_deploy.ps1           # Rebuild only the MCP server container (default)"
    Write-Host "  .\rebuild_deploy.ps1 -BuildAll # Rebuild all containers (MCP server, RabbitMQ, SNMP agents, Zabbix stack)"
    Write-Host "  .\rebuild_deploy.ps1 -Help     # Show this help message" 
    Write-Host "  .\rebuild_deploy.ps1 -NoLogs   # Do not tail logs after start"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Green
    Write-Host "  .\rebuild_deploy.ps1           # Fast rebuild for code changes"
    Write-Host "  .\rebuild_deploy.ps1 -BuildAll # Full rebuild for infrastructure changes"
    exit 0
}

if ($BuildAll) {
    Write-Host "Rebuilding and redeploying ALL MCP Open Discovery containers..." -ForegroundColor Cyan
}
else {
    Write-Host "Rebuilding and redeploying MCP Server container only..." -ForegroundColor Cyan
    Write-Host "Use -BuildAll to rebuild all containers (RabbitMQ, Zabbix, etc.)" -ForegroundColor Gray
}

# Stop containers based on scope
if ($BuildAll) {
    Write-Host "Stopping ALL containers..." -ForegroundColor Yellow
    docker-compose down
}
else {
    Write-Host "Stopping MCP server container only..." -ForegroundColor Yellow
    docker-compose stop mcp-server
    docker-compose rm -f mcp-server
}

# Build the image(s)
if ($BuildAll) {
    Write-Host "Building ALL Docker images..." -ForegroundColor Yellow
    docker-compose build --no-cache
}
else {
    Write-Host "Building MCP server Docker image..." -ForegroundColor Yellow
    docker-compose build --no-cache mcp-server
}

# Start the containers
Write-Host "Starting containers..." -ForegroundColor Yellow
docker-compose up -d

# Pause to ensure services are up
Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Show running containers
Write-Host "Running containers:" -ForegroundColor Green
docker-compose ps

Write-Host "Rebuild and redeploy complete!" -ForegroundColor Cyan
Write-Host 'To view logs, use: docker-compose logs -f' -ForegroundColor Gray
if (-not $NoLogs) {
    docker-compose logs -f
}