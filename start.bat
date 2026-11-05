@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================
echo   方块世界生成器 - 本地启动
echo ================================
where python >nul 2>nul
if %errorlevel%==0 (
  echo 正在启动: http://127.0.0.1:8137
  start "" http://127.0.0.1:8137/index.html
  python -m http.server 8137 --bind 127.0.0.1
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  echo 正在启动: http://127.0.0.1:8137
  start "" http://127.0.0.1:8137/index.html
  py -m http.server 8137 --bind 127.0.0.1
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  echo 正在启动: http://127.0.0.1:8137
  start "" http://127.0.0.1:8137/index.html
  npx -y http-server -p 8137 -a 127.0.0.1 --silent
  goto :eof
)
echo 未找到 Python 或 Node.js，请任装其一后重试。
echo （也可以使用任何静态文件服务器托管本目录）
pause
