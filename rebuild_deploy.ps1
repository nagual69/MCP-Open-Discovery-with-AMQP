#!/usr/bin/env pwsh
# SPDX-License-Identifier: MPL-2.0
# Unified typed-runtime deploy for MCP Open Discovery.

param(
    [switch]$BuildAll,
    [switch]$WithAmqp,
    [switch]$WithOAuth,
    [switch]$WithSnmp,
    [switch]$WithZabbix,
    [switch]$Stdio,
    [switch]$Http,
    [switch]$Amqp,
    [string]$TransportMode,
    [string]$ProjectName,
    [string]$Ssh,
    [switch]$Help,
    [switch]$NoLogs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($args -contains '--help') {
    $Help = $true
}

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
        throw 'Docker (compose) not found. Install Docker Desktop/Engine and ensure it is on PATH.'
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Compose command failed: $($ComposeArgs -join ' ') (exit $LASTEXITCODE)"
    }
}

function Get-ComposeArgs {
    param(
        [string]$ComposeFile,
        [string]$ResolvedProjectName,
        [string[]]$Profiles
    )

    $args = @('-p', $ResolvedProjectName)
    foreach ($profile in $Profiles) {
        $args += @('--profile', $profile)
    }
    $args += @('-f', $ComposeFile)
    return $args
}

function Resolve-TransportModes {
    param(
        [string]$ExplicitTransportMode,
        [switch]$UseStdio,
        [switch]$UseHttp,
        [switch]$UseAmqpTransport,
        [switch]$UseAmqpProfile
    )

    $modes = @()
    if (-not [string]::IsNullOrWhiteSpace($ExplicitTransportMode)) {
        $modes = @($ExplicitTransportMode.Split(',').ForEach({ $_.Trim().ToLowerInvariant() }).Where({ $_ -in @('stdio', 'http', 'amqp') }))
    }
    else {
        if ($UseStdio) { $modes += 'stdio' }
        if ($UseHttp) { $modes += 'http' }
        if ($UseAmqpTransport) { $modes += 'amqp' }

        if ($modes.Count -eq 0) {
            if ($UseAmqpProfile -or $UseAmqpTransport) {
                $modes = @('http', 'amqp')
            }
            else {
                $modes = @('http')
            }
        }
    }

    if ($modes -contains 'amqp' -and -not ($modes -contains 'http')) {
        $modes = @('http') + $modes
        Write-Host 'Added http to TRANSPORT_MODE so the container health check remains valid.' -ForegroundColor DarkYellow
    }

    return (($modes | Select-Object -Unique) -join ',')
}

if ($BuildAll) {
    $WithAmqp = $true
    $WithOAuth = $true
    $WithSnmp = $true
    $WithZabbix = $true
}

$resolvedProjectName = if ([string]::IsNullOrWhiteSpace($ProjectName)) {
    if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { 'mcp-open-discovery' }
}
else {
    $ProjectName
}
$resolvedProjectName = ($resolvedProjectName.ToLowerInvariant() -replace '[^a-z0-9_-]', '-')

if ($Help) {
    Write-Host 'MCP Open Discovery Typed Docker Deploy' -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'Usage:' -ForegroundColor Yellow
    Write-Host '  .\rebuild_deploy.ps1                         # MCP server only (typed runtime)'
    Write-Host '  .\rebuild_deploy.ps1 -WithAmqp               # Add RabbitMQ profile and enable http,amqp transport'
    Write-Host '  .\rebuild_deploy.ps1 -WithSnmp -WithZabbix   # Add lab targets for SNMP and Zabbix testing'
    Write-Host '  .\rebuild_deploy.ps1 -WithOAuth              # Add Keycloak profile on host port 8081'
    Write-Host '  .\rebuild_deploy.ps1 -BuildAll               # Full lab stack: amqp + oauth + snmp + zabbix'
    Write-Host '  .\rebuild_deploy.ps1 -TransportMode stdio,http'
    Write-Host '  .\rebuild_deploy.ps1 -Ssh user@host'
    Write-Host '  .\rebuild_deploy.ps1 -NoLogs'
    Write-Host ''
    Write-Host 'Profiles:' -ForegroundColor Green
    Write-Host '  -WithAmqp   RabbitMQ transport lab'
    Write-Host '  -WithOAuth  Keycloak OAuth lab'
    Write-Host '  -WithSnmp   Three SNMP test agents'
    Write-Host '  -WithZabbix Full Zabbix test stack'
    Write-Host ''
    Write-Host ("Compose project: {0}" -f $resolvedProjectName) -ForegroundColor Gray
    exit 0
}

$composeFile = Join-Path $PSScriptRoot 'docker/compose.yml'
if (-not (Test-Path -Path $composeFile)) {
    throw "Compose file not found: $composeFile. Run this script from the repository root."
}

if (-not [string]::IsNullOrWhiteSpace($Ssh)) {
    $env:DOCKER_HOST = "ssh://$Ssh"
    Write-Host ("Remote Docker host enabled via DOCKER_HOST={0}" -f $env:DOCKER_HOST) -ForegroundColor Cyan
}

$profiles = @()
if ($WithAmqp) { $profiles += 'amqp' }
if ($WithOAuth) { $profiles += 'oauth' }
if ($WithSnmp) { $profiles += 'snmp' }
if ($WithZabbix) { $profiles += 'zabbix' }

$env:TRANSPORT_MODE = Resolve-TransportModes -ExplicitTransportMode $TransportMode -UseStdio:$Stdio -UseHttp:$Http -UseAmqpTransport:$Amqp -UseAmqpProfile:$WithAmqp
if ($WithOAuth) {
    $env:OAUTH_ENABLED = 'true'
}

if (($env:TRANSPORT_MODE -split ',') -contains 'amqp' -and -not $WithAmqp) {
    Write-Host 'AMQP transport enabled without the in-stack RabbitMQ profile. The runtime will use AMQP_URL as an external broker.' -ForegroundColor DarkYellow
}

$allProfiles = @('amqp', 'oauth', 'snmp', 'zabbix')
$composeArgs = Get-ComposeArgs -ComposeFile $composeFile -ResolvedProjectName $resolvedProjectName -Profiles $profiles
$composeArgsDown = Get-ComposeArgs -ComposeFile $composeFile -ResolvedProjectName $resolvedProjectName -Profiles $allProfiles

Write-Host 'Running TypeScript typecheck...' -ForegroundColor Yellow
& npm run typecheck
if ($LASTEXITCODE -ne 0) {
    throw 'TypeScript typecheck failed. Aborting deploy.'
}

Write-Host 'Deploying typed runtime from docker/compose.yml' -ForegroundColor Cyan
Write-Host ("TRANSPORT_MODE = {0}" -f $env:TRANSPORT_MODE) -ForegroundColor Cyan
if ($profiles.Count -gt 0) {
    Write-Host ("Profiles = {0}" -f ($profiles -join ', ')) -ForegroundColor Cyan
}
else {
    Write-Host 'Profiles = none (server only)' -ForegroundColor Gray
}

try {
    Write-Host 'Stopping existing containers for this compose project...' -ForegroundColor Yellow
    try {
        Invoke-Compose -ComposeArgs ($composeArgsDown + @('down', '--remove-orphans'))
    }
    catch {
        Write-Host 'Compose down failed or no containers were running, continuing...' -ForegroundColor DarkGray
    }

    Write-Host 'Building typed MCP server image...' -ForegroundColor Yellow
    Invoke-Compose -ComposeArgs ($composeArgs + @('build', '--no-cache', 'mcp-server'))

    Write-Host 'Starting containers...' -ForegroundColor Yellow
    Invoke-Compose -ComposeArgs ($composeArgs + @('up', '-d', '--remove-orphans'))

    Write-Host 'Waiting for services to settle...' -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    Write-Host 'Running containers:' -ForegroundColor Green
    Invoke-Compose -ComposeArgs ($composeArgs + @('ps'))

    Write-Host 'Deploy complete.' -ForegroundColor Cyan
    Write-Host 'Compose file: docker/compose.yml' -ForegroundColor Gray
}
catch {
    Write-Error $_
    exit 1
}

if (-not $NoLogs) {
    Invoke-Compose -ComposeArgs ($composeArgs + @('logs', '-f'))
}