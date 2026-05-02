# install-docker.ps1
# Instala Docker Desktop en Windows 11. Requiere admin (UAC popup).
# Uso: clic derecho → "Ejecutar con PowerShell"
#
# Lo que hace:
#   1. Habilita WSL2 + VirtualMachinePlatform si no están.
#   2. Lanza el installer de Docker Desktop con --quiet --accept-license.
#   3. Te pide reinicio si Windows lo necesita.
#
# El installer asumido vive en C:\dev\downloads\Docker Desktop Installer.exe
# (ya descargado por el flujo automatizado de Claude).

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Re-lanzando como admin..." -ForegroundColor Yellow
    Start-Process pwsh -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$installer = "C:\dev\downloads\Docker Desktop Installer.exe"
if (-not (Test-Path $installer)) {
    Write-Host "Descargando Docker Desktop installer..." -ForegroundColor Cyan
    $tmp = "C:\dev\downloads"
    if (-not (Test-Path $tmp)) { New-Item -ItemType Directory -Path $tmp | Out-Null }
    Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile $installer -UseBasicParsing
}

Write-Host "Habilitando WSL2 + VirtualMachinePlatform..." -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null

Write-Host "Instalando WSL kernel update..." -ForegroundColor Cyan
wsl --install --no-distribution --no-launch 2>&1 | Out-String | Write-Host

Write-Host "Instalando Docker Desktop (silent)..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $installer -ArgumentList 'install','--quiet','--accept-license','--installation-dir=C:\Program Files\Docker' -Wait -PassThru
Write-Host "Installer exit code: $($proc.ExitCode)"

if ($proc.ExitCode -eq 3010) {
    Write-Host "REINICIO REQUERIDO. Después del reinicio:" -ForegroundColor Yellow
    Write-Host "  1. Lanza 'Docker Desktop' desde el menú inicio." -ForegroundColor Yellow
    Write-Host "  2. Acepta los términos." -ForegroundColor Yellow
    Write-Host "  3. Espera a que el daemon arranque (icono whale en barra de tareas)." -ForegroundColor Yellow
    Write-Host "  4. Verifica con: docker version" -ForegroundColor Yellow
    Write-Host "  5. Cd al repo: cd C:\dev\axie-duel; pnpm docker:up; pnpm db:migrate; pnpm db:seed" -ForegroundColor Yellow
} elseif ($proc.ExitCode -eq 0) {
    Write-Host "Instalado correctamente. Lanza Docker Desktop desde el menú inicio." -ForegroundColor Green
} else {
    Write-Host "Error inesperado: $($proc.ExitCode)" -ForegroundColor Red
}

Read-Host "Presiona Enter para cerrar"
