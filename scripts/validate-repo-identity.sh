#!/usr/bin/env bash
set -euo pipefail
expected="${RACEPILOT_EXPECTED_REPO:-vinzenzgeisler/racepilot}"
if [[ -n "${RACEPILOT_EXPECTED_REPO:-}" ]]; then
  printf 'Using repository identity override: %s\n' "$expected"
fi
if [[ -n "${GITHUB_ACTIONS:-}" && "${GITHUB_ACTIONS}" == "true" ]]; then
  actual="${GITHUB_REPOSITORY:-}"
  if [[ -z "$actual" ]]; then
    printf 'Error: GITHUB_REPOSITORY is missing in GitHub Actions.\n' >&2
    exit 1
  fi
else
  if ! actual_url=$(git remote get-url origin 2>/dev/null); then
    printf 'Error: git remote "origin" is missing or has no URL.\n' >&2
    exit 1
  fi
  if [[ "$actual_url" =~ ^https?://[^/]+/(.+)$ ]]; then
    actual="${BASH_REMATCH[1]}"
  elif [[ "$actual_url" =~ ^ssh://([^@/]+@)?[^/]+/(.+)$ ]]; then
    actual="${BASH_REMATCH[2]}"
  elif [[ "$actual_url" =~ ^([^@/]+@)?[^:/]+:(.+)$ ]]; then
    actual="${BASH_REMATCH[2]}"
  else
    printf 'Error: cannot determine owner/repository from origin URL: %s\n' "$actual_url" >&2
    exit 1
  fi
  actual="${actual%/}"
  actual="${actual%.git}"
fi
actual="${actual,,}"
expected="${expected,,}"
if [[ "$actual" != "$expected" ]]; then
  printf 'Error: repository identity mismatch: expected %s, found %s.\n' "$expected" "$actual" >&2
  exit 1
fi
printf 'Repository identity OK: %s\n' "$actual"
