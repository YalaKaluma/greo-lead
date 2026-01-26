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
# Frontend build
# --------------------
WORKDIR /app/frontend

COPY app/frontend/package.json ./
COPY app/frontend/package-lock.json ./
RUN npm install

COPY app/frontend/ ./
RUN npm run build

# --------------------
# Detect frontend output reliably
# --------------------
WORKDIR /app

RUN echo "🔍 Detecting frontend build output..." && \
    ls -lh /app/frontend && \
    if [ -d /app/frontend/dist ]; then \
        echo "✅ Using dist/"; \
        mkdir -p /app/static && cp -r /app/frontend/dist/* /app/static/; \
    elif [ -d /app/frontend/build ]; then \
        echo "✅ Using build/"; \
        mkdir -p /app/static && cp -r /app/frontend/build/* /app/static/; \
    else \
        echo "❌ No frontend build output found"; \
        echo "Contents of /app/frontend:"; \
        ls -lh /app/frontend; \
        exit 1; \
    fi

# --------------------
# Backend code
# --------------------
COPY app/ ./app

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
