@echo off
if /i not "%~1"=="run" start "KM Studio" cmd /k "%~f0" run & exit /b

chcp 65001 >nul 2>&1
title KM Studio - WhatsApp Recepcao

echo.
echo  Kleber Mendes Studio - Teste WhatsApp
echo  =====================================
echo.

cd /d "%~dp0server"
if errorlevel 1 goto erro_pasta

where node >nul 2>&1
if errorlevel 1 goto tentar_node

:node_ok
echo  Node:
node -v
echo.

if not exist .env goto criar_env
goto deps

:criar_env
if exist .env.example copy .env.example .env >nul
echo  Arquivo .env criado.
echo.

:deps
if exist node_modules goto iniciar

echo  Instalando dependencias...
set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
call npm install
if errorlevel 1 goto erro_npm
echo.

:liberar_porta
echo  Verificando porta 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo  Atualizando biblioteca WhatsApp...
set PUPPETEER_SKIP_DOWNLOAD=true
call npm install whatsapp-web.js@latest --no-audit --no-fund >nul 2>&1
echo.

:iniciar
echo  ============================================
echo   1. Escaneie o QR com o WhatsApp da RECEPCAO
echo   2. Aguarde: WhatsApp conectado
echo   3. Abra: http://localhost:3000/contato.html
echo   4. No form, use OUTRO numero como cliente
echo  ============================================
echo.

node index.js
goto fim

:tentar_node
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%" & goto node_ok
if exist "%LocalAppData%\Programs\node\node.exe" set "PATH=%LocalAppData%\Programs\node;%PATH%" & goto node_ok
echo  [ERRO] Node.js nao encontrado. Instale: https://nodejs.org
goto fim

:erro_pasta
echo  [ERRO] Nao encontrou a pasta server.
goto fim

:erro_npm
echo.
echo  [ERRO] npm install falhou.
echo  Abra PowerShell na pasta server e rode:
echo    npm config set strict-ssl false
echo    npm install
goto fim

:fim
echo.
pause
