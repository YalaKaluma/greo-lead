FROM python:3.11-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

# Set working directory
WORKDIR /app

# Copy everything from your project root
COPY . .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Build frontend
# Frontend is at /app/frontend
# Vite.config.js outputs to ../static (which becomes /app/static)
WORKDIR /app/frontend
RUN npm install && \
    npm run build

# Verify build output exists
RUN ls -la /app/static/index.html && \
    echo "✓ Frontend built successfully"

# Return to app root
WORKDIR /app

# Expose port (Railway will set PORT env var)
EXPOSE 8080

# Start server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
