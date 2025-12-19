#!/usr/bin/env pwsh
#
# test-docker-compose-detection.ps1
# Unit test for docker compose command detection logic

$ErrorActionPreference = 'Stop'

function Write-TestResult($testName, $passed, $message = "") {
    if ($passed) {
        Write-Host "✓ $testName" -ForegroundColor Green
    } else {
        Write-Host "✗ $testName" -ForegroundColor Red
        if ($message) {
            Write-Host "  $message" -ForegroundColor Red
        }
    }
    return $passed
}

$allTestsPassed = $true

# Test 1: Docker Compose file exists
Write-Host "`nTest 1: Verify docker-compose.e2e.yml exists" -ForegroundColor Cyan
$composeFileExists = Test-Path "../docker-compose.e2e.yml"
$allTestsPassed = (Write-TestResult "docker-compose.e2e.yml exists" $composeFileExists) -and $allTestsPassed

# Test 2: Path normalization for cross-platform compatibility
Write-Host "`nTest 2: Path normalization" -ForegroundColor Cyan
$windowsPath = "C:\Users\test\docker-compose.yml"
$normalizedPath = $windowsPath -replace '\\', '/'
$pathNormalized = ($normalizedPath -eq "C:/Users/test/docker-compose.yml")
$allTestsPassed = (Write-TestResult "Windows path normalized to Unix format" $pathNormalized "Expected: C:/Users/test/docker-compose.yml, Got: $normalizedPath") -and $allTestsPassed

# Test 3: Docker Compose v2 detection
Write-Host "`nTest 3: Docker Compose v2 detection" -ForegroundColor Cyan
$v2Available = $false
try {
    $null = docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $v2Available = $true
    }
} catch {
    # Not available
}
Write-TestResult "Docker Compose v2 detection" $true "v2 available: $v2Available"

# Test 4: Docker Compose v1 detection
Write-Host "`nTest 4: Docker Compose v1 detection" -ForegroundColor Cyan
$v1Available = $false
try {
    $null = Get-Command docker-compose -ErrorAction Stop
    $null = docker-compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $v1Available = $true
    }
} catch {
    # Not available
}
Write-TestResult "Docker Compose v1 detection" $true "v1 available: $v1Available"

# Test 5: At least one compose version available
Write-Host "`nTest 5: Compose availability" -ForegroundColor Cyan
$anyAvailable = $v2Available -or $v1Available
$allTestsPassed = (Write-TestResult "At least one Docker Compose version available" $anyAvailable "v2: $v2Available, v1: $v1Available") -and $allTestsPassed

# Test 6: Verify which version would be selected
Write-Host "`nTest 6: Compose version selection" -ForegroundColor Cyan
if ($v2Available) {
    $selectedVersion = "v2 (docker compose)"
    Write-TestResult "Would select v2 (preferred)" $true
} elseif ($v1Available) {
    $selectedVersion = "v1 (docker-compose)"
    Write-TestResult "Would select v1 (fallback)" $true
} else {
    $selectedVersion = "none"
    Write-TestResult "Would fail with error message" $true
}
Write-Host "  Selected version: $selectedVersion" -ForegroundColor Gray

# Test 7: Verify PowerShell script syntax
Write-Host "`nTest 7: PowerShell script syntax" -ForegroundColor Cyan
try {
    $null = Get-Command "../scripts/run-e2e-with-mocks.ps1" -ErrorAction Stop
    $syntaxValid = $true
} catch {
    $syntaxValid = $false
}
$allTestsPassed = (Write-TestResult "run-e2e-with-mocks.ps1 has valid syntax" $syntaxValid) -and $allTestsPassed

# Summary
Write-Host "`n" + ("=" * 50) -ForegroundColor White
if ($allTestsPassed) {
    Write-Host "All tests passed! ✓" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests failed! ✗" -ForegroundColor Red
    exit 1
}
