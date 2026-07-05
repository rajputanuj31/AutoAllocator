#!/usr/bin/env bash
# Run on EC2 after each git push:  cd ~/autoallocator && ./scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pulling latest from origin/main..."
git fetch origin main
git reset --hard origin/main

echo "==> Backend..."
cd "$ROOT/backend"
source venv/bin/activate
pip install -r requirements.txt -q

echo "==> Frontend..."
cd "$ROOT/frontend"
npm ci --silent
npm run build

echo "==> Restarting services..."
sudo systemctl restart autoallocator autoallocator-web

echo "==> Done. $(date -u +%Y-%m-%dT%H:%M:%SZ)"
curl -sf http://127.0.0.1:8002/health && echo "" || echo "WARN: health check failed"
