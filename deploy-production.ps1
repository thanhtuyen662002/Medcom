# deploy-production.ps1
# Automated elevated deployment script for Medcom Backend & Frontend on VPS

$ErrorActionPreference = "Stop"

# Ensure Administrator elevation
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Process is not running as Administrator. Requesting elevation..." -ForegroundColor Yellow
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
    exit 0
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "        MEDCOM PRODUCTION DEPLOYMENT (BE & FE)           " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Running with full Administrator privileges." -ForegroundColor Gray
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

$appcmd = "$env:SystemRoot\System32\inetsrv\appcmd.exe"
$beSource = "C:\Users\Tuyen\Projects\Medcom\artifacts\backend"
$beDest = "C:\Medcom\releases\be"
$feSource = "C:\Users\Tuyen\Projects\Medcom\artifacts\medcom-frontend-win32-x64"
$feDest = "C:\Medcom\releases\fe"
$privateConfigPath = "C:\Medcom\config\appsettings.Private.json"
$targetFingerprint = "10db27d0fd4df5a3be28db6b17c482cbb9c03a9e6482b67053f489a45926fe90"

# 1. Stop IIS AppPool and Frontend Service
Write-Host "`n[1/6] Stopping services..." -ForegroundColor Cyan
if (Test-Path $appcmd) {
    Write-Host "Stopping IIS AppPool 'MedcomApiPool'..." -ForegroundColor Gray
    & $appcmd stop apppool /apppool.name:MedcomApiPool
} else {
    Write-Warning "appcmd.exe not found at $appcmd"
}

Write-Host "Stopping Windows Service 'MedcomFrontendService'..." -ForegroundColor Gray
Stop-Service -Name MedcomFrontendService -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Deploy Backend
Write-Host "`n[2/6] Deploying Backend..." -ForegroundColor Cyan
if (Test-Path $beSource) {
    if (-not (Test-Path $beDest)) {
        New-Item -ItemType Directory -Path $beDest -Force | Out-Null
    }
    
    # Backup existing release manifest if present
    if (Test-Path "$beDest\manifest.json") {
        Copy-Item "$beDest\manifest.json" "$beDest\manifest.json.bak" -Force
    }
    
    Write-Host "Copying backend files from $beSource to $beDest..." -ForegroundColor Gray
    Copy-Item -Path "$beSource\*" -Destination $beDest -Recurse -Force
    Write-Host "Backend binaries copied successfully." -ForegroundColor Green
} else {
    throw "Backend build artifact not found at $beSource"
}

# 3. Update Schema Fingerprint in Private Config
Write-Host "`n[3/6] Updating SchemaFingerprint in Private Config..." -ForegroundColor Cyan
if (Test-Path $privateConfigPath) {
    # Backup private config
    $backupPath = "$privateConfigPath.bak_$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $privateConfigPath $backupPath -Force
    Write-Host "Backup created: $backupPath" -ForegroundColor Gray
    
    $rawJson = Get-Content $privateConfigPath -Raw
    $config = $rawJson | ConvertFrom-Json
    
    $currentFp = $config.Medcom.ErpWrites.SchemaFingerprint
    Write-Host "Current SchemaFingerprint: $currentFp" -ForegroundColor Gray
    Write-Host "Target SchemaFingerprint:  $targetFingerprint" -ForegroundColor Gray
    
    if ($config.Medcom.ErpWrites) {
        $config.Medcom.ErpWrites.SchemaFingerprint = $targetFingerprint
        $updatedJson = $config | ConvertTo-Json -Depth 20
        [System.IO.File]::WriteAllText($privateConfigPath, $updatedJson, [System.Text.Encoding]::UTF8)
        Write-Host "SchemaFingerprint updated successfully." -ForegroundColor Green
    } else {
        Write-Warning "Medcom:ErpWrites section not found in $privateConfigPath"
    }
} else {
    Write-Warning "Private config not found at $privateConfigPath"
}

# 4. Deploy Frontend
Write-Host "`n[4/6] Deploying Frontend..." -ForegroundColor Cyan
if (Test-Path $feSource) {
    if (-not (Test-Path $feDest)) {
        New-Item -ItemType Directory -Path $feDest -Force | Out-Null
    }
    
    # Remove old frontend application assets while keeping service files
    Write-Host "Cleaning existing frontend release files..." -ForegroundColor Gray
    Remove-Item -Path "$feDest\.next" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$feDest\public" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$feDest\server.js" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$feDest\package.json" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$feDest\medcom-package.json" -Force -ErrorAction SilentlyContinue

    Write-Host "Copying frontend files from $feSource to $feDest..." -ForegroundColor Gray
    Copy-Item -Path "$feSource\*" -Destination $feDest -Recurse -Force
    Write-Host "Frontend package copied successfully." -ForegroundColor Green
} else {
    throw "Frontend artifact not found at $feSource"
}

# 5. Start IIS AppPool and Frontend Service
Write-Host "`n[5/6] Starting services..." -ForegroundColor Cyan
if (Test-Path $appcmd) {
    Write-Host "Starting IIS AppPool 'MedcomApiPool'..." -ForegroundColor Gray
    & $appcmd start apppool /apppool.name:MedcomApiPool
}

Write-Host "Starting Windows Service 'MedcomFrontendService'..." -ForegroundColor Gray
Start-Service -Name MedcomFrontendService
Start-Sleep -Seconds 3

# 6. Verification and Health Checks
Write-Host "`n[6/6] Verifying deployment health..." -ForegroundColor Cyan

# Prepare erp writes check
Write-Host "Running read-only prepare verification on deployed backend..." -ForegroundColor Gray
$prepareResult = & dotnet "$beDest\Medcom.Api.dll" --prepare-erp-writes --Medcom:PrivateConfigPath "$privateConfigPath" 2>&1
$prepareJson = $prepareResult | Out-String
if ($prepareJson -match '"status":\s*"prepared"') {
    Write-Host "Prepare check PASSED (status: prepared)." -ForegroundColor Green
} else {
    Write-Warning "Prepare check output: $prepareJson"
}

# Backend health
try {
    $beHealth = Invoke-WebRequest -Uri "https://api.medcom.internal:83/health/live" -SkipCertificateCheck -TimeoutSec 10 -UseBasicParsing
    Write-Host "BE Internal Health (https://api.medcom.internal:83): $($beHealth.StatusCode) $($beHealth.StatusDescription)" -ForegroundColor Green
} catch {
    Write-Warning "BE Internal Health Check failed: $_"
}

try {
    $bePubHealth = Invoke-WebRequest -Uri "https://api-medcom.bms79.com/health/live" -TimeoutSec 10 -UseBasicParsing
    Write-Host "BE Public Health (https://api-medcom.bms79.com): $($bePubHealth.StatusCode) $($bePubHealth.StatusDescription)" -ForegroundColor Green
} catch {
    Write-Warning "BE Public Health Check failed: $_"
}

# Frontend health
try {
    $feHealth = Invoke-WebRequest -Uri "http://127.0.0.1:81/api/erp/health/live" -TimeoutSec 10 -UseBasicParsing
    Write-Host "FE Service Health (http://127.0.0.1:81): $($feHealth.StatusCode) $($feHealth.StatusDescription)" -ForegroundColor Green
} catch {
    Write-Warning "FE Service Health Check failed: $_"
}

try {
    $fePubHealth = Invoke-WebRequest -Uri "https://medcom.bms79.com/api/erp/health/live" -TimeoutSec 10 -UseBasicParsing
    Write-Host "FE Public Health (https://medcom.bms79.com): $($fePubHealth.StatusCode) $($fePubHealth.StatusDescription)" -ForegroundColor Green
} catch {
    Write-Warning "FE Public Health Check failed: $_"
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "           DEPLOYMENT COMPLETED SUCCESSFULLY              " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
