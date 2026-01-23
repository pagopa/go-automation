#!/bin/bash

# ============================================================================
# GO Automation - Script Deployment Tool
# Deploys scripts from the monorepo for standalone use
# Compatible with bash 3.2+ (macOS default)
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
CROSS="${RED}✖${NC}"
ARROW="${CYAN}›${NC}"

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/artifacts"

# ============================================================================
# Help Function
# ============================================================================

show_help() {
    echo ""
    echo -e "${CYAN}${BOLD}GO Automation - Script Deployment Tool${NC}"
    echo ""
    echo -e "${BOLD}USAGE:${NC}"
    echo "    deploy.sh [OPTIONS]"
    echo ""
    echo -e "${BOLD}OPTIONS:${NC}"
    echo "    -h, --help       Show this help message"
    echo "    -l, --list       List available scripts without deploying"
    echo "    -s, --script     Deploy a specific script by name (non-interactive)"
    echo "    -c, --clean      Clean the deploy directory before deploying"
    echo "    -p, --prod       Production mode: exclude devDependencies (smaller size)"
    echo "    -d, --dev        Development mode: include all dependencies"
    echo ""
    echo -e "${BOLD}EXAMPLES:${NC}"
    echo "    deploy.sh                              # Interactive mode"
    echo "    deploy.sh --list                       # List all available scripts"
    echo "    deploy.sh --script go-report-alarms    # Deploy specific script"
    echo "    deploy.sh --prod --script go-report-alarms  # Production deploy"
    echo "    deploy.sh --clean --prod --script go-report-alarms"
    echo ""
    echo -e "${BOLD}DESCRIPTION:${NC}"
    echo "    This tool deploys scripts from the monorepo for standalone use."
    echo "    It uses pnpm deploy to bundle the script with all its dependencies,"
    echo "    including the @go-automation/go-common workspace package."
    echo ""
    echo -e "    Deployed scripts are placed in: ${CYAN}artifacts/<script-name>/${NC}"
    echo ""
}

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
        local i
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
    local i
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
                    ((selected--)) || true
                    if [[ $selected -lt 0 ]]; then
                        selected=$((num_options - 1))
                    fi
                    draw_menu
                    ;;
                '[B') # Down arrow
                    ((selected++)) || true
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

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}============================================${NC}"
    echo -e "${CYAN}${BOLD}  GO Automation - Script Deployment Tool${NC}"
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

# Get human-readable size
get_folder_size() {
    local path="$1"
    if [[ -d "$path" ]]; then
        du -sh "$path" 2>/dev/null | cut -f1
    else
        echo "0B"
    fi
}

# Get file count in folder
get_file_count() {
    local path="$1"
    if [[ -d "$path" ]]; then
        find "$path" -type f 2>/dev/null | wc -l | tr -d ' '
    else
        echo "0"
    fi
}

# ============================================================================
# Script Discovery Functions (bash 3.2 compatible)
# ============================================================================

# Global arrays for scripts (simpler approach without associative arrays)
ALL_SCRIPTS=()
SCRIPT_PATHS=()
SCRIPT_CATEGORIES=()
DISPLAY_OPTIONS=()

# Discover all scripts in the monorepo
discover_scripts() {
    local scripts_dir="$PROJECT_ROOT/scripts"
    local categories="go send interop"

    ALL_SCRIPTS=()
    SCRIPT_PATHS=()
    SCRIPT_CATEGORIES=()

    for category in $categories; do
        local category_path="$scripts_dir/$category"

        if [[ -d "$category_path" ]]; then
            # Find all script directories (contain package.json)
            for script_dir in "$category_path"/*; do
                if [[ -d "$script_dir" && -f "$script_dir/package.json" ]]; then
                    local script_name=$(basename "$script_dir")
                    ALL_SCRIPTS+=("$script_name")
                    SCRIPT_PATHS+=("$script_dir")
                    SCRIPT_CATEGORIES+=("$category")
                fi
            done
        fi
    done
}

# Build display options for menu
build_display_options() {
    DISPLAY_OPTIONS=()

    local i
    for ((i = 0; i < ${#ALL_SCRIPTS[@]}; i++)); do
        local script_name="${ALL_SCRIPTS[$i]}"
        local category="${SCRIPT_CATEGORIES[$i]}"
        local padded_category=$(printf "%-8s" "[$category]")
        DISPLAY_OPTIONS+=("$padded_category $script_name")
    done
}

# List scripts without deploying
list_scripts() {
    discover_scripts

    echo ""
    echo -e "${CYAN}${BOLD}Available Scripts${NC}"
    echo -e "${DIM}────────────────────────────────────────────${NC}"
    echo ""

    local current_category=""
    local total_count=0
    local i

    for ((i = 0; i < ${#ALL_SCRIPTS[@]}; i++)); do
        local script_name="${ALL_SCRIPTS[$i]}"
        local category="${SCRIPT_CATEGORIES[$i]}"

        # Print category header if changed
        if [[ "$category" != "$current_category" ]]; then
            if [[ -n "$current_category" ]]; then
                echo ""
            fi

            case "$category" in
                "go")
                    echo -e "  ${BOLD}GO - Gestione Operativa${NC}"
                    ;;
                "send")
                    echo -e "  ${BOLD}SEND - SEND Platform${NC}"
                    ;;
                "interop")
                    echo -e "  ${BOLD}INTEROP - Interoperability${NC}"
                    ;;
            esac
            current_category="$category"
        fi

        echo -e "    ${ARROW} ${script_name}"
        ((total_count++))
    done

    echo ""
    echo -e "${DIM}────────────────────────────────────────────${NC}"
    echo -e "  Total: ${BOLD}$total_count${NC} scripts"
    echo ""
}

# Find script index by name
# Returns the index if found, or -1 if not found (always returns 0 for set -e compatibility)
find_script_index() {
    local target_name="$1"
    local i

    for ((i = 0; i < ${#ALL_SCRIPTS[@]}; i++)); do
        if [[ "${ALL_SCRIPTS[$i]}" == "$target_name" ]]; then
            echo "$i"
            return 0
        fi
    done

    echo "-1"
    return 0
}

# ============================================================================
# Deployment Functions
# ============================================================================

# Deploy a single script
deploy_script() {
    local script_name="$1"
    local script_path="$2"
    local deploy_path="$DEPLOY_DIR/$script_name"

    print_step "Deploying ${BOLD}$script_name${NC}..."
    echo ""

    # Check if deploy path already exists
    if [[ -d "$deploy_path" ]]; then
        print_warning "Deploy folder already exists: $deploy_path"

        if [[ "$CLEAN_MODE" == "true" ]]; then
            print_step "Cleaning existing deployment..."
            rm -rf "$deploy_path"
            print_success "Removed existing deployment"
        else
            if confirm_yes_no "${YELLOW}[?]${NC} Remove existing deployment and redeploy?"; then
                print_step "Cleaning existing deployment..."
                rm -rf "$deploy_path"
                print_success "Removed existing deployment"
            else
                print_warning "Deployment cancelled"
                return 1
            fi
        fi
        echo ""
    fi

    # Create deploy directory
    mkdir -p "$DEPLOY_DIR"

    # Step 1: Build the common library first
    print_step "Building @go-automation/go-common..."
    if pnpm --filter="@go-automation/go-common" build > /dev/null 2>&1; then
        print_success "go-common built successfully"
    else
        print_warning "go-common build had issues (may already be built)"
    fi

    # Step 2: Build the script
    print_step "Building ${script_name}..."
    if pnpm --filter="$script_name" build > /dev/null 2>&1; then
        print_success "Script built successfully"
    else
        print_error "Failed to build script"
        return 1
    fi

    # Step 3: Deploy using pnpm deploy
    # --prod flag excludes devDependencies for smaller deployment size
    local deploy_flags=""
    local mode_label="development"

    if [[ "$PROD_MODE" == "true" ]]; then
        deploy_flags="--prod"
        mode_label="production"
    fi

    print_step "Running pnpm deploy (${mode_label} mode)..."
    echo -e "    ${DIM}pnpm --filter=$script_name deploy $deploy_flags $deploy_path${NC}"
    echo ""

    if pnpm --filter="$script_name" deploy $deploy_flags "$deploy_path" 2>&1 | while IFS= read -r line; do
        echo -e "    ${DIM}$line${NC}"
    done; then
        echo ""
        print_success "Deployment completed (${mode_label} mode)"
    else
        echo ""
        print_error "Deployment failed"
        return 1
    fi

    # Step 4: Show deployment summary
    echo ""
    echo -e "${CYAN}${BOLD}============================================${NC}"
    echo -e "${CYAN}${BOLD}  Deployment Summary${NC}"
    echo -e "${CYAN}${BOLD}============================================${NC}"
    echo ""

    local folder_size=$(get_folder_size "$deploy_path")
    local file_count=$(get_file_count "$deploy_path")

    echo -e "  ${BOLD}Script:${NC}      $script_name"
    echo -e "  ${BOLD}Location:${NC}    $deploy_path"
    echo -e "  ${BOLD}Size:${NC}        $folder_size"
    echo -e "  ${BOLD}Files:${NC}       $file_count"
    echo ""

    # Show how to run the deployed script
    echo -e "  ${BOLD}To run the deployed script:${NC}"
    echo -e "    ${YELLOW}cd $deploy_path${NC}"
    echo -e "    ${YELLOW}node dist/index.js${NC}"
    echo ""

    # Check if there's a main entry point
    if [[ -f "$deploy_path/dist/main.js" ]]; then
        echo -e "    ${DIM}or${NC}"
        echo -e "    ${YELLOW}node dist/main.js${NC}"
        echo ""
    fi

    return 0
}

# ============================================================================
# Main Script
# ============================================================================

# Parse command line arguments
CLEAN_MODE="false"
LIST_MODE="false"
PROD_MODE=""
TARGET_SCRIPT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -l|--list)
            LIST_MODE="true"
            shift
            ;;
        -s|--script)
            TARGET_SCRIPT="$2"
            shift 2
            ;;
        -c|--clean)
            CLEAN_MODE="true"
            shift
            ;;
        -p|--prod|--production)
            PROD_MODE="true"
            shift
            ;;
        -d|--dev|--development)
            PROD_MODE="false"
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Change to project root
cd "$PROJECT_ROOT"

# Discover available scripts
discover_scripts

# Check if any scripts were found
if [[ ${#ALL_SCRIPTS[@]} -eq 0 ]]; then
    print_error "No scripts found in the monorepo"
    echo "    Scripts should be located in: scripts/<category>/<script-name>/"
    exit 1
fi

# List mode
if [[ "$LIST_MODE" == "true" ]]; then
    list_scripts
    exit 0
fi

# Non-interactive mode with specific script
if [[ -n "$TARGET_SCRIPT" ]]; then
    print_header

    script_index=$(find_script_index "$TARGET_SCRIPT")

    if [[ "$script_index" == "-1" ]]; then
        print_error "Script not found: $TARGET_SCRIPT"
        echo ""
        echo "Available scripts:"
        for script in "${ALL_SCRIPTS[@]}"; do
            echo "  - $script"
        done
        exit 1
    fi

    # Ask for production mode if not specified
    if [[ -z "$PROD_MODE" ]]; then
        if confirm_yes_no "${BLUE}[?]${NC} Deploy in production mode? ${DIM}(excludes devDependencies)${NC}" "yes"; then
            PROD_MODE="true"
        else
            PROD_MODE="false"
        fi
        echo ""
    fi

    script_path="${SCRIPT_PATHS[$script_index]}"
    deploy_script "$TARGET_SCRIPT" "$script_path"
    exit $?
fi

# Interactive mode
print_header

# Build display options for menu
build_display_options

# Check if we have any options
if [[ ${#DISPLAY_OPTIONS[@]} -eq 0 ]]; then
    print_error "No deployable scripts found"
    exit 1
fi

# Show script selection menu
select_option "${BLUE}[*]${NC} Select a script to deploy:" "${DISPLAY_OPTIONS[@]}"

# Extract script name from selection (remove category prefix)
SELECTED_SCRIPT=$(echo "$SELECTED_VALUE" | awk '{print $2}')

echo ""
print_success "Selected: ${BOLD}$SELECTED_SCRIPT${NC}"
echo ""

# Find script path
script_index=$(find_script_index "$SELECTED_SCRIPT")

if [[ "$script_index" == "-1" ]]; then
    print_error "Could not find script path for: $SELECTED_SCRIPT"
    exit 1
fi

script_path="${SCRIPT_PATHS[$script_index]}"

# Ask for production mode if not specified
if [[ -z "$PROD_MODE" ]]; then
    if confirm_yes_no "${BLUE}[?]${NC} Deploy in production mode? ${DIM}(excludes devDependencies)${NC}" "yes"; then
        PROD_MODE="true"
    else
        PROD_MODE="false"
    fi
    echo ""
fi

# Determine mode label for display
if [[ "$PROD_MODE" == "true" ]]; then
    mode_display="${GREEN}production${NC} (no devDependencies)"
else
    mode_display="${YELLOW}development${NC} (all dependencies)"
fi

# Confirm deployment
echo -e "  ${BOLD}Script:${NC}       $SELECTED_SCRIPT"
echo -e "  ${BOLD}Source:${NC}       $script_path"
echo -e "  ${BOLD}Deploy to:${NC}    $DEPLOY_DIR/$SELECTED_SCRIPT"
echo -e "  ${BOLD}Mode:${NC}         $mode_display"
echo ""

if confirm_yes_no "${BLUE}[?]${NC} Proceed with deployment?"; then
    echo ""
    deploy_script "$SELECTED_SCRIPT" "$script_path"
else
    echo ""
    print_warning "Deployment cancelled"
    exit 0
fi
