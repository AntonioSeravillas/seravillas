# Starts the Jarvis live relay on this PC. Only the path of the private configuration file is passed;
# the device code is read from that file and never appears on the command line or in this script.
param([string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'hermes\profiles\seravillas\jarvis-live-relay.json'))
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS first.' }
if (-not (Test-Path $ConfigPath)) { throw 'No live relay configuration was found. See docs/jarvis-live-release.md to create it.' }
Write-Host 'Keep the Jarvis server (start-jarvis.ps1) running in its own window, and keep this PC awake.'
& node (Join-Path $PSScriptRoot 'live-relay.mjs') --config $ConfigPath
