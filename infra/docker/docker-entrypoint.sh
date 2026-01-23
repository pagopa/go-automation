#!/bin/sh
set -e

# ============================================
# GO Automation - Runtime Entrypoint
# Supports: once (default), cron, shell
# ============================================

echo "=== GO Automation Container ==="
echo "Date: $(date)"
echo "Mode: ${RUN_MODE:-once}"
echo "User: $(whoami)"
echo "Workdir: $(pwd)"
echo ""

case "${RUN_MODE:-once}" in
    once)
        # Single execution mode
        # Accepts optional CLI arguments
        if [ $# -eq 0 ]; then
            echo "Executing: node dist/index.js"
            echo "-----------------------------------"
            exec node dist/index.js
        else
            echo "Executing: node dist/index.js $@"
            echo "-----------------------------------"
            exec node dist/index.js "$@"
        fi
        ;;

    cron)
        # Scheduled execution mode using Node.js croner
        if [ -z "$CRON_SCHEDULE" ]; then
            echo "Error: RUN_MODE=cron requires CRON_SCHEDULE env var"
            exit 1
        fi
        echo "Starting cron scheduler..."
        echo "Schedule: $CRON_SCHEDULE"
        echo "-----------------------------------"
        exec node dist/cron.js
        ;;

    shell)
        # Interactive shell for debugging
        echo "Starting shell..."
        exec /bin/sh
        ;;

    *)
        echo "Unknown RUN_MODE: $RUN_MODE"
        exit 1
        ;;
esac
