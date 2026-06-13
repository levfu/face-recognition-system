# backend/Dockerfile

FROM python:3.10-slim

# Cài thư viện hệ thống cần thiết cho OpenCV + DeepFace
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Unbuffer Python stdout/stderr so prints appear immediately in docker logs
ENV PYTHONUNBUFFERED=1

# Thư mục làm việc
WORKDIR /app
RUN mkdir -p /app/models

# Copy requirements trước (tận dụng Docker cache)
COPY requirements.txt .

# Cài torch + torchvision bản CUDA 12.1 TRƯỚC requirements.txt
# (nếu đặt sau, pip thấy 2.2.2 đã thỏa mãn → giữ CPU wheel)
RUN pip install --default-timeout=1000 --no-cache-dir torch==2.2.2 torchvision==0.17.2 \
    --index-url https://download.pytorch.org/whl/cu121

# Cài phần còn lại (torch đã ở bản CUDA → pip giữ nguyên)
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

# Verify torch CUDA được cài đúng (sẽ báo lỗi build nếu sai)
RUN python -c "import torch; v = torch.__version__; print('[Verify] torch:', v); assert '+cu' in v, f'CUDA wheel not installed: {v}'"

# Copy toàn bộ source code
COPY . .

# Expose port
EXPOSE 8000

# Chạy FastAPI
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
