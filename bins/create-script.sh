#!/bin/bash

# ============================================================================
# GO Automation - Script Scaffolding Tool
# Creates a new script in the monorepo with proper structure
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Unicode symbols
CHECK="${GREEN}✔${NC}"
ARROW="${CYAN}›${NC}"

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/script-templates"

# ============================================================================
# Interactive Menu Function
# ============================================================================

# Interactive arrow-key menu selector
# Usage: select_option "prompt" "${options[@]}"
# Returns: Selected index in $SELECTED_INDEX, selected value in $SELECTED_VALUE
select_option() {
    local prompt="$1"
    shift
    local options=("$@")
    local num_options=${#options[@]}
    local selected=0

    # Hide cursor
    tput civis

    # Trap to restore cursor on exit
    trap 'tput cnorm' EXIT

    # Print prompt
    echo -e "$prompt"
    echo -e "${DIM}(Use arrow keys to navigate, Enter to select)${NC}"
    echo ""

    # Function to draw menu
    draw_menu() {
        # Move cursor up to redraw menu
        for ((i = 0; i < num_options; i++)); do
            tput cuu1  # Move up one line
            tput el    # Clear line
        done

        # Draw each option
        for ((i = 0; i < num_options; i++)); do
            if [[ $i -eq $selected ]]; then
                echo -e "  ${CHECK}  ${BOLD}${options[$i]}${NC}"
            else
                echo -e "     ${DIM}${options[$i]}${NC}"
            fi
        done
    }

    # Initial draw
    for ((i = 0; i < num_options; i++)); do
        if [[ $i -eq $selected ]]; then
            echo -e "  ${CHECK}  ${BOLD}${options[$i]}${NC}"
        else
            echo -e "     ${DIM}${options[$i]}${NC}"
        fi
    done

    # Read input
    while true; do
        # Read a single character
        IFS= read -rsn1 key

        # Check for escape sequence (arrow keys)
        if [[ $key == $'\x1b' ]]; then
            read -rsn2 key
            case $key in
                '[A') # Up arrow
                    ((selected--))
                    if [[ $selected -lt 0 ]]; then
                        selected=$((num_options - 1))
                    fi
                    draw_menu
                    ;;
                '[B') # Down arrow
                    ((selected++))
                    if [[ $selected -ge $num_options ]]; then
                        selected=0
                    fi
                    draw_menu
                    ;;
            esac
        elif [[ $key == '' ]]; then
            # Enter key pressed
            break
        fi
    done

    # Show cursor again
    tput cnorm

    # Set return values
    SELECTED_INDEX=$selected
    SELECTED_VALUE="${options[$selected]}"
}

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}============================================${NC}"
    echo -e "${CYAN}${BOLD}  GO Automation - New Script Generator${NC}"
    echo -e "${CYAN}${BOLD}============================================${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[+]${NC} $1"
}

print_error() {
    echo -e "${RED}[!]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[~]${NC} $1"
}

# Convert script name to title case (e.g., "report-alarms" -> "Report Alarms")
to_title_case() {
    echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1'
}

# Convert script name to PascalCase for config interface (e.g., "go-report-alarms" -> "GoReportAlarmsConfig")
to_config_name() {
    local name="$1"
    # Convert to PascalCase and append "Config"
    echo "$name" | awk -F'-' '{for(i=1;i<=NF;i++) printf "%s", toupper(substr($i,1,1)) tolower(substr($i,2))}END{print "Config"}'
}

# Interactive yes/no confirmation
# Usage: confirm_yes_no "prompt" [default: yes|no]
# Returns: 0 for yes, 1 for no
confirm_yes_no() {
    local prompt="$1"
    local default="${2:-yes}"
    local selected=0

    if [[ "$default" == "no" ]]; then
        selected=1
    fi

    local options=("Yes" "No")

    # Hide cursor
    tput civis

    # Print prompt
    echo -e "$prompt"
    echo ""

    # Function to draw menu
    draw_confirm_menu() {
        tput cuu1
        tput el
        if [[ $selected -eq 0 ]]; then
            echo -e "  ${CHECK}  ${BOLD}Yes${NC}     ${DIM}No${NC}"
        else
            echo -e "     ${DIM}Yes${NC}  ${CHECK}  ${BOLD}No${NC}"
        fi
    }

    # Initial draw
    if [[ $selected -eq 0 ]]; then
        echo -e "  ${CHECK}  ${BOLD}Yes${NC}     ${DIM}No${NC}"
    else
        echo -e "     ${DIM}Yes${NC}  ${CHECK}  ${BOLD}No${NC}"
    fi

    # Read input
    while true; do
        IFS= read -rsn1 key

        if [[ $key == $'\x1b' ]]; then
            read -rsn2 key
            case $key in
                '[C'|'[D') # Left/Right arrow
                    selected=$((1 - selected))
                    draw_confirm_menu
                    ;;
            esac
        elif [[ $key == '' ]]; then
            break
        fi
    done

    # Show cursor again
    tput cnorm

    echo ""
    return $selected
}

# Validate script name format (verb-description)
validate_script_name() {
    local name="$1"

    # Check if empty
    if [[ -z "$name" ]]; then
        print_error "Script name cannot be empty"
        return 1
    fi

    # Check format: lowercase letters and hyphens only
    if ! [[ "$name" =~ ^[a-z]+(-[a-z]+)+$ ]]; then
        print_error "Script name must be in format 'verb-description' (e.g., 'report-alarms', 'send-notifications')"
        print_error "Use only lowercase letters and hyphens, with at least one hyphen"
        return 1
    fi

    # Check minimum length
    if [[ ${#name} -lt 5 ]]; then
        print_error "Script name is too short (minimum 5 characters)"
        return 1
    fi

    return 0
}

# ============================================================================
# Main Script
# ============================================================================

print_header

# Step 1: Select Product
products=(
    "go      Gestione Operativa"
    "send    SEND Platform"
    "interop Interoperability"
)
product_codes=("go" "send" "interop")

select_option "${BLUE}[*]${NC} Select the product for your new script:" "${products[@]}"

PRODUCT="${product_codes[$SELECTED_INDEX]}"

echo ""
print_success "Selected product: ${BOLD}$PRODUCT${NC}"
echo ""

# Step 2: Get Script Name
print_step "Enter the script name (format: verb-description)"
echo -e "    ${YELLOW}Examples: report-alarms, send-notifications, import-data${NC}"
echo ""

while true; do
    read -p "Script name: " SCRIPT_NAME_INPUT

    if validate_script_name "$SCRIPT_NAME_INPUT"; then
        break
    fi
    echo ""
done

# Full script name with product prefix
FULL_SCRIPT_NAME="${PRODUCT}-${SCRIPT_NAME_INPUT}"
SCRIPT_TITLE="$(to_title_case "$FULL_SCRIPT_NAME")"
SCRIPT_CONFIG_NAME="$(to_config_name "$FULL_SCRIPT_NAME")"
# Convert script name to shortcut format (go-report-alarms -> go:report:alarms)
SHORTCUT_NAME=$(echo "$FULL_SCRIPT_NAME" | sed 's/-/:/g')

print_success "Script name: ${BOLD}$FULL_SCRIPT_NAME${NC}"
echo ""

# Step 3: Get Description
print_step "Enter a brief description for the script:"
read -p "Description: " SCRIPT_DESCRIPTION

if [[ -z "$SCRIPT_DESCRIPTION" ]]; then
    SCRIPT_DESCRIPTION="Script for $SCRIPT_TITLE"
fi

print_success "Description: ${BOLD}$SCRIPT_DESCRIPTION${NC}"
echo ""

# Step 4: Ask about AWS profile parameter
if confirm_yes_no "${BLUE}[?]${NC} Add --aws-profile parameter? ${DIM}(common for AWS scripts)${NC}" "yes"; then
    INCLUDE_AWS_PROFILE="true"
    print_success "Will include --aws-profile parameter"
else
    INCLUDE_AWS_PROFILE="false"
    print_step "Skipping --aws-profile parameter"
fi
echo ""

# Step 5: Create Directory Structure
SCRIPT_PATH="$PROJECT_ROOT/scripts/$PRODUCT/$FULL_SCRIPT_NAME"

print_step "Creating directory structure..."

if [[ -d "$SCRIPT_PATH" ]]; then
    print_error "Directory already exists: $SCRIPT_PATH"
    exit 1
fi

# Create directories
mkdir -p "$SCRIPT_PATH/src/libs"
mkdir -p "$SCRIPT_PATH/src/types"
mkdir -p "$SCRIPT_PATH/configs"
mkdir -p "$SCRIPT_PATH/logs"

print_success "Created: $SCRIPT_PATH"
print_success "Created: $SCRIPT_PATH/src/libs"
print_success "Created: $SCRIPT_PATH/src/types"
print_success "Created: $SCRIPT_PATH/configs"
print_success "Created: $SCRIPT_PATH/logs"
echo ""

# Step 6: Generate Files from Templates
print_step "Generating files from templates..."

# Process package.json
sed -e "s|{{SCRIPT_NAME}}|$FULL_SCRIPT_NAME|g" \
    -e "s|{{SCRIPT_DESCRIPTION}}|$SCRIPT_DESCRIPTION|g" \
    -e "s|{{PRODUCT}}|$PRODUCT|g" \
    "$TEMPLATES_DIR/package.json.template" > "$SCRIPT_PATH/package.json"
print_success "Created: package.json"

# Copy tsconfig.json (no placeholders needed)
cp "$TEMPLATES_DIR/tsconfig.json.template" "$SCRIPT_PATH/tsconfig.json"
print_success "Created: tsconfig.json"

# Process index.ts (entry point)
sed -e "s|{{SCRIPT_NAME}}|$FULL_SCRIPT_NAME|g" \
    -e "s|{{SCRIPT_TITLE}}|$SCRIPT_TITLE|g" \
    -e "s|{{SCRIPT_DESCRIPTION}}|$SCRIPT_DESCRIPTION|g" \
    -e "s|{{SCRIPT_CONFIG_NAME}}|$SCRIPT_CONFIG_NAME|g" \
    "$TEMPLATES_DIR/index.ts.template" > "$SCRIPT_PATH/src/index.ts"
print_success "Created: src/index.ts"

# Generate config.ts directly (avoids awk multiline issues)
if [[ "$INCLUDE_AWS_PROFILE" == "true" ]]; then
    cat > "$SCRIPT_PATH/src/config.ts" << EOF
/**
 * $SCRIPT_TITLE - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: '$SCRIPT_TITLE',
  version: '1.0.0',
  description: '$SCRIPT_DESCRIPTION',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: true,
    aliases: ['ap'],
  },
] as const;

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface $SCRIPT_CONFIG_NAME {
  /** AWS profile name */
  readonly awsProfile: string;
}
EOF
else
    cat > "$SCRIPT_PATH/src/config.ts" << EOF
/**
 * $SCRIPT_TITLE - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: '$SCRIPT_TITLE',
  version: '1.0.0',
  description: '$SCRIPT_DESCRIPTION',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  // Add your parameters here
  // Example:
  // {
  //   name: 'input.file',
  //   type: Core.GOConfigParameterType.STRING,
  //   description: 'Path to input file',
  //   required: true,
  //   aliases: ['i'],
  // },
] as const;

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface $SCRIPT_CONFIG_NAME {
  // Add your configuration fields here
  // Example:
  // readonly inputFile: string;
  readonly _placeholder?: never; // Remove this when adding real properties
}
EOF
fi
print_success "Created: src/config.ts"

# Process main.ts (business logic)
sed -e "s|{{SCRIPT_NAME}}|$FULL_SCRIPT_NAME|g" \
    -e "s|{{SCRIPT_TITLE}}|$SCRIPT_TITLE|g" \
    -e "s|{{SCRIPT_DESCRIPTION}}|$SCRIPT_DESCRIPTION|g" \
    -e "s|{{SCRIPT_CONFIG_NAME}}|$SCRIPT_CONFIG_NAME|g" \
    "$TEMPLATES_DIR/main.ts.template" > "$SCRIPT_PATH/src/main.ts"
print_success "Created: src/main.ts"

# Create empty .gitkeep files
touch "$SCRIPT_PATH/logs/.gitkeep"
touch "$SCRIPT_PATH/configs/.gitkeep"
print_success "Created: logs/.gitkeep"
print_success "Created: configs/.gitkeep"

# Process README.md
CURRENT_DATE=$(date +%Y-%m-%d)
# Derive team name from product
case "$PRODUCT" in
    "go")
        TEAM_NAME="Team GO - Gestione Operativa"
        ;;
    "send")
        TEAM_NAME="Team SEND"
        ;;
    "interop")
        TEAM_NAME="Team INTEROP"
        ;;
    *)
        TEAM_NAME="Team GO - Gestione Operativa"
        ;;
esac

sed -e "s|{{SCRIPT_NAME}}|$FULL_SCRIPT_NAME|g" \
    -e "s|{{SCRIPT_TITLE}}|$SCRIPT_TITLE|g" \
    -e "s|{{SCRIPT_DESCRIPTION}}|$SCRIPT_DESCRIPTION|g" \
    -e "s|{{SHORTCUT_NAME}}|$SHORTCUT_NAME|g" \
    -e "s|{{TEAM_NAME}}|$TEAM_NAME|g" \
    -e "s|{{CURRENT_DATE}}|$CURRENT_DATE|g" \
    "$TEMPLATES_DIR/README.md.template" > "$SCRIPT_PATH/README.md"
print_success "Created: README.md"

echo ""

# Step 7: Install Dependencies
print_step "Installing dependencies with pnpm..."
cd "$PROJECT_ROOT"
pnpm install

print_success "Dependencies installed"
echo ""

# Step 8: Verify Build
print_step "Verifying TypeScript build..."

# Build from project root using filter (resolves project references correctly)
cd "$PROJECT_ROOT"

if pnpm --filter="$FULL_SCRIPT_NAME" build 2>/dev/null; then
    print_success "Build successful"
else
    print_warning "Build had issues - check that go-common is built (pnpm build:common)"
fi

echo ""

# Summary
echo -e "${CYAN}${BOLD}============================================${NC}"
echo -e "${CYAN}${BOLD}  Script Created Successfully!${NC}"
echo -e "${CYAN}${BOLD}============================================${NC}"
echo ""
echo -e "  ${BOLD}Location:${NC}    scripts/$PRODUCT/$FULL_SCRIPT_NAME"
echo -e "  ${BOLD}Structure:${NC}"
echo -e "    ${CYAN}src/index.ts${NC}  - Entry point (wiring)"
echo -e "    ${CYAN}src/config.ts${NC} - Metadata, parameters, ${SCRIPT_CONFIG_NAME}"
echo -e "    ${CYAN}src/main.ts${NC}   - Business logic"
echo -e "    ${CYAN}README.md${NC}     - Documentation"
echo ""
echo -e "  ${BOLD}Commands:${NC}"
echo -e "    ${YELLOW}pnpm --filter=$FULL_SCRIPT_NAME build${NC} # Build the script"
echo -e "    ${YELLOW}pnpm --filter=$FULL_SCRIPT_NAME dev${NC}   # Run in development mode"
echo -e "    ${YELLOW}pnpm --filter=$FULL_SCRIPT_NAME start${NC} # Build and run"
echo ""
echo -e "  ${BOLD}Next Steps:${NC}"
echo -e "    1. Edit ${CYAN}src/config.ts${NC} to add parameters and config interface"
echo -e "    2. Edit ${CYAN}src/main.ts${NC} to add your business logic"
echo -e "    3. Create service classes in ${CYAN}src/libs/${NC}"
echo -e "    4. Define types in ${CYAN}src/types/${NC}"
echo -e "    5. Update ${CYAN}README.md${NC} with specific documentation"
echo ""

# Step 9: Ask about adding shortcuts to root package.json
if confirm_yes_no "${BLUE}[?]${NC} Add shortcuts to root package.json?"; then
    print_step "Adding shortcuts to root package.json..."

    # Use node to safely modify package.json
    node -e "
const fs = require('fs');
const path = require('path');

const pkgPath = path.join('$PROJECT_ROOT', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Add shortcuts
pkg.scripts['$SHORTCUT_NAME:dev'] = 'pnpm --filter=$FULL_SCRIPT_NAME dev';
pkg.scripts['$SHORTCUT_NAME:prod'] = 'pnpm --filter=$FULL_SCRIPT_NAME start';
pkg.scripts['$SHORTCUT_NAME:build'] = 'pnpm --filter=$FULL_SCRIPT_NAME build';

// Sort scripts alphabetically
const sortedScripts = {};
Object.keys(pkg.scripts).sort().forEach(key => {
    sortedScripts[key] = pkg.scripts[key];
});
pkg.scripts = sortedScripts;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
"

    print_success "Added shortcuts:"
    echo -e "    ${YELLOW}pnpm $SHORTCUT_NAME:prod${NC}  # Build and run"
    echo -e "    ${YELLOW}pnpm $SHORTCUT_NAME:dev${NC}   # Run in development mode"
    echo -e "    ${YELLOW}pnpm $SHORTCUT_NAME:build${NC} # Build only"
    echo ""
else
    print_step "Skipped adding shortcuts"
    echo -e "    You can add them later manually to ${CYAN}package.json${NC}:"
    echo -e "    ${DIM}\"$SHORTCUT_NAME:dev\": \"pnpm --filter=$FULL_SCRIPT_NAME dev\"${NC}"
    echo -e "    ${DIM}\"$SHORTCUT_NAME:prod\": \"pnpm --filter=$FULL_SCRIPT_NAME start\"${NC}"
    echo -e "    ${DIM}\"$SHORTCUT_NAME:build\": \"pnpm --filter=$FULL_SCRIPT_NAME build\"${NC}"
    echo ""
fi
