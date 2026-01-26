FROM python:3.11-slim

# --------------------
# System deps + Node 20 LTS
# --------------------
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

# --------------------
# Backend setup
# --------------------
WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --------------------
# Frontend build
# --------------------
WORKDIR /app/app/frontend
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci

COPY app/frontend/ ./
RUN npm run build

# --------------------
# Copy frontend build to static
# --------------------
WORKDIR /app
RUN mkdir -p /app/static && \
    cp -r /app/app/frontend/dist/* /app/static/

# --------------------
# Copy backend code last
# --------------------
COPY app/ ./app

EXPOSE 8080
