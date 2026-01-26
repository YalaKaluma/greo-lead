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
# Backend
# --------------------
WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --------------------
# Frontend build
# --------------------
WORKDIR /app/frontend

COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci

COPY app/frontend/ ./
RUN npm run build

# --------------------
# Move frontend build to static
# --------------------
WORKDIR /app
RUN mkdir -p /app/static && \
    cp -r /app/frontend/dist/* /app/static/

# --------------------
# Copy backend code
# --------------------
COPY app/ ./app

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
