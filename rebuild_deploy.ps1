#!/usr/bin/env pwsh
# Script to rebuild and redeploy MCP Open Discovery server with modular architecture

param(
    [switch]$BuildAll,
    [switch]$Help,
    [switch]$NoLogs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Always operate from the repo root (script directory)
Set-Location -Path $PSScriptRoot

function Invoke-Compose {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$ComposeArgs
    )

    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        & docker-compose @ComposeArgs
    }
    elseif (Get-Command docker -ErrorAction SilentlyContinue) {
        & docker compose @ComposeArgs
    }
    else {
        throw "Docker (compose) not found. Install Docker Desktop/Engine and ensure it's on PATH."
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Compose command failed: $($ComposeArgs -join ' ') (exit $LASTEXITCODE)"
    }
}

$composeFile = Join-Path $PSScriptRoot 'docker/docker-compose.yml'

# Validate compose file location (moved under docker/)
if (-not (Test-Path -Path $composeFile)) {
    throw "Compose file not found: $composeFile. Run this script from the repository root."
}

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

try {
    # Stop containers based on scope
    if ($BuildAll) {
        Write-Host "Stopping ALL containers..." -ForegroundColor Yellow
        Invoke-Compose -ComposeArgs @('-f', $composeFile, 'down')
    }
    else {
        Write-Host "Stopping MCP server container only..." -ForegroundColor Yellow
        try { Invoke-Compose -ComposeArgs @('-f', $composeFile, 'stop', 'mcp-server') } catch { Write-Host "mcp-server not running or stop failed, continuing..." -ForegroundColor DarkGray }
        try { Invoke-Compose -ComposeArgs @('-f', $composeFile, 'rm', '-f', 'mcp-server') } catch { Write-Host "mcp-server not present to remove, continuing..." -ForegroundColor DarkGray }
    }

    # Build the image(s)
    if ($BuildAll) {
        Write-Host "Building ALL Docker images..." -ForegroundColor Yellow
        Invoke-Compose -ComposeArgs @('-f', $composeFile, 'build', '--no-cache')
    }
    else {
        Write-Host "Building MCP server Docker image..." -ForegroundColor Yellow
        Invoke-Compose -ComposeArgs @('-f', $composeFile, 'build', '--no-cache', 'mcp-server')
    }

    # Start the containers
    Write-Host "Starting containers..." -ForegroundColor Yellow
    Invoke-Compose -ComposeArgs @('-f', $composeFile, 'up', '-d')

    # Pause to ensure services are up
    Write-Host "Waiting for services to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    # Show running containers
    Write-Host "Running containers:" -ForegroundColor Green
    Invoke-Compose -ComposeArgs @('-f', $composeFile, 'ps')

    Write-Host "Rebuild and redeploy complete!" -ForegroundColor Cyan
    Write-Host 'To view logs, use: docker compose -f docker/docker-compose.yml logs -f' -ForegroundColor Gray
}
catch {
    Write-Error $_
    exit 1
}

if (-not $NoLogs) {
    Invoke-Compose -ComposeArgs @('-f', $composeFile, 'logs', '-f')
}