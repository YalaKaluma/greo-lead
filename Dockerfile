FROM python:3.11-slim

# Install system deps + Node
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# Copy entire repo
COPY . .

# Install Python deps
RUN pip install --upgrade pip && pip install -r requirements.txt

# Build React frontend
WORKDIR /app/app/frontend
RUN npm install && npm run build

# Copy built frontend into FastAPI static folder
RUN rm -rf /app/static && \
    mkdir -p /app/static && \
    cp -r dist/* /app/static/

# Back to backend
WORKDIR /app

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
