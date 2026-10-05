FROM python:3.10-slim

# Install system dependencies including ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install python packages
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Environment variables
ENV PYTHONUNBUFFERED=1

# Run gunicorn on port 10000
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "app:app", "--timeout", "600", "--workers", "2"]
