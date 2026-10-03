param([string]$Runtime = (Join-Path $PSScriptRoot '../../_Local/comfy/ComfyUI_windows_portable'))
$ErrorActionPreference = 'Stop'
$runtimePath = [IO.Path]::GetFullPath($Runtime)
$pythonPath = Join-Path $runtimePath 'python_embeded/python.exe'
$mainPath = Join-Path $runtimePath 'ComfyUI/main.py'
if (!(Test-Path -LiteralPath $pythonPath) -or !(Test-Path -LiteralPath $mainPath)) {
  throw 'ComfyUI Portable fehlt. Einrichtung: docs/lokale-bilder.md'
}
& $pythonPath -s $mainPath --windows-standalone-build --listen 127.0.0.1 --port 8188 --disable-auto-launch --lowvram
exit $LASTEXITCODE
