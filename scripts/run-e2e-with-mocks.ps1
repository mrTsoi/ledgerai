#!/usr/bin/env pwsh
#
# run-e2e-with-mocks.ps1
# Orchestrates E2E tests by:
# 1. Starting mock services (stripe-mock) via docker-compose
# 2. Waiting for services to become available
# 3. Running Next.js on specified port
# 4. Cleaning up mock services on exit
#
# Supports both docker compose v2 (docker compose) and v1 (docker-compose)

param(
    [Parameter(Mandatory=$false)]
    [int]$NextPort = 3000,
    
    [Parameter(Mandatory=$false)]
    [int]$StripeMockPort = 12111,
    
    [Parameter(Mandatory=$false)]
    [int]$MaxWaitSeconds = 60,
    
    [Parameter(Mandatory=$false)]
    [switch]$KeepAlive = $false
)

$ErrorActionPreference = 'Stop'

# Color output functions
function Write-Info($msg) { Write-Host "INFO  - $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "OK    - $msg" -ForegroundColor Green }
function Write-Warning($msg) { Write-Host "WARN  - $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host "ERROR - $msg" -ForegroundColor Red }

# Determine the repository root (script is in scripts/ subdirectory)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$ComposeFile = Join-Path $RepoRoot "docker-compose.e2e.yml"

Write-Info "Repository root: $RepoRoot"
Write-Info "Compose file: $ComposeFile"

# Verify compose file exists
if (-not (Test-Path $ComposeFile)) {
    Write-Error "docker-compose.e2e.yml not found at $ComposeFile"
    exit 1
}

# Detect which docker compose command is available
$DockerComposeCmd = $null
$DockerComposeCmdType = $null

Write-Info "Detecting Docker Compose installation..."

# Test for docker compose (v2 - plugin style)
try {
    $output = docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $DockerComposeCmd = "docker", "compose"
        $DockerComposeCmdType = "docker compose (v2)"
        Write-Success "Found Docker Compose v2 (docker compose)"
    }
} catch {
    # docker compose not available, will try v1
    Write-Info "Docker Compose v2 not detected, trying v1..."
}

# If v2 not found, try docker-compose (v1 - standalone)
if ($null -eq $DockerComposeCmd) {
    try {
        $dockerComposeExe = Get-Command docker-compose -ErrorAction Stop
        $output = docker-compose version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $DockerComposeCmd = "docker-compose"
            $DockerComposeCmdType = "docker-compose (v1)"
            Write-Success "Found Docker Compose v1 (docker-compose)"
        }
    } catch {
        # docker-compose also not available
        Write-Info "Docker Compose v1 not detected"
    }
}

# If neither is available, fail with helpful message
if ($null -eq $DockerComposeCmd) {
    Write-Error "Neither 'docker compose' (v2) nor 'docker-compose' (v1) is available."
    Write-Error "Please install Docker Compose:"
    Write-Error "  - Docker Compose v2: https://docs.docker.com/compose/install/"
    Write-Error "  - Docker Compose v1: https://docs.docker.com/compose/install/other/"
    exit 1
}

Write-Info "Using: $DockerComposeCmdType"

# Format the docker compose command for display
if ($DockerComposeCmd -is [array]) {
    $DockerComposeCmdDisplay = $DockerComposeCmd -join ' '
} else {
    $DockerComposeCmdDisplay = $DockerComposeCmd
}

# Normalize path separators for cross-platform compatibility
# Docker Compose on Linux expects forward slashes
$ComposeFilePath = $ComposeFile -replace '\\', '/'

# Function to wait for a port to become available
function Wait-ForPort {
    param(
        [int]$Port,
        [string]$ServiceName,
        [int]$TimeoutSeconds
    )
    
    Write-Info "Waiting for $ServiceName on port $Port (timeout: ${TimeoutSeconds}s)..."
    $elapsed = 0
    $interval = 2
    
    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $connection = New-Object System.Net.Sockets.TcpClient
            $connection.Connect("localhost", $Port)
            $connection.Close()
            Write-Success "$ServiceName is available on port $Port"
            return $true
        } catch {
            Start-Sleep -Seconds $interval
            $elapsed += $interval
            Write-Host "." -NoNewline
        }
    }
    
    Write-Host ""
    Write-Error "$ServiceName did not become available on port $Port within ${TimeoutSeconds}s"
    return $false
}

# Function to run docker compose commands
function Invoke-DockerCompose {
    param(
        [string[]]$Arguments
    )
    
    $allArgs = @()
    
    if ($DockerComposeCmd -is [array]) {
        # docker compose (v2) - array format
        $allArgs += $DockerComposeCmd
    } else {
        # docker-compose (v1) - string format
        $allArgs += $DockerComposeCmd
    }
    
    $allArgs += "-f", $ComposeFilePath
    $allArgs += $Arguments
    
    Write-Info "Running: $($allArgs -join ' ')"
    
    # Use & to invoke with array of arguments
    if ($DockerComposeCmd -is [array]) {
        & $DockerComposeCmd[0] $DockerComposeCmd[1] -f $ComposeFilePath @Arguments
    } else {
        & $DockerComposeCmd -f $ComposeFilePath @Arguments
    }
    
    return $LASTEXITCODE
}

# Cleanup function to tear down services
function Stop-MockServices {
    Write-Info "Stopping mock services..."
    try {
        $exitCode = Invoke-DockerCompose -Arguments @("down", "-v")
        if ($exitCode -eq 0) {
            Write-Success "Mock services stopped successfully"
        } else {
            Write-Warning "Mock services may not have stopped cleanly (exit code: $exitCode)"
        }
    } catch {
        Write-Warning "Error stopping mock services: $_"
    }
}

# Register cleanup to run on script exit
try {
    # Set environment variables for docker-compose
    $env:STRIPE_MOCK_PORT = $StripeMockPort
    
    Write-Info "Starting mock services..."
    Write-Info "Environment: STRIPE_MOCK_PORT=$StripeMockPort"
    
    # Start services in detached mode
    $exitCode = Invoke-DockerCompose -Arguments @("up", "-d")
    
    if ($exitCode -ne 0) {
        Write-Error "Failed to start mock services (exit code: $exitCode)"
        exit 1
    }
    
    Write-Success "Mock services started"
    
    # Wait for stripe-mock to become available
    if (-not (Wait-ForPort -Port $StripeMockPort -ServiceName "stripe-mock" -TimeoutSeconds $MaxWaitSeconds)) {
        Write-Error "stripe-mock failed to start. Checking logs..."
        Invoke-DockerCompose -Arguments @("logs", "stripe-mock")
        exit 1
    }
    
    # Services are ready - in a full implementation, we would now start Next.js and run tests
    Write-Success "All mock services are ready!"
    Write-Info "Next.js would run on port $NextPort (not implemented in this version)"
    Write-Info ""
    
    if ($KeepAlive) {
        # Keep services running for interactive use
        Write-Info "Mock services are running. Press Ctrl+C to stop them."
        Write-Info "Or run the following to stop manually:"
        Write-Info "  $DockerComposeCmdDisplay -f $ComposeFilePath down -v"
        Write-Info ""
        
        try {
            Write-Host "Press Ctrl+C to stop..." -ForegroundColor Yellow
            while ($true) {
                Start-Sleep -Seconds 1
            }
        } catch {
            Write-Info "Interrupted by user"
        }
    } else {
        # CI/CD mode - exit successfully after starting services
        Write-Info "Services started successfully (CI mode - exiting now)"
        Write-Info "To stop services, run:"
        Write-Info "  $DockerComposeCmdDisplay -f $ComposeFilePath down -v"
        exit 0
    }
    
} catch {
    Write-Error "Unexpected error: $_"
    exit 1
} finally {
    # Always cleanup on exit
    Stop-MockServices
}
