param(
    [string]$InstallRoot = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex-ping'),
    [string]$SkillRoot = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agents\skills\codex-ping')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3 is required. Install it from https://www.python.org/downloads/'
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $SkillRoot 'agents') | Out-Null

Copy-Item -Force -LiteralPath (Join-Path $repoRoot 'codexping.py') -Destination $InstallRoot
Copy-Item -Force -LiteralPath (Join-Path $repoRoot '.agents\skills\codex-ping\SKILL.md') -Destination $SkillRoot
Copy-Item -Force -LiteralPath (Join-Path $repoRoot '.agents\skills\codex-ping\agents\openai.yaml') -Destination (Join-Path $SkillRoot 'agents')

try {
    $health = Invoke-RestMethod -Uri 'https://codex-world-bus.mingowu1.workers.dev/health' -TimeoutSec 10
    if (-not $health.ok) { throw 'Unexpected health response' }
    Write-Host 'Relay: online'
} catch {
    Write-Warning 'Codex Ping was installed, but the public relay could not be reached.'
}

Write-Host "Client: $InstallRoot"
Write-Host "Skill:  $SkillRoot"
Write-Host 'Done. Start a new Codex task and set your identity in natural language.'
