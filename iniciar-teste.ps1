# Alternativa se o .bat nao abrir — clique direito > Executar com PowerShell
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $root "server"

Set-Location $server

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[ERRO] Node.js nao instalado. Baixe em https://nodejs.org" -ForegroundColor Red
  Read-Host "Enter para sair"
  exit 1
}

if (-not (Test-Path .env)) { Copy-Item .env.example .env -ErrorAction SilentlyContinue }

if (-not (Test-Path node_modules)) {
  Write-Host "Instalando dependencias..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    npm config set strict-ssl false
    npm install
  }
}

Write-Host ""
Write-Host "1. Escaneie o QR com o WhatsApp da RECEPCAO"
Write-Host "2. Abra http://localhost:3000/contato.html"
Write-Host ""

node index.js

Read-Host "Enter para fechar"
