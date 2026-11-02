param(
    [ValidateSet('local', 'siliconflow', 'none')]
    [string]$Transcription = 'local'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$integration = Join-Path $projectRoot 'integrations\douyin-favorites-to-knowledge'
$adapter = Join-Path $projectRoot 'integrations\douyin-analysis-adapter'
$configPath = Join-Path $projectRoot 'data\douyin-monitor\config.json'
$knowledgeDir = Join-Path $projectRoot 'data\douyin-knowledge'
$ffmpegDir = Join-Path $projectRoot '.tools\ffmpeg'

git -C $projectRoot submodule update --init --recursive

$venv = Join-Path $integration '.venv'
$python = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $python)) {
    uv venv $venv --python 3.12
}

$coreWheel = Join-Path $integration 'vendor\wheels\douyin_knowledge_core-0.2.1-py3-none-any.whl'
uv pip install --python $python $coreWheel 'playwright>=1.50,<2'

if ($Transcription -eq 'local') {
    # faster-whisper 1.2 currently passes metadata_errors to PyAV; PyAV 19 removed it.
    uv pip install --python $python 'faster-whisper>=1.1,<2' 'av>=11,<19' imageio-ffmpeg
    New-Item -ItemType Directory -Force $ffmpegDir | Out-Null
    $ffmpegSource = & $python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
    Copy-Item -Force $ffmpegSource.Trim() (Join-Path $ffmpegDir 'ffmpeg.exe')
}

$env:PATH = "$ffmpegDir;$env:PATH"
$env:PYTHONPATH = "$(Join-Path $integration 'src');$adapter;$env:PYTHONPATH"
$env:DOUYIN_FAVORITES_CONFIG = $configPath
$env:DOUYIN_KNOWLEDGE_DIR = $knowledgeDir
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
New-Item -ItemType Directory -Force (Split-Path -Parent $configPath) | Out-Null
New-Item -ItemType Directory -Force $knowledgeDir | Out-Null

if (-not (Test-Path $configPath)) {
    & $python -m douyin_favorites_knowledge --config $configPath setup `
        --knowledge-dir $knowledgeDir --transcription $Transcription --skip-login
}

$config = Get-Content -Raw $configPath | ConvertFrom-Json
$config.mode = 'full'
if ($Transcription -eq 'local') {
    $config.transcription.enabled = $true
    $config.transcription.provider = 'adapter'
    $config.transcription | Add-Member -NotePropertyName adapter -NotePropertyValue 'transcription_adapter:transcribe_cached' -Force
}
$config.analysis = [ordered]@{
    enabled = $true
    provider = 'adapter'
    adapter = 'analysis_adapter:analyze'
    model = if ($env:VIDEO_ANALYSIS_MODEL) { $env:VIDEO_ANALYSIS_MODEL } else { 'extractive-v1' }
    options = @{}
}
$configJson = $config | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($configPath, $configJson, [System.Text.UTF8Encoding]::new($false))

& $python -m douyin_favorites_knowledge --config $configPath check-config
if ($LASTEXITCODE -ne 0) { throw 'Douyin monitor config validation failed.' }
Write-Host "Douyin monitor is ready at $knowledgeDir"
Write-Host 'Next step: npm run douyin:login'
