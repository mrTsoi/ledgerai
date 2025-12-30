Param(
  [int]$NextPort = 3001
)

# Simple orchestration for local e2e with stripe-mock and a Supabase-mock
# Starts stripe-mock (Docker), starts tests/e2e/supabase-mock.js, starts Next dev,
# runs the Playwright test, then tears down everything.

$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path

$stripePort = 12111
$supabasePort = 54321

function Get-FreePort() {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
  $listener.Start()
  $port = ($listener.LocalEndpoint).Port
  $listener.Stop()
  return $port
}

# Choose free ephemeral host ports for services to avoid conflicts
$stripePort = Get-FreePort
$supabasePort = Get-FreePort

function Wait-ForPort($hostname, $port, $timeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $c = Test-NetConnection -ComputerName $hostname -Port $port -WarningAction SilentlyContinue
      if ($c.TcpTestSucceeded) { return $true }
    } catch { }
    Start-Sleep -Seconds 1
  }
  return $false
}

Write-Host "[orchestrator] Starting stripe-mock + supabase-mock via docker-compose..."

# Ensure docker available
try { Get-Command docker -ErrorAction Stop } catch { Write-Error "docker not found in PATH. Install Docker Desktop."; exit 1 }

$composeFile = "$root\docker-compose.e2e.yml"
if (-not (Test-Path $composeFile)) { Write-Error "Missing $composeFile"; exit 1 }

# Detect compose command
$useDockerCompose = $false
if (Get-Command docker-compose -ErrorAction SilentlyContinue) { $composeCmd = "docker-compose" } else { $composeCmd = "docker compose" }

Write-Host "[orchestrator] Bringing up docker-compose from $composeFile..."

# Export chosen ports so docker-compose picks them up in variable substitution
$env:STRIPE_PORT = [string]$stripePort
$env:SUPABASE_PORT = [string]$supabasePort

$composeStarted = $false
try {
  & $composeCmd -f $composeFile up -d
  $composeStarted = $true
} catch {
  Write-Warning "docker-compose up failed: $_"
}

if (-not (Wait-ForPort 'localhost' $stripePort 30)) {
  Write-Error "stripe-mock did not become available on port $stripePort"
  if ($composeStarted) { & $composeCmd -f $composeFile down }
  exit 1
}
$localSupabaseProc = $null
if (-not (Wait-ForPort 'localhost' $supabasePort 30)) {
  Write-Warning "Supabase-mock did not become available on port $supabasePort (container may have failed to bind). Falling back to local node process."
  # Try starting the supabase-mock locally as a fallback
  try {
    $env:PORT = [string]$supabasePort
    $localSupabaseProc = Start-Process -FilePath "node" -ArgumentList "`"$root\tests\e2e\supabase-mock.js`"" -WorkingDirectory $root -NoNewWindow -PassThru
    if (-not (Wait-ForPort 'localhost' $supabasePort 30)) {
      throw "Local supabase-mock failed to bind to port $supabasePort"
    }
    Write-Host "[orchestrator] Supabase-mock fallback running locally (pid $($localSupabaseProc.Id)) on port $supabasePort"
  } catch {
    Write-Error "Supabase-mock unavailable and fallback failed: $_"
    if ($composeStarted) { & $composeCmd -f $composeFile down }
    exit 1
  }
}
Write-Host "[orchestrator] stripe-mock listening on http://localhost:$stripePort and supabase-mock on http://localhost:$supabasePort"
Write-Host "[orchestrator] stripe-mock listening on http://localhost:$stripePort and supabase-mock on http://localhost:$supabasePort"

# Start Next dev in a separate process; set required env vars in this PowerShell session
Write-Host "[orchestrator] Starting Next dev on port $NextPort..."
$env:STRIPE_USE_MOCK = 'true'
$env:STRIPE_API_BASE_URL = "http://localhost:$stripePort"
$env:STRIPE_SECRET_KEY = 'sk_test_123'
$env:STRIPE_WEBHOOK_SECRET = 'whsec_test'
$env:SUPABASE_URL = "http://localhost:$supabasePort"
$env:SUPABASE_SERVICE_ROLE_KEY = 'service_role_test'
$env:PORT = "$NextPort"

try {
  $nextProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -WorkingDirectory $root -NoNewWindow -PassThru
} catch {
  Write-Error "Failed to start Next dev: $_"
  if ($composeStarted) { & $composeCmd -f $composeFile down }
  exit 1
}

# Wait for Next to bind the port
if (-not (Wait-ForPort 'localhost' $NextPort 60)) {
  Write-Error "Next dev did not become available on port $NextPort"
  # cleanup
  & $composeCmd -f $composeFile down
  try { Stop-Process -Id $nextProc.Id -ErrorAction SilentlyContinue } catch {}
  exit 1
}
Write-Host "[orchestrator] Next dev listening on http://localhost:$NextPort (pid $($nextProc.Id))"

# Run Playwright test in this PowerShell session so we can capture the exit code
Write-Host "[orchestrator] Running Playwright test against stripe-mock and supabase-mock..."
$env:STRIPE_USE_MOCK = 'true'
$env:STRIPE_API_BASE_URL = "http://localhost:$stripePort"
$env:STRIPE_SECRET_KEY = 'sk_test_123'
$env:STRIPE_WEBHOOK_SECRET = 'whsec_test'
$env:SUPABASE_URL = "http://localhost:$supabasePort"
$env:SUPABASE_SERVICE_ROLE_KEY = 'service_role_test'
$env:BASE_URL = "http://localhost:$NextPort"

$npx = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npx) { Write-Error "npx not found in PATH"; exit 1 }

# Run only the integration test file to keep run short
& npx playwright test tests/e2e/subscription-db-integration.spec.ts --project=chromium --reporter=list
$exitCode = $LASTEXITCODE

Write-Host "[orchestrator] Playwright finished with exit code $exitCode"

Write-Host "[orchestrator] Tearing down services..."
  try { Stop-Process -Id $nextProc.Id -Force -ErrorAction SilentlyContinue } catch {}
  try { & $composeCmd -f $composeFile down } catch { Write-Warning "Failed to bring down compose: $_" }

Write-Host "[orchestrator] Done. Exiting with code $exitCode"
exit $exitCode
