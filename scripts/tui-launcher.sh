#!/bin/bash
#
# OpenClaw TUI Launcher
# Auto-detects gateway port and launches the terminal UI
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18889}"
GATEWAY_HOST="${OPENCLAW_GATEWAY_HOST:-127.0.0.1}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$HOME/.openclaw/openclaw.json}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect gateway port from config
detect_gateway_port() {
    if [[ -f "$CONFIG_PATH" ]]; then
        local detected_port
        detected_port=$(python3 -c "
import json
import sys
try:
    with open('$CONFIG_PATH') as f:
        config = json.load(f)
        print(config.get('gateway', {}).get('port', $GATEWAY_PORT))
except Exception:
    print($GATEWAY_PORT)
" 2>/dev/null)
        if [[ -n "$detected_port" ]]; then
            GATEWAY_PORT="$detected_port"
            log_info "Detected gateway port from config: $GATEWAY_PORT"
        fi
    fi
}

# Check if gateway is running
check_gateway() {
    local gateway_url="ws://${GATEWAY_HOST}:${GATEWAY_PORT}"
    log_info "Checking gateway at $gateway_url..."

    if curl -sf "http://${GATEWAY_HOST}:${GATEWAY_PORT}/health" >/dev/null 2>&1 || \
       nc -z "$GATEWAY_HOST" "$GATEWAY_PORT" 2>/dev/null; then
        log_success "Gateway is running on port $GATEWAY_PORT"
        return 0
    else
        log_warn "Gateway not responding on port $GATEWAY_PORT"
        return 1
    fi
}

# Start gateway if not running
start_gateway() {
    log_info "Attempting to start gateway..."

    # Check if launchctl service exists
    if launchctl list | grep -q "ai.openclaw.gateway"; then
        log_info "Found launchctl service, starting..."
        launchctl start gui/$(id -u)/ai.openclaw.gateway
        sleep 2

        if check_gateway; then
            return 0
        fi
    fi

    # Fallback: start gateway directly
    log_info "Starting gateway via CLI..."
    openclaw gateway --port "$GATEWAY_PORT" &
    local pid=$!
    sleep 3

    if kill -0 "$pid" 2>/dev/null && check_gateway; then
        log_success "Gateway started (PID: $pid)"
        return 0
    else
        log_error "Failed to start gateway"
        return 1
    fi
}

# Launch TUI
launch_tui() {
    local gateway_url="ws://${GATEWAY_HOST}:${GATEWAY_PORT}"
    log_info "Launching OpenClaw TUI..."
    log_info "Gateway URL: $gateway_url"

    # Try different TUI launch methods
    if command -v openclaw >/dev/null 2>&1; then
        log_info "Using openclaw CLI..."
        exec openclaw tui --gateway "$gateway_url"
    elif npx openclaw tui --gateway "$gateway_url" 2>/dev/null; then
        log_info "Using npx openclaw..."
        exec npx openclaw tui --gateway "$gateway_url"
    else
        log_error "Could not launch TUI. Make sure openclaw is installed."
        log_info "Install with: npm install -g openclaw"
        exit 1
    fi
}

# Main
main() {
    echo -e "${GREEN}"
    cat <<'EOF'
   ____                   ___________      .__  .__
  / __ \____  ___  ____   \_   _____/_____ |  | |  |
 / / / / __ \/ _ \/ __ \   |    __)_\____ \|  | |  |
/ /_/ / /_/ /  __/ / / /   |        \  |_> >  |_|  |__
\____/ .___/\___/_/ /_/   /_______  /   __/|____/____/
    /_/                           \/|__|
EOF
    echo -e "${NC}"

    log_info "OpenClaw TUI Launcher v1.0"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --port|-p)
                GATEWAY_PORT="$2"
                shift 2
                ;;
            --host|-h)
                GATEWAY_HOST="$2"
                shift 2
                ;;
            --config|-c)
                CONFIG_PATH="$2"
                shift 2
                ;;
            --no-start)
                NO_START_GATEWAY=1
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  -p, --port PORT       Gateway port (default: auto-detect or 18889)"
                echo "  -h, --host HOST       Gateway host (default: 127.0.0.1)"
                echo "  -c, --config PATH     Config file path"
                echo "  --no-start            Don't start gateway if not running"
                echo "  --help                Show this help"
                exit 0
                ;;
            *)
                log_warn "Unknown option: $1"
                shift
                ;;
        esac
    done

    # Detect port from config
    detect_gateway_port

    # Check gateway
    if ! check_gateway; then
        if [[ -z "${NO_START_GATEWAY:-}" ]]; then
            if ! start_gateway; then
                log_error "Cannot connect to gateway. Start it manually with:"
                log_info "  openclaw gateway --port $GATEWAY_PORT"
                exit 1
            fi
        else
            log_error "Gateway not running and --no-start specified"
            exit 1
        fi
    fi

    # Launch TUI
    launch_tui
}

main "$@"
