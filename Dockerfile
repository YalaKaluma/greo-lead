# Use an official Python base image
FROM python:3.11-slim

# Install Node.js (for building React)
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

# Set working directory
WORKDIR /app

# Copy all source code
COPY . .

# Install Python dependencies
RUN pip install --upgrade pip && pip install -r requirements.txt

# Build the React frontend
WORKDIR /app/frontend
RUN npm install && npm run build

# Copy build output to FastAPI static folder
RUN mkdir -p /app/static && cp -r dist/* /app/static/

# Go back to app root
WORKDIR /app

# Expose the port
EXPOSE 8080

# Start FastAPI using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
