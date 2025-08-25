# MCP Open Discovery Server v2.0 - AMQP Deployment Script
# 
# This script deploys your enhanced 61-tool discovery platform with AMQP transport
# 
# Usage: ./deploy-amqp-enhanced-discovery.ps1

param(
    [string]$Mode = "hybrid",  # stdio, http, amqp, hybrid, all
    [string]$Environment = "development",  # development, staging, production
    [switch]$SkipRabbitMQ,
    [switch]$SkipValidation
)

Write-Host "🚀 MCP Open Discovery Server v2.0 - AMQP Enhanced Deployment" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# Configuration based on environment
$config = @{
    development = @{
        AMQP_URL            = "amqp://mcp:discovery@localhost:5672"
        AMQP_PREFETCH_COUNT = "1"
        LOG_LEVEL           = "debug"
    }
    staging     = @{
        AMQP_URL            = "amqp://mcp:discovery@staging-rabbitmq:5672"
        AMQP_PREFETCH_COUNT = "3"
        LOG_LEVEL           = "info"
    }
    production  = @{
        AMQP_URL            = "amqp://mcp:discovery@prod-rabbitmq:5672"
        AMQP_PREFETCH_COUNT = "5"
        LOG_LEVEL           = "warn"
        AMQP_MESSAGE_TTL    = "7200000"
        AMQP_QUEUE_TTL      = "14400000"
    }
}

# Transport mode configuration
$transportModes = @{
    stdio  = "stdio"
    http   = "http" 
    amqp   = "amqp"
    hybrid = "http,amqp"
    all    = "all"
}

Write-Host "📋 Deployment Configuration:" -ForegroundColor Yellow
Write-Host "   Environment: $Environment" -ForegroundColor White
Write-Host "   Transport Mode: $($transportModes[$Mode])" -ForegroundColor White
Write-Host "   Skip RabbitMQ: $SkipRabbitMQ" -ForegroundColor White
Write-Host "   Skip Validation: $SkipValidation" -ForegroundColor White

# Step 1: Validate prerequisites
Write-Host "`n🔍 Step 1: Validating Prerequisites..." -ForegroundColor Green

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Please install Node.js 16+."
    exit 1
}

if (-not (Get-Command "docker" -ErrorAction SilentlyContinue) -and -not $SkipRabbitMQ) {
    Write-Warning "Docker not found. Will skip RabbitMQ setup."
    $SkipRabbitMQ = $true
}

# Step 2: Set up RabbitMQ
if (-not $SkipRabbitMQ) {
    Write-Host "`n🐰 Step 2: Setting up RabbitMQ..." -ForegroundColor Green
    
    # Check if RabbitMQ is already running
    $rabbitMQRunning = docker ps --format "table {{.Names}}" | Select-String "rabbitmq"
    
    if ($rabbitMQRunning) {
        Write-Host "   ✅ RabbitMQ already running" -ForegroundColor Green
    }
    else {
        Write-Host "   🚀 Starting RabbitMQ..." -ForegroundColor Yellow
        
        docker run -d `
            --name rabbitmq-mcp-discovery `
            -p 5672:5672 `
            -p 15672:15672 `
            -e RABBITMQ_DEFAULT_USER=mcp `
            -e RABBITMQ_DEFAULT_PASS=discovery `
            rabbitmq:3.12-management
        
        # Wait for RabbitMQ to be ready
        Write-Host "   ⏳ Waiting for RabbitMQ to be ready..." -ForegroundColor Yellow
        $timeout = 30
        $elapsed = 0
        
        do {
            Start-Sleep 2
            $elapsed += 2
            $ready = docker logs rabbitmq-mcp-discovery 2>&1 | Select-String "started TCP listener"
        } while (-not $ready -and $elapsed -lt $timeout)
        
        if ($ready) {
            Write-Host "   ✅ RabbitMQ ready!" -ForegroundColor Green
            Write-Host "   🌐 Management UI: http://localhost:15672 (mcp/discovery)" -ForegroundColor Cyan
        }
        else {
            Write-Warning "RabbitMQ might not be fully ready. Check docker logs rabbitmq-mcp-discovery"
        }
    }
}
else {
    Write-Host "`n⏭️  Step 2: Skipping RabbitMQ setup" -ForegroundColor Yellow
}

# Step 3: Set environment variables
Write-Host "`n🔧 Step 3: Configuring Environment..." -ForegroundColor Green

$envConfig = $config[$Environment]
$env:TRANSPORT_MODE = $transportModes[$Mode]

foreach ($key in $envConfig.Keys) {
    $value = $envConfig[$key]
    Set-Item -Path "env:$key" -Value $value
    Write-Host "   $key = $value" -ForegroundColor White
}

# Enterprise-specific settings
if ($Environment -eq "production") {
    $env:REGISTRY_BROADCAST_ENABLED = "true"
    $env:TOOL_CATEGORY_ROUTING = "true" 
    $env:HOT_RELOAD_AMQP_SYNC = "true"
    Write-Host "   🏢 Enterprise features enabled" -ForegroundColor Cyan
}

# Step 4: Validate integration
if (-not $SkipValidation) {
    Write-Host "`n✅ Step 4: Validating AMQP Integration..." -ForegroundColor Green
    
    if (Test-Path "testing/validate-amqp-integration.js") {
        node "testing/validate-amqp-integration.js"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "AMQP integration validation failed. Please check the errors above."
            exit 1
        }
    }
    else {
        Write-Warning "Validation script not found. Skipping validation."
    }
}
else {
    Write-Host "`n⏭️  Step 4: Skipping validation" -ForegroundColor Yellow
}

# Step 5: Start the enhanced discovery server
Write-Host "`n🚀 Step 5: Starting MCP Open Discovery Server v2.0..." -ForegroundColor Green

Write-Host "   📊 Expected capabilities:" -ForegroundColor Cyan
Write-Host "      • 61 enterprise discovery tools" -ForegroundColor White
Write-Host "      • Multi-transport support: $($transportModes[$Mode])" -ForegroundColor White
Write-Host "      • Registry hot-reload over AMQP" -ForegroundColor White
Write-Host "      • Tool category routing" -ForegroundColor White
Write-Host "      • Real-time discovery notifications" -ForegroundColor White

Write-Host "`n🔥 Ready to start server with command:" -ForegroundColor Yellow
Write-Host "   TRANSPORT_MODE=$($transportModes[$Mode]) node mcp_open_discovery_server.js" -ForegroundColor White

Write-Host "`n📋 Testing Commands:" -ForegroundColor Cyan
Write-Host "   • Test AMQP transport: node testing/test-amqp-transport.js" -ForegroundColor White
Write-Host "   • Run example client: node examples/amqp-discovery-client.js" -ForegroundColor White
Write-Host "   • Monitor discoveries: node examples/amqp-discovery-client.js monitor" -ForegroundColor White

Write-Host "`n🎯 Management URLs:" -ForegroundColor Cyan
if (-not $SkipRabbitMQ) {
    Write-Host "   • RabbitMQ Management: http://localhost:15672" -ForegroundColor White
}
if ($transportModes[$Mode] -match "http") {
    Write-Host "   • Server Health: http://localhost:3000/health" -ForegroundColor White
}

Write-Host "`n🎉 MCP Open Discovery Server v2.0 with AMQP is ready!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan

# Offer to start the server
$startServer = Read-Host "`nStart the server now? (y/N)"
if ($startServer -eq "y" -or $startServer -eq "Y") {
    Write-Host "`n🚀 Starting server..." -ForegroundColor Green
    
    # Check if server file exists
    if (Test-Path "mcp_open_discovery_server.js") {
        node mcp_open_discovery_server.js
    }
    elseif (Test-Path "../mcp_open_discovery_server.js") {
        Set-Location ..
        node mcp_open_discovery_server.js
    }
    else {
        Write-Warning "Server file not found. Please navigate to your MCP Open Discovery project directory and run:"
        Write-Host "TRANSPORT_MODE=$($transportModes[$Mode]) node mcp_open_discovery_server.js" -ForegroundColor Yellow
    }
}
else {
    Write-Host "`n👋 Server ready to start when you are!" -ForegroundColor Green
}

Write-Host "`n📖 For more information, see docs/amqp-integration/ directory" -ForegroundColor Cyan
