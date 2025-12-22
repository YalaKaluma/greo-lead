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
WORKDIR /app/app/frontend

# DEBUG: Show what files exist
RUN echo "=== Files in frontend directory ===" && \
    ls -la

# DEBUG: Show what's in index.html
RUN echo "=== Contents of index.html ===" && \
    cat index.html

# DEBUG: Show what's in main.jsx
RUN echo "=== First 10 lines of main.jsx ===" && \
    head -10 main.jsx || echo "main.jsx not found"

# Install and build with verbose output
RUN npm install && \
    echo "=== Running npm run build ===" && \
    npm run build --verbose

# DEBUG: Show what was built
RUN echo "=== Contents of ../../static/ ===" && \
    ls -la ../../static/

# DEBUG: Show the built index.html
RUN echo "=== Built index.html ===" && \
    cat ../../static/index.html

# Verify build output
RUN ls -la /app/static/index.html && \
    echo "✓ Frontend built successfully"

# Return to app root
WORKDIR /app

# Expose port
EXPOSE 8080

# No CMD - let Procfile handle it
