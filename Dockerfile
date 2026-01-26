FROM python:3.11-slim

# --------------------
# System deps + Node
# --------------------
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --------------------
# Backend deps
# --------------------
WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --------------------
# Frontend build FIRST
# Vite builds to /static (via ../../static from /app/frontend)
# --------------------
WORKDIR /app/frontend
COPY app/frontend/package.json ./
RUN npm install
COPY app/frontend/ ./
RUN npm run build

# --------------------
# Copy backend code AFTER frontend build
# --------------------
WORKDIR /app
COPY app/ ./app

# --------------------
# REPLACE static files: delete old, move new from /static to /app/static
# --------------------
RUN rm -rf /app/static && \
    mkdir -p /app/static && \
    mv /static/* /app/static/ 2>/dev/null || true

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]