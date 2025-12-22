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

# Show EVERYTHING for debugging
RUN echo "=== PWD ===" && pwd
RUN echo "=== ALL FILES ===" && ls -laR
RUN echo "=== CHECKING SRC ===" && ls -la src/ || echo "NO SRC DIR"
RUN echo "=== CHECKING SRC/MAIN.JSX ===" && cat src/main.jsx || echo "NO MAIN.JSX"
RUN echo "=== PACKAGE.JSON ===" && cat package.json
RUN echo "=== VITE.CONFIG.JS ===" && cat vite.config.js
RUN echo "=== INDEX.HTML ===" && cat index.html

# Install npm packages
RUN echo "=== INSTALLING NPM PACKAGES ===" && \
    npm install

# Build with maximum verbosity
RUN echo "=== STARTING VITE BUILD ===" && \
    npm run build -- --logLevel verbose 2>&1 | tee /tmp/build.log || \
    (echo "=== BUILD FAILED ===" && cat /tmp/build.log && exit 1)

# Show what was built
RUN echo "=== BUILD OUTPUT ===" && \
    ls -laR ../../static/

# Verify critical files
RUN ls -la /app/static/index.html && \
    wc -c /app/static/index.html && \
    echo "=== BUILT INDEX.HTML CONTENT ===" && \
    cat /app/static/index.html

WORKDIR /app
EXPOSE 8080
