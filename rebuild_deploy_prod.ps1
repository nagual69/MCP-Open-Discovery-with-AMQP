#!/usr/bin/env pwsh
# SPDX-License-Identifier: MPL-2.0
# Compatibility wrapper for the unified typed-runtime deploy script.

param(
    [switch]$Stdio,
    [switch]$Http,
    [switch]$Amqp,
    [switch]$WithRabbitMq,
    [switch]$WithOAuth,
    [switch]$WithAmqp,
    [string]$ProjectName,
    [string]$Ssh,
    [switch]$NoLogs,
    [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

$forward = @()

if ($Help) {
    $forward += '-Help'
}
if ($NoLogs) {
    $forward += '-NoLogs'
}
if (-not [string]::IsNullOrWhiteSpace($ProjectName)) {
    $forward += @('-ProjectName', $ProjectName)
}
if (-not [string]::IsNullOrWhiteSpace($Ssh)) {
    $forward += @('-Ssh', $Ssh)
}

$selectedTransports = @()
if ($Stdio) { $selectedTransports += 'stdio' }
if ($Http) { $selectedTransports += 'http' }
if ($Amqp) { $selectedTransports += 'amqp' }
if ($selectedTransports.Count -gt 0) {
    $forward += @('-TransportMode', ($selectedTransports -join ','))
}

if ($WithRabbitMq -or $WithAmqp) {
    $forward += '-WithAmqp'
}
if ($WithOAuth) {
    $forward += '-WithOAuth'
}

& (Join-Path $PSScriptRoot 'rebuild_deploy.ps1') @forward
