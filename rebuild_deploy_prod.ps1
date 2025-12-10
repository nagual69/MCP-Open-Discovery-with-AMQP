#!/usr/bin/env pwsh
# SPDX-License-Identifier: MPL-2.0
# Minimal production deploy for MCP Open Discovery (PowerShell)
# Uses docker/docker-file-mcpod-server.yml and optionally RabbitMQ via profile

param(
    # Transport selection (choose any combination)
    [switch]$Stdio,
    [switch]$Http,
    [switch]$Amqp,

    # Container profile selection
    [switch]$WithRabbitMq,
    [switch]$WithOAuth,

    # Back-compat alias: implies -Amqp and -WithRabbitMq
    [switch]$WithAmqp,

    # General
    [string]$ProjectName,
    [switch]$NoLogs,
    [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

# Determine a compose project name for scoping (precedence: parameter > COMPOSE_PROJECT_NAME > default)
if ([string]::IsNullOrWhiteSpace($ProjectName)) {
    $ProjectName = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { 'mcp-open-discovery-production' }
}

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
            # Only remove if the container belongs to this compose project (safety guard)
            $composeProjectLabel = (& docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' $Name 2>$null)
            if ($composeProjectLabel -and $composeProjectLabel -eq $ProjectName) {
                Write-Host "Removing existing container: $Name (project: $composeProjectLabel)" -ForegroundColor DarkYellow
                & docker rm -f $Name | Out-Null
            }
            else {
                Write-Host "Skip removing container '$Name' — not owned by compose project '$ProjectName'." -ForegroundColor Yellow
                Write-Host "If this causes a name conflict, set COMPOSE_PROJECT_NAME to a unique value or remove it manually." -ForegroundColor DarkYellow
            }
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
    Write-Host "  .\rebuild_deploy_prod.ps1 -Http                 # HTTP-only (default if no flags/env)" 
    Write-Host "  .\rebuild_deploy_prod.ps1 -Amqp -WithRabbitMq   # AMQP transport + RabbitMQ container" 
    Write-Host "  .\rebuild_deploy_prod.ps1 -WithOAuth            # Enable OAuth 2.1 + Keycloak container"
    Write-Host "  .\rebuild_deploy_prod.ps1 -Amqp                 # AMQP transport only (external broker)" 
    Write-Host "  .\rebuild_deploy_prod.ps1 -Stdio -Http          # StdIO + HTTP transports" 
    Write-Host "  .\rebuild_deploy_prod.ps1 -NoLogs               # Don't tail logs"
    Write-Host "  Deprecated: -WithAmqp (equivalent to -Amqp -WithRabbitMq)" -ForegroundColor DarkYellow
    Write-Host "  Options: -ProjectName <name>  # Overrides COMPOSE_PROJECT_NAME for this run"
    Write-Host "  Note: Compose project is scoped as '$ProjectName' (override with -ProjectName or COMPOSE_PROJECT_NAME)"
    exit 0
}

# Handle deprecated alias
if ($WithAmqp) {
    Write-Host "DEPRECATED: -WithAmqp is replaced by -Amqp -WithRabbitMq" -ForegroundColor DarkYellow
    $Amqp = $true
    if (-not $WithRabbitMq) { $WithRabbitMq = $true }
}

# Build TRANSPORT_MODE from flags
$selectedTransports = @()
if ($Stdio) { $selectedTransports += 'stdio' }
if ($Http)  { $selectedTransports += 'http' }
if ($Amqp)  { $selectedTransports += 'amqp' }

# Ensure HTTP is present when using RabbitMQ profile so healthcheck works
if ($WithRabbitMq -and $selectedTransports.Count -gt 0 -and -not ($selectedTransports -contains 'http')) {
    $selectedTransports = @('http') + $selectedTransports
}

if ($selectedTransports.Count -gt 0) {
    $env:TRANSPORT_MODE = ($selectedTransports -join ',')
}
elseif (-not $env:TRANSPORT_MODE) {
    # Default when no flags and no pre-set env: HTTP only
    $env:TRANSPORT_MODE = 'http'
}

Write-Host ("TRANSPORT_MODE = {0}" -f $env:TRANSPORT_MODE) -ForegroundColor Cyan

# Determine compose profile for RabbitMQ container
$profileArgs = @()
if ($WithRabbitMq) { $profileArgs += @('--profile', 'with-amqp') }
if ($WithOAuth) { 
    $profileArgs += @('--profile', 'with-oauth') 
    $env:OAUTH_ENABLED = 'true'
}

if ($WithRabbitMq -and -not $Amqp) {
    Write-Host "Warning: -WithRabbitMq specified without -Amqp. Deploying RabbitMQ container but AMQP transport not enabled." -ForegroundColor DarkYellow
}

# Stop/remove
Write-Host "Stopping containers..." -ForegroundColor Yellow
try { Invoke-Compose -ComposeArgs (@('-p', $ProjectName) + $profileArgs + @('-f', $composeFile, 'down', '--remove-orphans')) } catch { Write-Host "down failed or not running" -ForegroundColor DarkGray }

# Proactively resolve name conflicts from other projects
Remove-ContainerIfExists -Name 'mcp-open-discovery'
if ($WithRabbitMq) { Remove-ContainerIfExists -Name 'mcp-rabbitmq' }
if ($WithOAuth) { Remove-ContainerIfExists -Name 'mcp-keycloak' }

# Build
Write-Host "Building images..." -ForegroundColor Yellow
Invoke-Compose -ComposeArgs (@('-p', $ProjectName) + $profileArgs + @('-f', $composeFile, 'build', '--no-cache'))

# Start
Write-Host "Starting containers..." -ForegroundColor Yellow
Invoke-Compose -ComposeArgs (@('-p', $ProjectName) + $profileArgs + @('-f', $composeFile, 'up', '-d', '--remove-orphans'))

# Post start
Start-Sleep -Seconds 8
Invoke-Compose -ComposeArgs (@('-p', $ProjectName) + $profileArgs + @('-f', $composeFile, 'ps'))

if (-not $NoLogs) {
    Invoke-Compose -ComposeArgs (@('-p', $ProjectName) + $profileArgs + @('-f', $composeFile, 'logs', '-f'))
}
