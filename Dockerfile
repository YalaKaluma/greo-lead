FROM python:3.11-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# --------------------
# 1️⃣ Python deps first (cache-safe)
# --------------------
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --------------------
# 2️⃣ Frontend deps + build (ISOLATED)
# --------------------
WORKDIR /app/app/frontend
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm install

COPY app/frontend/ ./
RUN npm run build

# --------------------
# 3️⃣ Backend code LAST
# --------------------
WORKDIR /app
COPY app/ ./app
COPY static/ ./static  # only if you have static assets outside React

# Debug proof (keep for 1 deploy)
RUN ls -lh /app/static && \
    echo "Frontend build timestamp:" && date

EXPOSE 8080
