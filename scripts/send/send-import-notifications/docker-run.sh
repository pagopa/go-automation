#!/bin/bash
# =============================================================================
# Docker Helper Script - send-import-notifications
# =============================================================================
# Simplifies running the Docker container with common configurations
#
# Usage:
#   ./docker-run.sh                     # Interactive mode
#   ./docker-run.sh build               # Build image
#   ./docker-run.sh run                 # Run with defaults
#   ./docker-run.sh dry-run             # Test without sending
#   ./docker-run.sh shell               # Interactive shell
#   ./docker-run.sh logs                # View logs
#
# Examples:
#   ./docker-run.sh run notifications.csv
#   ./docker-run.sh dry-run batch-001.csv
#   ./docker-run.sh run --concurrency 10
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$SCRIPT_DIR/../../../data/send-import-notifications" && pwd)"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    if [ ! -f "$SCRIPT_DIR/.env.docker" ]; then
        log_warning ".env.docker not found"
        log_info "Creating from template..."
        cp "$SCRIPT_DIR/.env.docker.example" "$SCRIPT_DIR/.env.docker"
        log_warning "Please edit .env.docker and add your PN_API_KEY"
        exit 1
    fi
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."
    cd "$SCRIPT_DIR"
    docker compose build
    log_success "Image built successfully"
}

# Run with defaults from config
run_default() {
    log_info "Running with defaults from config.yaml..."
    cd "$SCRIPT_DIR"
    docker compose run --rm app "$@"
}

# Dry-run mode (no actual sending)
run_dry() {
    local csv_file="${1:-inputs/notifications.csv}"
    log_info "Running in DRY-RUN mode (no notifications sent)"
    log_info "CSV file: $csv_file"

    cd "$SCRIPT_DIR"
    docker compose run --rm app node dist/index.js \
        --csv.file "$csv_file" \
        --send.notifications false \
        --poll.for.iun false \
        "${@:2}"

    log_success "Dry-run completed"
}

# Production run
run_production() {
    local csv_file="${1:-inputs/notifications.csv}"
    log_warning "⚠️  PRODUCTION MODE - Will send real notifications!"
    log_info "CSV file: $csv_file"

    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        exit 0
    fi

    cd "$SCRIPT_DIR"
    docker compose run --rm app node dist/index.js \
        --csv.file "$csv_file" \
        --send.notifications true \
        --poll.for.iun true \
        "${@:2}"

    log_success "Production run completed"
}

# Interactive shell
run_shell() {
    log_info "Opening interactive shell..."
    cd "$SCRIPT_DIR"
    docker compose run --rm app /bin/sh
}

# View logs
view_logs() {
    log_info "Latest execution logs:"
    if [ -d "$DATA_DIR/outputs" ]; then
        local latest_log=$(find "$DATA_DIR/outputs" -name "execution.log" -type f -print0 | xargs -0 ls -t | head -1)
        if [ -n "$latest_log" ]; then
            tail -f "$latest_log"
        else
            log_warning "No log files found"
        fi
    else
        log_warning "Outputs directory not found: $DATA_DIR/outputs"
    fi
}

# List input files
list_inputs() {
    log_info "Available input files:"
    if [ -d "$DATA_DIR/inputs" ]; then
        ls -lh "$DATA_DIR/inputs"/*.csv 2>/dev/null || log_warning "No CSV files found in inputs/"
    else
        log_warning "Inputs directory not found: $DATA_DIR/inputs"
    fi
}

# List outputs
list_outputs() {
    log_info "Recent outputs:"
    if [ -d "$DATA_DIR/outputs" ]; then
        ls -lhrt "$DATA_DIR/outputs" | tail -5
    else
        log_warning "Outputs directory not found: $DATA_DIR/outputs"
    fi
}

# Clean outputs (with confirmation)
clean_outputs() {
    log_warning "This will delete all output directories"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        exit 0
    fi

    rm -rf "$DATA_DIR/outputs/"*
    log_success "Outputs cleaned"
}

# Show help
show_help() {
    cat << EOF
${GREEN}Docker Helper - send-import-notifications${NC}

${BLUE}Usage:${NC}
  ./docker-run.sh [command] [options]

${BLUE}Commands:${NC}
  build                 Build Docker image
  run [csv] [args]      Run with defaults (interactive)
  dry-run [csv] [args]  Test run without sending
  prod [csv] [args]     Production run (sends notifications)
  shell                 Open interactive shell
  logs                  View latest execution logs
  list-inputs           List available input CSV files
  list-outputs          Show recent outputs
  clean-outputs         Delete all output directories
  help                  Show this help

${BLUE}Examples:${NC}
  ./docker-run.sh build
  ./docker-run.sh dry-run notifications.csv
  ./docker-run.sh prod batch-001.csv --concurrency 10
  ./docker-run.sh run --csv.file inputs/test.csv --send.notifications false
  ./docker-run.sh shell
  ./docker-run.sh logs

${BLUE}Data Locations:${NC}
  Inputs:  $DATA_DIR/inputs/
  Outputs: $DATA_DIR/outputs/
  Config:  $DATA_DIR/configs/config.yaml

${BLUE}Environment:${NC}
  Config:  $SCRIPT_DIR/.env.docker

${YELLOW}Note:${NC} Edit .env.docker to set PN_API_KEY before running.

EOF
}

# Main script
main() {
    check_prerequisites

    local command="${1:-help}"
    shift || true

    case "$command" in
        build)
            build_image
            ;;
        run)
            run_default "$@"
            ;;
        dry-run|dryrun)
            run_dry "$@"
            ;;
        prod|production)
            run_production "$@"
            ;;
        shell|sh)
            run_shell
            ;;
        logs|log)
            view_logs
            ;;
        list-inputs|ls-inputs)
            list_inputs
            ;;
        list-outputs|ls-outputs)
            list_outputs
            ;;
        clean-outputs|clean)
            clean_outputs
            ;;
        help|-h|--help)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main
main "$@"
