$ErrorActionPreference = 'Stop'
$reelRoot = Split-Path $PSScriptRoot -Parent
$reelRuntime = Join-Path $reelRoot 'build/runtime'
$reelCache = Join-Path $reelRoot 'build/downloads'
New-Item -ItemType Directory -Force -Path $reelRuntime,$reelCache | Out-Null

function Get-ReelFile($Uri, $Name) {
    $reelTarget = Join-Path $reelCache $Name
    if (-not (Test-Path -LiteralPath $reelTarget)) {
        Write-Host "Downloading $Name"
        Invoke-WebRequest -Uri $Uri -OutFile "$reelTarget.partial"
        Move-Item -LiteralPath "$reelTarget.partial" -Destination $reelTarget -Force
    }
    return $reelTarget
}

$reelPythonZip = Get-ReelFile 'https://www.python.org/ftp/python/3.13.13/python-3.13.13-embed-amd64.zip' 'python-3.13.13.zip'
$reelPythonDir = Join-Path $reelRuntime 'python'
if (-not (Test-Path "$reelPythonDir/python.exe")) {
    Expand-Archive -LiteralPath $reelPythonZip -DestinationPath $reelPythonDir -Force
}
# Relative search paths make this interpreter relocatable after installation.
Set-Content -LiteralPath "$reelPythonDir/python313._pth" -Encoding ASCII -Value "python313.zip`n.`nLib/site-packages`nimport site"
$reelPip = Get-ReelFile 'https://bootstrap.pypa.io/get-pip.py' 'get-pip.py'
& "$reelPythonDir/python.exe" $reelPip --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { throw 'Could not bootstrap bundled pip.' }
& "$reelPythonDir/python.exe" -m pip install --disable-pip-version-check -r "$reelRoot/requirements.txt"
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare backend dependencies.' }

$reelNodeZip = Get-ReelFile 'https://nodejs.org/dist/v22.23.0/node-v22.23.0-win-x64.zip' 'node-v22.23.0.zip'
Expand-Archive -LiteralPath $reelNodeZip -DestinationPath "$reelCache/node" -Force
New-Item -ItemType Directory -Force -Path "$reelRuntime/bin", "$reelRuntime/licenses" | Out-Null
Copy-Item -LiteralPath "$reelCache/node/node-v22.23.0-win-x64/node.exe" -Destination "$reelRuntime/bin/node.exe"
Copy-Item -LiteralPath "$reelCache/node/node-v22.23.0-win-x64/LICENSE" -Destination "$reelRuntime/licenses/NODE-LICENSE.txt"

$reelFfmpegZip = Get-ReelFile 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' 'ffmpeg-essentials.zip'
Expand-Archive -LiteralPath $reelFfmpegZip -DestinationPath "$reelCache/ffmpeg" -Force
$reelFfmpegDir = Get-ChildItem "$reelCache/ffmpeg" -Directory | Select-Object -First 1
Copy-Item -LiteralPath "$($reelFfmpegDir.FullName)/bin/ffmpeg.exe", "$($reelFfmpegDir.FullName)/bin/ffprobe.exe" -Destination "$reelRuntime/bin"
Copy-Item -LiteralPath "$($reelFfmpegDir.FullName)/LICENSE" -Destination "$reelRuntime/licenses/FFMPEG-LICENSE.txt"
Copy-Item -LiteralPath "$reelPythonDir/LICENSE.txt" -Destination "$reelRuntime/licenses/PYTHON-LICENSE.txt"
Set-Content -LiteralPath "$reelRuntime/licenses/SOURCES.txt" -Value @'
Python: https://www.python.org/downloads/release/python-31313/
Node.js: https://nodejs.org/dist/v22.23.0/
FFmpeg Windows builds: https://www.gyan.dev/ffmpeg/builds/
FFmpeg source: https://ffmpeg.org/download.html
yt-dlp: https://github.com/yt-dlp/yt-dlp (Unlicense)
Python package licenses are included in python/Lib/site-packages/*.dist-info.
Electron: https://github.com/electron/electron (MIT; Chromium third-party notices included).
'@
Write-Host 'Bundled Python, yt-dlp, Node and FFmpeg are ready.'
