#!/usr/bin/env pwsh
# Minimal production deploy for MCP Open Discovery (PowerShell)
# Uses docker/docker-file-mcpod-server.yml and optionally RabbitMQ via profile

param(
    [switch]$WithAmqp,
    [switch]$NoLogs,
    [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        & docker-compose @ComposeArgs
    }
    elseif (Get-Command docker -ErrorAction SilentlyContinue) {
        & docker compose @ComposeArgs
    }
    else { throw "Docker (compose) not found. Install Docker and ensure it's on PATH." }
    if ($LASTEXITCODE -ne 0) { throw "Compose command failed: $($ComposeArgs -join ' ') (exit $LASTEXITCODE)" }
}

function Remove-ContainerIfExists {
    param([Parameter(Mandatory)][string]$Name)
    try {
        $id = (& docker ps -a --filter "name=^/$Name$" -q | Select-Object -First 1)
        if ($id) {
            Write-Host "Removing existing container: $Name" -ForegroundColor DarkYellow
            & docker rm -f $Name | Out-Null
        }
    }
    catch {
        Write-Host "Failed to remove container $Name (may not exist): $_" -ForegroundColor DarkGray
    }
}

$composeFile = Join-Path $PSScriptRoot 'docker/docker-file-mcpod-server.yml'
if (-not (Test-Path -Path $composeFile)) { throw "Compose file not found: $composeFile" }

if ($Help) {
    Write-Host "Minimal production deploy" -ForegroundColor Cyan
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\rebuild_deploy_prod.ps1            # HTTP-only server" 
    Write-Host "  .\rebuild_deploy_prod.ps1 -WithAmqp  # Server + RabbitMQ profile (AMQP)" 
    Write-Host "  .\rebuild_deploy_prod.ps1 -NoLogs    # Don't tail logs"
    exit 0
}

# Determine profile args once
$profileArgs = @()
if ($WithAmqp) { $profileArgs = @('--profile', 'with-amqp') }

# Ensure TRANSPORT_MODE aligns with selected profile
if ($WithAmqp) {
    $env:TRANSPORT_MODE = 'http,amqp'
}
else {
    if (-not $env:TRANSPORT_MODE -or $env:TRANSPORT_MODE -ne 'http') {
        $env:TRANSPORT_MODE = 'http'
    }
}

# Stop/remove
Write-Host "Stopping containers..." -ForegroundColor Yellow
try { Invoke-Compose -ComposeArgs ($profileArgs + @('-f', $composeFile, 'down', '--remove-orphans')) } catch { Write-Host "down failed or not running" -ForegroundColor DarkGray }

# Proactively resolve name conflicts from other projects
Remove-ContainerIfExists -Name 'mcp-open-discovery'
if ($WithAmqp) { Remove-ContainerIfExists -Name 'mcp-rabbitmq' }

# Build
Write-Host "Building images..." -ForegroundColor Yellow
Invoke-Compose -ComposeArgs ($profileArgs + @('-f', $composeFile, 'build', '--no-cache'))

# Start
Write-Host "Starting containers..." -ForegroundColor Yellow
Invoke-Compose -ComposeArgs ($profileArgs + @('-f', $composeFile, 'up', '-d', '--remove-orphans'))

# Post start
Start-Sleep -Seconds 8
Invoke-Compose -ComposeArgs ($profileArgs + @('-f', $composeFile, 'ps'))

if (-not $NoLogs) {
    Invoke-Compose -ComposeArgs ($profileArgs + @('-f', $composeFile, 'logs', '-f'))
}
