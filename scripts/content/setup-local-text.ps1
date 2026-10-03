param([string]$Runtime = (Join-Path $PSScriptRoot '../../_Local/text'))
$ErrorActionPreference = 'Stop'
$runtimePath = [IO.Path]::GetFullPath($Runtime)
New-Item -ItemType Directory -Force -Path (Join-Path $runtimePath 'llama'), (Join-Path $runtimePath 'models') | Out-Null
$release = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b11379'
foreach ($name in @('llama-b11379-bin-win-cuda-12.4-x64.zip', 'cudart-llama-bin-win-cuda-12.4-x64.zip')) {
  $asset = $release.assets | Where-Object name -eq $name
  if (!$asset) { throw "Offizielles Runtime-Archiv fehlt: $name" }
  $archive = Join-Path $runtimePath $name
  & curl.exe --fail --location --retry 3 --output $archive $asset.browser_download_url
  if ($LASTEXITCODE) { throw "Runtime-Download fehlgeschlagen: $name" }
  if ($asset.digest -and $asset.digest.StartsWith('sha256:') -and (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.digest.Substring(7)) { throw 'Runtime-Prüfsumme stimmt nicht.' }
  Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtimePath 'llama') -Force
}
foreach ($model in @(
  @{Repo='unsloth/Qwen3.5-9B-GGUF'; File='Qwen3.5-9B-Q5_K_M.gguf'},
  @{Repo='bartowski/gemma-4-12B-it-GGUF'; File='gemma-4-12B-it-Q4_K_M.gguf'}
)) {
  $info = Invoke-RestMethod "https://huggingface.co/api/models/$($model.Repo)?blobs=true"
  $entry = $info.siblings | Where-Object rfilename -eq $model.File
  if (!$entry.lfs.sha256) { throw "Gewicht-Prüfsumme fehlt: $($model.File)" }
  $file = Join-Path $runtimePath "models/$($model.File)"
  if (!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.lfs.sha256) {
    $partial = "$file.partial"
    & curl.exe --fail --location --retry 3 --output $partial "https://huggingface.co/$($model.Repo)/resolve/$($info.sha)/$($model.File)"
    if ($LASTEXITCODE) { throw "Modelldownload fehlgeschlagen: $($model.File)" }
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.lfs.sha256) { throw 'Modell-Prüfsumme stimmt nicht.' }
    Move-Item -LiteralPath $partial -Destination $file -Force
  }
}
Write-Host 'Beide Textmodelle installiert. Kein Modell gestartet, keine GPU belegt.'
