param([string]$ProfileDirectory = (Join-Path $env:LOCALAPPDATA 'hermes\profiles\seravillas'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $ProfileDirectory 'config.yaml'))) {
    throw 'No Hermes config.yaml found there. Create the seravillas profile first (hermes profile create seravillas). For a custom folder or the default Hermes home, pass -ProfileDirectory with that folder.'
}
$privateEnvFile = Join-Path $ProfileDirectory '.env'
$existing = if (Test-Path $privateEnvFile) { @(Get-Content $privateEnvFile) } else { @() }
$keyLine = $existing | Where-Object { $_ -match '^API_SERVER_KEY=' } | Select-Object -Last 1
$privateKey = if ($keyLine) { $keyLine.Substring('API_SERVER_KEY='.Length).Trim().Trim('"').Trim("'") } else { '' }
if (-not $privateKey) {
    $jarvisKeyBytes = New-Object byte[] 32
    $jarvisRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $jarvisRng.GetBytes($jarvisKeyBytes) } finally { $jarvisRng.Dispose() }
    $privateKey = [BitConverter]::ToString($jarvisKeyBytes).Replace('-', '').ToLowerInvariant()
}
$kept = $existing | Where-Object { $_ -notmatch '^API_SERVER_(ENABLED|HOST|PORT|KEY|CORS_ORIGINS)=' }
$newLines = @($kept) + @('API_SERVER_ENABLED=true', 'API_SERVER_HOST=127.0.0.1', 'API_SERVER_PORT=8642', "API_SERVER_KEY=$privateKey")
[IO.File]::WriteAllText($privateEnvFile, (($newLines -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding($false)))
$privateKey = $null
Write-Host "Local API settings prepared in $ProfileDirectory. No key was printed."
Write-Host 'Each Hermes home keeps its own separate key. One default gateway serves every profile:'
Write-Host '  1. Prepare seravillas:   .\tools\jarvis\prepare-hermes.ps1'
Write-Host '  2. Prepare the default:  .\tools\jarvis\prepare-hermes.ps1 -ProfileDirectory "$env:LOCALAPPDATA\hermes"'
Write-Host '  3. In its own terminal (foreground, no service install):  hermes -p default gateway'
Write-Host 'seravillas keeps its own model and memory. Jarvis reaches it at http://127.0.0.1:8642/p/seravillas/ using the seravillas key.'
