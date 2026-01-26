FROM python:3.11-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# --------------------
# 1️⃣ Python dependencies
# --------------------
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --------------------
# 2️⃣ Frontend dependencies + build (Vite)
# --------------------
WORKDIR /app/app/frontend

# copy only what npm needs first (cache-safe)
COPY app/frontend/package.json ./
RUN npm install

# copy the rest of the frontend
COPY app/frontend/ ./
RUN npm run build

# --------------------
# 3️⃣ Backend code
# --------------------
WORKDIR /app
COPY app/ ./app

# Debug proof (keep for this deploy)
RUN ls -lh /app/static && \
    echo "Frontend build timestamp:" && date

EXPOSE 8080
