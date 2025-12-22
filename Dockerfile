FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app
COPY . .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

WORKDIR /app/app/frontend

# Show directory structure BEFORE build
RUN echo "=== BEFORE BUILD ===" && \
    echo "Current dir:" && pwd && \
    echo "Parent dir:" && ls -la ../ && \
    echo "Grandparent dir:" && ls -la ../../

RUN npm install

# Run build and capture ALL output
RUN npm run build 2>&1 | tee /tmp/build.log

# Show directory structure AFTER build  
RUN echo "=== AFTER BUILD ===" && \
    echo "=== ALL index.html files ===" && \
    find /app -name "index.html" -exec echo "Found: {}" \; -exec ls -lh {} \; -exec head -5 {} \; && \
    echo "=== ALL .js files in assets ===" && \
    find /app -path "*/assets/*.js" -exec ls -lh {} \; && \
    echo "=== ALL .css files ===" && \
    find /app -name "*.css" -exec ls -lh {} \; && \
    echo "=== /app/static contents ===" && \
    ls -laR /app/static/ || echo "NO /app/static directory!" && \
    echo "=== /app/app/static contents ===" && \
    ls -laR /app/app/static/ || echo "NO /app/app/static directory!" && \
    echo "=== Vite build log ===" && \
    cat /tmp/build.log

WORKDIR /app
EXPOSE 8080
