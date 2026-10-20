# Prepara o ambiente e arranca o Andaime em modo de desenvolvimento.
#
#   powershell -ExecutionPolicy Bypass -File scripts/arrancar.ps1 [-Porta 5173] [-Abrir] [-Reconstruir]
#
#   (sem opções)  PostgreSQL, Mailpit e API no Docker do WSL + frontend real em http://localhost:5173
#   -Reconstruir  volta a construir a imagem da API (depois de mudar o código do backend)
param(
  [int]$Porta = 5173,
  [switch]$Abrir,
  [switch]$Reconstruir
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# Node: a versão mínima vem do .nvmrc
$necessaria = [int](Get-Content .nvmrc -Raw).Trim()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node não encontrado. Instale o Node $necessaria (winget install OpenJS.NodeJS.LTS)."
}
$atual = [int]((node -v).TrimStart('v').Split('.')[0])
if ($atual -lt $necessaria) {
  Write-Error "Node $atual encontrado; é preciso o Node $necessaria ou superior (ver .nvmrc)."
}

# Dependências: reinstala se faltarem ou se o package-lock.json mudou desde a última instalação
$marca = 'node_modules/.package-lock.json'
if (-not (Test-Path $marca) -or (Get-Item package-lock.json).LastWriteTime -gt (Get-Item $marca).LastWriteTime) {
  Write-Host 'A instalar dependências (npm ci)...'
  npm ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Servidor: PostgreSQL, Mailpit e API no Docker do WSL (projeto Compose "andaime"; não mexe noutros projetos).
if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
  Write-Error 'WSL não encontrado. O servidor do Andaime corre no Docker dentro do WSL (ver docs/backend/estado.md).'
}
$compose = @('-d', 'Ubuntu', '--', 'docker', 'compose', '-f', 'infra/compose.yaml', 'up', '-d')
if ($Reconstruir) { $compose += '--build' }
Write-Host 'A arrancar PostgreSQL, Mailpit e API (Docker no WSL)...'
& wsl @compose
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host -NoNewline 'A aguardar a API em http://localhost:8088'
$pronta = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $resposta = Invoke-RestMethod -Uri 'http://localhost:8088/actuator/health/readiness' -TimeoutSec 2
    if ($resposta.status -eq 'UP') { $pronta = $true; break }
  } catch { }
  Write-Host -NoNewline '.'
  Start-Sleep -Seconds 2
}
Write-Host ''
if (-not $pronta) {
  Write-Error 'A API não respondeu em 2 minutos. Ver: wsl -d Ubuntu -- docker logs andaime-backend'
}
Write-Host 'Emails de desenvolvimento: http://localhost:58035'

$argumentos = @('run', 'dev', '--', '--port', $Porta, '--strictPort')
if ($Abrir) { $argumentos += '--open' }
Write-Host "Andaime em http://localhost:$Porta (Ctrl+C para parar)"
npm @argumentos
