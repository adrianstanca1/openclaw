#!/bin/sh
# Docker entrypoint with restart loop for OpenClaw gateway
# The gateway's internal SIGUSR1 restart doesn't work in Docker containers
# This wrapper restarts the process when it exits with code 100 (restart request)

set -e

cd /app

while true; do
  echo "Starting OpenClaw gateway..."
  node openclaw.mjs gateway --allow-unconfigured --bind lan --port 3000
  EXIT_CODE=$?

  echo "Gateway exited with code: $EXIT_CODE"

  # Exit code 100 = restart requested by config reload
  # Any other code = actual exit (error or normal shutdown)
  if [ $EXIT_CODE -ne 100 ]; then
    echo "Exiting (non-restart exit code)"
    exit $EXIT_CODE
  fi

  echo "Restarting gateway (config reload requested)..."
  sleep 1
done
