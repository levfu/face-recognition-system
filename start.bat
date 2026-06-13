@echo off
cd /d %~dp0

REM Check Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [start] LOI: Docker Desktop chua chay. Vui long mo Docker Desktop truoc.
    pause
    exit /b 1
)

REM Detect GPU
docker run --rm --gpus all alpine echo ok >nul 2>&1
if %errorlevel%==0 (
    echo [start] Phat hien GPU - che do GPU
    docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
) else (
    echo [start] Khong co GPU - che do CPU
    docker compose up -d --build
)

if %errorlevel%==0 (
    echo.
    echo [start] He thong da khoi dong. Mo http://localhost de truy cap Kiosk.
) else (
    echo.
    echo [start] LOI khi khoi dong. Xem log: docker compose logs
)
pause