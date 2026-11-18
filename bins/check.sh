#!/usr/bin/env bash
# This script holds itself to every check of ShellCheck; the other scripts of bins/ to the default ones.
# shellcheck enable=all
# The quality gate of GO Automation and each of its checks, which `pnpm check` and the CI jobs run: the usage below
# says what the script accepts. It runs on the bash 3.2 of macOS too, so it uses no associative arrays, no mapfile and
# no inherit_errexit.
set -euo pipefail

# The backquotes of the usage are text, not commands.
# shellcheck disable=SC2016
readonly USAGE='Usage: bins/check.sh [<check> [arguments of its tool]]

Without a check, runs the whole gate, as the CI does: the build, which stops it when it fails, then the other checks,
one after the other, even when one fails. At the end it prints the outcome and the duration of each step. The smoke
of the published packages is not part of it: it takes minutes, and the CI runs it on every pull request.

Checks:
  build          TypeScript build of the whole workspace
  test           the tests of every workspace and of bins/
  coverage       the tests with coverage and their thresholds (lines 90, branches 80, functions 90)
  published      the static gates of the published packages (publint, attw, API reports, import cost,
                 sensitive data); needs the build
  smoke          the published packages installed from their archives, with npm and pnpm, on the current Node
  lint           ESLint, then the sensitive data in the published sources. Outside the CI ESLint keeps a cache in
                 node_modules/.cache/eslint/; the CI always lints from scratch, because the type-aware rules
                 depend on files the cache does not watch
  format         Prettier
  unused         unused files, exports and dependencies, with knip
  dependencies   the dependency graph, with dependency-cruiser
  duplicates     duplicated code, with jscpd
  types          type coverage
  scaffold       the standard structure of scripts and functions
  new-classes    a test for every new class, against a base (default: --base origin/develop)
  workflows      actionlint and zizmor on .github/, from the Docker images pinned in .github/workflows/ci.yml;
                 zizmor runs its online audits when GH_TOKEN is set
  shell          ShellCheck on the scripts of bins/, from the Docker image pinned in .github/workflows/ci.yml

Examples:
  bins/check.sh               the whole gate
  bins/check.sh lint --fix    ESLint, fixing what it can
  bins/check.sh new-classes --base origin/main

Exit codes: 0 when everything passes, 1 when a step of the gate fails, the code of the tool when a single check
fails, 2 for a wrong usage, 130 when interrupted.'

# The cache of ESLint, used only outside the CI (GitHub Actions sets CI=true).
readonly ESLINT_CACHE='node_modules/.cache/eslint/'

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# The tools of the workspace, also when the script does not run through pnpm.
PATH="${PWD}/node_modules/.bin:${PATH}"

# A step stopped with Ctrl-C stops the gate, instead of counting as a failure and letting the next one start.
trap 'exit 130' INT
trap 'exit 143' TERM

# Prints a usage error, then the usage, and exits with 2.
fail_usage() {
  printf '%s\n\n%s\n' "$1" "${USAGE}" >&2
  exit 2
}

# Fails with a usage error when a check that takes no arguments receives some.
no_arguments() {
  local check="$1"
  shift
  (($# == 0)) || fail_usage "${check} takes no arguments."
}

# Prints the image of a `uses: docker://<image>:<tag>@<digest>` step of the CI, or nothing when there is none, so
# that the CI, this script and Renovate, which updates the CI, always agree on the version.
workflow_image() {
  sed -n "s|^ *uses: docker://\(${1}:[^ ]*\).*|\1|p" .github/workflows/ci.yml | head -n 1
}

# ESLint on the whole repository, with the cache outside the CI, then the sensitive data in the published sources.
check_lint() {
  local cache=()
  [[ -n "${CI:-}" ]] || cache=(--cache --cache-location "${ESLINT_CACHE}" --cache-strategy content)
  eslint . ${cache[@]+"${cache[@]}"} "$@" && tsx bins/check-published-sensitive-data/src/index.ts --sources
}

# actionlint and zizmor on the workflows, from the images the CI pins.
check_workflows() {
  local actionlint zizmor zizmor_options=(--no-progress)
  actionlint="$(workflow_image 'rhysd/actionlint')"
  zizmor="$(workflow_image 'ghcr.io/zizmorcore/zizmor')"
  if [[ -z "${actionlint}" || -z "${zizmor}" ]]; then
    printf 'The actionlint or zizmor step is missing from .github/workflows/ci.yml\n' >&2
    return 1
  fi
  [[ -n "${GH_TOKEN:-}" ]] || zizmor_options+=(--offline)
  docker run --rm --volume "${PWD}:/repo:ro" --workdir /repo "${actionlint}" -color &&
    docker run --rm --env GH_TOKEN --volume "${PWD}:/repo:ro" --workdir /repo "${zizmor}" "${zizmor_options[@]}" .
}

# ShellCheck on the scripts of bins/, from the image the CI pins.
check_shell() {
  local image
  image="$(workflow_image 'koalaman/shellcheck-alpine')"
  if [[ -z "${image}" ]]; then
    printf 'The ShellCheck step is missing from .github/workflows/ci.yml\n' >&2
    return 1
  fi
  docker run --rm --network=none --volume "${PWD}:/mnt:ro" --workdir /mnt --entrypoint shellcheck "${image}" "$@" bins/*.sh
}

# Runs one check, passing the arguments to its tool.
run_check() {
  local check="$1"
  shift
  case "${check}" in
    build)
      no_arguments "${check}" "$@"
      pnpm -s build
      ;;
    test)
      no_arguments "${check}" "$@"
      pnpm -s test
      ;;
    coverage)
      no_arguments "${check}" "$@"
      pnpm -s test:coverage
      ;;
    published)
      no_arguments "${check}" "$@"
      pnpm -s test:published:static
      ;;
    smoke) tsx bins/check-published-packages/src/index.ts "$@" ;;
    lint) check_lint "$@" ;;
    format) prettier --check '**/*.{ts,js,json,md}' "$@" ;;
    unused) knip "$@" ;;
    dependencies)
      no_arguments "${check}" "$@"
      pnpm -s deps:check
      ;;
    duplicates) jscpd --reporters console "$@" ;;
    types)
      type-coverage --project tsconfig.type-coverage.json --detail --show-relative-path \
        --at-least "${GO_TYPE_COVERAGE_THRESHOLD:-99}" "$@"
      ;;
    scaffold) tsx bins/validate-scaffold/src/index.ts "$@" ;;
    new-classes)
      if (($# == 0)); then set -- --base origin/develop; fi
      node --import tsx/esm bins/check-new-class-tests/src/index.ts "$@"
      ;;
    workflows)
      no_arguments "${check}" "$@"
      check_workflows
      ;;
    shell) check_shell "$@" ;;
    *) fail_usage "Unknown check: ${check}." ;;
  esac
}

summary=()
failed=0

# Runs one step of the gate, its name followed by its command, and records its outcome and duration. On GitHub Actions
# the log of each step is a group that folds, and a step that fails is an annotation of the run.
run_step() {
  local name="$1" start="${SECONDS}" outcome='✔'
  shift
  if [[ "${GITHUB_ACTIONS:-}" == true ]]; then printf '::group::%s\n' "${name}"; else printf '\n▶ %s\n' "${name}"; fi
  if ! "$@"; then
    outcome='✖'
    failed=1
  fi
  local elapsed=$((SECONDS - start))
  if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
    printf '::endgroup::\n'
    [[ "${outcome}" == '✔' ]] || printf '::error title=pnpm check::%s failed\n' "${name}"
  fi
  summary+=("$(printf '%s %-12s %3dm %02ds' "${outcome}" "${name}" $((elapsed / 60)) $((elapsed % 60)))")
}

# Runs the whole gate and prints the summary of its steps.
run_gate() {
  run_step build run_check build
  if ((failed == 0)); then
    local check
    for check in test coverage published lint format unused dependencies duplicates types scaffold new-classes \
      workflows shell; do
      run_step "${check}" run_check "${check}"
    done
  fi
  printf '\n'
  printf '%s\n' "${summary[@]}"
  return "${failed}"
}

case "${1:-}" in
  '') run_gate ;;
  -h | --help) printf '%s\n' "${USAGE}" ;;
  *) run_check "$@" ;;
esac
