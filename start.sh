#!/bin/bash
cd "$(dirname "$0")"

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "[start] LỖI: Docker chưa chạy. Vui lòng start Docker trước."
    exit 1
fi

# Detect GPU
if docker run --rm --gpus all alpine echo ok >/dev/null 2>&1; then
    echo "[start] Phát hiện GPU - chế độ GPU"
    docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
else
    echo "[start] Không có GPU - chế độ CPU"
    docker compose up -d --build
fi

if [ $? -eq 0 ]; then
    echo
    echo "[start] Hệ thống đã khởi động. Mở http://localhost"
fi