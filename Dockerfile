FROM python:3.11-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app
COPY . .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Build frontend
WORKDIR /app/app/frontend
RUN npm install
RUN npm run build

# Verify build succeeded
RUN ls -lh /app/static/index.html && \
    ls -lh /app/static/assets/ && \
    echo "✓ Frontend built successfully"

WORKDIR /app
EXPOSE 8080
