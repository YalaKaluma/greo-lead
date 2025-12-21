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
RUN pip install --upgrade pip && pip install -r requirements.txt

# Build frontend
WORKDIR /app/frontend
RUN npm install && npm run build

# Build output goes to /app/static (configured in vite.config.js)
# Verify it exists
RUN ls -la /app/static || echo "WARNING: Static files not found!"

# Return to app root
WORKDIR /app

# Expose port (Railway uses PORT env var, but 8080 is default)
EXPOSE 8080

# Start FastAPI server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
