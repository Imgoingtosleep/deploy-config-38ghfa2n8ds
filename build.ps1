# Builds dist\NetAuto.exe: the web UI and the API in one Windows program.
# Needs Python 3.11+ and Node.js 18+ on PATH. Run from any folder:
#   powershell -ExecutionPolicy Bypass -File .\build.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$work = Join-Path $root "build\pyinstaller"
$venv = Join-Path $root ".build-venv"

function Invoke-Checked([string]$what, [scriptblock]$cmd) {
    Write-Host "==> $what" -ForegroundColor Cyan
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

# 1. Web UI, built to call the API on its own origin
Push-Location $frontend
try {
    Invoke-Checked "npm ci" { npm ci }
    Invoke-Checked "vite build (exe mode)" { npm run build:exe }
} finally {
    Pop-Location
}

# 2. Python environment for the backend + PyInstaller
if (-not (Test-Path $venv)) {
    Invoke-Checked "create build venv" { python -m venv $venv }
}
$py = Join-Path $venv "Scripts\python.exe"
Invoke-Checked "pip install" { & $py -m pip install --upgrade pip }
Invoke-Checked "pip install requirements" { & $py -m pip install -r (Join-Path $backend "requirements.txt") pyinstaller }

# 3. One-file .exe. Credential profiles are NOT bundled: the .exe starts with none.
$dataFiles = "command_profiles.json", "model_rules.json", "playbooks.json", "templates.json"
$pyiArgs = @(
    "--noconfirm", "--clean", "--onefile", "--console",
    "--name", "NetAuto",
    "--distpath", (Join-Path $root "dist"),
    "--workpath", $work,
    "--specpath", $work,
    "--paths", $backend,
    "--add-data", "$(Join-Path $frontend 'dist');frontend_dist",
    "--collect-submodules", "app",
    "--collect-submodules", "uvicorn",
    "--collect-all", "netmiko",
    "--collect-all", "ntc_templates",
    "--collect-all", "textfsm",
    "--collect-all", "nornir",
    "--collect-all", "nornir_netmiko",
    "--collect-all", "nornir_utils",
    "--hidden-import", "multipart",
    "--hidden-import", "python_multipart"
)
foreach ($f in $dataFiles) {
    $pyiArgs += @("--add-data", "$(Join-Path $backend "app\data\$f");app\data")
}
$pyiArgs += (Join-Path $backend "run_app.py")

Push-Location $backend
try {
    Invoke-Checked "pyinstaller" { & $py -m PyInstaller @pyiArgs }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Done: $(Join-Path $root 'dist\NetAuto.exe')" -ForegroundColor Green
