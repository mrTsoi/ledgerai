# Checks whether Docker Desktop is installed and the daemon is reachable.
# Intended for Windows devs running Supabase CLI (which shells out to docker images).

$ErrorActionPreference = 'Stop'

function Write-Ok($msg) { Write-Host "OK  - $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "WARN- $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "FAIL- $msg" -ForegroundColor Red }

try {
  $docker = Get-Command docker -ErrorAction Stop
  Write-Ok "docker found: $($docker.Source)"
} catch {
  Write-Fail "docker is not installed or not on PATH. Install Docker Desktop for Windows." 
  exit 1
}

try {
  $ver = docker version --format '{{.Server.Version}}' 2>$null
  if (-not $ver) { throw "No server version" }
  Write-Ok "Docker daemon reachable (server version: $ver)"
} catch {
  Write-Fail "Docker daemon not reachable. Start Docker Desktop and retry. If you see pipe/permission errors, try running VS Code as Administrator once." 
  exit 1
}

try {
  $wsl = Get-Command wsl.exe -ErrorAction Stop
  $distros = & wsl.exe -l -v 2>$null
  if ($distros) {
    Write-Ok "WSL is available."
    if ($distros -match '\s2\s*$') {
      Write-Ok "At least one WSL distro is version 2."
    } else {
      Write-Warn "No WSL2 distro detected via 'wsl -l -v'. Docker Desktop may still work, but WSL2 is recommended."
    }
  }
} catch {
  Write-Warn "WSL not detected. Docker Desktop can still work, but WSL2 is recommended on Windows."
}

Write-Ok "Docker looks ready for Supabase CLI operations that require pulling images (e.g., 'supabase db dump')."
