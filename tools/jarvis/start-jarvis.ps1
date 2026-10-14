param([ValidateSet('hermes','n8n')][string]$Route = 'hermes', [string]$ProfileDirectory = (Join-Path $env:LOCALAPPDATA 'hermes\profiles\seravillas'))
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS first.' }
function Read-PrivateValue([string]$Prompt) {
    $secureValue = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$previousHermesKey = $env:HERMES_API_KEY
$previousN8nKey = $env:JARVIS_N8N_KEY
$previousRoute = $env:JARVIS_ROUTE
try {
    $privateEnvFile = Join-Path $ProfileDirectory '.env'
    if (-not $env:HERMES_API_KEY -and (Test-Path $privateEnvFile)) {
        $keyLine = Get-Content $privateEnvFile | Where-Object { $_ -match '^API_SERVER_KEY=' } | Select-Object -Last 1
        if ($keyLine) { $env:HERMES_API_KEY = $keyLine.Substring('API_SERVER_KEY='.Length).Trim().Trim('"').Trim("'") }
    }
    if (-not $env:HERMES_API_KEY) { $env:HERMES_API_KEY = Read-PrivateValue 'Hermes API_SERVER_KEY (hidden; stays in this process)' }
    if ($Route -eq 'n8n' -and -not $env:JARVIS_N8N_KEY) { $env:JARVIS_N8N_KEY = Read-PrivateValue 'n8n X-Jarvis-Key credential value (hidden)' }
    $env:JARVIS_ROUTE = $Route
    & node (Join-Path $PSScriptRoot 'serve.mjs')
} finally {
    $env:HERMES_API_KEY = $previousHermesKey
    $env:JARVIS_N8N_KEY = $previousN8nKey
    $env:JARVIS_ROUTE = $previousRoute
}
