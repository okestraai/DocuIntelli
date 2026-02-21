# DocuIntelli Service Setup Script
# Run this script as Administrator in PowerShell
# Usage: Right-click PowerShell > Run as Administrator > cd to project > .\scripts\setup-services.ps1
#
# Both services use NSSM with batch wrappers to handle spaces in file paths.
# Services: DocuIntelliAPI (Express on port 5000), DocuIntelliTunnel (Cloudflare tunnel)

$ErrorActionPreference = "Stop"

# Log all output to file
$LogFile = "C:\Users\Okestra AI Labs\DocuIntelli\logs\setup-output.log"
$LogDir2 = Split-Path $LogFile
if (-not (Test-Path $LogDir2)) { New-Item -ItemType Directory -Path $LogDir2 -Force | Out-Null }
Start-Transcript -Path $LogFile -Force

# Check for admin privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and select 'Run as Administrator'."
    exit 1
}

$ProjectRoot = "C:\Users\Okestra AI Labs\DocuIntelli"
$NssmDir = "C:\tools"
$NssmExe = "$NssmDir\nssm.exe"
$LogDir = "$ProjectRoot\logs"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " DocuIntelli Service Setup" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# -------------------------------------------
# Step 1: Kill existing manual processes
# -------------------------------------------
Write-Host "[1/5] Stopping existing processes..." -ForegroundColor Yellow
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "  Done.`n" -ForegroundColor Green

# -------------------------------------------
# Step 2: Download NSSM if not present
# -------------------------------------------
Write-Host "[2/5] Setting up NSSM..." -ForegroundColor Yellow

if (-not (Test-Path $NssmExe)) {
    if (-not (Test-Path $NssmDir)) {
        New-Item -ItemType Directory -Path $NssmDir -Force | Out-Null
    }

    $nssmZip = "$env:TEMP\nssm.zip"
    $nssmExtract = "$env:TEMP\nssm-extract"

    Write-Host "  Downloading NSSM..."
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip

    Write-Host "  Extracting..."
    Expand-Archive -Path $nssmZip -DestinationPath $nssmExtract -Force
    Copy-Item "$nssmExtract\nssm-2.24\win64\nssm.exe" $NssmExe -Force

    Remove-Item $nssmZip -Force -ErrorAction SilentlyContinue
    Remove-Item $nssmExtract -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "  NSSM installed at $NssmExe"
} else {
    Write-Host "  NSSM already installed at $NssmExe"
}
Write-Host "  Done.`n" -ForegroundColor Green

# -------------------------------------------
# Step 3: Create logs directory
# -------------------------------------------
Write-Host "[3/5] Creating logs directory..." -ForegroundColor Yellow
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "  Created $LogDir"
} else {
    Write-Host "  $LogDir already exists"
}
Write-Host "  Done.`n" -ForegroundColor Green

# -------------------------------------------
# Step 4: Register Express as a Windows Service via NSSM
# -------------------------------------------
Write-Host "[4/5] Setting up Express API service (DocuIntelliAPI)..." -ForegroundColor Yellow

# Remove existing service (ignore errors)
$ErrorActionPreference = "Continue"
& $NssmExe stop DocuIntelliAPI 2>&1 | Out-Null
Start-Sleep 3
& $NssmExe remove DocuIntelliAPI confirm 2>&1 | Out-Null
Start-Sleep 2

# Also remove any native cloudflared service
cloudflared service uninstall 2>&1 | Out-Null
Start-Sleep 2
& $NssmExe stop DocuIntelliTunnel 2>&1 | Out-Null
Start-Sleep 2
& $NssmExe remove DocuIntelliTunnel confirm 2>&1 | Out-Null
Start-Sleep 2
$ErrorActionPreference = "Stop"

# Use batch wrapper to handle spaces in paths
$ApiBat = "$ProjectRoot\server\start.bat"

& $NssmExe install DocuIntelliAPI $ApiBat
& $NssmExe set DocuIntelliAPI AppDirectory "$ProjectRoot\server"
& $NssmExe set DocuIntelliAPI DisplayName "DocuIntelli API Server"
& $NssmExe set DocuIntelliAPI Description "Express API server for DocuIntelli (port 5000)"
& $NssmExe set DocuIntelliAPI Start SERVICE_AUTO_START
& $NssmExe set DocuIntelliAPI AppExit Default Restart
& $NssmExe set DocuIntelliAPI AppRestartDelay 5000
& $NssmExe set DocuIntelliAPI AppStdout "$LogDir\express-stdout.log"
& $NssmExe set DocuIntelliAPI AppStderr "$LogDir\express-stderr.log"
& $NssmExe set DocuIntelliAPI AppStdoutCreationDisposition 4
& $NssmExe set DocuIntelliAPI AppStderrCreationDisposition 4
& $NssmExe set DocuIntelliAPI AppRotateFiles 1
& $NssmExe set DocuIntelliAPI AppRotateOnline 1
& $NssmExe set DocuIntelliAPI AppRotateBytes 5242880

& $NssmExe start DocuIntelliAPI
Start-Sleep -Seconds 5
Write-Host "  Done.`n" -ForegroundColor Green

# -------------------------------------------
# Step 5: Register Cloudflare Tunnel as a Windows Service via NSSM
# -------------------------------------------
Write-Host "[5/5] Setting up Cloudflare tunnel service (DocuIntelliTunnel)..." -ForegroundColor Yellow

# Use batch wrapper to handle spaces in paths
$TunnelBat = "$ProjectRoot\scripts\tunnel-start.bat"

& $NssmExe install DocuIntelliTunnel $TunnelBat
& $NssmExe set DocuIntelliTunnel DisplayName "DocuIntelli Cloudflare Tunnel"
& $NssmExe set DocuIntelliTunnel Description "Cloudflare tunnel for app.docuintelli.com"
& $NssmExe set DocuIntelliTunnel Start SERVICE_AUTO_START
& $NssmExe set DocuIntelliTunnel AppExit Default Restart
& $NssmExe set DocuIntelliTunnel AppRestartDelay 5000
& $NssmExe set DocuIntelliTunnel AppStdout "$LogDir\tunnel-stdout.log"
& $NssmExe set DocuIntelliTunnel AppStderr "$LogDir\tunnel-stderr.log"
& $NssmExe set DocuIntelliTunnel AppStdoutCreationDisposition 4
& $NssmExe set DocuIntelliTunnel AppStderrCreationDisposition 4
& $NssmExe set DocuIntelliTunnel AppRotateFiles 1
& $NssmExe set DocuIntelliTunnel AppRotateOnline 1
& $NssmExe set DocuIntelliTunnel AppRotateBytes 5242880

& $NssmExe start DocuIntelliTunnel
Start-Sleep -Seconds 8
Write-Host "  Done.`n" -ForegroundColor Green

# -------------------------------------------
# Verify
# -------------------------------------------
Write-Host "Verifying services..." -ForegroundColor Yellow

$apiStatus = (Get-Service -Name "DocuIntelliAPI" -ErrorAction SilentlyContinue).Status
$tunnelStatus = (Get-Service -Name "DocuIntelliTunnel" -ErrorAction SilentlyContinue).Status

Write-Host "  DocuIntelli API service:     $apiStatus"
Write-Host "  DocuIntelli Tunnel service:  $tunnelStatus"

try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "  Health check:                $($response.StatusCode) OK" -ForegroundColor Green
} catch {
    Write-Host "  Health check:                FAILED (server may still be starting)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nBoth services will now:" -ForegroundColor White
Write-Host "  - Auto-start on Windows boot (before login)" -ForegroundColor White
Write-Host "  - Auto-restart if they crash (5s delay)" -ForegroundColor White
Write-Host "`nService names:" -ForegroundColor White
Write-Host "  DocuIntelliAPI     - Express server (port 5000)" -ForegroundColor Gray
Write-Host "  DocuIntelliTunnel  - Cloudflare tunnel (app.docuintelli.com)" -ForegroundColor Gray
Write-Host "`nUseful commands:" -ForegroundColor White
Write-Host "  sc query DocuIntelliAPI              # Check API status" -ForegroundColor Gray
Write-Host "  sc query DocuIntelliTunnel           # Check tunnel status" -ForegroundColor Gray
Write-Host "  C:\tools\nssm restart DocuIntelliAPI     # Restart API" -ForegroundColor Gray
Write-Host "  C:\tools\nssm restart DocuIntelliTunnel  # Restart tunnel" -ForegroundColor Gray
Write-Host "  Get-Content $LogDir\express-stdout.log -Tail 20  # View API logs" -ForegroundColor Gray
Write-Host "  Get-Content $LogDir\tunnel-stderr.log -Tail 20   # View tunnel logs" -ForegroundColor Gray
Write-Host "`nTo deploy new server code:" -ForegroundColor White
Write-Host "  cd server && npm run build && C:\tools\nssm restart DocuIntelliAPI" -ForegroundColor Gray
Write-Host ""
Stop-Transcript
