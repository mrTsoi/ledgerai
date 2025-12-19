# E2E Testing Setup

## Overview

This repository includes an E2E testing infrastructure that uses Docker Compose to orchestrate mock services. The setup is designed to work reliably across different environments, including GitHub Actions runners.

## Components

### 1. Docker Compose File (`docker-compose.e2e.yml`)

Defines the mock services required for E2E testing:
- **stripe-mock**: Mock Stripe API server for testing payment integrations

The compose file uses environment variables for port configuration:
- `STRIPE_MOCK_PORT`: Port for stripe-mock (default: 12111)

### 2. PowerShell Orchestration Script (`scripts/run-e2e-with-mocks.ps1`)

Orchestrates the E2E testing workflow:
1. Detects available Docker Compose command (v2 or v1)
2. Starts mock services via Docker Compose
3. Waits for services to become available
4. Keeps services running for test execution
5. Cleans up services on exit

#### Parameters

- `-NextPort <int>`: Port for Next.js application (default: 3000)
- `-StripeMockPort <int>`: Port for stripe-mock (default: 12111)
- `-MaxWaitSeconds <int>`: Maximum time to wait for services (default: 60)
- `-KeepAlive`: Switch to keep services running interactively (default: false)

#### Usage

```powershell
# CI/CD mode (default) - starts services and exits
pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./scripts/run-e2e-with-mocks.ps1

# Interactive mode - keeps services running
pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./scripts/run-e2e-with-mocks.ps1 -KeepAlive

# Custom ports
pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./scripts/run-e2e-with-mocks.ps1 -NextPort 3001 -StripeMockPort 12112

# Custom timeout
pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./scripts/run-e2e-with-mocks.ps1 -MaxWaitSeconds 120
```

### 3. GitHub Actions Workflow (`.github/workflows/e2e.yml`)

Automates E2E testing on GitHub Actions:
- Runs on push to main/develop branches
- Runs on pull requests
- Can be triggered manually via workflow_dispatch
- Includes failure diagnostics (docker logs, container status)

## Docker Compose Compatibility

The orchestration script supports both Docker Compose versions:

### Docker Compose v2 (Preferred)
```bash
docker compose version
# Docker Compose version v2.x.x
```

### Docker Compose v1 (Legacy)
```bash
docker-compose --version
# docker-compose version 1.x.x
```

### Detection Logic

1. First, the script tries to detect `docker compose` (v2 plugin)
2. If v2 is not available, it falls back to `docker-compose` (v1 standalone)
3. If neither is available, the script fails with a clear error message

This ensures the E2E tests work on:
- GitHub Actions runners (which have Docker Compose v2)
- Local development environments (which may have either version)
- CI/CD pipelines with legacy Docker Compose v1

## Cross-Platform Path Handling

The script normalizes file paths to handle different operating systems:
- Windows paths (`C:\path\to\file`) are converted to Unix format (`C:/path/to/file`)
- This ensures Docker Compose can read the compose file on both Windows and Linux

## Testing

Run the test suite to verify the setup:

```powershell
cd scripts
pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./test-docker-compose-detection.ps1
```

The test suite validates:
- Docker Compose file exists
- Path normalization works correctly
- Docker Compose detection logic
- Script syntax validity

## Troubleshooting

### Error: "Neither 'docker compose' (v2) nor 'docker-compose' (v1) is available"

**Solution**: Install Docker Compose:
- Docker Compose v2: https://docs.docker.com/compose/install/
- Docker Compose v1: https://docs.docker.com/compose/install/other/

### Error: "stripe-mock did not become available on port X"

**Possible causes**:
1. Port is already in use
2. Docker daemon is not running
3. Network connectivity issues

**Diagnostics**:
```bash
# Check if port is in use
netstat -an | grep <port>

# Check Docker daemon
docker version

# View container logs
docker compose -f docker-compose.e2e.yml logs stripe-mock

# Check container status
docker ps -a
```

### Warning: "the attribute `version` is obsolete"

This is a harmless warning from Docker Compose v2. The `version` field has been removed from the compose file to avoid this warning.

## Manual Service Management

Start services manually:
```bash
docker compose -f docker-compose.e2e.yml up -d
```

Stop services manually:
```bash
docker compose -f docker-compose.e2e.yml down -v
```

View logs:
```bash
docker compose -f docker-compose.e2e.yml logs -f stripe-mock
```

## Environment Variables

The following environment variables can be set:

- `STRIPE_MOCK_PORT`: Port for stripe-mock service (default: 12111)

Example:
```bash
export STRIPE_MOCK_PORT=12112
pwsh -File ./scripts/run-e2e-with-mocks.ps1
```

## Future Enhancements

The current implementation provides the foundation for E2E testing. Future enhancements may include:

1. Integration with actual E2E test frameworks (Playwright, Cypress, etc.)
2. Additional mock services (payment processors, external APIs)
3. Parallel test execution support
4. Test result reporting and artifacts
5. Database seeding for test scenarios
