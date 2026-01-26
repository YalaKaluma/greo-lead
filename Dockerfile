# ================================
# Base image
# ================================
FROM python:3.11-slim

# ================================
# Install system dependencies
# ================================
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ================================
# Backend setup
# ================================
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ================================
# Frontend build (Vite)
# ================================
WORKDIR /app/app/frontend

# Install frontend deps
COPY app/frontend/package.json ./
RUN npm install

# Copy frontend source
COPY app/frontend/ ./

# Build frontend
RUN npm run build

# ================================
# Move Vite build → backend static
# ================================
WORKDIR /app
RUN rm -rf /app/static && \
    mkdir -p /app/static && \
    cp -r /app/app/frontend/dist/* /app/static/

# ================================
# Copy backend code
# ================================
COPY app/ ./app

# ================================
# Debug proof (keep for 1 deploy)
# ================================
RUN echo "==== STATIC CONTENT ====" && \
    ls -lh /app/static && \
    echo "==== BUILD TIMESTAMP ====" && \
    date

# ================================
# Runtime
# ================================
EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
