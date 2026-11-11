FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xauth libgtk-3-0 libnss3 libasound2 libgbm1 \
    && rm -rf /var/lib/apt/lists/*
