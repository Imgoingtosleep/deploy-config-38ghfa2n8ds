# Exact patch version: a floating tag can silently change Python under the pinned packages
FROM python:3.10.21-slim

WORKDIR /app

# Install system dependencies (build-essential, libssl-dev, etc. for cryptography/paramiko)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    libffi-dev \
    iputils-ping \
    traceroute \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install the exact, tested versions (requirements.txt only holds the allowed ranges)
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock

# Copy application source
COPY . .

# Refuse to build an image whose paramiko cannot reach legacy switches (SHA-1 key exchange)
RUN python -m unittest discover -s tests -v

# Environment variables to avoid __pycache__ and enable real-time logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Expose backend port
EXPOSE 4050

# Run FastAPI app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4050", "--reload"]
