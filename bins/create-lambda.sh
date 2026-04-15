#!/bin/bash

# ============================================================================
# GO Automation - Lambda Scaffolding Tool
# Creates a new Lambda function in the monorepo with proper structure
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

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/lambda-templates"

SELECTED_INDEX=0
SELECTED_VALUE=""

# ============================================================================
# Interactive Menu Functions
# ============================================================================

select_option() {
    local prompt="$1"
    shift
    local options=("$@")
    local num_options=${#options[@]}
    local selected=0

    if [[ $num_options -eq 0 ]]; then
        print_error "No options available"
        exit 1
    fi

    tput civis
    trap 'tput cnorm' EXIT

    echo -e "$prompt"
    echo -e "${DIM}(Use arrow keys to navigate, Enter to select)${NC}"
    echo ""

    draw_menu() {
        for ((i = 0; i < num_options; i++)); do
            tput cuu1
            tput el
        done

        for ((i = 0; i < num_options; i++)); do
            if [[ $i -eq $selected ]]; then
                echo -e "  ${CHECK}  ${BOLD}${options[$i]}${NC}"
            else
                echo -e "     ${DIM}${options[$i]}${NC}"
            fi
        done
    }

    for ((i = 0; i < num_options; i++)); do
        if [[ $i -eq $selected ]]; then
            echo -e "  ${CHECK}  ${BOLD}${options[$i]}${NC}"
        else
            echo -e "     ${DIM}${options[$i]}${NC}"
        fi
    done

    while true; do
        IFS= read -rsn1 key < /dev/tty

        if [[ $key == $'\x1b' ]]; then
            read -rsn2 key < /dev/tty
            case $key in
                '[A')
                    ((selected--))
                    if [[ $selected -lt 0 ]]; then
                        selected=$((num_options - 1))
                    fi
                    draw_menu
                    ;;
                '[B')
                    ((selected++))
                    if [[ $selected -ge $num_options ]]; then
                        selected=0
                    fi
                    draw_menu
                    ;;
            esac
        elif [[ $key == '' ]]; then
            break
        fi
    done

    tput cnorm
    SELECTED_INDEX=$selected
    SELECTED_VALUE="${options[$selected]}"
}

confirm_yes_no() {
    local prompt="$1"
    local default="${2:-yes}"
    local selected=0

    if [[ "$default" == "no" ]]; then
        selected=1
    fi

    tput civis

    echo -e "$prompt"
    echo ""

    draw_confirm_menu() {
        tput cuu1
        tput el
        if [[ $selected -eq 0 ]]; then
            echo -e "  ${CHECK}  ${BOLD}Yes${NC}     ${DIM}No${NC}"
        else
            echo -e "     ${DIM}Yes${NC}  ${CHECK}  ${BOLD}No${NC}"
        fi
    }

    if [[ $selected -eq 0 ]]; then
        echo -e "  ${CHECK}  ${BOLD}Yes${NC}     ${DIM}No${NC}"
    else
        echo -e "     ${DIM}Yes${NC}  ${CHECK}  ${BOLD}No${NC}"
    fi

    while true; do
        IFS= read -rsn1 key < /dev/tty

        if [[ $key == $'\x1b' ]]; then
            read -rsn2 key < /dev/tty
            case $key in
                '[C'|'[D')
                    selected=$((1 - selected))
                    draw_confirm_menu
                    ;;
            esac
        elif [[ $key == '' ]]; then
            break
        fi
    done

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
    echo -e "${CYAN}${BOLD}  GO Automation - New Lambda Generator${NC}"
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

validate_lambda_name() {
    local name="$1"

    if [[ -z "$name" ]]; then
        print_error "Lambda name cannot be empty"
        return 1
    fi

    if ! [[ "$name" =~ ^[a-z]+-[A-Za-z][A-Za-z0-9]*$ ]]; then
        print_error "Lambda name must be in format 'prefix-PascalCaseName' (e.g., 'go-AILambda', 'go-SendMonitorTppMessagesLambda')"
        print_error "Use a lowercase prefix, a single hyphen, and then a PascalCase suffix"
        return 1
    fi

    if [[ ${#name} -lt 6 ]]; then
        print_error "Lambda name is too short"
        return 1
    fi

    return 0
}

to_kebab_case() {
    echo "$1" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g; s/([A-Z]+)([A-Z][a-z])/\1-\2/g' | tr '[:upper:]' '[:lower:]'
}

to_colon_case() {
    echo "$1" | sed 's/-/:/g'
}

validate_shortcut_base() {
    local shortcut="$1"

    if [[ -z "$shortcut" ]]; then
        print_error "Shortcut base cannot be empty"
        return 1
    fi

    if ! [[ "$shortcut" =~ ^[a-z0-9]+([:-][a-z0-9]+)*$ ]]; then
        print_error "Shortcut base must contain only lowercase letters, numbers, hyphens and colons"
        return 1
    fi

    return 0
}

get_lambda_suffix() {
    echo "$1" | sed -E 's/^[a-z]+-//'
}

to_package_name() {
    local lambda_name="$1"
    local prefix suffix

    prefix="$(echo "$lambda_name" | cut -d'-' -f1)"
    suffix="$(get_lambda_suffix "$lambda_name")"

    echo "${prefix}-$(to_kebab_case "$suffix")"
}

build_default_shortcut_base() {
    local lambda_name="$1"
    local suffix stripped

    suffix="$(get_lambda_suffix "$lambda_name")"
    stripped="$(echo "$suffix" | sed -E 's/(Lambda|Handler)$//')"

    if [[ -z "$stripped" ]]; then
        stripped="$suffix"
    fi

    to_colon_case "$(to_kebab_case "$stripped")"
}

list_wrapper_compatible_scripts() {
    node -e "
const fs = require('fs');
const path = require('path');

const root = process.argv[1];
const scriptsRoot = path.join(root, 'scripts');
const products = fs.existsSync(scriptsRoot) ? fs.readdirSync(scriptsRoot, { withFileTypes: true }) : [];
const compatible = [];

for (const product of products) {
  if (!product.isDirectory()) continue;
  const productDir = path.join(scriptsRoot, product.name);
  const entries = fs.readdirSync(productDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const scriptDir = path.join(productDir, entry.name);
    const pkgPath = path.join(scriptDir, 'package.json');
    const configPath = path.join(scriptDir, 'src', 'config.ts');
    const mainPath = path.join(scriptDir, 'src', 'main.ts');

    if (!fs.existsSync(pkgPath) || !fs.existsSync(configPath) || !fs.existsSync(mainPath)) continue;

    compatible.push(path.relative(scriptsRoot, scriptDir));
  }
}

compatible.sort().forEach((item) => console.log(item));
" "$PROJECT_ROOT"
}

load_wrapper_script_metadata() {
    local relative_path="$1"
    local metadata

    metadata="$(node -e "
const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[1];
const relativePath = process.argv[2];
const scriptDir = path.join(projectRoot, 'scripts', relativePath);
const pkgPath = path.join(scriptDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const hasConfigs = fs.existsSync(path.join(scriptDir, 'configs'));
const exportsField = pkg.exports;
const normalizedExports = typeof exportsField === 'string' ? { '.': exportsField } : (exportsField ?? {});

console.log(JSON.stringify({
  packageName: pkg.name,
  relativePath,
  hasConfigs,
  hasConfigExport: normalizedExports['./config'] !== undefined,
  hasMainExport: normalizedExports['./main'] !== undefined,
}));
" "$PROJECT_ROOT" "$relative_path")"

    if [[ -z "$metadata" ]]; then
        print_error "Unable to load metadata for selected script"
        exit 1
    fi

    WRAPPED_SCRIPT_PACKAGE_NAME="$(node -e "const data = JSON.parse(process.argv[1]); console.log(data.packageName);" "$metadata")"
    WRAPPED_SCRIPT_RELATIVE_PATH="$(node -e "const data = JSON.parse(process.argv[1]); console.log(data.relativePath);" "$metadata")"
    WRAPPED_SCRIPT_HAS_CONFIGS="$(node -e "const data = JSON.parse(process.argv[1]); console.log(data.hasConfigs ? 'true' : 'false');" "$metadata")"
    WRAPPED_SCRIPT_HAS_CONFIG_EXPORT="$(node -e "const data = JSON.parse(process.argv[1]); console.log(data.hasConfigExport ? 'true' : 'false');" "$metadata")"
    WRAPPED_SCRIPT_HAS_MAIN_EXPORT="$(node -e "const data = JSON.parse(process.argv[1]); console.log(data.hasMainExport ? 'true' : 'false');" "$metadata")"
}

create_directory_structure() {
    local lambda_path="$1"

    mkdir -p "$lambda_path/src"
    print_success "Created: $lambda_path"
    print_success "Created: $lambda_path/src"
}

update_root_package_shortcuts() {
    local shortcut_base="$1"
    local package_name="$2"
    local include_test_local="$3"

    node -e "
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(process.argv[1], 'package.json');
const shortcutBase = process.argv[2];
const packageName = process.argv[3];
const includeTestLocal = process.argv[4] === 'true';

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.scripts[\`lambda:\${shortcutBase}:build\`] = \`pnpm --filter=\${packageName} build\`;
pkg.scripts[\`lambda:\${shortcutBase}:package\`] = \`pnpm --filter=\${packageName} package\`;

if (includeTestLocal) {
  pkg.scripts[\`lambda:\${shortcutBase}:test:local\`] = \`pnpm --filter=\${packageName} test:local\`;
}

const sortedScripts = {};
Object.keys(pkg.scripts).sort().forEach((key) => {
  sortedScripts[key] = pkg.scripts[key];
});
pkg.scripts = sortedScripts;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
" "$PROJECT_ROOT" "$shortcut_base" "$package_name" "$include_test_local"
}

ensure_wrapper_script_exports() {
    local relative_path="$1"
    local update_status

    update_status="$(node -e "
const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[1];
const relativePath = process.argv[2];
const pkgPath = path.join(projectRoot, 'scripts', relativePath, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

function normalizeExportTarget(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('./')) return value;
  return './' + value.replace(/^\/+/, '');
}

const rootExport = typeof pkg.exports === 'string'
  ? normalizeExportTarget(pkg.exports)
  : normalizeExportTarget(pkg.exports?.['.'] ?? pkg.main ?? './dist/index.js');

const exportsField = typeof pkg.exports === 'string'
  ? { '.': normalizeExportTarget(pkg.exports) }
  : { ...(pkg.exports ?? {}) };

let changed = false;

if (exportsField['.'] === undefined) {
  exportsField['.'] = rootExport;
  changed = true;
}

if (exportsField['./config'] === undefined) {
  exportsField['./config'] = './dist/config.js';
  changed = true;
}

if (exportsField['./main'] === undefined) {
  exportsField['./main'] = './dist/main.js';
  changed = true;
}

if (!changed) {
  console.log('unchanged');
  process.exit(0);
}

pkg.exports = exportsField;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('updated');
" "$PROJECT_ROOT" "$relative_path")"

    if [[ "$update_status" == "updated" ]]; then
        WRAPPED_SCRIPT_EXPORTS_UPDATED="true"
        print_success "Updated scripts/$relative_path/package.json with Lambda exports"
    else
        WRAPPED_SCRIPT_EXPORTS_UPDATED="false"
        print_step "Selected script already exposes ./config and ./main"
    fi
}

render_template_file() {
    local source_file="$1"
    local destination_file="$2"

    TEMPLATE_LAMBDA_NAME="$LAMBDA_NAME" \
    TEMPLATE_LAMBDA_PACKAGE_NAME="$LAMBDA_PACKAGE_NAME" \
    TEMPLATE_LAMBDA_DESCRIPTION="$LAMBDA_DESCRIPTION" \
    TEMPLATE_ARTIFACT_DIR="$LAMBDA_NAME" \
    TEMPLATE_TEST_BUILD_COMMAND="$TEST_BUILD_COMMAND" \
    TEMPLATE_WRAPPED_SCRIPT_PACKAGE_NAME="$WRAPPED_SCRIPT_PACKAGE_NAME" \
    TEMPLATE_WRAPPED_SCRIPT_RELATIVE_PATH="$WRAPPED_SCRIPT_RELATIVE_PATH" \
    TEMPLATE_WRAPPED_SCRIPT_CONFIG_DECLARATION_BLOCK="$WRAPPED_SCRIPT_CONFIG_DECLARATION_BLOCK" \
    TEMPLATE_WRAPPED_SCRIPT_CONFIG_COPY_STATEMENT="$WRAPPED_SCRIPT_CONFIG_COPY_STATEMENT" \
    TEMPLATE_TSCONFIG_REFERENCES_BLOCK="$TSCONFIG_REFERENCES_BLOCK" \
    node -e "
const fs = require('fs');

const sourceFile = process.argv[1];
const destinationFile = process.argv[2];

const replacements = {
  LAMBDA_NAME: process.env.TEMPLATE_LAMBDA_NAME ?? '',
  LAMBDA_PACKAGE_NAME: process.env.TEMPLATE_LAMBDA_PACKAGE_NAME ?? '',
  LAMBDA_DESCRIPTION: process.env.TEMPLATE_LAMBDA_DESCRIPTION ?? '',
  ARTIFACT_DIR: process.env.TEMPLATE_ARTIFACT_DIR ?? '',
  TEST_BUILD_COMMAND: process.env.TEMPLATE_TEST_BUILD_COMMAND ?? '',
  WRAPPED_SCRIPT_PACKAGE_NAME: process.env.TEMPLATE_WRAPPED_SCRIPT_PACKAGE_NAME ?? '',
  WRAPPED_SCRIPT_RELATIVE_PATH: process.env.TEMPLATE_WRAPPED_SCRIPT_RELATIVE_PATH ?? '',
  WRAPPED_SCRIPT_CONFIG_DECLARATION_BLOCK: process.env.TEMPLATE_WRAPPED_SCRIPT_CONFIG_DECLARATION_BLOCK ?? '',
  WRAPPED_SCRIPT_CONFIG_COPY_STATEMENT: process.env.TEMPLATE_WRAPPED_SCRIPT_CONFIG_COPY_STATEMENT ?? '',
  TSCONFIG_REFERENCES_BLOCK: process.env.TEMPLATE_TSCONFIG_REFERENCES_BLOCK ?? '',
};

let content = fs.readFileSync(sourceFile, 'utf8');
for (const [key, value] of Object.entries(replacements)) {
  content = content.split('{{' + key + '}}').join(value);
}

fs.writeFileSync(destinationFile, content);
" "$source_file" "$destination_file"

    if grep -q '{{' "$destination_file"; then
        print_error "Template rendering failed for ${destination_file#$PROJECT_ROOT/}"
        exit 1
    fi

    print_success "Created: ${destination_file#$PROJECT_ROOT/}"
}

# ============================================================================
# Main Script
# ============================================================================

print_header

# Step 1: Get Lambda Name
print_step "Enter the Lambda name"
echo -e "    ${YELLOW}Examples: go-AILambda, go-BotQESlackHandler, go-SendMonitorTppMessagesLambda${NC}"
echo ""

while true; do
    read -e -p "Lambda name: " LAMBDA_NAME_INPUT

    if validate_lambda_name "$LAMBDA_NAME_INPUT"; then
        break
    fi
    echo ""
done

LAMBDA_NAME="$LAMBDA_NAME_INPUT"
LAMBDA_PACKAGE_NAME="$(to_package_name "$LAMBDA_NAME")"

print_success "Lambda name: ${BOLD}$LAMBDA_NAME${NC}"
print_success "Package name: ${BOLD}$LAMBDA_PACKAGE_NAME${NC}"
echo ""

# Step 2: Choose Lambda Type
if confirm_yes_no "${BLUE}[?]${NC} Does this Lambda wrap an existing script from ./scripts?" "yes"; then
    LAMBDA_KIND="script-wrapper"
    print_step "Searching for wrappable scripts..."

    COMPATIBLE_SCRIPTS=()
    while IFS= read -r compatible_script; do
        if [[ -n "$compatible_script" ]]; then
            COMPATIBLE_SCRIPTS+=("$compatible_script")
        fi
    done < <(list_wrapper_compatible_scripts)

    if [[ ${#COMPATIBLE_SCRIPTS[@]} -eq 0 ]]; then
        print_error "No wrappable scripts found."
        print_error "A wrappable script must contain package.json, src/config.ts and src/main.ts."
        exit 1
    fi

    echo ""
    select_option "${BLUE}[*]${NC} Select the script to wrap:" "${COMPATIBLE_SCRIPTS[@]}"
    WRAPPED_SCRIPT_RELATIVE_PATH="$SELECTED_VALUE"
    load_wrapper_script_metadata "$WRAPPED_SCRIPT_RELATIVE_PATH"

    print_success "Selected script: ${BOLD}$WRAPPED_SCRIPT_RELATIVE_PATH${NC}"
    print_success "Script package: ${BOLD}$WRAPPED_SCRIPT_PACKAGE_NAME${NC}"
    if [[ "$WRAPPED_SCRIPT_HAS_CONFIG_EXPORT" == "false" || "$WRAPPED_SCRIPT_HAS_MAIN_EXPORT" == "false" ]]; then
        print_warning "The selected script is missing package exports for Lambda wrapping."
        print_step "The generator will add ./config and ./main exports automatically."
    fi
else
    LAMBDA_KIND="standard"
    WRAPPED_SCRIPT_PACKAGE_NAME=""
    WRAPPED_SCRIPT_RELATIVE_PATH=""
    WRAPPED_SCRIPT_HAS_CONFIGS="false"
    WRAPPED_SCRIPT_HAS_CONFIG_EXPORT="false"
    WRAPPED_SCRIPT_HAS_MAIN_EXPORT="false"
    WRAPPED_SCRIPT_EXPORTS_UPDATED="false"
    print_step "Will create a standard Lambda scaffold"
fi
echo ""

# Step 3: Get Description
print_step "Enter a brief description for the Lambda:"
read -e -p "Description: " LAMBDA_DESCRIPTION

if [[ -z "$LAMBDA_DESCRIPTION" ]]; then
    if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
        LAMBDA_DESCRIPTION="Lambda wrapper for $WRAPPED_SCRIPT_PACKAGE_NAME"
    else
        LAMBDA_DESCRIPTION="Lambda function for $LAMBDA_NAME"
    fi
fi

print_success "Description: ${BOLD}$LAMBDA_DESCRIPTION${NC}"
echo ""

# Step 4: Publish to SEND environments?
if confirm_yes_no "${BLUE}[?]${NC} Is this Lambda meant to be packaged for SEND environments?" "no"; then
    PUBLISH_TO_SEND="true"
    TEST_BUILD_COMMAND="pnpm build && cd ../../artifacts/$LAMBDA_NAME && zip -r ../../functions/$LAMBDA_NAME/function.zip ."
    print_success "Will create a real test-build packaging command"
else
    PUBLISH_TO_SEND="false"
    TEST_BUILD_COMMAND="echo 'Skipping CodeBuild packaging for this function'"
    print_step "test-build will be a no-op message"
fi
echo ""

# Step 5: Ask about root shortcuts
ADD_ROOT_SHORTCUTS="false"
SHORTCUT_BASE=""
if confirm_yes_no "${BLUE}[?]${NC} Add root shortcuts to package.json?" "yes"; then
    ADD_ROOT_SHORTCUTS="true"
    DEFAULT_SHORTCUT_BASE="$(build_default_shortcut_base "$LAMBDA_NAME")"
    print_step "Enter the shortcut base"
    echo -e "    ${YELLOW}Example final commands: lambda:${DEFAULT_SHORTCUT_BASE}:build, lambda:${DEFAULT_SHORTCUT_BASE}:package${NC}"
    echo ""
    while true; do
        read -e -p "Shortcut base [$DEFAULT_SHORTCUT_BASE]: " SHORTCUT_BASE_INPUT
        SHORTCUT_BASE="${SHORTCUT_BASE_INPUT:-$DEFAULT_SHORTCUT_BASE}"

        if validate_shortcut_base "$SHORTCUT_BASE"; then
            break
        fi
        echo ""
    done

    print_success "Shortcut base: ${BOLD}$SHORTCUT_BASE${NC}"
else
    print_step "Skipping root shortcuts"
fi
echo ""

# Step 6: Create directory structure
LAMBDA_PATH="$PROJECT_ROOT/functions/$LAMBDA_NAME"

print_step "Creating directory structure..."

if [[ -d "$LAMBDA_PATH" ]]; then
    print_warning "Directory already exists: $LAMBDA_PATH"
    if confirm_yes_no "${BLUE}[?]${NC} Replace the existing Lambda directory?" "no"; then
        rm -rf "$LAMBDA_PATH"
        print_success "Removed existing directory"
    else
        print_error "Aborted to avoid overwriting existing files"
        exit 1
    fi
fi

create_directory_structure "$LAMBDA_PATH"
echo ""

# Step 7: Prepare template-specific values
if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
    print_step "Preparing wrapped script for Lambda imports..."
    ensure_wrapper_script_exports "$WRAPPED_SCRIPT_RELATIVE_PATH"
    echo ""

    if [[ "$WRAPPED_SCRIPT_HAS_CONFIGS" == "true" ]]; then
        WRAPPED_SCRIPT_CONFIG_DECLARATION_BLOCK="const CONFIGS_SOURCE = path.join(MONOREPO_ROOT, 'scripts', '$WRAPPED_SCRIPT_RELATIVE_PATH', 'configs');
const CONFIGS_DEST = path.join(ARTIFACT_DIR, 'configs');"
        WRAPPED_SCRIPT_CONFIG_COPY_STATEMENT="await fs.cp(CONFIGS_SOURCE, CONFIGS_DEST, { recursive: true });"
    else
        WRAPPED_SCRIPT_CONFIG_DECLARATION_BLOCK="// No script configs directory to copy."
        WRAPPED_SCRIPT_CONFIG_COPY_STATEMENT="// No script configs directory to copy."
    fi

    TSCONFIG_REFERENCES_BLOCK=",
  \"references\": [{ \"path\": \"../../scripts/$WRAPPED_SCRIPT_RELATIVE_PATH\" }, { \"path\": \"../../packages/go-common\" }]"
else
    WRAPPED_SCRIPT_CONFIG_DECLARATION_BLOCK="// No additional assets to copy."
    WRAPPED_SCRIPT_CONFIG_COPY_STATEMENT="// No additional assets to copy."
    TSCONFIG_REFERENCES_BLOCK=""
fi

# Step 8: Generate files from templates
print_step "Generating files from templates..."

if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
    TEMPLATE_SUBDIR="$TEMPLATES_DIR/script-wrapper"
else
    TEMPLATE_SUBDIR="$TEMPLATES_DIR/standard"
fi

render_template_file "$TEMPLATE_SUBDIR/package.json.template" "$LAMBDA_PATH/package.json"
render_template_file "$TEMPLATE_SUBDIR/tsconfig.json.template" "$LAMBDA_PATH/tsconfig.json"
render_template_file "$TEMPLATE_SUBDIR/esbuild.config.mjs.template" "$LAMBDA_PATH/esbuild.config.mjs"
render_template_file "$TEMPLATE_SUBDIR/handler.ts.template" "$LAMBDA_PATH/src/handler.ts"

if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
    render_template_file "$TEMPLATE_SUBDIR/test-local.ts.template" "$LAMBDA_PATH/src/test-local.ts"
fi
echo ""

# Step 9: Install dependencies
print_step "Installing dependencies with pnpm..."
cd "$PROJECT_ROOT"
pnpm install
print_success "Dependencies installed"
echo ""

# Step 10: Verify build
print_step "Verifying Lambda build..."

set +e
BUILD_OUTPUT=$(pnpm --filter="$LAMBDA_PACKAGE_NAME" build 2>&1)
BUILD_EXIT_CODE=$?
set -e

if [[ $BUILD_EXIT_CODE -eq 0 ]]; then
    print_success "Build successful"
else
    print_warning "Build had issues:"
    echo "$BUILD_OUTPUT" | tail -15
    echo ""
fi
echo ""

# Step 11: Add root shortcuts if requested
if [[ "$ADD_ROOT_SHORTCUTS" == "true" ]]; then
    print_step "Adding root shortcuts to package.json..."

    if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
        INCLUDE_TEST_LOCAL_SHORTCUT="true"
    else
        INCLUDE_TEST_LOCAL_SHORTCUT="false"
    fi

    update_root_package_shortcuts "$SHORTCUT_BASE" "$LAMBDA_PACKAGE_NAME" "$INCLUDE_TEST_LOCAL_SHORTCUT"

    print_success "Added shortcuts:"
    echo -e "    ${YELLOW}pnpm lambda:$SHORTCUT_BASE:build${NC}"
    echo -e "    ${YELLOW}pnpm lambda:$SHORTCUT_BASE:package${NC}"

    if [[ "$INCLUDE_TEST_LOCAL_SHORTCUT" == "true" ]]; then
        echo -e "    ${YELLOW}pnpm lambda:$SHORTCUT_BASE:test:local${NC}"
    fi
    echo ""
fi

# Summary
echo -e "${CYAN}${BOLD}============================================${NC}"
echo -e "${CYAN}${BOLD}  Lambda Created Successfully!${NC}"
echo -e "${CYAN}${BOLD}============================================${NC}"
echo ""
echo -e "  ${BOLD}Location:${NC}    functions/$LAMBDA_NAME"
echo -e "  ${BOLD}Package:${NC}     $LAMBDA_PACKAGE_NAME"
echo -e "  ${BOLD}Type:${NC}        $LAMBDA_KIND"

if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
    echo -e "  ${BOLD}Wraps:${NC}       scripts/$WRAPPED_SCRIPT_RELATIVE_PATH"
    if [[ "$WRAPPED_SCRIPT_EXPORTS_UPDATED" == "true" ]]; then
        echo -e "  ${BOLD}Updated:${NC}     scripts/$WRAPPED_SCRIPT_RELATIVE_PATH/package.json exports"
    fi
fi

echo ""
echo -e "  ${BOLD}Commands:${NC}"
echo -e "    ${YELLOW}pnpm --filter=$LAMBDA_PACKAGE_NAME build${NC}"
echo -e "    ${YELLOW}pnpm --filter=$LAMBDA_PACKAGE_NAME package${NC}"

if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
    echo -e "    ${YELLOW}pnpm --filter=$LAMBDA_PACKAGE_NAME test:local${NC}"
fi

if [[ "$ADD_ROOT_SHORTCUTS" == "true" ]]; then
    echo ""
    echo -e "  ${BOLD}Root shortcuts:${NC}"
    echo -e "    ${YELLOW}pnpm lambda:$SHORTCUT_BASE:build${NC}"
    echo -e "    ${YELLOW}pnpm lambda:$SHORTCUT_BASE:package${NC}"
    if [[ "$LAMBDA_KIND" == "script-wrapper" ]]; then
        echo -e "    ${YELLOW}pnpm lambda:$SHORTCUT_BASE:test:local${NC}"
    fi
fi
echo ""
