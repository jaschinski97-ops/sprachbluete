param([string]$Runtime = (Join-Path $PSScriptRoot '../../_Local/text'))
$ErrorActionPreference = 'Stop'
$runtimePath = [IO.Path]::GetFullPath($Runtime)
$server = Join-Path $runtimePath 'llama/llama-server.exe'
if (!(Test-Path -LiteralPath $server)) { throw 'Zuerst scripts/content/setup-local-text.ps1 ausführen.' }
# Never stop ComfyUI or release its memory behind the user's back.
try { $queue = Invoke-RestMethod 'http://127.0.0.1:8188/queue' -TimeoutSec 3 } catch { $queue = $null }
if ($queue -and ($queue.queue_running.Count -or $queue.queue_pending.Count)) { throw 'Bildlauf aktiv. Textserver erst nach dessen Abschluss starten.' }
$used = & nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits
if ($LASTEXITCODE -eq 0 -and [int]($used | Select-Object -First 1) -gt 3000) { throw 'GPU bereits belegt. Nach dem Bildlauf ComfyUI beenden; dann Textserver starten.' }
$qwen = (Join-Path $runtimePath 'models/Qwen3.5-9B-Q5_K_M.gguf').Replace('\','/')
$gemma = (Join-Path $runtimePath 'models/gemma-4-12B-it-Q4_K_M.gguf').Replace('\','/')
foreach ($file in @($qwen,$gemma)) { if (!(Test-Path -LiteralPath $file)) { throw "Modelldatei fehlt: $file" } }
$presets = Join-Path $runtimePath 'models.ini'
$presetText = @"
version = 1
[*]
c = 16384
n-gpu-layers = 99
parallel = 1
reasoning = off
[qwen3.5-9b]
model = $qwen
alias = qwen3.5-9b
[gemma-4-12b]
model = $gemma
alias = gemma-4-12b
"@
[IO.File]::WriteAllText($presets, $presetText, [Text.UTF8Encoding]::new($false))
& $server --host 127.0.0.1 --port 8090 --models-preset $presets --models-max 1 --no-webui
exit $LASTEXITCODE
