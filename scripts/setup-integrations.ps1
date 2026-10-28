$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$mediaCrawler = Join-Path $projectRoot 'integrations\MediaCrawler'
$videoFetch = Join-Path $projectRoot 'integrations\video-fetch-yjf'

git -C $projectRoot submodule update --init --recursive
uv sync --directory $mediaCrawler

$videoFetchPython = Join-Path $videoFetch '.venv\Scripts\python.exe'
if (-not (Test-Path $videoFetchPython)) {
    uv venv (Join-Path $videoFetch '.venv')
}
uv pip install --python $videoFetchPython yt-dlp imageio-ffmpeg pyyaml

$mediaCrawlerConfig = Join-Path $mediaCrawler 'config\base_config.py'
$config = Get-Content -Raw $mediaCrawlerConfig
$config = $config.Replace('CDP_CONNECT_EXISTING = True', 'CDP_CONNECT_EXISTING = False')
Set-Content -Path $mediaCrawlerConfig -Value $config -Encoding utf8

$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $projectRoot '.env.example') $envFile
}

Write-Host 'Integrations are ready. Run: npm run dev'
