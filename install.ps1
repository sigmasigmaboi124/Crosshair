[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Stop'
$repo = 'sigmasigmaboi124/Crosshair'
$headers = @{ 'User-Agent' = 'ZeroPoint-Installer' }

Write-Host ""
Write-Host "  ZEROPOINT - Downloading latest Windows build..." -ForegroundColor Cyan
Write-Host ""

$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=15" -Headers $headers
if (-not $releases -or $releases.Count -eq 0) {
    throw "No published releases found yet at https://github.com/$repo/releases"
}

$asset = $null
$pickedRelease = $null

$ordered = @($releases | Where-Object { -not $_.draft -and -not $_.prerelease }) +
           @($releases | Where-Object { -not $_.draft -and $_.prerelease })

foreach ($rel in $ordered) {
    $match = $rel.assets | Where-Object { $_.name -like 'ZeroPoint-Setup-*.exe' } | Select-Object -First 1
    if (-not $match) {
        $match = $rel.assets | Where-Object { $_.name -like 'ZeroPoint-Portable-*.exe' } | Select-Object -First 1
    }
    if ($match) {
        $asset = $match
        $pickedRelease = $rel
        break
    }
}

if (-not $asset) {
    throw "No ZeroPoint .exe asset found yet. Wait ~2 minutes if a GitHub build is currently running."
}

$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path $downloadsDir)) { New-Item -ItemType Directory -Path $downloadsDir | Out-Null }
$outFile = Join-Path $downloadsDir $asset.name
$sizeMB = [math]::Round($asset.size / 1MB, 1)

Write-Host "  Release : $($pickedRelease.tag_name)" -ForegroundColor White
Write-Host "  File    : $($asset.name) ($sizeMB MB)" -ForegroundColor White
Write-Host "  Dest    : $outFile" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Downloading..." -ForegroundColor Yellow

if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -fL --progress-bar -o $outFile $asset.browser_download_url
    if ($LASTEXITCODE -ne 0) { throw "Download failed with exit code $LASTEXITCODE" }
} else {
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $outFile -UseBasicParsing
}

Write-Host ""
Write-Host "  Download complete! Launching $($asset.name)..." -ForegroundColor Green
Start-Process -FilePath $outFile
