@echo off
title Publicar no Netlify via Git
cd /d "%~dp0"

echo.
echo  Arquivos que NAO devem ir pro Git/Netlify:
echo  - server/data/wweb-session  (causa erro DIPS-wal)
echo  - server/node_modules
echo.
echo  Este script adiciona so o site + netlify/functions
echo.

git status
echo.
echo  Se aparecer server/data ou node_modules, NAO faca commit deles.
echo.
pause

git add index.html sobre.html resultados.html contato.html
git add logo.png kleber.png Academia.png resultados.jpg 2>nul
git add netlify.toml netlify netlify/functions
git add .gitignore .netlifyignore
git status

echo.
set /p MSG= Mensagem do commit (ex: site km studio): 
if "%MSG%"=="" set MSG=atualiza site

git commit -m "%MSG%"
echo.
echo  Agora envie:  git push
echo  O Netlify atualiza sozinho se estiver ligado ao GitHub.
echo.
pause
