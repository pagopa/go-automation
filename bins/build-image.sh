#!/bin/bash
set -e

# ============================================================================
# GO Automation - Docker Image Builder
# Creates a standalone artifact and builds a Docker image for a specific script
# ============================================================================

SCRIPT_NAME="$1"
TAG="${2:-latest}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

if [[ -z "$SCRIPT_NAME" ]]; then
  echo -e "${RED}Error: Script name is required${NC}"
  echo "Usage: ./bins/build-image.sh <script-name> [tag]"
  echo "Example: ./bins/build-image.sh go-report-alarms v1.0.0"
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT="$PROJECT_ROOT/bins/deploy.sh"
DOCKERFILE="$PROJECT_ROOT/infra/docker/Dockerfile.runtime"
ARTIFACT_DIR="$PROJECT_ROOT/artifacts/$SCRIPT_NAME"

echo -e "${BLUE}=== 🐳 Building Docker Image for ${SCRIPT_NAME} ===${NC}"

# Check if script exists in repo (quick check)
if ! find "$PROJECT_ROOT/scripts" -name "$SCRIPT_NAME" | grep -q "$SCRIPT_NAME"; then
    echo -e "${RED}Error: Script '$SCRIPT_NAME' not found in scripts/ directory.${NC}"
    exit 1
fi

# 1. Generate the standalone artifact (Clean + Prod mode)
echo ""
echo -e "${GREEN}--- Step 1: Generating Artifact ---${NC}"
# Run deploy.sh in non-interactive mode
"$DEPLOY_SCRIPT" --script "$SCRIPT_NAME" --prod --clean

# Verify artifact exists
if [[ ! -d "$ARTIFACT_DIR" ]]; then
    echo -e "${RED}Error: Artifact creation failed. Directory $ARTIFACT_DIR not found.${NC}"
    exit 1
fi

# Copy docker/ directory into artifact so Dockerfile can access entrypoint
cp -r "$PROJECT_ROOT/infra/docker" "$ARTIFACT_DIR/"

# 2. Build the Docker image
echo ""
echo -e "${GREEN}--- Step 2: Building Container ---${NC}"
echo "Context: $ARTIFACT_DIR"
echo "Tag:     go-automation/$SCRIPT_NAME:$TAG"
echo ""

docker build \
  -f "$DOCKERFILE" \
  -t "go-automation/$SCRIPT_NAME:$TAG" \
  "$ARTIFACT_DIR"

echo ""
echo -e "${GREEN}✅ Image built successfully:${NC}"
echo -e "   go-automation/$SCRIPT_NAME:$TAG"
echo ""
echo -e "To run locally:"
echo -e "   docker run --rm -it go-automation/$SCRIPT_NAME:$TAG"