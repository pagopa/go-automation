#!/bin/bash
set -e

# ============================================================================
# GO Automation - Docker Run Helper
# Manages docker-compose for individual scripts
# ============================================================================
#
# Usage:
#   ./bins/docker-run.sh <script-name> <command> [options]
#
# Commands:
#   run       - Run script once (interactive mode)
#   up        - Start container(s) in background
#   down      - Stop and remove container(s)
#   logs      - View container logs
#   shell     - Open interactive shell in container
#   ps        - List running containers
#   build     - Build image before running
#
# Options:
#   --scheduled   - Use scheduled profile (cron mode)
#   --follow, -f  - Follow logs (for 'logs' command)
#
# Examples:
#   ./bins/docker-run.sh send-monitor-tpp-messages run
#   ./bins/docker-run.sh send-monitor-tpp-messages up --scheduled
#   ./bins/docker-run.sh send-monitor-tpp-messages logs -f
#   ./bins/docker-run.sh send-monitor-tpp-messages build run
# ============================================================================

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Script name
SCRIPT_NAME="$1"
shift || true

# Parse arguments
COMMAND=""
SCHEDULED=false
FOLLOW=false
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --scheduled)
      SCHEDULED=true
      shift
      ;;
    --follow|-f)
      FOLLOW=true
      shift
      ;;
    run|up|down|logs|shell|ps|build)
      COMMAND="$1"
      shift
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

# Show usage if no script name
show_usage() {
  echo -e "${BLUE}GO Automation - Docker Run Helper${NC}"
  echo ""
  echo "Usage: ./bins/docker-run.sh <script-name> <command> [options]"
  echo ""
  echo "Commands:"
  echo "  run        Run script once (interactive mode)"
  echo "  up         Start container(s) in background"
  echo "  down       Stop and remove container(s)"
  echo "  logs       View container logs"
  echo "  shell      Open interactive shell in container"
  echo "  ps         List running containers"
  echo "  build      Build image then run (combines build-image.sh + run)"
  echo ""
  echo "Options:"
  echo "  --scheduled   Use scheduled profile (cron mode)"
  echo "  --follow, -f  Follow logs (for 'logs' command)"
  echo ""
  echo "Examples:"
  echo "  ./bins/docker-run.sh send-monitor-tpp-messages run"
  echo "  ./bins/docker-run.sh send-monitor-tpp-messages up --scheduled"
  echo "  ./bins/docker-run.sh send-monitor-tpp-messages logs -f"
  echo "  ./bins/docker-run.sh send-monitor-tpp-messages down --scheduled"
}

if [[ -z "$SCRIPT_NAME" ]]; then
  show_usage
  exit 1
fi

if [[ -z "$COMMAND" ]]; then
  echo -e "${RED}Error: Command is required${NC}"
  echo ""
  show_usage
  exit 1
fi

# Find script directory
SCRIPT_DIR=$(find "$PROJECT_ROOT/scripts" -type d -name "$SCRIPT_NAME" 2>/dev/null | head -1)

if [[ -z "$SCRIPT_DIR" ]]; then
  echo -e "${RED}Error: Script '$SCRIPT_NAME' not found in scripts/ directory${NC}"
  exit 1
fi

DOCKER_DIR="$SCRIPT_DIR/docker"

# Check if docker/ directory exists
if [[ ! -d "$DOCKER_DIR" ]]; then
  echo -e "${RED}Error: docker/ directory not found for '$SCRIPT_NAME'${NC}"
  echo -e "${YELLOW}Expected: $DOCKER_DIR${NC}"
  echo ""
  echo "To create docker configuration for this script, run:"
  echo "  mkdir -p $DOCKER_DIR"
  echo "  # Then create docker-compose.yml and .env.example"
  exit 1
fi

# Check if docker-compose.yml exists
if [[ ! -f "$DOCKER_DIR/docker-compose.yml" ]]; then
  echo -e "${RED}Error: docker-compose.yml not found in $DOCKER_DIR${NC}"
  exit 1
fi

# Check if .env exists, warn if not
if [[ ! -f "$DOCKER_DIR/.env" ]] && [[ -f "$DOCKER_DIR/.env.example" ]]; then
  echo -e "${YELLOW}Warning: .env file not found. Copy from .env.example:${NC}"
  echo "  cp $DOCKER_DIR/.env.example $DOCKER_DIR/.env"
  echo ""
fi

# Build compose command
COMPOSE_CMD="docker compose"
COMPOSE_OPTS=()

if [[ "$SCHEDULED" == true ]]; then
  COMPOSE_OPTS+=("--profile" "scheduled")
fi

# Change to docker directory
cd "$DOCKER_DIR"

echo -e "${BLUE}=== 🐳 Docker: $SCRIPT_NAME ===${NC}"
echo -e "Directory: $DOCKER_DIR"
echo -e "Command:   $COMMAND"
[[ "$SCHEDULED" == true ]] && echo -e "Profile:   scheduled (cron mode)"
echo ""

# Execute command
case "$COMMAND" in
  run)
    echo -e "${GREEN}Running script (once mode)...${NC}"
    $COMPOSE_CMD "${COMPOSE_OPTS[@]}" run --rm app "${EXTRA_ARGS[@]}"
    ;;

  up)
    if [[ "$SCHEDULED" == true ]]; then
      echo -e "${GREEN}Starting scheduled container (cron mode)...${NC}"
      $COMPOSE_CMD "${COMPOSE_OPTS[@]}" up -d scheduled
    else
      echo -e "${GREEN}Starting container...${NC}"
      $COMPOSE_CMD "${COMPOSE_OPTS[@]}" up -d "${EXTRA_ARGS[@]}"
    fi
    echo ""
    $COMPOSE_CMD "${COMPOSE_OPTS[@]}" ps
    ;;

  down)
    echo -e "${GREEN}Stopping container(s)...${NC}"
    $COMPOSE_CMD "${COMPOSE_OPTS[@]}" down "${EXTRA_ARGS[@]}"
    ;;

  logs)
    if [[ "$FOLLOW" == true ]]; then
      $COMPOSE_CMD "${COMPOSE_OPTS[@]}" logs -f "${EXTRA_ARGS[@]}"
    else
      $COMPOSE_CMD "${COMPOSE_OPTS[@]}" logs "${EXTRA_ARGS[@]}"
    fi
    ;;

  shell)
    echo -e "${GREEN}Opening shell...${NC}"
    $COMPOSE_CMD "${COMPOSE_OPTS[@]}" run --rm app /bin/sh
    ;;

  ps)
    $COMPOSE_CMD "${COMPOSE_OPTS[@]}" ps "${EXTRA_ARGS[@]}"
    ;;

  build)
    echo -e "${GREEN}Building image...${NC}"
    "$PROJECT_ROOT/bins/build-image.sh" "$SCRIPT_NAME" latest
    echo ""
    echo -e "${GREEN}Running script...${NC}"
    $COMPOSE_CMD "${COMPOSE_OPTS[@]}" run --rm app "${EXTRA_ARGS[@]}"
    ;;

  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}"
    show_usage
    exit 1
    ;;
esac
