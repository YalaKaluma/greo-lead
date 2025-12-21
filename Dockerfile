FROM python:3.11-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# Copy everything
COPY . .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Build frontend
# Your structure: /app/app/frontend/ (frontend is inside app/ directory)
WORKDIR /app/app/frontend
RUN npm install && \
    npm run build

# Verify build output exists at /app/static/
RUN ls -la /app/static/index.html && \
    echo "✓ Frontend built successfully"

# Return to app root
WORKDIR /app

# Expose port
EXPOSE 8080

# Start server
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}