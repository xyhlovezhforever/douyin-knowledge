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

$env:PATH = "$ffmpegDir;$env:PATH"
$env:PYTHONPATH = "$(Join-Path $integration 'src');$adapter;$env:PYTHONPATH"
$env:DOUYIN_FAVORITES_CONFIG = $configPath
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

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
foreach ($current in $sources) {
    & $python -m douyin_favorites_knowledge --config $configPath sync --source $current --max-items 1000 --no-login-prompt --browser-channel msedge
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
