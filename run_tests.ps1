# Run Tests PowerShell Script for MCP Open Discovery
# This script makes it easy to run tests against the MCP Open Discovery server

param (
    [string[]]$Groups = @(),
    [switch]$SkipErrors,
    [switch]$Debug,
    [string]$Include = "",
    [string]$Exclude = "",
    [string]$ServerUrl = "http://localhost:3000",
    [string]$ProxmoxServer = "",
    [string]$ProxmoxUser = "",
    [SecureString]$ProxmoxPassword,
    [string]$ProxmoxTokenName = "",
    [SecureString]$ProxmoxTokenValue,
    [string]$ProxmoxNode = "",
    [string]$ProxmoxVmid = "",
    [switch]$NoPrompt
)

# Display help if requested
if ($args -contains "--help" -or $args -contains "-h") {
    Write-Host "MCP Open Discovery Test Runner"
    Write-Host "==============================="
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\run_tests.ps1 [options] [group1 group2 ...]"
    Write-Host ""
    Write-Host "Options:"    Write-Host "  -SkipErrors             Continue testing even if some tests fail"
    Write-Host "  -Debug                  Show more detailed debug information"
    Write-Host "  -Include <tools>        Only test specific tools (comma-separated)"
    Write-Host "  -Exclude <tools>        Exclude specific tools from testing (comma-separated)"
    Write-Host "  -ServerUrl <url>        URL of the MCP server (default: http://localhost:3000)"
    Write-Host ""    Write-Host "Proxmox Testing Options:"
    Write-Host "  -ProxmoxServer <host>   Specify Proxmox server hostname"
    Write-Host "  -ProxmoxUser <user>     Specify Proxmox username"
    Write-Host "  -ProxmoxPassword <pass> Specify Proxmox password"
    Write-Host "  -ProxmoxTokenName <name> Specify Proxmox API token name (alternative to username/password)"
    Write-Host "  -ProxmoxTokenValue <val> Specify Proxmox API token value"
    Write-Host "  -ProxmoxNode <node>     Specify Proxmox node name (default: pve)"
    Write-Host "  -ProxmoxVmid <id>       Specify Proxmox VM ID for testing (default: 100)"
    Write-Host "  -NoPrompt               Do not prompt for credentials"
    Write-Host ""
    Write-Host "Groups:"
    Write-Host "  network                 Test network tools (ping, wget, etc.)"
    Write-Host "  nmap                    Test nmap scanning tools"
    Write-Host "  memory                  Test in-memory CMDB tools"
    Write-Host "  proxmox                 Test Proxmox API tools"
    Write-Host "  snmp                    Test SNMP tools"
    Write-Host ""    Write-Host "Examples:"
    Write-Host "  .\run_tests.ps1                      # Test all tools"
    Write-Host "  .\run_tests.ps1 network memory       # Test only network and memory tools"
    Write-Host "  .\run_tests.ps1 -SkipErrors          # Test all tools, continue on failures"
    Write-Host "  .\run_tests.ps1 -Exclude telnet,snmp_get  # Skip problematic tools"
    Write-Host ""
    Write-Host "Proxmox Testing Examples:"
    Write-Host "  .\run_tests.ps1 proxmox              # Test Proxmox with interactive prompts"
    Write-Host "  .\run_tests.ps1 proxmox -ProxmoxServer pve.example.com"
    Write-Host "  .\run_tests.ps1 proxmox -NoPrompt    # Use environment variables"
    exit 0
}

# Build the command line arguments
$arguments = @()

# Add groups
if ($Groups.Count -gt 0) {
    $arguments += $Groups
}

# Add options
if ($SkipErrors) {
    $arguments += "--skip-errors"
}

if ($Debug) {
    $arguments += "--debug"
}

if ($Include -ne "") {
    $arguments += "--include=$Include"
}

if ($Exclude -ne "") {
    $arguments += "--exclude=$Exclude"
}

# Add Proxmox options
if ($ProxmoxServer -ne "") {
    $arguments += "--proxmox-server=$ProxmoxServer"
    # Set environment variable too
    $env:PROXMOX_SERVER = $ProxmoxServer
}

if ($ProxmoxUser -ne "") {
    $arguments += "--proxmox-user=$ProxmoxUser"
    $env:PROXMOX_USER = $ProxmoxUser
}

if ($null -ne $ProxmoxPassword) {
    # Convert SecureString to plain text for command line
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ProxmoxPassword)
    $PlainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
    
    $arguments += "--proxmox-password=$PlainPassword"
    $env:PROXMOX_PASSWORD = $PlainPassword
}

if ($ProxmoxTokenName -ne "") {
    $arguments += "--proxmox-token-name=$ProxmoxTokenName"
    $env:PROXMOX_TOKEN_NAME = $ProxmoxTokenName
}

if ($null -ne $ProxmoxTokenValue) {
    # Convert SecureString to plain text for command line
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ProxmoxTokenValue)
    $PlainTokenValue = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
    
    $arguments += "--proxmox-token-value=$PlainTokenValue"
    $env:PROXMOX_TOKEN_VALUE = $PlainTokenValue
}

if ($ProxmoxNode -ne "") {
    $arguments += "--proxmox-node=$ProxmoxNode"
    $env:PROXMOX_NODE = $ProxmoxNode
}

if ($ProxmoxVmid -ne "") {
    $arguments += "--proxmox-vmid=$ProxmoxVmid"
    $env:PROXMOX_VMID = $ProxmoxVmid
}

if ($NoPrompt) {
    $arguments += "--no-prompt"
}

# Set environment variable for server URL
$env:MCP_SERVER_URL = $ServerUrl

# Build the command string
$commandArgs = $arguments -join " "
$command = "node test_comprehensive.js $commandArgs"

# Display the command
Write-Host "Running: $command"
Write-Host "Server URL: $ServerUrl"
Write-Host ""

# Run the command
Invoke-Expression $command
