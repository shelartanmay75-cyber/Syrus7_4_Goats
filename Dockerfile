# Root Dockerfile for Render / Docker deployments
FROM python:3.13-slim

WORKDIR /app

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reliable package installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy and install backend dependencies
COPY backend/requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# Copy backend application and data snapshots
COPY backend/qportfolio ./qportfolio
COPY backend/data ./data

ENV PYTHONUNBUFFERED=1
ENV PYTHONUTF8=1
ENV PORT=8000
ENV CORS_ORIGINS="*"

EXPOSE 8000

CMD ["sh", "-c", "uvicorn qportfolio.api.main:app --host 0.0.0.0 --port ${PORT}"]
