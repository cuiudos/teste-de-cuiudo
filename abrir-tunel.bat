@echo off
title KM Studio - Tunel (Cloudflare)
cd /d "%~dp0tools"

if not exist cloudflared.exe (
  echo Baixando cloudflared...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe' -UseBasicParsing"
  if errorlevel 1 (
    echo ERRO ao baixar. Baixe manualmente em:
    echo https://github.com/cloudflare/cloudflared/releases
    pause
    exit /b 1
  )
)

echo.
echo  ANTES: rode iniciar-teste.bat e aguarde WhatsApp conectado
echo.
echo  Copie a URL https://....trycloudflare.com que aparecer abaixo
echo  e coloque no Netlify em WHATSAPP_BRIDGE_URL
echo.
echo ============================================
echo.

cloudflared.exe tunnel --url http://localhost:3000

pause
