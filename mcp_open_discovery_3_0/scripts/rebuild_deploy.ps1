#!/usr/bin/env pwsh
# SPDX-License-Identifier: MPL-2.0

param(
    [switch]$BuildAll,
    [switch]$Targeted,
    [switch]$WithAmqp,
    [switch]$WithOAuth,
    [switch]$WithSnmp,
    [switch]$WithZabbix,
    [switch]$Stdio,
    [switch]$Http,
    [switch]$Amqp,
    [string]$TransportMode,
    [string]$ProjectName,
    [string[]]$Services,
    [switch]$SkipTypecheck,
    [switch]$NoCache,
    [string]$Ssh,
    [switch]$Help,
    [switch]$NoLogs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $RepoRoot

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

function Invoke-ZabbixBootstrap {
    param(
        [string[]]$ComposeArgs
    )

    Write-Host 'Bootstrapping Zabbix lab hosts...' -ForegroundColor Yellow
    Invoke-Compose -ComposeArgs ($ComposeArgs + @('run', '--rm', 'zabbix-bootstrap'))
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
        $modes = $ExplicitTransportMode
            .Split(',')
            .ForEach({ $_.Trim().ToLowerInvariant() })
            .Where({ $_ -in @('stdio', 'http', 'amqp') })
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

$composeFile = Join-Path $RepoRoot 'docker/compose.yml'
if (-not (Test-Path -Path $composeFile)) {
    throw "Compose file not found: $composeFile. Run this script from the repository root."
}

if ($BuildAll) {
    $WithAmqp = $true
    $WithOAuth = $true
    $WithSnmp = $true
    $WithZabbix = $true
}

$resolvedProjectName = if ([string]::IsNullOrWhiteSpace($ProjectName)) {
    if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { 'mcp-open-discovery-3' }
}
else {
    $ProjectName
}
$resolvedProjectName = ($resolvedProjectName.ToLowerInvariant() -replace '[^a-z0-9_-]', '-')

if ($Help) {
    Write-Host 'MCP Open Discovery 3 Typed Docker Deploy' -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'Usage:' -ForegroundColor Yellow
    Write-Host '  .\scripts\rebuild_deploy.ps1                     # MCP server only'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -Targeted           # Rebuild/restart only mcp-server, keep lab services running'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -Targeted -Services mcp-server,zabbix-web'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -WithAmqp           # Add RabbitMQ profile and enable http,amqp transport'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -WithOAuth          # Add Keycloak profile on host port 8081'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -BuildAll           # Full lab stack'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -Targeted -NoCache  # Force no-cache rebuild for selected services only'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -TransportMode stdio,http'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -SkipTypecheck'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -Ssh user@host'
    Write-Host '  .\scripts\rebuild_deploy.ps1 -NoLogs'
    exit 0
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

$allProfiles = @('amqp', 'oauth', 'snmp', 'zabbix')
$composeArgs = Get-ComposeArgs -ComposeFile $composeFile -ResolvedProjectName $resolvedProjectName -Profiles $profiles
$composeArgsDown = Get-ComposeArgs -ComposeFile $composeFile -ResolvedProjectName $resolvedProjectName -Profiles $allProfiles
$resolvedServices = if ($Services -and $Services.Count -gt 0) {
    $Services.ForEach({ $_.Split(',') }).ForEach({ $_.Trim() }).Where({ -not [string]::IsNullOrWhiteSpace($_) })
}
else {
    @('mcp-server')
}

if (-not $SkipTypecheck) {
    Write-Host 'Running TypeScript typecheck...' -ForegroundColor Yellow
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) {
        throw 'TypeScript typecheck failed. Aborting deploy.'
    }
}
else {
    Write-Host 'Skipping TypeScript typecheck by request.' -ForegroundColor DarkYellow
}

try {
    if ($Targeted) {
        Write-Host ("Running targeted rebuild for services: {0}" -f ($resolvedServices -join ', ')) -ForegroundColor Cyan
    }
    else {
        Write-Host 'Stopping existing containers for this compose project...' -ForegroundColor Yellow
        try {
            Invoke-Compose -ComposeArgs ($composeArgsDown + @('down', '--remove-orphans'))
        }
        catch {
            Write-Host 'Compose down failed or no containers were running, continuing...' -ForegroundColor DarkGray
        }
    }

    Write-Host 'Building typed MCP server image...' -ForegroundColor Yellow
    $buildArgs = $composeArgs + @('build')
    if ($NoCache) {
        $buildArgs += '--no-cache'
    }
    $buildArgs += $resolvedServices
    Invoke-Compose -ComposeArgs $buildArgs

    if ($Targeted) {
        Write-Host 'Restarting selected services without recreating dependencies...' -ForegroundColor Yellow
        Invoke-Compose -ComposeArgs ($composeArgs + @('up', '-d', '--no-deps') + $resolvedServices)
    }
    else {
        Write-Host 'Starting containers...' -ForegroundColor Yellow
        Invoke-Compose -ComposeArgs ($composeArgs + @('up', '-d', '--remove-orphans'))
    }

    Write-Host 'Waiting for services to settle...' -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    Write-Host 'Running containers:' -ForegroundColor Green
    Invoke-Compose -ComposeArgs ($composeArgs + @('ps'))

    if ($WithZabbix) {
        Invoke-ZabbixBootstrap -ComposeArgs $composeArgs
    }
}
catch {
    Write-Error $_
    exit 1
}

if (-not $NoLogs) {
    Invoke-Compose -ComposeArgs ($composeArgs + @('logs', '-f'))
}