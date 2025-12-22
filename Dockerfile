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

# DEBUG: Show what Vite actually built
RUN echo "=== VITE BUILD OUTPUT ===" && \
    find /app -name "index.html" -type f -exec ls -lh {} \; && \
    echo "=== CHECKING ../../static ===" && \
    ls -lah ../../static/ && \
    echo "=== CHECKING /app/static ===" && \
    ls -lah /app/static/

# CRITICAL: Make absolutely sure the built files are in /app/static/
RUN if [ ! -f "/app/static/index.html" ]; then \
        echo "ERROR: index.html not found in /app/static!"; \
        echo "Searching for built files..."; \
        find /app -name "*.js" -o -name "*.css" | grep -E "(assets|dist|build)" | head -20; \
        exit 1; \
    fi

# Verify the built index.html is not the template
RUN SIZE=$(wc -c < /app/static/index.html) && \
    echo "index.html size: $SIZE bytes" && \
    if [ "$SIZE" -lt 1000 ]; then \
        echo "ERROR: index.html is too small ($SIZE bytes)!"; \
        echo "Content:"; \
        cat /app/static/index.html; \
        exit 1; \
    fi

# Show success
RUN echo "✓ Frontend built successfully" && \
    echo "✓ index.html size: $(wc -c < /app/static/index.html) bytes" && \
    echo "✓ Assets:" && \
    ls -lh /app/static/assets/

WORKDIR /app
EXPOSE 8080
