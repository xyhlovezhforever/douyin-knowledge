param(
    [ValidateSet('login', 'sync', 'status')]
    [string]$Action = 'sync',
    [ValidateSet('collection', 'like', 'all')]
    [string]$Source = 'all'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$integration = Join-Path $projectRoot 'integrations\douyin-favorites-to-knowledge'
$adapter = Join-Path $projectRoot 'integrations\douyin-analysis-adapter'
$configPath = Join-Path $projectRoot 'data\douyin-monitor\config.json'
$ffmpegDir = Join-Path $projectRoot '.tools\ffmpeg'
$python = Join-Path $integration '.venv\Scripts\python.exe'
$syncLockPath = Join-Path $projectRoot 'data\douyin-monitor\sync.lock'

$env:PATH = "$ffmpegDir;$env:PATH"
$env:PYTHONPATH = "$(Join-Path $integration 'src');$adapter;$env:PYTHONPATH"
$env:DOUYIN_FAVORITES_CONFIG = $configPath
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
if (-not $env:OMP_NUM_THREADS) {
    $env:OMP_NUM_THREADS = [string][Math]::Max(1, [Math]::Floor([Environment]::ProcessorCount / 2))
}

if (-not (Test-Path $configPath)) {
    throw 'Douyin monitor is not initialized. Run npm run douyin:setup first.'
}

if (-not (Test-Path $python)) {
    throw 'Douyin monitor runtime is missing. Run npm run douyin:setup first.'
}

if ($Action -eq 'login') {
    $loginSource = if ($Source -eq 'like') { 'like' } else { 'collection' }
    & $python -m douyin_favorites_knowledge --config $configPath login --source $loginSource --browser-channel msedge
    exit $LASTEXITCODE
}

if ($Action -eq 'status') {
    & $python -m douyin_favorites_knowledge --config $configPath status --browser-channel msedge
    exit $LASTEXITCODE
}

$sources = if ($Source -eq 'all') { @('collection', 'like') } else { @($Source) }
$lockStream = $null
$ownsLock = $false
try {
    try {
        $lockStream = [System.IO.File]::Open($syncLockPath, 'CreateNew', 'Write', 'Read')
        $ownsLock = $true
    } catch [System.IO.IOException] {
        $owner = $null
        try { $owner = Get-Content -Raw -LiteralPath $syncLockPath | ConvertFrom-Json } catch {}
        $ownerRunning = $owner -and $owner.pid -and (Get-Process -Id $owner.pid -ErrorAction SilentlyContinue)
        $recentIncompleteLock = (-not $owner) -and (Test-Path -LiteralPath $syncLockPath) -and (((Get-Date) - (Get-Item -LiteralPath $syncLockPath).LastWriteTime).TotalSeconds -lt 30)
        if ($ownerRunning -or $recentIncompleteLock) {
            Write-Output '{"status":"already_running"}'
            exit 0
        }
        Remove-Item -LiteralPath $syncLockPath -Force -ErrorAction SilentlyContinue
        $lockStream = [System.IO.File]::Open($syncLockPath, 'CreateNew', 'Write', 'Read')
        $ownsLock = $true
    }
    $ownerBytes = [System.Text.Encoding]::UTF8.GetBytes((@{ pid = $PID; startedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress))
    $lockStream.Write($ownerBytes, 0, $ownerBytes.Length)
    $lockStream.Flush()

    foreach ($current in $sources) {
        & $python -m douyin_favorites_knowledge --config $configPath sync --source $current --max-items 1000 --no-login-prompt --browser-channel msedge
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
} finally {
    if ($lockStream) { $lockStream.Dispose() }
    if ($ownsLock) { Remove-Item -LiteralPath $syncLockPath -Force -ErrorAction SilentlyContinue }
}
