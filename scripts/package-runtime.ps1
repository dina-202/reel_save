$ErrorActionPreference = 'Stop'
$reelRoot = Split-Path $PSScriptRoot -Parent
$reelRuntime = Join-Path $reelRoot 'build/runtime'
$reelRelease = Join-Path $reelRoot 'release'
$reelArchive = Join-Path $reelRelease 'ReelSave-Runtime-Windows-x64-v1.zip'
if (-not (Test-Path -LiteralPath "$reelRuntime/python/python.exe")) { throw 'Run npm run prepare:runtime first.' }
New-Item -ItemType Directory -Force -Path $reelRelease | Out-Null
Remove-Item -LiteralPath $reelArchive -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$reelRuntime/*" -DestinationPath $reelArchive -CompressionLevel Optimal
Write-Host "Created $reelArchive"
