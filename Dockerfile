FROM python:3.11-slim

# Install Node.js (18.x) + system deps
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Backend setup
WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Frontend build
WORKDIR /app/app/frontend
COPY app/frontend/package.json ./
RUN npm install
COPY app/frontend/ ./
RUN npm run build

# Copy backend app
WORKDIR /app
COPY app/ ./app

# Move frontend build to static
RUN rm -rf /app/static && \
    mkdir -p /app/static && \
    cp -r /app/app/frontend/dist/* /app/static/

# Debug / visibility (matches your logs)
RUN echo "==== STATIC CONTENT ====" && \
    ls -lh /app/static && \
    echo "==== BUILD TIMESTAMP ====" && \
    date
